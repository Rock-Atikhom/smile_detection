# Worker Face Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Process bounded camera frames with the existing MediaPipe worker and show privacy-safe zero/one/multiple-face framing guidance.

**Architecture:** Extend the existing classic vision worker with an exact frame/evidence protocol. Because MediaPipe inference is synchronous, the main-thread coordinator owns a one-transferred-in-flight/one-latest-pending mailbox and transfers no second frame until matching evidence settles the first. Geometry is classified and discarded in the worker; the coordinator accepts only fresh current-generation categorical evidence, while a small frame pump creates aspect-preserving ImageBitmaps from the existing camera video element.

**Tech Stack:** React 19, TypeScript 6, Vite 8, MediaPipe Tasks Vision 0.10.35, classic Web Worker, ImageBitmap, Vitest 4, Testing Library, Playwright 1.62.

## Global Constraints

- Use the vendored official MediaPipe Face Landmarker float16/1; do not train a model or add a face-photo dataset.
- Run detectForVideo() only inside the existing dedicated classic worker with VIDEO mode, blendshape output, and numFaces = 2.
- Ticket 04 detects and frames faces only. Do not add Smile Score, continuity, lighting, stability, countdown, capture, review, download, or sharing.
- Visible Capture Zone: x = 0.20..0.80 and y = 0.12..0.82. Initial eligible center: x = 0.23..0.77 and y = 0.16..0.78.
- Eligible bounds stay inside the frame, width is at least 0.18, and height is 0.30..0.80 inclusive.
- Guidance priority: no-face, multiple-faces, too-close, too-far, off-center, face-ready.
- Carry generation, sequence, monotonic capture timestamp, dimensions, orientation, and tier on every frame and evidence message.
- Reject old-generation, duplicate, out-of-order, malformed, and older-than-150-ms results.
- Keep at most one transferred in-flight frame and one latest pending ImageBitmap end to end. The coordinator closes replaced/cancelled pending bitmaps; the worker closes processed/rejected/failed transferred bitmaps exactly once.
- Landmark arrays, blendshapes, boxes, coordinates, matrices, frames, object URLs, and identifiers never enter React state, persistence, diagnostics export, service-worker cache, or network traffic.
- Video and decorative Capture Zone remain aria-hidden; equivalent guidance uses the existing polite atomic semantic status.
- Preserve the documented Ticket 03 first-load blocker. Development may use a completed-cache reopen, but the preview is not release-ready until the Ticket 03 runtime journey passes.

---

## Planned File Structure

- Create apps/web/src/vision/face-evidence.ts and its test for pure geometry classification.
- Modify apps/web/src/vision/protocol.ts and its test for exact frame/evidence envelopes.
- Modify runtime-loader.ts and its test to retain detectForVideo on the prepared runtime.
- Modify worker-runtime.ts, worker-runtime.test.ts, and worker.ts for synchronous inference and exact transferred-bitmap settlement.
- Modify coordinator.ts and its test for frame submission and freshness filtering.
- Create face-frame-pump.ts and its test for aspect-preserving capture.
- Modify useVisionRuntime.ts and its test to expose frame submission.
- Modify App.tsx, App.test.tsx, and styles.css for accessible guidance.
- Create e2e/face-evidence.spec.ts and Ticket 04 validation documentation.

---

### Task 1: Define pure face-evidence classification

**Files:**

- Create: apps/web/src/vision/face-evidence.ts
- Test: apps/web/src/vision/face-evidence.test.ts

**Interfaces:**

- Consumes: readonly normalized point arrays shaped as { x: number; y: number }.
- Produces: classifyFaceLandmarks(faces): ClassifiedFaceEvidence.

- [ ] **Step 1: Write the failing literal-boundary tests**

