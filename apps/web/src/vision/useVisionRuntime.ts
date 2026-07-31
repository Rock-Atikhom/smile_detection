import { useCallback, useEffect, useRef, useState } from "react";
import {
  createBrowserVisionCoordinator,
  createInitialVisionSnapshot,
  type VisionCoordinator,
  type VisionSnapshot,
} from "./coordinator";

export interface UseVisionRuntimeResult {
  snapshot: VisionSnapshot;
  prepare(): Promise<"started" | "first-use-offline">;
  restart(): Promise<"started" | "first-use-offline">;
  cancel(): void;
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

  return { cancel, prepare, restart, snapshot };
}
