import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VisionWorkerEvent } from "./protocol";
import type {
  PreparedVisionRuntime,
  PrepareVisionRuntimeInput,
  VisionRuntimeDependencies,
} from "./runtime-loader";

vi.mock("./runtime-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./runtime-loader")>();
  return { ...actual, prepareVisionRuntime: vi.fn() };
});

import { prepareVisionRuntime, VisionRuntimeError } from "./runtime-loader";
import { VISION_MANIFEST } from "./release";
import { createVisionWorkerRuntime } from "./worker-runtime";

const releaseId = "0123456789abcdef";
const manifestUrl = "/vision/release-manifest.json";
const unusedDependencies: VisionRuntimeDependencies = {
  createLandmarker: vi.fn(),
  fetch: vi.fn(),
  manifest: VISION_MANIFEST,
  supportsSimd: vi.fn(),
};

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function prepared(wasmTier: "simd" | "baseline" = "simd") {
  return {
    close: vi.fn<() => void>(),
    detectForVideo: vi.fn(),
    wasmTier,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function prepareCommand(generation: number) {
  return { type: "PREPARE", generation, manifestUrl, releaseId } as const;
}

describe("createVisionWorkerRuntime", () => {
  beforeEach(() => {
    vi.mocked(prepareVisionRuntime).mockReset();
  });

  it("posts READY for the current generation and closes it on matching cancel", async () => {
    const instance = prepared();
    vi.mocked(prepareVisionRuntime).mockResolvedValue(instance);
    const postMessage = vi.fn<(event: VisionWorkerEvent) => void>();
    const runtime = createVisionWorkerRuntime(unusedDependencies, postMessage);

    runtime.receive(prepareCommand(4));
    await flushPromises();

    expect(postMessage).toHaveBeenCalledWith({
      type: "READY",
      generation: 4,
      releaseId,
      wasmTier: "simd",
    });
    runtime.receive({ type: "CANCEL", generation: 4 });
    expect(instance.close).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    { type: "FRAME", generation: 4 },
    { type: "PREPARE", generation: -1, manifestUrl, releaseId },
    { type: "CANCEL", generation: 4, extra: true },
  ])("ignores malformed or out-of-scope input %#", (message) => {
    const postMessage = vi.fn<(event: VisionWorkerEvent) => void>();
    const runtime = createVisionWorkerRuntime(unusedDependencies, postMessage);

    runtime.receive(message);

    expect(prepareVisionRuntime).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("forwards truthful preparation phases before READY", async () => {
    const instance = prepared("baseline");
    vi.mocked(prepareVisionRuntime).mockImplementation(
      async (input: PrepareVisionRuntimeInput) => {
        input.onPhase("verifying");
        input.onPhase("initializing");
        return instance;
      },
    );
    const events: VisionWorkerEvent[] = [];
    const runtime = createVisionWorkerRuntime(unusedDependencies, (event) => {
      events.push(event);
    });

    runtime.receive(prepareCommand(4));
    await flushPromises();

    expect(events).toEqual([
      { type: "PHASE", generation: 4, phase: "verifying" },
      { type: "PHASE", generation: 4, phase: "initializing" },
      {
        type: "READY",
        generation: 4,
        releaseId,
        wasmTier: "baseline",
      },
    ]);
  });

  it("closes a late completion and posts nothing after matching cancel", async () => {
    const pending = deferred<PreparedVisionRuntime>();
    const instance = prepared();
    vi.mocked(prepareVisionRuntime).mockReturnValue(pending.promise);
    const postMessage = vi.fn<(event: VisionWorkerEvent) => void>();
    const runtime = createVisionWorkerRuntime(unusedDependencies, postMessage);

    runtime.receive(prepareCommand(4));
    const input = vi.mocked(prepareVisionRuntime).mock.calls[0]?.[0];
    runtime.receive({ type: "CANCEL", generation: 4 });
    input?.onPhase("initializing");
    pending.resolve(instance);
    await flushPromises();

    expect(input?.signal.aborted).toBe(true);
    expect(instance.close).toHaveBeenCalledOnce();
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "READY" }),
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "PHASE" }),
    );
  });

  it("ignores cancellation for a different generation", async () => {
    const instance = prepared();
    vi.mocked(prepareVisionRuntime).mockResolvedValue(instance);
    const runtime = createVisionWorkerRuntime(unusedDependencies, vi.fn());

    runtime.receive(prepareCommand(4));
    await flushPromises();
    runtime.receive({ type: "CANCEL", generation: 3 });

    expect(instance.close).not.toHaveBeenCalled();
  });

  it("lets only a newer generation become live", async () => {
    const oldPending = deferred<PreparedVisionRuntime>();
    const newPending = deferred<PreparedVisionRuntime>();
    const oldInstance = prepared();
    const newInstance = prepared("baseline");
    vi.mocked(prepareVisionRuntime)
      .mockReturnValueOnce(oldPending.promise)
      .mockReturnValueOnce(newPending.promise);
    const postMessage = vi.fn<(event: VisionWorkerEvent) => void>();
    const runtime = createVisionWorkerRuntime(unusedDependencies, postMessage);

    runtime.receive(prepareCommand(4));
    const oldInput = vi.mocked(prepareVisionRuntime).mock.calls[0]?.[0];
    runtime.receive(prepareCommand(5));
    newPending.resolve(newInstance);
    oldPending.resolve(oldInstance);
    await flushPromises();

    expect(oldInput?.signal.aborted).toBe(true);
    expect(oldInstance.close).toHaveBeenCalledOnce();
    expect(newInstance.close).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: "READY",
      generation: 5,
      releaseId,
      wasmTier: "baseline",
    });
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "READY", generation: 4 }),
    );
  });

  it("closes the live instance before preparing a newer generation", async () => {
    const first = prepared();
    const secondPending = deferred<PreparedVisionRuntime>();
    vi.mocked(prepareVisionRuntime)
      .mockResolvedValueOnce(first)
      .mockReturnValueOnce(secondPending.promise);
    const runtime = createVisionWorkerRuntime(unusedDependencies, vi.fn());

    runtime.receive(prepareCommand(4));
    await flushPromises();
    runtime.receive(prepareCommand(5));

    expect(first.close).toHaveBeenCalledOnce();
  });

  it.each([
    [
      new VisionRuntimeError("runtime-download-failed"),
      "runtime-download-failed",
      true,
    ],
    [
      new VisionRuntimeError("runtime-integrity-failed"),
      "runtime-integrity-failed",
      false,
    ],
    [
      new VisionRuntimeError("offline-cache-failed"),
      "offline-cache-failed",
      true,
    ],
    [
      new Error("private upstream details"),
      "runtime-initialization-failed",
      true,
    ],
  ] as const)(
    "maps loader failure %# to a bounded ERROR",
    async (failure, code, recoverable) => {
      vi.mocked(prepareVisionRuntime).mockRejectedValue(failure);
      const postMessage = vi.fn<(event: VisionWorkerEvent) => void>();
      const runtime = createVisionWorkerRuntime(
        unusedDependencies,
        postMessage,
      );

      runtime.receive(prepareCommand(4));
      await flushPromises();

      expect(postMessage).toHaveBeenCalledWith({
        type: "ERROR",
        generation: 4,
        code,
        recoverable,
      });
      expect(JSON.stringify(postMessage.mock.calls)).not.toContain(
        "private upstream details",
      );
    },
  );

  it("disposal aborts preparation, closes the live instance, and ignores later input", async () => {
    const instance = prepared();
    vi.mocked(prepareVisionRuntime).mockResolvedValue(instance);
    const postMessage = vi.fn<(event: VisionWorkerEvent) => void>();
    const runtime = createVisionWorkerRuntime(unusedDependencies, postMessage);
    runtime.receive(prepareCommand(4));
    await flushPromises();
    const input = vi.mocked(prepareVisionRuntime).mock.calls[0]?.[0];

    runtime.dispose();
    runtime.dispose();
    runtime.receive(prepareCommand(5));

    expect(input?.signal.aborted).toBe(true);
    expect(instance.close).toHaveBeenCalledOnce();
    expect(prepareVisionRuntime).toHaveBeenCalledOnce();
  });
});
