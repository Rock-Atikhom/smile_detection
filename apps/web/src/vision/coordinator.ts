import {
  registerApplicationServiceWorker,
  type VisionCacheClient,
  type VisionCachePreparationResult,
  type VisionCacheQueryResult,
} from "../service-worker/client";
import type { VisionReleaseManifest } from "./manifest";
import type { FaceGuidance } from "./face-evidence";
import {
  isVisionWorkerEvent,
  type VisionFaceEvidenceEvent,
  type VisionFrameCommand,
  type VisionOfflineState,
  type VisionReason,
  type VisionRuntimeState,
  type VisionWasmTier,
  type VisionWorkerCommand,
} from "./protocol";
import { VISION_MANIFEST, VISION_MANIFEST_URL } from "./release";

export interface VisionSnapshot {
  runtime: VisionRuntimeState;
  offlineCache: VisionOfflineState;
  wasmTier: VisionWasmTier;
  generation: number;
  releaseId: string;
  reason: VisionReason | null;
  retryAvailable: boolean;
  phase: "verifying" | "initializing" | null;
  face: VisionFaceSnapshot;
}

export interface VisionFaceSnapshot {
  state: "idle" | "detecting" | "ready" | "error";
  faceCount: 0 | 1 | 2;
  guidance: FaceGuidance | null;
  eligible: boolean;
  lastSequence: number | null;
  staleResults: number;
}

export interface VisionWorkerPort {
  postMessage(message: VisionWorkerCommand, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
}

export interface VisionCoordinatorDependencies {
  cacheClient: VisionCacheClient;
  createWorker(): VisionWorkerPort;
  canFetchManifest(manifestUrl: string, signal: AbortSignal): Promise<boolean>;
  manifest: VisionReleaseManifest;
  manifestUrl: string;
  now(): number;
}

export type VisionStartResult = "started" | "first-use-offline" | "failed";

interface ActivePreflight {
  controller: AbortController;
  generation: number;
  promise: Promise<VisionStartResult>;
}

interface ActiveWorker {
  generation: number;
  listener: (event: MessageEvent<unknown>) => void;
  port: VisionWorkerPort;
  ready: boolean;
}

interface FrameIdentity {
  cameraGeneration: number;
  generation: number;
  sequence: number;
}

const IDLE_FACE_SNAPSHOT: Readonly<VisionFaceSnapshot> = Object.freeze({
  state: "idle",
  faceCount: 0,
  guidance: null,
  eligible: false,
  lastSequence: null,
  staleResults: 0,
});

function idleFaceSnapshot(): VisionFaceSnapshot {
  return { ...IDLE_FACE_SNAPSHOT };
}

export function createInitialVisionSnapshot(
  manifest: VisionReleaseManifest = VISION_MANIFEST,
): VisionSnapshot {
  return Object.freeze({
    runtime: "idle",
    offlineCache: "not-ready",
    wasmTier: "unknown",
    generation: 0,
    releaseId: manifest.releaseId,
    reason: null,
    retryAvailable: false,
    phase: null,
    face: idleFaceSnapshot(),
  });
}

export class VisionCoordinator {
  private activeCacheGeneration: number | undefined;
  private cacheStartedGeneration: number | undefined;
  private activePreflight: ActivePreflight | undefined;
  private activeWorker: ActiveWorker | undefined;
  private activeCameraGeneration: number | undefined;
  private inFlightFrame: FrameIdentity | undefined;
  private pendingFrame: VisionFrameCommand | undefined;
  private disposed = false;
  private readonly listeners = new Set<(snapshot: VisionSnapshot) => void>();
  private snapshotValue: VisionSnapshot;

  constructor(private readonly dependencies: VisionCoordinatorDependencies) {
    this.snapshotValue = createInitialVisionSnapshot(dependencies.manifest);
  }

  get snapshot(): VisionSnapshot {
    return this.snapshotValue;
  }

  prepare(): Promise<VisionStartResult> {
    if (this.disposed) return Promise.resolve("failed");
    if (
      this.activeWorker?.generation === this.snapshotValue.generation &&
      (this.snapshotValue.runtime === "preparing" ||
        this.snapshotValue.runtime === "ready")
    ) {
      return Promise.resolve("started");
    }
    if (this.activePreflight?.generation === this.snapshotValue.generation) {
      return this.activePreflight.promise;
    }

    const controller = new AbortController();
    const generation = this.snapshotValue.generation;
    const active = {
      controller,
      generation,
      promise: Promise.resolve<VisionStartResult>("failed"),
    };
    this.activePreflight = active;
    active.promise = this.runPreflight(active);
    return active.promise;
  }

