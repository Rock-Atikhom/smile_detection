import type { FaceGuidance } from "./face-evidence";

export type VisionWasmTier = "unknown" | "simd" | "baseline";
export type VisionRuntimeState = "idle" | "preparing" | "ready" | "error";
export type VisionOfflineState = "not-ready" | "caching" | "ready" | "error";
export type VisionOrientation = "portrait" | "landscape";
export type VisionInferenceTier = "standard";
export const VISION_SERVICE_WORKER_PROTOCOL =
  "smart-smile-vision-sw-v2" as const;

export type VisionServiceWorkerHandshakeCommand = {
  type: "VISION_SW_HANDSHAKE";
  requestId: string;
  protocol: typeof VISION_SERVICE_WORKER_PROTOCOL;
};

export type VisionServiceWorkerHandshakeEvent = {
  type: "VISION_SW_HANDSHAKE_ACK";
  requestId: string;
  protocol: typeof VISION_SERVICE_WORKER_PROTOCOL;
};

export type VisionReason =
  | "first-use-offline"
  | "runtime-download-failed"
  | "runtime-integrity-failed"
  | "runtime-initialization-failed"
  | "runtime-cancelled"
  | "offline-cache-failed";

export type VisionWorkerCommand =
  | {
      type: "PREPARE";
      generation: number;
      manifestUrl: string;
      releaseId: string;
    }
  | { type: "CANCEL"; generation: number }
  | VisionFrameCommand;

export type VisionFrameCommand = {
  type: "FRAME";
  generation: number;
  cameraGeneration: number;
  sequence: number;
  capturedAtMs: number;
  width: number;
  height: number;
  orientation: VisionOrientation;
  tier: VisionInferenceTier;
  bitmap: ImageBitmap;
};

export type VisionWorkerEvent =
  | { type: "PHASE"; generation: number; phase: "verifying" | "initializing" }
  | {
      type: "READY";
      generation: number;
      releaseId: string;
      wasmTier: "simd" | "baseline";
    }
  | {
      type: "ERROR";
      generation: number;
      code: VisionReason;
      recoverable: boolean;
    }
  | VisionFaceEvidenceEvent;

export type VisionFaceEvidenceEvent = {
  type: "FACE_EVIDENCE";
  generation: number;
  cameraGeneration: number;
  sequence: number;
  capturedAtMs: number;
  completedAtMs: number;
  width: number;
  height: number;
  orientation: VisionOrientation;
  tier: VisionInferenceTier;
  faceCount: 0 | 1 | 2;
  guidance: FaceGuidance;
  eligible: boolean;
};

export type VisionCacheCommand =
  | {
      type: "CACHE_RELEASE";
      requestId: string;
      generation: number;
      manifestUrl: string;
      releaseId: string;
    }
  | {
      type: "CANCEL_CACHE";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "QUERY_RELEASE";
      requestId: string;
      generation: number;
      releaseId: string;
    };

export type VisionCacheEvent =
  | {
      type: "CACHE_CACHING";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "CACHE_READY";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "CACHE_MISSING";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "CACHE_CANCELLED";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "CACHE_ERROR";
      requestId: string;
      generation: number;
      releaseId: string;
      code: "offline-cache-failed" | "runtime-integrity-failed";
    };

const REASONS: readonly VisionReason[] = [
  "first-use-offline",
  "runtime-download-failed",
  "runtime-integrity-failed",
  "runtime-initialization-failed",
  "runtime-cancelled",
  "offline-cache-failed",
];
const RELEASE_ID_PATTERN = /^[a-f0-9]{16}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SAME_ORIGIN = "https://vision.invalid";
const FACE_GUIDANCE: readonly FaceGuidance[] = [
  "no-face",
  "multiple-faces",
  "too-close",
  "too-far",
  "off-center",
  "face-ready",
];

function isExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }

  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    !ownKeys.every(
      (key) => typeof key === "string" && expectedKeys.includes(key),
    )
  ) {
    return false;
  }

  return expectedKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor;
  });
}

