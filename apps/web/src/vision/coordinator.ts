import {
  registerApplicationServiceWorker,
  type VisionCacheClient,
  type VisionCachePreparationResult,
  type VisionCacheQueryResult,
} from "../service-worker/client";
import type { VisionReleaseManifest } from "./manifest";
import {
  isVisionWorkerEvent,
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
}

export interface VisionWorkerPort {
  postMessage(message: VisionWorkerCommand): void;
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
  settled: boolean;
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
  });
}

export class VisionCoordinator {
  private activeCacheGeneration: number | undefined;
  private cacheStartedGeneration: number | undefined;
  private activePreflight: ActivePreflight | undefined;
  private activeWorker: ActiveWorker | undefined;
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
    });
  }

  subscribe(listener: (snapshot: VisionSnapshot) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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

      const result = await this.populateCache(active);
      if (!this.isCurrentPreflight(active)) return "failed";
      if (result !== "ready") {
        this.activePreflight = undefined;
        if (result === "integrity-failed") {
          this.publishIntegrityFailure();
        } else {
          this.publish({
            offlineCache: "error",
            phase: null,
            reason: "offline-cache-failed",
            retryAvailable: true,
            runtime: "error",
            wasmTier: "unknown",
          });
        }
        return "failed";
      }
      this.publish({ offlineCache: "ready" });
    }

    this.activePreflight = undefined;
    return this.startWorker(active.generation) ? "started" : "failed";
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

  private startWorker(generation: number): boolean {
    let worker: VisionWorkerPort;
    try {
      worker = this.dependencies.createWorker();
    } catch {
      this.publish({
        offlineCache: "ready",
        runtime: "error",
        phase: null,
        reason: "runtime-initialization-failed",
        retryAvailable: true,
      });
      return false;
    }

    const active: ActiveWorker = {
      generation,
      listener: (event) => this.receiveWorkerEvent(active, event.data),
      port: worker,
      settled: false,
    };
    this.activeWorker = active;
    worker.addEventListener("message", active.listener);
    this.publish({
      offlineCache: "ready",
      phase: "verifying",
      reason: null,
      retryAvailable: false,
      runtime: "preparing",
      wasmTier: "unknown",
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
      active.settled ||
      !isVisionWorkerEvent(value) ||
      value.generation !== active.generation
    ) {
      return;
    }

    if (value.type === "PHASE") {
      this.publish({ phase: value.phase });
      return;
    }

    if (value.type === "READY") {
      if (value.releaseId !== this.dependencies.manifest.releaseId) return;
      active.settled = true;
      this.publish({
        phase: null,
        reason: null,
        retryAvailable: false,
        runtime: "ready",
        wasmTier: value.wasmTier,
      });
      return;
    }

    active.settled = true;
    if (value.code === "runtime-integrity-failed") {
      this.cancelActiveCache(active.generation);
    }
    this.publish({
      ...(value.code === "runtime-integrity-failed"
        ? { offlineCache: "error" as const }
        : {}),
      phase: null,
      reason: value.code,
      retryAvailable:
        value.code === "runtime-integrity-failed" ? false : value.recoverable,
      runtime: "error",
      wasmTier: "unknown",
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
    active.port.removeEventListener("message", active.listener);
    active.port.terminate();
    this.activeWorker = undefined;
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
    createWorker: () => new Worker(new URL("./worker.ts", import.meta.url)),
    manifest: VISION_MANIFEST,
    manifestUrl: VISION_MANIFEST_URL,
  });
}