```ts
const box = (left: number, top: number, right: number, bottom: number) => [
  { x: left, y: top },
  { x: right, y: top },
  { x: left, y: bottom },
  { x: right, y: bottom },
];

expect(classifyFaceLandmarks([box(0.41, 0.35, 0.59, 0.65)])).toEqual({
  eligible: true,
  faceCount: 1,
  guidance: "face-ready",
});
expect(classifyFaceLandmarks([]).guidance).toBe("no-face");
expect(
  classifyFaceLandmarks([box(0.4, 0.3, 0.6, 0.7), box(0.2, 0.2, 0.4, 0.6)])
    .guidance,
).toBe("multiple-faces");
expect(classifyFaceLandmarks([box(0.3, 0.05, 0.7, 0.86)]).guidance).toBe(
  "too-close",
);
expect(classifyFaceLandmarks([box(0.45, 0.4, 0.55, 0.6)]).guidance).toBe(
  "too-far",
);
expect(classifyFaceLandmarks([box(0.02, 0.3, 0.22, 0.7)]).guidance).toBe(
  "off-center",
);
```

- [ ] **Step 2: Verify RED**

Run: npm exec -- vitest run src/vision/face-evidence.test.ts

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal classifier**

```ts
export type FaceGuidance =
  | "no-face"
  | "multiple-faces"
  | "too-close"
  | "too-far"
  | "off-center"
  | "face-ready";

export interface ClassifiedFaceEvidence {
  eligible: boolean;
  faceCount: 0 | 1 | 2;
  guidance: FaceGuidance;
}

export function classifyFaceLandmarks(
  faces: readonly (readonly { x: number; y: number }[])[],
): ClassifiedFaceEvidence {
  const count = Math.min(faces.length, 2) as 0 | 1 | 2;
  if (count === 0)
    return { eligible: false, faceCount: 0, guidance: "no-face" };
  if (count === 2)
    return { eligible: false, faceCount: 2, guidance: "multiple-faces" };
  const bounds = normalizedBounds(faces[0] ?? []);
  if (!bounds) return { eligible: false, faceCount: 0, guidance: "no-face" };
  if (bounds.height > 0.8)
    return { eligible: false, faceCount: 1, guidance: "too-close" };
  if (bounds.width < 0.18 || bounds.height < 0.3) {
    return { eligible: false, faceCount: 1, guidance: "too-far" };
  }
  const centered =
    bounds.left >= 0 &&
    bounds.right <= 1 &&
    bounds.top >= 0 &&
    bounds.bottom <= 1 &&
    bounds.centerX >= 0.23 &&
    bounds.centerX <= 0.77 &&
    bounds.centerY >= 0.16 &&
    bounds.centerY <= 0.78;
  return centered
    ? { eligible: true, faceCount: 1, guidance: "face-ready" }
    : { eligible: false, faceCount: 1, guidance: "off-center" };
}
```

Implement normalizedBounds in the same file. Reject empty arrays, non-finite points, and non-positive bounds without returning coordinates.

- [ ] **Step 4: Add inclusivity, malformed-input, and capped-count tests**

Test exact width 0.18, height 0.30 and 0.80 as eligible; one literal below/above each bound as invalid. Test NaN, Infinity, empty single-face landmarks, out-of-frame bounds, and three faces capped to faceCount 2.

- [ ] **Step 5: Run GREEN and commit**

Run: npm exec -- vitest run src/vision/face-evidence.test.ts

```bash
git add apps/web/src/vision/face-evidence.ts apps/web/src/vision/face-evidence.test.ts
git commit -m "feat: define safe face evidence"
```

---

### Task 2: Extend the exact worker protocol

**Files:**

- Modify: apps/web/src/vision/protocol.ts
- Test: apps/web/src/vision/protocol.test.ts

**Interfaces:**

- Consumes: Task 1 FaceGuidance.
- Produces: VisionFrameCommand and VisionFaceEvidenceEvent in existing command/event unions.

- [ ] **Step 1: Write failing envelope tests**

```ts
const bitmap = {
  close: vi.fn(),
  height: 360,
  width: 640,
} as unknown as ImageBitmap;
expect(
  isVisionWorkerCommand({
    type: "FRAME",
    generation: 4,
    sequence: 12,
    capturedAtMs: 1500,
    width: 640,
    height: 360,
    orientation: "landscape",
    tier: "standard",
    bitmap,
  }),
).toBe(true);

expect(
  isVisionWorkerEvent({
    type: "FACE_EVIDENCE",
    generation: 4,
    sequence: 12,
    capturedAtMs: 1500,
    completedAtMs: 1540,
    width: 640,
    height: 360,
    orientation: "landscape",
    tier: "standard",
    faceCount: 1,
    guidance: "face-ready",
    eligible: true,
  }),
).toBe(true);
```

