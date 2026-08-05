export type VisionReleaseFileSystem = {
  mkdir: typeof import("node:fs/promises").mkdir;
  readFile: typeof import("node:fs/promises").readFile;
  readdir: typeof import("node:fs/promises").readdir;
  rename: typeof import("node:fs/promises").rename;
  rm: typeof import("node:fs/promises").rm;
  stat: typeof import("node:fs/promises").stat;
  writeFile: typeof import("node:fs/promises").writeFile;
};

export type VendorVisionReleaseOptions = {
  fetchBytes?: (source: string) => Promise<Buffer>;
  fileSystem?: VisionReleaseFileSystem;
  packageDirectory?: string;
  releaseDirectory?: string;
  writeAtomically?: (destination: string, bytes: Buffer) => Promise<void>;
};

export function vendorVisionRelease(
  options?: VendorVisionReleaseOptions,
): Promise<void>;
