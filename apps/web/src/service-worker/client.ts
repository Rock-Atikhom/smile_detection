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
export type VisionCacheQueryResult = "ready" | "missing" | "integrity-failed";
export type VisionCachePreparationResult =
  "ready" | "error" | "integrity-failed";
export type VisionCachePreparationState =
  "caching" | VisionCachePreparationResult;
export interface VisionCacheClient {
  queryRelease(
    request: Pick<VisionCacheRequest, "generation" | "releaseId">,
  ): Promise<VisionCacheQueryResult>;
  cacheRelease(
    request: VisionCacheRequest,
    onState: (state: VisionCachePreparationState) => void,
  ): Promise<VisionCachePreparationResult>;
  cancel(request: Pick<VisionCacheRequest, "generation" | "releaseId">): void;
}

interface ServiceWorkerLike {
  postMessage(message: VisionCacheCommand): void;
}

interface ServiceWorkerRegistrationLike {
  active: ServiceWorkerLike | null;
}

export interface ServiceWorkerContainerLike {
  readonly controller: ServiceWorkerLike | null;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  addEventListener(type: "controllerchange", listener: () => void): void;
  removeEventListener(type: "controllerchange", listener: () => void): void;
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
      return new Promise<VisionCachePreparationResult>((resolve) => {
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
                if (event.code === "runtime-integrity-failed") {
                  onState("integrity-failed");
                  resolve("integrity-failed");
                  return true;
                }
                fail();
                return true;
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
      return new Promise<VisionCacheQueryResult>((resolve) => {
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
              event.type === "CACHE_CANCELLED"
            ) {
              resolve("missing");
              return true;
            }
            if (event.type === "CACHE_ERROR") {
              resolve(
                event.code === "runtime-integrity-failed"
                  ? "integrity-failed"
                  : "missing",
              );
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

async function waitForController(
  serviceWorker: ServiceWorkerContainerLike,
): Promise<ServiceWorkerLike | undefined> {
  if (serviceWorker.controller !== null) return serviceWorker.controller;

  return new Promise((resolve) => {
    const finish = (worker: ServiceWorkerLike | undefined) => {
      clearTimeout(timeout);
      serviceWorker.removeEventListener("controllerchange", onControllerChange);
      resolve(worker);
    };
    const onControllerChange = () => {
      if (serviceWorker.controller !== null) finish(serviceWorker.controller);
    };
    const timeout = setTimeout(() => finish(undefined), REQUEST_TIMEOUT_MS);
    serviceWorker.addEventListener("controllerchange", onControllerChange);
    onControllerChange();
  });
}

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
    await serviceWorker.ready;
    const controller = await waitForController(serviceWorker);
    if (controller === undefined) return degradedClient();
    return createVisionCacheClient(controller, serviceWorker);
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
