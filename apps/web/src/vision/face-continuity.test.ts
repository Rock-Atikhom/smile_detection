import { describe, expect, it } from "vitest";
import { createFaceContinuityTracker } from "./face-continuity";
import type { FaceGuidance, NormalizedFaceObservation } from "./face-evidence";

const ZERO_ANCHORS = [0, 0, 0, 0, 0, 0, 0, 0];
const HAPPY_ANCHORS = [0, -0.2, 0, -0.2, -0.2, 0.1, 0.2, 0.1];
const REPLACEMENT_ANCHORS = [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25];

function obs(
  centerX: number,
  centerY = 0.5,
  width = 0.3,
  height = 0.5,
  anchors: number[] = ZERO_ANCHORS,
): NormalizedFaceObservation {
  return {
    centerX,
    centerY,
    width,
    height,
    anchors: anchors as NormalizedFaceObservation["anchors"],
  };
}

function at(
  timestamp: number,
  observation: NormalizedFaceObservation | undefined,
  overrides: {
    initialEligible?: boolean;
    tolerantEligible?: boolean;
    faceCount?: 0 | 1 | 2;
    guidance?: FaceGuidance;
  } = {},
) {
  return {
    timestamp,
    observation,
    initialEligible: overrides.initialEligible ?? true,
    tolerantEligible: overrides.tolerantEligible ?? true,
    faceCount: overrides.faceCount ?? 1,
    guidance: overrides.guidance ?? "face-ready",
  };
}

