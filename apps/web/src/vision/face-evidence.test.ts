import { describe, expect, it } from "vitest";
import { classifyFaceLandmarks } from "./face-evidence";

const box = (left: number, top: number, right: number, bottom: number) => [
  { x: left, y: top },
  { x: right, y: top },
  { x: left, y: bottom },
  { x: right, y: bottom },
];

describe("classifyFaceLandmarks", () => {
  it("classifies literal face-guidance boundaries", () => {
    expect(classifyFaceLandmarks([box(0.41, 0.35, 0.59, 0.65)])).toEqual({
      eligible: true,
      faceCount: 1,
      guidance: "face-ready",
    });
    expect(classifyFaceLandmarks([]).guidance).toBe("no-face");
    expect(
      classifyFaceLandmarks([
        box(0.4, 0.3, 0.6, 0.7),
        box(0.2, 0.2, 0.4, 0.6),
      ]).guidance,
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
