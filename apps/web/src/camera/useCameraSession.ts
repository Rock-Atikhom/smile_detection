import { useEffect, useRef, useState } from "react";
import {
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
) {
  if (!video) throw { name: "InvalidStateError" };
  video.srcObject = stream;
  await new Promise<void>((resolve) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve();
      return;
    }
    video.addEventListener("loadeddata", () => resolve(), { once: true });
  });
  await video.play();
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
      attachAndPlay: (stream) => attachAndPlay(videoRef.current, stream),
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
      restore: (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
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
