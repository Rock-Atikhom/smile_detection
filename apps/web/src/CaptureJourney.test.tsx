import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureJourney } from "./CaptureJourney";

const capturePhotoBurst = vi.hoisted(() => vi.fn());

vi.mock("./photo-capture", () => ({
  capturePhotoBurst,
  captureVideoFrame: vi.fn(),
  renderPhotoTreatment: vi.fn(),
}));

vi.mock("./background-renderer", () => ({
  createBackgroundRenderer: vi.fn(),
}));

vi.mock("./delivery", () => ({
  sendPhoto: vi.fn(),
}));

describe("CaptureJourney preview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturePhotoBurst.mockResolvedValue([
      {
        continuity: true,
        height: 720,
        id: "candidate-1",
        lighting: 0.8,
        oneFace: true,
        originalUrl: "data:image/jpeg;base64,photo",
        sharpness: 0.8,
        smileVerified: true,
        treatments: {
          original: "data:image/jpeg;base64,photo",
          sky: "data:image/jpeg;base64,photo",
          studio: "data:image/jpeg;base64,photo",
        },
        width: 1280,
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("offers an explicit download action on the selected photo preview", async () => {
    render(
      <CaptureJourney
        hasContinuity
        isSingleFace
        isSmileVerified
        onResetDetection={vi.fn()}
        videoRef={{ current: null }}
      />,
    );

    for (let tick = 0; tick < 4; tick += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    expect(
      screen.getByRole("button", { name: "Download photo" }),
    ).toBeVisible();
  });

  it("collects participant details before email consent", async () => {
    render(
      <CaptureJourney
        hasContinuity
        isSingleFace
        isSmileVerified
        onResetDetection={vi.fn()}
        videoRef={{ current: null }}
      />,
    );

    for (let tick = 0; tick < 4; tick += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    await act(async () => {
      const useButtons = screen.getAllByRole("button", {
        name: "Use this photo",
      });
      useButtons[useButtons.length - 1]?.click();
    });

    expect(screen.getByRole("textbox", { name: "First name" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Last name" })).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Nickname (optional)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Email address" }),
    ).toBeVisible();
  });
});
