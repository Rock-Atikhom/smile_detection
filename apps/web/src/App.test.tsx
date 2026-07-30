import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("Smart Smile foundation shell", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the private camera foundation without requesting camera access", () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    render(<App />);

    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Take a smile photo privately",
    );
    expect(
      screen.getByText(
        "Camera and smile detection run on this device. No camera image or photo is uploaded.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Camera foundation preview")).toBeVisible();
    expect(document.querySelector("video")).not.toBeInTheDocument();

    const continueButton = screen.getByRole("button", {
      name: "Continue to camera",
    });
    expect(continueButton).toBeDisabled();
    expect(
      screen.getByText("Camera setup is the next delivery step."),
    ).toBeVisible();

    const privacyTrigger = screen.getByRole("button", {
      name: "How privacy works",
    });
    expect(privacyTrigger).toBeEnabled();
    fireEvent.click(privacyTrigger);
    expect(
      screen.getByRole("dialog", { name: "How privacy works" }),
    ).toBeVisible();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("opens an accessible privacy disclosure", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "How privacy works" }));

    expect(
      screen.getByRole("dialog", { name: "How privacy works" }),
    ).toBeVisible();
    expect(screen.getByText("No account is required.")).toBeVisible();
    expect(
      screen.getByText("No camera image or photo is uploaded."),
    ).toBeVisible();
    expect(screen.getByText("Microphone access is not used.")).toBeVisible();
    expect(
      screen.getByText("The application does not persist photos."),
    ).toBeVisible();
  });
});
