import * as Dialog from "@radix-ui/react-dialog";

export default function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="#main-content" aria-label="Smart Smile home">
          Smart Smile
        </a>
        <div className="header-actions">
          <span className="privacy-status">On-device</span>
          <Dialog.Root>
            <Dialog.Trigger className="privacy-trigger" type="button">
              How privacy works
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="privacy-overlay" />
              <Dialog.Content className="privacy-dialog">
                <Dialog.Title>How privacy works</Dialog.Title>
                <Dialog.Description>
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
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </header>

      <main className="foundation-layout" id="main-content">
        <section className="camera-stage" aria-label="Camera foundation preview">
          <div className="camera-stage__placeholder" aria-hidden="true">
            <span>Camera preview</span>
            <small>Available in the next delivery step</small>
          </div>
        </section>

        <section className="coach-card" aria-labelledby="privacy-heading">
          <p className="eyebrow">Private by design</p>
          <h1 id="privacy-heading">Take a smile photo privately</h1>
          <p>
            Camera and smile detection run on this device. No camera image or photo is
            uploaded.
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
