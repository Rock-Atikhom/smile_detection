import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  VISION_SERVICE_WORKER_PROTOCOL,
  type VisionCacheCommand,
  type VisionCacheEvent,
  type VisionServiceWorkerHandshakeCommand,
} from "../vision/protocol";
import {
  registerApplicationServiceWorker,
  type VisionCachePreparationState,
} from "./client";

const releaseId = "0123456789abcdef";
const manifestUrl = "/vision/release-manifest.json";

class FakeServiceWorkerContainer {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly controllerListeners = new Set<() => void>();
  readonly handshakes: VisionServiceWorkerHandshakeCommand[] = [];
  readonly posted: VisionCacheCommand[] = [];
  readonly register = vi.fn(async () => ({ installing: {} }));
  autoHandshake = true;
  readonly worker = {
    postMessage: vi.fn(
      (command: VisionCacheCommand | VisionServiceWorkerHandshakeCommand) => {
        if (command.type === "VISION_SW_HANDSHAKE") {
          this.handshakes.push(command);
          if (this.autoHandshake) {
            queueMicrotask(() =>
              this.dispatch({
                type: "VISION_SW_HANDSHAKE_ACK",
                requestId: command.requestId,
                protocol: VISION_SERVICE_WORKER_PROTOCOL,
              }),
            );
          }
          return;
        }
        this.posted.push(command);
      },
    ),
  };
  readonly ready = Promise.resolve({ active: this.worker });
  controller: typeof this.worker | null = this.worker;

  addEventListener(
    type: "message" | "controllerchange",
    listener: ((event: MessageEvent<unknown>) => void) | (() => void),
  ) {
    if (type === "message") {
      this.listeners.add(listener as (event: MessageEvent<unknown>) => void);
    } else {
      this.controllerListeners.add(listener as () => void);
    }
  }

  removeEventListener(
    type: "message" | "controllerchange",
    listener: ((event: MessageEvent<unknown>) => void) | (() => void),
  ) {
    if (type === "message") {
      this.listeners.delete(listener as (event: MessageEvent<unknown>) => void);
    } else {
      this.controllerListeners.delete(listener as () => void);
    }
  }

  changeController(controller: typeof this.worker | null) {
    this.controller = controller;
    for (const listener of this.controllerListeners) listener();
  }

  claim() {
    this.changeController(this.worker);
  }

  dispatch(data: VisionCacheEvent | unknown, source: unknown = this.worker) {
    for (const listener of this.listeners) {
      listener({ data, source } as MessageEvent<unknown>);
    }
  }
}

