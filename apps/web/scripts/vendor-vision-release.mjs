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
const defaultFileSystem = {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
};

function noticeText() {
  return `Smart Smile vendored vision release notice\n\nThis release includes MediaPipe Tasks Vision ${runtimeVersion}, the Face Landmarker model ${modelVersion}, and the MediaPipe Selfie Segmenter model, provided by Google LLC.\n\nMediaPipe Tasks Vision package provenance:\nhttps://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-${runtimeVersion}.tgz\nhttps://github.com/google-ai-edge/mediapipe/tree/v${runtimeVersion}\n\nFace Landmarker model source:\nhttps://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task\n\nSelfie Segmenter model source:\nhttps://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite\n\nModel-card sources:\nhttps://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf\nhttps://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf\nhttps://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf\n\nLicense:\nLICENSE-MediaPipe.txt\nhttps://raw.githubusercontent.com/google-ai-edge/mediapipe/v${runtimeVersion}/LICENSE\n`;
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function writeAtomically(destination, bytes, fileSystem) {
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  await fileSystem.writeFile(temporary, bytes);
  await fileSystem.rename(temporary, destination);
}

async function filesIn(directory, fileSystem, prefix = "") {
  const entries = await fileSystem.readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = `${prefix}${entry.name}`;
      return entry.isDirectory()
        ? filesIn(join(directory, entry.name), fileSystem, `${path}/`)
        : [path];
    }),
  );
  return paths.flat().sort();
}

async function validateCompleteRelease(directory, fileSystem) {
  const expectedPaths = configuredAssets
    .map(({ destination }) => destination)
    .sort();
  const actualPaths = await filesIn(directory, fileSystem);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      "Staged vision release does not match the configured inventory.",
    );
  }

  for (const { destination } of configuredAssets) {
    if ((await fileSystem.stat(join(directory, destination))).size === 0) {
      throw new Error(`Staged vision asset is empty: ${destination}`);
    }
  }
}

async function directoryExists(directory, fileSystem) {
  try {
    return (await fileSystem.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function withSecondaryFailure(primaryError, secondaryError, operation) {
  const primaryCause =
    primaryError instanceof AggregateError && primaryError.cause
      ? primaryError.cause
      : primaryError;
  return new AggregateError(
    [primaryError, secondaryError],
    `${operation} failed after primary vending error "${errorMessage(primaryCause)}": ${errorMessage(secondaryError)}`,
    { cause: primaryCause },
  );
}

export async function vendorVisionRelease({
  fetchBytes: fetchRemoteBytes = fetchBytes,
  packageDirectory = defaultPackageDirectory,
  releaseDirectory = defaultReleaseDirectory,
  fileSystem = defaultFileSystem,
  writeAtomically: configuredWriteAsset,
} = {}) {
  const writeAsset =
    configuredWriteAsset ??
    ((destination, bytes) => writeAtomically(destination, bytes, fileSystem));
  const releaseParent = dirname(releaseDirectory);
  const releaseName = basename(releaseDirectory);
  const stagingDirectory = join(
    releaseParent,
    `.${releaseName}.staging-${randomUUID()}`,
  );
  let previousDirectory;

  try {
    await fileSystem.mkdir(stagingDirectory, { recursive: true });
    for (const asset of configuredAssets) {
      const destination = join(stagingDirectory, asset.destination);
      await fileSystem.mkdir(dirname(destination), { recursive: true });
      let bytes;
      if (asset.packagePath) {
        bytes = await fileSystem.readFile(
          join(packageDirectory, asset.packagePath),
        );
      } else if (asset.destination === "NOTICE.txt") {
        bytes = Buffer.from(noticeText(), "utf8");
      } else {
        bytes = await fetchRemoteBytes(asset.source);
      }
      await writeAsset(destination, bytes);
    }
    await validateCompleteRelease(stagingDirectory, fileSystem);

    if (await directoryExists(releaseDirectory, fileSystem)) {
      previousDirectory = join(
        releaseParent,
        `.${releaseName}.previous-${randomUUID()}`,
      );
      await fileSystem.rename(releaseDirectory, previousDirectory);
      try {
        await fileSystem.rename(stagingDirectory, releaseDirectory);
      } catch (promotionError) {
        try {
          await fileSystem.rename(previousDirectory, releaseDirectory);
          previousDirectory = undefined;
        } catch (rollbackError) {
          throw withSecondaryFailure(
            promotionError,
            rollbackError,
            "Rollback of the previous complete vision release",
          );
        }
        throw promotionError;
      }
      await fileSystem.rm(previousDirectory, { force: true, recursive: true });
      previousDirectory = undefined;
    } else {
      await fileSystem.rename(stagingDirectory, releaseDirectory);
    }
  } catch (error) {
    try {
      await fileSystem.rm(stagingDirectory, { force: true, recursive: true });
    } catch (cleanupError) {
      throw withSecondaryFailure(
        error,
        cleanupError,
        "Cleanup of the incomplete staged vision release",
      );
    }
    throw error;
  }
}

if (process.argv[1]?.endsWith("/vendor-vision-release.mjs")) {
  await vendorVisionRelease();
  console.log(`Vendored ${configuredAssets.length} vision release assets.`);
}
