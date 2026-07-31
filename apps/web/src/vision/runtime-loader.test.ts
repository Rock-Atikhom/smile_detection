import type { FaceLandmarkerOptions } from "@mediapipe/tasks-vision";
import { describe, expect, it, vi } from "vitest";
import {
  prepareVisionRuntime,
  VisionRuntimeError,
  type VisionRuntimeDependencies,
} from "./runtime-loader";
import {
  VISION_RELEASE_PATH_PREFIX,
  type VisionAsset,
  type VisionAssetRole,
  type VisionReleaseManifest,
} from "./manifest";

const releaseId = "0123456789abcdef";
const manifestUrl = "/vision/release-manifest.json";
const assetBytes = {
  "face-landmarker-model": new Uint8Array([11, 12, 13]),
  "wasm-loader-baseline": new Uint8Array([21, 22, 23]),
  "wasm-binary-baseline": new Uint8Array([31, 32, 33]),
  "wasm-loader-simd": new Uint8Array([41, 42, 43]),
  "wasm-binary-simd": new Uint8Array([51, 52, 53]),
} satisfies Record<CriticalRole, Uint8Array>;

type CriticalRole = Extract<
  VisionAssetRole,
  | "face-landmarker-model"
  | "wasm-loader-baseline"
  | "wasm-binary-baseline"
  | "wasm-loader-simd"
  | "wasm-binary-simd"
>;

const paths: Record<CriticalRole, string> = {
  "face-landmarker-model": `${VISION_RELEASE_PATH_PREFIX}face_landmarker.task`,
  "wasm-loader-baseline": `${VISION_RELEASE_PATH_PREFIX}vision_wasm_nosimd_internal.js`,
  "wasm-binary-baseline": `${VISION_RELEASE_PATH_PREFIX}vision_wasm_nosimd_internal.wasm`,
  "wasm-loader-simd": `${VISION_RELEASE_PATH_PREFIX}vision_wasm_internal.js`,
  "wasm-binary-simd": `${VISION_RELEASE_PATH_PREFIX}vision_wasm_internal.wasm`,
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function createManifest(): Promise<VisionReleaseManifest> {
  const assets = await Promise.all(
    (Object.keys(assetBytes) as CriticalRole[]).map(
      async (role): Promise<VisionAsset> => ({
        bytes: assetBytes[role].byteLength,
        id: role,
        licenseRef: `${VISION_RELEASE_PATH_PREFIX}LICENSE-MediaPipe.txt`,
        path: paths[role],
        requiredForOffline: true,
        role,
        sha256: await sha256(assetBytes[role]),
        source: `https://example.test/${role}`,
        version: role === "face-landmarker-model" ? "float16/1" : "0.10.35",
      }),
    ),
  );

  return {
    assets: assets.sort((left, right) => left.path.localeCompare(right.path)),
    modelVersion: "float16/1",
    releaseId,
    runtimeVersion: "0.10.35",
    schemaVersion: 1,
  };
}

async function createDependencies(options?: {
  supportsSimd?: boolean;
  responseBytes?: Partial<Record<CriticalRole, Uint8Array>>;
}): Promise<{
  dependencies: VisionRuntimeDependencies;
  createLandmarker: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
}> {
  const manifest = await createManifest();
  const byPath = new Map(manifest.assets.map((asset) => [asset.path, asset]));
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === manifestUrl) {
      return Response.json(manifest);
    }
    const asset = byPath.get(url);
    if (asset === undefined) {
      return new Response(null, { status: 404 });
    }
    const role = asset.role as CriticalRole;
    return new Response(
      Uint8Array.from(options?.responseBytes?.[role] ?? assetBytes[role])
        .buffer,
    );
  });
  const createLandmarker = vi.fn(async () => ({ close: vi.fn() }));

  return {
    createLandmarker,
    dependencies: {
      createLandmarker,
      fetch,
      supportsSimd: () => options?.supportsSimd ?? true,
    },
    fetch,
  };
}

function prepare(
  dependencies: VisionRuntimeDependencies,
  signal = new AbortController().signal,
  onPhase: (phase: "verifying" | "initializing") => void = vi.fn(),
) {
  return prepareVisionRuntime(
    { manifestUrl, onPhase, releaseId, signal },
    dependencies,
  );
}

