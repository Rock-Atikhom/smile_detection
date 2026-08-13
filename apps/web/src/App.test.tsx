import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAMERA_ATTACHMENT_TIMEOUT_MS,
  CAMERA_WARMUP_MS,
} from "./camera/session";
import App, { statusFor } from "./App";

const vision = vi.hoisted(() => ({
  cancel: vi.fn(),
  prepare: vi.fn<() => Promise<"started" | "first-use-offline" | "failed">>(),
  restart: vi.fn<() => Promise<"started" | "first-use-offline" | "failed">>(),
  resetDetection: vi.fn(),
  submitFrame: vi.fn(() => true),
  snapshot: {
    face: {
      eligible: false,
      faceCount: 0 as 0 | 1 | 2,
      guidance: null as
        | "no-face"
        | "multiple-faces"
        | "too-close"
        | "too-far"
        | "off-center"
        | "face-ready"
        | null,
      lastSequence: null as number | null,
      staleResults: 0,
      state: "idle" as "idle" | "detecting" | "ready" | "error",
    },
    continuity: {
      consecutiveMatches: 0,
      reason: "none" as
        | "none"
        | "warming"
        | "no-face"
        | "multiple-faces"
        | "position"
        | "nonmatch"
        | "expired",
      state: "empty" as "empty" | "candidate" | "ready" | "grace",
    },
    verification: {
      graceRemainingMs: null as number | null,
      phase: "waiting" as "waiting" | "verifying" | "paused" | "complete",
      progressMs: 0,
      progressRatio: 0,
      rawScore: null as number | null,
      reason: "none" as
        "none" | "warming" | "face-invalid" | "continuity-lost" | "smile-lost",
      smileValid: false,
      smoothedScore: null as number | null,
    },
    generation: 1,
    offlineCache: "ready" as "not-ready" | "caching" | "ready" | "error",
    phase: null as "verifying" | "initializing" | null,
    reason: null as
      | "first-use-offline"
      | "runtime-download-failed"
      | "runtime-integrity-failed"
      | "runtime-initialization-failed"
      | "runtime-cancelled"
      | "offline-cache-failed"
      | null,
    releaseId: "c8e4fbace24ccdb3",
    retryAvailable: false,
    runtime: "ready" as "idle" | "preparing" | "ready" | "error",
    wasmTier: "simd" as "unknown" | "simd" | "baseline",
  },
}));

const framePump = vi.hoisted(() => ({ dispose: vi.fn(), stop: vi.fn() }));

vi.mock("./vision/useVisionRuntime", () => ({
  useVisionRuntime: () => vision,
}));

vi.mock("./vision/face-frame-pump", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./vision/face-frame-pump")>();
  return {
    ...actual,
    createBrowserFaceFramePump(
      dependencies: Parameters<typeof actual.createBrowserFaceFramePump>[0],
    ) {
      const pump = actual.createBrowserFaceFramePump(dependencies);
      return {
        ...pump,
        dispose() {
          framePump.dispose();
          pump.dispose();
        },
        stop() {
          framePump.stop();
          pump.stop();
        },
      };
    },
  };
});

function resetVision() {
  vision.cancel.mockReset();
  vision.prepare.mockReset().mockResolvedValue("started");
  vision.restart.mockReset().mockResolvedValue("started");
  vision.resetDetection.mockReset();
  vision.submitFrame.mockReset().mockReturnValue(true);
  framePump.dispose.mockReset();
  framePump.stop.mockReset();
  Object.assign(vision.snapshot, {
    face: {
      eligible: false,
      faceCount: 0,
      guidance: null,
      lastSequence: null,
      staleResults: 0,
      state: "idle",
    },
    continuity: {
      consecutiveMatches: 0,
      reason: "none",
      state: "empty",
    },
    verification: {
      graceRemainingMs: null,
      phase: "waiting",
      progressMs: 0,
      progressRatio: 0,
      rawScore: null,
      reason: "none",
      smileValid: false,
      smoothedScore: null,
    },
    generation: 1,
    offlineCache: "ready",
    phase: null,
    reason: null,
    releaseId: "c8e4fbace24ccdb3",
    retryAvailable: false,
    runtime: "ready",
    wasmTier: "simd",
  });
}

function setVisionIntegrityFailure() {
  Object.assign(vision.snapshot, {
    offlineCache: "error",
    reason: "runtime-integrity-failed",
    runtime: "error",
    wasmTier: "unknown",
  });
}

type FakeTrack = EventTarget & {
  getCapabilities: () => MediaTrackCapabilities;
  getSettings: () => MediaTrackSettings;
  readyState: MediaStreamTrackState;
  stop: ReturnType<typeof vi.fn>;
};

