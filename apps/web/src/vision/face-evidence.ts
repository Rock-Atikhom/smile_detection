export type FaceGuidance =
  | "no-face"
  | "multiple-faces"
  | "too-close"
  | "too-far"
  | "off-center"
  | "face-ready";

export interface ClassifiedFaceEvidence {
  eligible: boolean;
  faceCount: 0 | 1 | 2;
  guidance: FaceGuidance;
}

export interface NormalizedFaceObservation {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  anchors: [number, number, number, number, number, number, number, number];
}

export interface FaceAnalysis {
  observation: NormalizedFaceObservation | undefined;
  initialEligible: boolean;
  tolerantEligible: boolean;
  faceCount: 0 | 1 | 2;
  guidance: FaceGuidance;
}

const ANCHOR_INDICES = [10, 152, 263, 33] as const;
const MIN_WIDTH = 0.18;
const MIN_HEIGHT = 0.3;
const MAX_HEIGHT = 0.8;
const CENTER_PAD = 0.03;

interface NormalizedBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function normalizedBounds(
  points: readonly { x: number; y: number }[],
): NormalizedBounds | undefined {
  if (points.length === 0) return undefined;

  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
      return undefined;
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }

  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return undefined;

  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function sizingOk(bounds: NormalizedBounds): boolean {
  return (
    bounds.width >= MIN_WIDTH &&
    bounds.height >= MIN_HEIGHT &&
    bounds.height <= MAX_HEIGHT
  );
}

function frameOk(bounds: NormalizedBounds): boolean {
  return (
    bounds.left >= 0 &&
    bounds.right <= 1 &&
    bounds.top >= 0 &&
    bounds.bottom <= 1
  );
}

function guidanceOf(bounds: NormalizedBounds): FaceGuidance {
  if (bounds.height > MAX_HEIGHT) return "too-close";
  if (bounds.width < MIN_WIDTH || bounds.height < MIN_HEIGHT) return "too-far";
  if (
    frameOk(bounds) &&
    bounds.centerX >= 0.23 &&
    bounds.centerX <= 0.77 &&
    bounds.centerY >= 0.16 &&
    bounds.centerY <= 0.78
  )
    return "face-ready";
  return "off-center";
}

function buildObservation(
  points: readonly { x: number; y: number }[],
  bounds: NormalizedBounds,
): NormalizedFaceObservation | undefined {
  const anchors: NormalizedFaceObservation["anchors"] = [
    0, 0, 0, 0, 0, 0, 0, 0,
  ];
  for (let i = 0; i < ANCHOR_INDICES.length; i++) {
    const point = points[ANCHOR_INDICES[i]];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
      return undefined;
    anchors[2 * i] = (point.x - bounds.centerX) / bounds.height;
    anchors[2 * i + 1] = (point.y - bounds.centerY) / bounds.height;
  }
  return {
    centerX: bounds.centerX,
    centerY: bounds.centerY,
    width: bounds.width,
    height: bounds.height,
    anchors,
  };
}

export function classifyFaceLandmarks(
  faces: readonly (readonly { x: number; y: number }[])[],
): ClassifiedFaceEvidence {
  const count = Math.min(faces.length, 2) as 0 | 1 | 2;
  if (count === 0)
    return { eligible: false, faceCount: 0, guidance: "no-face" };
  if (count === 2)
    return { eligible: false, faceCount: 2, guidance: "multiple-faces" };

  const bounds = normalizedBounds(faces[0] ?? []);
  if (!bounds) return { eligible: false, faceCount: 0, guidance: "no-face" };

  const guidance = guidanceOf(bounds);
  return {
    eligible: guidance === "face-ready",
    faceCount: 1,
    guidance,
  };
}

export function analyzeFaceLandmarks(
  faces: readonly (readonly { x: number; y: number }[])[],
): FaceAnalysis {
  const count = Math.min(faces.length, 2) as 0 | 1 | 2;
  if (count === 0)
    return {
      observation: undefined,
      initialEligible: false,
      tolerantEligible: false,
      faceCount: 0,
      guidance: "no-face",
    };
  if (count === 2)
    return {
      observation: undefined,
      initialEligible: false,
      tolerantEligible: false,
      faceCount: 2,
      guidance: "multiple-faces",
    };

  const bounds = normalizedBounds(faces[0] ?? []);
  if (!bounds)
    return {
      observation: undefined,
      initialEligible: false,
      tolerantEligible: false,
      faceCount: 0,
      guidance: "no-face",
    };

  const centered =
    bounds.centerX >= 0.23 &&
    bounds.centerX <= 0.77 &&
    bounds.centerY >= 0.16 &&
    bounds.centerY <= 0.78;
  const tolerant =
    bounds.centerX >= 0.23 - CENTER_PAD &&
    bounds.centerX <= 0.77 + CENTER_PAD &&
    bounds.centerY >= 0.16 - CENTER_PAD &&
    bounds.centerY <= 0.78 + CENTER_PAD;

  return {
    observation: buildObservation(faces[0] ?? [], bounds),
    initialEligible: sizingOk(bounds) && frameOk(bounds) && centered,
    tolerantEligible: sizingOk(bounds) && frameOk(bounds) && tolerant,
    faceCount: 1,
    guidance: guidanceOf(bounds),
  };
}
