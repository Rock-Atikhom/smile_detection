import { describe, expect, it } from "vitest";
import { analyzeFaceLandmarks, classifyFaceLandmarks } from "./face-evidence";

const box = (left: number, top: number, right: number, bottom: number) => [
  { x: left, y: top },
  { x: right, y: top },
  { x: left, y: bottom },
  { x: right, y: bottom },
];

const FACE_LANDMARK_COUNT = 478;

function faceMesh(
  anchors: Record<number, { x: number; y: number }>,
  extremes?: { left: number; top: number; right: number; bottom: number },
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
    points.push({ x: 0.5, y: 0.5 });
  }
  for (const [index, point] of Object.entries(anchors)) {
    points[Number(index)] = point;
  }
  if (extremes) {
    points[1] = { x: extremes.left, y: extremes.top };
    points[2] = { x: extremes.right, y: extremes.top };
    points[3] = { x: extremes.left, y: extremes.bottom };
    points[4] = { x: extremes.right, y: extremes.bottom };
  }
  return points;
}

describe("classifyFaceLandmarks", () => {
  it("classifies literal face-guidance boundaries", () => {
    expect(classifyFaceLandmarks([box(0.41, 0.35, 0.59, 0.65)])).toEqual({
      eligible: true,
      faceCount: 1,
      guidance: "face-ready",
    });
    expect(classifyFaceLandmarks([]).guidance).toBe("no-face");
    expect(
      classifyFaceLandmarks([box(0.4, 0.3, 0.6, 0.7), box(0.2, 0.2, 0.4, 0.6)])
        .guidance,
    ).toBe("multiple-faces");
    expect(classifyFaceLandmarks([box(0.3, 0.05, 0.7, 0.86)]).guidance).toBe(
      "too-close",
    );
    expect(classifyFaceLandmarks([box(0.45, 0.4, 0.55, 0.6)]).guidance).toBe(
      "too-far",
    );
    expect(classifyFaceLandmarks([box(0.02, 0.3, 0.22, 0.7)]).guidance).toBe(
      "off-center",
    );
  });

  it("keeps exact sizing thresholds eligible", () => {
    expect(classifyFaceLandmarks([box(0.41, 0.35, 0.59, 0.65)])).toEqual({
      eligible: true,
      faceCount: 1,
      guidance: "face-ready",
    });
    expect(classifyFaceLandmarks([box(0.3, 0.35, 0.7, 0.65)])).toMatchObject({
      eligible: true,
      guidance: "face-ready",
    });
    expect(classifyFaceLandmarks([box(0.3, 0.1, 0.7, 0.9)])).toMatchObject({
      eligible: true,
      guidance: "face-ready",
    });
  });

  it.each([
    ["width below 0.18", box(0.41, 0.35, 0.589, 0.65), "too-far"],
    ["height below 0.30", box(0.41, 0.35, 0.59, 0.649), "too-far"],
    ["height above 0.80", box(0.3, 0.05, 0.7, 0.851), "too-close"],
  ] as const)("rejects %s", (_description, landmarks, guidance) => {
    expect(classifyFaceLandmarks([landmarks]).guidance).toBe(guidance);
  });

  it.each([
    ["NaN", [{ x: Number.NaN, y: 0.4 }]],
    ["Infinity", [{ x: Number.POSITIVE_INFINITY, y: 0.4 }]],
    ["empty landmarks", []],
  ] as const)("treats %s landmarks as no face", (_description, landmarks) => {
    expect(classifyFaceLandmarks([landmarks])).toEqual({
      eligible: false,
      faceCount: 0,
      guidance: "no-face",
    });
  });

  it("rejects out-of-frame bounds as off-center", () => {
    expect(classifyFaceLandmarks([box(-0.01, 0.3, 0.3, 0.7)])).toEqual({
      eligible: false,
      faceCount: 1,
      guidance: "off-center",
    });
  });

  it("caps three or more faces as multiple faces", () => {
    expect(
      classifyFaceLandmarks([
        box(0.4, 0.3, 0.6, 0.7),
        box(0.2, 0.2, 0.4, 0.6),
        box(0.6, 0.2, 0.8, 0.6),
      ]),
    ).toEqual({ eligible: false, faceCount: 2, guidance: "multiple-faces" });
  });
});

describe("analyzeFaceLandmarks", () => {
  const anchors: Record<number, { x: number; y: number }> = {
    10: { x: 0.5, y: 0.25 },
    152: { x: 0.5, y: 0.4 },
    263: { x: 0.4, y: 0.5 },
    33: { x: 0.6, y: 0.5 },
  };
  const mesh = faceMesh(anchors, {
    left: 0.35,
    top: 0.25,
    right: 0.65,
    bottom: 0.75,
  });

  it("produces a normalized observation around center by height", () => {
    const analysis = analyzeFaceLandmarks([mesh]);
    expect(analysis.observation?.centerX).toBeCloseTo(0.5);
    expect(analysis.observation?.centerY).toBeCloseTo(0.5);
    expect(analysis.observation?.width).toBeCloseTo(0.3);
    expect(analysis.observation?.height).toBeCloseTo(0.5);
    expect(analysis.observation?.anchors).toHaveLength(8);
    const expectedAnchors = [0, -0.5, 0, -0.2, -0.2, 0, 0.2, 0];
    analysis.observation?.anchors.forEach((value, index) => {
      expect(value).toBeCloseTo(expectedAnchors[index] ?? 0);
    });
  });

  it("keeps classifyFaceLandmarks public output unchanged", () => {
    expect(classifyFaceLandmarks([mesh])).toEqual({
      eligible: true,
      faceCount: 1,
      guidance: "face-ready",
    });
  });

  it("returns no observation for empty, short, non-finite, or zero-height landmarks", () => {
    expect(analyzeFaceLandmarks([]).observation).toBeUndefined();

    const short = faceMesh(anchors, {
      left: 0.35,
      top: 0.25,
      right: 0.65,
      bottom: 0.75,
    }).slice(0, 100);
    expect(analyzeFaceLandmarks([short]).observation).toBeUndefined();

    const nonFinite = faceMesh(anchors, {
      left: 0.35,
      top: 0.25,
      right: 0.65,
      bottom: 0.75,
    });
    nonFinite[10] = { x: Number.NaN, y: 0.5 };
    expect(analyzeFaceLandmarks([nonFinite]).observation).toBeUndefined();

    const zeroHeight = faceMesh(anchors, {
      left: 0.35,
      top: 0.25,
      right: 0.65,
      bottom: 0.75,
    });
    for (const point of zeroHeight) point.y = 0.5;
    expect(analyzeFaceLandmarks([zeroHeight]).observation).toBeUndefined();
  });
});
