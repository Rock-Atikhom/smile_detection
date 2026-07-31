import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  configuredAssets,
  modelVersion,
  releaseDirectoryName,
  runtimeVersion,
} from "./vision-release.config.mjs";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = join(
  appDirectory,
  "public",
  "vision",
  releaseDirectoryName,
);
const require = createRequire(import.meta.url);
const packageDirectory = dirname(require.resolve("@mediapipe/tasks-vision"));

function noticeText() {
  return `Smart Smile vendored vision release notice\n\nThis release includes MediaPipe Tasks Vision ${runtimeVersion} and the Face Landmarker model ${modelVersion}, provided by Google LLC.\n\nMediaPipe Tasks Vision package provenance:\nhttps://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-${runtimeVersion}.tgz\nhttps://github.com/google-ai-edge/mediapipe/tree/v${runtimeVersion}\n\nFace Landmarker model source:\nhttps://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task\n\nModel-card sources:\nhttps://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf\nhttps://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf\nhttps://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf\n\nLicense:\nLICENSE-MediaPipe.txt\nhttps://raw.githubusercontent.com/google-ai-edge/mediapipe/v${runtimeVersion}/LICENSE\n`;
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function writeAtomically(destination, bytes) {
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
}

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

for (const asset of configuredAssets) {
  const destination = join(outputDirectory, asset.destination);
  await mkdir(dirname(destination), { recursive: true });
  let bytes;
  if (asset.packagePath) {
    bytes = await readFile(join(packageDirectory, asset.packagePath));
  } else if (asset.destination === "NOTICE.txt") {
    bytes = Buffer.from(noticeText(), "utf8");
  } else {
    bytes = await fetchBytes(asset.source);
  }
  await writeAtomically(destination, bytes);
}

console.log(`Vendored ${configuredAssets.length} vision release assets.`);
