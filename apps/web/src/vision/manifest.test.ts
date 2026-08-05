import { describe, expect, it } from "vitest";
import {
  getAssetByRole,
  parseVisionManifest,
  VISION_RELEASE_PATH_PREFIX,
  type VisionReleaseManifest,
} from "./manifest";

const releaseId = "0123456789abcdef";
const releasePath = VISION_RELEASE_PATH_PREFIX.slice(0, -1);

const validManifest: VisionReleaseManifest = {
  assets: [
    {
      bytes: 12,
      id: "license",
      licenseRef: `${releasePath}/LICENSE.txt`,
      path: `${releasePath}/LICENSE.txt`,
      requiredForOffline: true,
      role: "license",
      sha256: "a".repeat(64),
      source: "https://example.test/LICENSE.txt",
      version: "0.10.35",
    },
    {
      bytes: 34,
      id: "wasm-loader-simd",
      licenseRef: `${releasePath}/LICENSE.txt`,
      path: `${releasePath}/vision_wasm_internal.js`,
      requiredForOffline: true,
      role: "wasm-loader-simd",
      sha256: "b".repeat(64),
      source: "https://example.test/vision_wasm_internal.js",
      version: "0.10.35",
    },
  ],
  modelVersion: "float16/1",
  releaseId,
  runtimeVersion: "0.10.35",
  schemaVersion: 1,
};

describe("parseVisionManifest", () => {
  it("returns a complete valid manifest", () => {
    expect(parseVisionManifest(validManifest)).toEqual(validManifest);
  });

  it.each([
    ["an invalid release ID", { ...validManifest, releaseId: "../bad" }],
    [
      "an external asset path",
      {
        ...validManifest,
        assets: [{ ...validManifest.assets[0], path: "https://example.com/a" }],
      },
    ],
    [
      "a same-origin asset path outside the release directory",
      {
        ...validManifest,
        assets: [{ ...validManifest.assets[0], path: "/assets/unrelated.js" }],
      },
    ],
    [
      "duplicate asset IDs",
      {
        ...validManifest,
        assets: [
          validManifest.assets[0],
          { ...validManifest.assets[1], id: validManifest.assets[0].id },
        ],
      },
    ],
    [
      "duplicate asset paths",
      {
        ...validManifest,
        assets: [
          validManifest.assets[0],
          { ...validManifest.assets[1], path: validManifest.assets[0].path },
        ],
      },
    ],
    [
      "unsorted assets",
      { ...validManifest, assets: [...validManifest.assets].reverse() },
    ],
    [
      "a non-HTTPS source",
      {
        ...validManifest,
        assets: [
          { ...validManifest.assets[0], source: "http://example.test/a" },
        ],
      },
    ],
    [
      "a non-same-origin license path",
      {
        ...validManifest,
        assets: [
          {
            ...validManifest.assets[0],
            licenseRef: "https://example.test/LICENSE",
          },
        ],
      },
    ],
    [
      "a same-origin license path outside the release directory",
      {
        ...validManifest,
        assets: [
          { ...validManifest.assets[0], licenseRef: "/other/LICENSE.txt" },
        ],
      },
    ],
    [
      "an invalid hash",
      {
        ...validManifest,
        assets: [{ ...validManifest.assets[0], sha256: "not-a-hash" }],
      },
    ],
    ["unexpected manifest data", { ...validManifest, unsafe: "value" }],
    [
      "unexpected asset data",
      {
        ...validManifest,
        assets: [{ ...validManifest.assets[0], unsafe: "value" }],
      },
    ],
  ])("rejects %s", (_description, value) => {
    expect(() => parseVisionManifest(value)).toThrow("Invalid vision manifest");
  });

  it("finds an asset by its allowlisted role", () => {
    expect(getAssetByRole(validManifest, "wasm-loader-simd")).toEqual(
      validManifest.assets[1],
    );
    expect(getAssetByRole(validManifest, "notice")).toBeUndefined();
  });
});
