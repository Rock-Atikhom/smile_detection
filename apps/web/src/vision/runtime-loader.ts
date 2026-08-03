import { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { FaceLandmarkerOptions } from "@mediapipe/tasks-vision";
import {
  verifyVisionResponse,
  VisionAssetError,
  VisionAssetOperationalError,
} from "./integrity";
import {
  getAssetByRole,
  parseVisionManifest,
  visionManifestsEqual,
  type VisionAsset,
  type VisionAssetRole,
  type VisionReleaseManifest,
} from "./manifest";
import type { VisionReason } from "./protocol";
import { VISION_MANIFEST } from "./release";

type WasmFileset = Parameters<typeof FaceLandmarker.createFromOptions>[0];
type RuntimeFailureCode = Extract<
  VisionReason,
  | "runtime-download-failed"
  | "runtime-integrity-failed"
  | "runtime-initialization-failed"
  | "runtime-cancelled"
  | "offline-cache-failed"
>;
type WasmTier = "simd" | "baseline";

export interface VisionRuntimeDependencies {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  manifest: VisionReleaseManifest;
  supportsSimd(): boolean;
  createLandmarker(
    fileset: WasmFileset,
    options: FaceLandmarkerOptions,
  ): Promise<Pick<FaceLandmarker, "close">>;
}

export interface PrepareVisionRuntimeInput {
  manifestUrl: string;
  releaseId: string;
  signal: AbortSignal;
  onPhase(phase: "verifying" | "initializing"): void;
}

export interface PreparedVisionRuntime {
  wasmTier: WasmTier;
  close(): void;
}

export class VisionRuntimeError extends Error {
  readonly code: RuntimeFailureCode;

  constructor(code: RuntimeFailureCode) {
    super("Vision runtime failed");
    Object.defineProperty(this, "name", {
      configurable: false,
      enumerable: false,
      value: "VisionRuntimeError",
      writable: false,
    });
    Object.defineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      value: undefined,
      writable: false,
    });
    this.code = code;
  }
}

const SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00,
  0x00, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x41, 0x00, 0xfd,
  0x0f, 0x1a, 0x0b,
]);

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new VisionRuntimeError("runtime-cancelled");
  }
}

function closeLandmarker(landmarker: Pick<FaceLandmarker, "close">): void {
  try {
    landmarker.close();
  } catch {
    // Upstream cleanup details stay inside the worker boundary.
  }
}

function isUnsupportedSimdRuntimeError(error: unknown): boolean {
  return (
    error instanceof WebAssembly.CompileError ||
    error instanceof WebAssembly.LinkError ||
    (error instanceof DOMException && error.name === "NotSupportedError")
  );
}

async function fetchResponse(
  url: string,
  signal: AbortSignal,
  dependencies: VisionRuntimeDependencies,
): Promise<Response> {
  try {
    return await dependencies.fetch(url, { signal });
  } catch {
    throwIfCancelled(signal);
    throw new VisionRuntimeError("runtime-download-failed");
  }
}

async function loadManifest(
  input: PrepareVisionRuntimeInput,
  dependencies: VisionRuntimeDependencies,
) {
  if (input.releaseId !== dependencies.manifest.releaseId) {
    throw new VisionRuntimeError("runtime-integrity-failed");
  }
  const response = await fetchResponse(
    input.manifestUrl,
    input.signal,
    dependencies,
  );
  throwIfCancelled(input.signal);
  if (!response.ok) {
    throw new VisionRuntimeError("runtime-download-failed");
  }

  let manifestValue: unknown;
  try {
    manifestValue = await response.json();
  } catch (error) {
    throwIfCancelled(input.signal);
    throw new VisionRuntimeError(
      error instanceof SyntaxError
        ? "runtime-integrity-failed"
        : "offline-cache-failed",
    );
  }

  try {
    const manifest = parseVisionManifest(manifestValue);
    throwIfCancelled(input.signal);
    if (
      manifest.releaseId !== input.releaseId ||
      !visionManifestsEqual(manifest, dependencies.manifest)
    ) {
      throw new VisionRuntimeError("runtime-integrity-failed");
    }
    return manifest;
  } catch (error) {
    if (error instanceof VisionRuntimeError) {
      throw error;
    }
    throwIfCancelled(input.signal);
    throw new VisionRuntimeError("runtime-integrity-failed");
  }
}

function requireAsset(
  manifest: ReturnType<typeof parseVisionManifest>,
  role: VisionAssetRole,
): VisionAsset {
  const asset = getAssetByRole(manifest, role);
  if (asset === undefined) {
    throw new VisionRuntimeError("runtime-integrity-failed");
  }
  return asset;
}

