/// <reference types="node" />

import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("vision release manifest diagnostics", () => {
  it("explains fresh-clone recovery for release files left as CRLF by an older Windows checkout", async () => {
    const webDirectory = await mkdtemp(
      join(tmpdir(), "smart-smile-manifest-check-"),
    );
    temporaryDirectories.push(webDirectory);

    const scriptsDirectory = join(webDirectory, "scripts");
    const releaseDirectory = join(webDirectory, "public", "vision", "test");
    await Promise.all([
      mkdir(scriptsDirectory, { recursive: true }),
      mkdir(releaseDirectory, { recursive: true }),
    ]);
    await copyFile(
      join(process.cwd(), "scripts", "generate-vision-manifest.mjs"),
      join(scriptsDirectory, "generate-vision-manifest.mjs"),
    );
    await writeFile(
      join(scriptsDirectory, "vision-release.config.mjs"),
      `export const configuredAssets = [{
  destination: "runtime.js",
  licenseRef: "/vision/test/LICENSE.txt",
  requiredForOffline: true,
  role: "runtime",
  source: "https://example.test/runtime.js",
  version: "1.0.0",
}];
export const modelVersion = "test-model";
export const releaseDirectoryName = "test";
export const runtimeVersion = "1.0.0";
`,
    );

    const runtimePath = join(releaseDirectory, "runtime.js");
    const manifestPath = join(
      webDirectory,
      "src",
      "vision",
      "generated",
      "release-manifest.json",
    );
    await writeFile(runtimePath, "const ready = true;\n");

    const generate = spawnSync(
      process.execPath,
      [join(scriptsDirectory, "generate-vision-manifest.mjs")],
      { encoding: "utf8" },
    );
    expect(generate.status).toBe(0);

    await Promise.all([
      writeFile(
        runtimePath,
        (await readFile(runtimePath, "utf8")).replaceAll("\n", "\r\n"),
      ),
      writeFile(
        manifestPath,
        (await readFile(manifestPath, "utf8")).replaceAll("\n", "\r\n"),
      ),
    ]);

    const check = spawnSync(
      process.execPath,
      [join(scriptsDirectory, "generate-vision-manifest.mjs"), "--check"],
      { encoding: "utf8" },
    );

    expect(check.status).toBe(1);
    expect(check.stderr).toContain("older Windows checkout");
    expect(check.stderr).toContain("fresh clone");
    expect(check.stderr).not.toContain("Run npm run vision:manifest");
  });
});
