import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";

function PrivacyDisclosure() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      }
      // jsdom exposes an incomplete dialog API; keep semantics testable there.
      if (!dialog.open) dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  return (
    <Dialog.Root modal={false} open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="privacy-trigger" type="button">
        How privacy works
      </Dialog.Trigger>
      <Dialog.Portal forceMount>
        <dialog
          aria-describedby="privacy-description"
          aria-labelledby="privacy-title"
          className="privacy-dialog"
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
          ref={dialogRef}
        >
          <Dialog.Title id="privacy-title">How privacy works</Dialog.Title>
          <Dialog.Description id="privacy-description">
            Smart Smile is designed to keep this experience on your device.
          </Dialog.Description>
          <ul>
            <li>No account is required.</li>
            <li>No camera image or photo is uploaded.</li>
            <li>Microphone access is not used.</li>
            <li>The application does not persist photos.</li>
          </ul>
          <Dialog.Close className="privacy-close" type="button">
            Close privacy details
          </Dialog.Close>
        </dialog>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function App() {
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
        <section
          className="camera-stage"
          aria-label="Camera foundation preview"
        >
          <div className="camera-stage__placeholder" aria-hidden="true">
            <span>Camera preview</span>
            <small>Available in the next delivery step</small>
          </div>
        </section>

        <section className="coach-card" aria-labelledby="privacy-heading">
          <p className="eyebrow">Private by design</p>
          <h1 id="privacy-heading">Take a smile photo privately</h1>
          <p>
            Camera and smile detection run on this device. No camera image or
            photo is uploaded.
          </p>
          <button
            className="primary-action"
            type="button"
            disabled
            aria-describedby="camera-setup-note"
          >
            Continue to camera
          </button>
          <p className="next-step" id="camera-setup-note">
            Camera setup is the next delivery step.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <span>Smart Smile foundation preview</span>
      </footer>
    </div>
  );
}
