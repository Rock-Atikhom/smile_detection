export type VendorVisionReleaseOptions = {
  fetchBytes?: (source: string) => Promise<Buffer>;
  packageDirectory?: string;
  releaseDirectory?: string;
  writeAtomically?: (destination: string, bytes: Buffer) => Promise<void>;
};

export function vendorVisionRelease(
  options?: VendorVisionReleaseOptions,
): Promise<void>;
