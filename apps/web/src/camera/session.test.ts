import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAMERA_PERMISSION_TIMEOUT_MS,
  CAMERA_WARMUP_MS,
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
    deviceId?: string;
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
    deviceId: options.deviceId,
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
    attachAndPlay?: (
      stream: MediaStream,
      signal: AbortSignal,
    ) => Promise<{ height: number; width: number }>;
    restore?: (stream: MediaStream, signal: AbortSignal) => Promise<void>;
    mobile?: boolean;
  } = {},
) {
  const getUserMedia = vi.fn(
    options.getUserMedia ?? (() => Promise.resolve(makeStream())),
  );
  const enumerateDevices = vi.fn(
    options.enumerateDevices ?? (() => Promise.resolve([])),
  );
  const attachAndPlay = vi.fn(
    options.attachAndPlay ??
      (() => Promise.resolve({ height: 720, width: 1280 })),
  );
  const session = new CameraSession({
    attachAndPlay,
    enumerateDevices,
    getUserMedia,
    isMobile: () => options.mobile ?? false,
    isSecureContext: () => true,
    restore: options.restore,
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

  it("does not resume after a pre-stream request failure", async () => {
    const { getUserMedia, session } = createHarness({
      getUserMedia: vi.fn(() => Promise.reject({ name: "NotAllowedError" })),
    });
    await session.start();
    session.setVisibility(false);
    await session.setVisibility(true);

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(session.snapshot).toMatchObject({
      reason: "denied-permission",
      state: "recoverable-error",
    });
  });

  it("suspends an in-flight permission request while the tab is hidden", async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const { session } = createHarness({
      getUserMedia: () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        }),
    });
    const pending = session.start();
    session.setVisibility(false);
    await pending;
    const lateTrack = makeTrack();
    resolveStream(makeStream(lateTrack));
    await Promise.resolve();

    expect(lateTrack.stop).toHaveBeenCalled();
    expect(session.snapshot).toMatchObject({
      reason: "inactive-document",
      state: "stopped",
    });
  });

  it("stops a candidate already acquired but still waiting for its decoded frame", async () => {
    let resolveAttachment!: (value: { height: number; width: number }) => void;
    const track = makeTrack();
    const { attachAndPlay, session } = createHarness({
      attachAndPlay: () =>
        new Promise((resolve) => {
          resolveAttachment = resolve;
        }),
      getUserMedia: () => Promise.resolve(makeStream(track)),
    });
    const pending = session.start();
    await vi.waitFor(() => expect(attachAndPlay).toHaveBeenCalledOnce());
    session.stop();
    resolveAttachment({ height: 720, width: 1280 });
    await pending;

    expect(track.stop).toHaveBeenCalled();
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

  it("offers facing-mode switching on mobile when enumeration exposes only the active camera", async () => {
    const mobileTrack = makeTrack({ deviceId: "front", facingMode: "user" });
    const rearTrack = makeTrack({ facingMode: "environment" });
    const { getUserMedia, session } = createHarness({
      enumerateDevices: () =>
        Promise.resolve([
          { deviceId: "front", kind: "videoinput" },
        ] as MediaDeviceInfo[]),
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(mobileTrack))
        .mockResolvedValueOnce(makeStream(rearTrack)),
      mobile: true,
    });

    await session.start();
    await vi.waitFor(() => expect(session.snapshot.canSwitch).toBe(true));
    await session.switchCamera();

    expect(getUserMedia.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        video: expect.objectContaining({
          facingMode: { exact: "environment" },
        }),
      }),
    );
    expect(session.snapshot).toMatchObject({
      facingMode: "environment",
      generation: 2,
      state: "warm-up",
    });
  });

  it("invalidates the public generation immediately when an active track ends", async () => {
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
    expect(session.snapshot.generation).toBe(1);

    firstTrack.dispatchEvent(new Event("ended"));
    expect(session.snapshot).toMatchObject({
      generation: 2,
      reason: "interruption",
      state: "recoverable-error",
    });
    await vi.advanceTimersByTimeAsync(CAMERA_WARMUP_MS);
    expect(session.snapshot).toMatchObject({
      generation: 2,
      reason: "interruption",
      state: "recoverable-error",
    });
    await session.restart();
    expect(session.snapshot).toMatchObject({ generation: 3, state: "warm-up" });
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
      state: "warm-up",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(session.snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        "state:camera-switching",
        "reason:switch-failed",
      ]),
    );
  });

  it("cannot let a superseded switch overwrite an intentional stop", async () => {
    let resolveCandidate!: (stream: MediaStream) => void;
    const firstTrack = makeTrack({ facingModes: ["user", "environment"] });
    const candidateTrack = makeTrack({ facingMode: "environment" });
    const { session } = createHarness({
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(firstTrack))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveCandidate = resolve;
            }),
        ),
    });
    await session.start();
    const switching = session.switchCamera();
    await Promise.resolve();
    session.stop();
    resolveCandidate(makeStream(candidateTrack));
    await switching;

    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(candidateTrack.stop).toHaveBeenCalledOnce();
    expect(session.snapshot.state).toBe("stopped");
  });

  it("switches to an enumerated device other than the delivered current device", async () => {
    const firstTrack = makeTrack({
      facingModes: ["user", "environment"],
      deviceId: "second",
    });
    const { getUserMedia, session } = createHarness({
      enumerateDevices: () =>
        Promise.resolve([
          { deviceId: "first", kind: "videoinput" },
          { deviceId: "second", kind: "videoinput" },
        ] as MediaDeviceInfo[]),
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(firstTrack))
        .mockResolvedValueOnce(makeStream(makeTrack())),
    });
    await session.start();
    await Promise.resolve();
    await session.switchCamera();

    expect(getUserMedia).toHaveBeenLastCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ deviceId: { exact: "first" } }),
      }),
    );
  });

  it("cycles through every enumerated camera and rejects a delivered duplicate", async () => {
    const firstTrack = makeTrack({ deviceId: "A" });
    const secondTrack = makeTrack({ deviceId: "B" });
    const thirdTrack = makeTrack({ deviceId: "C" });
    const returnedTrack = makeTrack({ deviceId: "A" });
    const duplicateTrack = makeTrack({ deviceId: "A" });
    const devices = ["A", "B", "C"].map(
      (deviceId) => ({ deviceId, kind: "videoinput" }) as MediaDeviceInfo,
    );
    const { getUserMedia, session } = createHarness({
      enumerateDevices: () => Promise.resolve(devices),
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(firstTrack))
        .mockResolvedValueOnce(makeStream(secondTrack))
        .mockResolvedValueOnce(makeStream(thirdTrack))
        .mockResolvedValueOnce(makeStream(returnedTrack))
        .mockResolvedValueOnce(makeStream(duplicateTrack)),
    });
    await session.start();
    await Promise.resolve();
    await session.switchCamera();
    await session.switchCamera();
    await session.switchCamera();
    await session.switchCamera();

    expect(
      getUserMedia.mock.calls.slice(1).map(([constraints]) => {
        const video = constraints.video as MediaTrackConstraints;
        return (video.deviceId as ConstrainDOMStringParameters).exact;
      }),
    ).toEqual(["B", "C", "A", "B"]);
    expect(secondTrack.stop).toHaveBeenCalledOnce();
    expect(thirdTrack.stop).toHaveBeenCalledOnce();
    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(returnedTrack.stop).not.toHaveBeenCalled();
    expect(session.snapshot).toMatchObject({
      reason: "switch-failed",
      state: "warm-up",
    });
  });

  it("validates a switch candidate before replacing the active stream and increments once", async () => {
    const firstTrack = makeTrack({ facingModes: ["user", "environment"] });
    const secondTrack = makeTrack({ facingMode: "environment" });
    let resolveCandidate!: (value: { height: number; width: number }) => void;
    let attachment = 0;
    const { attachAndPlay, session } = createHarness({
      attachAndPlay: () => {
        attachment += 1;
        if (attachment === 1)
          return Promise.resolve({ height: 720, width: 1280 });
        return new Promise((resolve) => {
          resolveCandidate = resolve;
        });
      },
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(firstTrack))
        .mockResolvedValueOnce(makeStream(secondTrack)),
    });
    await session.start();
    const switching = session.switchCamera();
    await vi.waitFor(() => expect(attachAndPlay).toHaveBeenCalledTimes(2));

    expect(firstTrack.stop).not.toHaveBeenCalled();
    resolveCandidate({ height: 720, width: 1280 });
    await switching;

    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(session.snapshot).toMatchObject({
      facingMode: "environment",
      generation: 2,
      state: "warm-up",
    });
  });

  it("does not cancel an intentional switch when the browser ends the prior mobile track", async () => {
    const firstTrack = makeTrack({
      facingMode: "user",
      facingModes: ["user", "environment"],
    });
    const secondTrack = makeTrack({ facingMode: "environment" });
    const { session } = createHarness({
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(firstTrack))
        .mockImplementationOnce(() => {
          firstTrack.dispatchEvent(new Event("ended"));
          return Promise.resolve(makeStream(secondTrack));
        }),
      mobile: true,
    });

    await session.start();
    await session.switchCamera();

    expect(secondTrack.stop).not.toHaveBeenCalled();
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

  it("keeps the delivered rear-camera device choice across visibility recovery", async () => {
    const frontTrack = makeTrack({ deviceId: "front", facingMode: "user" });
    const rearTrack = makeTrack({
      deviceId: "rear",
      facingMode: "environment",
    });
    const recoveredRearTrack = makeTrack({
      deviceId: "rear",
      facingMode: "environment",
    });
    const reconstructedRearTrack = makeTrack({
      deviceId: "rear",
      facingMode: "environment",
    });
    const { getUserMedia, session } = createHarness({
      enumerateDevices: () =>
        Promise.resolve([
          { deviceId: "front", kind: "videoinput" },
          { deviceId: "rear", kind: "videoinput" },
        ] as MediaDeviceInfo[]),
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(frontTrack))
        .mockResolvedValueOnce(makeStream(rearTrack))
        .mockResolvedValueOnce(makeStream(recoveredRearTrack))
        .mockResolvedValueOnce(makeStream(reconstructedRearTrack)),
    });
    await session.start();
    await Promise.resolve();
    await session.switchCamera();
    session.setVisibility(false);
    await session.setVisibility(true);

    expect(getUserMedia.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        video: expect.objectContaining({ deviceId: { exact: "rear" } }),
      }),
    );
    await session.reconstructForOrientation();
    expect(getUserMedia.mock.calls[3]?.[0]).toEqual(
      expect.objectContaining({
        video: expect.objectContaining({ deviceId: { exact: "rear" } }),
      }),
    );
    expect(session.snapshot).toMatchObject({
      facingMode: "environment",
      generation: 4,
      state: "warm-up",
    });
  });

  it("keeps the delivered rear-camera choice across interruption and intentional restart", async () => {
    const frontTrack = makeTrack({ deviceId: "front", facingMode: "user" });
    const rearTrack = makeTrack({
      deviceId: "rear",
      facingMode: "environment",
    });
    const interruptedRearTrack = makeTrack({
      deviceId: "rear",
      facingMode: "environment",
    });
    const stoppedRearTrack = makeTrack({
      deviceId: "rear",
      facingMode: "environment",
    });
    const { getUserMedia, session } = createHarness({
      enumerateDevices: () =>
        Promise.resolve([
          { deviceId: "front", kind: "videoinput" },
          { deviceId: "rear", kind: "videoinput" },
        ] as MediaDeviceInfo[]),
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(frontTrack))
        .mockResolvedValueOnce(makeStream(rearTrack))
        .mockResolvedValueOnce(makeStream(interruptedRearTrack))
        .mockResolvedValueOnce(makeStream(stoppedRearTrack)),
    });

    await session.start();
    await Promise.resolve();
    await session.switchCamera();
    rearTrack.dispatchEvent(new Event("ended"));
    await session.restart();
    session.stop();
    await session.restart();

    for (const call of getUserMedia.mock.calls.slice(2)) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          video: expect.objectContaining({ deviceId: { exact: "rear" } }),
        }),
      );
    }
  });

  it("falls back to browser camera selection when a remembered device disappears", async () => {
    const rememberedTrack = makeTrack({
      deviceId: "rear",
      facingMode: "environment",
    });
    const fallbackTrack = makeTrack({ deviceId: "front", facingMode: "user" });
    const { getUserMedia, session } = createHarness({
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(rememberedTrack))
        .mockRejectedValueOnce({ name: "OverconstrainedError" })
        .mockResolvedValueOnce(makeStream(fallbackTrack)),
    });

    await session.start();
    session.stop();
    await session.restart();

    expect(getUserMedia.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        video: expect.objectContaining({ deviceId: { exact: "rear" } }),
      }),
    );
    expect(getUserMedia.mock.calls[2]?.[0]).toEqual({
      audio: false,
      video: {
        frameRate: { ideal: 30 },
        height: { ideal: 720 },
        width: { ideal: 1280 },
      },
    });
    expect(session.snapshot).toMatchObject({
      generation: 2,
      state: "warm-up",
    });
  });

  it("maps retained-stream playback restoration failure without revoking camera permission", async () => {
    const firstTrack = makeTrack({ facingModes: ["user", "environment"] });
    const { session } = createHarness({
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(makeStream(firstTrack))
        .mockRejectedValueOnce({ name: "NotReadableError" }),
      restore: () => Promise.reject({ name: "PlaybackError" }),
    });
    await session.start();
    await session.switchCamera();

    expect(session.snapshot).toMatchObject({
      permission: "granted",
      reason: "playback-unavailable",
      state: "recoverable-error",
    });
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

  it("stops every owned active track on teardown", async () => {
    const track = makeTrack();
    const { session } = createHarness({
      getUserMedia: () => Promise.resolve(makeStream(track)),
    });
    await session.start();
    session.dispose();
    expect(track.stop).toHaveBeenCalledOnce();
  });
});
