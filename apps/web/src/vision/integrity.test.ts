import { describe, expect, it } from "vitest";
import {
  verifyVisionResponse,
  VisionAssetError,
  type VisionAsset,
} from "./integrity";

const bytes = new TextEncoder().encode("verified vision asset");
const asset: VisionAsset = {
  bytes: bytes.byteLength,
  id: "wasm-loader-simd",
  licenseRef: "/vision/test/LICENSE.txt",
  path: "/vision/test/vision_wasm_internal.js",
  requiredForOffline: true,
  role: "wasm-loader-simd",
  sha256: "",
  source: "https://example.test/vision_wasm_internal.js",
  version: "0.10.35",
};

async function sha256(bytesToHash: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytesToHash),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

describe("verifyVisionResponse", () => {
  it("returns fresh verified bytes", async () => {
    const expectedAsset = { ...asset, sha256: await sha256(bytes) };
    const goodResponse = new Response(bytes);

    const verified = await verifyVisionResponse(goodResponse, expectedAsset);

    expect(Array.from(verified)).toEqual(Array.from(bytes));
    expect(verified).not.toBe(bytes);
  });

  it("reports only a safe integrity error for a short response", async () => {
    const expectedAsset = { ...asset, bytes: bytes.byteLength + 1 };
    const shortResponse = new Response(bytes);

    await expect(
      verifyVisionResponse(shortResponse, expectedAsset),
    ).rejects.toMatchObject({
      assetId: asset.id,
      code: "runtime-integrity-failed",
    });
  });

  it("does not surface request details when a response cannot be used", async () => {
    const response = new Response(null, { status: 404 });

    await expect(verifyVisionResponse(response, asset)).rejects.toBeInstanceOf(
      VisionAssetError,
    );
    await expect(
      verifyVisionResponse(new Response(null, { status: 404 }), asset),
    ).rejects.toMatchObject({
      assetId: asset.id,
      code: "runtime-download-failed",
    });
  });
});
