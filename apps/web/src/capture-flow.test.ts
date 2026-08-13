import { describe, expect, it } from "vitest";
import {
  advanceCaptureFlow,
  canSendPhoto,
  createInitialCaptureFlow,
  isValidEmail,
  selectBestCandidate,
  type CaptureCandidate,
} from "./capture-flow";

function candidate(
  id: string,
  overrides: Partial<CaptureCandidate> = {},
): CaptureCandidate {
  return {
    id,
    width: 1280,
    height: 720,
    sharpness: 0.8,
    lighting: 0.8,
    oneFace: true,
    continuity: true,
    smileVerified: true,
    originalUrl: `data:image/jpeg;base64,${id}`,
    treatments: {
      original: `data:image/jpeg;base64,${id}-original`,
      studio: `data:image/jpeg;base64,${id}-studio`,
      sky: `data:image/jpeg;base64,${id}-sky`,
    },
    ...overrides,
  };
}

describe("capture flow", () => {
  it("starts with no retained photo and a three-second countdown", () => {
    const state = advanceCaptureFlow(createInitialCaptureFlow(), {
      type: "start-countdown",
    });

    expect(state.phase).toBe("countdown");
    expect(state.countdownRemaining).toBe(3);
    expect(state.candidates).toHaveLength(0);
  });

  it("moves from countdown to capture after three visible ticks", () => {
    let state = advanceCaptureFlow(createInitialCaptureFlow(), {
      type: "start-countdown",
    });
    state = advanceCaptureFlow(state, { type: "countdown-tick" });
    state = advanceCaptureFlow(state, { type: "countdown-tick" });
    state = advanceCaptureFlow(state, { type: "countdown-tick" });

    expect(state.phase).toBe("capturing");
    expect(state.countdownRemaining).toBe(0);
  });

  it("selects the clearest valid candidate from a three-frame burst", () => {
    const best = selectBestCandidate([
      candidate("one", { sharpness: 0.62 }),
      candidate("two", { sharpness: 0.94 }),
      candidate("three", { sharpness: 0.71 }),
    ]);

    expect(best?.id).toBe("two");
  });

  it("rejects a burst when every candidate fails the quality gate", () => {
    const state = advanceCaptureFlow(
      { ...createInitialCaptureFlow(), phase: "capturing" },
      {
        type: "capture-complete",
        candidates: [
          candidate("one", { oneFace: false }),
          candidate("two", { lighting: 0.1 }),
          candidate("three", { continuity: false }),
        ],
      },
    );

    expect(state.phase).toBe("error");
    expect(state.candidates).toHaveLength(0);
    expect(state.error).toMatch(/clear photo/i);
  });

  it("requires a valid email and explicit consent before send", () => {
    let state = advanceCaptureFlow(
      {
        ...createInitialCaptureFlow(),
        phase: "preview",
        candidate: candidate("one"),
      },
      { type: "set-email", email: "person@example.com" },
    );
    state = advanceCaptureFlow(state, { type: "set-consent", consent: true });

    expect(isValidEmail("person@example.com")).toBe(true);
    expect(canSendPhoto(state)).toBe(true);
    expect(canSendPhoto({ ...state, consent: false })).toBe(false);
    expect(canSendPhoto({ ...state, email: "not-an-email" })).toBe(false);
  });

  it("releases retained photos after delivery succeeds", () => {
    const state = advanceCaptureFlow(
      {
        ...createInitialCaptureFlow(),
        phase: "sending",
        candidates: [candidate("one")],
        candidate: candidate("one"),
        email: "person@example.com",
        consent: true,
      },
      { type: "send-succeeded" },
    );

    expect(state.phase).toBe("sent");
    expect(state.candidates).toHaveLength(0);
    expect(state.candidate).toBeNull();
    expect(state.email).toBe("");
    expect(state.consent).toBe(false);
  });
});