describe("prepareVisionRuntime", () => {
  it("constructs exactly one CPU video Face Landmarker from verified SIMD assets", async () => {
    const { createLandmarker, dependencies } = await createDependencies();
    const onPhase = vi.fn();

    const result = await prepare(
      dependencies,
      new AbortController().signal,
      onPhase,
    );

    expect(createLandmarker).toHaveBeenCalledWith(
      {
        wasmBinaryPath: paths["wasm-binary-simd"],
        wasmLoaderPath: paths["wasm-loader-simd"],
      },
      expect.objectContaining({
        baseOptions: expect.objectContaining({ delegate: "CPU" }),
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        runningMode: "VIDEO",
      }),
    );
    expect(result.wasmTier).toBe("simd");
    expect(createLandmarker).toHaveBeenCalledTimes(1);
    const options = createLandmarker.mock.calls[0]?.[1] as
      FaceLandmarkerOptions | undefined;
    expect(options?.baseOptions?.modelAssetBuffer).toEqual(
      assetBytes["face-landmarker-model"],
    );
    expect(options?.baseOptions).not.toHaveProperty("modelAssetPath");
    expect(options?.baseOptions).not.toHaveProperty("delegate", "GPU");
    expect(onPhase.mock.calls).toEqual([["verifying"], ["initializing"]]);
  });

  it("verifies every selected critical response before construction", async () => {
    const { createLandmarker, dependencies } = await createDependencies({
      responseBytes: { "wasm-binary-simd": new Uint8Array([99]) },
    });

    await expect(prepare(dependencies)).rejects.toMatchObject({
      code: "runtime-integrity-failed",
    });
    expect(createLandmarker).not.toHaveBeenCalled();
  });

  it("retries baseline exactly once when SIMD construction fails", async () => {
    const { createLandmarker, dependencies } = await createDependencies();
    createLandmarker
      .mockRejectedValueOnce(new Error("SIMD unavailable"))
      .mockResolvedValueOnce({ close: vi.fn() });

    const result = await prepare(dependencies);

    expect(result.wasmTier).toBe("baseline");
    expect(createLandmarker).toHaveBeenCalledTimes(2);
    expect(createLandmarker.mock.calls[1]?.[0]).toEqual({
      wasmBinaryPath: paths["wasm-binary-baseline"],
      wasmLoaderPath: paths["wasm-loader-baseline"],
    });
  });

  it("uses baseline once without attempting SIMD when the capability probe fails", async () => {
    const { createLandmarker, dependencies } = await createDependencies({
      supportsSimd: false,
    });

    const result = await prepare(dependencies);

    expect(result.wasmTier).toBe("baseline");
    expect(createLandmarker).toHaveBeenCalledTimes(1);
    expect(createLandmarker.mock.calls[0]?.[0]).toEqual({
      wasmBinaryPath: paths["wasm-binary-baseline"],
      wasmLoaderPath: paths["wasm-loader-baseline"],
    });
  });

  it("never retries after an integrity failure", async () => {
    const { createLandmarker, dependencies, fetch } = await createDependencies({
      responseBytes: { "wasm-loader-simd": new Uint8Array([0]) },
    });

    await expect(prepare(dependencies)).rejects.toMatchObject({
      code: "runtime-integrity-failed",
    });
    expect(createLandmarker).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalledWith(
      paths["wasm-loader-baseline"],
      expect.anything(),
    );
  });

  it("maps request failures without exposing their raw exception", async () => {
    const { dependencies } = await createDependencies();
    dependencies.fetch = vi.fn().mockRejectedValue(new Error("private URL"));

    await expect(prepare(dependencies)).rejects.toEqual(
      expect.objectContaining({ code: "runtime-download-failed" }),
    );
    await expect(prepare(dependencies)).rejects.not.toThrow("private URL");
  });

  it("maps exhausted construction attempts to a safe initialization error", async () => {
    const { createLandmarker, dependencies } = await createDependencies();
    createLandmarker.mockRejectedValue(new Error("private upstream details"));
    const pending = prepare(dependencies);

    await expect(pending).rejects.toEqual(
      expect.objectContaining({ code: "runtime-initialization-failed" }),
    );
    await expect(pending).rejects.not.toThrow("private upstream details");
    expect(createLandmarker).toHaveBeenCalledTimes(2);
  });

  it("closes an instance that finishes construction after cancellation", async () => {
    const { createLandmarker, dependencies } = await createDependencies();
    let resolveLandmarker!: (value: { close(): void }) => void;
    const construction = new Promise<{ close(): void }>((resolve) => {
      resolveLandmarker = resolve;
    });
    const close = vi.fn();
    createLandmarker.mockReturnValue(construction);
    const controller = new AbortController();

    const pending = prepare(dependencies, controller.signal);
    await vi.waitFor(() => expect(createLandmarker).toHaveBeenCalledOnce());
    controller.abort();
    resolveLandmarker({ close });

    await expect(pending).rejects.toMatchObject({
      code: "runtime-cancelled",
    });
    expect(close).toHaveBeenCalledOnce();
    expect(createLandmarker).toHaveBeenCalledOnce();
  });

  it("closes the prepared instance idempotently without exposing upstream errors", async () => {
    const { createLandmarker, dependencies } = await createDependencies();
    const close = vi.fn(() => {
      throw new Error("private close details");
    });
    createLandmarker.mockResolvedValue({ close });
    const result = await prepare(dependencies);

    expect(() => {
      result.close();
      result.close();
    }).not.toThrow();

    expect(close).toHaveBeenCalledOnce();
  });

  it("uses a dedicated safe error without a raw stack", () => {
    const error = new VisionRuntimeError("runtime-initialization-failed");

    expect(error.message).toBe("Vision runtime failed");
    expect(error.stack).toBeUndefined();
  });
});
