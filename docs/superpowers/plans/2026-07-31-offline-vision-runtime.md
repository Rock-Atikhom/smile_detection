# Offline Vision Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the exact verified MediaPipe Face Landmarker runtime in a classic worker, with atomic offline caching and accessible recovery, without processing camera frames in Ticket 03.

**Architecture:** A main-thread coordinator owns generations and semantic state, one Vite-bundled classic worker owns runtime verification and the single Face Landmarker, and an injected Workbox service worker owns the shell and versioned vision caches. A checked-in deterministic manifest ties every vendored runtime, model, license, notice, and model-card byte to its source, size, and SHA-256.

**Tech Stack:** React 19, TypeScript 6, Vite 8 classic workers, `@mediapipe/tasks-vision@0.10.35`, `vite-plugin-pwa@1.3.0`, Workbox 7.4.1, Vitest 4, Playwright 1.62, Cloudflare Pages.

## Global Constraints

- Pin `@mediapipe/tasks-vision` to exact version `0.10.35`; do not use `1.x`.
- Pin `vite-plugin-pwa` to `1.3.0` and every directly imported Workbox package to `7.4.1`.
- Self-host all executable, WASM, model, license, notice, and model-card assets on the application origin under `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/`.
- Begin large vision downloads only after **Continue to camera**; initial load may register and populate only the small application-shell cache.
- Use exactly one Vite-bundled classic worker and exactly one Face Landmarker instance.
- Prefer WASM SIMD and retry ordinary WASM once only for an allowlisted unsupported-runtime failure; never use WebGPU.
- Configure Face Landmarker with `runningMode: "VIDEO"`, `numFaces: 1`, CPU/WASM execution, blendshape output enabled, and transformation matrices disabled.
- Ticket 03 must not submit camera frames or expose landmarks, blendshapes, boxes, matrices, smile scores, guidance, captures, or diagnostics containing participant evidence.
- Never persist photos, frames, Blobs, object URLs, landmarks, geometry, scores, raw errors, device labels, device IDs, or persistent participant identifiers.
- Add only `worker-src 'self'` and `'wasm-unsafe-eval'`; never add `'unsafe-eval'`, CDN origins, broad `blob:` workers, or `data:` workers.
- Preserve the established 48 CSS-pixel targets, focus order, contrast, zoom reflow, reduced motion, camera switching, privacy copy, and one polite atomic live region.
- Keep the last complete vision cache if a new release fails; an incomplete cache is never usable and must be deleted.
- Ticket 03 ends at verified initialization and offline reopen. Frame submission begins in Ticket 04.

---

## Planned File Structure

### Supply chain and generated release data

- `apps/web/scripts/vision-release.config.mjs` — the only hand-maintained inventory of upstream sources, versions, roles, and notice relationships.
- `apps/web/scripts/vendor-vision-release.mjs` — copies pinned npm files and downloads the fixed official model/document files into the immutable release directory.
- `apps/web/scripts/generate-vision-manifest.mjs` — scans the exact inventory, computes size/SHA-256/release ID, writes stable JSON, and supports check-only CI mode.
- `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/` — committed immutable runtime, WASM, model, license, notice, and model-card bytes.
- `apps/web/src/vision/generated/release-manifest.json` — checked-in canonical manifest emitted as a hashed shell asset by Vite.

### Runtime ownership

- `apps/web/src/vision/manifest.ts` — runtime validation of the generated manifest and safe asset lookup.
- `apps/web/src/vision/integrity.ts` — exact byte-count and SHA-256 verification.
- `apps/web/src/vision/protocol.ts` — worker/service-worker message unions and runtime guards.
- `apps/web/src/vision/runtime-loader.ts` — capability selection, verified asset loading, MediaPipe construction, and close semantics.
- `apps/web/src/vision/worker-runtime.ts` — testable generation-aware worker message handler.
- `apps/web/src/vision/worker.ts` — side-effect-only classic worker entry.
- `apps/web/src/vision/coordinator.ts` — main-thread generation, cancellation, worker, cache-client, and safe snapshot owner.
- `apps/web/src/vision/useVisionRuntime.ts` — React lifetime adapter for the coordinator.
- `apps/web/src/vision/release.ts` — exports the validated generated manifest and its Vite-emitted URL.

### Offline ownership

- `apps/web/src/service-worker/vision-cache.ts` — dependency-injected atomic cache transaction and completed-release lookup.
- `apps/web/src/service-worker/sw.ts` — Workbox precache, message dispatch, and immutable vision fetch handling.
- `apps/web/src/service-worker/client.ts` — early registration plus bounded request/reply messaging for cache commands.

### Existing integration points

- `apps/web/src/App.tsx` and `apps/web/src/styles.css` — composite camera/runtime UX, Help rows, and recovery.
- `apps/web/vite.config.ts`, `apps/web/public/_headers`, and `apps/web/src/main.tsx` — classic worker, injected service worker, CSP, and early registration.
- `apps/web/e2e/vision-runtime.spec.ts` — real online setup, offline reopen, first-use-offline, integrity, cache inventory, and CSP journeys.
- Existing unit, browser, CI, architecture, privacy, validation, deployment, and README files — updated contracts and acceptance evidence.

---

### Task 1: Pin and inventory the immutable vision release

**Files:**

