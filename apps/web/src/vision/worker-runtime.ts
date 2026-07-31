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
      if (disposed || !isVisionWorkerCommand(message)) {
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
