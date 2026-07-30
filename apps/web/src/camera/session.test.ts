import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAMERA_PERMISSION_TIMEOUT_MS,
  CameraSession,
  createInitialCameraSnapshot,
  mapCameraError,
} from "./session";

type FakeTrack = EventTarget & {
  stop: ReturnType<typeof vi.fn>;
  getCapabilities: () => MediaTrackCapabilities;
  getSettings: () => MediaTrackSettings;
};

function makeTrack(
  options: {
    facingMode?: string;
    facingModes?: string[];
    height?: number;
    width?: number;
  } = {},
): FakeTrack {
  const track = new EventTarget() as FakeTrack;
  track.stop = vi.fn();
  track.getCapabilities = () =>
    ({
      facingMode: options.facingModes ?? [options.facingMode ?? "user"],
    }) as MediaTrackCapabilities;
  track.getSettings = () => ({
    facingMode: options.facingMode ?? "user",
    height: options.height ?? 720,
    width: options.width ?? 1280,
  });
  return track;
}

function makeStream(track = makeTrack()): MediaStream {
  return {
    getTracks: () => [track as unknown as MediaStreamTrack],
    getVideoTracks: () => [track as unknown as MediaStreamTrack],
  } as unknown as MediaStream;
}

function createHarness(
  options: {
    getUserMedia?: (
      constraints: MediaStreamConstraints,
    ) => Promise<MediaStream>;
    enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
    mobile?: boolean;
  } = {},
) {
  const getUserMedia = vi.fn(
    options.getUserMedia ?? (() => Promise.resolve(makeStream())),
  );
  const enumerateDevices = vi.fn(
    options.enumerateDevices ?? (() => Promise.resolve([])),
  );
  const attachAndPlay = vi.fn(() =>
    Promise.resolve({ height: 720, width: 1280 }),
  );
  const session = new CameraSession({
    attachAndPlay,
    enumerateDevices,
    getUserMedia,
    isMobile: () => options.mobile ?? false,
    isSecureContext: () => true,
  });
  return { attachAndPlay, enumerateDevices, getUserMedia, session };
}

describe("camera constraints and recovery mapping", () => {
  it("requests video only with non-exact ideals and uses the front camera only on mobile", async () => {
    const mobile = createHarness({ mobile: true });
    await mobile.session.start();

    expect(mobile.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        frameRate: { ideal: 30 },
        height: { ideal: 720 },
        width: { ideal: 1280 },
      },
    });

    const desktop = createHarness({ mobile: false });
    await desktop.session.start();
    expect(desktop.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        frameRate: { ideal: 30 },
        height: { ideal: 720 },
        width: { ideal: 1280 },
      },
    });
  });

  it.each([
    ["NotAllowedError", "denied-permission"],
    ["NotFoundError", "missing-camera"],
    ["NotReadableError", "busy-unreadable-camera"],
    ["OverconstrainedError", "overconstrained-request"],
    ["AbortError", "aborted-request"],
    ["InvalidStateError", "inactive-document"],
  ] as const)("maps %s to the stable %s reason", (name, reason) => {
    expect(mapCameraError({ name })).toBe(reason);
  });
});

describe("camera session lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not request media until start is explicitly invoked", () => {
    const { getUserMedia, session } = createHarness();
    expect(session.snapshot).toEqual(createInitialCameraSnapshot());
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("disposes a stream that resolves after the ignored-prompt timeout", async () => {
    vi.useFakeTimers();
    let resolveStream!: (stream: MediaStream) => void;
    const { session } = createHarness({
      getUserMedia: () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        }),
    });

    const pending = session.start();
    await vi.advanceTimersByTimeAsync(CAMERA_PERMISSION_TIMEOUT_MS);
    await pending;
    expect(session.snapshot.reason).toBe("ignored-prompt");

    const lateTrack = makeTrack();
    resolveStream(makeStream(lateTrack));
    await Promise.resolve();
    expect(lateTrack.stop).toHaveBeenCalledOnce();
    expect(session.snapshot.generation).toBe(0);
  });

  it("cancels an unsettled request on stop and disposes its late stream", async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const { session } = createHarness({
      getUserMedia: () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        }),
    });
    const pending = session.start();
    session.stop();
    await pending;

    const lateTrack = makeTrack();
    resolveStream(makeStream(lateTrack));
    await Promise.resolve();
    expect(lateTrack.stop).toHaveBeenCalledOnce();
    expect(session.snapshot.state).toBe("stopped");
  });

  it("increments generation only after a stream is attached and enters warm-up", async () => {
    vi.useFakeTimers();
    const { session } = createHarness();
    await session.start();

    expect(session.snapshot).toMatchObject({
      generation: 1,
      state: "warm-up",
    });
  });

  it("retains the working stream when a switch candidate fails", async () => {
    const firstTrack = makeTrack({ facingModes: ["user", "environment"] });
    const firstStream = makeStream(firstTrack);
    const { getUserMedia, session } = createHarness({
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(firstStream)
        .mockRejectedValueOnce({ name: "NotReadableError" }),
    });
    await session.start();
    await session.switchCamera();

    expect(firstTrack.stop).not.toHaveBeenCalled();
    expect(session.snapshot).toMatchObject({
      reason: "switch-failed",
      state: "ready",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("validates a switch candidate before replacing the active stream and increments once", async () => {
    const firstTrack = makeTrack({ facingModes: ["user", "environment"] });
    const secondTrack = makeTrack({ facingMode: "environment" });
    const { session } = createHarness({
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(firstTrack))
        .mockResolvedValueOnce(makeStream(secondTrack)),
    });
    await session.start();
    await session.switchCamera();

    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(session.snapshot).toMatchObject({
      facingMode: "environment",
      generation: 2,
      state: "warm-up",
    });
  });

  it("stops tracks and safely restarts when visibility returns", async () => {
    vi.useFakeTimers();
    const firstTrack = makeTrack();
    const secondTrack = makeTrack();
    const { session } = createHarness({
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(firstTrack))
        .mockResolvedValueOnce(makeStream(secondTrack)),
    });
    await session.start();
    session.setVisibility(false);
    expect(firstTrack.stop).toHaveBeenCalledOnce();
    await session.setVisibility(true);

    expect(session.snapshot).toMatchObject({ generation: 2, state: "warm-up" });
  });

  it("reconstructs after orientation changes with one new generation", async () => {
    const firstTrack = makeTrack();
    const secondTrack = makeTrack();
    const { session } = createHarness({
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(firstTrack))
        .mockResolvedValueOnce(makeStream(secondTrack)),
    });
    await session.start();
    await session.reconstructForOrientation();

    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(session.snapshot).toMatchObject({ generation: 2, state: "warm-up" });
  });

  it("invalidates an interrupted track and stops owned tracks on teardown", async () => {
    const track = makeTrack();
    const { session } = createHarness({
      getUserMedia: () => Promise.resolve(makeStream(track)),
    });
    await session.start();
    track.dispatchEvent(new Event("ended"));
    expect(session.snapshot).toMatchObject({
      reason: "interruption",
      state: "recoverable-error",
    });

    session.dispose();
    expect(track.stop).toHaveBeenCalled();
  });
});