export function isVisionGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isVisionPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isVisionTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isVisionOrientation(value: unknown): value is VisionOrientation {
  return value === "portrait" || value === "landscape";
}

function isVisionInferenceTier(value: unknown): value is VisionInferenceTier {
  return value === "standard";
}

function isVisionBitmap(value: unknown): value is ImageBitmap {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { close?: unknown }).close === "function"
  );
}

function isFaceGuidance(value: unknown): value is FaceGuidance {
  return (
    typeof value === "string" && FACE_GUIDANCE.includes(value as FaceGuidance)
  );
}

export function isVisionReleaseId(value: unknown): value is string {
  return typeof value === "string" && RELEASE_ID_PATTERN.test(value);
}

export function isVisionManifestUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return false;
  }

  try {
    const url = new URL(value, SAME_ORIGIN);
    return (
      url.origin === SAME_ORIGIN &&
      url.pathname === value &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

export function isVisionRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isVisionReason(value: unknown): value is VisionReason {
  return typeof value === "string" && REASONS.includes(value as VisionReason);
}

export function isVisionServiceWorkerHandshakeCommand(
  value: unknown,
): value is VisionServiceWorkerHandshakeCommand {
  return (
    isExactDataObject(value, ["type", "requestId", "protocol"]) &&
    value.type === "VISION_SW_HANDSHAKE" &&
    isVisionRequestId(value.requestId) &&
    value.protocol === VISION_SERVICE_WORKER_PROTOCOL
  );
}

export function isVisionServiceWorkerHandshakeEvent(
  value: unknown,
): value is VisionServiceWorkerHandshakeEvent {
  return (
    isExactDataObject(value, ["type", "requestId", "protocol"]) &&
    value.type === "VISION_SW_HANDSHAKE_ACK" &&
    isVisionRequestId(value.requestId) &&
    value.protocol === VISION_SERVICE_WORKER_PROTOCOL
  );
}

function messageType(value: unknown): string | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, "type");
  return descriptor !== undefined &&
    "value" in descriptor &&
    typeof descriptor.value === "string"
    ? descriptor.value
    : undefined;
}

export function isVisionWorkerCommand(
  value: unknown,
): value is VisionWorkerCommand {
  const type = messageType(value);
  if (type === undefined) {
    return false;
  }
  const message = value as Record<string, unknown>;

  switch (type) {
    case "PREPARE":
      return (
        isExactDataObject(value, [
          "type",
          "generation",
          "manifestUrl",
          "releaseId",
        ]) &&
        isVisionGeneration(message.generation) &&
        isVisionManifestUrl(message.manifestUrl) &&
        isVisionReleaseId(message.releaseId)
      );
    case "CANCEL":
      return (
        isExactDataObject(value, ["type", "generation"]) &&
        isVisionGeneration(message.generation)
      );
    case "FRAME":
      return (
        isExactDataObject(value, [
          "type",
          "generation",
          "cameraGeneration",
          "sequence",
          "capturedAtMs",
          "width",
          "height",
          "orientation",
          "tier",
          "bitmap",
        ]) &&
        isVisionGeneration(message.generation) &&
        isVisionGeneration(message.cameraGeneration) &&
        isVisionGeneration(message.sequence) &&
        isVisionTimestamp(message.capturedAtMs) &&
        isVisionPositiveInteger(message.width) &&
        isVisionPositiveInteger(message.height) &&
        isVisionOrientation(message.orientation) &&
        isVisionInferenceTier(message.tier) &&
        isVisionBitmap(message.bitmap)
      );
    default:
      return false;
  }
}

