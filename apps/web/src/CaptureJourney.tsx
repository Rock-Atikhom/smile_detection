import { useEffect, useState, type FormEvent, type RefObject } from "react";
import {
  advanceCaptureFlow,
  createInitialCaptureFlow,
  isValidEmail,
  type BackgroundTreatment,
} from "./capture-flow";
import { createBackgroundRenderer } from "./background-renderer";
import { sendPhoto } from "./delivery";
import {
  capturePhotoBurst,
  captureVideoFrame,
  renderPhotoTreatment,
  type CaptureQuality,
} from "./photo-capture";

interface CaptureJourneyProps {
  hasContinuity: boolean;
  isSingleFace: boolean;
  isSmileVerified: boolean;
  onResetDetection: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
}

const backgroundOptions: Array<{
  id: BackgroundTreatment;
  label: string;
}> = [
  { id: "original", label: "Original room" },
  { id: "studio", label: "Warm studio" },
  { id: "sky", label: "Sky blue" },
];

function nextIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CaptureJourney({
  hasContinuity,
  isSingleFace,
  isSmileVerified,
  onResetDetection,
  videoRef,
}: CaptureJourneyProps) {
  const [flow, setFlow] = useState(createInitialCaptureFlow);
  const [emailStep, setEmailStep] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"mock" | "server" | null>(
    null,
  );
  const [treatmentLoading, setTreatmentLoading] =
    useState<BackgroundTreatment | null>(null);

  const resetJourney = () => {
    setFlow(createInitialCaptureFlow());
    setEmailStep(false);
    setDeliveryMode(null);
    setTreatmentLoading(null);
    onResetDetection();
  };

  useEffect(() => {
    if (isSmileVerified && flow.phase === "waiting") {
      setFlow((current) =>
        advanceCaptureFlow(current, { type: "start-countdown" }),
      );
    }
    if (
      !isSmileVerified &&
      (flow.phase === "countdown" || flow.phase === "capturing")
    ) {
      setFlow(createInitialCaptureFlow());
    }
  }, [flow.phase, isSmileVerified]);

  useEffect(() => {
    if (flow.phase !== "countdown") return;
    const timer = window.setTimeout(() => {
      setFlow((current) =>
        advanceCaptureFlow(current, { type: "countdown-tick" }),
      );
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [flow.countdownRemaining, flow.phase]);

  useEffect(() => {
    if (flow.phase !== "capturing") return;
    let cancelled = false;
    void (async () => {
      try {
        const candidates = await capturePhotoBurst({
          capture: async () => {
            const video = videoRef.current;
            if (video === null) throw new Error("Camera frame is unavailable");
            return captureVideoFrame(video);
          },
          delay: (milliseconds) =>
            new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
          quality: {
            continuity: hasContinuity,
            oneFace: isSingleFace,
            smileVerified: isSmileVerified,
          } satisfies CaptureQuality,
        });
        if (!cancelled) {
          setFlow((current) =>
            advanceCaptureFlow(current, {
              type: "capture-complete",
              candidates,
            }),
          );
        }
      } catch {
        if (!cancelled) {
          setFlow((current) =>
            advanceCaptureFlow(current, {
              type: "capture-complete",
              candidates: [],
            }),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flow.phase, hasContinuity, isSingleFace, isSmileVerified, videoRef]);

  if (flow.phase === "waiting") return null;

  if (flow.phase === "countdown" || flow.phase === "capturing") {
    return (
      <section
        aria-label="Photo capture countdown"
        aria-live="assertive"
        className="capture-journey capture-journey--countdown"
        role="status"
      >
        <p className="capture-journey__eyebrow">Smile verified</p>
        {flow.phase === "countdown" ? (
          <>
            <strong className="capture-journey__countdown">
              {flow.countdownRemaining}
            </strong>
            <p>Hold your smile. Photo in {flow.countdownRemaining}.</p>
          </>
        ) : (
          <p className="capture-journey__capturing">Capturing your photo…</p>
        )}
      </section>
    );
  }

  if (flow.phase === "error") {
    return (
      <section
        aria-label="Photo capture error"
        className="capture-journey capture-journey--message"
        role="alert"
      >
        <p className="capture-journey__eyebrow">Photo not ready</p>
        <h2>{flow.error ?? "We could not capture the photo."}</h2>
        <button
          className="capture-journey__primary"
          onClick={resetJourney}
          type="button"
        >
          Try again
        </button>
      </section>
    );
  }

  if (flow.phase === "sent") {
    return (
      <section
        aria-label="Photo sent"
        className="capture-journey capture-journey--message"
        role="status"
      >
        <p className="capture-journey__eyebrow">All set</p>
        <h2>Photo sent</h2>
        <p>
          {deliveryMode === "mock"
            ? "Demo mode is active, so no email was sent."
            : "Check your inbox for the Smart Smile photo."}
        </p>
        <button
          className="capture-journey__primary"
          onClick={resetJourney}
          type="button"
        >
          New participant
        </button>
      </section>
    );
  }

  const candidate = flow.candidate;
  if (candidate === null) return null;
  const selectedImage = candidate.treatments[flow.background];
  const sending = flow.phase === "sending";
  const emailValid = isValidEmail(flow.email);

  const selectBackground = async (background: BackgroundTreatment) => {
    if (treatmentLoading !== null) return;
    setFlow((current) =>
      advanceCaptureFlow(current, { type: "select-background", background }),
    );
    if (
      background === "original" ||
      candidate.treatments[background] !== candidate.originalUrl
    ) {
      return;
    }

    setTreatmentLoading(background);
    let renderer: Awaited<ReturnType<typeof createBackgroundRenderer>> | null =
      null;
    try {
      renderer = await createBackgroundRenderer();
      const image = await renderPhotoTreatment(candidate, background, renderer);
      setFlow((current) =>
        current.candidate?.id === candidate.id
          ? {
              ...current,
              candidate: {
                ...current.candidate,
                treatments: {
                  ...current.candidate.treatments,
                  [background]: image,
                },
              },
              error: null,
            }
          : current,
      );
    } catch {
      setFlow((current) => ({
        ...current,
        error:
          "That background preview is unavailable. The original photo is still ready.",
      }));
    } finally {
      renderer?.close();
      setTreatmentLoading(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const next = advanceCaptureFlow(flow, { type: "send-started" });
    if (next.phase !== "sending") return;
    setFlow(next);
    try {
      const result = await sendPhoto({
        consent: true,
        email: flow.email.trim(),
        idempotencyKey: nextIdempotencyKey(),
        image: selectedImage,
      });
      setDeliveryMode(result.mode);
      setFlow((current) =>
        advanceCaptureFlow(current, { type: "send-succeeded" }),
      );
    } catch (error) {
      setFlow((current) =>
        advanceCaptureFlow(current, {
          type: "send-failed",
          error:
            error instanceof Error ? error.message : "Photo delivery failed.",
        }),
      );
    }
  };

  return (
    <section
      aria-label="Photo preview and delivery"
      className="capture-journey capture-journey--preview"
    >
      <div className="capture-journey__content">
        <div className="capture-journey__heading">
          <p className="capture-journey__eyebrow">Photo captured</p>
          <h2>
            {emailStep ? "Where should we send it?" : "Choose your photo"}
          </h2>
          <p>
            {emailStep
              ? "Enter an email address to receive the selected photo."
              : "Your original stays available while you compare the three looks."}
          </p>
        </div>
        <div className="capture-journey__images">
          <figure className="capture-journey__image capture-journey__image--selected">
            <img
              alt={`${flow.background} Smart Smile preview`}
              src={selectedImage}
            />
            <figcaption>Selected preview</figcaption>
          </figure>
          <figure className="capture-journey__image">
            <img
              alt="Original room Smart Smile photo"
              src={candidate.originalUrl}
            />
            <figcaption>Original room</figcaption>
          </figure>
        </div>
        {!emailStep && (
          <div
            aria-label="Background options"
            className="capture-journey__options"
          >
            {backgroundOptions.map((option) => (
              <button
                aria-pressed={flow.background === option.id}
                className="capture-journey__option"
                disabled={treatmentLoading !== null}
                key={option.id}
                onClick={() => void selectBackground(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {flow.error && <p className="capture-journey__error">{flow.error}</p>}
        {emailStep ? (
          <form className="capture-journey__form" onSubmit={submit}>
            <label htmlFor="smart-smile-email">Email address</label>
            <input
              autoComplete="email"
              id="smart-smile-email"
              onChange={(event) =>
                setFlow((current) =>
                  advanceCaptureFlow(current, {
                    type: "set-email",
                    email: event.target.value,
                  }),
                )
              }
              placeholder="you@example.com"
              required
              type="email"
              value={flow.email}
            />
            <label className="capture-journey__consent">
              <input
                checked={flow.consent}
                onChange={(event) =>
                  setFlow((current) =>
                    advanceCaptureFlow(current, {
                      type: "set-consent",
                      consent: event.target.checked,
                    }),
                  )
                }
                type="checkbox"
              />
              <span>I agree to receive this photo by email.</span>
            </label>
            <p className="capture-journey__privacy">
              The photo is processed for delivery and is not saved by Smart
              Smile.
            </p>
            <button
              className="capture-journey__primary"
              disabled={!emailValid || !flow.consent || sending}
              type="submit"
            >
              {sending ? "Sending…" : "Send photo"}
            </button>
            <button
              className="capture-journey__secondary"
              onClick={() => setEmailStep(false)}
              type="button"
            >
              Back to preview
            </button>
          </form>
        ) : (
          <div className="capture-journey__actions">
            <button
              className="capture-journey__secondary"
              onClick={resetJourney}
              type="button"
            >
              Retake
            </button>
            <button
              className="capture-journey__primary"
              disabled={treatmentLoading !== null}
              onClick={() => setEmailStep(true)}
              type="button"
            >
              Use this photo
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
