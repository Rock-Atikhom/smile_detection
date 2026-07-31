/// <reference types="node" />

import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  configuredAssets,
  releaseDirectoryName,
} from "../../scripts/vision-release.config.mjs";
import {
  type VisionReleaseFileSystem,
  vendorVisionRelease,
} from "../../scripts/vendor-vision-release.mjs";

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

function fileSystem(
  overrides: Partial<VisionReleaseFileSystem> = {},
): VisionReleaseFileSystem {
  return {
    mkdir,
    readFile,
    readdir,
    rename,
    rm,
    stat,
    writeFile,
    ...overrides,
  };
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

  it("restores the prior complete release when staging-to-live promotion fails", async () => {
    const releaseDirectory = await completePreviousRelease();
    const previousContents = await releaseContents(releaseDirectory);
    const promotionError = new Error("simulated promotion failure");

    await expect(
      vendorVisionRelease({
        fetchBytes: async (source: string) => Buffer.from(`fetched:${source}`),
        fileSystem: fileSystem({
          rename: async (from, to) => {
            if (
              String(from).includes(`.${releaseDirectoryName}.staging-`) &&
              to === releaseDirectory
            ) {
              throw promotionError;
            }
            await rename(from, to);
          },
        }),
        releaseDirectory,
      }),
    ).rejects.toBe(promotionError);

    expect(await releaseContents(releaseDirectory)).toEqual(previousContents);
    expect(await readdir(join(releaseDirectory, ".."))).toEqual([
      releaseDirectoryName,
    ]);
  });

  it("preserves the complete backup and reports both errors when rollback fails", async () => {
    const releaseDirectory = await completePreviousRelease();
    const previousContents = await releaseContents(releaseDirectory);
    const promotionError = new Error("simulated promotion failure");
    const rollbackError = new Error("simulated rollback failure");
    let failedError: unknown;

    try {
      await vendorVisionRelease({
        fetchBytes: async (source: string) => Buffer.from(`fetched:${source}`),
        fileSystem: fileSystem({
          rename: async (from, to) => {
            if (
              String(from).includes(`.${releaseDirectoryName}.staging-`) &&
              to === releaseDirectory
            ) {
              throw promotionError;
            }
            if (
              String(from).includes(`.${releaseDirectoryName}.previous-`) &&
              to === releaseDirectory
            ) {
              throw rollbackError;
            }
            await rename(from, to);
          },
        }),
        releaseDirectory,
      });
    } catch (error) {
      failedError = error;
    }

    expect(failedError).toBeInstanceOf(AggregateError);
    const aggregate = failedError as AggregateError;
    expect(aggregate.cause).toBe(promotionError);
    expect(aggregate.errors).toEqual([promotionError, rollbackError]);
    expect(aggregate.message).toContain("Rollback");
    expect(aggregate.message).toContain("simulated promotion failure");
    expect(aggregate.message).toContain("simulated rollback failure");

    const parentDirectory = join(releaseDirectory, "..");
    const entries = await readdir(parentDirectory);
    const backupName = entries.find((entry) =>
      entry.startsWith(`.${basename(releaseDirectory)}.previous-`),
    );
    expect(backupName).toBeDefined();
    expect(entries).not.toContain(releaseDirectoryName);
    expect(await releaseContents(join(parentDirectory, backupName!))).toEqual(
      previousContents,
    );
    expect(entries.some((entry) => entry.includes(".staging-"))).toBe(false);
  });

  it("keeps a cleanup failure secondary to the original vending error", async () => {
    const releaseDirectory = await completePreviousRelease();
    const previousContents = await releaseContents(releaseDirectory);
    const fetchError = new Error("simulated fetch failure");
    const cleanupError = new Error("simulated staging cleanup failure");
    let failedError: unknown;

    try {
      await vendorVisionRelease({
        fetchBytes: async () => {
          throw fetchError;
        },
        fileSystem: fileSystem({
          rm: async (path, options) => {
            if (String(path).includes(".staging-")) {
              throw cleanupError;
            }
            await rm(path, options);
          },
        }),
        releaseDirectory,
      });
    } catch (error) {
      failedError = error;
    }

    expect(failedError).toBeInstanceOf(AggregateError);
    const aggregate = failedError as AggregateError;
    expect(aggregate.cause).toBe(fetchError);
    expect(aggregate.errors).toEqual([fetchError, cleanupError]);
    expect(aggregate.message).toContain("Cleanup");
    expect(aggregate.message).toContain("simulated fetch failure");
    expect(aggregate.message).toContain("simulated staging cleanup failure");
    expect(await releaseContents(releaseDirectory)).toEqual(previousContents);
    const entries = await readdir(join(releaseDirectory, ".."));
    expect(entries).toContain(releaseDirectoryName);
    expect(entries.some((entry) => entry.includes(".staging-"))).toBe(true);
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
