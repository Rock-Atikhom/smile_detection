import { describe, expect, it } from "vitest";
import {
  isVisionCacheCommand,
  isVisionCacheEvent,
  isVisionWorkerCommand,
  isVisionWorkerEvent,
} from "./protocol";

const releaseId = "0123456789abcdef";
const manifestUrl = "/assets/release-manifest.json";

describe("vision worker protocol guards", () => {
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
