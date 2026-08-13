import { ImageSegmenter } from "@mediapipe/tasks-vision";
import type { ImageSegmenterResult, MPMask } from "@mediapipe/tasks-vision";
import { resolveAppPath } from "./app-path";
import { getAssetByRole } from "./vision/manifest";
import { VISION_MANIFEST } from "./vision/release";

export type BackgroundTreatment = "original" | "studio" | "sky";

export interface PixelCompositeInput {
  background: readonly [number, number, number];
  height: number;
  mask: Float32Array;
  maskHeight: number;
  maskWidth: number;
  source: Uint8ClampedArray;
  threshold: number;
  width: number;
}

export function compositePixels(input: PixelCompositeInput): Uint8ClampedArray {
  const output = new Uint8ClampedArray(input.source);
  for (let y = 0; y < input.height; y += 1) {
    const maskY = Math.min(
      input.maskHeight - 1,
      Math.floor((y / input.height) * input.maskHeight),
    );
    for (let x = 0; x < input.width; x += 1) {
      const maskX = Math.min(
        input.maskWidth - 1,
        Math.floor((x / input.width) * input.maskWidth),
      );
      const confidence = input.mask[maskY * input.maskWidth + maskX] ?? 0;
      if (confidence >= input.threshold) continue;
      const index = (y * input.width + x) * 4;
      output[index] = input.background[0];
      output[index + 1] = input.background[1];
      output[index + 2] = input.background[2];
      output[index + 3] = 255;
    }
  }
  return output;
}

const backgroundColors: Record<
  Exclude<BackgroundTreatment, "original">,
  readonly [number, number, number]
> = {
  studio: [245, 225, 205],
  sky: [185, 218, 245],
};

function renderWithMask(
  sourceCanvas: HTMLCanvasElement,
  mask: MPMask,
  background: readonly [number, number, number],
): string {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;
  const context = outputCanvas.getContext("2d");
  const sourceContext = sourceCanvas.getContext("2d");
  if (context === null || sourceContext === null) {
    throw new Error("Canvas rendering is unavailable");
  }

  const source = sourceContext.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  const pixels = compositePixels({
    background,
    height: sourceCanvas.height,
    mask: mask.getAsFloat32Array(),
    maskHeight: mask.height,
    maskWidth: mask.width,
    source: source.data,
    threshold: 0.42,
    width: sourceCanvas.width,
  });
  context.putImageData(
    new ImageData(
      pixels as unknown as ImageDataArray,
      sourceCanvas.width,
      sourceCanvas.height,
    ),
    0,
    0,
  );
  return outputCanvas.toDataURL("image/jpeg", 0.92);
}

function segmentationWasmFileset() {
  const prefix = "/vision/mediapipe-0.10.35-face-landmarker-float16-v1/";
  return {
    wasmBinaryPath: resolveAppPath(`${prefix}vision_wasm_nosimd_internal.wasm`),
    wasmLoaderPath: resolveAppPath(`${prefix}vision_wasm_nosimd_internal.js`),
  };
}

export interface BackgroundRenderer {
  render(canvas: HTMLCanvasElement): Record<BackgroundTreatment, string>;
  close(): void;
}

export async function createBackgroundRenderer(): Promise<BackgroundRenderer> {
  const model = getAssetByRole(VISION_MANIFEST, "selfie-segmentation-model");
  if (model === undefined) throw new Error("Segmentation model is unavailable");
  const modelResponse = await fetch(resolveAppPath(model.path));
  if (!modelResponse.ok) throw new Error("Segmentation model could not load");
  const modelAssetBuffer = new Uint8Array(await modelResponse.arrayBuffer());
  const segmenter = await ImageSegmenter.createFromOptions(
    segmentationWasmFileset(),
    {
      baseOptions: { delegate: "CPU", modelAssetBuffer },
      outputCategoryMask: false,
      outputConfidenceMasks: true,
      runningMode: "IMAGE",
    },
  );

  return {
    render(canvas) {
      const result: ImageSegmenterResult = segmenter.segment(canvas);
      const mask = result.confidenceMasks?.[0];
      if (mask === undefined)
        throw new Error("Segmentation mask is unavailable");
      try {
        return {
          original: canvas.toDataURL("image/jpeg", 0.92),
          sky: renderWithMask(canvas, mask, backgroundColors.sky),
          studio: renderWithMask(canvas, mask, backgroundColors.studio),
        };
      } finally {
        mask.close();
      }
    },
    close() {
      segmenter.close();
    },
  };
}