describe("VisionCacheClient", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("requires the current controller to prove the expected protocol before use", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    serviceWorker.autoHandshake = false;
    let settled = false;
    const pendingClient = registerApplicationServiceWorker({ serviceWorker });
    void pendingClient.then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(serviceWorker.handshakes).toHaveLength(1);
    expect(serviceWorker.posted).toEqual([]);

    const handshake = serviceWorker.handshakes[0]!;
    serviceWorker.dispatch({
      type: "VISION_SW_HANDSHAKE_ACK",
      requestId: handshake.requestId,
      protocol: VISION_SERVICE_WORKER_PROTOCOL,
    });
    const client = await pendingClient;
    const pendingQuery = client.queryRelease({ generation: 3, releaseId });
    const sent = serviceWorker.posted[0]!;
    serviceWorker.dispatch({
      type: "CACHE_MISSING",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
    });

    await expect(pendingQuery).resolves.toBe("missing");
  });

  it("never uses an old controller and accepts the newly controlling worker only after proof", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const oldMessages: unknown[] = [];
    const oldController = {
      postMessage: vi.fn((message: unknown) => {
        oldMessages.push(message);
      }),
    };
    serviceWorker.controller = oldController as typeof serviceWorker.worker;
    const pendingClient = registerApplicationServiceWorker({ serviceWorker });

    await Promise.resolve();
    await Promise.resolve();
    expect(oldMessages).toEqual([
      expect.objectContaining({
        type: "VISION_SW_HANDSHAKE",
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      }),
    ]);
    serviceWorker.claim();

    const client = await pendingClient;
    const pendingQuery = client.queryRelease({ generation: 3, releaseId });
    const sent = serviceWorker.posted[0]!;
    expect(oldMessages).toHaveLength(1);
    serviceWorker.dispatch({
      type: "CACHE_READY",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
    });
    await expect(pendingQuery).resolves.toBe("ready");
  });

  it("ignores an old acknowledgement after controllerchange and proves the replacement", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    serviceWorker.autoHandshake = false;
    const oldController = serviceWorker.worker;
    const replacementMessages: Array<
      VisionCacheCommand | VisionServiceWorkerHandshakeCommand
    > = [];
    const replacement = {
      postMessage: vi.fn(
        (message: VisionCacheCommand | VisionServiceWorkerHandshakeCommand) => {
          replacementMessages.push(message);
        },
      ),
    } as typeof serviceWorker.worker;
    let settled = false;
    const pendingClient = registerApplicationServiceWorker({ serviceWorker });
    void pendingClient.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    const oldHandshake = serviceWorker.handshakes[0]!;

    serviceWorker.changeController(replacement);
    serviceWorker.dispatch(
      {
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: oldHandshake.requestId,
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      },
      oldController,
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    const replacementHandshake = replacementMessages[0]!;
    expect(replacementHandshake).toMatchObject({
      type: "VISION_SW_HANDSHAKE",
      protocol: VISION_SERVICE_WORKER_PROTOCOL,
    });
    serviceWorker.dispatch(
      {
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: replacementHandshake.requestId,
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      },
      replacement,
    );
    await expect(pendingClient).resolves.toBeDefined();
  });

  it("rejects a prior-protocol controller until the replacement proves the current contract", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    serviceWorker.autoHandshake = false;
    const oldController = serviceWorker.worker;
    const replacementMessages: Array<
      VisionCacheCommand | VisionServiceWorkerHandshakeCommand
    > = [];
    const replacement = {
      postMessage: vi.fn(
        (message: VisionCacheCommand | VisionServiceWorkerHandshakeCommand) => {
          replacementMessages.push(message);
        },
      ),
    } as typeof serviceWorker.worker;
    let settled = false;
    const pendingClient = registerApplicationServiceWorker({ serviceWorker });
    void pendingClient.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    const oldHandshake = serviceWorker.handshakes[0]!;

    serviceWorker.dispatch(
      {
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: oldHandshake.requestId,
        protocol: "smart-smile-vision-sw-v1",
      },
      oldController,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(serviceWorker.controllerListeners.size).toBe(1);
    expect(settled).toBe(false);

    serviceWorker.changeController(replacement);
    const replacementHandshake = replacementMessages[0]!;
    serviceWorker.dispatch(
      {
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: replacementHandshake.requestId,
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      },
      replacement,
    );
    await expect(pendingClient).resolves.toBeDefined();
  });

  it("rejects malformed or version-mismatched controller proof and times out as indeterminate", async () => {
    vi.useFakeTimers();
    const serviceWorker = new FakeServiceWorkerContainer();
    serviceWorker.autoHandshake = false;
    const pendingClient = registerApplicationServiceWorker({ serviceWorker });
    await Promise.resolve();
    await Promise.resolve();
    const handshake = serviceWorker.handshakes[0]!;

    serviceWorker.dispatch({
      type: "VISION_SW_HANDSHAKE_ACK",
      requestId: handshake.requestId,
      protocol: "smart-smile-vision-sw-v0",
    });
    serviceWorker.dispatch({
      type: "VISION_SW_HANDSHAKE_ACK",
      requestId: handshake.requestId,
      protocol: VISION_SERVICE_WORKER_PROTOCOL,
      unsafe: true,
    });
    await vi.advanceTimersByTimeAsync(15_000);

    const client = await pendingClient;
    await expect(
      client.queryRelease({ generation: 3, releaseId }),
    ).resolves.toBe("indeterminate");
    expect(serviceWorker.listeners.size).toBe(0);
    expect(serviceWorker.controllerListeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds the full acquisition when service-worker registration never settles", async () => {
    vi.useFakeTimers();
    const serviceWorker = new FakeServiceWorkerContainer();
    let finishRegistration!: (value: { installing: object }) => void;
    serviceWorker.register.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRegistration = resolve;
        }),
    );
    const pendingClient = registerApplicationServiceWorker({ serviceWorker });
    let settled = false;
    void pendingClient.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(15_000);

    expect(settled).toBe(true);
    const client = await pendingClient;
    await expect(
      client.queryRelease({ generation: 3, releaseId }),
    ).resolves.toBe("indeterminate");
    expect(serviceWorker.handshakes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    finishRegistration({ installing: {} });
    await Promise.resolve();
  });

  it("registers and uses only the controlling worker", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const pending = client.queryRelease({ generation: 3, releaseId });
    const sent = serviceWorker.posted[0]!;

    if (import.meta.env.DEV) {
      expect(serviceWorker.register).toHaveBeenCalledWith("/dev-sw.js?dev-sw", {
        type: "module",
      });
    } else {
      expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js");
    }
    expect(sent).toMatchObject({
      type: "QUERY_RELEASE",
      generation: 3,
      releaseId,
    });
    expect(sent.requestId.length).toBeLessThanOrEqual(128);
    serviceWorker.dispatch({
      type: "CACHE_READY",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
    });
    await expect(pending).resolves.toBe("ready");
  });

  it("waits for the page to be controlled before exposing a cache client", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    serviceWorker.controller = null;
    let settled = false;
    const pendingClient = registerApplicationServiceWorker({ serviceWorker });
    void pendingClient.then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(serviceWorker.posted).toEqual([]);

    serviceWorker.claim();
    const client = await pendingClient;
    const pendingQuery = client.queryRelease({ generation: 3, releaseId });
    const sent = serviceWorker.posted[0]!;
    serviceWorker.dispatch({
      type: "CACHE_MISSING",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
    });

    await expect(pendingQuery).resolves.toBe("missing");
  });

  it("messages the controlling worker instead of a different active registration", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const activePostMessage = vi.fn();
    Object.defineProperty(serviceWorker, "ready", {
      configurable: true,
      value: Promise.resolve({ active: { postMessage: activePostMessage } }),
    });

    const client = await registerApplicationServiceWorker({ serviceWorker });
    const pending = client.queryRelease({ generation: 3, releaseId });
    const sent = serviceWorker.posted[0]!;

    expect(activePostMessage).not.toHaveBeenCalled();
    expect(sent).toMatchObject({ type: "QUERY_RELEASE", generation: 3 });
    serviceWorker.dispatch({
      type: "CACHE_MISSING",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
    });
    await expect(pending).resolves.toBe("missing");
  });

  it("preserves a fatal integrity result from a completed-cache query", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const pending = client.queryRelease({ generation: 3, releaseId });
    const sent = serviceWorker.posted[0]!;

    serviceWorker.dispatch({
      type: "CACHE_ERROR",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
      code: "runtime-integrity-failed",
    });

    await expect(pending).resolves.toBe("integrity-failed");
  });

  it("resolves only the matching request once and validates every reply", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const pending = client.queryRelease({ generation: 3, releaseId });
    const sent = serviceWorker.posted[0]!;

    serviceWorker.dispatch({
      type: "CACHE_READY",
      requestId: "another-request",
      generation: 3,
      releaseId,
    });
    serviceWorker.dispatch({
      type: "CACHE_READY",
      requestId: sent.requestId,
      generation: 999,
      releaseId,
    });
    serviceWorker.dispatch({
      type: "CACHE_READY",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
      unsafe: true,
    });
    serviceWorker.dispatch({
      type: "CACHE_MISSING",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
    });
    serviceWorker.dispatch({
      type: "CACHE_READY",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
    });

    await expect(pending).resolves.toBe("missing");
  });

  it("accepts a matching reply only from the selected active worker", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const pending = client.queryRelease({ generation: 3, releaseId });
    const sent = serviceWorker.posted[0]!;
    const matchingReply = {
      type: "CACHE_READY",
      requestId: sent.requestId,
      generation: 3,
      releaseId,
    } as const;
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    serviceWorker.dispatch(matchingReply, { postMessage: vi.fn() });
    serviceWorker.dispatch(matchingReply, null);
    await Promise.resolve();
    expect(settled).toBe(false);

    serviceWorker.dispatch(matchingReply);
    await expect(pending).resolves.toBe("ready");
  });

  it("invalidates in-flight work when the selected worker loses control", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const oldController = serviceWorker.worker;
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const states: VisionCachePreparationState[] = [];
    const pendingQuery = client.queryRelease({ generation: 3, releaseId });
    const pendingCache = client.cacheRelease(
      { generation: 3, manifestUrl, releaseId },
      (state) => states.push(state),
    );
    const secondStates: VisionCachePreparationState[] = [];
    const secondPendingCache = client.cacheRelease(
      { generation: 4, manifestUrl, releaseId },
      (state) => secondStates.push(state),
    );
    const query = serviceWorker.posted.find(
      (command) => command.type === "QUERY_RELEASE",
    )!;
    const cache = serviceWorker.posted.find(
      (command) => command.type === "CACHE_RELEASE",
    )!;
    const replacement = {
      postMessage: vi.fn(),
    } as unknown as typeof serviceWorker.worker;

    serviceWorker.changeController(replacement);
    const cancellationCommands = serviceWorker.posted.filter(
      (command) => command.type === "CANCEL_CACHE",
    );
    expect(cancellationCommands).toEqual([
      expect.objectContaining({
        type: "CANCEL_CACHE",
        generation: 3,
        releaseId,
      }),
      expect.objectContaining({
        type: "CANCEL_CACHE",
        generation: 4,
        releaseId,
      }),
    ]);
    expect(replacement.postMessage).not.toHaveBeenCalled();
    serviceWorker.dispatch(
      {
        type: "CACHE_READY",
        requestId: query.requestId,
        generation: 3,
        releaseId,
      },
      oldController,
    );
    serviceWorker.dispatch(
      {
        type: "CACHE_READY",
        requestId: cache.requestId,
        generation: 3,
        releaseId,
      },
      oldController,
    );

    await expect(pendingQuery).resolves.toBe("indeterminate");
    await expect(pendingCache).resolves.toBe("error");
    await expect(secondPendingCache).resolves.toBe("error");
    expect(states).toEqual(["error"]);
    expect(secondStates).toEqual(["error"]);
    expect(serviceWorker.listeners.size).toBe(0);
    expect(serviceWorker.controllerListeners.size).toBe(0);
  });

  it("reports caching and ready states for an explicit cache request", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const states: VisionCachePreparationState[] = [];
    const pending = client.cacheRelease(
      { generation: 4, manifestUrl, releaseId },
      (state) => states.push(state),
    );
    const sent = serviceWorker.posted[0]!;

    serviceWorker.dispatch({
      type: "CACHE_CACHING",
      requestId: sent.requestId,
      generation: 4,
      releaseId,
    });
    serviceWorker.dispatch({
      type: "CACHE_READY",
      requestId: sent.requestId,
      generation: 4,
      releaseId,
    });

    await expect(pending).resolves.toBe("ready");
    expect(states).toEqual(["caching", "ready"]);
  });

  it("preserves a fatal integrity result from cache population", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const states: VisionCachePreparationState[] = [];
    const pending = client.cacheRelease(
      { generation: 4, manifestUrl, releaseId },
      (state) => states.push(state),
    );
    const sent = serviceWorker.posted[0]!;

    serviceWorker.dispatch({
      type: "CACHE_CACHING",
      requestId: sent.requestId,
      generation: 4,
      releaseId,
    });
    serviceWorker.dispatch({
      type: "CACHE_ERROR",
      requestId: sent.requestId,
      generation: 4,
      releaseId,
      code: "runtime-integrity-failed",
    });

    await expect(pending).resolves.toBe("integrity-failed");
    expect(states).toEqual(["caching", "integrity-failed"]);
  });

  it("bounds requests to 15 seconds", async () => {
    vi.useFakeTimers();
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const states: VisionCachePreparationState[] = [];
    const pending = client.cacheRelease(
      { generation: 4, manifestUrl, releaseId },
      (state) => states.push(state),
    );
    const release = serviceWorker.posted[0]!;

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toBe("error");
    expect(states).toEqual(["error"]);
    expect(serviceWorker.posted[1]).toMatchObject({
      type: "CANCEL_CACHE",
      generation: 4,
      releaseId,
    });

    serviceWorker.dispatch({
      type: "CACHE_READY",
      requestId: release.requestId,
      generation: 4,
      releaseId,
    });
    await Promise.resolve();
    expect(states).toEqual(["error"]);
    expect(serviceWorker.posted).toHaveLength(2);
  });

  it("reports a cache-query timeout as indeterminate instead of missing", async () => {
    vi.useFakeTimers();
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const pending = client.queryRelease({ generation: 4, releaseId });

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toBe("indeterminate");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("posts a bounded cancellation command without awaiting a reply", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });

    client.cancel({ generation: 4, releaseId });

    expect(serviceWorker.posted[0]).toMatchObject({
      type: "CANCEL_CACHE",
      generation: 4,
      releaseId,
    });
    expect(serviceWorker.posted[0]?.requestId.length).toBeLessThanOrEqual(128);
  });

  it("degrades safely when registration fails", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    serviceWorker.register.mockRejectedValueOnce(
      new Error("private registration failure"),
    );
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const states: VisionCachePreparationState[] = [];

    await expect(
      client.cacheRelease({ generation: 4, manifestUrl, releaseId }, (state) =>
        states.push(state),
      ),
    ).resolves.toBe("error");
    await expect(
      client.queryRelease({ generation: 4, releaseId }),
    ).resolves.toBe("indeterminate");
    expect(states).toEqual(["error"]);
    expect(serviceWorker.posted).toEqual([]);
  });

  it("cleans pending state and degrades safely when postMessage throws", async () => {
    vi.useFakeTimers();
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    serviceWorker.worker.postMessage.mockImplementation(() => {
      throw new Error("private post failure");
    });
    const states: VisionCachePreparationState[] = [];

    await expect(
      client.cacheRelease({ generation: 4, manifestUrl, releaseId }, (state) =>
        states.push(state),
      ),
    ).resolves.toBe("error");
    await expect(
      client.queryRelease({ generation: 4, releaseId }),
    ).resolves.toBe("indeterminate");
    expect(() => client.cancel({ generation: 4, releaseId })).not.toThrow();
    expect(states).toEqual(["error"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares an acquisition attempt but retries after failure and caches only verified clients", async () => {
    vi.useFakeTimers();
    const production = new FakeServiceWorkerContainer();
    production.autoHandshake = false;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: production,
    });

    const first = registerApplicationServiceWorker();
    const second = registerApplicationServiceWorker();

    expect(second).toBe(first);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);
    const degraded = await first;
    await expect(
      degraded.queryRelease({ generation: 4, releaseId }),
    ).resolves.toBe("indeterminate");
    expect(production.register).toHaveBeenCalledOnce();

    production.autoHandshake = true;
    production.changeController(null);
    production.claim();
    const recovered = await registerApplicationServiceWorker();
    const pending = recovered.queryRelease({ generation: 4, releaseId });
    const query = production.posted[0]!;
    production.dispatch({
      type: "CACHE_READY",
      requestId: query.requestId,
      generation: 4,
      releaseId,
    });
    await expect(pending).resolves.toBe("ready");
    expect(production.register).toHaveBeenCalledTimes(2);

    await registerApplicationServiceWorker();
    expect(production.register).toHaveBeenCalledTimes(2);

    const injected = new FakeServiceWorkerContainer();
    await registerApplicationServiceWorker({ serviceWorker: injected });
    expect(injected.register).toHaveBeenCalledOnce();
    expect(production.register).toHaveBeenCalledTimes(2);
  });
});
