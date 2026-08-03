import { beforeEach, describe, expect, it, vi } from "vitest";
import { VisionAssetError } from "../vision/integrity";
import { VISION_MANIFEST } from "../vision/release";
import { VISION_RELEASE_PATH_PREFIX } from "../vision/manifest";
import {
  VISION_SERVICE_WORKER_PROTOCOL,
  type VisionCacheEvent,
  type VisionServiceWorkerHandshakeEvent,
} from "../vision/protocol";

const mocks = vi.hoisted(() => ({
  cacheVisionRelease: vi.fn(),
  cancelVisionRelease: vi.fn(),
  clientsClaim: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
  matchCompletedVisionAsset: vi.fn(),
  precacheAndRoute: vi.fn(),
  queryVisionRelease: vi.fn(),
}));

vi.mock("workbox-core", () => ({
  clientsClaim: mocks.clientsClaim,
}));

vi.mock("workbox-precaching", () => ({
  cleanupOutdatedCaches: mocks.cleanupOutdatedCaches,
  precacheAndRoute: mocks.precacheAndRoute,
}));
vi.mock("./vision-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./vision-cache")>()),
  cacheVisionRelease: mocks.cacheVisionRelease,
  cancelVisionRelease: mocks.cancelVisionRelease,
  matchCompletedVisionAsset: mocks.matchCompletedVisionAsset,
  queryVisionRelease: mocks.queryVisionRelease,
}));

type Listener = (event: never) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function loadWorker() {
  const listeners = new Map<string, Listener>();
  const workerScope = {
    __WB_MANIFEST: [{ url: "/index.html", revision: "shell" }],
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, listener);
    }),
    location: { href: "https://app.test/sw.js", origin: "https://app.test" },
    registration: { scope: "https://app.test/" },
    skipWaiting: vi.fn(async () => undefined),
  };
  vi.stubGlobal("self", workerScope);
  await import("./sw");
  return { listeners, workerScope };
}

async function dispatchMessage(
  listener: Listener,
  data: unknown,
  clientId = "client-a",
): Promise<VisionCacheEvent[]> {
  const replies: Array<VisionCacheEvent | VisionServiceWorkerHandshakeEvent> =
    [];
  let work: Promise<unknown> | undefined;
  listener({
    data,
    source: {
      id: clientId,
      postMessage: (event: VisionCacheEvent) => replies.push(event),
    },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise;
    },
  } as never);
  await work;
  return replies as VisionCacheEvent[];
}

const releaseId = "0123456789abcdef";
const base = { requestId: "request-4", generation: 4, releaseId };

