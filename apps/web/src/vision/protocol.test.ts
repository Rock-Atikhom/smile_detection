import { describe, expect, it, vi } from "vitest";
import {
  isVisionServiceWorkerHandshakeCommand,
  isVisionServiceWorkerHandshakeEvent,
  isVisionCacheCommand,
  isVisionCacheEvent,
  isVisionWorkerCommand,
  isVisionWorkerEvent,
  VISION_SERVICE_WORKER_PROTOCOL,
} from "./protocol";

const releaseId = "0123456789abcdef";
const manifestUrl = "/assets/release-manifest.json";

describe("vision service worker handshake guards", () => {
  it("accepts only the exact current handshake command and reply", () => {
    expect(
      isVisionServiceWorkerHandshakeCommand({
        type: "VISION_SW_HANDSHAKE",
        requestId: "handshake-42",
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      }),
    ).toBe(true);
    expect(
      isVisionServiceWorkerHandshakeEvent({
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: "handshake-42",
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      }),
    ).toBe(true);
  });

  it.each([
    [
      "a version mismatch",
      {
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: "handshake-42",
        protocol: "smart-smile-vision-sw-v0",
      },
    ],
    [
      "an unexpected field",
      {
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: "handshake-42",
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
        unsafe: true,
      },
    ],
    [
      "a malformed request ID",
      {
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: "../handshake",
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      },
    ],
  ])("rejects %s in a handshake reply", (_description, event) => {
    expect(isVisionServiceWorkerHandshakeEvent(event)).toBe(false);
  });

  it("does not confuse handshake directions", () => {
    expect(
      isVisionServiceWorkerHandshakeCommand({
        type: "VISION_SW_HANDSHAKE_ACK",
        requestId: "handshake-42",
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      }),
    ).toBe(false);
    expect(
      isVisionServiceWorkerHandshakeEvent({
        type: "VISION_SW_HANDSHAKE",
        requestId: "handshake-42",
        protocol: VISION_SERVICE_WORKER_PROTOCOL,
      }),
    ).toBe(false);
  });
});

