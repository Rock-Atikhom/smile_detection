import { describe, expect, it, vi } from "vitest";
import {
  VisionAssetError,
  VisionAssetOperationalError,
} from "../vision/integrity";
import type { VisionAsset, VisionReleaseManifest } from "../vision/manifest";
import {
  cacheVisionRelease,
  cancelVisionRelease,
  completionUrl,
  matchCompletedVisionAsset,
  queryVisionRelease,
  visionCacheName,
  type CacheLike,
  type CacheStorageLike,
  type VisionCacheDependencies,
} from "./vision-cache";

const releaseId = "0123456789abcdef";
const olderReleaseId = "fedcba9876543210";
const manifestUrl = "/vision/release-manifest.json";
const scope = "https://app.test/";
const ownerId = "client-a";
const bytesByPath = new Map<string, Uint8Array>();

function asset(
  id: VisionAsset["id"],
  role: VisionAsset["role"],
  path: string,
  bytes: Uint8Array,
): VisionAsset {
  bytesByPath.set(path, bytes);
  return {
    bytes: bytes.byteLength,
    id,
    licenseRef:
      "/vision/mediapipe-0.10.35-face-landmarker-float16-v1/LICENSE.txt",
    path,
    requiredForOffline: true,
    role,
    sha256: "0".repeat(64),
    source: `https://example.test/${id}`,
    version: "0.10.35",
  };
}

const firstAsset = asset(
  "license",
  "license",
  "/vision/mediapipe-0.10.35-face-landmarker-float16-v1/a-license.txt",
  new TextEncoder().encode("license"),
);
const secondAsset = asset(
  "notice",
  "notice",
  "/vision/mediapipe-0.10.35-face-landmarker-float16-v1/b-notice.txt",
  new TextEncoder().encode("notice"),
);

function manifest(assets: VisionAsset[] = [firstAsset]): VisionReleaseManifest {
  return {
    schemaVersion: 1,
    releaseId,
    runtimeVersion: "0.10.35",
    modelVersion: "float16/1",
    assets,
  };
}

function requestKey(request: RequestInfo | URL): string {
  if (typeof request === "string") return request;
  if (request instanceof URL) return request.href;
  return request.url;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

class MemoryCache implements CacheLike {
  readonly entries = new Map<string, Response>();

  constructor(
    private readonly operations: string[],
    private readonly failReadbackFor?: string,
  ) {}

  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(requestKey(request));
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const key = requestKey(request);
    if (key.startsWith("/vision/")) {
      this.operations.push(`readback:${key}`);
    }
    if (key === this.failReadbackFor) return undefined;
    return this.entries.get(key)?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const key = requestKey(request);
    this.operations.push(
      key.includes("/__smart-smile/vision-complete/")
        ? `put-completion:${key.split("/").at(-1)}`
        : `put:${key}`,
    );
    this.entries.set(key, response.clone());
  }
}

class MemoryCacheStorage implements CacheStorageLike {
  readonly caches = new Map<string, MemoryCache>();
  readonly deleted: string[] = [];

  constructor(
    private readonly operations: string[],
    private readonly failReadbackFor?: string,
  ) {}

  async delete(cacheName: string): Promise<boolean> {
    this.deleted.push(cacheName);
    return this.caches.delete(cacheName);
  }

  async open(cacheName: string): Promise<MemoryCache> {
    this.operations.push(`open:${cacheName}`);
    let cache = this.caches.get(cacheName);
    if (cache === undefined) {
      cache = new MemoryCache(this.operations, this.failReadbackFor);
      this.caches.set(cacheName, cache);
    }
    return cache;
  }
}

