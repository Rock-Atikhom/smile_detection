/// <reference types="node" />

import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  configuredAssets,
  releaseDirectoryName,
} from "../../scripts/vision-release.config.mjs";
import { vendorVisionRelease } from "../../scripts/vendor-vision-release.mjs";

const temporaryDirectories: string[] = [];

async function completePreviousRelease() {
  const directory = await mkdtemp(join(tmpdir(), "smart-smile-vision-vendor-"));
  temporaryDirectories.push(directory);
  const releaseDirectory = join(directory, releaseDirectoryName);
  await mkdir(releaseDirectory);
  await Promise.all(
    configuredAssets.map((asset) =>
      writeFile(
        join(releaseDirectory, asset.destination),
        `previous:${asset.destination}`,
      ),
    ),
  );
  return releaseDirectory;
}

async function releaseContents(releaseDirectory: string) {
  return Promise.all(
    configuredAssets.map(async ({ destination }) => [
      destination,
      await readFile(join(releaseDirectory, destination)),
    ]),
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("vision release vendor promotion", () => {
  it("keeps the prior complete release and removes staging when a fetch fails", async () => {
    const releaseDirectory = await completePreviousRelease();
    const previousContents = await releaseContents(releaseDirectory);

    await expect(
      vendorVisionRelease({
        fetchBytes: async () => {
          throw new Error("simulated fetch failure");
        },
        releaseDirectory,
      }),
    ).rejects.toThrow("simulated fetch failure");

    expect(await releaseContents(releaseDirectory)).toEqual(previousContents);
    expect(await readdir(join(releaseDirectory, ".."))).toEqual([
      releaseDirectoryName,
    ]);
  });

  it("keeps the prior complete release and removes staging when a write fails", async () => {
    const releaseDirectory = await completePreviousRelease();
    const previousContents = await releaseContents(releaseDirectory);

    await expect(
      vendorVisionRelease({
        fetchBytes: async (source: string) => Buffer.from(`fetched:${source}`),
        releaseDirectory,
        writeAtomically: async () => {
          throw new Error("simulated write failure");
        },
      }),
    ).rejects.toThrow("simulated write failure");

    expect(await releaseContents(releaseDirectory)).toEqual(previousContents);
    expect(await readdir(join(releaseDirectory, ".."))).toEqual([
      releaseDirectoryName,
    ]);
  });

  it("promotes a fully staged replacement and removes temporary siblings", async () => {
    const releaseDirectory = await completePreviousRelease();

    await vendorVisionRelease({
      fetchBytes: async (source: string) => Buffer.from(`fetched:${source}`),
      releaseDirectory,
    });

    const filenames = (await readdir(releaseDirectory)).sort();
    expect(filenames).toEqual(
      configuredAssets.map(({ destination }) => destination).sort(),
    );
    expect(
      await readFile(join(releaseDirectory, "face_landmarker.task"), "utf8"),
    ).toBe(
      `fetched:${configuredAssets.find(({ destination }) => destination === "face_landmarker.task")?.source}`,
    );
    expect(await readdir(join(releaseDirectory, ".."))).toEqual([
      releaseDirectoryName,
    ]);
  });
});
