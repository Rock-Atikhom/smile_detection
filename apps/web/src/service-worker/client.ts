import {
  isVisionCacheEvent,
  type VisionCacheCommand,
  type VisionCacheEvent,
} from "../vision/protocol";

export interface VisionCacheRequest {
  generation: number;
  manifestUrl: string;
  releaseId: string;
}
export interface VisionCacheClient {
  queryRelease(
    request: Pick<VisionCacheRequest, "generation" | "releaseId">,
  ): Promise<"ready" | "missing">;
  cacheRelease(
    request: VisionCacheRequest,
    onState: (state: "caching" | "ready" | "error") => void,
  ): Promise<"ready" | "error">;
  cancel(request: Pick<VisionCacheRequest, "generation" | "releaseId">): void;
}

interface ServiceWorkerLike {
  postMessage(message: VisionCacheCommand): void;
}

interface ServiceWorkerRegistrationLike {
  active: ServiceWorkerLike | null;
}

export interface ServiceWorkerContainerLike {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  ready: PromiseLike<ServiceWorkerRegistrationLike>;
  register(scriptURL: string): Promise<unknown>;
}

export interface RegisterServiceWorkerDependencies {
  serviceWorker?: ServiceWorkerContainerLike;
}

interface PendingRequest {
  generation: number;
  releaseId: string;
  receive(event: VisionCacheEvent): boolean;
  timeout: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 15_000;
let requestSequence = 0;

function nextRequestId(): string {
  requestSequence = (requestSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `vision-cache-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

function degradedClient(): VisionCacheClient {
  return {
    async cacheRelease(_request, onState) {
      onState("error");
      return "error";
    },
    cancel() {},
    async queryRelease() {
      return "missing";
    },
  };
}

function createVisionCacheClient(
  serviceWorker: ServiceWorkerLike,
  container: ServiceWorkerContainerLike,
): VisionCacheClient {
  const pending = new Map<string, PendingRequest>();

  container.addEventListener("message", (messageEvent) => {
    if (
      messageEvent.source !== (serviceWorker as unknown as MessageEventSource)
    ) {
      return;
    }
    if (!isVisionCacheEvent(messageEvent.data)) return;
    const event = messageEvent.data;
    const request = pending.get(event.requestId);
    if (
      request === undefined ||
      event.generation !== request.generation ||
      event.releaseId !== request.releaseId
    ) {
      return;
    }
    if (request.receive(event)) {
      clearTimeout(request.timeout);
      pending.delete(event.requestId);
    }
  });

  function post(command: VisionCacheCommand): boolean {
    try {
      serviceWorker.postMessage(command);
      return true;
    } catch {
      return false;
    }
  }

  return {
    cacheRelease(request, onState) {
      const requestId = nextRequestId();
      return new Promise<"ready" | "error">((resolve) => {
        const fail = () => {
          onState("error");
          resolve("error");
        };
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          fail();
        }, REQUEST_TIMEOUT_MS);
        pending.set(requestId, {
          generation: request.generation,
          releaseId: request.releaseId,
          timeout,
          receive(event) {
            switch (event.type) {
              case "CACHE_CACHING":
                onState("caching");
                return false;
              case "CACHE_READY":
                onState("ready");
                resolve("ready");
                return true;
              case "CACHE_ERROR":
              case "CACHE_CANCELLED":
              case "CACHE_MISSING":
                fail();
                return true;
            }
          },
        });
        if (!post({ type: "CACHE_RELEASE", requestId, ...request })) {
          clearTimeout(timeout);
          pending.delete(requestId);
          fail();
        }
      });
    },
    cancel(request) {
      post({ type: "CANCEL_CACHE", requestId: nextRequestId(), ...request });
    },
    queryRelease(request) {
      const requestId = nextRequestId();
      return new Promise<"ready" | "missing">((resolve) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          resolve("missing");
        }, REQUEST_TIMEOUT_MS);
        pending.set(requestId, {
          generation: request.generation,
          releaseId: request.releaseId,
          timeout,
          receive(event) {
            if (event.type === "CACHE_READY") {
              resolve("ready");
              return true;
            }
            if (
              event.type === "CACHE_MISSING" ||
              event.type === "CACHE_ERROR" ||
              event.type === "CACHE_CANCELLED"
            ) {
              resolve("missing");
              return true;
            }
            return false;
          },
        });
        if (!post({ type: "QUERY_RELEASE", requestId, ...request })) {
          clearTimeout(timeout);
          pending.delete(requestId);
          resolve("missing");
        }
      });
    },
  };
}

let productionClientPromise: Promise<VisionCacheClient> | undefined;

async function createApplicationServiceWorkerClient(
  dependencies: RegisterServiceWorkerDependencies,
): Promise<VisionCacheClient> {
  const serviceWorker =
    dependencies.serviceWorker ??
    ("serviceWorker" in navigator
      ? (navigator.serviceWorker as unknown as ServiceWorkerContainerLike)
      : undefined);
  if (serviceWorker === undefined) return degradedClient();

  try {
    await serviceWorker.register("/sw.js");
    const registration = await serviceWorker.ready;
    if (registration.active === null) return degradedClient();
    return createVisionCacheClient(registration.active, serviceWorker);
  } catch {
    return degradedClient();
  }
}

export function registerApplicationServiceWorker(
  dependencies?: RegisterServiceWorkerDependencies,
): Promise<VisionCacheClient> {
  if (dependencies !== undefined) {
    return createApplicationServiceWorkerClient(dependencies);
  }
  productionClientPromise ??= createApplicationServiceWorkerClient({});
  return productionClientPromise;
}
