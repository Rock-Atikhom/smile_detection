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
const activeCacheRequests = new Set<string>();
const cancelledCacheRequests = new Set<string>();

function cacheRequestKey(command: {
  generation: number;
  releaseId: string;
}): string {
  return `${command.generation}:${command.releaseId}`;
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
      activeCacheRequests.add(key);
      postMessage(eventFor("CACHE_CACHING", command));
      try {
        await cacheVisionRelease(command, dependencies);
        if (!cancelledCacheRequests.has(key)) {
          postMessage(eventFor("CACHE_READY", command));
        }
      } catch {
        if (!cancelledCacheRequests.has(key)) {
          postMessage(eventFor("CACHE_ERROR", command));
        }
      } finally {
        activeCacheRequests.delete(key);
        cancelledCacheRequests.delete(key);
      }
      return;
    }
    case "CANCEL_CACHE": {
      const key = cacheRequestKey(command);
      if (activeCacheRequests.has(key)) cancelledCacheRequests.add(key);
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
