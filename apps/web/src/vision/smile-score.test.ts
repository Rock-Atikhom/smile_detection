import { describe, expect, it } from "vitest";
import referenceTraces from "./fixtures/smile-reference.json";
import {
  DEFAULT_SMILE_PROFILE,
  calculateRawSmileScore,
  createSmileFilterState,
  updateSmileFilter,
  validateSmileProfile,
} from "./smile-score";

const categories = (left: number, right: number) => [
  { categoryName: "mouthSmileLeft", score: left },
  { categoryName: "mouthSmileRight", score: right },
];

describe("calculateRawSmileScore", () => {
  it("calculates the literal bilateral smile formula", () => {
    expect(calculateRawSmileScore(categories(0.8, 0.8))).toBeCloseTo(0.8, 12);
    expect(calculateRawSmileScore(categories(0.8, 0.4))).toBeCloseTo(0.48, 12);
  });

  it("returns zero for missing, invalid, or ambiguous smile evidence", () => {
    expect(calculateRawSmileScore([])).toBe(0);
    expect(
      calculateRawSmileScore([
        { categoryName: "mouthSmileLeft", score: Number.NaN },
      ]),
    ).toBe(0);
    expect(calculateRawSmileScore(categories(1.01, 0.8))).toBe(0);
    expect(
      calculateRawSmileScore([
        ...categories(0.8, 0.8),
        ...categories(0.7, 0.7),
      ]),
    ).toBe(0);
  });
});

describe("validateSmileProfile", () => {
  it("accepts inclusive calibrated range endpoints in a frozen copy", () => {
    const minimum = validateSmileProfile({
      alpha: 0.15,
      highThreshold: 0.45,
      lowThreshold: 0.35,
      graceMs: 1,
      verificationMs: 1,
    });
    const maximumSource = {
      alpha: 0.6,
      highThreshold: 0.8,
      lowThreshold: 0.7,
      graceMs: 300,
      verificationMs: 5_000,
    };
    const maximum = validateSmileProfile(maximumSource);

    expect(minimum).toEqual({
      alpha: 0.15,
      highThreshold: 0.45,
      lowThreshold: 0.35,
      graceMs: 1,
      verificationMs: 1,
    });
    expect(maximum).toEqual(maximumSource);
    expect(maximum).not.toBe(maximumSource);
    expect(Object.isFrozen(maximum)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SMILE_PROFILE)).toBe(true);
  });

  it.each([
    ["alpha below range", { alpha: 0.149 }],
    ["alpha above range", { alpha: 0.601 }],
    ["high threshold below range", { highThreshold: 0.449 }],
    ["high threshold above range", { highThreshold: 0.801 }],
    ["low threshold below range", { lowThreshold: 0.349 }],
    ["low threshold above range", { lowThreshold: 0.701 }],
    ["equal thresholds", { highThreshold: 0.6, lowThreshold: 0.6 }],
    ["a 0.049 hysteresis gap", { highThreshold: 0.6, lowThreshold: 0.551 }],
    ["a non-finite alpha", { alpha: Number.POSITIVE_INFINITY }],
    ["a non-finite high threshold", { highThreshold: Number.NaN }],
    ["a non-finite low threshold", { lowThreshold: Number.NaN }],
    ["a non-finite grace window", { graceMs: Number.POSITIVE_INFINITY }],
    ["a non-finite verification duration", { verificationMs: Number.NaN }],
    ["a zero grace window", { graceMs: 0 }],
    ["a zero verification duration", { verificationMs: 0 }],
  ] as const)("rejects %s", (_description, invalidValues) => {
    expect(() =>
      validateSmileProfile({ ...DEFAULT_SMILE_PROFILE, ...invalidValues }),
    ).toThrow(RangeError);
  });
});

describe("updateSmileFilter", () => {
  it("smooths valid scores and applies hysteresis", () => {
    let state = createSmileFilterState();
    state = updateSmileFilter(state, 1);
    expect(state).toEqual({ smoothedScore: 0.35, smileValid: false });
    state = updateSmileFilter(state, 1);
    state = updateSmileFilter(state, 1);
    expect(state.smileValid).toBe(true);
    state = updateSmileFilter(state, 0);
    expect(state.smileValid).toBe(true);
    while (state.smoothedScore >= 0.45) state = updateSmileFilter(state, 0);
    expect(state.smileValid).toBe(false);
  });

  it("treats invalid raw scores as neutral", () => {
    expect(updateSmileFilter(createSmileFilterState(), Number.NaN)).toEqual({
      smoothedScore: 0,
      smileValid: false,
    });
    expect(updateSmileFilter(createSmileFilterState(), 1.01)).toEqual({
      smoothedScore: 0,
      smileValid: false,
    });
  });

  it.each(referenceTraces)("matches the $name reference trace", (trace) => {
    let state = createSmileFilterState();

    for (const sample of trace.samples) {
      const rawScore = calculateRawSmileScore(
        categories(sample.left, sample.right),
      );
      expect(rawScore).toBeCloseTo(sample.rawScore, 12);
      state = updateSmileFilter(state, rawScore);
      expect(state.smoothedScore).toBeCloseTo(sample.smoothedScore, 12);
      expect(state.smileValid).toBe(sample.smileValid);
    }
  });
});
