import { describe, expect, it } from "vitest";
import {
  advanceSmileVerification,
  createSmileVerificationState,
  type SmileVerificationSample,
} from "./smile-verification";
import { calculateRawSmileScore } from "./smile-score";

function sample(
  partial: Partial<SmileVerificationSample>,
): SmileVerificationSample {
  return {
    capturedAtMs: 0,
    rawScore: 1,
    continuity: "ready",
    faceEligible: true,
    ...partial,
  };
}

function advanceValidSequence(
  state: ReturnType<typeof createSmileVerificationState>,
  startMs: number,
  count: number,
  stepMs = 100,
) {
  let next = state;
  for (let i = 0; i < count; i += 1) {
    next = advanceSmileVerification(
      next,
      sample({ capturedAtMs: startMs + i * stepMs, rawScore: 1 }),
    );
  }
  return next;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("advanceSmileVerification", () => {
  it("keeps neutral traces in waiting", () => {
    let state = createSmileVerificationState();
    for (let ms = 1_000; ms <= 2_000; ms += 100) {
      state = advanceSmileVerification(
        state,
        sample({ capturedAtMs: ms, rawScore: 0 }),
      );
    }
    expect(state.phase).toBe("waiting");
    expect(state.progressMs).toBe(0);
  });

  it("keeps speech traces in waiting", () => {
    let state = createSmileVerificationState();
    for (let ms = 1_000; ms <= 2_000; ms += 100) {
      state = advanceSmileVerification(
        state,
        sample({ capturedAtMs: ms, rawScore: 0.2 }),
      );
    }
    expect(state.phase).toBe("waiting");
    expect(state.progressMs).toBe(0);
  });

  it("enters verifying only after continuity ready and score reaches 0.60", () => {
    let state = createSmileVerificationState();
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_000, rawScore: 1, continuity: "ready" }),
    );
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_100, rawScore: 1, continuity: "ready" }),
    );
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_200, rawScore: 1, continuity: "ready" }),
    );
    expect(state.phase).toBe("verifying");
    expect(state.progressMs).toBe(0);
  });

  it("does not enter verifying while continuity is only a candidate", () => {
    let state = createSmileVerificationState();
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_000, rawScore: 1, continuity: "candidate" }),
    );
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_100, rawScore: 1, continuity: "candidate" }),
    );
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_200, rawScore: 1, continuity: "candidate" }),
    );
    expect(state.phase).toBe("waiting");
    expect(state.progressMs).toBe(0);
  });

  it("holds progress across a short invalid interval and adds no time on recovery", () => {
    let state = advanceValidSequence(createSmileVerificationState(), 1_000, 3);
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_300, rawScore: 1 }),
    );
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_400, rawScore: 1 }),
    );
    expect(state.progressMs).toBe(200);

    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_500, faceEligible: false }),
    );
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_700, faceEligible: false }),
    );
    expect(state.phase).toBe("paused");
    expect(state.progressMs).toBe(200);

    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_800, rawScore: 1 }),
    );
    expect(state.phase).toBe("verifying");
    expect(state.progressMs).toBe(200);

    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_900, rawScore: 1 }),
    );
    expect(state.progressMs).toBe(300);
  });

  it("resets an invalid interval strictly greater than 300ms", () => {
    let state = advanceValidSequence(createSmileVerificationState(), 1_000, 3);
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_300, rawScore: 1 }),
    );
    expect(state.progressMs).toBe(100);

    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_400, faceEligible: false }),
    );
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_900, faceEligible: false }),
    );
    expect(state.phase).toBe("waiting");
    expect(state.progressMs).toBe(0);
  });

  it("holds at exactly 300ms but resets just past it", () => {
    let state = advanceValidSequence(createSmileVerificationState(), 1_000, 3);
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_300, rawScore: 1 }),
    );
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_400, faceEligible: false }),
    );
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_700, faceEligible: false }),
    );
    expect(state.phase).toBe("paused");
    expect(state.progressMs).toBe(100);

    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 1_701, faceEligible: false }),
    );
    expect(state.phase).toBe("waiting");
    expect(state.progressMs).toBe(0);
  });

  it("completes after exactly 5,000ms of accumulated valid intervals", () => {
    const state = advanceValidSequence(
      createSmileVerificationState(),
      1_000,
      53,
    );
    expect(state.phase).toBe("complete");
    expect(state.progressMs).toBe(5_000);
  });

  it("ignores non-finite and non-increasing timestamps", () => {
    let state = advanceValidSequence(createSmileVerificationState(), 1_000, 3);

    const beforeDecreasing = state;
    state = advanceSmileVerification(state, sample({ capturedAtMs: 900 }));
    expect(state).toBe(beforeDecreasing);

    const beforeNan = state;
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: Number.NaN }),
    );
    expect(state).toBe(beforeNan);
  });

  it("keeps raw and smoothed scores within 0..1 across the full grid", () => {
    const grid = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    let state = createSmileVerificationState();
    let ts = 1_000;
    for (const left of grid) {
      for (const right of grid) {
        const rawScore = calculateRawSmileScore([
          { categoryName: "mouthSmileLeft", score: left },
          { categoryName: "mouthSmileRight", score: right },
        ]);
        expect(rawScore).toBeGreaterThanOrEqual(0);
        expect(rawScore).toBeLessThanOrEqual(1);

        state = advanceSmileVerification(
          state,
          sample({ capturedAtMs: ts, rawScore, continuity: "ready" }),
        );
        expect(state.filter.smoothedScore).toBeGreaterThanOrEqual(0);
        expect(state.filter.smoothedScore).toBeLessThanOrEqual(1);
        ts += 16;
      }
    }
  });

  it("keeps progress monotonic and bounded on seeded sequences", () => {
    const rng = mulberry32(2026);
    let state = createSmileVerificationState();
    let ts = 1_000;
    for (let i = 0; i < 500; i += 1) {
      ts += 1 + Math.floor(rng() * 150);
      const faceEligible = rng() < 0.8;
      const roll = rng();
      const continuity =
        roll < 0.5
          ? "ready"
          : roll < 0.7
            ? "grace"
            : roll < 0.85
              ? "candidate"
              : "empty";
      const rawScore = rng();

      const before = state.progressMs;
      state = advanceSmileVerification(
        state,
        sample({ capturedAtMs: ts, rawScore, continuity, faceEligible }),
      );
      const after = state.progressMs;

      expect(after).toBeGreaterThanOrEqual(0);
      expect(after).toBeLessThanOrEqual(5_000);
      if (after < before) expect(after).toBe(0);
      if (!faceEligible) expect(after).toBeLessThanOrEqual(before);
    }
  });

  it("returns the exact initial state after a continuity reset", () => {
    let state = createSmileVerificationState();
    state = advanceSmileVerification(
      state,
      sample({ capturedAtMs: 0, rawScore: 1, continuity: "ready" }),
    );
    state = advanceSmileVerification(
      state,
      sample({
        capturedAtMs: 100,
        rawScore: 1,
        continuity: "candidate",
        continuityReset: true,
      }),
    );
    expect(state).toEqual(createSmileVerificationState());
  });
});
