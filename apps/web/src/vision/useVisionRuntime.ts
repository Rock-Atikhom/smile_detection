import { useCallback, useEffect, useRef, useState } from "react";
import {
  createBrowserVisionCoordinator,
  createInitialVisionSnapshot,
  type VisionCoordinator,
  type VisionSnapshot,
  type VisionStartResult,
} from "./coordinator";
import type { VisionFrameCommand } from "./protocol";

export interface UseVisionRuntimeResult {
  snapshot: VisionSnapshot;
  prepare(): Promise<VisionStartResult>;
  restart(): Promise<VisionStartResult>;
  cancel(): void;
  resetDetection(): void;
  submitFrame(command: VisionFrameCommand): boolean;
}

export function useVisionRuntime(): UseVisionRuntimeResult {
  const coordinatorRef = useRef<VisionCoordinator | null>(null);
  const [snapshot, setSnapshot] = useState<VisionSnapshot>(
    createInitialVisionSnapshot,
  );

  useEffect(() => {
    const coordinator = createBrowserVisionCoordinator();
    coordinatorRef.current = coordinator;
    const unsubscribe = coordinator.subscribe(setSnapshot);
    return () => {
      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null;
      }
      unsubscribe();
      coordinator.dispose();
    };
  }, []);

  const prepare = useCallback(
    () =>
      coordinatorRef.current?.prepare() ??
      Promise.resolve<"first-use-offline">("first-use-offline"),
    [],
  );
  const restart = useCallback(
    () =>
      coordinatorRef.current?.restart() ??
      Promise.resolve<"first-use-offline">("first-use-offline"),
    [],
  );
  const cancel = useCallback(() => coordinatorRef.current?.cancel(), []);
  const resetDetection = useCallback(
    () => coordinatorRef.current?.resetDetection(),
    [],
  );
  const submitFrame = useCallback((command: VisionFrameCommand) => {
    const coordinator = coordinatorRef.current;
    if (coordinator !== null) return coordinator.submitFrame(command);
    try {
      command.bitmap.close();
    } catch {
      // The hook retains no transferable data when its coordinator is absent.
    }
    return false;
  }, []);

  return { cancel, prepare, resetDetection, restart, snapshot, submitFrame };
}
