import * as Dialog from "@radix-ui/react-dialog";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CameraRecoveryReason, CameraSnapshot } from "./camera/session";
import { useCameraSession } from "./camera/useCameraSession";

type Copy = { action?: string; heading: string; text: string };

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
  openRequest,
  onOpenRequestHandled,
  snapshot,
  variant = "default",
}: {
  openRequest: boolean;
  onOpenRequestHandled: () => void;
  snapshot: CameraSnapshot;
  variant?: "default" | "overlay";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const effectiveOpen = open || openRequest;
  const setEffectiveOpen = (nextOpen: boolean) => {
    if (!nextOpen) onOpenRequestHandled();
    setOpen(nextOpen);
  };
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
        <dl className="diagnostics-list">
          <div>
            <dt>State</dt>
            <dd>{snapshot.state}</dd>
          </div>
          <div>
            <dt>Permission</dt>
            <dd>{snapshot.permission}</dd>
          </div>
          <div>
            <dt>Facing mode</dt>
            <dd>{snapshot.facingMode ?? "not available"}</dd>
          </div>
          <div>
            <dt>Delivered size</dt>
            <dd>
              {snapshot.width && snapshot.height
                ? `${snapshot.width} × ${snapshot.height}`
                : "not available"}
            </dd>
          </div>
          <div>
            <dt>Generation</dt>
            <dd>{snapshot.generation}</dd>
          </div>
        </dl>
        <p className="diagnostics-events">{snapshot.diagnostics.join(" · ")}</p>
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
      action: "Start camera",
      heading: "Camera stopped",
      text: "You can restart the camera when you are ready.",
    };
  }
  return errorCopy[snapshot.reason ?? "unsupported-camera-api"];
}

export default function App() {
  const { restart, snapshot, start, stop, switchCamera, videoRef } =
    useCameraSession();
  const copy = coachCopy(snapshot);
  const [helpRequest, setHelpRequest] = useState(false);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const recoveryHeadingRef = useRef<HTMLHeadingElement>(null);
  const active =
    snapshot.state === "permission-pending" ||
    snapshot.state === "camera-starting" ||
    snapshot.state === "camera-switching" ||
    snapshot.state === "warm-up" ||
    snapshot.state === "ready" ||
    snapshot.reason === "switch-failed";
  const recovery = snapshot.state === "recoverable-error";
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
  const liveStatus =
    snapshot.reason === "switch-failed"
      ? `Camera status: ${copy.heading}.`
      : snapshot.state === "permission-pending"
        ? "Camera permission requested."
        : snapshot.state === "camera-starting"
          ? "Camera starting."
          : snapshot.state === "camera-switching"
            ? "Switching camera."
            : snapshot.state === "warm-up"
              ? "Hold the device steady while the camera settles."
              : snapshot.state === "ready"
                ? "Camera ready."
                : recovery
                  ? `Camera status: ${copy.heading}.`
                  : "";
  useLayoutEffect(() => {
    if (snapshot.reason === "switch-failed") primaryActionRef.current?.focus();
    else if (recovery) recoveryHeadingRef.current?.focus();
  }, [recovery, snapshot.reason]);
  const runAction = () => {
    if (snapshot.reason === "switch-failed") switchCamera();
    else if (snapshot.state === "privacy-introduction") start();
    else if (snapshot.state === "stopped") restart();
    else if (
      snapshot.state === "camera-starting" ||
      snapshot.state === "camera-switching" ||
      snapshot.state === "warm-up" ||
      snapshot.state === "ready"
    )
      stop();
    else if (
      snapshot.reason === "insecure-context" ||
      snapshot.reason === "unsupported-camera-api"
    )
      setHelpRequest(true);
    else restart();
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
                aria-label="Live camera preview"
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
                      openRequest={helpRequest}
                      onOpenRequestHandled={() => setHelpRequest(false)}
                      snapshot={snapshot}
                      variant="overlay"
                    />
                  </header>
                  <div className="session-chrome__bottom">
                    <div
                      aria-atomic="true"
                      aria-label="Camera status"
                      aria-live="polite"
                      className="session-status"
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
                      <p className="visually-hidden">{liveStatus}</p>
                    </div>
                    <p className="visually-hidden">{copy.text}</p>
                    <div className="session-controls">
                      <button
                        className="session-control session-control--stop"
                        onClick={stop}
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
                          onClick={switchCamera}
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
          <section className="coach-card" aria-labelledby="camera-heading">
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
                    onClick={switchCamera}
                  >
                    Switch camera
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
              openRequest={helpRequest}
              onOpenRequestHandled={() => setHelpRequest(false)}
              snapshot={snapshot}
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
