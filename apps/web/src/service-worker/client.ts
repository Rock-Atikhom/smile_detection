import {
  isVisionCacheEvent,
  isVisionServiceWorkerHandshakeEvent,
  VISION_SERVICE_WORKER_PROTOCOL,
  type VisionCacheCommand,
  type VisionCacheEvent,
  type VisionServiceWorkerHandshakeCommand,
} from "../vision/protocol";

export interface VisionCacheRequest {
  generation: number;
  manifestUrl: string;
  releaseId: string;
}
export type VisionCacheQueryResult =
  "ready" | "missing" | "integrity-failed" | "indeterminate";
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
  postMessage(
    message: VisionCacheCommand | VisionServiceWorkerHandshakeCommand,
  ): void;
}

export interface ServiceWorkerContainerLike {
  readonly controller: ServiceWorkerLike | null;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  addEventListener(type: "controllerchange", listener: () => void): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(type: "controllerchange", listener: () => void): void;
  register(scriptURL: string): Promise<unknown>;
}

export interface RegisterServiceWorkerDependencies {
  serviceWorker?: ServiceWorkerContainerLike;
}

interface PendingRequest {
  generation: number;
  releaseId: string;
  fail(): void;
  receive(event: VisionCacheEvent): boolean;
  timeout: ReturnType<typeof setTimeout>;
}

interface ManagedVisionCacheClient extends VisionCacheClient {
  isCurrent(): boolean;
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
      return "indeterminate";
    },
  };
}

function createVisionCacheClient(
  serviceWorker: ServiceWorkerLike,
  container: ServiceWorkerContainerLike,
): ManagedVisionCacheClient {
  const pending = new Map<string, PendingRequest>();
  let invalidated = false;

  const cleanupPending = (requestId: string, request: PendingRequest) => {
    clearTimeout(request.timeout);
    pending.delete(requestId);
  };
  const invalidate = () => {
    if (invalidated) return;
    invalidated = true;
    container.removeEventListener("message", receiveMessage);
    container.removeEventListener("controllerchange", receiveControllerChange);
    for (const [requestId, request] of pending) {
      cleanupPending(requestId, request);
      request.fail();
    }
  };
  const receiveControllerChange = () => {
    if (container.controller !== serviceWorker) invalidate();
  };
  const receiveMessage = (messageEvent: MessageEvent<unknown>) => {
    if (container.controller !== serviceWorker) {
      invalidate();
      return;
    }
    if (
      invalidated ||
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
      cleanupPending(event.requestId, request);
    }
  };

  container.addEventListener("message", receiveMessage);
  container.addEventListener("controllerchange", receiveControllerChange);
  receiveControllerChange();

  function post(command: VisionCacheCommand): boolean {
    if (invalidated || container.controller !== serviceWorker) {
      invalidate();
      return false;
    }
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
          fail,
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
          const active = pending.get(requestId);
          if (active !== undefined) {
            cleanupPending(requestId, active);
            fail();
          }
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
          resolve("indeterminate");
        }, REQUEST_TIMEOUT_MS);
        pending.set(requestId, {
          generation: request.generation,
          releaseId: request.releaseId,
          fail: () => resolve("indeterminate"),
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
                  : "indeterminate",
              );
              return true;
            }
            return false;
          },
        });
        if (!post({ type: "QUERY_RELEASE", requestId, ...request })) {
          const active = pending.get(requestId);
          if (active !== undefined) {
            cleanupPending(requestId, active);
            resolve("indeterminate");
          }
        }
      });
    },
    isCurrent() {
      return !invalidated && container.controller === serviceWorker;
    },
  };
}

let productionClient: ManagedVisionCacheClient | undefined;
let productionClientPromise: Promise<VisionCacheClient> | undefined;

function completesBeforeDeadline(
  operation: PromiseLike<unknown>,
  deadline: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(completed);
    };
    const timeout = setTimeout(
      () => finish(false),
      Math.max(0, deadline - Date.now()),
    );
    Promise.resolve(operation).then(
      () => finish(true),
      () => finish(false),
    );
  });
}

async function waitForVerifiedController(
  serviceWorker: ServiceWorkerContainerLike,
  deadline: number,
): Promise<ServiceWorkerLike | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    let candidate: ServiceWorkerLike | undefined;
    let handshakeRequestId: string | undefined;
    const finish = (worker: ServiceWorkerLike | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      serviceWorker.removeEventListener("controllerchange", onControllerChange);
      serviceWorker.removeEventListener("message", onMessage);
      resolve(worker);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        candidate === undefined ||
        handshakeRequestId === undefined ||
        event.source !== (candidate as unknown as MessageEventSource) ||
        !isVisionServiceWorkerHandshakeEvent(event.data) ||
        event.data.requestId !== handshakeRequestId
      ) {
        return;
      }
      finish(candidate);
    };
    const probeController = () => {
      const controller = serviceWorker.controller;
      if (controller === null) {
        candidate = undefined;
        handshakeRequestId = undefined;
        return;
      }
      if (controller === candidate) return;
      candidate = controller;
      handshakeRequestId = nextRequestId();
      try {
        controller.postMessage({
          type: "VISION_SW_HANDSHAKE",
          requestId: handshakeRequestId,
          protocol: VISION_SERVICE_WORKER_PROTOCOL,
        });
      } catch {
        finish(undefined);
      }
    };
    const onControllerChange = () => {
      probeController();
    };
    const timeout = setTimeout(
      () => finish(undefined),
      Math.max(0, deadline - Date.now()),
    );
    serviceWorker.addEventListener("message", onMessage);
    serviceWorker.addEventListener("controllerchange", onControllerChange);
    probeController();
  });
}

async function createApplicationServiceWorkerClient(
  dependencies: RegisterServiceWorkerDependencies,
): Promise<ManagedVisionCacheClient | undefined> {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  const serviceWorker =
    dependencies.serviceWorker ??
    ("serviceWorker" in navigator
      ? (navigator.serviceWorker as unknown as ServiceWorkerContainerLike)
      : undefined);
  if (serviceWorker === undefined) return undefined;

  try {
    if (
      !(await completesBeforeDeadline(
        serviceWorker.register("/sw.js"),
        deadline,
      ))
    ) {
      return undefined;
    }
    const controller = await waitForVerifiedController(serviceWorker, deadline);
    if (controller === undefined || serviceWorker.controller !== controller) {
      return undefined;
    }
    const client = createVisionCacheClient(controller, serviceWorker);
    return client.isCurrent() ? client : undefined;
  } catch {
    return undefined;
  }
}

function acquireProductionServiceWorkerClient(): Promise<VisionCacheClient> {
  if (productionClient?.isCurrent() === true) {
    return Promise.resolve(productionClient);
  }
  productionClient = undefined;
  if (productionClientPromise !== undefined) return productionClientPromise;

  const acquisition = createApplicationServiceWorkerClient({})
    .then((client) => {
      if (client?.isCurrent() === true) productionClient = client;
      return client ?? degradedClient();
    })
    .finally(() => {
      if (productionClientPromise === acquisition) {
        productionClientPromise = undefined;
      }
    });
  productionClientPromise = acquisition;
  return acquisition;
}

export function registerApplicationServiceWorker(
  dependencies?: RegisterServiceWorkerDependencies,
): Promise<VisionCacheClient> {
  if (dependencies !== undefined) {
    return createApplicationServiceWorkerClient(dependencies).then(
      (client) => client ?? degradedClient(),
    );
  }
  return acquireProductionServiceWorkerClient();
}