Add rejected fixtures for fractional sequence, non-finite time, zero dimensions, invalid orientation/tier, faceCount 3, eligible/guidance mismatch, missing bitmap close, and extra keys.

- [ ] **Step 2: Verify RED**

Run: npm exec -- vitest run src/vision/protocol.test.ts

Expected: valid new fixtures are rejected.

- [ ] **Step 3: Add exact types and guards**

```ts
export type VisionOrientation = "portrait" | "landscape";
export type VisionInferenceTier = "standard";

export type VisionFrameCommand = {
  type: "FRAME";
  generation: number;
  sequence: number;
  capturedAtMs: number;
  width: number;
  height: number;
  orientation: VisionOrientation;
  tier: VisionInferenceTier;
  bitmap: ImageBitmap;
};

export type VisionFaceEvidenceEvent = {
  type: "FACE_EVIDENCE";
  generation: number;
  sequence: number;
  capturedAtMs: number;
  completedAtMs: number;
  width: number;
  height: number;
  orientation: VisionOrientation;
  tier: VisionInferenceTier;
  faceCount: 0 | 1 | 2;
  guidance: FaceGuidance;
  eligible: boolean;
};
```

Require exact own-key sets, safe integers, finite non-negative timestamps, and eligible === (guidance === "face-ready").

- [ ] **Step 4: Run GREEN and commit**

Run: npm exec -- vitest run src/vision/protocol.test.ts

```bash
git add apps/web/src/vision/protocol.ts apps/web/src/vision/protocol.test.ts
git commit -m "feat: define face frame protocol"
```

---

### Task 3: Retain the prepared inference API

**Files:**

- Modify: apps/web/src/vision/runtime-loader.ts
- Test: apps/web/src/vision/runtime-loader.test.ts

**Interfaces:**

- Consumes: verified Face Landmarker initialization.
- Produces: PreparedVisionRuntime.detectForVideo(frame, timestampMs).

- [ ] **Step 1: Write the failing prepared-runtime test**

```ts
const detectForVideo = vi.fn(() => ({
  faceBlendshapes: [],
  faceLandmarks: [],
}));
dependencies.createLandmarker = vi.fn(async () => ({
  close: vi.fn(),
  detectForVideo,
}));
const prepared = await prepareVisionRuntime(input, dependencies);
prepared.detectForVideo(bitmap, 1234);
expect(detectForVideo).toHaveBeenCalledWith(bitmap, 1234);
expect(dependencies.createLandmarker).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({
    numFaces: 2,
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
  }),
);
```

- [ ] **Step 2: Verify RED**

Run: npm exec -- vitest run src/vision/runtime-loader.test.ts

Expected: prepared runtime has no detectForVideo and options still request one face.

- [ ] **Step 3: Return the minimal facade**

```ts
type PreparedLandmarker = Pick<FaceLandmarker, "close" | "detectForVideo">;

export interface PreparedVisionRuntime {
  wasmTier: "simd" | "baseline";
  detectForVideo(
    frame: ImageBitmap,
    timestampMs: number,
  ): ReturnType<PreparedLandmarker["detectForVideo"]>;
  close(): void;
}
```

Change the dependency type to PreparedLandmarker, return a forwarding detectForVideo method, and set numFaces to 2. Preserve all byte verification and SIMD fallback behavior.

- [ ] **Step 4: Run affected suites and commit**

Run: npm exec -- vitest run src/vision/runtime-loader.test.ts src/vision/worker-runtime.test.ts src/vision/integrity.test.ts

```bash
git add apps/web/src/vision/runtime-loader.ts apps/web/src/vision/runtime-loader.test.ts
git commit -m "feat: retain face inference runtime"
```

---

### Task 4: Settle synchronous worker frames safely

**Files:**

- Modify: apps/web/src/vision/worker-runtime.ts
- Test: apps/web/src/vision/worker-runtime.test.ts
- Modify: apps/web/src/vision/worker.ts

**Interfaces:**

