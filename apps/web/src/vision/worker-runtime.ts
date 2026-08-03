import {
  prepareVisionRuntime,
  VisionRuntimeError,
  type PreparedVisionRuntime,
  type VisionRuntimeDependencies,
} from "./runtime-loader";
import {
  isVisionWorkerCommand,
  type VisionReason,
  type VisionWorkerCommand,
  type VisionWorkerEvent,
} from "./protocol";
import { classifyFaceLandmarks } from "./face-evidence";

interface ActiveGeneration {
  controller: AbortController;
  generation: number;
  prepared?: PreparedVisionRuntime;
}

export interface VisionWorkerRuntime {
  receive(message: unknown): void;
  dispose(): void;
}

function closeGeneration(active: ActiveGeneration): void {
  active.controller.abort();
  active.prepared?.close();
  active.prepared = undefined;
}

function closeBitmap(bitmap: ImageBitmap): void {
  try {
    bitmap.close();
  } catch {
    // Bitmap cleanup is best-effort at the worker boundary.
  }
}

function ownDataProperty(value: unknown, key: PropertyKey): unknown {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return undefined;
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function closeCloseable(value: unknown): void {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return;
  }

  const visited = new Set<object>();
  let owner: object | null = value;
  while (owner !== null && !visited.has(owner)) {
    visited.add(owner);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(owner, "close");
      if (descriptor !== undefined) {
        if ("value" in descriptor && typeof descriptor.value === "function") {
          Reflect.apply(descriptor.value, value, []);
        }
        return;
      }
      owner = Object.getPrototypeOf(owner) as object | null;
    } catch {
      return;
    }
  }
}

function closeMalformedFrameBitmap(message: unknown): void {
  if (ownDataProperty(message, "type") !== "FRAME") {
    return;
  }
  closeCloseable(ownDataProperty(message, "bitmap"));
}

function mapFailure(error: unknown): {
  code: VisionReason;
  recoverable: boolean;
} {
  if (error instanceof VisionRuntimeError) {
    return {
      code: error.code,
      recoverable: error.code !== "runtime-integrity-failed",
    };
  }
  return { code: "runtime-initialization-failed", recoverable: true };
}

export function createVisionWorkerRuntime(
  dependencies: VisionRuntimeDependencies,
  postMessage: (event: VisionWorkerEvent) => void,
): VisionWorkerRuntime {
  let active: ActiveGeneration | undefined;
  let disposed = false;

  const isCurrent = (candidate: ActiveGeneration): boolean =>
    !disposed && active === candidate && !candidate.controller.signal.aborted;

  const processFrame = (
    candidate: ActiveGeneration,
    frame: Extract<VisionWorkerCommand, { type: "FRAME" }>,
  ): void => {
    try {
      const prepared = candidate.prepared;
      if (!isCurrent(candidate) || prepared === undefined) {
        return;
      }

      const result = prepared.detectForVideo(frame.bitmap, frame.capturedAtMs);
      if (!isCurrent(candidate)) {
        return;
      }

      const evidence = classifyFaceLandmarks(result.faceLandmarks);
      postMessage({
        type: "FACE_EVIDENCE",
        generation: candidate.generation,
        sequence: frame.sequence,
        capturedAtMs: frame.capturedAtMs,
        completedAtMs: Date.now(),
        width: frame.width,
        height: frame.height,
        orientation: frame.orientation,
        tier: frame.tier,
        ...evidence,
      });
    } catch {
      // Inference failures remain inside the worker boundary.
    } finally {
      closeBitmap(frame.bitmap);
    }
  };

  const prepare = async (
    command: Extract<VisionWorkerCommand, { type: "PREPARE" }>,
    candidate: ActiveGeneration,
  ): Promise<void> => {
    try {
      const prepared = await prepareVisionRuntime(
        {
          manifestUrl: command.manifestUrl,
          onPhase(phase) {
            if (isCurrent(candidate)) {
              postMessage({
                type: "PHASE",
                generation: candidate.generation,
                phase,
              });
            }
          },
          releaseId: command.releaseId,
          signal: candidate.controller.signal,
        },
        dependencies,
      );

      if (!isCurrent(candidate)) {
        prepared.close();
        return;
      }
      candidate.prepared?.close();
      candidate.prepared = prepared;
      postMessage({
        type: "READY",
        generation: candidate.generation,
        releaseId: command.releaseId,
        wasmTier: prepared.wasmTier,
      });
    } catch (error) {
      if (!isCurrent(candidate)) {
        return;
      }
      const failure = mapFailure(error);
      if (failure.code === "runtime-cancelled") {
        return;
      }
      postMessage({
        type: "ERROR",
        generation: candidate.generation,
        ...failure,
      });
    }
  };

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (active !== undefined) {
        closeGeneration(active);
        active = undefined;
      }
    },
    receive(message) {
      if (!isVisionWorkerCommand(message)) {
        closeMalformedFrameBitmap(message);
        return;
      }

      if (disposed) {
        if (message.type === "FRAME") {
          closeBitmap(message.bitmap);
        }
        return;
      }

      if (message.type === "FRAME") {
        if (
          active === undefined ||
          active.generation !== message.generation ||
          active.prepared === undefined ||
          active.controller.signal.aborted
        ) {
          closeBitmap(message.bitmap);
          return;
        }

        processFrame(active, message);
        return;
      }

      if (message.type === "CANCEL") {
        if (active?.generation === message.generation) {
          closeGeneration(active);
        }
        return;
      }

      if (active !== undefined && message.generation <= active.generation) {
        return;
      }
      if (active !== undefined) {
        closeGeneration(active);
      }
      const candidate: ActiveGeneration = {
        controller: new AbortController(),
        generation: message.generation,
      };
      active = candidate;
      void prepare(message, candidate);
    },
  };
}