function harness(options?: {
  assets?: VisionAsset[];
  downloadedManifest?: VisionReleaseManifest;
  failFetchFor?: string;
  failReadbackFor?: string;
  verificationFailureFor?: string;
}) {
  const operations: string[] = [];
  const cacheStorage = new MemoryCacheStorage(
    operations,
    options?.failReadbackFor,
  );
  const releaseManifest = manifest(options?.assets);
  const fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const path = requestKey(input);
      if (path === manifestUrl) {
        expect(init).toMatchObject({
          cache: "no-store",
          credentials: "same-origin",
        });
        return Response.json(options?.downloadedManifest ?? releaseManifest);
      }
      operations.push(`fetch:${path}`);
      expect(init).toMatchObject({
        cache: "no-store",
        credentials: "same-origin",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      if (path === options?.failFetchFor) {
        return new Response(null, { status: 503 });
      }
      const responseBytes = bytesByPath.get(path)!;
      const body = new Uint8Array(responseBytes.byteLength);
      body.set(responseBytes);
      return new Response(body.buffer, {
        headers: {
          "content-type": "application/octet-stream",
          "set-cookie": "participant=private",
          "x-test-upstream": "yes",
          "x-session-id": "private",
        },
      });
    },
  );
  const verifyResponse: VisionCacheDependencies["verifyResponse"] = vi.fn(
    async (response, expectedAsset) => {
      if (response.headers.get("x-test-upstream") === "yes") {
        operations.push(`verify:${expectedAsset.id}`);
      }
      if (
        !response.ok ||
        expectedAsset.path === options?.verificationFailureFor
      ) {
        throw new VisionAssetError(
          "runtime-integrity-failed",
          expectedAsset.id,
        );
      }
      const actual = new Uint8Array(await response.arrayBuffer());
      const expected = bytesByPath.get(expectedAsset.path)!;
      if (
        actual.byteLength !== expected.byteLength ||
        actual.some((byte, index) => byte !== expected[index])
      ) {
        throw new VisionAssetError(
          "runtime-integrity-failed",
          expectedAsset.id,
        );
      }
      return actual;
    },
  );
  return {
    cacheStorage,
    dependencies: {
      cacheStorage,
      fetch,
      manifest: releaseManifest,
      scope,
      verifyResponse,
    } satisfies VisionCacheDependencies,
    fetch,
    operations,
  };
}

function command(generation = 4) {
  return {
    type: "CACHE_RELEASE",
    requestId: "cache-4",
    generation,
    manifestUrl,
    releaseId,
  } as const;
}

async function seedCompletion(
  storage: MemoryCacheStorage,
  completedReleaseId: string,
  assetCount = 1,
  cachedAssets: VisionAsset[] = [],
) {
  const cache = await storage.open(visionCacheName(completedReleaseId));
  for (const expectedAsset of cachedAssets) {
    const bytes = bytesByPath.get(expectedAsset.path)!;
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    cache.entries.set(expectedAsset.path, new Response(body.buffer));
  }
  await cache.put(
    completionUrl(scope, completedReleaseId),
    Response.json({
      schemaVersion: 1,
      releaseId: completedReleaseId,
      assetCount,
    }),
  );
  return cache;
}

