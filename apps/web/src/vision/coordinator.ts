import {
  registerApplicationServiceWorker,
  type VisionCacheClient,
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

type StartResult = "started" | "first-use-offline";

interface ActivePreflight {
  controller: AbortController;
  generation: number;
  promise: Promise<StartResult>;
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

  prepare(): Promise<StartResult> {
    if (this.disposed) return Promise.resolve("first-use-offline");
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
      promise: Promise.resolve<StartResult>("first-use-offline"),
    };
    this.activePreflight = active;
    active.promise = this.runPreflight(active);
    return active.promise;
  }

  async restart(): Promise<StartResult> {
    if (this.disposed) return "first-use-offline";
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
    if (!this.ownsGeneration(generation)) return "first-use-offline";
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

  private async runPreflight(active: ActivePreflight): Promise<StartResult> {
    let cacheReady: boolean;
    try {
      cacheReady =
        (await this.dependencies.cacheClient.queryRelease({
          generation: active.generation,
          releaseId: this.dependencies.manifest.releaseId,
        })) === "ready";
    } catch {
      cacheReady = false;
    }
    if (!this.isCurrentPreflight(active)) return "first-use-offline";

    let manifestReachable = cacheReady;
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
    if (!this.isCurrentPreflight(active)) return "first-use-offline";

    this.activePreflight = undefined;
    if (!manifestReachable) {
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

    return this.startPreparation(active.generation, cacheReady)
      ? "started"
      : "first-use-offline";
  }

  private isCurrentPreflight(active: ActivePreflight): boolean {
    return (
      !this.disposed &&
      this.activePreflight === active &&
      !active.controller.signal.aborted &&
      this.snapshotValue.generation === active.generation
    );
  }

  private startPreparation(generation: number, cacheReady: boolean): boolean {
    let worker: VisionWorkerPort;
    try {
      worker = this.dependencies.createWorker();
    } catch {
      this.publish({
        offlineCache: cacheReady ? "ready" : "caching",
        runtime: "error",
        phase: null,
        reason: "runtime-initialization-failed",
        retryAvailable: true,
      });
      if (!this.ownsGeneration(generation)) return false;
      this.startCacheLane(generation);
      return this.ownsGeneration(generation);
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
      offlineCache: cacheReady ? "ready" : "caching",
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
    }

    if (!this.ownsGeneration(generation)) return false;
    this.startCacheLane(generation);
    return this.ownsGeneration(generation);
  }

  private startCacheLane(generation: number): void {
    if (!this.ownsGeneration(generation)) return;
    this.activeCacheGeneration = generation;
    this.cacheStartedGeneration = generation;
    let cachePromise: Promise<"ready" | "error">;
    try {
      cachePromise = this.dependencies.cacheClient.cacheRelease(
        {
          generation,
          manifestUrl: this.dependencies.manifestUrl,
          releaseId: this.dependencies.manifest.releaseId,
        },
        (state) => this.receiveCacheState(generation, state),
      );
    } catch {
      this.receiveCacheState(generation, "error");
      return;
    }
    void cachePromise
      .then((result) => this.receiveCacheState(generation, result))
      .catch(() => this.receiveCacheState(generation, "error"));
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
        reason:
          this.snapshotValue.reason === "offline-cache-failed"
            ? "offline-cache-failed"
            : null,
        retryAvailable: this.snapshotValue.reason === "offline-cache-failed",
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

  private receiveCacheState(
    generation: number,
    state: "caching" | "ready" | "error",
  ): void {
    if (
      this.disposed ||
      this.activeCacheGeneration !== generation ||
      this.snapshotValue.generation !== generation
    ) {
      return;
    }
    if (state === "caching") {
      if (this.snapshotValue.offlineCache !== "ready") {
        this.publish({ offlineCache: "caching" });
      }
      return;
    }

    this.activeCacheGeneration = undefined;
    if (state === "ready") {
      this.publish({
        offlineCache: "ready",
        reason:
          this.snapshotValue.reason === "offline-cache-failed"
            ? null
            : this.snapshotValue.reason,
        retryAvailable:
          this.snapshotValue.reason === "offline-cache-failed"
            ? false
            : this.snapshotValue.retryAvailable,
      });
      return;
    }

    this.publish({
      offlineCache: "error",
      reason:
        this.snapshotValue.runtime === "error"
          ? this.snapshotValue.reason
          : "offline-cache-failed",
      retryAvailable: true,
    });
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

function deferredCacheClient(
  client: Promise<VisionCacheClient>,
): VisionCacheClient {
  return {
    cacheRelease: (request, onState) =>
      client.then((resolved) => resolved.cacheRelease(request, onState)),
    cancel(request) {
      void client.then((resolved) => resolved.cancel(request));
    },
    queryRelease: (request) =>
      client.then((resolved) => resolved.queryRelease(request)),
  };
}

export function createBrowserVisionCoordinator(): VisionCoordinator {
  const cacheClient = deferredCacheClient(registerApplicationServiceWorker());
  return new VisionCoordinator({
    cacheClient,
    canFetchManifest: async (manifestUrl, signal) => {
      try {
        const response = await fetch(manifestUrl, {
          cache: "no-store",
          credentials: "same-origin",
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
