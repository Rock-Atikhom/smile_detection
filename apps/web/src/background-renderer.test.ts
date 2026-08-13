import { describe, expect, it } from "vitest";
import { compositePixels } from "./background-renderer";

describe("background renderer", () => {
  it("keeps the person pixels and replaces the background pixels", () => {
    const result = compositePixels({
      background: [255, 0, 0],
      height: 1,
      mask: new Float32Array([1, 0]),
      maskHeight: 1,
      maskWidth: 2,
      source: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]),
      threshold: 0.5,
      width: 2,
    });

    expect(Array.from(result)).toEqual([10, 20, 30, 255, 255, 0, 0, 255]);
  });
});
