import type { FaceGuidance, NormalizedFaceObservation } from "./face-evidence";

export type ContinuityState = "empty" | "candidate" | "ready" | "grace";
export type ContinuityReason =
  | "none"
  | "warming"
  | "no-face"
  | "multiple-faces"
  | "position"
  | "nonmatch"
  | "expired";

export interface TimestampedFaceAnalysis {
  timestamp: number;
  observation: NormalizedFaceObservation | undefined;
  initialEligible: boolean;
  tolerantEligible: boolean;
  faceCount: 0 | 1 | 2;
  guidance: FaceGuidance;
}

export interface ContinuityResult {
  state: ContinuityState;
  reason: ContinuityReason;
  consecutiveMatches: number;
  reset: boolean;
}

export interface FaceContinuityTracker {
  update(input: TimestampedFaceAnalysis): ContinuityResult;
  reset(): void;
}

const CENTER_THRESHOLD = 0.15;
const HEIGHT_RATIO_MIN = 0.67;
const HEIGHT_RATIO_MAX = 1.5;
const ANCHOR_THRESHOLD = 0.12;
const GRACE_MS = 300;
const READY_COUNT = 3;
const ADAPT = 0.25;

type Classification =
  | "no-face"
  | "multiple-faces"
  | "position"
  | "inoffensive"
  | "seed"
  | "match"
  | "nonmatch";

function anchorDelta(
  current: NormalizedFaceObservation,
  reference: NormalizedFaceObservation,
): number {
  let max = 0;
  for (let i = 0; i < 8; i += 2) {
    const dx = current.anchors[i] - reference.anchors[i];
    const dy = current.anchors[i + 1] - reference.anchors[i + 1];
    max = Math.max(max, Math.sqrt(dx * dx + dy * dy));
  }
  return max;
}

function isSameFace(
  current: NormalizedFaceObservation,
  reference: NormalizedFaceObservation,
): boolean {
  const centerDistance = Math.sqrt(
    (current.centerX - reference.centerX) ** 2 +
      (current.centerY - reference.centerY) ** 2,
  );
  if (centerDistance >= CENTER_THRESHOLD) return false;
  const heightRatio = current.height / reference.height;
  if (heightRatio <= HEIGHT_RATIO_MIN || heightRatio >= HEIGHT_RATIO_MAX)
    return false;
  if (anchorDelta(current, reference) >= ANCHOR_THRESHOLD) return false;
  return true;
}

function adapt(
  reference: NormalizedFaceObservation,
  current: NormalizedFaceObservation,
): NormalizedFaceObservation {
  return {
    centerX: reference.centerX * (1 - ADAPT) + current.centerX * ADAPT,
    centerY: reference.centerY * (1 - ADAPT) + current.centerY * ADAPT,
    width: reference.width * (1 - ADAPT) + current.width * ADAPT,
    height: reference.height * (1 - ADAPT) + current.height * ADAPT,
    anchors: current.anchors.map(
      (value, index) => reference.anchors[index] * (1 - ADAPT) + value * ADAPT,
    ) as NormalizedFaceObservation["anchors"],
  };
}

