import type { VisionFrameCommand } from "./protocol";

export interface FaceFramePumpTick {
  cameraGeneration: number;
  generation: number;
  width: number;
  height: number;
}

export interface FaceFramePump {
  tick(input: FaceFramePumpTick): Promise<boolean>;
  stop(): void;
  dispose(): void;
}

export interface FaceFramePumpDependencies {
  capture(size: { width: number; height: number }): Promise<ImageBitmap>;
  now(): number;
  submit(command: VisionFrameCommand): boolean;
}

export interface BrowserFaceFramePumpDependencies {
  video: HTMLVideoElement;
  now(): number;
  submit(command: VisionFrameCommand): boolean;
}

export function createFaceFramePump(
  dependencies: FaceFramePumpDependencies,
): FaceFramePump {
  let captureInProgress = false;
  let currentGeneration: number | undefined;
  let disposed = false;
  let epoch = 0;
  let nextSequence = 0;

  const close = (bitmap: ImageBitmap) => {
    try {
      bitmap.close();
    } catch {
      // Closing is terminal best effort; the pump retains no bitmap reference.
    }
  };

  return {
    async tick(input) {
      if (
        disposed ||
        !Number.isFinite(input.width) ||
        !Number.isFinite(input.height) ||
        input.width <= 0 ||
        input.height <= 0
      ) {
        return false;
      }

      if (currentGeneration !== input.generation) {
        currentGeneration = input.generation;
        nextSequence = 0;
        epoch += 1;
      }
      if (captureInProgress) return false;

      const scale = Math.min(1, 640 / Math.max(input.width, input.height));
      const width = Math.max(1, Math.round(input.width * scale));
      const height = Math.max(1, Math.round(input.height * scale));
      const generation = input.generation;
      const sequence = nextSequence++;
      const captureEpoch = epoch;
      captureInProgress = true;

      try {
        const capturedAtMs = dependencies.now();
        const bitmap = await dependencies.capture({ width, height });
        if (
          disposed ||
          captureEpoch !== epoch ||
          generation !== currentGeneration
        ) {
          close(bitmap);
          return false;
        }

        let accepted: boolean;
        try {
          accepted = dependencies.submit({
            type: "FRAME",
            generation,
            cameraGeneration: input.cameraGeneration,
            sequence,
            capturedAtMs,
            width,
            height,
            orientation: width >= height ? "landscape" : "portrait",
            tier: "standard",
            bitmap,
          });
        } catch {
          close(bitmap);
          return false;
        }
        if (!accepted) close(bitmap);
        return accepted;
      } catch {
        return false;
      } finally {
        captureInProgress = false;
      }
    },
    stop() {
      currentGeneration = undefined;
      nextSequence = 0;
      epoch += 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      currentGeneration = undefined;
      nextSequence = 0;
      epoch += 1;
    },
  };
}

export function createBrowserFaceFramePump(
  dependencies: BrowserFaceFramePumpDependencies,
): FaceFramePump {
  return createFaceFramePump({
    capture: ({ width, height }) =>
      createImageBitmap(dependencies.video, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "medium",
      }),
    now: dependencies.now,
    submit: dependencies.submit,
  });
}