  async restart(): Promise<VisionStartResult> {
    if (this.disposed) return "failed";
    this.invalidateCurrent();
    const generation = this.nextGeneration();
    this.publish({
      generation,
      offlineCache:
        this.snapshotValue.offlineCache === "ready" ? "ready" : "not-ready",
      phase: null,
      reason: null,
      retryAvailable: false,
      runtime: "idle",
      wasmTier: "unknown",
      face: idleFaceSnapshot(),
    });
    if (!this.ownsGeneration(generation)) return "failed";
    return this.prepare();
  }

  cancel(): void {
    if (this.disposed) return;
    this.invalidateCurrent();
    this.publish({
      generation: this.nextGeneration(),
      offlineCache:
        this.snapshotValue.offlineCache === "ready" ? "ready" : "not-ready",
      phase: null,
      reason: "runtime-cancelled",
      retryAvailable: true,
      runtime: "idle",
      wasmTier: "unknown",
      face: idleFaceSnapshot(),
    });
  }

  subscribe(listener: (snapshot: VisionSnapshot) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  submitFrame(command: VisionFrameCommand): boolean {
    const active = this.activeWorker;
    if (
      this.disposed ||
      active === undefined ||
      !active.ready ||
      this.snapshotValue.runtime !== "ready" ||
      command.generation !== this.snapshotValue.generation ||
      active.generation !== command.generation
    ) {
      return false;
    }

    if (!this.acceptCameraGeneration(command.cameraGeneration)) return false;

    if (this.inFlightFrame === undefined) {
      return this.transferFrame(active, command, false);
    }

    this.closePendingFrame();
    this.pendingFrame = command;
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.invalidateCurrent();
    this.snapshotValue = Object.freeze({
      ...this.snapshotValue,
      generation: this.nextGeneration(),
      phase: null,
      runtime: "idle",
      wasmTier: "unknown",
      face: idleFaceSnapshot(),
    });
    this.disposed = true;
    this.listeners.clear();
  }

  private async runPreflight(
    active: ActivePreflight,
  ): Promise<VisionStartResult> {
    let cacheState: VisionCacheQueryResult;
    try {
      cacheState = await this.dependencies.cacheClient.queryRelease({
        generation: active.generation,
        releaseId: this.dependencies.manifest.releaseId,
      });
    } catch {
      cacheState = "indeterminate";
    }
    if (!this.isCurrentPreflight(active)) return "failed";

    if (cacheState === "indeterminate") {
      this.activePreflight = undefined;
      this.publish({
        offlineCache: "error",
        phase: null,
        reason: "offline-cache-failed",
        retryAvailable: true,
        runtime: "error",
        wasmTier: "unknown",
      });
      return "failed";
    }

    if (cacheState === "integrity-failed") {
      this.activePreflight = undefined;
      this.publishIntegrityFailure();
      return "failed";
    }

    let manifestReachable = cacheState === "ready";
    if (!manifestReachable) {
      try {
        manifestReachable =
          (await this.dependencies.canFetchManifest(
            this.dependencies.manifestUrl,
            active.controller.signal,
          )) === true;
      } catch {
        manifestReachable = false;
      }
    }
    if (!this.isCurrentPreflight(active)) return "failed";

    if (!manifestReachable) {
      this.activePreflight = undefined;
      this.publish({
        offlineCache: "not-ready",
        phase: null,
        reason: "first-use-offline",
        retryAvailable: true,
        runtime: "error",
        wasmTier: "unknown",
      });
      return "first-use-offline";
    }

    if (cacheState === "missing") {
      this.publish({
        offlineCache: "caching",
        phase: "verifying",
        reason: null,
        retryAvailable: false,
        runtime: "preparing",
        wasmTier: "unknown",
      });
      if (!this.isCurrentPreflight(active)) return "failed";
    }

    const workerStarted = this.startWorker(
      active.generation,
      cacheState === "ready" ? "ready" : "caching",
    );
    if (!this.isCurrentPreflight(active)) return "failed";
    if (cacheState === "missing") {
      void this.completeCachePopulation(active);
    } else {
      this.activePreflight = undefined;
    }
    return workerStarted ? "started" : "failed";
  }

  private async completeCachePopulation(
    active: ActivePreflight,
  ): Promise<void> {
    const result = await this.populateCache(active);
    if (!this.isCurrentPreflight(active)) return;
    this.activePreflight = undefined;

    if (result === "integrity-failed") {
      const worker = this.activeWorker;
      if (worker?.generation === active.generation) {
        try {
          worker.port.postMessage({
            type: "CANCEL",
            generation: active.generation,
          });
        } catch {
          // Termination below is the authoritative cleanup boundary.
        }
        this.closeWorker(worker);
      }
      this.publishIntegrityFailure();
      return;
    }

    if (result === "error") {
      this.publish({
        offlineCache: "error",
        ...(this.snapshotValue.runtime === "error"
          ? {}
          : {
              reason: "offline-cache-failed" as const,
              retryAvailable: true,
            }),
      });
      return;
    }

    this.publish({ offlineCache: "ready" });
  }

  private async populateCache(
    active: ActivePreflight,
  ): Promise<VisionCachePreparationResult> {
    this.activeCacheGeneration = active.generation;
    this.cacheStartedGeneration = active.generation;
    try {
      return await this.dependencies.cacheClient.cacheRelease(
        {
          generation: active.generation,
          manifestUrl: this.dependencies.manifestUrl,
          releaseId: this.dependencies.manifest.releaseId,
        },
        (state) => {
          if (
            state === "caching" &&
            this.isCurrentPreflight(active) &&
            this.activeCacheGeneration === active.generation
          ) {
            this.publish({ offlineCache: "caching" });
          }
        },
      );
    } catch {
      return "error";
    } finally {
      if (this.activeCacheGeneration === active.generation) {
        this.activeCacheGeneration = undefined;
      }
      if (this.cacheStartedGeneration === active.generation) {
        this.cacheStartedGeneration = undefined;
      }
    }
  }

  private isCurrentPreflight(active: ActivePreflight): boolean {
    return (
      !this.disposed &&
      this.activePreflight === active &&
      !active.controller.signal.aborted &&
      this.snapshotValue.generation === active.generation
    );
  }

  private startWorker(
    generation: number,
    offlineCache: VisionOfflineState,
  ): boolean {
    let worker: VisionWorkerPort;
    try {
      worker = this.dependencies.createWorker();
    } catch {
      this.publish({
        offlineCache,
        runtime: "error",
        phase: null,
        reason: "runtime-initialization-failed",
        retryAvailable: true,
        face: this.errorFaceSnapshot(),
      });
      return false;
    }

    const active: ActiveWorker = {
      generation,
      listener: (event) => this.receiveWorkerEvent(active, event.data),
      port: worker,
      ready: false,
    };
    this.activeWorker = active;
    worker.addEventListener("message", active.listener);
    this.publish({
      offlineCache,
      phase: "verifying",
      reason: null,
      retryAvailable: false,
      runtime: "preparing",
      wasmTier: "unknown",
      face: idleFaceSnapshot(),
    });
    if (!this.ownsWorker(active)) return false;

    try {
      worker.postMessage({
        type: "PREPARE",
        generation,
        manifestUrl: this.dependencies.manifestUrl,
        releaseId: this.dependencies.manifest.releaseId,
      });
    } catch {
      this.closeWorker(active);
      this.publish({
        phase: null,
        reason: "runtime-initialization-failed",
        retryAvailable: true,
        runtime: "error",
        face: this.errorFaceSnapshot(),
      });
      return false;
    }

    return (
      this.ownsWorker(active) &&
      (this.snapshotValue.runtime === "preparing" ||
        this.snapshotValue.runtime === "ready")
    );
  }

  private publishIntegrityFailure(): void {
    this.publish({
      offlineCache: "error",
      phase: null,
      reason: "runtime-integrity-failed",
      retryAvailable: false,
      runtime: "error",
      wasmTier: "unknown",
      face: this.errorFaceSnapshot(),
    });
  }

  private ownsGeneration(generation: number): boolean {
    return !this.disposed && this.snapshotValue.generation === generation;
  }

  private ownsWorker(active: ActiveWorker): boolean {
    return (
      this.ownsGeneration(active.generation) && this.activeWorker === active
    );
  }

  private receiveWorkerEvent(active: ActiveWorker, value: unknown): void {
    if (
      this.disposed ||
      this.activeWorker !== active ||
      active.generation !== this.snapshotValue.generation ||
      !isVisionWorkerEvent(value) ||
      value.generation !== active.generation
    ) {
      return;
    }

    if (value.type === "PHASE") {
      if (active.ready) return;
      this.publish({ phase: value.phase });
      return;
    }

    if (value.type === "READY") {
      if (active.ready) return;
      if (value.releaseId !== this.dependencies.manifest.releaseId) return;
      active.ready = true;
      this.publish({
        phase: null,
        reason: null,
        retryAvailable: false,
        runtime: "ready",
        wasmTier: value.wasmTier,
        face: { ...idleFaceSnapshot(), state: "detecting" },
      });
      return;
    }

    if (value.type === "FACE_EVIDENCE") {
      if (!active.ready || this.snapshotValue.runtime !== "ready") return;
      if (!this.settleFrame(active, value)) return;
      this.publishFaceEvidence(value);
      return;
    }

    this.resetFrameAdmission();
    if (value.code === "runtime-integrity-failed") {
      const preflight = this.activePreflight;
      if (preflight?.generation === active.generation) {
        preflight.controller.abort();
        this.activePreflight = undefined;
      }
      this.cancelActiveCache(active.generation);
    }
    this.publish({
      ...(value.code === "runtime-integrity-failed" ||
      value.code === "offline-cache-failed"
        ? { offlineCache: "error" as const }
        : {}),
      phase: null,
      reason: value.code,
      retryAvailable:
        value.code === "runtime-integrity-failed" ? false : value.recoverable,
      runtime: "error",
      wasmTier: "unknown",
      face: this.errorFaceSnapshot(),
    });
    this.closeWorker(active);
  }

  private invalidateCurrent(): void {
    this.activePreflight?.controller.abort();
    this.activePreflight = undefined;
    const generation = this.snapshotValue.generation;
    const active = this.activeWorker;
    if (active?.generation === generation) {
      try {
        active.port.postMessage({ type: "CANCEL", generation });
      } catch {
        // Termination below is the authoritative cleanup boundary.
      }
      this.closeWorker(active);
    }
    this.cancelActiveCache(generation);
  }

  private cancelActiveCache(generation: number): void {
    if (this.cacheStartedGeneration !== generation) return;
    this.activeCacheGeneration = undefined;
    this.cacheStartedGeneration = undefined;
    try {
      this.dependencies.cacheClient.cancel({
        generation,
        releaseId: this.dependencies.manifest.releaseId,
      });
    } catch {
      // Service-worker cancellation is best effort; generation guards are local.
    }
  }

  private closeWorker(active: ActiveWorker): void {
    if (this.activeWorker !== active) return;
    this.resetFrameAdmission();
    active.port.removeEventListener("message", active.listener);
    active.port.terminate();
    this.activeWorker = undefined;
  }

  private settleFrame(
    active: ActiveWorker,
    value: VisionFaceEvidenceEvent,
  ): boolean {
    const inFlight = this.inFlightFrame;
    if (inFlight === undefined) {
      if (this.activeCameraGeneration === undefined) {
        this.activeCameraGeneration = value.cameraGeneration;
        return true;
      }
      return value.cameraGeneration === this.activeCameraGeneration;
    }
    if (
      inFlight.generation !== value.generation ||
      inFlight.cameraGeneration !== value.cameraGeneration ||
      inFlight.sequence !== value.sequence
    ) {
      return false;
    }
    this.inFlightFrame = undefined;
    const pending = this.pendingFrame;
    this.pendingFrame = undefined;
    return pending === undefined || this.transferFrame(active, pending, true);
  }

  private transferFrame(
    active: ActiveWorker,
    command: VisionFrameCommand,
    coordinatorOwned: boolean,
  ): boolean {
    this.inFlightFrame = {
      cameraGeneration: command.cameraGeneration,
      generation: command.generation,
      sequence: command.sequence,
    };
    try {
      active.port.postMessage(command, [command.bitmap]);
      return true;
    } catch {
      if (
        this.inFlightFrame?.generation === command.generation &&
        this.inFlightFrame.cameraGeneration === command.cameraGeneration &&
        this.inFlightFrame.sequence === command.sequence
      ) {
        this.inFlightFrame = undefined;
      }
      if (coordinatorOwned) this.closeBitmap(command.bitmap);
      this.closeWorker(active);
      this.publish({
        phase: null,
        reason: "runtime-initialization-failed",
        retryAvailable: true,
        runtime: "error",
        wasmTier: "unknown",
        face: this.errorFaceSnapshot(),
      });
      return false;
    }
  }

  private publishFaceEvidence(value: VisionFaceEvidenceEvent): void {
    if (value.cameraGeneration !== this.activeCameraGeneration) return;
    const face = this.snapshotValue.face;
    const ageMs = this.dependencies.now() - value.capturedAtMs;
    if (
      !Number.isFinite(ageMs) ||
      ageMs < 0 ||
      ageMs > 150 ||
      (face.lastSequence !== null && value.sequence <= face.lastSequence)
    ) {
      this.publish({
        face: {
          ...face,
          staleResults: Math.min(
            Number.MAX_SAFE_INTEGER,
            face.staleResults + 1,
          ),
        },
      });
      return;
    }

    this.publish({
      face: {
        state: "ready",
        faceCount: value.faceCount,
        guidance: value.guidance,
        eligible: value.eligible,
        lastSequence: value.sequence,
        staleResults: face.staleResults,
      },
    });
  }

  private errorFaceSnapshot(): VisionFaceSnapshot {
    return {
      ...idleFaceSnapshot(),
      state: "error",
      staleResults: this.snapshotValue.face.staleResults,
    };
  }

  private resetFrameAdmission(): void {
    this.activeCameraGeneration = undefined;
    this.inFlightFrame = undefined;
    this.closePendingFrame();
  }

  private acceptCameraGeneration(cameraGeneration: number): boolean {
    if (this.activeCameraGeneration === undefined) {
      this.activeCameraGeneration = cameraGeneration;
      return true;
    }
    if (cameraGeneration < this.activeCameraGeneration) return false;
    if (cameraGeneration === this.activeCameraGeneration) return true;

    this.activeCameraGeneration = cameraGeneration;
    this.closePendingFrame();
    this.publish({ face: { ...idleFaceSnapshot(), state: "detecting" } });
    return true;
  }

  private closePendingFrame(): void {
    const pending = this.pendingFrame;
    this.pendingFrame = undefined;
    if (pending !== undefined) this.closeBitmap(pending.bitmap);
  }

  private closeBitmap(bitmap: ImageBitmap): void {
    try {
      bitmap.close();
    } catch {
      // Closing a bitmap is terminal best effort; no data remains referenced.
    }
  }

  private nextGeneration(): number {
    return this.snapshotValue.generation + 1;
  }

  private publish(patch: Partial<VisionSnapshot>): void {
    if (this.disposed) return;
    this.snapshotValue = Object.freeze({ ...this.snapshotValue, ...patch });
    for (const listener of this.listeners) listener(this.snapshotValue);
  }
}

export type VisionCacheClientProvider = () => Promise<VisionCacheClient>;

function deferredCacheClient(
  provider: VisionCacheClientProvider,
): VisionCacheClient {
  return {
    cacheRelease: (request, onState) =>
      provider().then((resolved) => resolved.cacheRelease(request, onState)),
    cancel(request) {
      void provider().then((resolved) => resolved.cancel(request));
    },
    queryRelease: (request) =>
      provider().then((resolved) => resolved.queryRelease(request)),
  };
}

const NETWORK_PROBE_PARAMETER = "__vision_network_probe";
let networkProbeSequence = 0;

type BrowserVisionWorkerFactory = () => VisionWorkerPort;

function createBrowserVisionWorker(): VisionWorkerPort {
  const factory = (
    globalThis as typeof globalThis & {
      __smartSmileCreateVisionWorker?: unknown;
    }
  ).__smartSmileCreateVisionWorker;
  return typeof factory === "function"
    ? (factory as BrowserVisionWorkerFactory)()
    : new Worker(new URL("./worker.ts", import.meta.url));
}

function createNetworkProbeUrl(manifestUrl: string): URL | undefined {
  const url = new URL(manifestUrl, window.location.href);
  if (url.origin !== window.location.origin) return undefined;
  url.searchParams.set(
    NETWORK_PROBE_PARAMETER,
    `${Date.now()}-${++networkProbeSequence}`,
  );
  return url;
}

export function createBrowserVisionCoordinator(
  registeredCacheClient:
    | Promise<VisionCacheClient>
    | VisionCacheClientProvider = registerApplicationServiceWorker,
): VisionCoordinator {
  const cacheClient = deferredCacheClient(
    typeof registeredCacheClient === "function"
      ? registeredCacheClient
      : () => registeredCacheClient,
  );
  return new VisionCoordinator({
    cacheClient,
    canFetchManifest: async (manifestUrl, signal) => {
      try {
        const probeUrl = createNetworkProbeUrl(manifestUrl);
        if (probeUrl === undefined) return false;
        const response = await fetch(probeUrl, {
          cache: "no-store",
          credentials: "same-origin",
          mode: "same-origin",
          redirect: "error",
          signal,
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    createWorker: createBrowserVisionWorker,
    manifest: VISION_MANIFEST,
    manifestUrl: VISION_MANIFEST_URL,
    now: () => performance.now(),
  });
}
