import { describe, expect, it } from "vitest";
import { capturePhotoBurst } from "./photo-capture";

describe("photo capture", () => {
  it("captures exactly three candidates and preserves the original source", async () => {
    let frame = 0;
    const result = await capturePhotoBurst({
      capture: async () => {
        frame += 1;
        return {
          height: 720,
          width: 1280,
          originalUrl: `photo-${frame}`,
          treatments: {
            original: `photo-${frame}`,
            studio: `studio-${frame}`,
            sky: `sky-${frame}`,
          },
        };
      },
      delay: async () => undefined,
    });

    expect(result).toHaveLength(3);
    expect(result.map((item) => item.originalUrl)).toEqual([
      "photo-1",
      "photo-2",
      "photo-3",
    ]);
    expect(result[1].treatments.original).toBe(result[1].originalUrl);
  });

  it("applies the live face evidence snapshot to every captured frame", async () => {
    const result = await capturePhotoBurst({
      capture: async () => ({
        height: 720,
        width: 1280,
        originalUrl: "photo",
        treatments: {
          original: "photo",
          studio: "photo",
          sky: "photo",
        },
      }),
      delay: async () => undefined,
      quality: {
        continuity: false,
        oneFace: false,
        smileVerified: false,
      },
    });

    expect(result).toHaveLength(3);
    expect(result.every((photo) => photo.oneFace === false)).toBe(true);
    expect(result.every((photo) => photo.continuity === false)).toBe(true);
    expect(result.every((photo) => photo.smileVerified === false)).toBe(true);
  });
});