describe("vision service worker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.cacheVisionRelease.mockResolvedValue("ready");
    mocks.queryVisionRelease.mockResolvedValue("missing");
    mocks.matchCompletedVisionAsset.mockResolvedValue(undefined);
  });

  it("precaches only the application shell during startup", async () => {
    const { workerScope } = await loadWorker();

    expect(mocks.cleanupOutdatedCaches).toHaveBeenCalledOnce();
    expect(mocks.precacheAndRoute).toHaveBeenCalledWith(
      workerScope.__WB_MANIFEST,
    );
    expect(mocks.cacheVisionRelease).not.toHaveBeenCalled();
    expect(mocks.clientsClaim).toHaveBeenCalledOnce();
    expect(workerScope.skipWaiting).toHaveBeenCalledOnce();
  });

  it("answers the exact current handshake without touching vision cache state", async () => {
    const { listeners } = await loadWorker();

    const replies = await dispatchMessage(listeners.get("message")!, {
      type: "VISION_SW_HANDSHAKE",
      requestId: "handshake-4",
      protocol: VISION_SERVICE_WORKER_PROTOCOL,
    });

    expect(replies).toEqual([
      {
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: "handshake-4",
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      },
    ]);
    expect(mocks.queryVisionRelease).not.toHaveBeenCalled();
    expect(mocks.cacheVisionRelease).not.toHaveBeenCalled();
    expect(mocks.matchCompletedVisionAsset).not.toHaveBeenCalled();
  });

  it("replies CACHE_CACHING then CACHE_READY for explicit caching", async () => {
    const { listeners } = await loadWorker();
    const replies = await dispatchMessage(listeners.get("message")!, {
      type: "CACHE_RELEASE",
      ...base,
      manifestUrl: "/vision/release-manifest.json",
    });

    expect(replies).toEqual([
      { type: "CACHE_CACHING", ...base },
      { type: "CACHE_READY", ...base },
    ]);
    expect(mocks.cacheVisionRelease).toHaveBeenCalledOnce();
  });

  it("maps a release asset integrity exception to fatal cache recovery", async () => {
    mocks.cacheVisionRelease.mockRejectedValue(
      new VisionAssetError("runtime-integrity-failed", "notice"),
    );
    const { listeners } = await loadWorker();

    const replies = await dispatchMessage(listeners.get("message")!, {
      type: "CACHE_RELEASE",
      ...base,
      manifestUrl: "/vision/release-manifest.json",
    });

    expect(replies).toEqual([
      { type: "CACHE_CACHING", ...base },
      { type: "CACHE_ERROR", ...base, code: "runtime-integrity-failed" },
    ]);
  });

  it.each([
    ["ready", "CACHE_READY"],
    ["missing", "CACHE_MISSING"],
  ] as const)("maps a %s query to %s", async (result, type) => {
    mocks.queryVisionRelease.mockResolvedValue(result);
    const { listeners } = await loadWorker();

    const replies = await dispatchMessage(listeners.get("message")!, {
      type: "QUERY_RELEASE",
      ...base,
    });

    expect(replies).toEqual([{ type, ...base }]);
  });

  it("maps completed-cache corruption to a fatal bounded reply", async () => {
    mocks.queryVisionRelease.mockResolvedValue("integrity-failed");
    const { listeners } = await loadWorker();

    const replies = await dispatchMessage(listeners.get("message")!, {
      type: "QUERY_RELEASE",
      ...base,
    });

    expect(replies).toEqual([
      { type: "CACHE_ERROR", ...base, code: "runtime-integrity-failed" },
    ]);
  });

  it("cancels the requested generation and returns a bounded reply", async () => {
    const { listeners } = await loadWorker();

    const replies = await dispatchMessage(listeners.get("message")!, {
      type: "CANCEL_CACHE",
      ...base,
    });

    expect(mocks.cancelVisionRelease).toHaveBeenCalledWith(
      "client-a",
      4,
      releaseId,
    );
    expect(replies).toEqual([{ type: "CACHE_CANCELLED", ...base }]);
  });

  it("suppresses late replies from every duplicate active request after cancellation", async () => {
    const first = deferred<"ready">();
    const second = deferred<"ready">();
    mocks.cacheVisionRelease
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { listeners } = await loadWorker();
    const listener = listeners.get("message")!;
    const replies: VisionCacheEvent[] = [];
    const work: Promise<unknown>[] = [];
    const dispatch = (data: unknown) => {
      listener({
        data,
        source: {
          id: "client-a",
          postMessage: (event: VisionCacheEvent) => replies.push(event),
        },
        waitUntil: (promise: Promise<unknown>) => work.push(promise),
      } as never);
    };

    dispatch({
      type: "CACHE_RELEASE",
      ...base,
      requestId: "duplicate-one",
      manifestUrl: "/vision/release-manifest.json",
    });
    dispatch({
      type: "CACHE_RELEASE",
      ...base,
      requestId: "duplicate-two",
      manifestUrl: "/vision/release-manifest.json",
    });
    dispatch({ type: "CANCEL_CACHE", ...base, requestId: "cancel-both" });
    await work[2];
    first.resolve("ready");
    await work[0];
    second.reject(new Error("late private failure"));
    await work[1];

    expect(replies).toEqual([
      { type: "CACHE_CACHING", ...base, requestId: "duplicate-one" },
      { type: "CACHE_CACHING", ...base, requestId: "duplicate-two" },
      { type: "CACHE_CANCELLED", ...base, requestId: "cancel-both" },
    ]);
  });

  it("isolates same-generation cancellation to the source client", async () => {
    const first = deferred<"ready">();
    const second = deferred<"ready">();
    mocks.cacheVisionRelease
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { listeners } = await loadWorker();
    const listener = listeners.get("message")!;
    const clientAReplies: VisionCacheEvent[] = [];
    const clientBReplies: VisionCacheEvent[] = [];
    const work: Promise<unknown>[] = [];
    const dispatch = (
      clientId: string,
      replies: VisionCacheEvent[],
      data: unknown,
    ) => {
      listener({
        data,
        source: {
          id: clientId,
          postMessage: (event: VisionCacheEvent) => replies.push(event),
        },
        waitUntil: (promise: Promise<unknown>) => work.push(promise),
      } as never);
    };

    dispatch("client-a", clientAReplies, {
      type: "CACHE_RELEASE",
      ...base,
      requestId: "client-a-release",
      manifestUrl: "/vision/release-manifest.json",
    });
    dispatch("client-b", clientBReplies, {
      type: "CACHE_RELEASE",
      ...base,
      requestId: "client-b-release",
      manifestUrl: "/vision/release-manifest.json",
    });
    dispatch("client-a", clientAReplies, {
      type: "CANCEL_CACHE",
      ...base,
      requestId: "client-a-cancel",
    });
    await work[2];
    first.resolve("ready");
    second.resolve("ready");
    await Promise.all([work[0], work[1]]);

    expect(clientAReplies).toEqual([
      { type: "CACHE_CACHING", ...base, requestId: "client-a-release" },
      { type: "CACHE_CANCELLED", ...base, requestId: "client-a-cancel" },
    ]);
    expect(clientBReplies).toEqual([
      { type: "CACHE_CACHING", ...base, requestId: "client-b-release" },
      { type: "CACHE_READY", ...base, requestId: "client-b-release" },
    ]);
    expect(mocks.cacheVisionRelease).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ requestId: "client-a-release" }),
      "client-a",
      expect.anything(),
    );
    expect(mocks.cacheVisionRelease).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ requestId: "client-b-release" }),
      "client-b",
      expect.anything(),
    );
  });

  it("does not answer malformed messages", async () => {
    const { listeners } = await loadWorker();

    const replies = await dispatchMessage(listeners.get("message")!, {
      type: "QUERY_RELEASE",
      ...base,
      requestId: "../unbounded",
    });

    expect(replies).toEqual([]);
    expect(mocks.queryVisionRelease).not.toHaveBeenCalled();
  });

  it("serves allowlisted immutable assets only from completed release caches", async () => {
    const cached = new Response("cached");
    mocks.matchCompletedVisionAsset.mockResolvedValue(cached);
    const network = vi.fn(async () => new Response("network"));
    vi.stubGlobal("fetch", network);
    const { listeners } = await loadWorker();
    const path = VISION_MANIFEST.assets[0]!.path;
    let responsePromise: Promise<Response> | undefined;

    listeners.get("fetch")!({
      request: new Request(new URL(path, "https://app.test")),
      respondWith: (promise: Promise<Response>) => {
        responsePromise = promise;
      },
    } as never);

    await expect(responsePromise).resolves.toBe(cached);
    expect(network).not.toHaveBeenCalled();

    responsePromise = undefined;
    listeners.get("fetch")!({
      request: new Request("https://app.test/session/participant-42"),
      respondWith: (promise: Promise<Response>) => {
        responsePromise = promise;
      },
    } as never);
    expect(responsePromise).toBeUndefined();
  });

  it("never falls back to unverified network bytes for an immutable asset", async () => {
    const network = vi.fn(async () => new Response("unverified network"));
    vi.stubGlobal("fetch", network);
    const { listeners } = await loadWorker();
    const path = VISION_MANIFEST.assets[0]!.path;
    const request = new Request(new URL(path, "https://app.test"));
    let responsePromise!: Promise<Response>;

    listeners.get("fetch")!({
      request,
      respondWith: (promise: Promise<Response>) => {
        responsePromise = promise;
      },
    } as never);

    await expect(responsePromise).resolves.toMatchObject({ status: 503 });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    [
      "unknown immutable-prefix path",
      `${VISION_RELEASE_PATH_PREFIX}unknown.js`,
    ],
    [
      "query-bearing immutable path",
      `${VISION_MANIFEST.assets[0]!.path}?participant=private`,
    ],
  ])("returns 503 without network access for a %s", async (_case, path) => {
    const network = vi.fn(async () => new Response("unverified network"));
    vi.stubGlobal("fetch", network);
    const { listeners } = await loadWorker();
    let responsePromise: Promise<Response> | undefined;

    listeners.get("fetch")!({
      request: new Request(new URL(path, "https://app.test")),
      respondWith: (promise: Promise<Response>) => {
        responsePromise = promise;
      },
    } as never);

    expect(responsePromise).toBeDefined();
    await expect(responsePromise).resolves.toMatchObject({ status: 503 });
    expect(network).not.toHaveBeenCalled();
    expect(mocks.matchCompletedVisionAsset).not.toHaveBeenCalled();
  });

  it("returns bounded empty bytes when an immutable cache entry fails integrity", async () => {
    mocks.matchCompletedVisionAsset.mockRejectedValue(
      Object.assign(new Error("private cache bytes"), {
        code: "runtime-integrity-failed",
      }),
    );
    const network = vi.fn(async () => new Response("unverified network"));
    vi.stubGlobal("fetch", network);
    const { listeners } = await loadWorker();
    const path = VISION_MANIFEST.assets[0]!.path;
    let responsePromise!: Promise<Response>;

    listeners.get("fetch")!({
      request: new Request(new URL(path, "https://app.test")),
      respondWith: (promise: Promise<Response>) => {
        responsePromise = promise;
      },
    } as never);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(network).not.toHaveBeenCalled();
  });
});
