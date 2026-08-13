export type VisionAssetRole =
  | "wasm-loader-simd"
  | "wasm-binary-simd"
  | "wasm-loader-module-simd"
  | "wasm-binary-module-simd"
  | "wasm-loader-baseline"
  | "wasm-binary-baseline"
  | "face-landmarker-model"
  | "selfie-segmentation-model"
  | "license"
  | "notice"
  | "model-card-face-detector"
  | "model-card-face-mesh"
  | "model-card-blendshape";

export interface VisionAsset {
  bytes: number;
  id: string;
  licenseRef: string;
  path: string;
  requiredForOffline: boolean;
  role: VisionAssetRole;
  sha256: string;
  source: string;
  version: string;
}

export interface VisionReleaseManifest {
  schemaVersion: 1;
  releaseId: string;
  runtimeVersion: "0.10.35";
  modelVersion: "float16/1";
  assets: VisionAsset[];
}

export const VISION_RELEASE_PATH_PREFIX =
  "/vision/mediapipe-0.10.35-face-landmarker-float16-v1/";

const VISION_ASSET_ROLES: readonly VisionAssetRole[] = [
  "wasm-loader-simd",
  "wasm-binary-simd",
  "wasm-loader-module-simd",
  "wasm-binary-module-simd",
  "wasm-loader-baseline",
  "wasm-binary-baseline",
  "face-landmarker-model",
  "selfie-segmentation-model",
  "license",
  "notice",
  "model-card-face-detector",
  "model-card-face-mesh",
  "model-card-blendshape",
];

const ASSET_KEYS = [
  "bytes",
  "id",
  "licenseRef",
  "path",
  "requiredForOffline",
  "role",
  "sha256",
  "source",
  "version",
] as const;
const MANIFEST_KEYS = [
  "schemaVersion",
  "releaseId",
  "runtimeVersion",
  "modelVersion",
  "assets",
] as const;
const RELEASE_ID_PATTERN = /^[a-f0-9]{16}$/;
const ASSET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[A-Za-z0-9]+(?:[._/-][A-Za-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAME_ORIGIN = "https://vision.invalid";

function isExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }

  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    !ownKeys.every(
      (key) => typeof key === "string" && expectedKeys.includes(key),
    )
  ) {
    return false;
  }

  return expectedKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor;
  });
}

function isSameOriginPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return false;
  }

  try {
    const url = new URL(value, SAME_ORIGIN);
    return (
      url.origin === SAME_ORIGIN &&
      url.pathname === value &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isVisionReleasePath(value: unknown): value is string {
  return (
    isSameOriginPath(value) && value.startsWith(VISION_RELEASE_PATH_PREFIX)
  );
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && url.username === "" && url.password === ""
    );
  } catch {
    return false;
  }
}

function isVisionAssetRole(value: unknown): value is VisionAssetRole {
  return (
    typeof value === "string" &&
    VISION_ASSET_ROLES.includes(value as VisionAssetRole)
  );
}

function isVisionAsset(value: unknown): value is VisionAsset {
  return (
    isExactDataObject(value, ASSET_KEYS) &&
    typeof value.bytes === "number" &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0 &&
    typeof value.id === "string" &&
    ASSET_ID_PATTERN.test(value.id) &&
    isVisionReleasePath(value.licenseRef) &&
    isVisionReleasePath(value.path) &&
    typeof value.requiredForOffline === "boolean" &&
    isVisionAssetRole(value.role) &&
    typeof value.sha256 === "string" &&
    SHA256_PATTERN.test(value.sha256) &&
    isHttpsUrl(value.source) &&
    typeof value.version === "string" &&
    VERSION_PATTERN.test(value.version)
  );
}

function isValidManifest(value: unknown): value is VisionReleaseManifest {
  if (
    !isExactDataObject(value, MANIFEST_KEYS) ||
    value.schemaVersion !== 1 ||
    typeof value.releaseId !== "string" ||
    !RELEASE_ID_PATTERN.test(value.releaseId) ||
    value.runtimeVersion !== "0.10.35" ||
    value.modelVersion !== "float16/1" ||
    !Array.isArray(value.assets) ||
    value.assets.length === 0 ||
    !value.assets.every(isVisionAsset)
  ) {
    return false;
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  const roles = new Set<VisionAssetRole>();
  let previousPath = "";

  for (const asset of value.assets) {
    if (
      ids.has(asset.id) ||
      paths.has(asset.path) ||
      roles.has(asset.role) ||
      (previousPath !== "" && previousPath >= asset.path)
    ) {
      return false;
    }
    ids.add(asset.id);
    paths.add(asset.path);
    roles.add(asset.role);
    previousPath = asset.path;
  }

  return true;
}

export function parseVisionManifest(value: unknown): VisionReleaseManifest {
  if (!isValidManifest(value)) {
    throw new Error("Invalid vision manifest");
  }

  return value;
}

export function getAssetByRole(
  manifest: VisionReleaseManifest,
  role: VisionAssetRole,
): VisionAsset | undefined {
  return manifest.assets.find((asset) => asset.role === role);
}

export function visionManifestsEqual(
  actual: VisionReleaseManifest,
  expected: VisionReleaseManifest,
): boolean {
  if (
    actual.schemaVersion !== expected.schemaVersion ||
    actual.releaseId !== expected.releaseId ||
    actual.runtimeVersion !== expected.runtimeVersion ||
    actual.modelVersion !== expected.modelVersion ||
    actual.assets.length !== expected.assets.length
  ) {
    return false;
  }

  return actual.assets.every((asset, index) => {
    const expectedAsset = expected.assets[index];
    return (
      expectedAsset !== undefined &&
      asset.bytes === expectedAsset.bytes &&
      asset.id === expectedAsset.id &&
      asset.licenseRef === expectedAsset.licenseRef &&
      asset.path === expectedAsset.path &&
      asset.requiredForOffline === expectedAsset.requiredForOffline &&
      asset.role === expectedAsset.role &&
      asset.sha256 === expectedAsset.sha256 &&
      asset.source === expectedAsset.source &&
      asset.version === expectedAsset.version
    );
  });
}
