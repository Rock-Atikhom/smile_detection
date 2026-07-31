import { afterEach, describe, expect, it, vi } from "vitest";
import type { VisionCacheClient } from "../service-worker/client";
import type { VisionWorkerCommand, VisionWorkerEvent } from "./protocol";
import { VISION_MANIFEST, VISION_MANIFEST_URL } from "./release";
import {
  createInitialVisionSnapshot,
  createBrowserVisionCoordinator,
  VisionCoordinator,
  type VisionCoordinatorDependencies,
  type VisionSnapshot,
  type VisionWorkerPort,
} from "./coordinator";

class FakeWorker implements VisionWorkerPort {
  readonly messages: VisionWorkerCommand[] = [];
  readonly terminate = vi.fn<() => void>();
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

  postMessage(message: VisionWorkerCommand) {
    this.messages.push(message);
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

interface CacheControl {
  cacheState: ((state: "caching" | "ready" | "error") => void) | undefined;
  client: VisionCacheClient;
  finishCache: (result: "ready" | "error") => void;
  queryResult: "ready" | "missing";
}

function createCache(): CacheControl {
  const control: CacheControl = {
    cacheState: undefined,
    finishCache: () => undefined,
    queryResult: "missing",
    client: undefined as unknown as VisionCacheClient,
  };
  control.client = {
    cacheRelease: vi.fn((_request, onState) => {
      control.cacheState = onState;
      return new Promise<"ready" | "error">((resolve) => {
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
    });
  });

  it("blocks first-use offline before constructing a worker", async () => {
    const canFetchManifest = vi.fn(async () => false);
    const harness = createHarness({ canFetchManifest });

    await expect(harness.coordinator.prepare()).resolves.toBe(
      "first-use-offline",
    );

    expect(harness.cache.client.queryRelease).toHaveBeenCalledWith({
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
    });
    expect(canFetchManifest).toHaveBeenCalledWith(
      VISION_MANIFEST_URL,
      expect.any(AbortSignal),
    );
    expect(harness.dependencies.createWorker).not.toHaveBeenCalled();
    expect(harness.cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(harness.snapshot()).toMatchObject({
      runtime: "error",
      offlineCache: "not-ready",
      reason: "first-use-offline",
      retryAvailable: true,
    });
  });

  it("finishes the preflight before starting worker and cache work", async () => {
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
    await expect(result).resolves.toBe("started");
    expect(harness.dependencies.canFetchManifest).toHaveBeenCalledOnce();
    expect(harness.dependencies.createWorker).toHaveBeenCalledOnce();
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
    expect(cache.client.cacheRelease).toHaveBeenCalledOnce();
  });

  it("keeps runtime readiness independent from offline readiness", async () => {
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
      offlineCache: "caching",
      wasmTier: "simd",
    });

    harness.cache.cacheState?.("ready");
    expect(harness.snapshot()).toMatchObject({
      runtime: "ready",
      offlineCache: "ready",
      wasmTier: "simd",
    });
  });

  it("can finish offline setup while runtime initialization continues", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();

    harness.cache.cacheState?.("ready");

    expect(harness.snapshot()).toMatchObject({
      runtime: "preparing",
      offlineCache: "ready",
      wasmTier: "unknown",
      phase: "verifying",
    });
    expect(harness.workers[0]!.terminate).not.toHaveBeenCalled();
  });

  it("keeps a ready runtime usable after a cache-only failure", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();
    harness.workers[0]!.dispatch({
      type: "READY",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      wasmTier: "baseline",
    });

    harness.cache.cacheState?.("error");

    expect(harness.snapshot()).toEqual({
      runtime: "ready",
      offlineCache: "error",
      wasmTier: "baseline",
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
      reason: "offline-cache-failed",
      retryAvailable: true,
      phase: null,
    });
  });

  it("makes integrity failure fatal and cancels cache population", async () => {
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
    expect(harness.cache.client.cancel).toHaveBeenCalledWith({
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
    });
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

    await expect(result).resolves.toBe("first-use-offline");
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
    const harness = createHarness({ canFetchManifest });

    const result = harness.coordinator.prepare();
    await vi.waitFor(() => expect(canFetchManifest).toHaveBeenCalledOnce());
    harness.coordinator.cancel();
    expect(preflightSignal.aborted).toBe(true);
    finishNetwork(true);

    await expect(result).resolves.toBe("first-use-offline");
    expect(harness.dependencies.createWorker).not.toHaveBeenCalled();
    expect(harness.cache.client.cacheRelease).not.toHaveBeenCalled();
    expect(harness.snapshot()).toMatchObject({
      generation: 1,
      runtime: "idle",
      reason: "runtime-cancelled",
    });
  });

  it("cancels and terminates preparation while preserving a complete cache", async () => {
    const harness = createHarness();
    await harness.coordinator.prepare();
    harness.cache.cacheState?.("ready");

    harness.coordinator.cancel();

    expect(harness.workers[0]!.messages.at(-1)).toEqual({
      type: "CANCEL",
      generation: 0,
    });
    expect(harness.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(harness.cache.client.cancel).toHaveBeenCalledWith({
      generation: 0,
      releaseId: VISION_MANIFEST.releaseId,
    });
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
    expect(harness.cache.client.cancel).toHaveBeenCalledOnce();
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
    const coordinator = createBrowserVisionCoordinator();

    await expect(coordinator.prepare()).resolves.toBe("started");

    expect(WorkerConstructor).toHaveBeenCalledOnce();
    expect(WorkerConstructor.mock.calls[0]).toHaveLength(1);
    expect(String(WorkerConstructor.mock.calls[0]?.[0])).toContain(
      "/vision/worker.ts",
    );
    coordinator.dispose();
  });
});