describe("vision worker protocol guards", () => {
  it("accepts the documented FRAME command and FACE_EVIDENCE event", () => {
    const bitmap = {
      close: vi.fn(),
      height: 360,
      width: 640,
    } as unknown as ImageBitmap;

    expect(
      isVisionWorkerCommand({
        type: "FRAME",
        generation: 4,
        sequence: 12,
        capturedAtMs: 1500,
        width: 640,
        height: 360,
        orientation: "landscape",
        tier: "standard",
        bitmap,
      }),
    ).toBe(true);
    expect(
      isVisionWorkerEvent({
        type: "FACE_EVIDENCE",
        generation: 4,
        sequence: 12,
        capturedAtMs: 1500,
        completedAtMs: 1540,
        width: 640,
        height: 360,
        orientation: "landscape",
        tier: "standard",
        faceCount: 1,
        guidance: "face-ready",
        eligible: true,
      }),
    ).toBe(true);
  });

  it.each([
    [
      "a fractional sequence",
      {
        type: "FRAME",
        generation: 4,
        sequence: 12.5,
        capturedAtMs: 1500,
        width: 640,
        height: 360,
        orientation: "landscape",
        tier: "standard",
        bitmap: { close: vi.fn() },
      },
      isVisionWorkerCommand,
    ],
    [
      "a non-finite timestamp",
      {
        type: "FACE_EVIDENCE",
        generation: 4,
        sequence: 12,
        capturedAtMs: Number.POSITIVE_INFINITY,
        completedAtMs: 1540,
        width: 640,
        height: 360,
        orientation: "landscape",
        tier: "standard",
        faceCount: 1,
        guidance: "face-ready",
        eligible: true,
      },
      isVisionWorkerEvent,
    ],
    [
      "zero dimensions",
      {
        type: "FRAME",
        generation: 4,
        sequence: 12,
        capturedAtMs: 1500,
        width: 0,
        height: 360,
        orientation: "landscape",
        tier: "standard",
        bitmap: { close: vi.fn() },
      },
      isVisionWorkerCommand,
    ],
    [
      "an invalid orientation",
      {
        type: "FRAME",
        generation: 4,
        sequence: 12,
        capturedAtMs: 1500,
        width: 640,
        height: 360,
        orientation: "square",
        tier: "standard",
        bitmap: { close: vi.fn() },
      },
      isVisionWorkerCommand,
    ],
    [
      "an invalid tier",
      {
        type: "FACE_EVIDENCE",
        generation: 4,
        sequence: 12,
        capturedAtMs: 1500,
        completedAtMs: 1540,
        width: 640,
        height: 360,
        orientation: "landscape",
        tier: "fast",
        faceCount: 1,
        guidance: "face-ready",
        eligible: true,
      },
      isVisionWorkerEvent,
    ],
    [
      "face count 3",
      {
        type: "FACE_EVIDENCE",
        generation: 4,
        sequence: 12,
        capturedAtMs: 1500,
        completedAtMs: 1540,
        width: 640,
        height: 360,
        orientation: "landscape",
        tier: "standard",
        faceCount: 3,
        guidance: "face-ready",
        eligible: true,
      },
      isVisionWorkerEvent,
    ],
    [
      "an eligible guidance mismatch",
      {
        type: "FACE_EVIDENCE",
        generation: 4,
        sequence: 12,
        capturedAtMs: 1500,
        completedAtMs: 1540,
        width: 640,
        height: 360,
        orientation: "landscape",
        tier: "standard",
        faceCount: 1,
        guidance: "too-far",
        eligible: true,
      },
      isVisionWorkerEvent,
    ],
    [
      "a bitmap without close",
      {
        type: "FRAME",
        generation: 4,
        sequence: 12,
        capturedAtMs: 1500,
        width: 640,
        height: 360,
        orientation: "landscape",
        tier: "standard",
        bitmap: {},
      },
      isVisionWorkerCommand,
    ],
    [
      "an extra key",
      {
        type: "FACE_EVIDENCE",
        generation: 4,
        sequence: 12,
        capturedAtMs: 1500,
        completedAtMs: 1540,
        width: 640,
        height: 360,
        orientation: "landscape",
        tier: "standard",
        faceCount: 1,
        guidance: "face-ready",
        eligible: true,
        unsafe: true,
      },
      isVisionWorkerEvent,
    ],
  ])("rejects %s", (_description, message, guard) => {
    expect(guard(message)).toBe(false);
  });

  it("accepts the documented READY worker event", () => {
    expect(
      isVisionWorkerEvent({
        type: "READY",
        generation: 2,
        releaseId,
        wasmTier: "simd",
      }),
    ).toBe(true);
  });

  it.each([
    ["a malformed generation", { type: "READY", generation: "2" }],
    ["a negative generation", { type: "CANCEL", generation: -1 }],
    [
      "an unsafe error reason",
      { type: "ERROR", generation: 1, code: "untrusted", recoverable: true },
    ],
    ["an unknown event", { type: "SURPRISE", generation: 1 }],
    [
      "unexpected worker event data",
      { type: "PHASE", generation: 1, phase: "verifying", unsafe: "value" },
    ],
  ])("rejects worker events with %s", (_description, event) => {
    expect(isVisionWorkerEvent(event)).toBe(false);
  });

  it.each([
    [
      "a PREPARE command with a same-origin manifest URL",
      { type: "PREPARE", generation: 2, manifestUrl, releaseId },
      true,
    ],
    [
      "an external manifest URL",
      {
        type: "PREPARE",
        generation: 2,
        manifestUrl: "https://example.test/manifest.json",
        releaseId,
      },
      false,
    ],
    ["an unknown command", { type: "DELETE", generation: 2 }, false],
    [
      "unexpected worker command data",
      { type: "CANCEL", generation: 2, unsafe: "value" },
      false,
    ],
  ])("%s", (_description, command, expected) => {
    expect(isVisionWorkerCommand(command)).toBe(expected);
  });
});

describe("vision cache protocol guards", () => {
  it.each([
    [
      "a CACHE_RELEASE command",
      {
        type: "CACHE_RELEASE",
        requestId: "cache-42",
        generation: 2,
        manifestUrl,
        releaseId,
      },
      true,
    ],
    [
      "a malformed request ID",
      {
        type: "QUERY_RELEASE",
        requestId: "../cache",
        generation: 2,
        releaseId,
      },
      false,
    ],
    [
      "an external cache manifest URL",
      {
        type: "CACHE_RELEASE",
        requestId: "cache-42",
        generation: 2,
        manifestUrl: "https://example.test/manifest.json",
        releaseId,
      },
      false,
    ],
    [
      "unexpected cache command data",
      {
        type: "CANCEL_CACHE",
        requestId: "cache-42",
        generation: 2,
        releaseId,
        unsafe: "value",
      },
      false,
    ],
  ])("accepts only %s", (_description, command, expected) => {
    expect(isVisionCacheCommand(command)).toBe(expected);
  });

  it.each([
    [
      "a CACHE_READY event",
      { type: "CACHE_READY", requestId: "cache-42", generation: 2, releaseId },
      true,
    ],
    [
      "a fatal cache integrity error",
      {
        type: "CACHE_ERROR",
        requestId: "cache-42",
        generation: 2,
        releaseId,
        code: "runtime-integrity-failed",
      },
      true,
    ],
    [
      "an unsafe cache error reason",
      {
        type: "CACHE_ERROR",
        requestId: "cache-42",
        generation: 2,
        releaseId,
        code: "runtime-download-failed",
      },
      false,
    ],
    [
      "unexpected cache event data",
      {
        type: "CACHE_MISSING",
        requestId: "cache-42",
        generation: 2,
        releaseId,
        unsafe: "value",
      },
      false,
    ],
    ["an unknown cache event", { type: "CACHE_DONE" }, false],
  ])("accepts only %s", (_description, event, expected) => {
    expect(isVisionCacheEvent(event)).toBe(expected);
  });
});
