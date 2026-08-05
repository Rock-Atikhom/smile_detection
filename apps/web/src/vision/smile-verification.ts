import type { ContinuityState } from "./face-continuity";
import {
  createSmileFilterState,
  DEFAULT_SMILE_PROFILE,
  updateSmileFilter,
  type SmileFilterState,
} from "./smile-score";

export type VerificationPhase = "waiting" | "verifying" | "paused" | "complete";
export type VerificationReason =
  "none" | "warming" | "face-invalid" | "continuity-lost" | "smile-lost";

export interface SmileVerificationState {
  phase: VerificationPhase;
  reason: VerificationReason;
  filter: SmileFilterState;
  progressMs: number;
  invalidSinceMs: number | null;
  lastCapturedAtMs: number | null;
  previousSampleValid: boolean;
}

export interface SmileVerificationSample {
  capturedAtMs: number;
  rawScore: number;
  continuity: ContinuityState;
  faceEligible: boolean;
  continuityReset?: boolean;
}

export function createSmileVerificationState(): SmileVerificationState {
  return {
    phase: "waiting",
    reason: "warming",
    filter: createSmileFilterState(),
    progressMs: 0,
    invalidSinceMs: null,
    lastCapturedAtMs: null,
    previousSampleValid: false,
  };
}

function clearedState(capturedAtMs: number): SmileVerificationState {
  return {
    ...createSmileVerificationState(),
    lastCapturedAtMs: capturedAtMs,
  };
}

export function advanceSmileVerification(
  state: SmileVerificationState,
  sample: SmileVerificationSample,
): SmileVerificationState {
  const { capturedAtMs, rawScore, continuity, faceEligible, continuityReset } =
    sample;
  if (
    !Number.isFinite(capturedAtMs) ||
    (state.lastCapturedAtMs !== null && capturedAtMs <= state.lastCapturedAtMs)
  ) {
    return state;
  }
  if (state.phase === "complete") return state;

  const filter = updateSmileFilter(state.filter, rawScore);

  if (continuityReset) {
    return createSmileVerificationState();
  }

  if (continuity === "candidate" || continuity === "empty") {
    return clearedState(capturedAtMs);
  }

  if (continuity === "grace") {
    return {
      ...state,
      phase: "paused",
      reason: "continuity-lost",
      filter,
      invalidSinceMs: null,
      lastCapturedAtMs: capturedAtMs,
      previousSampleValid: false,
    };
  }

  const smileValid = filter.smileValid && faceEligible;
  if (!smileValid) {
    if (state.phase !== "verifying" && state.phase !== "paused") {
      return {
        ...state,
        reason: "warming",
        filter,
        progressMs: 0,
        invalidSinceMs: null,
        lastCapturedAtMs: capturedAtMs,
        previousSampleValid: false,
      };
    }
    const invalidSinceMs = state.invalidSinceMs ?? capturedAtMs;
    if (capturedAtMs - invalidSinceMs > DEFAULT_SMILE_PROFILE.graceMs) {
      return clearedState(capturedAtMs);
    }
    return {
      ...state,
      phase: "paused",
      reason: faceEligible ? "smile-lost" : "face-invalid",
      filter,
      invalidSinceMs,
      lastCapturedAtMs: capturedAtMs,
      previousSampleValid: false,
    };
  }

  if (state.phase === "paused" && state.invalidSinceMs !== null) {
    return {
      ...state,
      phase: "verifying",
      reason: "none",
      filter,
      progressMs:
        capturedAtMs - state.invalidSinceMs > DEFAULT_SMILE_PROFILE.graceMs
          ? 0
          : state.progressMs,
      invalidSinceMs: null,
      lastCapturedAtMs: capturedAtMs,
      previousSampleValid: true,
    };
  }

  const delta =
    state.previousSampleValid && state.lastCapturedAtMs !== null
      ? capturedAtMs - state.lastCapturedAtMs
      : 0;
  const progressMs = Math.min(
    DEFAULT_SMILE_PROFILE.verificationMs,
    state.progressMs + delta,
  );
  const phase: VerificationPhase =
    progressMs >= DEFAULT_SMILE_PROFILE.verificationMs
      ? "complete"
      : "verifying";

  return {
    ...state,
    phase,
    reason: "none",
    filter,
    progressMs,
    invalidSinceMs: null,
    lastCapturedAtMs: capturedAtMs,
    previousSampleValid: true,
  };
}
