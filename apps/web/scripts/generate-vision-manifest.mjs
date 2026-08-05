import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  configuredAssets,
  modelVersion,
  releaseDirectoryName,
  runtimeVersion,
} from "./vision-release.config.mjs";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));
const releaseDirectory = join(
  appDirectory,
  "public",
  "vision",
  releaseDirectoryName,
);
const manifestPath = join(
  appDirectory,
  "src",
  "vision",
  "generated",
  "release-manifest.json",
);

const manifestAssets = await Promise.all(
  configuredAssets.map(async (configured) => {
    const filePath = join(releaseDirectory, configured.destination);
    const [bytes, fileStat] = await Promise.all([
      readFile(filePath),
      stat(filePath),
    ]);
    return {
      bytes: fileStat.size,
      id: configured.role,
      licenseRef: configured.licenseRef,
      path: `/vision/${releaseDirectoryName}/${configured.destination}`,
      requiredForOffline: configured.requiredForOffline,
      role: configured.role,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source: configured.source,
      version: configured.version,
    };
  }),
);
manifestAssets.sort((left, right) =>
  left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
);

const canonicalManifest = {
  assets: manifestAssets,
  modelVersion,
  runtimeVersion,
  schemaVersion: 1,
};
const releaseId = createHash("sha256")
  .update(JSON.stringify(canonicalManifest, null, 2))
  .digest("hex")
  .slice(0, 16);
const manifest = { ...canonicalManifest, releaseId };
const output = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes("--check")) {
  let current;
  try {
    current = await readFile(manifestPath, "utf8");
  } catch {
    console.error(
      "Vision release manifest is missing. Run npm run vision:manifest.",
    );
    process.exitCode = 1;
  }
  if (current !== undefined && current !== output) {
    console.error(
      "Vision release manifest is out of date. Run npm run vision:manifest.",
    );
    process.exitCode = 1;
  }
} else {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, output);
}