describe("createFaceContinuityTracker", () => {
  it("tracks anonymous continuity through matches, grace, and expiry", () => {
    const tracker = createFaceContinuityTracker();
    const faceA = obs(0.5, 0.5, 0.3, 0.5, HAPPY_ANCHORS);
    const movedA = obs(0.56, 0.5, 0.3, 0.5, HAPPY_ANCHORS);
    const movedAgainA = obs(0.62, 0.5, 0.3, 0.5, HAPPY_ANCHORS);
    const replacementB = obs(0.5, 0.5, 0.3, 0.5, REPLACEMENT_ANCHORS);

    expect(tracker.update(at(0, faceA))).toMatchObject({
      state: "candidate",
      consecutiveMatches: 1,
    });
    expect(tracker.update(at(75, movedA))).toMatchObject({
      state: "candidate",
      consecutiveMatches: 2,
    });
    expect(tracker.update(at(150, movedAgainA))).toMatchObject({
      state: "ready",
      consecutiveMatches: 3,
    });
    expect(tracker.update(at(250, undefined, { faceCount: 0 }))).toMatchObject({
      state: "grace",
      reason: "no-face",
    });
    expect(tracker.update(at(300, movedA))).toMatchObject({ state: "ready" });
    expect(tracker.update(at(350, replacementB))).toMatchObject({
      state: "grace",
      reason: "nonmatch",
    });
    expect(tracker.update(at(651, replacementB))).toMatchObject({
      state: "candidate",
      consecutiveMatches: 1,
      reset: true,
    });
  });

  it("rejects a center distance at the boundary", () => {
    const tracker = createFaceContinuityTracker();
    tracker.update(at(0, obs(0.5, 0.5)));
    tracker.update(at(75, obs(0.5, 0.5)));
    tracker.update(at(150, obs(0.5, 0.5)));
    const result = tracker.update(at(200, obs(0.65, 0.5)));
    expect(result.state).toBe("grace");
    expect(result.reason).toBe("nonmatch");
  });

  it("accepts a center distance within tolerance", () => {
    const tracker = createFaceContinuityTracker();
    tracker.update(at(0, obs(0.5, 0.5)));
    tracker.update(at(75, obs(0.5, 0.5)));
    tracker.update(at(150, obs(0.54, 0.5)));
    expect(tracker.update(at(200, obs(0.58, 0.5)))).toMatchObject({
      state: "ready",
      reason: "none",
    });
  });

  it.each([0.67, 1.5])("rejects a height scale ratio of %s", (scale) => {
    const tracker = createFaceContinuityTracker();
    tracker.update(at(0, obs(0.5, 0.5)));
    tracker.update(at(75, obs(0.5, 0.5)));
    tracker.update(at(150, obs(0.5, 0.5)));
    const result = tracker.update(at(200, obs(0.5, 0.5, 0.3, 0.5 * scale)));
    expect(result.state).toBe("grace");
    expect(result.reason).toBe("nonmatch");
  });

  it("accepts height scales within range", () => {
    const tracker = createFaceContinuityTracker();
    tracker.update(at(0, obs(0.5, 0.5)));
    tracker.update(at(75, obs(0.5, 0.5, 0.3, 0.5 * 0.9)));
    tracker.update(at(150, obs(0.5, 0.5, 0.3, 0.5 * 0.9)));
    expect(
      tracker.update(at(200, obs(0.5, 0.5, 0.3, 0.5 * 0.9))),
    ).toMatchObject({ state: "ready", reason: "none" });
  });

  it("rejects an anchor delta at the boundary", () => {
    const tracker = createFaceContinuityTracker();
    tracker.update(at(0, obs(0.5, 0.5)));
    tracker.update(at(75, obs(0.5, 0.5)));
    tracker.update(at(150, obs(0.5, 0.5)));
    const shifted = ZERO_ANCHORS.slice();
    shifted[0] = 0.12;
    const result = tracker.update(at(200, obs(0.5, 0.5, 0.3, 0.5, shifted)));
    expect(result.state).toBe("grace");
    expect(result.reason).toBe("nonmatch");
  });

  it("accepts an anchor delta within tolerance", () => {
    const tracker = createFaceContinuityTracker();
    tracker.update(at(0, obs(0.5, 0.5)));
    tracker.update(at(75, obs(0.5, 0.5)));
    tracker.update(at(150, obs(0.5, 0.5)));
    const shifted = ZERO_ANCHORS.slice();
    shifted[0] = 0.11;
    expect(
      tracker.update(at(200, obs(0.5, 0.5, 0.3, 0.5, shifted))),
    ).toMatchObject({ state: "ready", reason: "none" });
  });

  it("adapts the reference toward matched observations by a fraction", () => {
    const tracker = createFaceContinuityTracker();
    tracker.update(at(0, obs(0.5, 0.5)));
    tracker.update(at(75, obs(0.6, 0.5)));
    // 0.66 is 0.16 from the origin (would fail without adaptation) but
    // within tolerance of the adapted reference (~0.525).
    const result = tracker.update(at(150, obs(0.66, 0.5)));
    expect(result.reason).toBe("none");
    expect(result.state).toBe("ready");
  });

  it("holds an established face through the tolerant center zone", () => {
    const tracker = createFaceContinuityTracker();
    const stable = obs(0.5, 0.5);
    tracker.update(at(0, stable));
    tracker.update(at(75, stable));
    tracker.update(at(150, stable));
    const drifted = obs(0.6, 0.5);
    const result = tracker.update(
      at(200, drifted, { initialEligible: false, tolerantEligible: true }),
    );
    expect(result.state).toBe("ready");
    expect(result.reason).toBe("none");
  });

  it("reports position for an off-zone observation", () => {
    const tracker = createFaceContinuityTracker();
    const stable = obs(0.5, 0.5);
    tracker.update(at(0, stable));
    tracker.update(at(75, stable));
    tracker.update(at(150, stable));
    const result = tracker.update(
      at(200, obs(0.9, 0.5), {
        initialEligible: false,
        tolerantEligible: false,
        guidance: "off-center",
      }),
    );
    expect(result.state).toBe("grace");
    expect(result.reason).toBe("position");
  });

  it("reports multiple faces during grace", () => {
    const tracker = createFaceContinuityTracker();
    const stable = obs(0.5, 0.5);
    tracker.update(at(0, stable));
    tracker.update(at(75, stable));
    tracker.update(at(150, stable));
    const result = tracker.update(at(200, undefined, { faceCount: 2 }));
    expect(result.state).toBe("grace");
    expect(result.reason).toBe("multiple-faces");
  });

  it("recovers at exactly the grace window", () => {
    const tracker = createFaceContinuityTracker();
    const stable = obs(0.5, 0.5);
    tracker.update(at(0, stable));
    tracker.update(at(75, stable));
    tracker.update(at(150, stable));
    tracker.update(at(250, undefined, { faceCount: 0 }));
    const result = tracker.update(at(450, stable));
    expect(result.state).toBe("ready");
  });

  it("expires above the grace window and reseeds a candidate", () => {
    const tracker = createFaceContinuityTracker();
    const stable = obs(0.5, 0.5);
    tracker.update(at(0, stable));
    tracker.update(at(75, stable));
    tracker.update(at(150, stable));
    tracker.update(at(250, undefined, { faceCount: 0 }));
    const incoming = obs(0.5, 0.5);
    const result = tracker.update(at(451, incoming));
    expect(result).toMatchObject({
      state: "candidate",
      consecutiveMatches: 1,
      reset: true,
    });
  });

  it("ignores decreasing timestamps", () => {
    const tracker = createFaceContinuityTracker();
    const stable = obs(0.5, 0.5);
    tracker.update(at(100, stable));
    const before = tracker.update(at(150, stable));
    const after = tracker.update(at(120, stable));
    expect(after).toEqual(before);
  });

  it("resets to an empty tracker", () => {
    const tracker = createFaceContinuityTracker();
    const stable = obs(0.5, 0.5);
    tracker.update(at(0, stable));
    tracker.update(at(75, stable));
    tracker.update(at(150, stable));
    tracker.reset();
    expect(tracker.update(at(200, undefined, { faceCount: 0 }))).toMatchObject({
      state: "empty",
      consecutiveMatches: 0,
    });
  });
});
