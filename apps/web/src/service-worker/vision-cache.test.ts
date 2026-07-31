import { describe, expect, it, vi } from "vitest";
import type { VisionAsset, VisionReleaseManifest } from "../vision/manifest";
import {
  cacheVisionRelease,
  cancelVisionRelease,
  completionUrl,
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

class MemoryCache implements CacheLike {
  readonly entries = new Map<string, Response>();

  constructor(
    private readonly operations: string[],
    private readonly failReadbackFor?: string,
  ) {}

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
        return Response.json(releaseManifest);
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
          "x-session-id": "private",
        },
      });
    },
  );
  const verifyResponse: VisionCacheDependencies["verifyResponse"] = vi.fn(
    async (response, expectedAsset) => {
      operations.push(`verify:${expectedAsset.id}`);
      if (
        !response.ok ||
        expectedAsset.path === options?.verificationFailureFor
      ) {
        throw new Error("verification failed");
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  );
  return {
    cacheStorage,
    dependencies: {
      cacheStorage,
      fetch,
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
) {
  const cache = await storage.open(visionCacheName(completedReleaseId));
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

    await expect(cacheVisionRelease(command(), dependencies)).resolves.toBe(
      "ready",
    );

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

    await cacheVisionRelease(command(), dependencies);

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
        cacheVisionRelease(command(), dependencies),
      ).rejects.toThrow();

      expect(cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
      expect(cacheStorage.caches.has(visionCacheName(olderReleaseId))).toBe(
        true,
      );
    },
  );

  it("cancels only the matching generation and removes its incomplete cache", async () => {
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

    const pending = cacheVisionRelease(command(7), matching.dependencies);
    await started;
    cancelVisionRelease(6);
    expect(matching.cacheStorage.deleted).toEqual([]);
    cancelVisionRelease(7);

    await expect(pending).rejects.toThrow();
    expect(matching.cacheStorage.deleted).toEqual([visionCacheName(releaseId)]);
    expect(other.cacheStorage.deleted).toEqual([]);
  });

  it("recognizes only an exact matching completion record", async () => {
    const { cacheStorage, dependencies, fetch, operations } = harness();
    const cache = await seedCompletion(cacheStorage, releaseId);
    operations.length = 0;

    await expect(queryVisionRelease(releaseId, dependencies)).resolves.toBe(
      "ready",
    );
    await expect(cacheVisionRelease(command(), dependencies)).resolves.toBe(
      "ready",
    );
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
      "missing",
    );
  });

  it("stores no upstream participant/session headers or non-cache data", async () => {
    const { cacheStorage, dependencies } = harness();

    await cacheVisionRelease(command(), dependencies);

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
