import { afterEach, describe, expect, it, vi } from "vitest";
import type { VisionFrameCommand } from "./protocol";
import {
  createBrowserFaceFramePump,
  createFaceFramePump,
} from "./face-frame-pump";

function bitmap() {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

function deferredBitmap() {
  let resolve!: (value: ImageBitmap) => void;
  const promise = new Promise<ImageBitmap>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("face frame pump", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("constrains a landscape frame to a 640 px longest side", async () => {
    const image = bitmap();
    const capture = vi.fn(async () => image);
    const submit = vi.fn(() => true);
    const pump = createFaceFramePump({ capture, now: () => 123, submit });

    await expect(
      pump.tick({
        generation: 3,
        cameraGeneration: 9,
        width: 1280,
        height: 720,
      }),
    ).resolves.toBe(true);

    expect(capture).toHaveBeenCalledWith({ width: 640, height: 360 });
    expect(submit).toHaveBeenCalledWith({
      type: "FRAME",
      generation: 3,
      cameraGeneration: 9,
      sequence: 0,
      capturedAtMs: 123,
      width: 640,
      height: 360,
      orientation: "landscape",
      tier: "standard",
      bitmap: image,
    });
  });

  it("preserves portrait aspect ratio without upscaling", async () => {
    const capture = vi.fn(async () => bitmap());
    const submit = vi.fn(() => true);
    const pump = createFaceFramePump({ capture, now: () => 50, submit });

    await pump.tick({
      generation: 4,
      cameraGeneration: 0,
      width: 360,
      height: 640,
    });

    expect(capture).toHaveBeenCalledWith({ width: 360, height: 640 });
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: 4,
        sequence: 0,
        orientation: "portrait",
      }),
    );
  });

  it.each([
    { width: 0, height: 720 },
    { width: 1280, height: 0 },
  ])(
    "does not capture zero-sized video dimensions: $width x $height",
    async (size) => {
      const capture = vi.fn(async () => bitmap());
      const submit = vi.fn(() => true);
      const pump = createFaceFramePump({ capture, now: () => 0, submit });

      await expect(
        pump.tick({ generation: 0, cameraGeneration: 0, ...size }),
      ).resolves.toBe(false);
      expect(capture).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
    },
  );

  it("does not overlap capture promises", async () => {
    const pending = deferredBitmap();
    const capture = vi.fn(() => pending.promise);
    const submit = vi.fn(() => true);
    const pump = createFaceFramePump({ capture, now: () => 0, submit });

    const first = pump.tick({
      generation: 0,
      cameraGeneration: 0,
      width: 640,
      height: 360,
    });
    await expect(
      pump.tick({
        generation: 0,
        cameraGeneration: 0,
        width: 640,
        height: 360,
      }),
    ).resolves.toBe(false);
    expect(capture).toHaveBeenCalledOnce();

    pending.resolve(bitmap());
    await expect(first).resolves.toBe(true);
    expect(submit).toHaveBeenCalledOnce();
  });

  it("timestamps the completed bitmap immediately before submission", async () => {
    const pending = deferredBitmap();
    const image = bitmap();
    let monotonicNow = 100;
    const submit = vi.fn(() => true);
    const pump = createFaceFramePump({
      capture: vi.fn(() => pending.promise),
      now: () => monotonicNow,
      submit,
    });

    const tick = pump.tick({
      generation: 2,
      cameraGeneration: 4,
      width: 640,
      height: 360,
    });
    monotonicNow = 275;
    pending.resolve(image);

    await expect(tick).resolves.toBe(true);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ capturedAtMs: 275, bitmap: image }),
    );
  });

  it("closes an invalidated delayed capture without timestamping or submitting it", async () => {
    const pending = deferredBitmap();
    const image = bitmap();
    const now = vi.fn(() => 275);
    const submit = vi.fn(() => true);
    const pump = createFaceFramePump({
      capture: vi.fn(() => pending.promise),
      now,
      submit,
    });

    const tick = pump.tick({
      generation: 2,
      cameraGeneration: 4,
      width: 640,
      height: 360,
    });
    pump.stop();
    pending.resolve(image);

    await expect(tick).resolves.toBe(false);
    expect(image.close).toHaveBeenCalledOnce();
    expect(now).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("closes a captured bitmap when submission fails", async () => {
    const image = bitmap();
    const pump = createFaceFramePump({
      capture: vi.fn(async () => image),
      now: () => 0,
      submit: vi.fn(() => false),
    });

    await expect(
      pump.tick({
        generation: 0,
        cameraGeneration: 0,
        width: 640,
        height: 360,
      }),
    ).resolves.toBe(false);
    expect(image.close).toHaveBeenCalledOnce();
  });

  it("closes a captured bitmap when submission throws", async () => {
    const image = bitmap();
    const pump = createFaceFramePump({
      capture: vi.fn(async () => image),
      now: () => 0,
      submit: vi.fn(() => {
        throw new Error("submit failed");
      }),
    });

    await expect(
      pump.tick({
        generation: 0,
        cameraGeneration: 0,
        width: 640,
        height: 360,
      }),
    ).resolves.toBe(false);
    expect(image.close).toHaveBeenCalledOnce();
  });

  it("resets sequence numbering when generation changes", async () => {
    const commands: VisionFrameCommand[] = [];
    const pump = createFaceFramePump({
      capture: vi.fn(async () => bitmap()),
      now: () => 0,
      submit: vi.fn((command: VisionFrameCommand) => {
        commands.push(command);
        return true;
      }),
    });

    await pump.tick({
      generation: 3,
      cameraGeneration: 0,
      width: 640,
      height: 360,
    });
    await pump.tick({
      generation: 3,
      cameraGeneration: 0,
      width: 640,
      height: 360,
    });
    await pump.tick({
      generation: 4,
      cameraGeneration: 1,
      width: 640,
      height: 360,
    });

    expect(
      commands.map(({ generation, sequence }) => [generation, sequence]),
    ).toEqual([
      [3, 0],
      [3, 1],
      [4, 0],
    ]);
  });

  it("stop invalidates capture in progress, closes it, and permits a fresh start", async () => {
    const pending = deferredBitmap();
    const later = bitmap();
    const capture = vi
      .fn<() => Promise<ImageBitmap>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(later);
    const submit = vi.fn(() => true);
    const pump = createFaceFramePump({ capture, now: () => 0, submit });
    const oldTick = pump.tick({
      generation: 2,
      cameraGeneration: 0,
      width: 640,
      height: 360,
    });
    const oldBitmap = bitmap();

    pump.stop();
    pending.resolve(oldBitmap);
    await expect(oldTick).resolves.toBe(false);
    expect(oldBitmap.close).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();

    await expect(
      pump.tick({
        generation: 3,
        cameraGeneration: 1,
        width: 640,
        height: 360,
      }),
    ).resolves.toBe(true);
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ generation: 3, sequence: 0, bitmap: later }),
    );
  });

  it("dispose closes capture in progress and permanently rejects ticks", async () => {
    const pending = deferredBitmap();
    const capture = vi.fn(() => pending.promise);
    const submit = vi.fn(() => true);
    const pump = createFaceFramePump({ capture, now: () => 0, submit });
    const oldTick = pump.tick({
      generation: 2,
      cameraGeneration: 0,
      width: 640,
      height: 360,
    });
    const oldBitmap = bitmap();

    pump.dispose();
    pending.resolve(oldBitmap);
    await expect(oldTick).resolves.toBe(false);
    expect(oldBitmap.close).toHaveBeenCalledOnce();
    await expect(
      pump.tick({
        generation: 3,
        cameraGeneration: 1,
        width: 640,
        height: 360,
      }),
    ).resolves.toBe(false);
    expect(capture).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it("uses createImageBitmap resize options for browser video capture", async () => {
    const image = bitmap();
    const createImageBitmap = vi.fn(async () => image);
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const video = document.createElement("video");
    const pump = createBrowserFaceFramePump({
      video,
      now: () => 25,
      submit: vi.fn(() => true),
    });

    await pump.tick({
      generation: 1,
      cameraGeneration: 0,
      width: 1280,
      height: 720,
    });

    expect(createImageBitmap).toHaveBeenCalledWith(video, {
      resizeWidth: 640,
      resizeHeight: 360,
      resizeQuality: "medium",
    });
  });
});
