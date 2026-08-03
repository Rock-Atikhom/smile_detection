import type { VisionAsset } from "./manifest";
import type { VisionReason } from "./protocol";

export type { VisionAsset } from "./manifest";

export const VISION_ASSET_ERROR_HEADER = "x-smart-smile-vision-error";

export class VisionAssetError extends Error {
  readonly assetId: string;
  readonly code: VisionReason;

  constructor(code: VisionReason, assetId: string) {
    super("Vision asset verification failed");
    Object.defineProperty(this, "name", {
      configurable: false,
      enumerable: false,
      value: "VisionAssetError",
      writable: false,
    });
    Object.defineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false,
    });
    this.code = code;
    this.assetId = assetId;
  }
}

export class VisionAssetOperationalError extends Error {
  readonly assetId: string;
  readonly code = "offline-cache-failed" as const;

  constructor(assetId: string) {
    super("Vision asset operation failed");
    Object.defineProperty(this, "name", {
      configurable: false,
      enumerable: false,
      value: "VisionAssetOperationalError",
      writable: false,
    });
    Object.defineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false,
    });
    this.assetId = assetId;
  }
}

function sameHash(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function verifyVisionResponse(
  response: Response,
  asset: VisionAsset,
): Promise<Uint8Array> {
  if (!response.ok) {
    if (
      response.headers.get(VISION_ASSET_ERROR_HEADER) === "offline-cache-failed"
    ) {
      throw new VisionAssetOperationalError(asset.id);
    }
    throw new VisionAssetError("runtime-download-failed", asset.id);
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    throw new VisionAssetOperationalError(asset.id);
  }

  if (buffer.byteLength !== asset.bytes) {
    throw new VisionAssetError("runtime-integrity-failed", asset.id);
  }

  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest("SHA-256", buffer);
  } catch {
    throw new VisionAssetOperationalError(asset.id);
  }

  if (!sameHash(toHex(new Uint8Array(digest)), asset.sha256)) {
    throw new VisionAssetError("runtime-integrity-failed", asset.id);
  }

  return new Uint8Array(buffer);
}
