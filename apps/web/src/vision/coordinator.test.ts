import { afterEach, describe, expect, it, vi } from "vitest";
import type { VisionCacheClient } from "../service-worker/client";
import type {
  VisionFaceEvidenceEvent,
  VisionFrameCommand,
  VisionWorkerCommand,
  VisionWorkerEvent,
} from "./protocol";
import { VISION_MANIFEST, VISION_MANIFEST_URL } from "./release";
import {
  createInitialVisionSnapshot,
  createBrowserVisionCoordinator,
  VisionCoordinator,
  type VisionCoordinatorDependencies,
  type VisionSnapshot,
  type VisionStartResult,
  type VisionWorkerPort,
} from "./coordinator";

class FakeWorker implements VisionWorkerPort {
  readonly messages: VisionWorkerCommand[] = [];
  readonly terminate = vi.fn<() => void>();
  readonly postMessage = vi.fn(
    (message: VisionWorkerCommand, _transfer?: Transferable[]) => {
      void _transfer;
      this.messages.push(message);
    },
  );
  private readonly listeners = new Set<
    (event: MessageEvent<unknown>) => void
  >();

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) {
    this.listeners.delete(listener);
  }

  dispatch(data: VisionWorkerEvent | unknown) {
    for (const listener of this.listeners) {
      listener({ data } as MessageEvent<unknown>);
    }
  }

  get listenerCount() {
    return this.listeners.size;
  }
}

function bitmap() {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

function frame(
  sequence: number,
  generation = 0,
  image = bitmap(),
  cameraGeneration = 0,
): VisionFrameCommand {
  return {
    type: "FRAME",
    generation,
    cameraGeneration,
    sequence,
    capturedAtMs: 900 + sequence,
    width: 640,
    height: 360,
    orientation: "landscape",
    tier: "standard",
    bitmap: image,
  };
}

function faceEvidence(
  overrides: Partial<VisionFaceEvidenceEvent> = {},
): VisionFaceEvidenceEvent {
  return {
    type: "FACE_EVIDENCE",
    generation: 0,
    cameraGeneration: 0,
    sequence: 0,
    capturedAtMs: 900,
    completedAtMs: 950,
    width: 640,
    height: 360,
    orientation: "landscape",
    tier: "standard",
    faceCount: 1,
    guidance: "face-ready",
    eligible: true,
    ...overrides,
  };
}

interface CacheControl {
  cacheState:
    | ((state: "caching" | "ready" | "error" | "integrity-failed") => void)
    | undefined;
  client: VisionCacheClient;
  finishCache: (result: "ready" | "error" | "integrity-failed") => void;
  queryResult: "ready" | "missing" | "integrity-failed" | "indeterminate";
}

function createCache(): CacheControl {
  const control: CacheControl = {
    cacheState: undefined,
    finishCache: () => undefined,
    queryResult: "ready",
    client: undefined as unknown as VisionCacheClient,
  };
  control.client = {
    cacheRelease: vi.fn((_request, onState) => {
      control.cacheState = onState;
      return new Promise<"ready" | "error" | "integrity-failed">((resolve) => {
        control.finishCache = resolve;
      });
    }),
    cancel: vi.fn(),
    queryRelease: vi.fn(async () => control.queryResult),
  };
  return control;
}

function createHarness(overrides: Partial<VisionCoordinatorDependencies> = {}) {
  const cache = createCache();
  const workers: FakeWorker[] = [];
  const dependencies: VisionCoordinatorDependencies = {
    cacheClient: cache.client,
    canFetchManifest: vi.fn(async () => true),
    createWorker: vi.fn(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }),
    manifest: VISION_MANIFEST,
    manifestUrl: VISION_MANIFEST_URL,
    now: () => performance.now(),
    ...overrides,
  };
  const coordinator = new VisionCoordinator(dependencies);
  let snapshot = createInitialVisionSnapshot();
  const snapshots: VisionSnapshot[] = [];
  coordinator.subscribe((next) => {
    snapshot = next;
    snapshots.push(next);
  });
  return {
    cache,
    coordinator,
    dependencies,
    snapshots,
    workers,
    snapshot: () => snapshot,
  };
}

async function readyWorker(harness: ReturnType<typeof createHarness>) {
  await harness.coordinator.prepare();
  const worker = harness.workers.at(-1)!;
  worker.dispatch({
    type: "READY",
    generation: harness.coordinator.snapshot.generation,
    releaseId: VISION_MANIFEST.releaseId,
    wasmTier: "simd",
  });
  return worker;
}

