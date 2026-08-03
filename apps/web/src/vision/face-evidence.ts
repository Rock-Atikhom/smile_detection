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
  if (bounds.height > 0.8)
    return { eligible: false, faceCount: 1, guidance: "too-close" };
  if (bounds.width < 0.18 || bounds.height < 0.3) {
    return { eligible: false, faceCount: 1, guidance: "too-far" };
  }

  const centered =
    bounds.left >= 0 &&
    bounds.right <= 1 &&
    bounds.top >= 0 &&
    bounds.bottom <= 1 &&
    bounds.centerX >= 0.23 &&
    bounds.centerX <= 0.77 &&
    bounds.centerY >= 0.16 &&
    bounds.centerY <= 0.78;

  return centered
    ? { eligible: true, faceCount: 1, guidance: "face-ready" }
    : { eligible: false, faceCount: 1, guidance: "off-center" };
}
