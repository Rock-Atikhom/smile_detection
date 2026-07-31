import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import {
  configuredAssets,
  modelVersion,
  releaseDirectoryName,
  runtimeVersion,
} from "./vision-release.config.mjs";

const appDirectory = process.cwd();
const defaultReleaseDirectory = join(
  appDirectory,
  "public",
  "vision",
  releaseDirectoryName,
);
const require = createRequire(import.meta.url);
const defaultPackageDirectory = dirname(
  require.resolve("@mediapipe/tasks-vision"),
);

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
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
}

async function filesIn(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = `${prefix}${entry.name}`;
      return entry.isDirectory()
        ? filesIn(join(directory, entry.name), `${path}/`)
        : [path];
    }),
  );
  return paths.flat().sort();
}

async function validateCompleteRelease(directory) {
  const expectedPaths = configuredAssets
    .map(({ destination }) => destination)
    .sort();
  const actualPaths = await filesIn(directory);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      "Staged vision release does not match the configured inventory.",
    );
  }

  for (const { destination } of configuredAssets) {
    if ((await stat(join(directory, destination))).size === 0) {
      throw new Error(`Staged vision asset is empty: ${destination}`);
    }
  }
}

async function directoryExists(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

export async function vendorVisionRelease({
  fetchBytes: fetchRemoteBytes = fetchBytes,
  packageDirectory = defaultPackageDirectory,
  releaseDirectory = defaultReleaseDirectory,
  writeAtomically: writeAsset = writeAtomically,
} = {}) {
  const releaseParent = dirname(releaseDirectory);
  const releaseName = basename(releaseDirectory);
  const stagingDirectory = join(
    releaseParent,
    `.${releaseName}.staging-${randomUUID()}`,
  );
  let previousDirectory;

  try {
    await mkdir(stagingDirectory, { recursive: true });
    for (const asset of configuredAssets) {
      const destination = join(stagingDirectory, asset.destination);
      await mkdir(dirname(destination), { recursive: true });
      let bytes;
      if (asset.packagePath) {
        bytes = await readFile(join(packageDirectory, asset.packagePath));
      } else if (asset.destination === "NOTICE.txt") {
        bytes = Buffer.from(noticeText(), "utf8");
      } else {
        bytes = await fetchRemoteBytes(asset.source);
      }
      await writeAsset(destination, bytes);
    }
    await validateCompleteRelease(stagingDirectory);

    if (await directoryExists(releaseDirectory)) {
      previousDirectory = join(
        releaseParent,
        `.${releaseName}.previous-${randomUUID()}`,
      );
      await rename(releaseDirectory, previousDirectory);
      try {
        await rename(stagingDirectory, releaseDirectory);
      } catch (error) {
        await rename(previousDirectory, releaseDirectory);
        previousDirectory = undefined;
        throw error;
      }
      await rm(previousDirectory, { force: true, recursive: true });
      previousDirectory = undefined;
    } else {
      await rename(stagingDirectory, releaseDirectory);
    }
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

if (process.argv[1]?.endsWith("/vendor-vision-release.mjs")) {
  await vendorVisionRelease();
  console.log(`Vendored ${configuredAssets.length} vision release assets.`);
}