- Consumes: Task 2 FRAME and Task 3 detectForVideo.
- Produces: FACE_EVIDENCE completion events and exact worker-owned ImageBitmap disposal.

- [ ] **Step 1: Write failing ownership tests**

Use the real synchronous `detectForVideo` contract. Assert each accepted frame produces categorical evidence and closes in `finally`. Add cases for FRAME before READY, old generation, CANCEL, dispose, inference throw, and malformed plain/non-plain FRAME-like input. Every rejected transferable bitmap must close even when the exact protocol guard rejects its envelope.

```ts
runtime.receive(frame(1, bitmapA));
expect(detectForVideo).toHaveBeenCalledWith(bitmapA, expect.any(Number));
expect(bitmapA.close).toHaveBeenCalledOnce();
expect(posted.at(-1)).toMatchObject({ type: "FACE_EVIDENCE", sequence: 1 });
```

- [ ] **Step 2: Verify RED**

Run: npm exec -- vitest run src/vision/worker-runtime.test.ts

Expected: frame commands are ignored without correct closure or evidence.

- [ ] **Step 3: Implement synchronous worker settlement**

```ts
interface ActiveGeneration {
  controller: AbortController;
  generation: number;
  prepared?: PreparedVisionRuntime;
}
```

processFrame calls synchronous detectForVideo, classifies landmarks, posts FACE_EVIDENCE only while current, and closes the processed bitmap in finally. Reject malformed FRAME-like envelopes through a safe own-data-property probe that closes any closeable transferred bitmap without invoking accessors. Producer-side bounded admission is implemented in Task 5.

- [ ] **Step 4: Prove no raw result crosses worker.ts**

worker.ts posts only validated VisionWorkerEvent objects. Do not attach FaceLandmarkerResult, landmarks, blendshapes, boxes, or coordinates.

- [ ] **Step 5: Run GREEN and commit**

Run: npm exec -- vitest run src/vision/face-evidence.test.ts src/vision/protocol.test.ts src/vision/runtime-loader.test.ts src/vision/worker-runtime.test.ts

```bash
git add apps/web/src/vision/worker-runtime.ts apps/web/src/vision/worker-runtime.test.ts apps/web/src/vision/worker.ts
git commit -m "feat: process latest face frame in worker"
```

---

### Task 5: Validate evidence, enforce producer backpressure, and pump frames

**Files:**

- Modify: apps/web/src/vision/coordinator.ts
- Test: apps/web/src/vision/coordinator.test.ts
- Create: apps/web/src/vision/face-frame-pump.ts
- Test: apps/web/src/vision/face-frame-pump.test.ts
- Modify: apps/web/src/vision/useVisionRuntime.ts
- Test: apps/web/src/vision/useVisionRuntime.test.tsx

**Interfaces:**

- Consumes: Task 2 evidence and camera video/generation.
- Produces: VisionFaceSnapshot, bounded submitFrame(), and an aspect-preserving pump.

- [ ] **Step 1: Write failing freshness/order tests**

Add dependency now: () => number. Accept one current event, then reject age 201 ms, wrong generation, duplicate sequence, decreasing sequence, event after cancel, and event after restart.

```ts
worker.dispatch(
  faceEvidence({ generation: 2, sequence: 8, capturedAtMs: 900 }),
);
expect(harness.snapshot().face.lastSequence).toBe(8);
now = 1101;
worker.dispatch(
  faceEvidence({ generation: 2, sequence: 9, capturedAtMs: 900 }),
);
expect(harness.snapshot().face.lastSequence).toBe(8);
expect(harness.snapshot().face.staleResults).toBe(1);
```

- [ ] **Step 2: Write failing transferable mailbox tests**

```ts
expect(coordinator.submitFrame(command)).toBe(true);
expect(worker.postMessage).toHaveBeenCalledWith(command, [command.bitmap]);
```

Submit A, B, then C before A settles. Assert only A transfers, B closes when C replaces it, and matching FACE_EVIDENCE for A transfers C. Evidence for another generation or sequence must not release C. When runtime is not ready, generation mismatches, cancellation, disposal, worker error, or postMessage throws, every coordinator-owned bitmap closes and submitFrame returns false where applicable.

