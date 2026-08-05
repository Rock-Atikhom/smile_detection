export const releaseDirectoryName =
  "mediapipe-0.10.35-face-landmarker-float16-v1";
export const runtimeVersion = "0.10.35";
export const modelVersion = "float16/1";
export const packageSource =
  "https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz";

export const licenseRef =
  "/vision/mediapipe-0.10.35-face-landmarker-float16-v1/LICENSE-MediaPipe.txt";

const packageAsset = (destination, packagePath, role) => ({
  destination,
  licenseRef,
  packagePath,
  requiredForOffline: true,
  role,
  source: packageSource,
  version: runtimeVersion,
});

export const assets = [
  packageAsset(
    "vision_wasm_internal.js",
    "wasm/vision_wasm_internal.js",
    "wasm-loader-simd",
  ),
  packageAsset(
    "vision_wasm_internal.wasm",
    "wasm/vision_wasm_internal.wasm",
    "wasm-binary-simd",
  ),
  packageAsset(
    "vision_wasm_module_internal.js",
    "wasm/vision_wasm_module_internal.js",
    "wasm-loader-module-simd",
  ),
  packageAsset(
    "vision_wasm_module_internal.wasm",
    "wasm/vision_wasm_module_internal.wasm",
    "wasm-binary-module-simd",
  ),
  packageAsset(
    "vision_wasm_nosimd_internal.js",
    "wasm/vision_wasm_nosimd_internal.js",
    "wasm-loader-baseline",
  ),
  packageAsset(
    "vision_wasm_nosimd_internal.wasm",
    "wasm/vision_wasm_nosimd_internal.wasm",
    "wasm-binary-baseline",
  ),
];

export const remoteAssets = [
  {
    destination: "face_landmarker.task",
    licenseRef,
    requiredForOffline: true,
    role: "face-landmarker-model",
    source:
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    version: modelVersion,
  },
  {
    destination: "LICENSE-MediaPipe.txt",
    licenseRef,
    requiredForOffline: true,
    role: "license",
    source:
      "https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.35/LICENSE",
    version: runtimeVersion,
  },
  {
    destination: "model-card-blazeface-short-range.pdf",
    licenseRef,
    requiredForOffline: true,
    role: "model-card-face-detector",
    source:
      "https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf",
    version: runtimeVersion,
  },
  {
    destination: "model-card-face-mesh-v2.pdf",
    licenseRef,
    requiredForOffline: true,
    role: "model-card-face-mesh",
    source:
      "https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf",
    version: runtimeVersion,
  },
  {
    destination: "model-card-blendshape-v2.pdf",
    licenseRef,
    requiredForOffline: true,
    role: "model-card-blendshape",
    source:
      "https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf",
    version: runtimeVersion,
  },
];

export const noticeAsset = {
  destination: "NOTICE.txt",
  licenseRef,
  requiredForOffline: true,
  role: "notice",
  source: "https://github.com/google-ai-edge/mediapipe/tree/v0.10.35",
  version: runtimeVersion,
};

export const configuredAssets = [...assets, ...remoteAssets, noticeAsset];
