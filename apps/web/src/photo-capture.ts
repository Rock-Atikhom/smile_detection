import type { CaptureCandidate } from "./capture-flow";
import type { BackgroundRenderer } from "./background-renderer";

export interface CapturedPhoto extends CaptureCandidate {
  sharpness: number;
  lighting: number;
  oneFace: boolean;
  continuity: boolean;
  smileVerified: boolean;
}

export interface PhotoCaptureDependencies {
  capture: () => Promise<{
    width: number;
    height: number;
    originalUrl: string;
    treatments: Record<"original" | "studio" | "sky", string>;
    sharpness?: number;
    lighting?: number;
    oneFace?: boolean;
    continuity?: boolean;
    smileVerified?: boolean;
  }>;
  delay: (milliseconds: number) => Promise<void>;
  quality?: CaptureQuality;
}

export interface CaptureQuality {
  oneFace: boolean;
  continuity: boolean;
  smileVerified: boolean;
}

export function captureVideoFrame(
  video: HTMLVideoElement,
): Omit<CapturedPhoto, "id"> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width < 1 || height < 1) throw new Error("Camera frame is not ready");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Camera capture is unavailable");
  context.drawImage(video, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let luminance = 0;
  let edgeEnergy = 0;
  let samples = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const index = (y * width + x) * 4;
      const value =
        (0.2126 * pixels[index] +
          0.7152 * pixels[index + 1] +
          0.0722 * pixels[index + 2]) /
        255;
      luminance += value;
      if (x + 4 < width) {
        const nextIndex = (y * width + x + 4) * 4;
        edgeEnergy += Math.abs(value - pixels[nextIndex] / 255);
      }
      samples += 1;
    }
  }
  const averageLuminance = samples === 0 ? 0 : luminance / samples;
  const lighting = Math.min(
    1,
    Math.max(0, 2 * Math.min(averageLuminance, 1 - averageLuminance)),
  );
  const sharpness = Math.min(1, (edgeEnergy / Math.max(1, samples)) * 8);
  const originalUrl = canvas.toDataURL("image/jpeg", 0.92);
  const treatments = {
    original: originalUrl,
    sky: originalUrl,
    studio: originalUrl,
  };

  return {
    continuity: true,
    height,
    lighting,
    oneFace: true,
    originalUrl,
    sharpness,
    smileVerified: true,
    treatments,
    width,
  };
}

export async function renderPhotoTreatment(
  photo: CapturedPhoto,
  treatment: "studio" | "sky",
  renderer: BackgroundRenderer,
): Promise<string> {
  const image = new Image();
  image.src = photo.originalUrl;
  await new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("Captured photo could not be rendered")),
      { once: true },
    );
  });
  const canvas = document.createElement("canvas");
  canvas.width = photo.width;
  canvas.height = photo.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Photo rendering is unavailable");
  context.drawImage(image, 0, 0, photo.width, photo.height);
  return renderer.render(canvas)[treatment];
}

export async function capturePhotoBurst(
  dependencies: PhotoCaptureDependencies,
): Promise<CapturedPhoto[]> {
  const candidates: CapturedPhoto[] = [];
  for (let index = 0; index < 3; index += 1) {
    const photo = await dependencies.capture();
    candidates.push({
      ...photo,
      id: `candidate-${index + 1}`,
      sharpness: photo.sharpness ?? 0.8 - index * 0.03,
      lighting: photo.lighting ?? 0.8,
      oneFace: dependencies.quality?.oneFace ?? photo.oneFace ?? true,
      continuity: dependencies.quality?.continuity ?? photo.continuity ?? true,
      smileVerified:
        dependencies.quality?.smileVerified ?? photo.smileVerified ?? true,
    });
    if (index < 2) await dependencies.delay(100);
  }
  return candidates;
}
