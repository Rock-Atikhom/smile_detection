/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assets,
  noticeAsset,
  releaseDirectoryName,
  remoteAssets,
} from "../../scripts/vision-release.config.mjs";

type ManifestAsset = {
  bytes: number;
  licenseRef: string;
  path: string;
  requiredForOffline: boolean;
  sha256: string;
  source: string;
};

type VisionReleaseManifest = {
  assets: ManifestAsset[];
  modelVersion: string;
  releaseId: string;
  runtimeVersion: string;
  schemaVersion: number;
};

const visionDirectory = dirname(fileURLToPath(import.meta.url));
const releaseDirectory = join(
  visionDirectory,
  "../../public/vision",
  releaseDirectoryName,
);
const manifestPath = join(visionDirectory, "generated/release-manifest.json");

async function filesIn(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = `${prefix}${entry.name}`;
      return entry.isDirectory()
        ? filesIn(join(directory, entry.name), `${path}/`)
        : [path];
    }),
  );
  return paths.flat().sort();
}

describe("immutable vision release manifest", () => {
  it("describes the complete, canonical offline asset inventory", async () => {
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as VisionReleaseManifest;
    const configuredAssets = [...assets, ...remoteAssets, noticeAsset];

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.runtimeVersion).toBe("0.10.35");
    expect(manifest.modelVersion).toBe("float16/1");
    expect(manifest.releaseId).toMatch(/^[a-f0-9]{16}$/);
    expect(manifest.assets.map(({ path }) => path)).toEqual(
      [...manifest.assets.map(({ path }) => path)].sort(),
    );
    expect(new Set(manifest.assets.map(({ path }) => path)).size).toBe(
      manifest.assets.length,
    );

    expect(assets.map(({ destination }) => destination)).toEqual([
      "vision_wasm_internal.js",
      "vision_wasm_internal.wasm",
      "vision_wasm_module_internal.js",
      "vision_wasm_module_internal.wasm",
      "vision_wasm_nosimd_internal.js",
      "vision_wasm_nosimd_internal.wasm",
    ]);
    expect(remoteAssets.map(({ destination }) => destination)).toEqual([
      "face_landmarker.task",
      "LICENSE-MediaPipe.txt",
      "model-card-blazeface-short-range.pdf",
      "model-card-face-mesh-v2.pdf",
      "model-card-blendshape-v2.pdf",
    ]);
    expect(noticeAsset.destination).toBe("NOTICE.txt");

    for (const asset of manifest.assets) {
      expect(asset.path).toMatch(
        /^\/vision\/mediapipe-0\.10\.35-face-landmarker-float16-v1\//,
      );
      expect(asset.bytes).toBeGreaterThan(0);
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(new URL(asset.source).protocol).toBe("https:");
      expect(asset.licenseRef).toMatch(/^\/vision\//);
      expect(asset.requiredForOffline).toBe(true);
    }

    expect(manifest.assets.map(({ path }) => path)).toEqual(
      configuredAssets
        .map(
          ({ destination }) => `/vision/${releaseDirectoryName}/${destination}`,
        )
        .sort(),
    );
    expect(await filesIn(releaseDirectory)).toEqual(
      configuredAssets.map(({ destination }) => destination).sort(),
    );
  });
});
