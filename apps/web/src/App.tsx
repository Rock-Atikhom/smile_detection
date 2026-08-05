import * as Dialog from "@radix-ui/react-dialog";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CameraRecoveryReason, CameraSnapshot } from "./camera/session";
import { useCameraSession } from "./camera/useCameraSession";
import type { VisionSnapshot } from "./vision/coordinator";
import type { FaceGuidance } from "./vision/face-evidence";
import {
  createBrowserFaceFramePump,
  type FaceFramePump,
} from "./vision/face-frame-pump";
import { useVisionRuntime } from "./vision/useVisionRuntime";

type Copy = { action?: string; heading: string; text: string };

const faceGuidanceCopy: Record<FaceGuidance, string> = {
  "no-face": "Show your face",
  "multiple-faces": "Only one person",
  "too-close": "Move back",
  "too-far": "Move closer",
  "off-center": "Center your face",
  "face-ready": "Face ready",
};

const errorCopy: Record<CameraRecoveryReason, Copy> = {
  "aborted-request": {
    action: "Try again",
    heading: "Camera setup was cancelled",
    text: "Start the camera again when you are ready.",
  },
  "busy-unreadable-camera": {
    action: "Try again",
    heading: "Camera is unavailable",
    text: "Close any other app using the camera, then try again.",
  },
  "denied-permission": {
    action: "Try again",
    heading: "Camera access is off",
    text: "Allow camera access in browser or device settings, then return here.",
  },
  "ignored-prompt": {
    action: "Try again",
    heading: "Camera permission is still waiting",
    text: "Choose Allow in the browser prompt, or try again if the prompt was closed.",
  },
  "inactive-document": {
    action: "Restart camera",
    heading: "Camera paused",
    text: "Return to this tab, then restart the camera.",
  },
  "insecure-context": {
    action: "View help",
    heading: "Camera needs a secure connection",
    text: "Open Smart Smile on HTTPS or localhost to use the camera.",
  },
  interruption: {
    action: "Restart camera",
    heading: "The camera stopped",
    text: "Start it again to continue.",
  },
  "missing-camera": {
    action: "Try again",
    heading: "No camera was found",
    text: "Connect or enable a camera, then try again.",
  },
  "overconstrained-request": {
    action: "Try again",
    heading: "This camera needs a different setup",
    text: "Try again to let the browser choose a compatible camera setting.",
  },
  "playback-unavailable": {
    action: "Try again",
    heading: "Camera preview could not start",
    text: "Your camera is available. Try again to start the preview.",
  },
  "switch-failed": {
    action: "Switch camera",
    heading: "Could not switch cameras",
    text: "The other camera could not start. You can keep using this preview or try switching again.",
  },
  "unsupported-camera-api": {
    action: "View help",
    heading: "This browser is not supported yet",
    text: "Open Smart Smile in the latest Chrome, Edge, or Safari.",
  },
};

function NativeDialog({
  children,
  closeLabel,
  descriptionId,
  open,
  setOpen,
  surfaceClassName,
  title,
}: {
  children: ReactNode;
  closeLabel: string;
  descriptionId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  surfaceClassName?: string;
  title: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      if (!dialog.open) dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);
  return (
    <Dialog.Portal forceMount>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={`${descriptionId}-title`}
        className={`privacy-dialog${surfaceClassName ? ` ${surfaceClassName}` : ""}`}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        ref={dialogRef}
      >
        <Dialog.Title id={`${descriptionId}-title`}>{title}</Dialog.Title>
        <div id={descriptionId}>{children}</div>
        <Dialog.Close className="privacy-close" type="button">
          {closeLabel}
        </Dialog.Close>
      </dialog>
    </Dialog.Portal>
  );
}

function PrivacyDisclosure() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return (
    <Dialog.Root modal={false} open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="How privacy works"
        className="privacy-trigger"
        ref={triggerRef}
        type="button"
      >
        <span className="privacy-trigger__wide">How privacy works</span>
        <span aria-hidden="true" className="privacy-trigger__compact">
          Privacy
        </span>
      </Dialog.Trigger>
      <NativeDialog
        closeLabel="Close privacy details"
        descriptionId="privacy-description"
        open={open}
        setOpen={setOpen}
        title="How privacy works"
      >
        <p>Smart Smile is designed to keep this experience on your device.</p>
        <ul>
          <li>No account is required.</li>
          <li>No camera image or photo is uploaded.</li>
          <li>Microphone access is not used.</li>
          <li>The application does not persist photos.</li>
        </ul>
      </NativeDialog>
    </Dialog.Root>
  );
}