function makeStream() {
  const track = new EventTarget() as FakeTrack;
  track.readyState = "live";
  track.stop = vi.fn(() => {
    track.readyState = "ended";
  });
  track.getCapabilities = () =>
    ({ facingMode: ["user", "environment"] }) as MediaTrackCapabilities;
  track.getSettings = () => ({ facingMode: "user", height: 720, width: 1280 });
  return {
    stream: {
      getTracks: () => [track as unknown as MediaStreamTrack],
      getVideoTracks: () => [track as unknown as MediaStreamTrack],
    } as unknown as MediaStream,
    track,
  };
}

function installCamera(
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  devices: MediaDeviceInfo[] = [],
) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: {
      enumerateDevices: vi.fn(() => Promise.resolve(devices)),
      getUserMedia: vi.fn(getUserMedia),
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn(() => Promise.resolve()),
  });
}

function getCameraPreview() {
  const video = document.querySelector<HTMLVideoElement>(
    "video.camera-preview",
  );
  if (!video) throw new Error("Expected the camera preview video to render");
  return video;
}

async function findCameraPreview() {
  await vi.waitFor(() =>
    expect(document.querySelector("video.camera-preview")).toBeTruthy(),
  );
  return getCameraPreview();
}

const readyFace = {
  faceCount: 1 as const,
  lastSequence: 1,
  staleResults: 0,
  state: "ready" as const,
};

async function makeCameraReady() {
  const { stream } = makeStream();
  installCamera(() => Promise.resolve(stream));
  const view = render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
  fireEvent.loadedData(getCameraPreview());
  await vi.runAllTimersAsync();

  return view;
}

async function makeCameraReadyForFrames() {
  const { stream } = makeStream();
  installCamera(() => Promise.resolve(stream));
  const view = render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
  fireEvent.loadedData(getCameraPreview());
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(CAMERA_WARMUP_MS);
  await vi.advanceTimersByTimeAsync(1);
  expect(screen.getByRole("heading", { name: "Camera ready" })).toBeVisible();
  await act(async () => Promise.resolve());

  return view;
}

