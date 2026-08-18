export type CapturePhase =
  | "waiting"
  | "countdown"
  | "capturing"
  | "preview"
  | "sending"
  | "sent"
  | "error";

export type BackgroundTreatment = "original" | "studio" | "sky";

export interface CaptureCandidate {
  id: string;
  width: number;
  height: number;
  sharpness: number;
  lighting: number;
  oneFace: boolean;
  continuity: boolean;
  smileVerified: boolean;
  originalUrl: string;
  treatments: Record<BackgroundTreatment, string>;
}

export interface CaptureFlowState {
  phase: CapturePhase;
  countdownRemaining: number;
  candidates: CaptureCandidate[];
  candidate: CaptureCandidate | null;
  background: BackgroundTreatment;
  firstName: string;
  lastName: string;
  nickname: string;
  email: string;
  consent: boolean;
  error: string | null;
}

export type CaptureFlowEvent =
  | { type: "start-countdown" }
  | { type: "countdown-tick" }
  | { type: "capture-complete"; candidates: CaptureCandidate[] }
  | { type: "select-background"; background: BackgroundTreatment }
  | { type: "set-first-name"; firstName: string }
  | { type: "set-last-name"; lastName: string }
  | { type: "set-nickname"; nickname: string }
  | { type: "set-email"; email: string }
  | { type: "set-consent"; consent: boolean }
  | { type: "send-started" }
  | { type: "send-succeeded" }
  | { type: "send-failed"; error: string }
  | { type: "retake" }
  | { type: "reset" };

const COUNTDOWN_SECONDS = 3;
const MIN_SHARPNESS = 0.35;
const MIN_LIGHTING = 0.25;

export function createInitialCaptureFlow(): CaptureFlowState {
  return {
    phase: "waiting",
    countdownRemaining: 0,
    candidates: [],
    candidate: null,
    background: "original",
    firstName: "",
    lastName: "",
    nickname: "",
    email: "",
    consent: false,
    error: null,
  };
}

function passesQualityGate(candidate: CaptureCandidate) {
  return (
    candidate.oneFace &&
    candidate.continuity &&
    candidate.smileVerified &&
    candidate.width >= 640 &&
    candidate.height >= 360 &&
    candidate.sharpness >= MIN_SHARPNESS &&
    candidate.lighting >= MIN_LIGHTING
  );
}

export function selectBestCandidate(
  candidates: CaptureCandidate[],
): CaptureCandidate | null {
  return (
    candidates
      .filter(passesQualityGate)
      .sort(
        (left, right) =>
          right.sharpness + right.lighting - (left.sharpness + left.lighting),
      )[0] ?? null
  );
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidNamePart(value: string, required: boolean) {
  const normalized = value.trim();
  const hasControlCharacter = Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  return (
    (required ? normalized.length > 0 : true) &&
    normalized.length <= 80 &&
    !hasControlCharacter
  );
}

export function isValidParticipantDetails(
  firstName: string,
  lastName: string,
  nickname: string,
) {
  return (
    isValidNamePart(firstName, true) &&
    isValidNamePart(lastName, true) &&
    isValidNamePart(nickname, false)
  );
}

export function canSendPhoto(state: CaptureFlowState) {
  return (
    state.phase === "preview" &&
    state.candidate !== null &&
    isValidParticipantDetails(
      state.firstName,
      state.lastName,
      state.nickname,
    ) &&
    isValidEmail(state.email) &&
    state.consent
  );
}

export function advanceCaptureFlow(
  state: CaptureFlowState,
  event: CaptureFlowEvent,
): CaptureFlowState {
  switch (event.type) {
    case "start-countdown":
      return state.phase === "waiting"
        ? {
            ...state,
            phase: "countdown",
            countdownRemaining: COUNTDOWN_SECONDS,
            error: null,
          }
        : state;
    case "countdown-tick": {
      if (state.phase !== "countdown") return state;
      const remaining = Math.max(0, state.countdownRemaining - 1);
      return {
        ...state,
        countdownRemaining: remaining,
        phase: remaining === 0 ? "capturing" : "countdown",
      };
    }
    case "capture-complete": {
      const best = selectBestCandidate(event.candidates);
      return best === null
        ? {
            ...state,
            phase: "error",
            candidates: [],
            candidate: null,
            error: "We could not capture a clear photo. Try smiling again.",
          }
        : {
            ...state,
            phase: "preview",
            candidates: event.candidates,
            candidate: best,
            background: "original",
            error: null,
          };
    }
    case "select-background":
      return { ...state, background: event.background, error: null };
    case "set-first-name":
      return { ...state, firstName: event.firstName, error: null };
    case "set-last-name":
      return { ...state, lastName: event.lastName, error: null };
    case "set-nickname":
      return { ...state, nickname: event.nickname, error: null };
    case "set-email":
      return { ...state, email: event.email, error: null };
    case "set-consent":
      return { ...state, consent: event.consent, error: null };
    case "send-started":
      return canSendPhoto(state) ? { ...state, phase: "sending" } : state;
    case "send-succeeded":
      return {
        ...state,
        phase: "sent",
        candidates: [],
        email: "",
        consent: false,
        firstName: "",
        lastName: "",
        nickname: "",
        candidate: null,
      };
    case "send-failed":
      return { ...state, phase: "preview", error: event.error };
    case "retake":
    case "reset":
      return createInitialCaptureFlow();
  }
}
