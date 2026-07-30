import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAMERA_ATTACHMENT_TIMEOUT_MS,
  CAMERA_WARMUP_MS,
} from "./camera/session";
import App from "./App";

type FakeTrack = EventTarget & {
  stop: ReturnType<typeof vi.fn>;
  getCapabilities: () => MediaTrackCapabilities;
  getSettings: () => MediaTrackSettings;
};

function makeStream() {
  const track = new EventTarget() as FakeTrack;
  track.stop = vi.fn();
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

describe("Smart Smile camera session", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

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

    fireEvent.click(screen.getByRole("button", { name: "How privacy works" }));
    expect(
      screen.getByRole("dialog", { name: "How privacy works" }),
    ).toBeVisible();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("shows permission-pending copy immediately after Continue and requests video only", () => {
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => undefined));
    installCamera(getUserMedia);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Allow camera access",
    );
    expect(
      screen.getByText(
        "Your browser will ask to use the camera. Microphone access is not needed.",
      ),
    ).toBeVisible();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.any(Object) }),
    );
  });

  it("shows a mirrored contained preview through warm-up, then supports stopping", async () => {
    vi.useFakeTimers();
    const { stream, track } = makeStream();
    installCamera(() => Promise.resolve(stream));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
    const video = screen.getByLabelText("Live camera preview");
    await vi.advanceTimersByTimeAsync(0);
    fireEvent.loadedData(video);
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Getting ready",
    );
    expect(video).toHaveClass("camera-preview");
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Hold the device steady while the camera settles.",
    );

    await vi.runAllTimersAsync();
    await vi.advanceTimersByTimeAsync(CAMERA_WARMUP_MS);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Camera ready",
    );
    expect(screen.getByRole("button", { name: "Stop camera" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Stop camera" }));
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Camera stopped",
    );
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
    const video = screen.getByLabelText("Live camera preview");
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
    await vi.advanceTimersByTimeAsync(CAMERA_ATTACHMENT_TIMEOUT_MS - 1_000);
    fireEvent.loadedData(screen.getByLabelText("Live camera preview"));
    await vi.advanceTimersByTimeAsync(1_001);

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
    await vi.waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Starting the camera",
      ),
    );
    const video = screen.getByLabelText("Live camera preview");
    fireEvent.loadedData(video);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(track.stop).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Camera stopped",
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
    const video = screen.getByLabelText("Live camera preview");
    fireEvent.loadedData(video);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(track.stop).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Camera stopped",
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
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "This browser is not supported yet",
    );
    fireEvent.click(screen.getByRole("button", { name: "View help" }));
    expect(
      screen.getByRole("dialog", { name: "Help & system status" }),
    ).toBeVisible();
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
    const video = await screen.findByLabelText("Live camera preview");
    fireEvent.loadedData(video);
    await screen.findByRole("heading", { name: "Getting ready" });
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));

    expect(
      await screen.findByRole("heading", {
        name: "Your current camera is still active",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Switch camera" })).toBeEnabled();
    expect(screen.getByLabelText("Live camera preview")).toBeVisible();
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Camera status: Your current camera is still active.",
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
    const video = (await screen.findByLabelText(
      "Live camera preview",
    )) as HTMLVideoElement;
    fireEvent.loadedData(video);
    await screen.findByRole("heading", { name: "Getting ready" });
    fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Switching camera.",
    );

    resolveCandidate(second.stream);
    await vi.waitFor(() => expect(video.srcObject).toBe(second.stream));
    expect(screen.getByLabelText("Camera status")).toHaveTextContent(
      "Switching camera.",
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
    let video = await screen.findByLabelText("Live camera preview");
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
    video = await screen.findByLabelText("Live camera preview");
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
    const video = screen.getByLabelText("Live camera preview");
    fireEvent.loadedData(video);
    await screen.findByRole("heading", { name: "Getting ready" });

    const trigger = screen.getByRole("button", {
      name: "Help & system status",
    });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Help & system status" });
    expect(dialog).toHaveTextContent("Generation1");
    expect(dialog).toHaveTextContent("Facing modeuser");
    expect(dialog).not.toHaveTextContent("Private webcam name");
    expect(dialog).not.toHaveTextContent("opaque-id");

    fireEvent.click(
      screen.getByRole("button", { name: "Close system status" }),
    );
    expect(trigger).toHaveFocus();
  });
});
