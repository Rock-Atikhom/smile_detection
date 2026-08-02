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

export class VisionCacheIntegrityError extends Error {
  readonly code = "runtime-integrity-failed" as const;

  constructor() {
    super("Vision cache integrity failed");
    Object.defineProperty(this, "name", {
      configurable: false,
      enumerable: false,
      value: "VisionCacheIntegrityError",
      writable: false,
    });
    Object.defineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false,
    });
  }
}

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
interface CacheTrustGeneration {
  generation: number;
  inventoryVerification?: Promise<boolean>;
}
const cacheTrust = new WeakMap<
  CacheStorageLike,
  Map<string, CacheTrustGeneration>
>();
const SAFE_RESPONSE_HEADERS = ["content-type", "content-language"] as const;

function trustGeneration(
  cacheName: string,
  dependencies: VisionCacheDependencies,
): CacheTrustGeneration {
  let storageTrust = cacheTrust.get(dependencies.cacheStorage);
  if (storageTrust === undefined) {
    storageTrust = new Map();
    cacheTrust.set(dependencies.cacheStorage, storageTrust);
  }
  let generation = storageTrust.get(cacheName);
  if (generation === undefined) {
    generation = { generation: 0 };
    storageTrust.set(cacheName, generation);
  }
  return generation;
}

function invalidateCacheTrust(
  cacheName: string,
  dependencies: VisionCacheDependencies,
): void {
  const previous = trustGeneration(cacheName, dependencies);
  cacheTrust.get(dependencies.cacheStorage)!.set(cacheName, {
    generation: previous.generation + 1,
  });
}

async function deleteOwnedCache(
  cacheName: string,
  dependencies: VisionCacheDependencies,
): Promise<boolean> {
  invalidateCacheTrust(cacheName, dependencies);
  return dependencies.cacheStorage.delete(cacheName);
}

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

type CompletionState =
  | { state: "missing" }
  | { state: "corrupt" }
  | { record: CompletionRecord; state: "complete" };

async function readCompletion(
  cache: CacheLike,
  dependencies: VisionCacheDependencies,
): Promise<CompletionState> {
  const requiredAssetCount = dependencies.manifest.assets.filter(
    (asset) => asset.requiredForOffline,
  ).length;
  const response = await cache.match(
    completionUrl(dependencies.scope, dependencies.manifest.releaseId),
  );
  if (response === undefined) return { state: "missing" };
  if (!response.ok) return { state: "corrupt" };
  try {
    const value: unknown = await response.json();
    return isCompletionRecord(
      value,
      dependencies.manifest.releaseId,
      requiredAssetCount,
    )
      ? { record: value, state: "complete" }
      : { state: "corrupt" };
  } catch {
    return { state: "corrupt" };
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
  let parsed: VisionReleaseManifest;
  try {
    parsed = parseVisionManifest(await response.json());
  } catch {
    throw new VisionCacheIntegrityError();
  }
  if (
    parsed.releaseId !== command.releaseId ||
    !sameManifest(parsed, dependencies.manifest)
  ) {
    throw new VisionCacheIntegrityError();
  }
  return parsed;
}

async function allEntriesAreVerified(
  cache: CacheLike,
  dependencies: VisionCacheDependencies,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    for (const asset of dependencies.manifest.assets) {
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

async function inspectCompletedCache(
  cacheName: string,
  dependencies: VisionCacheDependencies,
  signal?: AbortSignal,
): Promise<{
  cache: CacheLike;
  state: "ready" | "missing" | "integrity-failed";
}> {
  for (;;) {
    if (signal !== undefined) ensureNotCancelled(signal);
    const generation = trustGeneration(cacheName, dependencies);
    const cache = await dependencies.cacheStorage.open(cacheName);
    const completion = await readCompletion(cache, dependencies);
    if (signal !== undefined) ensureNotCancelled(signal);
    if (trustGeneration(cacheName, dependencies) !== generation) continue;
    if (completion.state !== "complete") {
      if (generation.inventoryVerification !== undefined) {
        invalidateCacheTrust(cacheName, dependencies);
        continue;
      }
      return {
        cache,
        state: completion.state === "missing" ? "missing" : "integrity-failed",
      };
    }

    const verification =
      generation.inventoryVerification ??
      allEntriesAreVerified(cache, dependencies);
    generation.inventoryVerification = verification;
    const verified = await verification;
    if (signal !== undefined) ensureNotCancelled(signal);
    if (trustGeneration(cacheName, dependencies) !== generation) continue;
    if (!verified) generation.inventoryVerification = undefined;
    return {
      cache,
      state: verified ? "ready" : "integrity-failed",
    };
  }
}

async function deleteCorruptRelease(
  cacheName: string,
  dependencies: VisionCacheDependencies,
): Promise<never> {
  try {
    await deleteOwnedCache(cacheName, dependencies);
  } catch {
    // The fatal integrity result remains authoritative even if storage cleanup
    // itself fails. A later request must never treat this release as complete.
  }
  throw new VisionCacheIntegrityError();
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
): Promise<"ready" | "missing" | "integrity-failed"> {
  if (releaseId !== dependencies.manifest.releaseId) return "missing";
  const cacheName = visionCacheName(releaseId);
  const { state } = await inspectCompletedCache(cacheName, dependencies);
  if (state !== "integrity-failed") return state;
  try {
    await deleteCorruptRelease(cacheName, dependencies);
  } catch (error) {
    if (error instanceof VisionCacheIntegrityError) return "integrity-failed";
    throw error;
  }
  return "integrity-failed";
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
    invalidateCacheTrust(cacheName, dependencies);
    await lock.wait;
    ensureNotCancelled(controller.signal);
    const inspected = await inspectCompletedCache(
      cacheName,
      dependencies,
      controller.signal,
    );
    cache = inspected.cache;
    const existingState = inspected.state;
    if (existingState === "ready") {
      ensureNotCancelled(controller.signal);
      return "ready";
    }
    if (existingState === "integrity-failed") {
      await deleteCorruptRelease(cacheName, dependencies);
    }

    ensureNotCancelled(controller.signal);
    mutationStarted = true;
    invalidateCacheTrust(cacheName, dependencies);
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
      !(await allEntriesAreVerified(cache, dependencies, controller.signal))
    ) {
      throw new VisionCacheIntegrityError();
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
    if (mutationStarted && cache !== undefined) {
      try {
        await deleteOwnedCache(cacheName, dependencies);
      } catch {
        // Preserve the original bounded cache/integrity failure.
      }
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
  const cacheName = visionCacheName(releaseId);
  const { cache, state } = await inspectCompletedCache(cacheName, dependencies);
  if (state === "missing") return undefined;
  if (state === "integrity-failed") {
    await deleteCorruptRelease(cacheName, dependencies);
  }

  const requestUrl =
    typeof request === "string"
      ? new URL(request, dependencies.scope)
      : request instanceof URL
        ? request
        : new URL(request.url);
  const asset = dependencies.manifest.assets.find(
    (candidate) => candidate.path === requestUrl.pathname,
  );
  if (asset === undefined) return undefined;
  const cached = await cache.match(request);
  if (cached === undefined) {
    return deleteCorruptRelease(cacheName, dependencies);
  }
  try {
    const bytes = await (dependencies.verifyResponse ?? verifyVisionResponse)(
      cached,
      asset,
    );
    const responseBytes = new Uint8Array(bytes.byteLength);
    responseBytes.set(bytes);
    return new Response(responseBytes.buffer, {
      headers: safeHeaders(cached.headers),
      status: 200,
    });
  } catch {
    await deleteCorruptRelease(cacheName, dependencies);
  }
}
