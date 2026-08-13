import { useEffect, useMemo, useState } from "react";

type VariantKey = "A" | "B" | "C";
type BackgroundKey = "original" | "studio" | "sky";

const variantNames: Record<VariantKey, string> = {
  A: "Decision rail",
  B: "Immersive sheet",
  C: "Preview gallery",
};

const backgrounds: Array<{
  key: BackgroundKey;
  label: string;
  detail: string;
}> = [
  { key: "original", label: "Original", detail: "Keep the room" },
  { key: "studio", label: "Warm studio", detail: "Soft neutral light" },
  { key: "sky", label: "Sky blue", detail: "Bright and playful" },
];

function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: VariantKey;
  onChange: (variant: VariantKey) => void;
}) {
  const variants: VariantKey[] = ["A", "B", "C"];
  const index = variants.indexOf(current);
  const cycle = (offset: number) =>
    onChange(variants[(index + offset + variants.length) % variants.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, button, [contenteditable]")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <nav aria-label="Prototype variants" className="prototype-switcher">
      <button
        aria-label="Previous prototype"
        onClick={() => cycle(-1)}
        type="button"
      >
        ←
      </button>
      <span>
        {current} — {variantNames[current]}
      </span>
      <button
        aria-label="Next prototype"
        onClick={() => cycle(1)}
        type="button"
      >
        →
      </button>
    </nav>
  );
}

function FakePhoto({
  background,
  compact = false,
}: {
  background: BackgroundKey;
  compact?: boolean;
}) {
  return (
    <div
      aria-label={`${backgrounds.find((item) => item.key === background)?.label} photo preview`}
      className={`prototype-photo prototype-photo--${background}${compact ? " prototype-photo--compact" : ""}`}
      role="img"
    >
      <div className="prototype-photo__glow" />
      <div className="prototype-photo__head" />
      <div className="prototype-photo__face">
        <span />
        <span />
      </div>
      <div className="prototype-photo__smile" />
      <div className="prototype-photo__body" />
      <small>Prototype photo</small>
    </div>
  );
}

function BackgroundOptions({
  compact = false,
  selected,
  onSelect,
}: {
  compact?: boolean;
  selected: BackgroundKey;
  onSelect: (background: BackgroundKey) => void;
}) {
  return (
    <div
      className={`prototype-backgrounds${compact ? " prototype-backgrounds--compact" : ""}`}
    >
      <div className="prototype-section-heading">
        <p className="eyebrow">Background</p>
        <span>Illustrative options</span>
      </div>
      <div className="prototype-background-list">
        {backgrounds.map((background) => (
          <button
            aria-pressed={selected === background.key}
            className={`prototype-background-option${selected === background.key ? " is-selected" : ""}`}
            key={background.key}
            onClick={() => onSelect(background.key)}
            type="button"
          >
            <FakePhoto background={background.key} compact />
            <span>
              <strong>{background.label}</strong>
              <small>{background.detail}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewActions({
  onRetake,
  onUse,
}: {
  onRetake: () => void;
  onUse: () => void;
}) {
  return (
    <div className="prototype-actions">
      <button className="secondary-action" onClick={onRetake} type="button">
        Retake
      </button>
      <button className="primary-action" onClick={onUse} type="button">
        Use this photo
      </button>
    </div>
  );
}

function QualitySummary() {
  return (
    <div className="prototype-quality" aria-label="Photo quality summary">
      <span>✓ One person</span>
      <span>✓ Face centered</span>
      <span>✓ Smile verified</span>
    </div>
  );
}

function DecisionRailVariant({
  background,
  onRetake,
  onSelect,
  onUse,
}: {
  background: BackgroundKey;
  onRetake: () => void;
  onSelect: (background: BackgroundKey) => void;
  onUse: () => void;
}) {
  return (
    <main className="preview-prototype__layout preview-prototype__layout--rail">
      <section className="preview-prototype__photo-column">
        <div className="prototype-kicker">Photo ready · 00:01 ago</div>
        <FakePhoto background={background} />
        <p className="prototype-caption">A quiet moment, ready to send.</p>
      </section>
      <aside className="prototype-decision-rail">
        <div>
          <p className="eyebrow">Step 02 / 03</p>
          <h1>Choose your photo</h1>
          <p className="prototype-lede">
            Your smile was verified. Pick a background, then continue when the
            preview feels right.
          </p>
        </div>
        <QualitySummary />
        <BackgroundOptions onSelect={onSelect} selected={background} />
        <PreviewActions onRetake={onRetake} onUse={onUse} />
      </aside>
    </main>
  );
}

function ImmersiveSheetVariant({
  background,
  onRetake,
  onSelect,
  onUse,
}: {
  background: BackgroundKey;
  onRetake: () => void;
  onSelect: (background: BackgroundKey) => void;
  onUse: () => void;
}) {
  return (
    <main className="preview-prototype__immersive">
      <div className="prototype-immersive-photo">
        <FakePhoto background={background} />
        <div className="prototype-immersive-badge">Smile verified</div>
      </div>
      <section className="prototype-bottom-sheet">
        <div className="prototype-bottom-sheet__handle" />
        <div className="prototype-bottom-sheet__heading">
          <div>
            <p className="eyebrow">Step 02 / 03</p>
            <h1>Make it yours</h1>
          </div>
          <span className="prototype-sheet-count">1 of 1</span>
        </div>
        <p className="prototype-lede">
          Choose a backdrop for your photo. You can change it before sending.
        </p>
        <BackgroundOptions compact onSelect={onSelect} selected={background} />
        <PreviewActions onRetake={onRetake} onUse={onUse} />
      </section>
    </main>
  );
}

function PreviewGalleryVariant({
  background,
  onRetake,
  onSelect,
  onUse,
}: {
  background: BackgroundKey;
  onRetake: () => void;
  onSelect: (background: BackgroundKey) => void;
  onUse: () => void;
}) {
  return (
    <main className="preview-prototype__layout preview-prototype__layout--gallery">
      <aside className="prototype-gallery-intro">
        <p className="eyebrow">Step 02 / 03</p>
        <h1>Pick a finish</h1>
        <p className="prototype-lede">
          Compare the same captured moment across three directions before you
          continue.
        </p>
        <QualitySummary />
        <div className="prototype-gallery-note">
          <strong>Preview is required</strong>
          <span>You can retake before entering an email.</span>
        </div>
      </aside>
      <section className="prototype-gallery-stage">
        <div className="prototype-gallery-grid">
          {backgrounds.map((option) => (
            <button
              aria-pressed={background === option.key}
              className={`prototype-gallery-card${background === option.key ? " is-selected" : ""}`}
              key={option.key}
              onClick={() => onSelect(option.key)}
              type="button"
            >
              <FakePhoto background={option.key} />
              <span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="prototype-gallery-footer">
          <span>
            Selected:{" "}
            {backgrounds.find((item) => item.key === background)?.label}
          </span>
          <PreviewActions onRetake={onRetake} onUse={onUse} />
        </div>
      </section>
    </main>
  );
}

export default function PhotoPreviewPrototype() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialVariant = params.get("variant")?.toUpperCase();
  const [variant, setVariant] = useState<VariantKey>(
    initialVariant === "B" || initialVariant === "C" ? initialVariant : "A",
  );
  const [background, setBackground] = useState<BackgroundKey>("original");
  const [message, setMessage] = useState("");

  const changeVariant = (next: VariantKey) => {
    const nextParams = new URLSearchParams(window.location.search);
    nextParams.set("prototype", "preview");
    nextParams.set("variant", next);
    window.history.replaceState({}, "", `?${nextParams.toString()}`);
    setVariant(next);
  };

  const retake = () =>
    setMessage("Retake would return the participant to the camera.");
  const usePhoto = () =>
    setMessage("Next step would collect an email address.");

  return (
    <div
      className={`preview-prototype preview-prototype--${variant.toLowerCase()}`}
    >
      <header className="preview-prototype__header">
        <a className="wordmark" href="?prototype=preview&variant=A">
          Smart Smile
        </a>
        <span className="preview-prototype__privacy">
          On-device · prototype
        </span>
      </header>
      <div className="preview-prototype__notice" role="status">
        <span>THROWAWAY UI PROTOTYPE</span>
        <strong>Preview contract exploration</strong>
        <small>Background names and photo are illustrative only.</small>
      </div>
      {variant === "A" && (
        <DecisionRailVariant
          background={background}
          onRetake={retake}
          onSelect={setBackground}
          onUse={usePhoto}
        />
      )}
      {variant === "B" && (
        <ImmersiveSheetVariant
          background={background}
          onRetake={retake}
          onSelect={setBackground}
          onUse={usePhoto}
        />
      )}
      {variant === "C" && (
        <PreviewGalleryVariant
          background={background}
          onRetake={retake}
          onSelect={setBackground}
          onUse={usePhoto}
        />
      )}
      {message && <p className="preview-prototype__message">{message}</p>}
      <PrototypeSwitcher current={variant} onChange={changeVariant} />
    </div>
  );
}