function SystemStatus({
  cameraSnapshot,
  openRequest,
  onOpenRequestHandled,
  runtimeSnapshot,
  variant = "default",
}: {
  cameraSnapshot: CameraSnapshot;
  openRequest: boolean;
  onOpenRequestHandled: () => void;
  runtimeSnapshot: VisionSnapshot;
  variant?: "default" | "overlay";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const effectiveOpen = open || openRequest;
  useEffect(() => {
    if (!effectiveOpen && wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = effectiveOpen;
  }, [effectiveOpen]);
  const setEffectiveOpen = (nextOpen: boolean) => {
    if (!nextOpen) onOpenRequestHandled();
    setOpen(nextOpen);
  };
  const cameraStatusLabel =
    cameraSnapshot.state === "ready"
      ? "Ready"
      : cameraSnapshot.state === "recoverable-error"
        ? "Needs attention"
        : cameraSnapshot.state === "privacy-introduction" ||
            cameraSnapshot.state === "stopped"
          ? "Not active"
          : "Preparing";
  const runtimeStatusLabel =
    runtimeSnapshot.runtime === "ready"
      ? "Ready"
      : runtimeSnapshot.runtime === "error"
        ? "Needs attention"
        : "Preparing";
  const offlineStatusLabel =
    runtimeSnapshot.reason === "first-use-offline"
      ? "Connect once to finish setup"
      : runtimeSnapshot.offlineCache === "ready"
        ? "Ready"
        : runtimeSnapshot.offlineCache === "error"
          ? "Needs attention"
          : "Preparing";
  const wasmTierLabel =
    runtimeSnapshot.wasmTier === "simd"
      ? "SIMD"
      : runtimeSnapshot.wasmTier === "baseline"
        ? "Baseline"
        : "Not available";
  return (
    <Dialog.Root
      modal={false}
      open={effectiveOpen}
      onOpenChange={setEffectiveOpen}
    >
      <Dialog.Trigger
        className={`secondary-action system-status-trigger${
          variant === "overlay" ? " system-status-trigger--overlay" : ""
        }`}
        ref={triggerRef}
        type="button"
      >
        {variant === "overlay" && (
          <span aria-hidden="true" className="system-status-trigger__icon">
            ?
          </span>
        )}
        <span className={variant === "overlay" ? "visually-hidden" : undefined}>
          Help &amp; system status
        </span>
      </Dialog.Trigger>
      <NativeDialog
        closeLabel="Close system status"
        descriptionId="system-status-description"
        open={effectiveOpen}
        setOpen={setEffectiveOpen}
        surfaceClassName="system-status-dialog"
        title="Help & system status"
      >
        <dl className="status-list">
          <div>
            <dt>Camera</dt>
            <dd>{cameraStatusLabel}</dd>
          </div>
          <div>
            <dt>On-device smile detection</dt>
            <dd>{runtimeStatusLabel}</dd>
          </div>
          <div>
            <dt>Offline use</dt>
            <dd>{offlineStatusLabel}</dd>
          </div>
        </dl>
        <h3 className="system-details-heading">System details</h3>
        <dl className="diagnostics-list">
          <div>
            <dt>MediaPipe</dt>
            <dd>0.10.35</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>face_landmarker float16/1</dd>
          </div>
          <div>
            <dt>Manifest ID</dt>
            <dd>{runtimeSnapshot.releaseId}</dd>
          </div>
          <div>
            <dt>WASM tier</dt>
            <dd>{wasmTierLabel}</dd>
          </div>
        </dl>
      </NativeDialog>
    </Dialog.Root>
  );
}

function coachCopy(snapshot: CameraSnapshot): Copy {
  if (snapshot.reason === "switch-failed") return errorCopy["switch-failed"];
  if (snapshot.state === "privacy-introduction") {
    return {
      action: "Continue to camera",
      heading: "Take a smile photo privately",
      text: "Camera and smile detection run on this device. No camera image or photo is uploaded.",
    };
  }
  if (snapshot.state === "permission-pending") {
    return {
      action: "Cancel",
      heading: "Allow camera access",
      text: "Your browser will ask to use the camera. Microphone access is not needed.",
    };
  }
  if (snapshot.state === "camera-starting") {
    return {
      action: "Cancel",
      heading: "Starting the camera",
      text: "This may take a moment.",
    };
  }
  if (snapshot.state === "camera-switching") {
    return {
      action: "Stop camera",
      heading: "Switching camera",
      text: "Starting your other camera.",
    };
  }
  if (snapshot.state === "warm-up") {
    return {
      action: "Stop camera",
      heading: "Getting ready",
      text: "Hold the device steady while the camera settles.",
    };
  }
  if (snapshot.state === "ready") {
    return {
      action: "Stop camera",
      heading: "Camera ready",
      text: "The camera is ready. Keep one face inside the guide.",
    };
  }
  if (snapshot.state === "stopped") {
    return {
      action: "Restart camera",
      heading: "Camera is off",
      text: "You can restart the camera when you are ready.",
    };
  }
  return errorCopy[snapshot.reason ?? "unsupported-camera-api"];
}

const preparingCopy: Copy = {
  action: "Cancel",
  heading: "Getting smile detection ready",
  text: "Required files are verified and stay on this device for offline use",
};

const firstUseOfflineCopy: Copy = {
  action: "Try again when online",
  heading: "Connect once to finish setup",
  text: "Connect to the internet once so Smart Smile can verify the required files for offline use.",
};

const integrityRecoveryCopy: Copy = {
  action: "Reload",
  heading: "Smart Smile could not start safely",
  text: "The required files could not be verified. Reload Smart Smile before using the camera.",
};

const cachePreparationFailureCopy: Copy = {
  action: "Try setup again",
  heading: "Smile detection setup needs attention",
  text: "Smart Smile could not store the verified files needed to start safely. Free device storage or try again.",
};

function combinedCopy(
  cameraSnapshot: CameraSnapshot,
  runtimeSnapshot: VisionSnapshot,
  preflighting: boolean,
  firstUseOffline: boolean,
): Copy {
  if (runtimeSnapshot.reason === "runtime-integrity-failed") {
    return integrityRecoveryCopy;
  }
  if (firstUseOffline || runtimeSnapshot.reason === "first-use-offline") {
    return firstUseOfflineCopy;
  }
  if (
    runtimeSnapshot.runtime === "error" &&
    runtimeSnapshot.reason === "offline-cache-failed"
  ) {
    return cachePreparationFailureCopy;
  }
  if (
    cameraSnapshot.state === "permission-pending" ||
    cameraSnapshot.state === "recoverable-error" ||
    cameraSnapshot.state === "camera-switching" ||
    cameraSnapshot.reason === "switch-failed"
  ) {
    return coachCopy(cameraSnapshot);
  }
  if (
    preflighting ||
    ((runtimeSnapshot.runtime === "idle" ||
      runtimeSnapshot.runtime === "preparing") &&
      (cameraSnapshot.state === "camera-starting" ||
        cameraSnapshot.state === "warm-up" ||
        cameraSnapshot.state === "ready"))
  ) {
    return preparingCopy;
  }
  if (cameraSnapshot.state === "ready" && runtimeSnapshot.runtime === "error") {
    return {
      heading: "Smile detection needs attention",
      text: "Stop and restart the camera to try preparing smile detection again.",
    };
  }
  if (
    cameraSnapshot.state === "ready" &&
    runtimeSnapshot.runtime === "ready" &&
    runtimeSnapshot.face.state === "ready" &&
    runtimeSnapshot.face.guidance !== null
  ) {
    return {
      heading: faceGuidanceCopy[runtimeSnapshot.face.guidance],
      text: "",
    };
  }
  return coachCopy(cameraSnapshot);
}

export default function App() {
  const { restart, snapshot, start, stop, switchCamera, videoRef } =
    useCameraSession();
  const vision = useVisionRuntime();
  const [helpRequest, setHelpRequest] = useState(false);
  const [preflighting, setPreflighting] = useState(false);
  const [firstUseOffline, setFirstUseOffline] = useState(false);
  const [offlineAnnouncement, setOfflineAnnouncement] = useState("");
  const [cameraStartRequest, setCameraStartRequest] = useState<
    "start" | "restart" | null
  >(null);
  const faceFramePumpRef = useRef<FaceFramePump | null>(null);
  const faceFrameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionGenerationRef = useRef(0);
  const consumedCameraStartRef = useRef<"start" | "restart" | null>(null);
  const fatalIntegrityRef = useRef(false);
  const previousFatalIntegrityRef = useRef(false);
  const previousOfflineStateRef = useRef(vision.snapshot.offlineCache);
  const previousPriorityStatusRef = useRef(false);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const recoveryHeadingRef = useRef<HTMLHeadingElement>(null);
  const stopFaceFramePump = useCallback(() => {
    if (faceFrameTimerRef.current !== null) {
      clearTimeout(faceFrameTimerRef.current);
      faceFrameTimerRef.current = null;
    }
    const pump = faceFramePumpRef.current;
    faceFramePumpRef.current = null;
    pump?.stop();
    pump?.dispose();
  }, []);
  const copy = combinedCopy(
    snapshot,
    vision.snapshot,
    preflighting,
    firstUseOffline,
  );
  const fatalIntegrity = vision.snapshot.reason === "runtime-integrity-failed";
  const offlineRecovery =
    firstUseOffline || vision.snapshot.reason === "first-use-offline";
  const cachePreparationFailure =
    vision.snapshot.runtime === "error" &&
    vision.snapshot.reason === "offline-cache-failed";
  const active =
    cameraStartRequest !== null ||
    snapshot.state === "permission-pending" ||
    snapshot.state === "camera-starting" ||
    snapshot.state === "camera-switching" ||
    snapshot.state === "warm-up" ||
    snapshot.state === "ready" ||
    snapshot.reason === "switch-failed";
  const recovery =
    fatalIntegrity ||
    offlineRecovery ||
    cachePreparationFailure ||
    snapshot.state === "recoverable-error";
  const sessionOverlayVisible =
    snapshot.state === "camera-starting" ||
    snapshot.state === "camera-switching" ||
    snapshot.state === "warm-up" ||
    snapshot.state === "ready" ||
    snapshot.reason === "switch-failed";
  const switchBusy = snapshot.state === "camera-switching";
  const switchVisible =
    (snapshot.canSwitch || snapshot.reason === "switch-failed") &&
    (snapshot.state === "camera-switching" ||
      snapshot.state === "warm-up" ||
      snapshot.state === "ready" ||
      snapshot.reason === "switch-failed");
  const showSwitch =
    snapshot.canSwitch &&
    (snapshot.state === "warm-up" || snapshot.state === "ready") &&
    snapshot.reason !== "switch-failed";
  const priorityStatus =
    fatalIntegrity ||
    offlineRecovery ||
    cachePreparationFailure ||
    snapshot.state === "recoverable-error" ||
    snapshot.reason === "switch-failed";
  const liveStatus =
    fatalIntegrity ||
    offlineRecovery ||
    cachePreparationFailure ||
    snapshot.state === "recoverable-error"
      ? `Camera status: ${copy.heading}.`
      : snapshot.state === "permission-pending"
        ? "Camera permission requested."
        : offlineAnnouncement;
  const faceGuidance =
    snapshot.state === "ready" &&
    vision.snapshot.runtime === "ready" &&
    vision.snapshot.face.state === "ready"
      ? vision.snapshot.face.guidance
      : null;
  useEffect(() => {
    if (
      snapshot.state !== "ready" ||
      vision.snapshot.runtime !== "ready" ||
      snapshot.width === undefined ||
      snapshot.height === undefined ||
      videoRef.current === null ||
      typeof createImageBitmap !== "function"
    ) {
      stopFaceFramePump();
      return;
    }

    const height = snapshot.height;
    const width = snapshot.width;
    const monotonicNow = () => performance.now();
    const pump = createBrowserFaceFramePump({
      video: videoRef.current,
      now: monotonicNow,
      submit: vision.submitFrame,
    });
    let active = true;
    let lastCaptureAtMs = Number.NEGATIVE_INFINITY;
    faceFramePumpRef.current = pump;
    const schedule = () => {
      if (!active) return;
      const currentTimeMs = monotonicNow();
      if (currentTimeMs - lastCaptureAtMs >= 50) {
        lastCaptureAtMs = currentTimeMs;
        void pump.tick({
          generation: vision.snapshot.generation,
          cameraGeneration: snapshot.generation,
          height,
          width,
        });
      }
      faceFrameTimerRef.current = setTimeout(schedule, 50);
    };
    schedule();

    return () => {
      active = false;
      if (faceFrameTimerRef.current !== null) {
        clearTimeout(faceFrameTimerRef.current);
        faceFrameTimerRef.current = null;
      }
      if (faceFramePumpRef.current === pump) {
        faceFramePumpRef.current = null;
      }
      pump.stop();
      pump.dispose();
    };
  }, [
    snapshot.generation,
    snapshot.height,
    snapshot.state,
    snapshot.width,
    stopFaceFramePump,
    videoRef,
    vision.snapshot.generation,
    vision.snapshot.runtime,
    vision.submitFrame,
  ]);
  useEffect(() => {
    const previous = previousOfflineStateRef.current;
    previousOfflineStateRef.current = vision.snapshot.offlineCache;
    if (
      previous !== "ready" &&
      vision.snapshot.offlineCache === "ready" &&
      !priorityStatus
    ) {
      setOfflineAnnouncement("Smart Smile is ready for offline use");
    }
  }, [priorityStatus, vision.snapshot.offlineCache]);
  useLayoutEffect(() => {
    fatalIntegrityRef.current = fatalIntegrity;
    const enteredFatal = fatalIntegrity && !previousFatalIntegrityRef.current;
    previousFatalIntegrityRef.current = fatalIntegrity;
    if (!enteredFatal) return;

    actionGenerationRef.current += 1;
    consumedCameraStartRef.current = null;
    setPreflighting(false);
    setFirstUseOffline(false);
    setOfflineAnnouncement("");
    setCameraStartRequest(null);
    stopFaceFramePump();
    stop();
  }, [fatalIntegrity, stop, stopFaceFramePump]);
  useLayoutEffect(() => {
    const enteredPriorityStatus =
      priorityStatus && !previousPriorityStatusRef.current;
    previousPriorityStatusRef.current = priorityStatus;
    if (enteredPriorityStatus) setOfflineAnnouncement("");
  }, [priorityStatus]);
  useLayoutEffect(() => {
    if (
      fatalIntegrityRef.current ||
      cameraStartRequest === null ||
      consumedCameraStartRef.current === cameraStartRequest
    ) {
      return;
    }
    consumedCameraStartRef.current = cameraStartRequest;
    if (cameraStartRequest === "start") start();
    else restart();
    queueMicrotask(() => {
      setCameraStartRequest((current) =>
        current === cameraStartRequest ? null : current,
      );
    });
  }, [cameraStartRequest, restart, start]);
  useLayoutEffect(() => {
    if (snapshot.reason === "switch-failed") primaryActionRef.current?.focus();
    else if (recovery) recoveryHeadingRef.current?.focus();
  }, [copy.heading, recovery, snapshot.reason, snapshot.state]);
  const stopCombined = () => {
    actionGenerationRef.current += 1;
    setPreflighting(false);
    setFirstUseOffline(false);
    setOfflineAnnouncement("");
    consumedCameraStartRef.current = null;
    setCameraStartRequest(null);
    stopFaceFramePump();
    stop();
    vision.cancel();
  };
  const beginCombined = async (restartRequested: boolean) => {
    const generation = actionGenerationRef.current + 1;
    actionGenerationRef.current = generation;
    setFirstUseOffline(false);
    setOfflineAnnouncement("");
    setPreflighting(true);
    const result = restartRequested
      ? await vision.restart()
      : await vision.prepare();
    if (
      actionGenerationRef.current !== generation ||
      fatalIntegrityRef.current
    ) {
      return;
    }
    setPreflighting(false);
    if (result === "first-use-offline") {
      setFirstUseOffline(true);
      return;
    }
    if (result === "failed") return;
    consumedCameraStartRef.current = null;
    setCameraStartRequest(
      snapshot.state === "privacy-introduction" ? "start" : "restart",
    );
  };
  const runSwitchCamera = () => {
    setOfflineAnnouncement("");
    stopFaceFramePump();
    switchCamera();
  };
  const runAction = () => {
    if (fatalIntegrity) window.location.reload();
    else if (snapshot.reason === "switch-failed") runSwitchCamera();
    else if (preflighting) stopCombined();
    else if (offlineRecovery) void beginCombined(true);
    else if (snapshot.state === "privacy-introduction") {
      void beginCombined(false);
    } else if (snapshot.state === "stopped") void beginCombined(true);
    else if (
      snapshot.state === "permission-pending" ||
      snapshot.state === "camera-starting" ||
      snapshot.state === "camera-switching" ||
      snapshot.state === "warm-up" ||
      snapshot.state === "ready"
    )
      stopCombined();
    else if (
      snapshot.reason === "insecure-context" ||
      snapshot.reason === "unsupported-camera-api"
    )
      setHelpRequest(true);
    else void beginCombined(true);
  };

  return (
    <div
      className={`app-shell${
        sessionOverlayVisible ? " app-shell--camera-active" : ""
      }`}
    >
      {!sessionOverlayVisible && (
        <header className="site-header">
          <a
            aria-label="Smart Smile home"
            className="wordmark"
            href="#main-content"
          >
            Smart Smile
          </a>
          <div className="header-actions">
            <span className="privacy-status">On-device</span>
            <PrivacyDisclosure />
          </div>
        </header>
      )}
      <main
        className={`foundation-layout${
          sessionOverlayVisible ? " foundation-layout--camera-active" : ""
        }`}
        id="main-content"
      >
        <section
          aria-label="Camera preview"
          className={`camera-stage${
            sessionOverlayVisible ? " camera-stage--session" : ""
          }`}
        >
          {active ? (
            <>
              <video
                aria-hidden="true"
                autoPlay
                className="camera-preview"
                muted
                playsInline
                ref={videoRef}
              />
              <div aria-hidden="true" className="capture-zone" />
              {sessionOverlayVisible && (
                <section
                  aria-label="Live camera controls"
                  className="camera-session-overlay"
                >
                  <header className="session-chrome__top">
                    <span className="wordmark wordmark--overlay">
                      Smart Smile
                    </span>
                    <SystemStatus
                      cameraSnapshot={snapshot}
                      openRequest={helpRequest}
                      onOpenRequestHandled={() => setHelpRequest(false)}
                      runtimeSnapshot={vision.snapshot}
                      variant="overlay"
                    />
                  </header>
                  <div className="session-chrome__bottom">
                    <div
                      aria-atomic="true"
                      aria-label="Camera status"
                      aria-live="polite"
                      className={`session-status${
                        faceGuidance === "face-ready"
                          ? " session-status--ready"
                          : faceGuidance !== null
                            ? " session-status--warning"
                            : ""
                      }`}
                      role="status"
                    >
                      <span
                        aria-hidden="true"
                        className="session-status__dot"
                      />
                      <h1
                        id="camera-heading"
                        ref={recoveryHeadingRef}
                        tabIndex={-1}
                      >
                        {copy.heading}
                      </h1>
                      {offlineAnnouncement && (
                        <span className="visually-hidden">
                          {offlineAnnouncement}
                        </span>
                      )}
                    </div>
                    <p className="visually-hidden">{copy.text}</p>
                    <div className="session-controls">
                      <button
                        className="session-control session-control--stop"
                        onClick={stopCombined}
                        type="button"
                      >
                        <span aria-hidden="true">■</span>
                        Stop camera
                      </button>
                      {switchVisible && (
                        <button
                          aria-busy={switchBusy || undefined}
                          className="session-control session-control--switch"
                          disabled={switchBusy}
                          onClick={runSwitchCamera}
                          ref={
                            snapshot.reason === "switch-failed"
                              ? primaryActionRef
                              : undefined
                          }
                          type="button"
                        >
                          <span aria-hidden="true">↻</span>
                          Switch camera
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="camera-stage__placeholder" aria-hidden="true">
              <span>Camera preview</span>
              <small>Camera stays on this device</small>
            </div>
          )}
        </section>
        {!sessionOverlayVisible && (
          <section
            className={`coach-card${recovery ? " coach-card--recovery" : ""}`}
            aria-labelledby="camera-heading"
          >
            <p className="eyebrow">Private by design</p>
            <h1 id="camera-heading" ref={recoveryHeadingRef} tabIndex={-1}>
              {copy.heading}
            </h1>
            <p>{copy.text}</p>
            <p
              aria-label="Camera status"
              aria-atomic="true"
              aria-live="polite"
              className="camera-status"
              id="camera-status"
              role="status"
            >
              {liveStatus}
            </p>
            {(copy.action || showSwitch) && (
              <div
                className={`camera-actions${copy.action && showSwitch ? " camera-actions--split" : ""}`}
              >
                {copy.action && (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={runAction}
                    ref={primaryActionRef}
                  >
                    {copy.action}
                  </button>
                )}
                {showSwitch && (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={runSwitchCamera}
                  >
                    Switch camera
                  </button>
                )}
                {fatalIntegrity && (
                  <button
                    className="secondary-action"
                    onClick={() => setHelpRequest(true)}
                    type="button"
                  >
                    View help
                  </button>
                )}
              </div>
            )}
            {recovery && (
              <p className="next-step">
                You can open Help &amp; system status for a read-only session
                summary.
              </p>
            )}
            <SystemStatus
              cameraSnapshot={snapshot}
              openRequest={helpRequest}
              onOpenRequestHandled={() => setHelpRequest(false)}
              runtimeSnapshot={vision.snapshot}
            />
          </section>
        )}
      </main>
      {!sessionOverlayVisible && (
        <footer className="site-footer">
          <span>Smart Smile camera preview</span>
        </footer>
      )}
    </div>
  );
}
