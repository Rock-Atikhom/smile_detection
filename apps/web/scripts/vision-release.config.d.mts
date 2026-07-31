export type VisionReleaseAsset = {
  destination: string;
  licenseRef: string;
  packagePath?: string;
  requiredForOffline: boolean;
  role: string;
  source: string;
  version: string;
};

export const releaseDirectoryName: string;
export const runtimeVersion: string;
export const modelVersion: string;
export const packageSource: string;
export const licenseRef: string;
export const assets: VisionReleaseAsset[];
export const remoteAssets: VisionReleaseAsset[];
export const noticeAsset: VisionReleaseAsset;
export const configuredAssets: VisionReleaseAsset[];
