import {
  prepareVisionRuntime,
  VisionRuntimeError,
  type PreparedVisionRuntime,
  type VisionRuntimeDependencies,
} from "./runtime-loader";
import {
  isVisionWorkerCommand,
  type VisionFrameCommand,
  type VisionReason,
  type VisionWorkerCommand,
  type VisionWorkerEvent,
} from "./protocol";
import { classifyFaceLandmarks } from "./face-evidence";

interface ActiveGeneration {
  controller: AbortController;
  generation: number;
  prepared?: PreparedVisionRuntime;
  processing: boolean;
  pending?: VisionFrameCommand;
}

export interface VisionWorkerRuntime {
  receive(message: unknown): void;
  dispose(): void;
}

function closeGeneration(active: ActiveGeneration): void {
  active.controller.abort();
  if (active.pending !== undefined) {
    closeBitmap(active.pending.bitmap);
    active.pending = undefined;
  }
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

function closeMalformedFrameBitmap(message: unknown): void {
  if (
    typeof message !== "object" ||
    message === null ||
    Array.isArray(message) ||
    Object.getPrototypeOf(message) !== Object.prototype
  ) {
    return;
  }

  const candidate = message as {
    bitmap?: { close?: unknown };
    type?: unknown;
  };
  if (
    candidate.type === "FRAME" &&
    typeof candidate.bitmap?.close === "function"
  ) {
    closeBitmap(candidate.bitmap as ImageBitmap);
  }
}

function replacePending(
  active: ActiveGeneration,
  frame: VisionFrameCommand,
): void {
  if (active.pending !== undefined) {
    closeBitmap(active.pending.bitmap);
  }
  active.pending = frame;
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

  const processFrame = async (
    candidate: ActiveGeneration,
    frame: VisionFrameCommand,
  ): Promise<void> => {
    try {
      const prepared = candidate.prepared;
      if (!isCurrent(candidate) || prepared === undefined) {
        return;
      }

      const result = await prepared.detectForVideo(
        frame.bitmap,
        frame.capturedAtMs,
      );
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
      candidate.processing = false;
      const pending = candidate.pending;
      candidate.pending = undefined;

      if (pending !== undefined) {
        if (!isCurrent(candidate) || candidate.prepared === undefined) {
          closeBitmap(pending.bitmap);
        } else {
          candidate.processing = true;
          void processFrame(candidate, pending);
        }
      }
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

        if (active.processing) {
          replacePending(active, message);
          return;
        }

        active.processing = true;
        void processFrame(active, message);
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
        processing: false,
      };
      active = candidate;
      void prepare(message, candidate);
    },
  };
}