async function loadVerifiedAsset(
  asset: VisionAsset,
  signal: AbortSignal,
  dependencies: VisionRuntimeDependencies,
): Promise<Uint8Array> {
  const response = await fetchResponse(asset.path, signal, dependencies);
  throwIfCancelled(signal);
  try {
    const bytes = await verifyVisionResponse(response, asset);
    throwIfCancelled(signal);
    return bytes;
  } catch (error) {
    if (error instanceof VisionAssetOperationalError) {
      throw new VisionRuntimeError("offline-cache-failed");
    }
    if (error instanceof VisionAssetError) {
      throw new VisionRuntimeError(
        error.code === "runtime-download-failed"
          ? "runtime-download-failed"
          : "runtime-integrity-failed",
      );
    }
    if (error instanceof VisionRuntimeError) {
      throw error;
    }
    throwIfCancelled(signal);
    throw new VisionRuntimeError("runtime-integrity-failed");
  }
}

function rolesForTier(tier: WasmTier): {
  binary: VisionAssetRole;
  loader: VisionAssetRole;
} {
  return tier === "simd"
    ? { binary: "wasm-binary-simd", loader: "wasm-loader-simd" }
    : {
        binary: "wasm-binary-baseline",
        loader: "wasm-loader-baseline",
      };
}

async function constructTier(
  tier: WasmTier,
  manifest: ReturnType<typeof parseVisionManifest>,
  modelAssetBuffer: Uint8Array,
  input: PrepareVisionRuntimeInput,
  dependencies: VisionRuntimeDependencies,
): Promise<PreparedVisionRuntime> {
  const roles = rolesForTier(tier);
  const loader = requireAsset(manifest, roles.loader);
  const binary = requireAsset(manifest, roles.binary);
  await Promise.all([
    loadVerifiedAsset(loader, input.signal, dependencies),
    loadVerifiedAsset(binary, input.signal, dependencies),
  ]);
  throwIfCancelled(input.signal);

  const fileset: WasmFileset = {
    wasmBinaryPath: binary.path,
    wasmLoaderPath: loader.path,
  };
  const options: FaceLandmarkerOptions = {
    baseOptions: { delegate: "CPU", modelAssetBuffer },
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
    runningMode: "VIDEO",
  };

  input.onPhase("initializing");
  const landmarker = await dependencies.createLandmarker(fileset, options);
  if (input.signal.aborted) {
    closeLandmarker(landmarker);
    throw new VisionRuntimeError("runtime-cancelled");
  }

  let closed = false;
  return {
    close() {
      if (!closed) {
        closed = true;
        closeLandmarker(landmarker);
      }
    },
    wasmTier: tier,
  };
}

export async function prepareVisionRuntime(
  input: PrepareVisionRuntimeInput,
  dependencies: VisionRuntimeDependencies,
): Promise<PreparedVisionRuntime> {
  throwIfCancelled(input.signal);
  input.onPhase("verifying");
  const manifest = await loadManifest(input, dependencies);
  const model = requireAsset(manifest, "face-landmarker-model");
  const modelAssetBuffer = await loadVerifiedAsset(
    model,
    input.signal,
    dependencies,
  );
  throwIfCancelled(input.signal);

  let supportsSimd: boolean;
  try {
    supportsSimd = dependencies.supportsSimd();
  } catch {
    supportsSimd = false;
  }

  if (supportsSimd) {
    try {
      return await constructTier(
        "simd",
        manifest,
        modelAssetBuffer,
        input,
        dependencies,
      );
    } catch (error) {
      if (error instanceof VisionRuntimeError) {
        throw error;
      }
      throwIfCancelled(input.signal);
      if (!isUnsupportedSimdRuntimeError(error)) {
        throw new VisionRuntimeError("runtime-initialization-failed");
      }
    }
    input.onPhase("verifying");
  }

  try {
    return await constructTier(
      "baseline",
      manifest,
      modelAssetBuffer,
      input,
      dependencies,
    );
  } catch (error) {
    if (error instanceof VisionRuntimeError) {
      throw error;
    }
    throwIfCancelled(input.signal);
    throw new VisionRuntimeError("runtime-initialization-failed");
  }
}

export function createBrowserVisionDependencies(): VisionRuntimeDependencies {
  return {
    createLandmarker: (fileset, options) =>
      FaceLandmarker.createFromOptions(fileset, options),
    fetch: (input, init) => globalThis.fetch(input, init),
    manifest: VISION_MANIFEST,
    supportsSimd: () => WebAssembly.validate(SIMD_PROBE),
  };
}
