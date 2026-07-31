import { verifyVisionResponse } from "../vision/integrity";
import {
  parseVisionManifest,
  type VisionAsset,
  type VisionReleaseManifest,
} from "../vision/manifest";
import type { VisionCacheCommand } from "../vision/protocol";

export const visionCacheName = (releaseId: string) =>
  `smart-smile-vision-${releaseId}`;
export const completionUrl = (scope: string, releaseId: string) =>
  new URL(`__smart-smile/vision-complete/${releaseId}`, scope).href;
export type CompletionRecord = {
  schemaVersion: 1;
  releaseId: string;
  assetCount: number;
};

export interface CacheLike {
  delete(request: RequestInfo | URL): Promise<boolean>;
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
}

export interface CacheStorageLike {
  delete(cacheName: string): Promise<boolean>;
  open(cacheName: string): Promise<CacheLike>;
}

export interface VisionCacheDependencies {
  cacheStorage: CacheStorageLike;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  manifest: VisionReleaseManifest;
  scope: string;
  verifyResponse?: typeof verifyVisionResponse;
}

type CacheReleaseCommand = Extract<
  VisionCacheCommand,
  { type: "CACHE_RELEASE" }
>;

const activeControllers = new Map<number, Set<AbortController>>();
const releaseLocks = new Map<string, Promise<void>>();
const SAFE_RESPONSE_HEADERS = ["content-type", "content-language"] as const;

function isCompletionRecord(
  value: unknown,
  releaseId: string,
  assetCount: number,
): value is CompletionRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 3 ||
    !keys.every(
      (key) =>
        typeof key === "string" &&
        ["schemaVersion", "releaseId", "assetCount"].includes(key),
    )
  ) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    record.releaseId === releaseId &&
    typeof record.assetCount === "number" &&
    record.assetCount === assetCount
  );
}

async function readCompletion(
  cache: CacheLike,
  dependencies: VisionCacheDependencies,
): Promise<CompletionRecord | undefined> {
  const requiredAssetCount = dependencies.manifest.assets.filter(
    (asset) => asset.requiredForOffline,
  ).length;
  const response = await cache.match(
    completionUrl(dependencies.scope, dependencies.manifest.releaseId),
  );
  if (response === undefined || !response.ok) return undefined;
  try {
    const value: unknown = await response.json();
    return isCompletionRecord(
      value,
      dependencies.manifest.releaseId,
      requiredAssetCount,
    )
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function sameManifest(
  actual: VisionReleaseManifest,
  configured: VisionReleaseManifest,
): boolean {
  if (
    actual.schemaVersion !== configured.schemaVersion ||
    actual.releaseId !== configured.releaseId ||
    actual.runtimeVersion !== configured.runtimeVersion ||
    actual.modelVersion !== configured.modelVersion ||
    actual.assets.length !== configured.assets.length
  ) {
    return false;
  }
  return actual.assets.every((asset, index) => {
    const expected = configured.assets[index];
    return (
      expected !== undefined &&
      asset.bytes === expected.bytes &&
      asset.id === expected.id &&
      asset.licenseRef === expected.licenseRef &&
      asset.path === expected.path &&
      asset.requiredForOffline === expected.requiredForOffline &&
      asset.role === expected.role &&
      asset.sha256 === expected.sha256 &&
      asset.source === expected.source &&
      asset.version === expected.version
    );
  });
}

function fetchOptions(signal: AbortSignal): RequestInit {
  return { cache: "no-store", credentials: "same-origin", signal };
}

function safeHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = upstream.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

function ensureNotCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("The operation was aborted", "AbortError");
  }
}

function addController(generation: number, controller: AbortController): void {
  const controllers = activeControllers.get(generation) ?? new Set();
  controllers.add(controller);
  activeControllers.set(generation, controllers);
}

function removeController(
  generation: number,
  controller: AbortController,
): void {
  const controllers = activeControllers.get(generation);
  controllers?.delete(controller);
  if (controllers?.size === 0) activeControllers.delete(generation);
}

function acquireReleaseLock(releaseId: string): {
  release(): void;
  wait: Promise<void>;
} {
  const wait = (releaseLocks.get(releaseId) ?? Promise.resolve()).catch(
    () => undefined,
  );
  let unlock!: () => void;
  const held = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const tail = wait.then(() => held);
  releaseLocks.set(releaseId, tail);
  return {
    release() {
      unlock();
      if (releaseLocks.get(releaseId) === tail) releaseLocks.delete(releaseId);
    },
    wait,
  };
}

async function fetchManifest(
  command: CacheReleaseCommand,
  dependencies: VisionCacheDependencies,
  signal: AbortSignal,
) {
  const response = await dependencies.fetch(
    command.manifestUrl,
    fetchOptions(signal),
  );
  if (!response.ok) throw new Error("Vision manifest download failed");
  const parsed = parseVisionManifest(await response.json());
  if (
    parsed.releaseId !== command.releaseId ||
    !sameManifest(parsed, dependencies.manifest)
  ) {
    throw new Error("Vision manifest inventory mismatch");
  }
  return parsed;
}

