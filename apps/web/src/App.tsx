import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  "switch-failed": {
    action: "Switch camera",
    heading: "Your current camera is still active",
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
  title,
}: {
  children: ReactNode;
  closeLabel: string;
  descriptionId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
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
        className="privacy-dialog"
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
        className="privacy-trigger"
        ref={triggerRef}
        type="button"
      >
        How privacy works
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

function SystemStatus({ snapshot }: { snapshot: CameraSnapshot }) {
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
        className="secondary-action"
        ref={triggerRef}
        type="button"
      >
        Help &amp; system status
      </Dialog.Trigger>
      <NativeDialog
        closeLabel="Close system status"
        descriptionId="system-status-description"
        open={open}
        setOpen={setOpen}
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
  const active =
    snapshot.state === "permission-pending" ||
    snapshot.state === "camera-starting" ||
    snapshot.state === "warm-up" ||
    snapshot.state === "ready" ||
    snapshot.state === "recoverable-error";
  const recovery = snapshot.state === "recoverable-error";
  const runAction = () => {
    if (
      snapshot.state === "privacy-introduction" ||
      snapshot.state === "stopped"
    )
      start();
    else if (
      snapshot.state === "camera-starting" ||
      snapshot.state === "warm-up" ||
      snapshot.state === "ready"
    )
      stop();
    else if (snapshot.reason === "switch-failed") switchCamera();
    else if (
      snapshot.reason === "insecure-context" ||
      snapshot.reason === "unsupported-camera-api"
    )
      return;
    else restart();
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="wordmark"
          href="#main-content"
          aria-label="Smart Smile home"
        >
          Smart Smile
        </a>
        <div className="header-actions">
          <span className="privacy-status">On-device</span>
          <PrivacyDisclosure />
        </div>
      </header>
      <main className="foundation-layout" id="main-content">
        <section className="camera-stage" aria-label="Camera preview">
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
            </>
          ) : (
            <div className="camera-stage__placeholder" aria-hidden="true">
              <span>Camera preview</span>
              <small>Camera stays on this device</small>
            </div>
          )}
        </section>
        <section className="coach-card" aria-labelledby="camera-heading">
          <p className="eyebrow">Private by design</p>
          <h1 id="camera-heading">{copy.heading}</h1>
          <p>{copy.text}</p>
          <p
            aria-label="Camera status"
            aria-live="polite"
            className="camera-status"
            id="camera-status"
          >
            {snapshot.state === "warm-up"
              ? "Hold the device steady while the camera settles."
              : snapshot.state === "ready"
                ? "Camera ready."
                : ""}
          </p>
          {copy.action && (
            <button
              className="primary-action"
              type="button"
              onClick={runAction}
            >
              {copy.action}
            </button>
          )}
          {snapshot.canSwitch &&
            (snapshot.state === "warm-up" || snapshot.state === "ready") && (
              <button
                className="secondary-action"
                type="button"
                onClick={switchCamera}
              >
                Switch camera
              </button>
            )}
          {recovery && (
            <p className="next-step">
              You can open Help &amp; system status for a read-only session
              summary.
            </p>
          )}
          <SystemStatus snapshot={snapshot} />
        </section>
      </main>
      <footer className="site-footer">
        <span>Smart Smile camera preview</span>
      </footer>
    </div>
  );
}
