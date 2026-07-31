import { beforeEach, describe, expect, it, vi } from "vitest";
import { VISION_MANIFEST } from "../vision/release";
import type { VisionCacheEvent } from "../vision/protocol";

const mocks = vi.hoisted(() => ({
  cacheVisionRelease: vi.fn(),
  cancelVisionRelease: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
  matchCompletedVisionAsset: vi.fn(),
  precacheAndRoute: vi.fn(),
  queryVisionRelease: vi.fn(),
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
  };
  vi.stubGlobal("self", workerScope);
  await import("./sw");
  return { listeners, workerScope };
}

async function dispatchMessage(
  listener: Listener,
  data: unknown,
): Promise<VisionCacheEvent[]> {
  const replies: VisionCacheEvent[] = [];
  let work: Promise<unknown> | undefined;
  listener({
    data,
    source: { postMessage: (event: VisionCacheEvent) => replies.push(event) },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise;
    },
  } as never);
  await work;
  return replies;
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

  it("cancels the requested generation and returns a bounded reply", async () => {
    const { listeners } = await loadWorker();

    const replies = await dispatchMessage(listeners.get("message")!, {
      type: "CANCEL_CACHE",
      ...base,
    });

    expect(mocks.cancelVisionRelease).toHaveBeenCalledWith(4);
    expect(mocks.cancelVisionRelease).not.toHaveBeenCalledWith(3);
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

  it("uses a same-origin no-store network fallback for a missing asset", async () => {
    const networkResponse = new Response("network");
    const network = vi.fn(async () => networkResponse);
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

    await expect(responsePromise).resolves.toBe(networkResponse);
    expect(network).toHaveBeenCalledWith(request, {
      cache: "no-store",
      credentials: "same-origin",
    });
  });
});