async function requiredEntriesAreVerified(
  cache: CacheLike,
  dependencies: VisionCacheDependencies,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    for (const asset of dependencies.manifest.assets) {
      if (!asset.requiredForOffline) continue;
      if (signal !== undefined) ensureNotCancelled(signal);
      const cached = await cache.match(asset.path);
      if (signal !== undefined) ensureNotCancelled(signal);
      if (cached === undefined) return false;
      await (dependencies.verifyResponse ?? verifyVisionResponse)(
        cached,
        asset,
      );
      if (signal !== undefined) ensureNotCancelled(signal);
    }
    return true;
  } catch {
    if (signal?.aborted === true) ensureNotCancelled(signal);
    return false;
  }
}

async function completedCacheIsUsable(
  cache: CacheLike,
  dependencies: VisionCacheDependencies,
  signal?: AbortSignal,
): Promise<boolean> {
  return (
    (await readCompletion(cache, dependencies)) !== undefined &&
    (await requiredEntriesAreVerified(cache, dependencies, signal))
  );
}

async function storeAsset(
  cache: CacheLike,
  asset: VisionAsset,
  dependencies: VisionCacheDependencies,
  signal: AbortSignal,
): Promise<void> {
  ensureNotCancelled(signal);
  const upstream = await dependencies.fetch(asset.path, fetchOptions(signal));
  const bytes = await (dependencies.verifyResponse ?? verifyVisionResponse)(
    upstream,
    asset,
  );
  ensureNotCancelled(signal);
  const responseBytes = new Uint8Array(bytes.byteLength);
  responseBytes.set(bytes);
  await cache.put(
    asset.path,
    new Response(responseBytes.buffer, {
      headers: safeHeaders(upstream.headers),
      status: 200,
    }),
  );
}

export async function queryVisionRelease(
  releaseId: string,
  dependencies: VisionCacheDependencies,
): Promise<"ready" | "missing"> {
  if (releaseId !== dependencies.manifest.releaseId) return "missing";
  const cache = await dependencies.cacheStorage.open(
    visionCacheName(releaseId),
  );
  return (await completedCacheIsUsable(cache, dependencies))
    ? "ready"
    : "missing";
}

export async function cacheVisionRelease(
  command: CacheReleaseCommand,
  dependencies: VisionCacheDependencies,
): Promise<"ready"> {
  if (
    command.releaseId !== dependencies.manifest.releaseId ||
    dependencies.manifest.assets.filter((asset) => asset.requiredForOffline)
      .length === 0
  ) {
    throw new Error("Vision manifest inventory mismatch");
  }
  const controller = new AbortController();
  addController(command.generation, controller);
  const lock = acquireReleaseLock(command.releaseId);
  const cacheName = visionCacheName(command.releaseId);
  let cache: CacheLike | undefined;
  let mutationStarted = false;
  try {
    await lock.wait;
    ensureNotCancelled(controller.signal);
    cache = await dependencies.cacheStorage.open(cacheName);
    if (await completedCacheIsUsable(cache, dependencies, controller.signal)) {
      ensureNotCancelled(controller.signal);
      return "ready";
    }

    ensureNotCancelled(controller.signal);
    mutationStarted = true;
    const marker = completionUrl(dependencies.scope, command.releaseId);
    if ((await cache.match(marker)) !== undefined) await cache.delete(marker);

    const release = await fetchManifest(
      command,
      dependencies,
      controller.signal,
    );
    for (const asset of release.assets) {
      await storeAsset(cache, asset, dependencies, controller.signal);
    }
    ensureNotCancelled(controller.signal);
    if (
      !(await requiredEntriesAreVerified(
        cache,
        dependencies,
        controller.signal,
      ))
    ) {
      throw new Error("Vision cache readback failed");
    }
    const completion: CompletionRecord = {
      schemaVersion: 1,
      releaseId: command.releaseId,
      assetCount: release.assets.filter((asset) => asset.requiredForOffline)
        .length,
    };
    ensureNotCancelled(controller.signal);
    await cache.put(
      completionUrl(dependencies.scope, command.releaseId),
      Response.json(completion),
    );
    return "ready";
  } catch (error) {
    if (
      mutationStarted &&
      cache !== undefined &&
      !(await completedCacheIsUsable(cache, dependencies))
    ) {
      await dependencies.cacheStorage.delete(cacheName);
    }
    throw error;
  } finally {
    lock.release();
    removeController(command.generation, controller);
  }
}

export function cancelVisionRelease(generation: number): void {
  for (const controller of activeControllers.get(generation) ?? []) {
    controller.abort(
      new DOMException("The operation was aborted", "AbortError"),
    );
  }
}

export async function matchCompletedVisionAsset(
  request: RequestInfo | URL,
  releaseId: string,
  dependencies: VisionCacheDependencies,
): Promise<Response | undefined> {
  if (releaseId !== dependencies.manifest.releaseId) return undefined;
  const cache = await dependencies.cacheStorage.open(
    visionCacheName(releaseId),
  );
  if (!(await completedCacheIsUsable(cache, dependencies))) {
    return undefined;
  }
  return cache.match(request);
}
