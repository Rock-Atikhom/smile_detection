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
import { analyzeFaceLandmarks } from "./face-evidence";
import { calculateRawSmileScore } from "./smile-score";

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

interface MediaPipeCategory {
  categoryName?: unknown;
  score?: unknown;
}

interface MediaPipeBlendshape {
  categories?: MediaPipeCategory[];
}

function rawSmileScoreFromResult(result: unknown): number {
  if (
    (typeof result !== "object" && typeof result !== "function") ||
    result === null
  ) {
    return 0;
  }
  const blendshapes = ownDataProperty(result, "faceBlendshapes");
  if (
    !Array.isArray(blendshapes) ||
    blendshapes.length !== 1 ||
    !isPlainObject(blendshapes[0])
  ) {
    return 0;
  }
  const shape = blendshapes[0] as MediaPipeBlendshape;
  if (!Array.isArray(shape.categories)) {
    return 0;
  }
  const categories: { categoryName: string; score: number }[] = [];
  for (const category of shape.categories) {
    if (!isPlainObject(category)) return 0;
    const { categoryName, score } = category as MediaPipeCategory;
    if (
      typeof categoryName !== "string" ||
      typeof score !== "number" ||
      !Number.isFinite(score)
    ) {
      return 0;
    }
    categories.push({ categoryName, score });
  }
  return calculateRawSmileScore(categories);
}

function isPlainObject(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
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
    let inferenceFailure:
      { code: VisionReason; recoverable: boolean } | undefined;
    try {
      const prepared = candidate.prepared;
      if (!isCurrent(candidate) || prepared === undefined) {
        return;
      }

      const result = prepared.detectForVideo(frame.bitmap, frame.capturedAtMs);
      if (!isCurrent(candidate)) {
        return;
      }

      const analysis = analyzeFaceLandmarks(result.faceLandmarks);
      const rawSmileScore =
        analysis.faceCount === 1 ? rawSmileScoreFromResult(result) : 0;
      const observation = analysis.observation
        ? {
            centerX: analysis.observation.centerX,
            centerY: analysis.observation.centerY,
            width: analysis.observation.width,
            height: analysis.observation.height,
            anchors: [...analysis.observation.anchors] as [
              number,
              number,
              number,
              number,
              number,
              number,
              number,
              number,
            ],
          }
        : null;
      postMessage({
        type: "FACE_EVIDENCE",
        generation: candidate.generation,
        cameraGeneration: frame.cameraGeneration,
        sequence: frame.sequence,
        capturedAtMs: frame.capturedAtMs,
        completedAtMs: Date.now(),
        width: frame.width,
        height: frame.height,
        orientation: frame.orientation,
        tier: frame.tier,
        faceCount: analysis.faceCount,
        guidance: analysis.guidance,
        eligible: analysis.initialEligible,
        observation,
        rawSmileScore,
      });
    } catch (error) {
      inferenceFailure = mapFailure(error);
    } finally {
      closeBitmap(frame.bitmap);
    }

    if (inferenceFailure !== undefined && isCurrent(candidate)) {
      postMessage({
        type: "ERROR",
        generation: candidate.generation,
        ...inferenceFailure,
      });
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