export function isVisionWorkerEvent(
  value: unknown,
): value is VisionWorkerEvent {
  const type = messageType(value);
  if (type === undefined) {
    return false;
  }
  const message = value as Record<string, unknown>;

  switch (type) {
    case "PHASE":
      return (
        isExactDataObject(value, ["type", "generation", "phase"]) &&
        isVisionGeneration(message.generation) &&
        (message.phase === "verifying" || message.phase === "initializing")
      );
    case "READY":
      return (
        isExactDataObject(value, [
          "type",
          "generation",
          "releaseId",
          "wasmTier",
        ]) &&
        isVisionGeneration(message.generation) &&
        isVisionReleaseId(message.releaseId) &&
        (message.wasmTier === "simd" || message.wasmTier === "baseline")
      );
    case "ERROR":
      return (
        isExactDataObject(value, [
          "type",
          "generation",
          "code",
          "recoverable",
        ]) &&
        isVisionGeneration(message.generation) &&
        isVisionReason(message.code) &&
        typeof message.recoverable === "boolean"
      );
    case "FACE_EVIDENCE":
      return (
        isExactDataObject(value, [
          "type",
          "generation",
          "cameraGeneration",
          "sequence",
          "capturedAtMs",
          "completedAtMs",
          "width",
          "height",
          "orientation",
          "tier",
          "faceCount",
          "guidance",
          "eligible",
        ]) &&
        isVisionGeneration(message.generation) &&
        isVisionGeneration(message.cameraGeneration) &&
        isVisionGeneration(message.sequence) &&
        isVisionTimestamp(message.capturedAtMs) &&
        isVisionTimestamp(message.completedAtMs) &&
        isVisionPositiveInteger(message.width) &&
        isVisionPositiveInteger(message.height) &&
        isVisionOrientation(message.orientation) &&
        isVisionInferenceTier(message.tier) &&
        (message.faceCount === 0 ||
          message.faceCount === 1 ||
          message.faceCount === 2) &&
        isFaceGuidance(message.guidance) &&
        typeof message.eligible === "boolean" &&
        message.eligible === (message.guidance === "face-ready")
      );
    default:
      return false;
  }
}

export function isVisionCacheCommand(
  value: unknown,
): value is VisionCacheCommand {
  const type = messageType(value);
  if (type === undefined) {
    return false;
  }
  const message = value as Record<string, unknown>;

  switch (type) {
    case "CACHE_RELEASE":
      return (
        isExactDataObject(value, [
          "type",
          "requestId",
          "generation",
          "manifestUrl",
          "releaseId",
        ]) &&
        isVisionRequestId(message.requestId) &&
        isVisionGeneration(message.generation) &&
        isVisionManifestUrl(message.manifestUrl) &&
        isVisionReleaseId(message.releaseId)
      );
    case "CANCEL_CACHE":
    case "QUERY_RELEASE":
      return (
        isExactDataObject(value, [
          "type",
          "requestId",
          "generation",
          "releaseId",
        ]) &&
        isVisionRequestId(message.requestId) &&
        isVisionGeneration(message.generation) &&
        isVisionReleaseId(message.releaseId)
      );
    default:
      return false;
  }
}

export function isVisionCacheEvent(value: unknown): value is VisionCacheEvent {
  const type = messageType(value);
  if (type === undefined) {
    return false;
  }
  const message = value as Record<string, unknown>;

  switch (type) {
    case "CACHE_CACHING":
    case "CACHE_READY":
    case "CACHE_MISSING":
    case "CACHE_CANCELLED":
      return (
        isExactDataObject(value, [
          "type",
          "requestId",
          "generation",
          "releaseId",
        ]) &&
        isVisionRequestId(message.requestId) &&
        isVisionGeneration(message.generation) &&
        isVisionReleaseId(message.releaseId)
      );
    case "CACHE_ERROR":
      return (
        isExactDataObject(value, [
          "type",
          "requestId",
          "generation",
          "releaseId",
          "code",
        ]) &&
        isVisionRequestId(message.requestId) &&
        isVisionGeneration(message.generation) &&
        isVisionReleaseId(message.releaseId) &&
        (message.code === "offline-cache-failed" ||
          message.code === "runtime-integrity-failed")
      );
    default:
      return false;
  }
}