describe("vision release cache transaction", () => {
  it("writes verified bytes, reads them back, and commits completion last", async () => {
    const { dependencies, operations } = harness();

    await expect(
      cacheVisionRelease(command(), ownerId, dependencies),
    ).resolves.toBe("ready");

    expect(operations).toEqual([
      "open:smart-smile-vision-" + releaseId,
      "fetch:" + firstAsset.path,
      "verify:" + firstAsset.id,
      "put:" + firstAsset.path,
      "readback:" + firstAsset.path,
      "put-completion:" + releaseId,
    ]);
  });

  it("puts the completion marker after every asset readback", async () => {
    const { dependencies, operations } = harness({
      assets: [firstAsset, secondAsset],
    });

    await cacheVisionRelease(command(), ownerId, dependencies);

    expect(operations.at(-1)).toBe(`put-completion:${releaseId}`);
    expect(
      operations.filter((operation) => operation.startsWith("readback:")),
    ).toEqual([`readback:${firstAsset.path}`, `readback:${secondAsset.path}`]);
  });

  it.each([
    ["byte mismatch", { verificationFailureFor: firstAsset.path }],
    ["failed fetch", { failFetchFor: firstAsset.path }],
    ["failed readback", { failReadbackFor: firstAsset.path }],
  ])(
    "deletes only its incomplete current cache after %s",
    async (_case, options) => {
      const { cacheStorage, dependencies } = harness(options);
      await seedCompletion(cacheStorage, olderReleaseId);

      await expect(
        cacheVisionRelease(command(), ownerId, dependencies),
      ).rejects.toThrow();

      expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
      expect(cacheStorage.caches.has(visionCacheName(olderReleaseId))).toBe(
        true,
      );
    },
  );

  it("cancels only the matching owner, generation, and release transaction", async () => {
    const matching = harness();
    const other = harness();
    let releaseFetchStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      releaseFetchStarted = resolve;
    });
    matching.dependencies.fetch = vi.fn(async (input, init) => {
      const path = requestKey(input);
      if (path === manifestUrl) return Response.json(manifest());
      releaseFetchStarted();
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    });

    const pending = cacheVisionRelease(
      command(7),
      ownerId,
      matching.dependencies,
    );
    await started;
    const otherPending = cacheVisionRelease(
      command(7),
      "client-b",
      other.dependencies,
    );
    cancelVisionRelease(ownerId, 6, releaseId);
    expect(matching.cacheStorage.deleted).toEqual([]);
    cancelVisionRelease(ownerId, 7, releaseId);

    await expect(pending).rejects.toThrow();
    await expect(otherPending).resolves.toBe("ready");
    expect(matching.cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
    expect(other.cacheStorage.deleted).toEqual([]);
  });

  it("cannot commit when cancelled during required-inventory readback verification", async () => {
    const { cacheStorage, dependencies, operations } = harness();
    await seedCompletion(cacheStorage, olderReleaseId);
    operations.length = 0;
    const originalVerify = dependencies.verifyResponse!;
    const readbackStarted = deferred<void>();
    const releaseReadback = deferred<void>();
    let verificationCalls = 0;
    dependencies.verifyResponse = vi.fn(async (response, expectedAsset) => {
      verificationCalls += 1;
      if (verificationCalls === 2) {
        readbackStarted.resolve();
        await releaseReadback.promise;
      }
      return originalVerify(response, expectedAsset);
    });

    const pending = cacheVisionRelease(command(8), ownerId, dependencies);
    await readbackStarted.promise;
    const incomplete = cacheStorage.caches.get(visionCacheName(releaseId))!;
    cancelVisionRelease(ownerId, 8, releaseId);
    releaseReadback.resolve();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(operations).not.toContain(`put-completion:${releaseId}`);
    expect(incomplete.entries.has(completionUrl(scope, releaseId))).toBe(false);
    expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
    expect(cacheStorage.caches.has(visionCacheName(olderReleaseId))).toBe(true);
  });

  it("cannot commit when cancelled while the completion-marker write is pending", async () => {
    const { cacheStorage, dependencies } = harness();
    await seedCompletion(cacheStorage, olderReleaseId);
    const currentCache = await cacheStorage.open(visionCacheName(releaseId));
    const originalPut = currentCache.put.bind(currentCache);
    const markerWriteStarted = deferred<void>();
    const releaseMarkerWrite = deferred<void>();
    currentCache.put = vi.fn(async (request, response) => {
      await originalPut(request, response);
      if (requestKey(request) === completionUrl(scope, releaseId)) {
        markerWriteStarted.resolve();
        await releaseMarkerWrite.promise;
      }
    });

    const pending = cacheVisionRelease(command(9), ownerId, dependencies);
    await markerWriteStarted.promise;
    cancelVisionRelease(ownerId, 9, releaseId);
    releaseMarkerWrite.resolve();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cacheStorage.caches.has(visionCacheName(releaseId))).toBe(false);
    expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
    expect(cacheStorage.caches.has(visionCacheName(olderReleaseId))).toBe(true);
  });

  it("serializes overlapping generations so one failure cannot orphan its successor", async () => {
    const { cacheStorage, dependencies } = harness();
    const originalFetch = dependencies.fetch;
    const firstAssetFetch = deferred<Response>();
    const firstStarted = deferred<void>();
    let assetFetches = 0;
    dependencies.fetch = vi.fn(async (input, init) => {
      if (requestKey(input) === manifestUrl) return originalFetch(input, init);
      assetFetches += 1;
      if (assetFetches === 1) {
        firstStarted.resolve();
        return firstAssetFetch.promise;
      }
      return originalFetch(input, init);
    });

    const failing = cacheVisionRelease(command(10), ownerId, dependencies);
    await firstStarted.promise;
    const succeeding = cacheVisionRelease(command(11), ownerId, dependencies);
    await Promise.resolve();
    await Promise.resolve();

    expect(assetFetches).toBe(1);
    cancelVisionRelease(ownerId, 10, releaseId);
    firstAssetFetch.reject(new DOMException("cancelled", "AbortError"));

    await expect(failing).rejects.toThrow();
    await expect(succeeding).resolves.toBe("ready");
    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );
    expect(cacheStorage.caches.has(visionCacheName(releaseId))).toBe(true);
  });

  it("a queued cancelled generation cannot delete a completed cache", async () => {
    const { cacheStorage, dependencies } = harness();
    const originalFetch = dependencies.fetch;
    const firstAssetFetch = deferred<Response>();
    const firstStarted = deferred<void>();
    dependencies.fetch = vi.fn(async (input, init) => {
      if (requestKey(input) === manifestUrl) return originalFetch(input, init);
      firstStarted.resolve();
      return firstAssetFetch.promise;
    });

    const completing = cacheVisionRelease(command(20), ownerId, dependencies);
    await firstStarted.promise;
    const cancelled = cacheVisionRelease(command(21), ownerId, dependencies);
    cancelVisionRelease(ownerId, 21, releaseId);
    const bytes = bytesByPath.get(firstAsset.path)!;
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    firstAssetFetch.resolve(
      new Response(body.buffer, { headers: { "x-test-upstream": "yes" } }),
    );

    await expect(completing).resolves.toBe("ready");
    await expect(cancelled).rejects.toThrow();
    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );
    expect(cacheStorage.deleted).toEqual([]);
  });

  it("recognizes only a matching marker backed by every verified required entry", async () => {
    const { cacheStorage, dependencies, fetch, operations } = harness();
    const cache = await seedCompletion(cacheStorage, releaseId, 1, [
      firstAsset,
    ]);
    operations.length = 0;

    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );
    await expect(
      cacheVisionRelease(command(), ownerId, dependencies),
    ).resolves.toBe("ready");
    expect(fetch).not.toHaveBeenCalled();

    cache.entries.set(
      completionUrl(scope, releaseId),
      Response.json({
        schemaVersion: 1,
        releaseId: olderReleaseId,
        assetCount: 1,
      }),
    );
    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "integrity-failed",
    );
    expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
  });

  it("keeps a genuinely absent completion marker distinct from corruption", async () => {
    const { cacheStorage, dependencies } = harness();

    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "missing",
    );

    expect(cacheStorage.deleted).toEqual([]);
  });

  it("preserves a completed release when cache reads fail operationally", async () => {
    const { cacheStorage, dependencies } = harness();
    const cache = await seedCompletion(cacheStorage, releaseId, 1, [
      firstAsset,
    ]);
    const originalMatch = cache.match.bind(cache);
    cache.match = vi.fn(async (request) => {
      if (requestKey(request) === completionUrl(scope, releaseId)) {
        throw new Error("private cache backend failure");
      }
      return originalMatch(request);
    });
    const pending = queryVisionRelease(releaseId, dependencies);

    await expect(pending).rejects.toMatchObject({
      code: "offline-cache-failed",
    });
    await expect(pending).rejects.not.toThrow("private cache backend failure");
    expect(cacheStorage.deleted).toEqual([]);
    expect(cacheStorage.caches.has(visionCacheName(releaseId))).toBe(true);
  });

  it("preserves a completed release when verification fails operationally", async () => {
    const { cacheStorage, dependencies } = harness();
    await seedCompletion(cacheStorage, releaseId, 1, [firstAsset]);
    dependencies.verifyResponse = vi.fn(async (_response, expectedAsset) => {
      throw new VisionAssetOperationalError(expectedAsset.id);
    });
    const pending = queryVisionRelease(releaseId, dependencies);

    await expect(pending).rejects.toMatchObject({
      code: "offline-cache-failed",
    });
    expect(cacheStorage.deleted).toEqual([]);
    expect(cacheStorage.caches.has(visionCacheName(releaseId))).toBe(true);
  });

  it("preserves trusted release data when a target response fails operationally", async () => {
    const { cacheStorage, dependencies } = harness();
    await seedCompletion(cacheStorage, releaseId, 1, [firstAsset]);
    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );
    dependencies.verifyResponse = vi.fn(async (_response, expectedAsset) => {
      throw new VisionAssetOperationalError(expectedAsset.id);
    });
    const pending = matchCompletedVisionAsset(
      firstAsset.path,
      releaseId,
      dependencies,
    );

    await expect(pending).rejects.toMatchObject({
      code: "offline-cache-failed",
    });
    expect(cacheStorage.deleted).toEqual([]);
    expect(cacheStorage.caches.has(visionCacheName(releaseId))).toBe(true);
  });

  it("deletes and reports a completed release with a corrupt non-runtime asset", async () => {
    const optionalNotice = {
      ...secondAsset,
      requiredForOffline: false,
    };
    const { cacheStorage, dependencies } = harness({
      assets: [firstAsset, optionalNotice],
    });
    const cache = await seedCompletion(cacheStorage, releaseId, 1, [
      firstAsset,
      optionalNotice,
    ]);
    cache.entries.set(optionalNotice.path, new Response("corrupt"));

    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "integrity-failed",
    );

    expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
    expect(cacheStorage.caches.has(visionCacheName(releaseId))).toBe(false);
  });

  it.each([
    ["marker only", [firstAsset], 1, []],
    ["wrong asset count", [firstAsset], 2, [firstAsset]],
    ["missing required entry", [firstAsset, secondAsset], 2, [firstAsset]],
    ["corrupt required entry", [firstAsset], 1, [firstAsset]],
  ] as const)(
    "treats a %s completion as fatal corruption without silent repair",
    async (condition, configuredAssets, assetCount, cachedAssets) => {
      const { cacheStorage, dependencies, fetch } = harness({
        assets: [...configuredAssets],
      });
      const cache = await seedCompletion(cacheStorage, releaseId, assetCount, [
        ...cachedAssets,
      ]);
      if (condition === "corrupt required entry") {
        cache.entries.set(firstAsset.path, new Response("corrupt"));
      }

      await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
        "integrity-failed",
      );
      expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("shares one completed-inventory verification while checking every immutable serve target", async () => {
    const { cacheStorage, dependencies } = harness({
      assets: [firstAsset, secondAsset],
    });
    await seedCompletion(cacheStorage, releaseId, 2, [firstAsset, secondAsset]);
    const originalVerify = dependencies.verifyResponse!;
    const firstVerificationStarted = deferred<void>();
    const releaseFirstVerification = deferred<void>();
    let firstCall = true;
    const verification = vi.fn(async (response, expectedAsset) => {
      if (firstCall) {
        firstCall = false;
        firstVerificationStarted.resolve();
        await releaseFirstVerification.promise;
      }
      return originalVerify(response, expectedAsset);
    });
    dependencies.verifyResponse = verification;

    const firstQuery = queryVisionRelease(releaseId, dependencies);
    const secondQuery = queryVisionRelease(releaseId, dependencies);
    const firstMatch = matchCompletedVisionAsset(
      firstAsset.path,
      releaseId,
      dependencies,
    );
    const secondMatch = matchCompletedVisionAsset(
      firstAsset.path,
      releaseId,
      dependencies,
    );
    await firstVerificationStarted.promise;
    releaseFirstVerification.resolve();

    const [firstState, secondState, firstResponse, secondResponse] =
      await Promise.all([firstQuery, secondQuery, firstMatch, secondMatch]);
    expect([firstState, secondState]).toEqual(["ready", "ready"]);
    await expect(firstResponse?.text()).resolves.toBe("license");
    await expect(secondResponse?.text()).resolves.toBe("license");
    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );
    const thirdResponse = await matchCompletedVisionAsset(
      firstAsset.path,
      releaseId,
      dependencies,
    );
    await expect(thirdResponse?.text()).resolves.toBe("license");

    const verifiedAssets = verification.mock.calls.map(
      ([, expectedAsset]) => expectedAsset.id,
    );
    expect(verifiedAssets.filter((id) => id === firstAsset.id)).toHaveLength(4);
    expect(verifiedAssets.filter((id) => id === secondAsset.id)).toHaveLength(
      1,
    );
  });

  it("advances failed trust before a delayed concurrent reader can rescan", async () => {
    const { cacheStorage, dependencies, fetch } = harness();
    const cache = await seedCompletion(cacheStorage, releaseId, 1, [
      firstAsset,
    ]);
    const originalMatch = cache.match.bind(cache);
    const secondCompletionReadStarted = deferred<void>();
    const releaseSecondCompletionRead = deferred<{
      schemaVersion: 1;
      releaseId: string;
      assetCount: number;
    }>();
    const delayedCompletionResponse = Response.json({
      schemaVersion: 1,
      releaseId,
      assetCount: 1,
    });
    vi.spyOn(delayedCompletionResponse, "json").mockImplementation(() => {
      secondCompletionReadStarted.resolve();
      return releaseSecondCompletionRead.promise;
    });
    let completionReads = 0;
    cache.match = vi.fn((request) => {
      if (requestKey(request) === completionUrl(scope, releaseId)) {
        completionReads += 1;
        if (completionReads === 2) {
          return Promise.resolve(delayedCompletionResponse);
        }
      }
      return originalMatch(request);
    });
    const firstVerificationStarted = deferred<void>();
    const verificationFailure = deferred<Uint8Array>();
    const verification = vi.fn(() => {
      firstVerificationStarted.resolve();
      void verificationFailure.promise.catch(() =>
        releaseSecondCompletionRead.resolve({
          schemaVersion: 1,
          releaseId,
          assetCount: 1,
        }),
      );
      return verificationFailure.promise;
    });
    dependencies.verifyResponse = verification;

    const firstQuery = queryVisionRelease(releaseId, dependencies);
    await firstVerificationStarted.promise;
    const delayedQuery = queryVisionRelease(releaseId, dependencies);
    await secondCompletionReadStarted.promise;
    verificationFailure.reject(
      new VisionAssetError("runtime-integrity-failed", firstAsset.id),
    );
    await Promise.allSettled([firstQuery, delayedQuery]);

    expect(verification).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("starts one fresh full scan after explicit population takes cache ownership", async () => {
    const { cacheStorage, dependencies, fetch } = harness({
      assets: [firstAsset, secondAsset],
    });
    await seedCompletion(cacheStorage, releaseId, 2, [firstAsset, secondAsset]);
    const verification = vi.mocked(dependencies.verifyResponse!);

    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );
    expect(verification).toHaveBeenCalledTimes(2);

    await expect(
      cacheVisionRelease(command(), ownerId, dependencies),
    ).resolves.toBe("ready");
    expect(verification).toHaveBeenCalledTimes(4);
    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );

    expect(verification).toHaveBeenCalledTimes(4);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("invalidates trust before target-corruption cleanup and scans the replacement generation", async () => {
    const { cacheStorage, dependencies, fetch } = harness({
      assets: [firstAsset, secondAsset],
    });
    const cache = await seedCompletion(cacheStorage, releaseId, 2, [
      firstAsset,
      secondAsset,
    ]);
    const verification = vi.mocked(dependencies.verifyResponse!);
    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );
    cache.entries.set(firstAsset.path, new Response("corrupt"));

    await expect(
      matchCompletedVisionAsset(firstAsset.path, releaseId, dependencies),
    ).rejects.toMatchObject({ code: "runtime-integrity-failed" });
    expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
    await seedCompletion(cacheStorage, releaseId, 2, [firstAsset, secondAsset]);
    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );

    expect(verification).toHaveBeenCalledTimes(5);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves an immutable entry only when the full completed inventory verifies", async () => {
    const { cacheStorage, dependencies } = harness({
      assets: [firstAsset, secondAsset],
    });
    await seedCompletion(cacheStorage, releaseId, 2, [firstAsset]);

    await expect(
      matchCompletedVisionAsset(firstAsset.path, releaseId, dependencies),
    ).rejects.toMatchObject({ code: "runtime-integrity-failed" });
    expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);

    const complete = harness({ assets: [firstAsset, secondAsset] });
    const completeCache = await seedCompletion(
      complete.cacheStorage,
      releaseId,
      2,
      [firstAsset, secondAsset],
    );
    const secondBytes = bytesByPath.get(secondAsset.path)!;
    const secondBody = new Uint8Array(secondBytes.byteLength);
    secondBody.set(secondBytes);
    completeCache.entries.set(
      secondAsset.path,
      new Response(secondBody.buffer),
    );
    const response = await matchCompletedVisionAsset(
      firstAsset.path,
      releaseId,
      complete.dependencies,
    );
    await expect(response?.text()).resolves.toBe("license");
  });

  it("rejects an altered inventory that reuses the configured release ID", async () => {
    const alteredAsset = {
      ...firstAsset,
      source: "https://altered.example.test/license",
    };
    const { cacheStorage, dependencies } = harness({
      downloadedManifest: manifest([alteredAsset]),
    });

    await expect(
      cacheVisionRelease(command(), ownerId, dependencies),
    ).rejects.toMatchObject({ code: "runtime-integrity-failed" });
    expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
  });

  it("reports manifest response-read failures as operational", async () => {
    const { cacheStorage, dependencies } = harness();
    const originalFetch = dependencies.fetch;
    dependencies.fetch = vi.fn(async (input, init) => {
      const response = await originalFetch(input, init);
      if (requestKey(input) === manifestUrl) {
        vi.spyOn(response, "json").mockRejectedValue(
          new Error("private manifest response failure"),
        );
      }
      return response;
    });
    const pending = cacheVisionRelease(command(), ownerId, dependencies);

    await expect(pending).rejects.toMatchObject({
      code: "offline-cache-failed",
    });
    await expect(pending).rejects.not.toThrow(
      "private manifest response failure",
    );
    expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
  });

  it("stores no upstream participant/session headers or non-cache data", async () => {
    const { cacheStorage, dependencies } = harness();

    await cacheVisionRelease(command(), ownerId, dependencies);

    const cache = cacheStorage.caches.get(visionCacheName(releaseId));
    const stored = await cache?.match(firstAsset.path);
    expect(stored?.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(stored?.headers.get("set-cookie")).toBeNull();
    expect(stored?.headers.get("x-session-id")).toBeNull();
    expect(JSON.stringify([...cacheStorage.caches.keys()])).not.toContain(
      "participant",
    );
  });
});