- [ ] **Step 3: Implement the safe nested snapshot**

```ts
export interface VisionFaceSnapshot {
  state: "idle" | "detecting" | "ready" | "error";
  faceCount: 0 | 1 | 2;
  guidance: FaceGuidance | null;
  eligible: boolean;
  lastSequence: number | null;
  staleResults: number;
}
```

Add face to VisionSnapshot. Track one transferred in-flight sequence and one latest pending command. Matching current-generation FACE_EVIDENCE settles the in-flight sequence and transfers the pending command before freshness publication checks; stale evidence still settles ownership, while wrong-generation/sequence evidence does not. Accept evidence only when 0 <= now() - capturedAtMs <= 150 and sequence strictly increases for the current worker generation. Reset face state and close coordinator-owned pending bitmaps on cancellation/restart/disposal/error. Change VisionWorkerPort.postMessage to accept an optional Transferable array.

- [ ] **Step 4: Write failing frame-pump tests**

```ts
await pump.tick({ generation: 3, width: 1280, height: 720 });
expect(capture).toHaveBeenCalledWith({ width: 640, height: 360 });
expect(submit).toHaveBeenCalledWith(
  expect.objectContaining({
    generation: 3,
    sequence: 0,
    orientation: "landscape",
    tier: "standard",
  }),
);
```

Cover portrait 360x640, zero video dimensions, no overlapping capture promises, submit-failure closure, generation reset, stop, and dispose.

- [ ] **Step 5: Implement the framework-free pump**

Constrain longest side to 640 without cropping:

```ts
const scale = Math.min(1, 640 / Math.max(sourceWidth, sourceHeight));
const width = Math.max(1, Math.round(sourceWidth * scale));
const height = Math.max(1, Math.round(sourceHeight * scale));
```

The browser capture dependency uses createImageBitmap(video, { resizeWidth, resizeHeight, resizeQuality: "medium" }). The pump owns only capture-in-progress and sequence; every successful bitmap is immediately handed to the coordinator mailbox or closed.

- [ ] **Step 6: Expose submitFrame from useVisionRuntime**

If the coordinator is unavailable, close the bitmap and return false. React state never stores the bitmap.

- [ ] **Step 7: Run GREEN and commit**

Run: npm exec -- vitest run src/vision/coordinator.test.ts src/vision/face-frame-pump.test.ts src/vision/useVisionRuntime.test.tsx

```bash
git add apps/web/src/vision/coordinator.ts apps/web/src/vision/coordinator.test.ts apps/web/src/vision/face-frame-pump.ts apps/web/src/vision/face-frame-pump.test.ts apps/web/src/vision/useVisionRuntime.ts apps/web/src/vision/useVisionRuntime.test.tsx
git commit -m "feat: submit fresh camera frames"
```

---

### Task 6: Integrate accessible guidance

**Files:**

- Modify: apps/web/src/App.tsx
- Test: apps/web/src/App.test.tsx
- Modify: apps/web/src/styles.css

**Interfaces:**

- Consumes: camera state/video and VisionFaceSnapshot.
- Produces: one semantic and visual guidance state.

- [ ] **Step 1: Write failing copy tests**

```ts
it.each([
  ["no-face", "Show your face"],
  ["multiple-faces", "Only one person"],
  ["too-close", "Move back"],
  ["too-far", "Move closer"],
  ["off-center", "Center your face"],
  ["face-ready", "Face ready"],
] as const)("renders %s", (guidance, text) => {
  visionSnapshot.face = { ...readyFace, guidance, eligible: guidance === "face-ready" };
  render(<App />);
  expect(screen.getByRole("status", { name: "Camera status" })).toHaveTextContent(text);
});
```

Assert camera/runtime recovery remains higher priority, repeated identical evidence has one semantic status, video and Capture Zone are aria-hidden, and Stop/Switch remain enabled.

- [ ] **Step 2: Verify RED**

Run: npm exec -- vitest run src/App.test.tsx

Expected: camera-ready copy ignores face guidance.

- [ ] **Step 3: Start the pump only for ready camera/runtime**

