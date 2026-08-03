export interface SmileProfile {
  alpha: number;
  highThreshold: number;
  lowThreshold: number;
  graceMs: number;
  verificationMs: number;
}

export interface SmileFilterState {
  smoothedScore: number;
  smileValid: boolean;
}

export const DEFAULT_SMILE_PROFILE: Readonly<SmileProfile> = Object.freeze({
  alpha: 0.35,
  highThreshold: 0.6,
  lowThreshold: 0.45,
  graceMs: 300,
  verificationMs: 5_000,
});

interface CategoryScore {
  categoryName: string;
  score: number;
}

export function validateSmileProfile(
  profile: Readonly<SmileProfile>,
): Readonly<SmileProfile> {
  const { alpha, highThreshold, lowThreshold, graceMs, verificationMs } =
    profile;
  const isFiniteNumber = (value: number) => Number.isFinite(value);

  if (
    !isFiniteNumber(alpha) ||
    !isFiniteNumber(highThreshold) ||
    !isFiniteNumber(lowThreshold) ||
    !isFiniteNumber(graceMs) ||
    !isFiniteNumber(verificationMs) ||
    alpha < 0.15 ||
    alpha > 0.6 ||
    highThreshold < 0.45 ||
    highThreshold > 0.8 ||
    lowThreshold < 0.35 ||
    lowThreshold > 0.7 ||
    lowThreshold >= highThreshold ||
    highThreshold - lowThreshold < 0.05 ||
    graceMs <= 0 ||
    verificationMs <= 0
  ) {
    throw new RangeError("Invalid smile profile");
  }

  return Object.freeze({
    alpha,
    highThreshold,
    lowThreshold,
    graceMs,
    verificationMs,
  });
}

function uniqueScore(
  categories: readonly CategoryScore[],
  categoryName: string,
): number | undefined {
  const matches = categories.filter(
    (category) => category.categoryName === categoryName,
  );
  if (matches.length !== 1) return undefined;

  const score = matches[0]?.score;
  return Number.isFinite(score) && score >= 0 && score <= 1 ? score : undefined;
}

export function calculateRawSmileScore(
  categories: readonly CategoryScore[],
): number {
  const left = uniqueScore(categories, "mouthSmileLeft");
  const right = uniqueScore(categories, "mouthSmileRight");
  if (left === undefined || right === undefined) return 0;

  const mean = (left + right) / 2;
  return Math.min(1, Math.max(0, 0.4 * Math.min(left, right) + 0.6 * mean));
}

export function createSmileFilterState(): SmileFilterState {
  return { smoothedScore: 0, smileValid: false };
}

export function updateSmileFilter(
  previous: SmileFilterState,
  rawScore: number,
  profile: Readonly<SmileProfile> = DEFAULT_SMILE_PROFILE,
): SmileFilterState {
  const score =
    Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 1 ? rawScore : 0;
  const smoothedScore =
    profile.alpha * score + (1 - profile.alpha) * previous.smoothedScore;
  const smileValid = previous.smileValid
    ? smoothedScore >= profile.lowThreshold
    : smoothedScore >= profile.highThreshold;

  return { smoothedScore, smileValid };
}