describe("Smart Smile camera session", () => {
  beforeEach(() => {
    resetVision();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    ["no-face", "Show your face"],
    ["multiple-faces", "Only one person"],
    ["too-close", "Move back"],
    ["too-far", "Move closer"],
    ["off-center", "Center your face"],
    ["face-ready", "Face ready"],
  ] as const)("renders %s", async (guidance, text) => {
    vi.useFakeTimers();
    const view = await makeCameraReady();
    vision.snapshot.face = {
      ...readyFace,
      guidance,
      eligible: guidance === "face-ready",
    };
    view.rerender(<App />);

    expect(
      screen.getByRole("status", { name: "Camera status" }),
    ).toHaveTextContent(text);
  });

  it("keeps recovery priority and presents one hidden-preview guidance status", async () => {
    vi.useFakeTimers();
    const view = await makeCameraReady();
    vision.snapshot.face = {
      ...readyFace,
      guidance: "no-face",
      eligible: false,
    };
    view.rerender(<App />);

    const status = screen.getByRole("status", { name: "Camera status" });
    expect(status).toHaveTextContent("Show your face");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(getCameraPreview()).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".capture-zone")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByRole("button", { name: "Stop camera" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Switch camera" })).toBeEnabled();

    setVisionIntegrityFailure();
    view.rerender(<App />);
    expect(status).toHaveTextContent("Smart Smile could not start safely");
  });

  it("submits ready frames at a 50 ms cadence with separate runtime and camera generations", async () => {
    vi.useFakeTimers();
    let monotonicNow = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => monotonicNow);
    vision.snapshot.generation = 17;
    const createImageBitmap = vi.fn(async () => ({ close: vi.fn() }));
    vi.stubGlobal("createImageBitmap", createImageBitmap);

    await makeCameraReadyForFrames();

    expect(vision.submitFrame).toHaveBeenCalledTimes(1);
    expect(vision.submitFrame).toHaveBeenLastCalledWith(
      expect.objectContaining({
        generation: 17,
        cameraGeneration: 1,
        capturedAtMs: 1_000,
        sequence: 0,
      }),
    );
    await vi.advanceTimersByTimeAsync(49);
    expect(vision.submitFrame).toHaveBeenCalledTimes(1);
    monotonicNow = 1_050;
    await vi.advanceTimersByTimeAsync(1);
    expect(vision.submitFrame).toHaveBeenCalledTimes(2);
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
  });

  it.each([
    "Stop camera",
    "Switch camera",
    "integrity stop",
    "unmount",
  ] as const)(
    "disposes the frame pump when %s ends its current camera generation",
    async (action) => {
      vi.useFakeTimers();
      const createImageBitmap = vi.fn(async () => ({ close: vi.fn() }));
      vi.stubGlobal("createImageBitmap", createImageBitmap);
      const view = await makeCameraReadyForFrames();
      expect(createImageBitmap).toHaveBeenCalledOnce();

      if (action === "Stop camera") {
        fireEvent.click(screen.getByRole("button", { name: action }));
      } else if (action === "Switch camera") {
        fireEvent.click(screen.getByRole("button", { name: action }));
      } else if (action === "integrity stop") {
        setVisionIntegrityFailure();
        view.rerender(<App />);
      } else {
        view.unmount();
      }

      await act(async () => Promise.resolve());
      await vi.advanceTimersByTimeAsync(200);
      expect(framePump.stop).toHaveBeenCalled();
      expect(framePump.dispose).toHaveBeenCalled();
      expect(createImageBitmap).toHaveBeenCalledOnce();
    },
  );

  it("keeps the privacy introduction visible and makes no request before the explicit action", () => {
    const getUserMedia = vi.fn();
    installCamera(getUserMedia);
    render(<App />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Take a smile photo privately",
    );
    expect(
      screen.getByRole("button", { name: "Continue to camera" }),
    ).toBeEnabled();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(vision.prepare).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "How privacy works" }));
    expect(
      screen.getByRole("dialog", { name: "How privacy works" }),
    ).toBeVisible();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("preflights vision after explicit intent and starts camera only after it succeeds", async () => {
    let finishPreflight!: (result: "started") => void;
    vision.prepare.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPreflight = resolve;
        }),
    );
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => undefined));
    installCamera(getUserMedia);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));

    await waitFor(() => expect(vision.prepare).toHaveBeenCalledOnce());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Getting smile detection ready",
    );
    expect(
      screen.getByText(
        "Required files are verified and stay on this device for offline use",
      ),
    ).toBeVisible();
    expect(getUserMedia).not.toHaveBeenCalled();

    finishPreflight("started");
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  });

  it("recovers from first-use offline without requesting camera permission", async () => {
    vision.prepare.mockResolvedValue("first-use-offline");
    const getUserMedia = vi.fn();
    installCamera(getUserMedia);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));

    const heading = await screen.findByRole("heading", {
      name: "Connect once to finish setup",
    });
    expect(heading).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Try again when online" }),
    ).toBeEnabled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("does not authorize camera when vision preflight fails closed", async () => {
    vision.prepare.mockImplementation(async () => {
      Object.assign(vision.snapshot, {
        offlineCache: "error",
        reason: "offline-cache-failed",
        retryAvailable: true,
        runtime: "error",
        wasmTier: "unknown",
      });
      return "failed";
    });
    const getUserMedia = vi.fn();
    installCamera(getUserMedia);
    const view = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));

    await waitFor(() => expect(vision.prepare).toHaveBeenCalledOnce());
    await act(async () => Promise.resolve());
    view.rerender(<App />);
    const heading = screen.getByRole("heading", {
      name: "Smile detection setup needs attention",
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(heading).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Try setup again" }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "offline-cache-failed",
    );
  });

  it("does not authorize camera when first cache setup fails before runtime startup", async () => {
    vision.prepare.mockImplementation(async () => {
      Object.assign(vision.snapshot, {
        offlineCache: "error",
        phase: null,
        reason: "offline-cache-failed",
        retryAvailable: true,
        runtime: "error",
        wasmTier: "unknown",
      });
      return "failed";
    });
    const getUserMedia = vi.fn();
    installCamera(getUserMedia);
    const view = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));

    await waitFor(() => expect(vision.prepare).toHaveBeenCalledOnce());
    view.rerender(<App />);
    const heading = screen.getByRole("heading", {
      name: "Smile detection setup needs attention",
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(heading).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Try setup again" }),
    ).toBeEnabled();
  });

  it("shows permission-pending copy after preflight and requests video only", async () => {
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => undefined));
    installCamera(getUserMedia);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    expect(
      await screen.findByRole("heading", { name: "Allow camera access" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Your browser will ask to use the camera. Microphone access is not needed.",
      ),
    ).toBeVisible();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.any(Object) }),
    );
  });

  it("cancels an unsettled permission request and disposes its late stream", async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );
    installCamera(getUserMedia);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const late = makeStream();
    resolveStream(late.stream);
    await vi.waitFor(() => expect(late.track.stop).toHaveBeenCalledOnce());
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(vision.cancel).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Camera is off" }),
    ).toBeVisible();
  });

  it("shows a mirrored contained preview through warm-up, then supports stopping", async () => {
    vi.useFakeTimers();
    const { stream, track } = makeStream();
    installCamera(() => Promise.resolve(stream));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    const video = getCameraPreview();
    fireEvent.loadedData(video);
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Getting ready",
    );
    expect(video).toHaveClass("camera-preview");
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Getting ready",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Help & system status" }),
    );
    const warmupHelp = screen.getByRole("dialog", {
      name: "Help & system status",
    });
    expect(
      within(warmupHelp).getByText("Camera").closest("div"),
    ).toHaveTextContent("Preparing");
    fireEvent.click(
      screen.getByRole("button", { name: "Close system status" }),
    );

    await vi.runAllTimersAsync();
    await vi.advanceTimersByTimeAsync(CAMERA_WARMUP_MS);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Camera ready",
    );
    expect(screen.getByRole("button", { name: "Stop camera" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Stop camera" }));
    expect(track.stop).toHaveBeenCalled();
    expect(vision.cancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Camera is off",
    );
    expect(
      screen.getByRole("button", { name: "Restart camera" }),
    ).toBeEnabled();
  });

  it("offers plain-language recovery after a browser permission denial", async () => {
    installCamera(() => Promise.reject({ name: "NotAllowedError" }));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    expect(
      await screen.findByRole("heading", { name: "Camera access is off" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Allow camera access in browser or device settings, then return here.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByText("NotAllowedError")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("maps a preview playback rejection to actionable recovery", async () => {
    const { stream } = makeStream();
    installCamera(() => Promise.resolve(stream));
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn(() => Promise.reject({ name: "NotAllowedError" })),
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await screen.findByRole("heading", { name: "Starting the camera" });
    const video = getCameraPreview();
    fireEvent.loadedData(video);
    expect(
      await screen.findByRole("heading", {
        name: "Camera preview could not start",
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Camera status: Camera preview could not start.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("bounds decoded readiness and playback with one attachment deadline", async () => {
    vi.useFakeTimers();
    const { stream } = makeStream();
    installCamera(() => Promise.resolve(stream));
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn(() => new Promise<void>(() => undefined)),
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Starting the camera",
    );
    await vi.advanceTimersByTimeAsync(CAMERA_ATTACHMENT_TIMEOUT_MS - 1_000);
    fireEvent.loadedData(getCameraPreview());
    await vi.advanceTimersByTimeAsync(1_001);
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Camera preview could not start",
    );
  });

  it("stops a granted track when Stop is used while playback is pending", async () => {
    vi.useFakeTimers();
    const { stream, track } = makeStream();
    installCamera(() => Promise.resolve(stream));
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn(() => new Promise<void>(() => undefined)),
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Starting the camera",
    );
    const video = getCameraPreview();
    fireEvent.loadedData(video);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop camera" }));

    expect(track.stop).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Camera is off",
    );
  });

  it("stops a granted track when the tab hides while playback is pending", async () => {
    vi.useFakeTimers();
    const { stream, track } = makeStream();
    installCamera(() => Promise.resolve(stream));
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn(() => new Promise<void>(() => undefined)),
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    const video = getCameraPreview();
    fireEvent.loadedData(video);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(track.stop).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Camera is off",
    );
  });

  it("opens Help & system status from an unsupported-browser recovery action", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { enumerateDevices: vi.fn(() => Promise.resolve([])) },
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    expect(
      await screen.findByRole("heading", {
        name: "This browser is not supported yet",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View help" }));
    expect(
      screen.getByRole("dialog", { name: "Help & system status" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Close system status" }),
    );
    expect(
      screen.getByRole("button", { name: "Help & system status" }),
    ).toHaveFocus();
  });

  it("renders the actionable switch-failure recovery while retaining the preview", async () => {
    const { stream, track } = makeStream();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(stream)
      .mockRejectedValueOnce({ name: "NotReadableError" })
      .mockImplementationOnce(() => new Promise<MediaStream>(() => undefined));
    installCamera(getUserMedia);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    const video = await findCameraPreview();
    fireEvent.loadedData(video);
    await screen.findByRole("heading", { name: "Getting ready" });
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));

    expect(
      await screen.findByRole("heading", {
        name: "Could not switch cameras",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Switch camera" })).toBeEnabled();
    expect(getCameraPreview()).toBeVisible();
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Could not switch cameras",
    );
    expect(screen.getByLabelText("Camera status")).toHaveAttribute(
      "aria-atomic",
      "true",
    );
    expect(screen.getByRole("button", { name: "Switch camera" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));
    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("keeps the switching announcement until the candidate preview is attached", async () => {
    const first = makeStream();
    const second = makeStream();
    let resolveCandidate!: (stream: MediaStream) => void;
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCandidate = resolve;
          }),
      );
    installCamera(getUserMedia);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    const video = await findCameraPreview();
    fireEvent.loadedData(video);
    await screen.findByRole("heading", { name: "Getting ready" });
    fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Switching camera",
    );

    resolveCandidate(second.stream);
    await vi.waitFor(() => expect(video.srcObject).toBe(second.stream));
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Switching camera",
    );
  });

  it("announces interruption, focuses recovery, and restarts through warm-up", async () => {
    const first = makeStream();
    const second = makeStream();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);
    installCamera(getUserMedia);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    let video = await findCameraPreview();
    fireEvent.loadedData(video);
    await screen.findByRole("heading", { name: "Getting ready" });
    first.track.dispatchEvent(new Event("ended"));

    const recovery = await screen.findByRole("heading", {
      name: "The camera stopped",
    });
    expect(recovery).toHaveFocus();
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Camera status: The camera stopped.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Restart camera" }));
    video = await findCameraPreview();
    fireEvent.loadedData(video);
    expect(
      await screen.findByRole("heading", { name: "Getting ready" }),
    ).toBeVisible();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("keeps diagnostics allowlisted and restores focus when Help & system status closes", async () => {
    const { stream } = makeStream();
    installCamera(() => Promise.resolve(stream), [
      {
        deviceId: "opaque-id",
        groupId: "opaque-group",
        kind: "videoinput",
        label: "Private webcam name",
      },
    ] as MediaDeviceInfo[]);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await screen.findByRole("heading", { name: "Starting the camera" });
    const video = getCameraPreview();
    fireEvent.loadedData(video);
    await screen.findByRole("heading", { name: "Getting ready" });

    const trigger = screen.getByRole("button", {
      name: "Help & system status",
    });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Help & system status" });
    expect(dialog).toHaveTextContent("Manifest IDc8e4fbace24ccdb3");
    expect(dialog).toHaveTextContent("WASM tierSIMD");
    expect(dialog).not.toHaveTextContent("Private webcam name");
    expect(dialog).not.toHaveTextContent("opaque-id");
    expect(dialog).not.toHaveTextContent("Facing mode");
    expect(dialog).not.toHaveTextContent("Delivered size");

    fireEvent.click(
      screen.getByRole("button", { name: "Close system status" }),
    );
    expect(trigger).toHaveFocus();
  });

  it("renders an active semantic overlay and blocks duplicate switching without hiding Stop", async () => {
    const first = makeStream();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockImplementationOnce(() => new Promise<MediaStream>(() => undefined));
    installCamera(getUserMedia, [
      {
        deviceId: "first-camera",
        groupId: "camera-group",
        kind: "videoinput",
        label: "",
      },
      {
        deviceId: "second-camera",
        groupId: "camera-group",
        kind: "videoinput",
        label: "",
      },
    ] as MediaDeviceInfo[]);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    const video = await findCameraPreview();
    expect(video).toHaveAttribute("aria-hidden", "true");
    fireEvent.loadedData(video);

    const overlay = await screen.findByRole("region", {
      name: "Live camera controls",
    });
    expect(within(overlay).getByRole("status")).toHaveTextContent(
      /^Getting ready$/,
    );
    expect(screen.queryByText("Private by design")).not.toBeInTheDocument();

    const help = within(overlay).getByRole("button", {
      name: "Help & system status",
    });
    const stop = within(overlay).getByRole("button", { name: "Stop camera" });
    const switchButton = within(overlay).getByRole("button", {
      name: "Switch camera",
    });
    expect(
      help.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      stop.compareDocumentPosition(switchButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(help);
    expect(
      screen.getByRole("dialog", { name: "Help & system status" }),
    ).toHaveTextContent("Manifest IDc8e4fbace24ccdb3");
    fireEvent.click(
      screen.getByRole("button", { name: "Close system status" }),
    );
    expect(help).toHaveFocus();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    fireEvent.click(switchButton);

    expect(stop).toBeEnabled();
    expect(switchButton).toBeDisabled();
    expect(switchButton).toHaveAttribute("aria-busy", "true");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(vision.cancel).not.toHaveBeenCalled();
    expect(vision.restart).not.toHaveBeenCalled();
  });

  it("does not repeat offline readiness after successful or failed camera switches", async () => {
    vi.useFakeTimers();
    Object.assign(vision.snapshot, {
      offlineCache: "caching",
      runtime: "ready",
    });
    const first = makeStream();
    const second = makeStream();
    second.track.getSettings = () => ({
      facingMode: "environment",
      height: 720,
      width: 1280,
    });
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream)
      .mockRejectedValueOnce({ name: "NotReadableError" });
    installCamera(getUserMedia);
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    const video = getCameraPreview();
    fireEvent.loadedData(video);
    await vi.runAllTimersAsync();
    expect(screen.getByRole("heading", { name: "Camera ready" })).toBeVisible();

    Object.assign(vision.snapshot, { offlineCache: "ready" });
    rerender(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Smart Smile is ready for offline use",
    );

    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.runAllTimersAsync();
    expect(video.srcObject).toBe(second.stream);
    await vi.advanceTimersByTimeAsync(CAMERA_WARMUP_MS);
    expect(screen.getByRole("heading", { name: "Camera ready" })).toBeVisible();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "Smart Smile is ready for offline use",
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(
      screen.getByRole("heading", { name: "Could not switch cameras" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "Smart Smile is ready for offline use",
    );
    expect(vision.cancel).not.toHaveBeenCalled();
    expect(vision.restart).not.toHaveBeenCalled();
  });

  it("reports bounded runtime and offline status without exposing raw failures", () => {
    Object.assign(vision.snapshot, {
      offlineCache: "not-ready",
      runtime: "idle",
      wasmTier: "unknown",
    });
    installCamera(() => new Promise<MediaStream>(() => undefined));
    const { rerender } = render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Help & system status" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Help & system status" });
    const runtimeRow = within(dialog)
      .getByText("On-device smile detection")
      .closest("div");
    const offlineRow = within(dialog).getByText("Offline use").closest("div");
    expect(runtimeRow).toHaveTextContent("Preparing");
    expect(offlineRow).toHaveTextContent("Preparing");

    Object.assign(vision.snapshot, {
      offlineCache: "ready",
      runtime: "ready",
      wasmTier: "baseline",
    });
    rerender(<App />);
    expect(runtimeRow).toHaveTextContent("Ready");
    expect(offlineRow).toHaveTextContent("Ready");
    expect(dialog).toHaveTextContent("MediaPipe0.10.35");
    expect(dialog).toHaveTextContent("Modelface_landmarker float16/1");
    expect(dialog).toHaveTextContent("Manifest IDc8e4fbace24ccdb3");
    expect(dialog).toHaveTextContent("WASM tierBaseline");

    Object.assign(vision.snapshot, {
      offlineCache: "error",
      reason: "offline-cache-failed",
      runtime: "error",
    });
    rerender(<App />);
    expect(runtimeRow).toHaveTextContent("Needs attention");
    expect(offlineRow).toHaveTextContent("Needs attention");
    expect(dialog).not.toHaveTextContent("offline-cache-failed");

    Object.assign(vision.snapshot, {
      offlineCache: "not-ready",
      reason: "first-use-offline",
    });
    rerender(<App />);
    expect(offlineRow).toHaveTextContent("Connect once to finish setup");
  });

  it("uses one polite atomic live region for the offline-ready transition", async () => {
    Object.assign(vision.snapshot, {
      offlineCache: "caching",
      runtime: "preparing",
      wasmTier: "unknown",
    });
    installCamera(() => new Promise<MediaStream>(() => undefined));
    const { rerender } = render(<App />);

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();

    Object.assign(vision.snapshot, {
      offlineCache: "ready",
      wasmTier: "simd",
    });
    rerender(<App />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveTextContent("Smart Smile is ready for offline use");
    rerender(<App />);
    expect(
      screen.getAllByText("Smart Smile is ready for offline use"),
    ).toHaveLength(1);

    Object.assign(vision.snapshot, { runtime: "ready" });
    rerender(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Smart Smile is ready for offline use",
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    expect(
      await screen.findByRole("heading", { name: "Allow camera access" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Camera permission requested.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "Smart Smile is ready for offline use",
    );
  });

  it("does not start camera when integrity fails before vision preflight resolves", async () => {
    let finishPreflight!: (result: "started") => void;
    vision.prepare.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPreflight = resolve;
        }),
    );
    const getUserMedia = vi.fn().mockResolvedValue(makeStream().stream);
    installCamera(getUserMedia);
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await waitFor(() => expect(vision.prepare).toHaveBeenCalledOnce());

    setVisionIntegrityFailure();
    rerender(<App />);
    const recovery = screen.getByRole("heading", {
      name: "Smart Smile could not start safely",
    });
    expect(recovery).toHaveFocus();

    await act(async () => {
      finishPreflight("started");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(recovery).toHaveFocus();
  });

  it("discards a queued camera start when integrity fails before layout execution", async () => {
    let finishPreflight!: (result: "started") => void;
    vision.prepare.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPreflight = resolve;
        }),
    );
    const getUserMedia = vi.fn().mockResolvedValue(makeStream().stream);
    installCamera(getUserMedia);
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await waitFor(() => expect(vision.prepare).toHaveBeenCalledOnce());

    await act(async () => {
      finishPreflight("started");
      await Promise.resolve();
      setVisionIntegrityFailure();
      rerender(<App />);
    });

    const recovery = screen.getByRole("heading", {
      name: "Smart Smile could not start safely",
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(recovery).toHaveFocus();
  });

  it("stops the camera and focuses safe recovery after an integrity failure", async () => {
    const { stream, track } = makeStream();
    installCamera(() => Promise.resolve(stream));
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    const video = await findCameraPreview();
    fireEvent.loadedData(video);
    await screen.findByRole("heading", { name: "Getting ready" });

    setVisionIntegrityFailure();
    rerender(<App />);

    const heading = await screen.findByRole("heading", {
      name: "Smart Smile could not start safely",
    });
    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(heading).toHaveFocus();
    expect(screen.getByRole("button", { name: "Reload" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "View help" })).toBeEnabled();
    expect(
      screen.queryByText("runtime-integrity-failed"),
    ).not.toBeInTheDocument();
  });

  it("keeps cache-only failure inside Help while the ready camera remains usable", async () => {
    vi.useFakeTimers();
    Object.assign(vision.snapshot, {
      offlineCache: "caching",
      runtime: "ready",
    });
    const { stream } = makeStream();
    installCamera(() => Promise.resolve(stream));
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    const video = getCameraPreview();
    fireEvent.loadedData(video);
    await vi.runAllTimersAsync();

    Object.assign(vision.snapshot, {
      offlineCache: "error",
      reason: "offline-cache-failed",
    });
    rerender(<App />);

    expect(screen.getByRole("heading", { name: "Camera ready" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop camera" })).toBeEnabled();
    expect(screen.getByText("Needs attention")).not.toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Help & system status" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Help & system status" });
    expect(
      within(dialog).getByText("Offline use").closest("div"),
    ).toHaveTextContent("Needs attention");
  });

  it("does not present Camera ready until camera and runtime are both ready", async () => {
    vi.useFakeTimers();
    Object.assign(vision.snapshot, {
      offlineCache: "caching",
      runtime: "preparing",
      wasmTier: "unknown",
    });
    const { stream } = makeStream();
    installCamera(() => Promise.resolve(stream));
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    fireEvent.loadedData(getCameraPreview());
    await vi.runAllTimersAsync();

    expect(
      screen.queryByRole("heading", { name: "Camera ready" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Getting smile detection ready" }),
    ).toBeVisible();

    Object.assign(vision.snapshot, { runtime: "idle" });
    rerender(<App />);
    expect(
      screen.queryByRole("heading", { name: "Camera ready" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Getting smile detection ready" }),
    ).toBeVisible();

    Object.assign(vision.snapshot, {
      offlineCache: "ready",
      runtime: "ready",
      wasmTier: "simd",
    });
    rerender(<App />);
    expect(screen.getByRole("heading", { name: "Camera ready" })).toBeVisible();
  });
  describe("Smile progress and diagnostics", () => {
    const faceReady = {
      face: { ...readyFace, guidance: "face-ready", eligible: true },
    };

    function setSmile(opts: {
      continuity?: "empty" | "candidate" | "ready" | "grace";
      phase?: "waiting" | "verifying" | "paused" | "complete";
      progressMs?: number;
      rawScore?: number | null;
      smoothedScore?: number | null;
      reason?: string;
      graceRemainingMs?: number | null;
      smileValid?: boolean;
    }) {
      Object.assign(vision.snapshot, {
        face: faceReady.face,
        continuity: {
          consecutiveMatches: 3,
          reason: "none",
          state: opts.continuity ?? "ready",
        },
        verification: {
          graceRemainingMs: opts.graceRemainingMs ?? null,
          phase: opts.phase ?? "waiting",
          progressMs: opts.progressMs ?? 0,
          progressRatio: (opts.progressMs ?? 0) / 3000,
          rawScore: opts.rawScore ?? null,
          reason: opts.reason ?? "none",
          smileValid: opts.smileValid ?? false,
          smoothedScore: opts.smoothedScore ?? null,
        },
      });
    }

    it.each([
      [
        "candidate",
        { face: "face-ready", continuity: "candidate", phase: "waiting" },
        "Hold still",
      ],
      [
        "waiting",
        { face: "face-ready", continuity: "ready", phase: "waiting" },
        "Smile when you are ready",
      ],
      [
        "verifying",
        { face: "face-ready", continuity: "ready", phase: "verifying" },
        "Keep smiling",
      ],
      [
        "paused",
        { face: "face-ready", continuity: "ready", phase: "paused" },
        "Keep smiling",
      ],
      [
        "complete",
        { face: "face-ready", continuity: "ready", phase: "complete" },
        "Smile verified",
      ],
    ] as const)(
      "statusFor maps %s to its participant copy",
      (_, args, text) => {
        expect(
          statusFor({
            face: args.face,
            continuity: args.continuity,
            phase: args.phase,
          }),
        ).toBe(text);
      },
    );

    it("shows an initial relaxed status before any verification", () => {
      expect(
        statusFor({
          face: "face-ready",
          continuity: "empty",
          phase: "waiting",
        }),
      ).toBe("Face ready");
    });

    it("maps idle visions away from smile status", () => {
      expect(
        statusFor({ face: "no-face", continuity: "empty", phase: "waiting" }),
      ).toBe("Show your face");
    });

    it("renders qualitative progress in the live overlay without raw scores", async () => {
      vi.useFakeTimers();
      const view = await makeCameraReadyForFrames();
      setSmile({ continuity: "ready", phase: "verifying", progressMs: 1250 });
      view.rerender(<App />);

      const status = screen.getByRole("status", { name: "Camera status" });
      expect(status).toHaveTextContent("Keep smiling");
      expect(status).not.toHaveTextContent(/\d+\.\d+/);
      expect(status).not.toHaveTextContent(/1250/);

      const progress = screen.getByRole("progressbar", {
        name: "Smile verification progress",
      });
      expect(progress).toHaveAttribute("max", "3000");
      expect(Number(progress.getAttribute("value"))).toBe(1250);
      expect(
        screen.getByText(
          /Building smile progress|Smile progress paused|Smile verification complete/,
        ),
      ).toBeVisible();
    });

    it("renders a paused progress bar during the smile-lost grace window", async () => {
      vi.useFakeTimers();
      const view = await makeCameraReadyForFrames();
      setSmile({
        continuity: "ready",
        phase: "paused",
        reason: "smile-lost",
        progressMs: 1250,
      });
      view.rerender(<App />);

      const progress = screen.getByRole("progressbar", {
        name: "Smile verification progress",
      });
      expect(progress).toHaveAttribute("value", "1250");
      expect(
        screen.getByText(
          /Building smile progress|Smile progress paused|Smile verification complete/,
        ),
      ).toBeVisible();
    });

    it("renders the completed progress bar after verification", async () => {
      vi.useFakeTimers();
      const view = await makeCameraReadyForFrames();
      setSmile({
        continuity: "ready",
        phase: "complete",
        progressMs: 3000,
      });
      view.rerender(<App />);

      const progress = screen.getByRole("progressbar", {
        name: "Smile verification progress",
      });
      expect(progress).toHaveAttribute("max", "3000");
      expect(progress).toHaveAttribute("value", "3000");
      expect(screen.getByText("Smile verification complete")).toBeVisible();
      expect(
        screen.getByRole("status", { name: "Camera status" }),
      ).not.toHaveTextContent(/\d+\.\d+/);
    });

    it("offers a new detection after verification", async () => {
      vi.useFakeTimers();
      const view = await makeCameraReadyForFrames();
      setSmile({
        continuity: "ready",
        phase: "complete",
        progressMs: 3000,
      });
      view.rerender(<App />);

      fireEvent.click(screen.getByRole("button", { name: "New detection" }));

      expect(vision.resetDetection).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: "Stop camera" })).toBeVisible();
    });

    it("places progress between the status and the controls in the overlay", async () => {
      vi.useFakeTimers();
      const view = await makeCameraReadyForFrames();
      setSmile({ continuity: "ready", phase: "verifying", progressMs: 2500 });
      view.rerender(<App />);

      const overlay = screen.getByRole("region", {
        name: "Live camera controls",
      });
      const status = within(overlay).getByRole("status");
      const progress = within(overlay).getByRole("progressbar", {
        name: "Smile verification progress",
      });
      const stop = within(overlay).getByRole("button", { name: "Stop camera" });
      expect(
        status.compareDocumentPosition(progress) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        progress.compareDocumentPosition(stop) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("renders current smile diagnostics in the Help drawer with two decimal places", async () => {
      vi.useFakeTimers();
      const view = await makeCameraReadyForFrames();
      setSmile({
        continuity: "ready",
        phase: "verifying",
        progressMs: 2000,
        rawScore: 0.6123456,
        smoothedScore: 0.5987654,
        graceRemainingMs: 150,
      });
      view.rerender(<App />);

      fireEvent.click(
        screen.getByRole("button", { name: "Help & system status" }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Help & system status",
      });
      expect(dialog).toHaveTextContent("Raw smile aggregate0.61");
      expect(dialog).toHaveTextContent("Smoothed smile aggregate0.60");
      expect(dialog).toHaveTextContent("High threshold0.60");
      expect(dialog).toHaveTextContent("Low threshold0.45");
      expect(dialog).toHaveTextContent("Smile stateverifying");
      expect(dialog).toHaveTextContent("Continuityready");
      expect(dialog).toHaveTextContent("Grace Window150");
      expect(dialog).not.toHaveTextContent("0.6123456");
    });

    it("renders Not available before smile evidence exists", async () => {
      vi.useFakeTimers();
      const view = await makeCameraReadyForFrames();
      view.rerender(<App />);
      fireEvent.click(
        screen.getByRole("button", { name: "Help & system status" }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Help & system status",
      });
      const raw = within(dialog)
        .getByText("Raw smile aggregate")
        .closest("div");
      const smoothed = within(dialog)
        .getByText("Smoothed smile aggregate")
        .closest("div");
      expect(raw).toHaveTextContent("Not available");
      expect(smoothed).toHaveTextContent("Not available");
    });

    it("keeps diagnostics to the current instant with no event or time series", async () => {
      vi.useFakeTimers();
      const view = await makeCameraReadyForFrames();
      setSmile({
        continuity: "candidate",
        phase: "waiting",
        rawScore: 0.42,
        smoothedScore: 0.4,
      });
      view.rerender(<App />);
      fireEvent.click(
        screen.getByRole("button", { name: "Help & system status" }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Help & system status",
      });
      expect(dialog).toHaveTextContent("Raw smile aggregate0.42");
      dialog.contains(
        screen.getByRole("button", { name: "Close system status" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Close system status" }),
      );

      setSmile({
        continuity: "ready",
        phase: "verifying",
        progressMs: 1000,
        rawScore: 0.66,
        smoothedScore: 0.64,
      });
      view.rerender(<App />);
      fireEvent.click(
        screen.getByRole("button", { name: "Help & system status" }),
      );
      const dialog2 = screen.getByRole("dialog", {
        name: "Help & system status",
      });
      expect(dialog2).toHaveTextContent("Raw smile aggregate0.66");
      expect(dialog2).toHaveTextContent("Smoothed smile aggregate0.64");
      expect(dialog2).not.toHaveTextContent("Raw smile aggregate0.42");
      expect(dialog2).not.toHaveTextContent("Smoothed smile aggregate0.40");
    });
  });
});
