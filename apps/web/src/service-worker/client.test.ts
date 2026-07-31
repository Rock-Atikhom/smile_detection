import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VisionCacheCommand, VisionCacheEvent } from "../vision/protocol";
import { registerApplicationServiceWorker } from "./client";

const releaseId = "0123456789abcdef";
const manifestUrl = "/vision/release-manifest.json";

class FakeServiceWorkerContainer {
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly posted: VisionCacheCommand[] = [];
  readonly register = vi.fn(async () => ({ installing: {} }));
  readonly worker = {
    postMessage: vi.fn((command: VisionCacheCommand) =>
      this.posted.push(command),
    ),
  };
  readonly ready = Promise.resolve({ active: this.worker });

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) {
    this.listeners.add(listener);
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

  it("waits for ready and uses only its active worker", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const pending = client.queryRelease({ generation: 3, releaseId });
    const sent = serviceWorker.posted[0]!;

    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js");
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

  it("reports caching and ready states for an explicit cache request", async () => {
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const states: Array<"caching" | "ready" | "error"> = [];
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

  it("bounds requests to 15 seconds", async () => {
    vi.useFakeTimers();
    const serviceWorker = new FakeServiceWorkerContainer();
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const states: Array<"caching" | "ready" | "error"> = [];
    const pending = client.cacheRelease(
      { generation: 4, manifestUrl, releaseId },
      (state) => states.push(state),
    );

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toBe("error");
    expect(states).toEqual(["error"]);
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
    const states: Array<"caching" | "ready" | "error"> = [];

    await expect(
      client.cacheRelease({ generation: 4, manifestUrl, releaseId }, (state) =>
        states.push(state),
      ),
    ).resolves.toBe("error");
    await expect(
      client.queryRelease({ generation: 4, releaseId }),
    ).resolves.toBe("missing");
    expect(states).toEqual(["error"]);
    expect(serviceWorker.posted).toEqual([]);
  });

  it("cleans pending state and degrades safely when postMessage throws", async () => {
    vi.useFakeTimers();
    const serviceWorker = new FakeServiceWorkerContainer();
    serviceWorker.worker.postMessage.mockImplementation(() => {
      throw new Error("private post failure");
    });
    const client = await registerApplicationServiceWorker({ serviceWorker });
    const states: Array<"caching" | "ready" | "error"> = [];

    await expect(
      client.cacheRelease({ generation: 4, manifestUrl, releaseId }, (state) =>
        states.push(state),
      ),
    ).resolves.toBe("error");
    await expect(
      client.queryRelease({ generation: 4, releaseId }),
    ).resolves.toBe("missing");
    expect(() => client.cancel({ generation: 4, releaseId })).not.toThrow();
    expect(states).toEqual(["error"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares one production registration promise without coupling injected clients", async () => {
    const production = new FakeServiceWorkerContainer();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: production,
    });

    const first = registerApplicationServiceWorker();
    const second = registerApplicationServiceWorker();

    expect(second).toBe(first);
    await expect(first).resolves.toBeDefined();
    expect(production.register).toHaveBeenCalledOnce();
    expect(production.listeners.size).toBe(1);

    const injected = new FakeServiceWorkerContainer();
    await registerApplicationServiceWorker({ serviceWorker: injected });
    expect(injected.register).toHaveBeenCalledOnce();
    expect(production.register).toHaveBeenCalledOnce();
  });
});
