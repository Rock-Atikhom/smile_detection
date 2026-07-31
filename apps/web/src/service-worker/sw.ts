/// <reference lib="webworker" />

import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  type PrecacheEntry,
} from "workbox-precaching";
import { VISION_MANIFEST } from "../vision/release";
import {
  isVisionCacheCommand,
  type VisionCacheCommand,
  type VisionCacheEvent,
} from "../vision/protocol";
import {
  cacheVisionRelease,
  cancelVisionRelease,
  matchCompletedVisionAsset,
  queryVisionRelease,
  type VisionCacheDependencies,
} from "./vision-cache";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

const immutableVisionPaths = new Set(
  VISION_MANIFEST.assets.map((asset) => asset.path),
);
const activeCacheRequests = new Map<string, Map<string, number>>();
const cancelledCacheRequestIds = new Set<string>();

function cacheRequestKey(command: {
  generation: number;
  releaseId: string;
}): string {
  return `${command.generation}:${command.releaseId}`;
}

function addActiveCacheRequest(key: string, requestId: string): void {
  const requests = activeCacheRequests.get(key) ?? new Map<string, number>();
  requests.set(requestId, (requests.get(requestId) ?? 0) + 1);
  activeCacheRequests.set(key, requests);
}

function cancellationKey(key: string, requestId: string): string {
  return `${key}:${requestId}`;
}

function removeActiveCacheRequest(key: string, requestId: string): void {
  const requests = activeCacheRequests.get(key);
  const count = requests?.get(requestId);
  if (requests === undefined || count === undefined) return;
  if (count > 1) {
    requests.set(requestId, count - 1);
    return;
  }
  requests.delete(requestId);
  cancelledCacheRequestIds.delete(cancellationKey(key, requestId));
  if (requests.size === 0) activeCacheRequests.delete(key);
}

function eventFor(
  type: VisionCacheEvent["type"],
  command: VisionCacheCommand,
): VisionCacheEvent {
  const base = {
    requestId: command.requestId,
    generation: command.generation,
    releaseId: command.releaseId,
  };
  if (type === "CACHE_ERROR") {
    return { type, ...base, code: "offline-cache-failed" };
  }
  return { type, ...base };
}

async function handleCacheCommand(
  command: VisionCacheCommand,
  postMessage: (event: VisionCacheEvent) => void,
  dependencies: VisionCacheDependencies,
): Promise<void> {
  switch (command.type) {
    case "CACHE_RELEASE": {
      const key = cacheRequestKey(command);
      addActiveCacheRequest(key, command.requestId);
      postMessage(eventFor("CACHE_CACHING", command));
      try {
        await cacheVisionRelease(command, dependencies);
        if (
          !cancelledCacheRequestIds.has(cancellationKey(key, command.requestId))
        ) {
          postMessage(eventFor("CACHE_READY", command));
        }
      } catch {
        if (
          !cancelledCacheRequestIds.has(cancellationKey(key, command.requestId))
        ) {
          postMessage(eventFor("CACHE_ERROR", command));
        }
      } finally {
        removeActiveCacheRequest(key, command.requestId);
      }
      return;
    }
    case "CANCEL_CACHE": {
      const key = cacheRequestKey(command);
      for (const requestId of activeCacheRequests.get(key)?.keys() ?? []) {
        cancelledCacheRequestIds.add(cancellationKey(key, requestId));
      }
      cancelVisionRelease(command.generation);
      postMessage(eventFor("CACHE_CANCELLED", command));
      return;
    }
    case "QUERY_RELEASE": {
      try {
        const state = await queryVisionRelease(command.releaseId, dependencies);
        postMessage(
          eventFor(
            state === "ready" ? "CACHE_READY" : "CACHE_MISSING",
            command,
          ),
        );
      } catch {
        postMessage(eventFor("CACHE_ERROR", command));
      }
    }
  }
}

const dependencies: VisionCacheDependencies = {
  cacheStorage: self.caches,
  fetch: (input, init) => fetch(input, init),
  manifest: VISION_MANIFEST,
  scope: self.registration.scope,
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("message", (event) => {
  if (!isVisionCacheCommand(event.data) || event.source === null) return;
  event.waitUntil(
    handleCacheCommand(
      event.data,
      (reply) => event.source?.postMessage(reply),
      dependencies,
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.search !== "" ||
    !immutableVisionPaths.has(url.pathname)
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await matchCompletedVisionAsset(
        event.request,
        VISION_MANIFEST.releaseId,
        dependencies,
      );
      if (cached !== undefined) return cached;
      return fetch(event.request, {
        cache: "no-store",
        credentials: "same-origin",
      });
    })(),
  );
});