export function createFaceContinuityTracker(): FaceContinuityTracker {
  let state: ContinuityState = "empty";
  let consecutiveMatches = 0;
  let reference: NormalizedFaceObservation | undefined;
  let lastGoodTs: number | undefined;
  let lastTimestamp: number | undefined;
  let lastResult: ContinuityResult = {
    state: "empty",
    reason: "none",
    consecutiveMatches: 0,
    reset: false,
  };
  let graceFrom: ContinuityState | undefined;

  function emptyResult(entry: ContinuityReason): ContinuityResult {
    return {
      state: "empty",
      reason: entry,
      consecutiveMatches: 0,
      reset: false,
    };
  }

  function seed(
    input: TimestampedFaceAnalysis,
    resetFlag: boolean,
  ): ContinuityResult {
    const observation = input.observation;
    reference = observation
      ? {
          centerX: observation.centerX,
          centerY: observation.centerY,
          width: observation.width,
          height: observation.height,
          anchors: [...observation.anchors],
        }
      : undefined;
    state = "candidate";
    consecutiveMatches = 1;
    lastGoodTs = input.timestamp;
    graceFrom = undefined;
    return {
      state: "candidate",
      reason: "warming",
      consecutiveMatches: 1,
      reset: resetFlag,
    };
  }

  function enterGrace(entry: ContinuityReason): ContinuityResult {
    if (graceFrom === undefined) graceFrom = state;
    state = "grace";
    return {
      state: "grace",
      reason: entry,
      consecutiveMatches,
      reset: false,
    };
  }

  function onMatch(input: TimestampedFaceAnalysis): ContinuityResult {
    const current = input.observation;
    if (!current || !reference) return emptyResult("none");
    reference = adapt(reference, current);
    lastGoodTs = input.timestamp;

    if (graceFrom === "ready") {
      graceFrom = undefined;
      state = "ready";
      return {
        state: "ready",
        reason: "none",
        consecutiveMatches,
        reset: false,
      };
    }

    consecutiveMatches += 1;
    if (graceFrom === undefined) {
      if (consecutiveMatches >= READY_COUNT) {
        state = "ready";
        return {
          state: "ready",
          reason: "none",
          consecutiveMatches,
          reset: false,
        };
      }
      state = "candidate";
      return {
        state: "candidate",
        reason: "warming",
        consecutiveMatches,
        reset: false,
      };
    }

    // Recovering into candidate after grace.
    if (consecutiveMatches >= READY_COUNT) {
      graceFrom = undefined;
      state = "ready";
      return {
        state: "ready",
        reason: "none",
        consecutiveMatches,
        reset: false,
      };
    }
    const next = graceFrom;
    graceFrom = undefined;
    state = next;
    return {
      state: next,
      reason: "warming",
      consecutiveMatches,
      reset: false,
    };
  }

  function classify(input: TimestampedFaceAnalysis): Classification {
    if (input.faceCount === 0) return "no-face";
    if (input.faceCount === 2) return "multiple-faces";
    if (!input.observation) return "no-face";
    if (!input.tolerantEligible) return "position";
    if (reference === undefined)
      return input.initialEligible ? "seed" : "inoffensive";
    return isSameFace(input.observation, reference) ? "match" : "nonmatch";
  }

  function update(input: TimestampedFaceAnalysis): ContinuityResult {
    if (lastTimestamp !== undefined && input.timestamp <= lastTimestamp) {
      return lastResult;
    }
    lastTimestamp = input.timestamp;

    const hasFace = input.faceCount === 1 && input.observation !== undefined;
    if (
      reference !== undefined &&
      hasFace &&
      lastGoodTs !== undefined &&
      input.timestamp - lastGoodTs > GRACE_MS
    ) {
      lastResult = input.initialEligible
        ? seed(input, true)
        : enterGrace("expired");
      return lastResult;
    }

    const kind = classify(input);
    switch (kind) {
      case "no-face":
        lastResult =
          reference === undefined
            ? emptyResult("no-face")
            : enterGrace("no-face");
        break;
      case "multiple-faces":
        lastResult =
          reference === undefined
            ? emptyResult("multiple-faces")
            : enterGrace("multiple-faces");
        break;
      case "position":
        lastResult =
          reference === undefined
            ? emptyResult("position")
            : enterGrace("position");
        break;
      case "inoffensive":
        lastResult = emptyResult("position");
        break;
      case "seed":
        lastResult = seed(input, false);
        break;
      case "match":
        lastResult = onMatch(input);
        break;
      case "nonmatch":
        lastResult = enterGrace("nonmatch");
        break;
    }
    return lastResult;
  }

  function reset(): void {
    state = "empty";
    consecutiveMatches = 0;
    reference = undefined;
    lastGoodTs = undefined;
    lastTimestamp = undefined;
    graceFrom = undefined;
    lastResult = {
      state: "empty",
      reason: "none",
      consecutiveMatches: 0,
      reset: false,
    };
  }

  return { update, reset };
}