- Modify: `apps/web/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `apps/web/scripts/vision-release.config.mjs`
- Create: `apps/web/scripts/vendor-vision-release.mjs`
- Create: `apps/web/scripts/generate-vision-manifest.mjs`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/vision_wasm_internal.js`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/vision_wasm_internal.wasm`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/vision_wasm_module_internal.js`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/vision_wasm_module_internal.wasm`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/vision_wasm_nosimd_internal.js`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/vision_wasm_nosimd_internal.wasm`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/face_landmarker.task`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/LICENSE-MediaPipe.txt`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/NOTICE.txt`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/model-card-blazeface-short-range.pdf`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/model-card-face-mesh-v2.pdf`
- Create: `apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/model-card-blendshape-v2.pdf`
- Create: `apps/web/src/vision/generated/release-manifest.json`
- Create: `apps/web/src/vision/manifest-assets.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: pinned npm package files and fixed official Google source URLs.
- Produces: `npm run vision:vendor`, `npm run vision:manifest`, `npm run vision:manifest:check`, root `npm run web:vision:check`, and a canonical `VisionReleaseManifest` JSON document consumed by every later task.

- [ ] **Step 1: Add the exact dependencies and scripts**

Run:

```bash
npm install --workspace=@smart-smile/web --save-exact @mediapipe/tasks-vision@0.10.35
npm install --workspace=@smart-smile/web --save-dev --save-exact vite-plugin-pwa@1.3.0 workbox-core@7.4.1 workbox-precaching@7.4.1 workbox-routing@7.4.1
```

Add these web scripts:

```json
{
  "vision:vendor": "node scripts/vendor-vision-release.mjs",
  "vision:manifest": "node scripts/generate-vision-manifest.mjs",
  "vision:manifest:check": "node scripts/generate-vision-manifest.mjs --check"
}
```

Add the root script:

```json
{
  "web:vision:check": "npm run vision:manifest:check --workspace=@smart-smile/web"
}
```

- [ ] **Step 2: Write the failing manifest-inventory tests**

Create `manifest-assets.test.ts` with tests that read the config, generated JSON, and release directory and assert:

```ts
expect(manifest.schemaVersion).toBe(1);
expect(manifest.runtimeVersion).toBe("0.10.35");
expect(manifest.modelVersion).toBe("float16/1");
expect(manifest.releaseId).toMatch(/^[a-f0-9]{16}$/);
expect(manifest.assets.map(({ path }) => path)).toEqual(
  [...manifest.assets.map(({ path }) => path)].sort(),
);
expect(new Set(manifest.assets.map(({ path }) => path)).size).toBe(
  manifest.assets.length,
);
for (const asset of manifest.assets) {
  expect(asset.path).toMatch(
    /^\/vision\/mediapipe-0\.10\.35-face-landmarker-float16-v1\//,
  );
  expect(asset.bytes).toBeGreaterThan(0);
  expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(new URL(asset.source).protocol).toBe("https:");
  expect(asset.licenseRef).toMatch(/^\/vision\//);
  expect(asset.requiredForOffline).toBe(true);
}
```

Also assert the exact six package-owned loader/WASM filenames, one task bundle, one license, one notice, and three model cards. Scan the directory recursively and compare it to the configured destinations so unexpected files fail.

- [ ] **Step 3: Run the focused test and verify the missing-manifest failure**

Run:

```bash
npm run web:test -- --run src/vision/manifest-assets.test.ts
```

Expected: FAIL because the config, vendored release, and generated manifest do not exist.

- [ ] **Step 4: Implement the fixed source inventory**

Export this configuration shape from `vision-release.config.mjs`:

```js
export const releaseDirectoryName =
  "mediapipe-0.10.35-face-landmarker-float16-v1";
export const runtimeVersion = "0.10.35";
export const modelVersion = "float16/1";
export const packageSource =
  "https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz";
export const assets = [
  {
    destination: "vision_wasm_internal.js",
    packagePath: "wasm/vision_wasm_internal.js",
    role: "wasm-loader-simd",
  },
  {
    destination: "vision_wasm_internal.wasm",
    packagePath: "wasm/vision_wasm_internal.wasm",
    role: "wasm-binary-simd",
  },
  {
    destination: "vision_wasm_module_internal.js",
    packagePath: "wasm/vision_wasm_module_internal.js",
    role: "wasm-loader-module-simd",
  },
  {
    destination: "vision_wasm_module_internal.wasm",
    packagePath: "wasm/vision_wasm_module_internal.wasm",
    role: "wasm-binary-module-simd",
  },
  {
    destination: "vision_wasm_nosimd_internal.js",
    packagePath: "wasm/vision_wasm_nosimd_internal.js",
    role: "wasm-loader-baseline",
  },
  {
    destination: "vision_wasm_nosimd_internal.wasm",
    packagePath: "wasm/vision_wasm_nosimd_internal.wasm",
    role: "wasm-binary-baseline",
  },
];
```

Every package entry uses `packageSource`, version `0.10.35`, and `/vision/mediapipe-0.10.35-face-landmarker-float16-v1/LICENSE-MediaPipe.txt` as its license reference.

Append these literal official HTTPS sources:

```js
export const remoteAssets = [
  {
    destination: "face_landmarker.task",
    role: "face-landmarker-model",
    source:
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
  {
    destination: "LICENSE-MediaPipe.txt",
    role: "license",
    source:
      "https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.35/LICENSE",
  },
  {
    destination: "model-card-blazeface-short-range.pdf",
    role: "model-card-face-detector",
    source:
      "https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf",
  },
  {
    destination: "model-card-face-mesh-v2.pdf",
    role: "model-card-face-mesh",
    source:
      "https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf",
  },
  {
    destination: "model-card-blendshape-v2.pdf",
    role: "model-card-blendshape",
    source:
      "https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf",
  },
];
```

Generate `NOTICE.txt` deterministically from project-owned text that names MediaPipe Tasks Vision `0.10.35`, Face Landmarker `float16/1`, Google LLC, the repository/model sources above, the three model-card sources, and `LICENSE-MediaPipe.txt`. The notice entry uses `https://github.com/google-ai-edge/mediapipe/tree/v0.10.35` as its provenance source. Give every entry an explicit `source`, `role`, `licenseRef`, and `requiredForOffline: true`; do not discover files with wildcards.

- [ ] **Step 5: Implement deterministic vendoring and manifest generation**

`vendor-vision-release.mjs` must create only the exact configured destinations, copy package sources from `node_modules/@mediapipe/tasks-vision`, fetch URL sources with redirect support and HTTP-success checks, write through a temporary sibling file, and rename only after the complete response is written.

`generate-vision-manifest.mjs` must:

```js
const canonicalAsset = {
  bytes: stat.size,
  id: configured.role,
  licenseRef: configured.licenseRef,
  path: `/vision/${releaseDirectoryName}/${configured.destination}`,
  requiredForOffline: configured.requiredForOffline,
  role: configured.role,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  source: configured.source,
  version: configured.version,
};
```

Sort entries by `path`, serialize with two-space indentation plus a final newline, derive `releaseId` from the first 16 lowercase hex characters of SHA-256 over the canonical object without `releaseId`, and write `src/vision/generated/release-manifest.json`. In `--check` mode, compare bytes and exit nonzero without writing.

- [ ] **Step 6: Vendor the release, generate the manifest, and make the tests pass**

Run:

```bash
npm run vision:vendor --workspace=@smart-smile/web
npm run vision:manifest --workspace=@smart-smile/web
npm run web:vision:check
npm run web:test -- --run src/vision/manifest-assets.test.ts
```

Expected: every command exits 0 and the test reports all inventory cases PASS.

- [ ] **Step 7: Gate the release in CI**

Insert this step after `npm ci` and before formatting in `.github/workflows/ci.yml`:

```yaml
- name: Verify vendored vision release
  run: npm run web:vision:check
```

Run `npm run web:vision:check` again and confirm that changing one copied byte makes it fail, then restore the byte with `npm run vision:vendor --workspace=@smart-smile/web` and regenerate only if the official inventory is intentionally being changed.

- [ ] **Step 8: Commit the supply-chain slice**

```bash
git add package.json package-lock.json apps/web/package.json apps/web/scripts apps/web/public/vision apps/web/src/vision/generated apps/web/src/vision/manifest-assets.test.ts .github/workflows/ci.yml
git commit -m "build: pin verified vision release"
```

### Task 2: Define and verify the manifest and message contracts

**Files:**

- Create: `apps/web/src/vision/manifest.ts`
- Create: `apps/web/src/vision/manifest.test.ts`
- Create: `apps/web/src/vision/integrity.ts`
- Create: `apps/web/src/vision/integrity.test.ts`
- Create: `apps/web/src/vision/protocol.ts`
- Create: `apps/web/src/vision/protocol.test.ts`
- Create: `apps/web/src/vision/release.ts`

**Interfaces:**

- Consumes: `release-manifest.json` from Task 1.
- Produces: `VisionReleaseManifest`, `VisionAsset`, `parseVisionManifest(value)`, `getAssetByRole(manifest, role)`, `verifyVisionResponse(response, asset)`, `VisionWorkerCommand`, `VisionWorkerEvent`, `VisionCacheCommand`, `VisionCacheEvent`, and guards used by worker, service worker, and coordinator.

- [ ] **Step 1: Write failing validation, integrity, and protocol tests**

Use minimal valid fixtures and assert:

```ts
expect(parseVisionManifest(validManifest)).toEqual(validManifest);
expect(() =>
  parseVisionManifest({ ...validManifest, releaseId: "../bad" }),
).toThrow("Invalid vision manifest");
expect(() =>
  parseVisionManifest({
    ...validManifest,
    assets: [{ ...validManifest.assets[0], path: "https://example.com/a" }],
  }),
).toThrow("Invalid vision manifest");
await expect(verifyVisionResponse(goodResponse, asset)).resolves.toEqual(bytes);
await expect(verifyVisionResponse(shortResponse, asset)).rejects.toMatchObject({
  code: "runtime-integrity-failed",
});
expect(
  isVisionWorkerEvent({
    type: "READY",
    generation: 2,
    releaseId,
    wasmTier: "simd",
  }),
).toBe(true);
expect(isVisionWorkerEvent({ type: "READY", generation: "2" })).toBe(false);
```

Cover duplicate IDs/paths, unsorted assets, non-HTTPS sources, non-same-origin paths, invalid hashes, unsafe reason strings, unknown message types, and malformed generation values.

- [ ] **Step 2: Run the tests and verify missing exports fail**

```bash
npm run web:test -- --run src/vision/manifest.test.ts src/vision/integrity.test.ts src/vision/protocol.test.ts
```

Expected: FAIL with unresolved module or missing-export errors.

- [ ] **Step 3: Implement the exact public types and allowlists**

Define these public contracts:

```ts
export type VisionAssetRole =
  | "wasm-loader-simd"
  | "wasm-binary-simd"
  | "wasm-loader-module-simd"
  | "wasm-binary-module-simd"
  | "wasm-loader-baseline"
  | "wasm-binary-baseline"
  | "face-landmarker-model"
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
export type VisionWasmTier = "unknown" | "simd" | "baseline";
export type VisionRuntimeState = "idle" | "preparing" | "ready" | "error";
export type VisionOfflineState = "not-ready" | "caching" | "ready" | "error";
export type VisionReason =
  | "first-use-offline"
  | "runtime-download-failed"
  | "runtime-integrity-failed"
  | "runtime-initialization-failed"
  | "runtime-cancelled"
  | "offline-cache-failed";

export type VisionWorkerCommand =
  | {
      type: "PREPARE";
      generation: number;
      manifestUrl: string;
      releaseId: string;
    }
  | { type: "CANCEL"; generation: number };
export type VisionWorkerEvent =
  | { type: "PHASE"; generation: number; phase: "verifying" | "initializing" }
  | {
      type: "READY";
      generation: number;
      releaseId: string;
      wasmTier: "simd" | "baseline";
    }
  | {
      type: "ERROR";
      generation: number;
      code: VisionReason;
      recoverable: boolean;
    };
export type VisionCacheCommand =
  | {
      type: "CACHE_RELEASE";
      requestId: string;
      generation: number;
      manifestUrl: string;
      releaseId: string;
    }
  | {
      type: "CANCEL_CACHE";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "QUERY_RELEASE";
      requestId: string;
      generation: number;
      releaseId: string;
    };
export type VisionCacheEvent =
  | {
      type: "CACHE_CACHING";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "CACHE_READY";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "CACHE_MISSING";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "CACHE_CANCELLED";
      requestId: string;
      generation: number;
      releaseId: string;
    }
  | {
      type: "CACHE_ERROR";
      requestId: string;
      generation: number;
      releaseId: string;
      code: "offline-cache-failed";
    };
```

Every guard must reject excess unsafe payload values, non-integer/negative generations, unknown reasons, external manifest URLs, and malformed request IDs.

- [ ] **Step 4: Implement exact response verification**

`verifyVisionResponse` must check `response.ok`, read one `ArrayBuffer`, compare `byteLength`, compute `crypto.subtle.digest("SHA-256", bytes)`, compare lowercase hex in constant time for equal-length strings, and return a fresh `Uint8Array`. It must throw a safe `VisionAssetError` containing only the allowlisted code and asset ID; never attach the response body, URL query, raw exception, or stack to public state.

- [ ] **Step 5: Export the build-emitted manifest URL**

In `release.ts`, import the JSON twice—once as JSON and once with `?url`—then validate it:

```ts
import rawManifest from "./generated/release-manifest.json";
import manifestUrl from "./generated/release-manifest.json?url";
import { parseVisionManifest } from "./manifest";

export const VISION_MANIFEST = parseVisionManifest(rawManifest);
export const VISION_MANIFEST_URL = manifestUrl;
```

- [ ] **Step 6: Run the focused tests and type checker**

```bash
npm run web:test -- --run src/vision/manifest.test.ts src/vision/integrity.test.ts src/vision/protocol.test.ts
npm run web:typecheck
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the shared contracts**

```bash
git add apps/web/src/vision/manifest.ts apps/web/src/vision/manifest.test.ts apps/web/src/vision/integrity.ts apps/web/src/vision/integrity.test.ts apps/web/src/vision/protocol.ts apps/web/src/vision/protocol.test.ts apps/web/src/vision/release.ts
git commit -m "feat: define verified vision contracts"
```

### Task 3: Initialize one verified Face Landmarker in a classic worker

**Files:**

- Create: `apps/web/src/vision/runtime-loader.ts`
- Create: `apps/web/src/vision/runtime-loader.test.ts`
- Create: `apps/web/src/vision/worker-runtime.ts`
- Create: `apps/web/src/vision/worker-runtime.test.ts`
- Create: `apps/web/src/vision/worker.ts`
- Modify: `apps/web/vite.config.ts`

**Interfaces:**

- Consumes: manifest/integrity/protocol contracts from Task 2 and MediaPipe `WasmFileset`/`FaceLandmarker` from Task 1.
- Produces: `prepareVisionRuntime(input, dependencies): Promise<PreparedVisionRuntime>`, `PreparedVisionRuntime.close()`, `createVisionWorkerRuntime(dependencies)`, and a classic worker entry consumed by Task 5.

- [ ] **Step 1: Write failing loader tests**

Inject `fetch`, `supportsSimd`, and `createLandmarker` dependencies. Assert:

```ts
expect(dependencies.createLandmarker).toHaveBeenCalledWith(
  fileset,
  expect.objectContaining({
    baseOptions: expect.objectContaining({ delegate: "CPU" }),
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
    runningMode: "VIDEO",
  }),
);
expect(result.wasmTier).toBe("simd");
expect(dependencies.createLandmarker).toHaveBeenCalledTimes(1);
```

Add cases proving all selected critical bytes are verified before `createLandmarker`, the model is passed as verified `Uint8Array`, an unsupported SIMD initialization retries baseline once, an integrity failure never retries, WebGPU is never requested, cancellation closes a partially created instance, and `close()` is idempotent.

- [ ] **Step 2: Run the loader test and verify it fails**

```bash
npm run web:test -- --run src/vision/runtime-loader.test.ts
```

Expected: FAIL because `prepareVisionRuntime` does not exist.

- [ ] **Step 3: Implement capability selection and MediaPipe construction**

Use this dependency boundary:

```ts
import type {
  FaceLandmarker,
  FaceLandmarkerOptions,
  WasmFileset,
} from "@mediapipe/tasks-vision";

export interface VisionRuntimeDependencies {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
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
  wasmTier: "simd" | "baseline";
  close(): void;
}
```

Select the `vision_wasm_internal` pair for SIMD and `vision_wasm_nosimd_internal` pair for baseline. Build a `WasmFileset` from those same-origin paths. Verify loader JS, WASM, and model responses before calling `createLandmarker`. Pass `modelAssetBuffer` rather than a model URL. Map fetch failures to `runtime-download-failed`, hash/size failures to `runtime-integrity-failed`, and exhausted construction failures to `runtime-initialization-failed`. Keep raw exceptions local.

- [ ] **Step 4: Write failing worker lifecycle tests**

Test the pure worker handler with captured outbound messages:

```ts
runtime.receive({ type: "PREPARE", generation: 4, manifestUrl, releaseId });
await flushPromises();
expect(postMessage).toHaveBeenCalledWith({
  type: "READY",
  generation: 4,
  releaseId,
  wasmTier: "simd",
});
runtime.receive({ type: "CANCEL", generation: 4 });
expect(prepared.close).toHaveBeenCalledOnce();
```

Add malformed-message rejection, late completion after cancel, newer-generation supersession, phase ordering, one live instance, safe error mapping, and disposal tests.

- [ ] **Step 5: Implement the worker runtime and side-effect entry**

`worker-runtime.ts` owns one generation, one `AbortController`, and one prepared runtime. A newer `PREPARE` closes/aborts the previous generation. `CANCEL` affects only the matching current generation. Check the generation again after every `await` before posting.

`worker.ts` contains only wiring:

```ts
const runtime = createVisionWorkerRuntime(
  createBrowserVisionDependencies(),
  (event) => self.postMessage(event),
);
self.addEventListener("message", (event: MessageEvent<unknown>) => {
  runtime.receive(event.data);
});
```

Do not add frame-message types in this ticket.

- [ ] **Step 6: Lock classic worker output**

Add to Vite config:

```ts
worker: {
  format: "iife",
},
```

The main-thread constructor in Task 5 must use `new Worker(new URL("./worker.ts", import.meta.url))` without `{ type: "module" }`.

- [ ] **Step 7: Run focused tests and production build**

```bash
npm run web:test -- --run src/vision/runtime-loader.test.ts src/vision/worker-runtime.test.ts
npm run web:typecheck
npm run web:build
rg -n "importScripts" apps/web/dist/assets
```

Expected: tests/typecheck/build PASS and the built worker/runtime contains the classic-worker loader path expected by MediaPipe.

- [ ] **Step 8: Commit the worker slice**

```bash
git add apps/web/src/vision/runtime-loader.ts apps/web/src/vision/runtime-loader.test.ts apps/web/src/vision/worker-runtime.ts apps/web/src/vision/worker-runtime.test.ts apps/web/src/vision/worker.ts apps/web/vite.config.ts
git commit -m "feat: initialize verified vision worker"
```

### Task 4: Cache the complete release atomically

**Files:**

- Create: `apps/web/src/service-worker/vision-cache.ts`
- Create: `apps/web/src/service-worker/vision-cache.test.ts`
- Create: `apps/web/src/service-worker/sw.ts`
- Create: `apps/web/src/service-worker/sw.test.ts`
- Create: `apps/web/src/service-worker/client.ts`
- Create: `apps/web/src/service-worker/client.test.ts`

**Interfaces:**

- Consumes: `VisionCacheCommand`, `VisionCacheEvent`, manifest validation, and integrity verification from Task 2.
- Produces: `cacheVisionRelease(command, dependencies)`, `queryVisionRelease(releaseId, dependencies)`, `cancelVisionRelease(generation)`, `registerApplicationServiceWorker()`, and `VisionCacheClient` for Task 5.

- [ ] **Step 1: Write failing atomic-cache tests**

Use in-memory `CacheStorageLike` and fetch fakes. Assert this exact ordering:

```ts
expect(operations).toEqual([
  "open:smart-smile-vision-" + releaseId,
  "fetch:" + firstAsset.path,
  "verify:" + firstAsset.id,
  "put:" + firstAsset.path,
  "readback:" + firstAsset.path,
  "put-completion:" + releaseId,
]);
```

For a multi-asset fixture, assert the completion marker is last. Add cases for byte mismatch, failed fetch, failed readback, cancellation, deletion of incomplete current cache, retention of an older complete cache, recognition only with a matching completion record, and no writes outside Cache Storage.

- [ ] **Step 2: Run the cache test and verify it fails**

```bash
npm run web:test -- --run src/service-worker/vision-cache.test.ts
```

Expected: FAIL because the atomic cache functions do not exist.

- [ ] **Step 3: Implement the dependency-injected cache transaction**

Use cache names and marker contents with no participant data:

```ts
export const visionCacheName = (releaseId: string) =>
  `smart-smile-vision-${releaseId}`;
export const completionUrl = (scope: string, releaseId: string) =>
  new URL(`__smart-smile/vision-complete/${releaseId}`, scope).href;
export type CompletionRecord = {
  schemaVersion: 1;
  releaseId: string;
  assetCount: number;
};
```

Fetch every configured asset with `{ cache: "no-store", credentials: "same-origin", signal }`, verify it, cache a new `Response` built from verified bytes and safe upstream headers, read back every required entry, then write the JSON completion record. On error/cancel, delete only the incomplete current-release cache. If a matching completed current-release cache already exists, return ready without network work.

- [ ] **Step 4: Write failing service-worker and client protocol tests**

Assert shell install never invokes `cacheVisionRelease`; `CACHE_RELEASE` replies `CACHE_CACHING` then `CACHE_READY`; `QUERY_RELEASE` returns `CACHE_READY` or `CACHE_MISSING`; `CANCEL_CACHE` aborts only the matching generation and replies `CACHE_CANCELLED`; malformed messages receive no response; and bounded request IDs resolve the matching client promise once.

- [ ] **Step 5: Implement Workbox and client wiring**

In `sw.ts`:

```ts
declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
```

Add a message listener that uses `event.source?.postMessage` for allowlisted cache events. Add a fetch handler only for manifest-listed immutable vision paths; serve matching completed-cache entries first and otherwise use same-origin network. Do not route camera/session data or arbitrary requests into the vision cache.

In `client.ts`, register the Vite-generated service worker on initial app load, await `navigator.serviceWorker.ready`, use its active worker, bound each request with a 15-second timeout, validate every reply, and expose `cacheRelease`, `cancel`, and `queryRelease`. Registration failure returns a cache client that reports `offline-cache-failed`; it must not crash camera-only recovery.

Expose this exact client boundary:

```ts
export interface VisionCacheRequest {
  generation: number;
  manifestUrl: string;
  releaseId: string;
}
export interface VisionCacheClient {
  queryRelease(
    request: Pick<VisionCacheRequest, "generation" | "releaseId">,
  ): Promise<"ready" | "missing">;
  cacheRelease(
    request: VisionCacheRequest,
    onState: (state: "caching" | "ready" | "error") => void,
  ): Promise<"ready" | "error">;
  cancel(request: Pick<VisionCacheRequest, "generation" | "releaseId">): void;
}
```

Wait for `navigator.serviceWorker.ready` before selecting its active worker for messaging; do not post to an installing worker.

- [ ] **Step 6: Run all service-worker tests**

```bash
npm run web:test -- --run src/service-worker/vision-cache.test.ts src/service-worker/sw.test.ts src/service-worker/client.test.ts
npm run web:typecheck
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the offline cache slice**

```bash
git add apps/web/src/service-worker
git commit -m "feat: cache verified vision release atomically"
```

### Task 5: Own generations and recovery in the main-thread coordinator

**Files:**

- Create: `apps/web/src/vision/coordinator.ts`
- Create: `apps/web/src/vision/coordinator.test.ts`
- Create: `apps/web/src/vision/useVisionRuntime.ts`
- Create: `apps/web/src/vision/useVisionRuntime.test.tsx`

**Interfaces:**

- Consumes: classic worker protocol from Task 3, `VisionCacheClient` from Task 4, and release constants from Task 2.
- Produces: `VisionSnapshot`, `VisionCoordinator.prepare()`, `cancel()`, `restart()`, `subscribe()`, `dispose()`, and `useVisionRuntime()` for Task 6.

- [ ] **Step 1: Write failing coordinator state tests**

Define the expected initial snapshot:

```ts
expect(createInitialVisionSnapshot()).toEqual({
  runtime: "idle",
  offlineCache: "not-ready",
  wasmTier: "unknown",
  generation: 0,
  releaseId: VISION_MANIFEST.releaseId,
  reason: null,
  retryAvailable: false,
  phase: null,
});
```

Test that `prepare()` queries completion first, returns `"first-use-offline"` without constructing a worker when both cache and network manifest access fail, and otherwise constructs exactly one classic worker, sends `PREPARE`, and begins `CACHE_RELEASE`. Test independent runtime/cache ready states, cache-only failure, fatal integrity state, one baseline result, cancellation, restart, stale-generation messages, camera-switch neutrality, bounded safe state, and disposal.

- [ ] **Step 2: Run the coordinator test and verify it fails**

```bash
npm run web:test -- --run src/vision/coordinator.test.ts
```

Expected: FAIL because the coordinator is missing.

- [ ] **Step 3: Implement the semantic snapshot and start gate**

Use this exact surface:

```ts
export interface VisionSnapshot {
  runtime: VisionRuntimeState;
  offlineCache: VisionOfflineState;
  wasmTier: VisionWasmTier;
  generation: number;
  releaseId: string;
  reason: VisionReason | null;
  retryAvailable: boolean;
  phase: "verifying" | "initializing" | null;
}

export class VisionCoordinator {
  prepare(): Promise<"started" | "first-use-offline">;
  restart(): Promise<"started" | "first-use-offline">;
  cancel(): void;
  subscribe(listener: (snapshot: VisionSnapshot) => void): () => void;
  dispose(): void;
}

export interface VisionWorkerPort {
  postMessage(message: VisionWorkerCommand): void;
  terminate(): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
}
export interface VisionCoordinatorDependencies {
  cacheClient: VisionCacheClient;
  createWorker(): VisionWorkerPort;
  canFetchManifest(manifestUrl: string, signal: AbortSignal): Promise<boolean>;
  manifest: VisionReleaseManifest;
  manifestUrl: string;
}
```

`prepare()` performs a lightweight completed-cache/network preflight before returning `started`, so first-use-offline never requests camera permission. Once allowed, worker preparation and cache population run concurrently. Increment generation for stop, cancel, restart, and disposal. Terminate a preparing worker on cancel, send cache cancellation, ignore old replies, and retain a ready worker through camera switches.

- [ ] **Step 4: Construct a classic worker without module options**

The browser dependency factory must contain:

```ts
createWorker: () => new Worker(new URL("./worker.ts", import.meta.url)),
```

Assert in the test that the injected constructor receives no `{ type: "module" }` option.

- [ ] **Step 5: Write and implement the hook lifecycle test**

Render a harness, assert one coordinator subscription, expose stable action callbacks, unmount, and assert unsubscribe plus `dispose()` exactly once. Implement `useVisionRuntime()` with one coordinator per mount and React state containing only `VisionSnapshot`.

Return this exact hook surface:

```ts
export interface UseVisionRuntimeResult {
  snapshot: VisionSnapshot;
  prepare(): Promise<"started" | "first-use-offline">;
  restart(): Promise<"started" | "first-use-offline">;
  cancel(): void;
}
```

- [ ] **Step 6: Run focused tests and type checking**

```bash
npm run web:test -- --run src/vision/coordinator.test.ts src/vision/useVisionRuntime.test.tsx
npm run web:typecheck
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the coordinator slice**

```bash
git add apps/web/src/vision/coordinator.ts apps/web/src/vision/coordinator.test.ts apps/web/src/vision/useVisionRuntime.ts apps/web/src/vision/useVisionRuntime.test.tsx
git commit -m "feat: coordinate vision runtime generations"
```

### Task 6: Integrate accessible preparation, status, and recovery UX

**Files:**

- Modify: `apps/web/src/App.tsx:168-550`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**

- Consumes: `useVisionRuntime()` from Task 5 and existing camera-session actions.
- Produces: one participant-facing combined camera/runtime experience, two Help rows, and focused recovery without changing camera ownership.

- [ ] **Step 1: Write failing component tests for the explicit-intent boundary**

Mock the vision hook and assert before the privacy action:

```ts
expect(vision.prepare).not.toHaveBeenCalled();
expect(getUserMedia).not.toHaveBeenCalled();
fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
await waitFor(() => expect(vision.prepare).toHaveBeenCalledOnce());
expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
  "Getting smile detection ready",
);
expect(
  screen.getByText(
    "Required files are verified and stay on this device for offline use",
  ),
).toBeVisible();
```

Assert camera start happens only after `prepare()` resolves `started`; a `first-use-offline` result leaves `getUserMedia` untouched.

- [ ] **Step 2: Add failing status and recovery tests**

Cover:

- Help rows **On-device smile detection** and **Offline use** with Preparing, Ready, Needs attention, and Connect once to finish setup labels.
- One announcement of **Smart Smile is ready for offline use** when cache state first becomes ready.
- No fake percentage and no raw runtime error text.
- Stop/Cancel calls both camera stop and runtime cancel.
- Camera switching never calls runtime cancel/restart.
- Integrity failure stops the camera and focuses **Smart Smile could not start safely**.
- First-use-offline focuses **Connect once to finish setup**, presents **Try again when online**, and never requests camera.
- Cache-only failure leaves the ready camera usable and places the warning only in Help.
- Camera ready copy appears only after both the camera and runtime are ready.

- [ ] **Step 3: Run the focused component tests and verify failure**

```bash
npm run web:test -- --run src/App.test.tsx
```

Expected: FAIL on missing runtime preparation and Help content.

- [ ] **Step 4: Implement combined action ownership and copy precedence**

Add `useVisionRuntime()` beside `useCameraSession()`. The Continue/Restart handler must await the runtime preflight; on `started`, begin camera acquisition while worker initialization/cache population continue. The Stop/Cancel handler calls both owners. Add an effect that stops camera on `runtime-integrity-failed`.

Compute visible copy in this order:

1. Fatal integrity recovery.
2. First-use-offline recovery.
3. Existing camera permission/error/switch recovery.
4. Runtime preparing while camera is starting, warming, or ready.
5. Existing camera-ready/stopped copy.

Keep one visible polite atomic live region. Announce offline readiness only on its transition and do not render technical phase churn into that region.

- [ ] **Step 5: Extend Help with safe runtime details**

Pass both snapshots to `SystemStatus` and render semantic rows:

```tsx
<div>
  <dt>On-device smile detection</dt>
  <dd>{runtimeStatusLabel}</dd>
</div>
<div>
  <dt>Offline use</dt>
  <dd>{offlineStatusLabel}</dd>
</div>
```

Under system details, show only MediaPipe `0.10.35`, model `face_landmarker float16/1`, the 16-character manifest ID, and SIMD/baseline tier. Do not include paths, raw exceptions, timestamps, bytes, or participant/device evidence.

- [ ] **Step 6: Add recovery styling without changing the visual system**

Reuse existing coach card, overlay scrims, typography, action classes, and focus-ring rules. Add only the minimum status-row and focused-recovery selectors. Verify all interactive controls retain `min-width`/`min-height` of at least 48 CSS pixels, the 360×225 reflow remains normal-flow, and reduced-motion selectors cover new status transitions.

- [ ] **Step 7: Run component, accessibility, and regression tests**

```bash
npm run web:test -- --run src/App.test.tsx
npm run web:test
npm run web:typecheck
```

Expected: all Vitest suites PASS and TypeScript exits 0.

- [ ] **Step 8: Commit the UX slice**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/styles.css
git commit -m "feat: present vision preparation and recovery"
```

### Task 7: Wire the PWA build and minimum production policy

**Files:**

- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/public/_headers`
- Modify: `apps/web/e2e/delivery-config.spec.ts`
- Modify: `apps/web/e2e/serve-production.mjs`

**Interfaces:**

- Consumes: service-worker entry/client from Task 4, release manifest from Task 2, and classic-worker requirement from Task 3.
- Produces: a production bundle with a small shell precache, no eagerly precached heavy vision files, correct MIME types, and exact CSP permissions.

- [ ] **Step 1: Write failing delivery-policy tests**

Update the exact CSP expectation to:

```ts
expect([...csp]).toEqual([
  ["default-src", ["'self'"]],
  ["script-src", ["'self'", "'wasm-unsafe-eval'"]],
  ["style-src", ["'self'"]],
  ["connect-src", ["'self'"]],
  ["worker-src", ["'self'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
  ["frame-ancestors", ["'none'"]],
  ["upgrade-insecure-requests", []],
]);
expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
expect(csp.get("worker-src")).not.toContain("blob:");
expect(csp.get("worker-src")).not.toContain("data:");
```

Read the built service-worker precache manifest and assert it contains the hashed application manifest but none of `.wasm`, `.task`, `.pdf`, or vendored vision-loader `.js` paths.

- [ ] **Step 2: Run the delivery test and verify it fails**

```bash
npm run web:build
npm run web:e2e -- delivery-config.spec.ts
```

Expected: FAIL because CSP and PWA output have not been wired.

- [ ] **Step 3: Configure injected Workbox and explicit classic workers**

Add `VitePWA` with:

```ts
VitePWA({
  strategies: "injectManifest",
  srcDir: "src/service-worker",
  filename: "sw.ts",
  injectManifest: {
    globPatterns: ["**/*.{html,css,js,json,png,svg,ico}"],
    globIgnores: [
      "vision/**/*.js",
      "vision/**/*.wasm",
      "vision/**/*.task",
      "vision/**/*.pdf",
      "vision/**/*.txt",
    ],
  },
});
```

Keep `worker.format: "iife"`. Confirm the Vite-emitted hashed `release-manifest.json` is precached because it is imported from `src`, while every file under `public/vision` is excluded from shell precache.

- [ ] **Step 4: Register the shell worker early and safely**

Call `registerApplicationServiceWorker()` once from `main.tsx` before rendering React, but do not await it and do not issue `CACHE_RELEASE`. The service-worker client singleton must be shared with the coordinator so registration cannot duplicate.

- [ ] **Step 5: Apply CSP and production MIME handling**

Change `_headers` to the exact directives from Step 1. Add these production-server MIME mappings:

```js
[".pdf", "application/pdf"],
[".task", "application/octet-stream"],
[".wasm", "application/wasm"],
```

- [ ] **Step 6: Build and run delivery tests**

```bash
npm run web:build
npm run web:e2e -- delivery-config.spec.ts
```

Expected: build and delivery tests PASS; built `_headers` matches source byte-for-byte.

- [ ] **Step 7: Commit production wiring**

```bash
git add apps/web/vite.config.ts apps/web/src/main.tsx apps/web/public/_headers apps/web/e2e/delivery-config.spec.ts apps/web/e2e/serve-production.mjs
git commit -m "feat: wire offline vision PWA delivery"
```

### Task 8: Prove real initialization, offline reopen, and storage privacy

**Files:**

- Create: `apps/web/e2e/vision-runtime.spec.ts`
- Modify: `apps/web/e2e/foundation.spec.ts:117-197`
- Modify: `apps/web/e2e/foundation.spec.ts:267-376`
- Modify: `apps/web/e2e/foundation.spec.ts:506-547`
- Modify: `apps/web/e2e/camera-overlay.spec.ts`
- Modify: `apps/web/e2e/serve-production.mjs`

**Interfaces:**

- Consumes: complete production build and all runtime/cache/UI behavior from Tasks 1–7.
- Produces: production-browser evidence that the real self-hosted runtime initializes, caches atomically, reopens offline, and persists only allowlisted static entries.

- [ ] **Step 1: Update old no-storage/no-request assertions to the new privacy boundary**

Before Continue, assert one registered shell worker may exist, shell caches contain no `.wasm`, `.task`, `.pdf`, or vendored vision loader, and local/session storage, IndexedDB, cookies, canvas, video, and camera requests remain empty.

After Continue, replace `postLoadRequests === []` with:

```ts
expect(
  postLoadRequests.every((url) => new URL(url).origin === baseOrigin),
).toBe(true);
expect(
  postLoadRequests.every(
    (url) =>
      new URL(url).pathname.startsWith("/vision/") ||
      new URL(url).pathname.startsWith("/assets/"),
  ),
).toBe(true);
```

Still reject requests to analytics, error collectors, uploads, remote model/CDN origins, and any URL containing camera/session data.

- [ ] **Step 2: Write the failing real-runtime online/offline journey**

Mark this file serial because it deliberately changes offline and local fault-injection state. Use one persistent Playwright context:

```ts
await page.goto("/");
await page.getByRole("button", { name: "Continue to camera" }).click();
await expect(page.getByRole("status", { name: "Camera status" })).toContainText(
  "Smart Smile is ready for offline use",
  { timeout: 60_000 },
);
await context.setOffline(true);
await page.close();
const offlinePage = await context.newPage();
await offlinePage.goto("/");
await offlinePage.getByRole("button", { name: "Continue to camera" }).click();
await expect(
  offlinePage.getByRole("heading", { name: "Camera ready" }),
).toBeVisible({ timeout: 30_000 });
```

Assert Help reports MediaPipe `0.10.35`, the model version, matching release ID, and SIMD/baseline, with no CSP violation.

- [ ] **Step 3: Add first-use-offline and integrity-failure journeys**

For a fresh browser context, load the shell once without Continue, go offline, reopen, click Continue, and assert **Connect once to finish setup**, no camera request, focused heading, and **Try again when online**.

Add a local-test-server control endpoint at `/__e2e__/fault/corrupt-wasm/on` and `/__e2e__/fault/corrupt-wasm/off`. The server keeps the flag in process memory and, while enabled, flips the final byte of every `.wasm` response while preserving HTTP 200 and the original content type. These endpoints exist only in `serve-production.mjs`; no application or deployed route is added.

For integrity failure, enable that fault before Continue and disable it in `finally`. Assert **Smart Smile could not start safely**, stopped camera track, no baseline retry, no offline-ready claim, no completion marker, and no raw exception rendered.

- [ ] **Step 4: Add cache-failure rollback and inventory tests**

Seed a completed sentinel cache through browser `CacheStorage`, including a valid completion record under a distinct 16-character release ID. Then enable the local server's WASM corruption during current `CACHE_RELEASE`. Assert the completed sentinel cache remains, the incomplete current-release cache disappears, and no current-release completion record exists. This exercises production service-worker behavior without adding a production test-only message type.

Inventory every cache key and response URL. Allow only:

- Workbox application-shell entries.
- The hashed generated release manifest.
- Exact paths listed in `release-manifest.json`.
- One completion-record URL for the matching release.

Assert zero local/session storage entries, zero IndexedDB databases, empty cookies, and no cache key or response URL containing `blob:`, `data:`, camera, frame, photo, landmark, geometry, diagnostic, device label, or device ID material.

- [ ] **Step 5: Preserve camera-overlay accessibility and responsive behavior**

Update readiness waits to allow **Getting smile detection ready** before **Camera ready**. Re-run portrait, landscape, tablet, desktop, 200% zoom, 400% equivalent, keyboard order, 48-pixel target, contrast, and reduced-motion assertions without weakening their thresholds.

- [ ] **Step 6: Build and run the browser suites**

```bash
npm run web:build
npm run web:e2e -- vision-runtime.spec.ts
npm run web:e2e -- foundation.spec.ts camera-overlay.spec.ts delivery-config.spec.ts
```

Expected: every Playwright test PASS against the built output with production headers.

- [ ] **Step 7: Commit browser acceptance evidence**

```bash
git add apps/web/e2e/vision-runtime.spec.ts apps/web/e2e/foundation.spec.ts apps/web/e2e/camera-overlay.spec.ts apps/web/e2e/serve-production.mjs
git commit -m "test: prove offline vision runtime delivery"
```

### Task 9: Document the boundary and run every release gate

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/privacy/README.md`
- Modify: `docs/validation/README.md`
- Modify: `docs/deployment/cloudflare-pages.md`
- Create: `docs/validation/ticket-03-device-matrix.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `apps/web/e2e/delivery-config.spec.ts`

**Interfaces:**

- Consumes: the verified implementation and automated evidence from Tasks 1–8.
- Produces: reviewer-facing architecture/privacy/provenance/operations documentation and real-device acceptance evidence.

- [ ] **Step 1: Write failing documentation-contract assertions**

Extend `delivery-config.spec.ts` to assert tracked docs contain these exact boundaries:

```ts
expect(architecture).toContain("@mediapipe/tasks-vision@0.10.35");
expect(architecture).toContain("classic worker");
expect(architecture).toContain("generation");
expect(privacy).toContain("Camera frames are never written to Cache Storage");
expect(validation).toContain(
  "online preparation followed by airplane-mode close/reopen",
);
expect(deployment).toContain("'wasm-unsafe-eval'");
expect(notices).toContain("MediaPipe");
expect(notices).toContain("Face Landmarker");
```

- [ ] **Step 2: Run the documentation test and verify it fails**

```bash
npm run web:build
npm run web:e2e -- delivery-config.spec.ts
```

Expected: FAIL on missing Ticket 03 documentation text.

- [ ] **Step 3: Update architecture, privacy, validation, deployment, README, and notices**

Document:

- main coordinator / classic worker / service worker ownership;
- exact package/model versions and manifest location;
- SIMD-first/baseline-once policy and no WebGPU;
- shell versus vision cache and completion-marker semantics;
- no dataset or custom model training;
- exact persisted static inventory and prohibited participant data;
- first-use-offline and integrity recovery;
- CSP rationale for `worker-src 'self'` and `'wasm-unsafe-eval'`;
- local commands for vendoring, manifest verification, tests, build, and offline browser acceptance;
- upstream source/license/model-card links and redistribution notices.

Do not claim that Ticket 03 detects smiles or processes frames.

- [ ] **Step 4: Create and execute the real-device matrix**

Create one row each for current iPhone Safari, current Android Chrome, MacBook Safari, and MacBook Chrome. For each, run online Continue until both runtime/offline ready, close the browser page, enable airplane mode, reopen, Continue, and verify Camera ready without network. Record only browser/OS class, release ID, model ID, SIMD/baseline tier, preparation duration, cache outcome, and pass/fail. Never record device labels, IDs, camera content, landmarks, geometry, scores, or persistent identifiers.

- [ ] **Step 5: Run the complete repository gate**

```bash
npm run web:vision:check
npm run web:format:check
npm run web:lint
npm run web:typecheck
npm run web:test
npm run web:build
npm run web:e2e
make python-test
make python-format-check
make python-lint
make python-mypy
git diff --check
```

Expected: every command exits 0, all prior camera tests stay green, the real runtime initializes from same-origin assets, and the worktree has no unexpected generated changes.

- [ ] **Step 6: Commit the documentation and acceptance slice**

```bash
git add README.md docs/architecture/README.md docs/privacy/README.md docs/validation/README.md docs/validation/ticket-03-device-matrix.md docs/deployment/cloudflare-pages.md THIRD_PARTY_NOTICES.md apps/web/e2e/delivery-config.spec.ts
git commit -m "docs: record offline vision runtime boundary"
```

- [ ] **Step 7: Perform the final Ticket 03 scope audit**

Run:

```bash
rg -n "detectForVideo|faceLandmarks|faceBlendshapes|mouthSmile|Smile Score|canvas|getImageData|toBlob" apps/web/src
git status --short
git log --oneline --decorate -10
```

Expected: no production frame submission, landmark extraction, smile scoring, canvas capture, or photo serialization exists; only MediaPipe initialization options may mention blendshape output. The branch contains the nine reviewable commits and no unrelated tracked changes.