Schedule at most one tick per 100 ms, keyed by camera generation. Cleanup cancels the scheduler and disposes the pump before switch, stop, or unmount.

- [ ] **Step 4: Render the literal copy table**

```ts
const faceGuidanceCopy: Record<FaceGuidance, string> = {
  "no-face": "Show your face",
  "multiple-faces": "Only one person",
  "too-close": "Move back",
  "too-far": "Move closer",
  "off-center": "Center your face",
  "face-ready": "Face ready",
};
```

Use it after recovery checks and only when evidence is ready. Add warning/ready visual classes without color-only meaning.

- [ ] **Step 5: Run component suites and commit**

Run: npm exec -- vitest run src/App.test.tsx src/vision/useVisionRuntime.test.tsx src/camera/session.test.ts

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/styles.css
git commit -m "feat: guide one face in camera overlay"
```

---

### Task 7: Add browser, privacy, and device evidence

**Files:**

- Create: apps/web/e2e/face-evidence.spec.ts
- Modify: docs/architecture/README.md
- Modify: docs/privacy/README.md
- Create: docs/validation/ticket-04-device-matrix.md
- Modify: .scratch/smart-smile-pwa/issues/04-guide-one-participant-with-worker-face-evidence.md

**Interfaces:**

- Consumes: Tasks 1-6.
- Produces: browser/privacy evidence and honest dependency status.

- [ ] **Step 1: Write a failing Playwright journey**

Use a deterministic Worker seam installed before navigation to emit exact FACE_EVIDENCE messages while exercising the real coordinator, generation guards, UI, camera lifecycle, storage, and network policy. Verify all six guidance strings, stale/wrong-generation rejection, Stop cleanup, and Switch generation clearing.

```ts
await expect(page.getByRole("status", { name: "Camera status" })).toContainText(
  "Face ready",
);
expect(
  await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
  })),
).toEqual({ local: 0, session: 0 });
expect(
  requests.every((url) => new URL(url).origin === new URL(page.url()).origin),
).toBe(true);
```

If a production Worker injection seam is necessary, it must be an exact optional factory read only during worker construction and must expose no participant data or UI control. Prefer Playwright routing of the built worker script.

- [ ] **Step 2: Verify browser RED then GREEN**

Run: npm exec -- playwright test face-evidence.spec.ts

Expected RED before the journey support exists; expected GREEN after the minimal seam and implementation.

- [ ] **Step 3: Update boundary documentation**

Record that frames transfer only to the worker, React receives categorical evidence only, no dataset is used, Smile Score remains Ticket 05, and the Ticket 03 first-load race remains a release blocker. Mark issue 04 complete only after review and available device evidence.

- [ ] **Step 4: Run every automated gate**

```bash
npm run web:vision:check
npm run web:format:check
npm run web:lint
npm run web:typecheck
npm run web:test
npm run web:build
npm run web:e2e -- delivery-config.spec.ts
npm exec -- playwright test face-evidence.spec.ts
npm run web:e2e
git diff --check
```

Expected: zero failures. The known upstream inlineDynamicImports deprecation is the only accepted warning.

- [ ] **Step 5: Run manual real-camera acceptance**

After a completed Ticket 03 cache and reopen, verify Mac Safari/Chrome and Android Chrome: no face, second face, too small/large/off-center, eligible face, Stop, Switch, 60-second responsiveness, and absence of camera/evidence data in storage/network. Store no face screenshots, device IDs, landmarks, or coordinates in the repository.

- [ ] **Step 6: Commit acceptance artifacts**

```bash
git add apps/web/e2e/face-evidence.spec.ts docs/architecture/README.md docs/privacy/README.md docs/validation/ticket-04-device-matrix.md .scratch/smart-smile-pwa/issues/04-guide-one-participant-with-worker-face-evidence.md
git commit -m "test: verify worker face evidence"
```

## Release Boundary

Request task review after every task and a whole-branch review after Task 7. Do not push a professor-facing preview until the branch is review-clean and all available automated gates pass. Because the dependent Ticket 03 first-load browser journey is red, label any Ticket 04 preview as a development demonstration and instruct testers to complete online cache preparation and reopen before face testing. Actual Smile Score remains Ticket 05.
