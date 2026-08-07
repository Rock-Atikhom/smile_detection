import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserVisionCoordinator,
  createInitialVisionSnapshot,
  type VisionCoordinator,
  type VisionSnapshot,
} from "./coordinator";
import {
  useVisionRuntime,
  type UseVisionRuntimeResult,
} from "./useVisionRuntime";
import type { VisionFrameCommand } from "./protocol";

vi.mock("./coordinator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./coordinator")>();
  return { ...actual, createBrowserVisionCoordinator: vi.fn() };
});

function fakeCoordinator() {
  let listener: ((snapshot: VisionSnapshot) => void) | undefined;
  const unsubscribe = vi.fn();
  const coordinator = {
    cancel: vi.fn(),
    dispose: vi.fn(),
    prepare: vi.fn(async () => "started" as const),
    resetDetection: vi.fn(),
    restart: vi.fn(async () => "started" as const),
    submitFrame: vi.fn(() => true),
    snapshot: createInitialVisionSnapshot(),
    subscribe: vi.fn((next: (snapshot: VisionSnapshot) => void) => {
      listener = next;
      return unsubscribe;
    }),
  };
  return {
    coordinator: coordinator as unknown as VisionCoordinator,
    emit(snapshot: VisionSnapshot) {
      listener?.(snapshot);
    },
    unsubscribe,
  };
}

describe("useVisionRuntime", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(createBrowserVisionCoordinator).mockReset();
  });

  it("subscribes once, exposes stable actions, and cleans up exactly once", async () => {
    const fake = fakeCoordinator();
    vi.mocked(createBrowserVisionCoordinator).mockReturnValue(fake.coordinator);
    let current!: UseVisionRuntimeResult;
    const Harness = () => {
      current = useVisionRuntime();
      return <output>{current.snapshot.runtime}</output>;
    };
    const view = render(<Harness />);
    const actions = {
      cancel: current.cancel,
      prepare: current.prepare,
      resetDetection: current.resetDetection,
      restart: current.restart,
      submitFrame: current.submitFrame,
    };

    act(() => {
      fake.emit({
        ...createInitialVisionSnapshot(),
        runtime: "preparing",
        phase: "initializing",
      });
    });

    expect(fake.coordinator.subscribe).toHaveBeenCalledOnce();
    expect(view.getByText("preparing")).toBeVisible();
    expect(current.cancel).toBe(actions.cancel);
    expect(current.prepare).toBe(actions.prepare);
    expect(current.resetDetection).toBe(actions.resetDetection);
    expect(current.restart).toBe(actions.restart);
    expect(current.submitFrame).toBe(actions.submitFrame);
    await expect(current.prepare()).resolves.toBe("started");
    await expect(current.restart()).resolves.toBe("started");
    current.cancel();
    current.resetDetection();
    const command = {
      type: "FRAME",
      generation: 0,
      cameraGeneration: 0,
      sequence: 0,
      capturedAtMs: 0,
      width: 640,
      height: 360,
      orientation: "landscape",
      tier: "standard",
      bitmap: { close: vi.fn() } as unknown as ImageBitmap,
    } satisfies VisionFrameCommand;
    expect(current.submitFrame(command)).toBe(true);
    expect(fake.coordinator.prepare).toHaveBeenCalledOnce();
    expect(fake.coordinator.restart).toHaveBeenCalledOnce();
    expect(fake.coordinator.cancel).toHaveBeenCalledOnce();
    expect(fake.coordinator.resetDetection).toHaveBeenCalledOnce();
    expect(fake.coordinator.submitFrame).toHaveBeenCalledWith(command);

    view.unmount();
    expect(fake.unsubscribe).toHaveBeenCalledOnce();
    expect(fake.coordinator.dispose).toHaveBeenCalledOnce();
  });

  it("closes a frame when no mounted coordinator can accept it", () => {
    const fake = fakeCoordinator();
    vi.mocked(createBrowserVisionCoordinator).mockReturnValue(fake.coordinator);
    let current!: UseVisionRuntimeResult;
    const Harness = () => {
      current = useVisionRuntime();
      return null;
    };
    const view = render(<Harness />);
    expect(current).toHaveProperty("submitFrame", expect.any(Function));
    view.unmount();
    const image = { close: vi.fn() } as unknown as ImageBitmap;
    const command = {
      type: "FRAME",
      generation: 0,
      cameraGeneration: 0,
      sequence: 0,
      capturedAtMs: 0,
      width: 640,
      height: 360,
      orientation: "landscape",
      tier: "standard",
      bitmap: image,
    } satisfies VisionFrameCommand;

    expect(current.submitFrame(command)).toBe(false);
    expect(image.close).toHaveBeenCalledOnce();
    expect(fake.coordinator.submitFrame).not.toHaveBeenCalled();
  });

  it("gives every Strict Mode effect lifetime its own coordinator", () => {
    const lifetimes = [fakeCoordinator(), fakeCoordinator()];
    vi.mocked(createBrowserVisionCoordinator)
      .mockReturnValueOnce(lifetimes[0]!.coordinator)
      .mockReturnValueOnce(lifetimes[1]!.coordinator);
    let current!: UseVisionRuntimeResult;
    const Harness = () => {
      current = useVisionRuntime();
      return null;
    };

    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    expect(createBrowserVisionCoordinator).toHaveBeenCalledTimes(2);
    expect(lifetimes[0]!.coordinator.subscribe).toHaveBeenCalledOnce();
    expect(lifetimes[0]!.unsubscribe).toHaveBeenCalledOnce();
    expect(lifetimes[0]!.coordinator.dispose).toHaveBeenCalledOnce();
    expect(lifetimes[1]!.coordinator.subscribe).toHaveBeenCalledOnce();
    current.cancel();
    expect(lifetimes[0]!.coordinator.cancel).not.toHaveBeenCalled();
    expect(lifetimes[1]!.coordinator.cancel).toHaveBeenCalledOnce();

    view.unmount();
    expect(lifetimes[1]!.unsubscribe).toHaveBeenCalledOnce();
    expect(lifetimes[1]!.coordinator.dispose).toHaveBeenCalledOnce();
  });
});