describe("VisionCoordinator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with one bounded semantic snapshot", () => {
    expect(createInitialVisionSnapshot()).toEqual({
      runtime: "idle",
      offlineCache: "not-ready",
      wasmTier: "unknown",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      reason: null,
      retryAvailable: false,
      phase: null,
      face: {
        state: "idle",
        faceCount: 0,
        guidance: null,
        eligible: false,
        lastSequence: null,
        staleResults: 0,
      },
    });
  });

  it("publishes fresh categorical evidence and rejects evidence aged 201 ms", async () => {
    let now = 1_050;
    const harness = createHarness({ now: () => now });
    const worker = await readyWorker(harness);

    worker.dispatch(faceEvidence({ sequence: 8, capturedAtMs: 900 }));
    expect(harness.snapshot().face).toEqual({
      state: "ready",
      faceCount: 1,
      guidance: "face-ready",
      eligible: true,
      lastSequence: 8,
      staleResults: 0,
    });

    now = 1_101;
    worker.dispatch(faceEvidence({ sequence: 9, capturedAtMs: 900 }));
    expect(harness.snapshot().face.lastSequence).toBe(8);
    expect(harness.snapshot().face.staleResults).toBe(1);
  });

  it("rejects duplicate, decreasing, future, and wrong-generation evidence", async () => {
    let now = 1_000;
    const harness = createHarness({ now: () => now });
    const worker = await readyWorker(harness);
    worker.dispatch(faceEvidence({ sequence: 8 }));

    worker.dispatch(
      faceEvidence({ sequence: 8, guidance: "too-far", eligible: false }),
    );
    worker.dispatch(
      faceEvidence({ sequence: 7, guidance: "too-close", eligible: false }),
    );
    now = 899;
    worker.dispatch(faceEvidence({ sequence: 9, capturedAtMs: 900 }));
    worker.dispatch(
      faceEvidence({ generation: 1, sequence: 10, capturedAtMs: 899 }),
    );

    expect(harness.snapshot().face).toMatchObject({
      guidance: "face-ready",
      lastSequence: 8,
      staleResults: 3,
    });
  });

  it("resets face evidence and ignores old events after cancel and restart", async () => {
    const cancelled = createHarness({ now: () => 1_000 });
    const cancelledWorker = await readyWorker(cancelled);
    cancelledWorker.dispatch(faceEvidence({ sequence: 4 }));
    cancelled.coordinator.cancel();
    cancelledWorker.dispatch(faceEvidence({ sequence: 5 }));
    expect(cancelled.snapshot().face).toEqual({
      state: "idle",
      faceCount: 0,
      guidance: null,
      eligible: false,
      lastSequence: null,
      staleResults: 0,
    });

    const restarted = createHarness({ now: () => 1_000 });
    const oldWorker = await readyWorker(restarted);
    oldWorker.dispatch(faceEvidence({ sequence: 4 }));
    await restarted.coordinator.restart();
    oldWorker.dispatch(faceEvidence({ sequence: 5 }));
    expect(restarted.snapshot().face).toEqual({
      state: "idle",
      faceCount: 0,
      guidance: null,
      eligible: false,
      lastSequence: null,
      staleResults: 0,
    });
  });

  it("transfers one frame and keeps only the latest pending frame", async () => {
    const harness = createHarness({ now: () => 1_000 });
    const worker = await readyWorker(harness);
    worker.postMessage.mockClear();
    const a = frame(0);
    const b = frame(1);
    const c = frame(2);

    expect(harness.coordinator.submitFrame(a)).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith(a, [a.bitmap]);
    expect(harness.coordinator.submitFrame(b)).toBe(true);
    expect(harness.coordinator.submitFrame(c)).toBe(true);
    expect(b.bitmap.close).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    worker.dispatch(faceEvidence({ generation: 1, sequence: 0 }));
    worker.dispatch(faceEvidence({ sequence: 77 }));
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    worker.dispatch(faceEvidence({ sequence: 0 }));
    expect(worker.postMessage).toHaveBeenCalledWith(c, [c.bitmap]);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(a.bitmap.close).not.toHaveBeenCalled();
    expect(c.bitmap.close).not.toHaveBeenCalled();
  });

  it("settles an in-flight frame before rejecting its stale evidence", async () => {
    let now = 1_000;
    const harness = createHarness({ now: () => now });
    const worker = await readyWorker(harness);
    worker.postMessage.mockClear();
    const a = frame(0);
    const b = frame(1);
    harness.coordinator.submitFrame(a);
    harness.coordinator.submitFrame(b);

    now = 1_101;
    worker.dispatch(faceEvidence({ sequence: 0, capturedAtMs: 900 }));

    expect(worker.postMessage).toHaveBeenLastCalledWith(b, [b.bitmap]);
    expect(harness.snapshot().face.lastSequence).toBeNull();
    expect(harness.snapshot().face.staleResults).toBe(1);
  });

  it("holds a new camera generation until the old in-flight tuple settles", async () => {
    const harness = createHarness({ now: () => 1_000 });
    const worker = await readyWorker(harness);
    worker.postMessage.mockClear();
    const oldFrame = frame(0);
    const nextCameraFrame = frame(0, 0, bitmap(), 1);

    expect(harness.coordinator.submitFrame(oldFrame)).toBe(true);
    expect(harness.coordinator.submitFrame(nextCameraFrame)).toBe(true);
    worker.dispatch(faceEvidence({ cameraGeneration: 0, sequence: 0 }));

    expect(worker.postMessage).toHaveBeenLastCalledWith(nextCameraFrame, [
      nextCameraFrame.bitmap,
    ]);
    expect(harness.snapshot().face).toMatchObject({
      state: "detecting",
      guidance: null,
      lastSequence: null,
    });
  });

  it("closes an older pending frame when a camera generation advances", async () => {
    const harness = createHarness({ now: () => 1_000 });
    const worker = await readyWorker(harness);
    worker.postMessage.mockClear();
    const oldInFlight = frame(0);
    const oldPending = frame(1);
    const nextCameraFrame = frame(0, 0, bitmap(), 1);

    harness.coordinator.submitFrame(oldInFlight);
    harness.coordinator.submitFrame(oldPending);
    harness.coordinator.submitFrame(nextCameraFrame);

    expect(oldPending.bitmap.close).toHaveBeenCalledOnce();
    worker.dispatch(faceEvidence({ cameraGeneration: 0, sequence: 0 }));
    expect(worker.postMessage).toHaveBeenLastCalledWith(nextCameraFrame, [
      nextCameraFrame.bitmap,
    ]);
  });

  it("does not let a wrong camera tuple release pending ownership", async () => {
    const harness = createHarness({ now: () => 1_000 });
    const worker = await readyWorker(harness);
    worker.postMessage.mockClear();
    const oldFrame = frame(0);
    const nextCameraFrame = frame(0, 0, bitmap(), 1);

    harness.coordinator.submitFrame(oldFrame);
    harness.coordinator.submitFrame(nextCameraFrame);
    worker.dispatch(faceEvidence({ cameraGeneration: 1, sequence: 0 }));

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(harness.snapshot().face).toMatchObject({
      state: "detecting",
      guidance: null,
      lastSequence: null,
    });
  });

  it("returns rejected frame ownership before readiness and for a wrong generation", async () => {
    const harness = createHarness();
    const beforeReady = frame(0);
    expect(harness.coordinator.submitFrame(beforeReady)).toBe(false);
    expect(beforeReady.bitmap.close).not.toHaveBeenCalled();

    await readyWorker(harness);
    const wrongGeneration = frame(1, 1);
    expect(harness.coordinator.submitFrame(wrongGeneration)).toBe(false);
    expect(wrongGeneration.bitmap.close).not.toHaveBeenCalled();
  });

  it.each(["cancel", "restart", "dispose"] as const)(
    "closes the pending coordinator-owned frame on %s",
    async (action) => {
      const harness = createHarness();
      await readyWorker(harness);
      const transferred = frame(0);
      const pending = frame(1);
      harness.coordinator.submitFrame(transferred);
      harness.coordinator.submitFrame(pending);

      if (action === "cancel") harness.coordinator.cancel();
      if (action === "restart") await harness.coordinator.restart();
      if (action === "dispose") harness.coordinator.dispose();

      expect(pending.bitmap.close).toHaveBeenCalledOnce();
      expect(transferred.bitmap.close).not.toHaveBeenCalled();
    },
  );

  it("terminates admission and closes pending data on a worker error", async () => {
    const harness = createHarness();
    const worker = await readyWorker(harness);
    const transferred = frame(0);
    const pending = frame(1);
    harness.coordinator.submitFrame(transferred);
    harness.coordinator.submitFrame(pending);

    worker.dispatch({
      type: "ERROR",
      generation: 0,
      code: "runtime-initialization-failed",
      recoverable: true,
    });

    expect(pending.bitmap.close).toHaveBeenCalledOnce();
    expect(transferred.bitmap.close).not.toHaveBeenCalled();
    expect(harness.snapshot().face.state).toBe("error");
    const rejected = frame(2);
    expect(harness.coordinator.submitFrame(rejected)).toBe(false);
    expect(rejected.bitmap.close).not.toHaveBeenCalled();
  });

  it("returns untransferred ownership and terminates admission when postMessage throws", async () => {
    const harness = createHarness();
    const worker = await readyWorker(harness);
    worker.postMessage.mockImplementationOnce(() => {
      throw new DOMException("clone failed", "DataCloneError");
    });
    const command = frame(0);

    expect(harness.coordinator.submitFrame(command)).toBe(false);
    expect(command.bitmap.close).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(harness.snapshot()).toMatchObject({
      runtime: "error",
      face: { state: "error" },
    });
  });

  it("closes an accepted pending frame when its later transfer throws", async () => {
    const harness = createHarness({ now: () => 1_000 });
    const worker = await readyWorker(harness);
    const transferred = frame(0);
    const pending = frame(1);
    harness.coordinator.submitFrame(transferred);
    harness.coordinator.submitFrame(pending);
    worker.postMessage.mockImplementationOnce(() => {
      throw new DOMException("clone failed", "DataCloneError");
    });

    worker.dispatch(faceEvidence({ sequence: 0 }));

    expect(pending.bitmap.close).toHaveBeenCalledOnce();
    expect(transferred.bitmap.close).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(harness.snapshot()).toMatchObject({
      runtime: "error",
      face: { state: "error" },
    });
  });

  it("blocks first-use offline before constructing a worker", async () => {
    const canFetchManifest = vi.fn(async () => false);
    const cache = createCache();
    cache.queryResult = "missing";
    const harness = createHarness({
      cacheClient: cache.client,
      canFetchManifest,
    });

    await expect(harness.coordinator.prepare()).resolves.toBe(
      "first-use-offline",
    );

    expect(cache.client.queryRelease).toHaveBeenCalledWith({
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
    });
    expect(canFetchManifest).toHaveBeenCalledWith(
      VISION_MANIFEST_URL,
      expect.any(AbortSignal),
    );
    expect(harness.dependencies.createWorker).not.toHaveBeenCalled();
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(harness.snapshot()).toMatchObject({
      runtime: "error",
      offlineCache: "not-ready",
      reason: "first-use-offline",
      retryAvailable: true,
    });
  });

  it("finishes the preflight before starting worker and cache work in parallel", async () => {
    let finishQuery!: (result: "ready" | "missing") => void;
    const queryRelease = vi.fn(
      () =>
        new Promise<"ready" | "missing">((resolve) => {
          finishQuery = resolve;
        }),
    );
    const cache = createCache();
    cache.client.queryRelease = queryRelease;
    const harness = createHarness({ cacheClient: cache.client });

    const result = harness.coordinator.prepare();
    expect(queryRelease).toHaveBeenCalledOnce();
    expect(harness.dependencies.createWorker).not.toHaveBeenCalled();
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();

    finishQuery("missing");
    await vi.waitFor(() =>
      expect(cache.client.cacheRelease).toHaveBeenCalled(),
    );
    await expect(result).resolves.toBe("started");
    expect(harness.dependencies.createWorker).toHaveBeenCalledOnce();
    expect(harness.dependencies.canFetchManifest).toHaveBeenCalledOnce();
    expect(harness.workers[0]?.messages).toEqual([
      {
        type: "PREPARE",
        generation: 0,
        manifestUrl: VISION_MANIFEST_URL,
        releaseId: VISION_MANIFEST.releaseId,
      },
    ]);
    expect(cache.client.cacheRelease).toHaveBeenCalledWith(
      {
        generation: 0,
        manifestUrl: VISION_MANIFEST_URL,
        releaseId: VISION_MANIFEST.releaseId,
      },
      expect.any(Function),
    );
    cache.finishCache("ready");
    await vi.waitFor(() =>
      expect(harness.snapshot().offlineCache).toBe("ready"),
    );
  });

  it("deduplicates preparation and trusts a completed cache without network", async () => {
    let finishQuery!: (result: "ready" | "missing") => void;
    const queryRelease = vi.fn(
      () =>
        new Promise<"ready" | "missing">((resolve) => {
          finishQuery = resolve;
        }),
    );
    const cache = createCache();
    cache.client.queryRelease = queryRelease;
    const harness = createHarness({ cacheClient: cache.client });

    const first = harness.coordinator.prepare();
    const second = harness.coordinator.prepare();
    expect(second).toBe(first);
    finishQuery("ready");

    await expect(first).resolves.toBe("started");
    expect(harness.dependencies.canFetchManifest).not.toHaveBeenCalled();
    expect(harness.dependencies.createWorker).toHaveBeenCalledOnce();
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();
  });

  it("starts runtime before cache completion and keeps a cache-only operational failure independent", async () => {
    const cache = createCache();
    cache.queryResult = "missing";
    const harness = createHarness({ cacheClient: cache.client });

    const result = harness.coordinator.prepare();
    await vi.waitFor(() =>
      expect(cache.client.cacheRelease).toHaveBeenCalledOnce(),
    );
    const workerStartedBeforeCacheFinished =
      vi.mocked(harness.dependencies.createWorker).mock.calls.length === 1;
    cache.finishCache("error");

    await expect(result).resolves.toBe("started");
    expect(workerStartedBeforeCacheFinished).toBe(true);
    expect(harness.snapshot()).toMatchObject({
      runtime: "preparing",
      offlineCache: "error",
      reason: "offline-cache-failed",
    });

    harness.workers[0]!.dispatch({
      type: "READY",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      wasmTier: "simd",
    });
    expect(harness.snapshot()).toMatchObject({
      runtime: "ready",
      offlineCache: "error",
      reason: null,
    });
  });

  it("routes corrupt completed cache state to fatal integrity recovery", async () => {
    const cache = createCache();
    cache.queryResult = "integrity-failed";
    const harness = createHarness({ cacheClient: cache.client });

    await expect(harness.coordinator.prepare()).resolves.toBe("failed");

    expect(harness.dependencies.canFetchManifest).not.toHaveBeenCalled();
    expect(harness.dependencies.createWorker).not.toHaveBeenCalled();
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(harness.snapshot()).toMatchObject({
      runtime: "error",
      offlineCache: "error",
      reason: "runtime-integrity-failed",
      retryAvailable: false,
    });
  });

  it.each(["indeterminate", "thrown failure"] as const)(
    "fails closed on an %s cache query before any startup work",
    async (failure) => {
      const cache = createCache();
      if (failure === "indeterminate") {
        cache.queryResult = "indeterminate";
      } else {
        cache.client.queryRelease = vi.fn(async () => {
          throw new Error("private query failure");
        });
      }
      const harness = createHarness({
        cacheClient: cache.client,
        canFetchManifest: vi.fn(async () => false),
      });

      await expect(harness.coordinator.prepare()).resolves.toBe("failed");

      expect(harness.dependencies.canFetchManifest).not.toHaveBeenCalled();
      expect(cache.client.cacheRelease).not.toHaveBeenCalled();
      expect(harness.dependencies.createWorker).not.toHaveBeenCalled();
      expect(harness.snapshot()).toMatchObject({
        runtime: "error",
        offlineCache: "error",
        reason: "offline-cache-failed",
        retryAvailable: true,
      });
      expect(JSON.stringify(harness.snapshot())).not.toContain("private");
    },
  );

  it("makes first-population integrity fatal and terminates the active runtime", async () => {
    const cache = createCache();
    cache.queryResult = "missing";
    const harness = createHarness({ cacheClient: cache.client });

    const result = harness.coordinator.prepare();
    await vi.waitFor(() =>
      expect(cache.client.cacheRelease).toHaveBeenCalled(),
    );
    await expect(result).resolves.toBe("started");
    cache.finishCache("integrity-failed");

    await vi.waitFor(() =>
      expect(harness.snapshot()).toMatchObject({
        runtime: "error",
        offlineCache: "error",
        reason: "runtime-integrity-failed",
        retryAvailable: false,
      }),
    );
    expect(harness.workers[0]!.messages.at(-1)).toEqual({
      type: "CANCEL",
      generation: 0,
    });
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it("cancels concurrent cache and runtime work without late publication", async () => {
    const cache = createCache();
    cache.queryResult = "missing";
    const harness = createHarness({ cacheClient: cache.client });

    const result = harness.coordinator.prepare();
    await vi.waitFor(() =>
      expect(cache.client.cacheRelease).toHaveBeenCalled(),
    );
    await expect(result).resolves.toBe("started");
    harness.coordinator.cancel();
    cache.finishCache("ready");

    expect(cache.client.cancel).toHaveBeenCalledWith({
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
    });
    expect(harness.workers[0]!.messages.at(-1)).toEqual({
      type: "CANCEL",
      generation: 0,
    });
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(harness.snapshot()).toMatchObject({
      generation: 1,
      runtime: "idle",
      reason: "runtime-cancelled",
    });
  });

  it("keeps the completed cache ready while runtime initialization finishes", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();
    const worker = harness.workers[0]!;

    worker.dispatch({
      type: "READY",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      wasmTier: "simd",
    });
    expect(harness.snapshot()).toMatchObject({
      runtime: "ready",
      offlineCache: "ready",
      wasmTier: "simd",
    });
  });

  it("never re-populates an already completed cache while runtime initializes", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();

    expect(harness.snapshot()).toMatchObject({
      runtime: "preparing",
      offlineCache: "ready",
      wasmTier: "unknown",
      phase: "verifying",
    });
    expect(harness.cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(harness.workers[0]!.terminate).not.toHaveBeenCalled();
  });

  it("keeps a verified cache ready when worker construction fails", async () => {
    const cache = createCache();
    cache.queryResult = "ready";
    const createWorker = vi.fn(() => {
      throw new Error("private worker construction failure");
    });
    const harness = createHarness({
      cacheClient: cache.client,
      createWorker,
    });

    await expect(harness.coordinator.prepare()).resolves.toBe("failed");

    expect(harness.snapshot()).toMatchObject({
      runtime: "error",
      offlineCache: "ready",
      wasmTier: "unknown",
      reason: "runtime-initialization-failed",
      retryAvailable: true,
      phase: null,
    });
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(JSON.stringify(harness.snapshot())).not.toContain("private");
  });

  it("keeps cache population independent when worker construction fails", async () => {
    const cache = createCache();
    cache.queryResult = "missing";
    const harness = createHarness({
      cacheClient: cache.client,
      createWorker: vi.fn(() => {
        throw new Error("private worker construction failure");
      }),
    });

    const pending = harness.coordinator.prepare();
    await vi.waitFor(() =>
      expect(cache.client.cacheRelease).toHaveBeenCalled(),
    );
    expect(harness.dependencies.createWorker).toHaveBeenCalledOnce();
    await expect(pending).resolves.toBe("failed");
    expect(harness.snapshot()).toMatchObject({
      runtime: "error",
      offlineCache: "caching",
      reason: "runtime-initialization-failed",
      retryAvailable: true,
    });
    cache.finishCache("ready");

    await vi.waitFor(() =>
      expect(harness.snapshot()).toMatchObject({
        runtime: "error",
        offlineCache: "ready",
        reason: "runtime-initialization-failed",
        retryAvailable: true,
      }),
    );
  });

  it("does not start stale preparation when a subscriber cancels its notification", async () => {
    const cache = createCache();
    const harness = createHarness({ cacheClient: cache.client });
    let cancelled = false;
    harness.coordinator.subscribe((snapshot) => {
      if (!cancelled && snapshot.runtime === "preparing") {
        cancelled = true;
        harness.coordinator.cancel();
      }
    });

    await expect(harness.coordinator.prepare()).resolves.toBe("failed");

    expect(harness.workers[0]!.messages).not.toContainEqual(
      expect.objectContaining({ type: "PREPARE", generation: 0 }),
    );
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(harness.snapshot()).toMatchObject({
      generation: 1,
      runtime: "idle",
      reason: "runtime-cancelled",
    });
  });

  it("starts only the new generation when a subscriber restarts its notification", async () => {
    const cache = createCache();
    const harness = createHarness({ cacheClient: cache.client });
    let restarted = false;
    let restartResult: Promise<VisionStartResult> | undefined;
    harness.coordinator.subscribe((snapshot) => {
      if (!restarted && snapshot.runtime === "preparing") {
        restarted = true;
        restartResult = harness.coordinator.restart();
      }
    });

    await expect(harness.coordinator.prepare()).resolves.toBe("failed");
    await expect(restartResult).resolves.toBe("started");

    expect(harness.workers).toHaveLength(2);
    expect(harness.workers[0]!.messages).toEqual([
      { type: "CANCEL", generation: 0 },
    ]);
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(harness.workers[1]!.messages).toEqual([
      {
        type: "PREPARE",
        generation: 1,
        manifestUrl: VISION_MANIFEST_URL,
        releaseId: VISION_MANIFEST.releaseId,
      },
    ]);
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();
  });

  it("starts no stale work when a subscriber disposes its notification", async () => {
    const cache = createCache();
    const harness = createHarness({ cacheClient: cache.client });
    let disposed = false;
    harness.coordinator.subscribe((snapshot) => {
      if (!disposed && snapshot.runtime === "preparing") {
        disposed = true;
        harness.coordinator.dispose();
      }
    });

    await expect(harness.coordinator.prepare()).resolves.toBe("failed");

    expect(harness.workers[0]!.messages).toEqual([
      { type: "CANCEL", generation: 0 },
    ]);
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(harness.coordinator.snapshot).toMatchObject({
      generation: 1,
      runtime: "idle",
    });
  });

  it("makes a late worker integrity failure fatal", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();

    harness.workers[0]!.dispatch({
      type: "ERROR",
      generation: 0,
      code: "runtime-integrity-failed",
      recoverable: true,
    });

    expect(harness.snapshot()).toMatchObject({
      runtime: "error",
      offlineCache: "error",
      reason: "runtime-integrity-failed",
      retryAvailable: false,
    });
    expect(harness.cache.client.cancel).not.toHaveBeenCalled();
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it("surfaces a late worker cache operation failure as recoverable", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();

    harness.workers[0]!.dispatch({
      type: "ERROR",
      generation: 0,
      code: "offline-cache-failed",
      recoverable: true,
    });

    expect(harness.snapshot()).toMatchObject({
      runtime: "error",
      offlineCache: "error",
      reason: "offline-cache-failed",
      retryAvailable: true,
    });
    expect(harness.cache.client.cancel).not.toHaveBeenCalled();
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it("accepts one baseline result and ignores later terminal replies", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();
    const worker = harness.workers[0]!;
    worker.dispatch({
      type: "READY",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      wasmTier: "baseline",
    });
    worker.dispatch({
      type: "READY",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      wasmTier: "simd",
    });

    expect(harness.snapshot().wasmTier).toBe("baseline");
  });

  it("cancels an unsettled preflight without starting worker or cache work", async () => {
    let finishQuery!: (result: "ready" | "missing") => void;
    const queryRelease = vi.fn(
      () =>
        new Promise<"ready" | "missing">((resolve) => {
          finishQuery = resolve;
        }),
    );
    const cache = createCache();
    cache.client.queryRelease = queryRelease;
    const harness = createHarness({ cacheClient: cache.client });

    const result = harness.coordinator.prepare();
    harness.coordinator.cancel();
    finishQuery("missing");

    await expect(result).resolves.toBe("failed");
    expect(harness.dependencies.canFetchManifest).not.toHaveBeenCalled();
    expect(harness.dependencies.createWorker).not.toHaveBeenCalled();
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(harness.snapshot()).toMatchObject({
      generation: 1,
      runtime: "idle",
      reason: "runtime-cancelled",
    });
  });

  it("aborts network preflight and ignores its late success", async () => {
    let finishNetwork!: (reachable: boolean) => void;
    let preflightSignal!: AbortSignal;
    const canFetchManifest = vi.fn(
      (_url: string, signal: AbortSignal) =>
        new Promise<boolean>((resolve) => {
          preflightSignal = signal;
          finishNetwork = resolve;
        }),
    );
    const cache = createCache();
    cache.queryResult = "missing";
    const harness = createHarness({
      cacheClient: cache.client,
      canFetchManifest,
    });

    const result = harness.coordinator.prepare();
    await vi.waitFor(() => expect(canFetchManifest).toHaveBeenCalledOnce());
    harness.coordinator.cancel();
    expect(preflightSignal.aborted).toBe(true);
    finishNetwork(true);

    await expect(result).resolves.toBe("failed");
    expect(harness.dependencies.createWorker).not.toHaveBeenCalled();
    expect(cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(harness.snapshot()).toMatchObject({
      generation: 1,
      runtime: "idle",
      reason: "runtime-cancelled",
    });
  });

  it("cancels and terminates preparation while preserving a complete cache", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();
    harness.coordinator.cancel();

    expect(harness.workers[0]!.messages.at(-1)).toEqual({
      type: "CANCEL",
      generation: 0,
    });
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(harness.cache.client.cancel).not.toHaveBeenCalled();
    expect(harness.snapshot()).toMatchObject({
      generation: 1,
      runtime: "idle",
      offlineCache: "ready",
      reason: "runtime-cancelled",
    });
  });

  it("restarts with one newer generation and a fresh worker", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();

    await expect(harness.coordinator.restart()).resolves.toBe("started");

    expect(harness.workers).toHaveLength(2);
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(harness.workers[1]!.messages[0]).toMatchObject({
      type: "PREPARE",
      generation: 1,
    });
    expect(harness.snapshot().generation).toBe(1);
  });

  it("ignores stale, wrong-release, and unsafe worker messages", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();
    const oldWorker = harness.workers[0]!;
    await harness.coordinator.restart();
    const currentWorker = harness.workers[1]!;

    oldWorker.dispatch({
      type: "READY",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      wasmTier: "simd",
    });
    currentWorker.dispatch({
      type: "READY",
      generation: 1,
      releaseId: "fedcba9876543210",
      wasmTier: "simd",
    });
    currentWorker.dispatch({
      type: "ERROR",
      generation: 1,
      code: "private-upstream-error",
      recoverable: true,
    });

    expect(harness.snapshot()).toMatchObject({
      generation: 1,
      runtime: "preparing",
      reason: null,
      wasmTier: "unknown",
    });
    expect(JSON.stringify(harness.snapshot())).not.toContain("private");

    currentWorker.dispatch({
      type: "READY",
      generation: 1,
      releaseId: VISION_MANIFEST.releaseId,
      wasmTier: "simd",
    });
    expect(harness.snapshot()).toMatchObject({
      generation: 1,
      runtime: "ready",
      wasmTier: "simd",
    });
  });

  it("retains a ready worker when no runtime lifecycle action occurs", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();
    harness.workers[0]!.dispatch({
      type: "READY",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      wasmTier: "simd",
    });

    const beforeCameraSwitch = harness.coordinator.snapshot;

    expect(harness.coordinator.snapshot).toBe(beforeCameraSwitch);
    expect(harness.dependencies.createWorker).toHaveBeenCalledOnce();
    expect(harness.workers[0]!.terminate).not.toHaveBeenCalled();
  });

  it("does not treat the shell-precached manifest as network reachability", async () => {
    const shellManifestUrl = new URL(VISION_MANIFEST_URL, location.href);
    const fetchManifest = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void init;
        const requestedUrl = new URL(String(input), location.href);
        if (requestedUrl.href === shellManifestUrl.href) {
          return new Response("shell-cached manifest", { status: 200 });
        }
        throw new TypeError("network unavailable");
      },
    );
    const WorkerConstructor = vi.fn(() => new FakeWorker());
    vi.stubGlobal("fetch", fetchManifest);
    vi.stubGlobal("Worker", WorkerConstructor);
    const cache = createCache();
    cache.queryResult = "missing";
    const coordinator = createBrowserVisionCoordinator(
      Promise.resolve(cache.client),
    );

    await expect(coordinator.prepare()).resolves.toBe("first-use-offline");

    expect(fetchManifest).toHaveBeenCalledOnce();
    const [probeInput, probeInit] = fetchManifest.mock.calls[0]!;
    const probeUrl = new URL(String(probeInput), location.href);
    expect(probeUrl.origin).toBe(shellManifestUrl.origin);
    expect(probeUrl.pathname).toBe(shellManifestUrl.pathname);
    expect(probeUrl.searchParams.has("__vision_network_probe")).toBe(true);
    expect(probeInit).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    });
    expect(WorkerConstructor).not.toHaveBeenCalled();
    expect(coordinator.snapshot).toMatchObject({
      runtime: "error",
      offlineCache: "not-ready",
      reason: "first-use-offline",
      retryAvailable: true,
    });
    coordinator.dispose();
  });

  it("rejects a cross-origin manifest redirect before authorizing startup", async () => {
    const fetchManifest = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.mode === "same-origin" && init.redirect === "error") {
          throw new TypeError("cross-origin redirect blocked");
        }
        return new Response("redirected cross-origin manifest", {
          status: 200,
        });
      },
    );
    const WorkerConstructor = vi.fn(() => new FakeWorker());
    vi.stubGlobal("fetch", fetchManifest);
    vi.stubGlobal("Worker", WorkerConstructor);
    const cache = createCache();
    cache.queryResult = "missing";
    const coordinator = createBrowserVisionCoordinator(
      Promise.resolve(cache.client),
    );

    await expect(coordinator.prepare()).resolves.toBe("first-use-offline");

    expect(fetchManifest).toHaveBeenCalledWith(expect.any(URL), {
      cache: "no-store",
      credentials: "same-origin",
      mode: "same-origin",
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    expect(WorkerConstructor).not.toHaveBeenCalled();
    expect(coordinator.snapshot).toMatchObject({
      runtime: "error",
      offlineCache: "not-ready",
      reason: "first-use-offline",
    });
    coordinator.dispose();
  });

  it("disposes listeners and owned work once and ignores late replies", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();
    const worker = harness.workers[0]!;
    const snapshotCount = harness.snapshots.length;

    harness.coordinator.dispose();
    harness.coordinator.dispose();
    worker.dispatch({
      type: "READY",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      wasmTier: "simd",
    });

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount).toBe(0);
    expect(harness.cache.client.cancel).not.toHaveBeenCalled();
    expect(harness.snapshots).toHaveLength(snapshotCount);
    expect(harness.coordinator.snapshot.generation).toBe(1);
  });

  it("constructs the browser worker as classic with no module options", async () => {
    const worker = new FakeWorker();
    const WorkerConstructor = vi.fn(function (url: URL) {
      void url;
      return worker;
    });
    vi.stubGlobal("Worker", WorkerConstructor);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const cache = createCache();
    cache.queryResult = "ready";
    const coordinator = createBrowserVisionCoordinator(
      Promise.resolve(cache.client),
    );

    await expect(coordinator.prepare()).resolves.toBe("started");

    expect(WorkerConstructor).toHaveBeenCalledOnce();
    expect(WorkerConstructor.mock.calls[0]).toHaveLength(1);
    expect(String(WorkerConstructor.mock.calls[0]?.[0])).toContain(
      "/vision/worker.ts",
    );
    coordinator.dispose();
  });

  it("reacquires the cache client on restart after controller proof recovers", async () => {
    const unavailable = createCache();
    unavailable.queryResult = "indeterminate";
    const recovered = createCache();
    recovered.queryResult = "ready";
    const provider = vi
      .fn<() => Promise<VisionCacheClient>>()
      .mockResolvedValueOnce(unavailable.client)
      .mockResolvedValue(recovered.client);
    const worker = new FakeWorker();
    vi.stubGlobal(
      "Worker",
      vi.fn(function () {
        return worker;
      }),
    );
    const coordinator = createBrowserVisionCoordinator(provider);

    await expect(coordinator.prepare()).resolves.toBe("failed");
    expect(coordinator.snapshot).toMatchObject({
      reason: "offline-cache-failed",
      retryAvailable: true,
      runtime: "error",
    });

    await expect(coordinator.restart()).resolves.toBe("started");
    expect(provider).toHaveBeenCalledTimes(2);
    expect(worker.messages).toEqual([
      {
        type: "PREPARE",
        generation: 1,
        manifestUrl: VISION_MANIFEST_URL,
        releaseId: VISION_MANIFEST.releaseId,
      },
    ]);
    coordinator.dispose();
  });
});
