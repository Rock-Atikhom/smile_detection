import { verifyVisionResponse } from "../vision/integrity";
import { parseVisionManifest, type VisionAsset } from "../vision/manifest";
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
  scope: string;
  verifyResponse?: typeof verifyVisionResponse;
}

type CacheReleaseCommand = Extract<
  VisionCacheCommand,
  { type: "CACHE_RELEASE" }
>;

const activeControllers = new Map<number, Set<AbortController>>();
const SAFE_RESPONSE_HEADERS = ["content-type", "content-language"] as const;

function isCompletionRecord(
  value: unknown,
  releaseId: string,
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
    Number.isSafeInteger(record.assetCount) &&
    record.assetCount > 0
  );
}

async function readCompletion(
  cache: CacheLike,
  scope: string,
  releaseId: string,
): Promise<CompletionRecord | undefined> {
  const response = await cache.match(completionUrl(scope, releaseId));
  if (response === undefined || !response.ok) return undefined;
  try {
    const value: unknown = await response.json();
    return isCompletionRecord(value, releaseId) ? value : undefined;
  } catch {
    return undefined;
  }
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

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
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
  if (parsed.releaseId !== command.releaseId) {
    throw new Error("Vision manifest release mismatch");
  }
  return parsed;
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
  const readback = await cache.match(asset.path);
  if (readback === undefined || !readback.ok) {
    throw new Error("Vision cache readback failed");
  }
  const storedBytes = new Uint8Array(await readback.arrayBuffer());
  if (!sameBytes(bytes, storedBytes)) {
    throw new Error("Vision cache readback failed");
  }
}

export async function queryVisionRelease(
  releaseId: string,
  dependencies: VisionCacheDependencies,
): Promise<"ready" | "missing"> {
  const cache = await dependencies.cacheStorage.open(
    visionCacheName(releaseId),
  );
  return (await readCompletion(cache, dependencies.scope, releaseId)) ===
    undefined
    ? "missing"
    : "ready";
}

export async function cacheVisionRelease(
  command: CacheReleaseCommand,
  dependencies: VisionCacheDependencies,
): Promise<"ready"> {
  const cacheName = visionCacheName(command.releaseId);
  const cache = await dependencies.cacheStorage.open(cacheName);
  if (
    (await readCompletion(cache, dependencies.scope, command.releaseId)) !==
    undefined
  ) {
    return "ready";
  }

  const controller = new AbortController();
  addController(command.generation, controller);
  try {
    const release = await fetchManifest(
      command,
      dependencies,
      controller.signal,
    );
    for (const asset of release.assets) {
      await storeAsset(cache, asset, dependencies, controller.signal);
    }
    ensureNotCancelled(controller.signal);
    const completion: CompletionRecord = {
      schemaVersion: 1,
      releaseId: command.releaseId,
      assetCount: release.assets.length,
    };
    await cache.put(
      completionUrl(dependencies.scope, command.releaseId),
      Response.json(completion),
    );
    return "ready";
  } catch (error) {
    if (
      (await readCompletion(cache, dependencies.scope, command.releaseId)) ===
      undefined
    ) {
      await dependencies.cacheStorage.delete(cacheName);
    }
    throw error;
  } finally {
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
  const cache = await dependencies.cacheStorage.open(
    visionCacheName(releaseId),
  );
  if (
    (await readCompletion(cache, dependencies.scope, releaseId)) === undefined
  ) {
    return undefined;
  }
  return cache.match(request);
}
