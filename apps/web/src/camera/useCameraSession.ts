import { useEffect, useRef, useState } from "react";
import {
  CAMERA_ATTACHMENT_TIMEOUT_MS,
  CameraSession,
  createInitialCameraSnapshot,
  type CameraSnapshot,
} from "./session";

function isMobileClient() {
  const navigatorWithHints = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  return (
    navigatorWithHints.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
}

async function attachAndPlay(
  video: HTMLVideoElement | null,
  stream: MediaStream,
  signal: AbortSignal,
) {
  if (!video) throw { name: "InvalidStateError" };
  video.srcObject = stream;
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
        video.removeEventListener("loadeddata", onFrame);
      };
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        finish();
        callback();
      };
      const onAbort = () => settle(() => reject({ name: "AbortError" }));
      const onFrame = () => {
        video.removeEventListener("loadeddata", onFrame);
        try {
          void video.play().then(
            () => settle(resolve),
            (error) => settle(() => reject(error)),
          );
        } catch (error) {
          settle(() => reject(error));
        }
      };
      const timeout = setTimeout(
        () => settle(() => reject({ name: "AbortError" })),
        CAMERA_ATTACHMENT_TIMEOUT_MS,
      );
      signal.addEventListener("abort", onAbort, { once: true });
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onFrame();
      else video.addEventListener("loadeddata", onFrame, { once: true });
    });
  } catch (error) {
    if (signal.aborted) throw { name: "AbortError" };
    throw { name: "PlaybackError", cause: error };
  }
  if (signal.aborted) throw { name: "AbortError" };
  return { height: video.videoHeight, width: video.videoWidth };
}

export function useCameraSession() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [session, setSession] = useState<CameraSession | null>(null);
  const [snapshot, setSnapshot] = useState<CameraSnapshot>(
    createInitialCameraSnapshot(),
  );

  useEffect(() => {
    const camera = new CameraSession({
      attachAndPlay: (stream, signal) =>
        attachAndPlay(videoRef.current, stream, signal),
      detach: () => {
        if (videoRef.current) videoRef.current.srcObject = null;
      },
      enumerateDevices: () =>
        navigator.mediaDevices?.enumerateDevices?.() ?? Promise.resolve([]),
      getUserMedia: (constraints) => {
        if (!navigator.mediaDevices?.getUserMedia) {
          return Promise.reject({ name: "UnsupportedCameraApiError" });
        }
        return navigator.mediaDevices.getUserMedia(constraints);
      },
      isMobile: isMobileClient,
      isSecureContext: () => window.isSecureContext,
      restore: async (stream, signal) => {
        await attachAndPlay(videoRef.current, stream, signal);
      },
    });
    setSession(camera);
    const unsubscribe = camera.subscribe(setSnapshot);
    const handleVisibility = () => {
      void camera.setVisibility(document.visibilityState === "visible");
    };
    const handleOrientation = () => {
      void camera.reconstructForOrientation();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("orientationchange", handleOrientation);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("orientationchange", handleOrientation);
      unsubscribe();
      camera.dispose();
      setSession(null);
    };
  }, []);

  return {
    snapshot,
    start: () => void session?.start(),
    restart: () => void session?.restart(),
    stop: () => session?.stop(),
    switchCamera: () => void session?.switchCamera(),
    videoRef,
  };
}

export { createInitialCameraSnapshot };
