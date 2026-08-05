# Anonymous Continuity and Sustained Smile Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn fresh worker face evidence into anonymous three-observation continuity and a five-second, participant-facing sustained-smile verification flow.

**Architecture:** The inference worker reduces MediaPipe output to one ephemeral normalized observation plus one aggregate raw Smile Score; landmarks and blendshape arrays never cross the worker boundary. The coordinator rejects stale evidence before a pure continuity tracker and pure verification reducer can change state, then publishes only qualitative continuity/progress and current aggregate scores. React renders plain-language progress while the diagnostics drawer may show current numeric aggregates without retaining a time series.

**Tech Stack:** React 19, TypeScript 6, Vite 8, MediaPipe Tasks Vision 0.10.35, classic Web Worker, Vitest 4, Testing Library, Playwright 1.62.

## Global Constraints

- Use the vendored official MediaPipe Face Landmarker float16/1 and its `mouthSmileLeft` and `mouthSmileRight` blendshape categories; do not train a model or add a face-photo dataset.
- `rawScore = clamp(0.6 * min(left, right) + 0.4 * ((left + right) / 2), 0, 1)`; missing, duplicate, non-finite, or out-of-range smile categories produce `0`.
- Default EMA alpha is `0.35`, high threshold is `0.60`, low threshold is `0.45`, invalidity Grace Window is `300 ms`, and Verification duration is `5,000 ms`.
- Enforce alpha `0.15..0.60`, high threshold `0.45..0.80`, low threshold `0.35..0.70`, `low < high`, and hysteresis gap at least `0.05`.
- Anonymous continuity requires three consecutive eligible observations; match center distance `<= 0.15`, height ratio `0.67..1.50`, maximum normalized anchor delta `<= 0.12`, and reference adaptation factor `0.25`.
- Anchors are left-eye center (landmarks `33`, `133`), right-eye center (`362`, `263`), nose tip (`1`), and mouth center (`13`, `14`), normalized around face center by face height. They are ephemeral geometry, not recognition embeddings.
- The established participant may use the approved `0.03` Capture Zone tolerance. No-face, multiple-face, position-invalid, and nonmatching observations hold the old track for at most `300 ms`; a replacement cannot inherit progress.
- Only evidence accepted as current runtime generation, current camera generation, strictly increasing sequence, and age `0..150 ms` may update continuity, EMA, hysteresis, or Verification.
- Verification time is accumulated only between consecutive valid accepted capture timestamps. Grace pauses rather than advances progress; expiry resets to zero.
- Stop, restart, camera switch, visibility resume, orientation reconstruction, stream loss, worker fault, cancellation, disposal, runtime generation change, or camera generation change clears continuity, filter state, Grace state, and Verification progress.
- Worker-to-coordinator evidence may contain one fixed-size normalized observation and one raw aggregate score. Observation geometry and blendshape arrays never enter `VisionSnapshot`, React state, DOM, diagnostics, persistence, service-worker cache, or network traffic.
- Participant mode shows `Smile when you are ready`, `Keep smiling`, and qualitative progress; it never shows raw or smoothed scores. Help may show only the current raw/smoothed aggregate, thresholds, hysteresis state, continuity state, and Grace state.
- Do not add lighting, stability, countdown, capture, review, download, sharing, threshold editing, participant calibration, recognition, names, persistent identifiers, or analytics.
- Preserve the bounded one-in-flight/one-latest-pending mailbox and the documented Ticket 03 first-load blocker. A development preview is not release-ready until inherited blockers and physical-device rows pass.

---

## Planned File Structure

- Create `apps/web/src/vision/smile-score.ts` and tests for profile validation, bilateral score, EMA, and hysteresis.
- Create `apps/web/src/vision/face-continuity.ts` and tests for ephemeral observation derivation and continuity.
- Create `apps/web/src/vision/smile-verification.ts` and tests for timestamp-driven Verification and Grace behavior.
- Modify `face-evidence.ts`, `protocol.ts`, `worker-runtime.ts`, and tests to emit exact reduced observations and aggregate scores.
- Modify `coordinator.ts`, `App.tsx`, styles, and tests to own accepted continuity/Verification state and present semantic progress.
- Create `e2e/smile-verification.spec.ts`, numeric calibration fixtures, and Ticket 05 validation documentation.

---

### Task 1: Define the calibrated Smile Score contract

**Files:**

- Create: `apps/web/src/vision/smile-score.ts`
- Test: `apps/web/src/vision/smile-score.test.ts`
- Create: `apps/web/src/vision/fixtures/smile-reference.json`

**Interfaces:**

- Consumes: readonly MediaPipe category-shaped `{ categoryName: string; score: number }` values.
- Produces: `DEFAULT_SMILE_PROFILE`, `validateSmileProfile`, `calculateRawSmileScore`, `createSmileFilterState`, and `updateSmileFilter`.

- [ ] **Step 1: Write failing literal formula and invalid-evidence tests**

```ts
expect(calculateRawSmileScore(categories(0.8, 0.8))).toBeCloseTo(0.8, 12);
expect(calculateRawSmileScore(categories(0.8, 0.4))).toBeCloseTo(0.48, 12);
expect(calculateRawSmileScore([])).toBe(0);
expect(
  calculateRawSmileScore([{ categoryName: "mouthSmileLeft", score: NaN }]),
).toBe(0);
expect(calculateRawSmileScore(categories(1.01, 0.8))).toBe(0);
expect(
  calculateRawSmileScore([...categories(0.8, 0.8), ...categories(0.7, 0.7)]),
).toBe(0);
```

- [ ] **Step 2: Verify RED**

Run: `npm exec -- vitest run src/vision/smile-score.test.ts`

Expected: FAIL because `smile-score.ts` does not exist.

- [ ] **Step 3: Implement the exact profile and bilateral score**

```ts
export interface SmileProfile {
  alpha: number;
  highThreshold: number;
  lowThreshold: number;
  graceMs: number;
  verificationMs: number;
}

export const DEFAULT_SMILE_PROFILE: Readonly<SmileProfile> = Object.freeze({
  alpha: 0.35,
  highThreshold: 0.6,
  lowThreshold: 0.45,
  graceMs: 300,
  verificationMs: 5_000,
});

export function calculateRawSmileScore(
  categories: readonly { categoryName: string; score: number }[],
): number {
  const left = uniqueScore(categories, "mouthSmileLeft");
  const right = uniqueScore(categories, "mouthSmileRight");
  if (left === undefined || right === undefined) return 0;
  const mean = (left + right) / 2;
  return Math.min(1, Math.max(0, 0.6 * Math.min(left, right) + 0.4 * mean));
}
```

`uniqueScore` returns a value only for exactly one matching finite coefficient in `0..1`. `validateSmileProfile` returns a frozen copy or throws `RangeError` for every disallowed range, ordering, gap, non-finite value, non-positive `graceMs`, or non-positive `verificationMs`.

- [ ] **Step 4: Write failing EMA, hysteresis, profile-boundary, and reference-fixture tests**

```ts
let state = createSmileFilterState();
state = updateSmileFilter(state, 1);
expect(state).toEqual({ smoothedScore: 0.35, smileValid: false });
state = updateSmileFilter(state, 1);
state = updateSmileFilter(state, 1);
expect(state.smileValid).toBe(true);
state = updateSmileFilter(state, 0);
expect(state.smileValid).toBe(true);
while (state.smoothedScore >= 0.45) state = updateSmileFilter(state, 0);
expect(state.smileValid).toBe(false);
```

Use literal expected raw/smoothed values in `smile-reference.json` for balanced, asymmetric, neutral, and noisy-boundary traces ported from the approved desktop prototype. Test inclusive range endpoints and reject a `0.049` gap.

- [ ] **Step 5: Implement EMA/hysteresis and run GREEN**

```ts
export interface SmileFilterState {
  smoothedScore: number;
  smileValid: boolean;
}

export function updateSmileFilter(
  previous: SmileFilterState,
  rawScore: number,
  profile: Readonly<SmileProfile> = DEFAULT_SMILE_PROFILE,
): SmileFilterState {
  const score =
    Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 1 ? rawScore : 0;
  const smoothedScore =
    profile.alpha * score + (1 - profile.alpha) * previous.smoothedScore;
  const smileValid = previous.smileValid
    ? smoothedScore >= profile.lowThreshold
    : smoothedScore >= profile.highThreshold;
  return { smoothedScore, smileValid };
}
```

Run: `npm exec -- vitest run src/vision/smile-score.test.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/vision/smile-score.ts apps/web/src/vision/smile-score.test.ts apps/web/src/vision/fixtures/smile-reference.json
git commit -m "feat: define calibrated smile score"
```

---

### Task 2: Track anonymous continuity from ephemeral observations

**Files:**

- Create: `apps/web/src/vision/face-continuity.ts`
- Test: `apps/web/src/vision/face-continuity.test.ts`
- Modify: `apps/web/src/vision/face-evidence.ts`
- Test: `apps/web/src/vision/face-evidence.test.ts`

**Interfaces:**

- Consumes: one accepted timestamped face analysis from `analyzeFaceLandmarks`.
- Produces: `NormalizedFaceObservation`, `ContinuityState`, `ContinuityReason`, and `createFaceContinuityTracker()`.

- [ ] **Step 1: Write failing observation tests**

Construct a 478-point literal fixture with the required anchor indices and bounding extrema. Assert the resulting observation has center, width, height, and an eight-number anchor vector normalized around center by height. Assert empty, short, non-finite, and zero-height landmarks return no observation. Keep `classifyFaceLandmarks` public output unchanged.

```ts
const analysis = analyzeFaceLandmarks([landmarks]);
expect(analysis.observation).toMatchObject({
  centerX: 0.5,
  centerY: 0.5,
  width: 0.3,
  height: 0.5,
});
expect(analysis.observation?.anchors).toHaveLength(8);
expect(classifyFaceLandmarks([landmarks])).toEqual({
  eligible: true,
  faceCount: 1,
  guidance: "face-ready",
});
```

- [ ] **Step 2: Verify observation RED, implement, and run GREEN**

Run: `npm exec -- vitest run src/vision/face-evidence.test.ts`

Add `analyzeFaceLandmarks` with `initialEligible` and `tolerantEligible`. Tolerant eligibility expands only the inner center zone by `0.03`; frame, width, and height limits remain unchanged. Do not expose observation data through `ClassifiedFaceEvidence`.

Run: `npm exec -- vitest run src/vision/face-evidence.test.ts`

- [ ] **Step 3: Write failing three-match, boundary, adaptation, grace, and replacement tests**

```ts
const tracker = createFaceContinuityTracker();
expect(tracker.update(analysisAt(0, faceA))).toMatchObject({
  state: "candidate",
  consecutiveMatches: 1,
});
expect(tracker.update(analysisAt(75, movedA))).toMatchObject({
  state: "candidate",
  consecutiveMatches: 2,
});
expect(tracker.update(analysisAt(150, movedAgainA))).toMatchObject({
  state: "ready",
  consecutiveMatches: 3,
});
expect(tracker.update(noFaceAt(250))).toMatchObject({
  state: "grace",
  reason: "no-face",
});
expect(tracker.update(analysisAt(300, movedA))).toMatchObject({
  state: "ready",
});
expect(tracker.update(analysisAt(350, replacementB))).toMatchObject({
  state: "grace",
  reason: "nonmatch",
});
expect(tracker.update(analysisAt(651, replacementB))).toMatchObject({
  state: "candidate",
  consecutiveMatches: 1,
  reset: true,
});
```

Test center distance exactly `0.15`, scale exactly `0.67` and `1.50`, anchor delta exactly `0.12`, each just outside boundary, adaptation factor `0.25`, established-zone tolerance, no-face, multiple faces, off-zone observations, recovery at exactly `300 ms`, expiry above `300 ms`, reset, and decreasing timestamps.

- [ ] **Step 4: Implement the tracker**

```ts
export type ContinuityState = "empty" | "candidate" | "ready" | "grace";
export type ContinuityReason =
  | "none"
  | "warming"
  | "no-face"
  | "multiple-faces"
  | "position"
  | "nonmatch"
  | "expired";

export interface FaceContinuityTracker {
  update(input: TimestampedFaceAnalysis): ContinuityResult;
  reset(): void;
}
```

Match with Euclidean center distance, height ratio, and the maximum per-anchor Euclidean delta. Adapt center, width, height, and every anchor coordinate by `old * 0.75 + current * 0.25`. During Grace retain the old reference and never adapt toward invalid or replacement observations. After expiry, an initially eligible current face may seed a new candidate but returns `reset: true`.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm exec -- vitest run src/vision/face-evidence.test.ts src/vision/face-continuity.test.ts`

```bash
git add apps/web/src/vision/face-evidence.ts apps/web/src/vision/face-evidence.test.ts apps/web/src/vision/face-continuity.ts apps/web/src/vision/face-continuity.test.ts
git commit -m "feat: track anonymous face continuity"
```

---

### Task 3: Define timestamp-driven sustained Verification

**Files:**

- Create: `apps/web/src/vision/smile-verification.ts`
- Test: `apps/web/src/vision/smile-verification.test.ts`

**Interfaces:**

- Consumes: accepted capture timestamp, continuity result, face eligibility, and raw score.
- Produces: `SmileVerificationState` through `createSmileVerificationState` and `advanceSmileVerification`.

- [ ] **Step 1: Write failing neutral, threshold, five-second, Grace, and reset tests**

Use literal timestamped samples. Neutral and speech traces never leave `waiting`. A valid trace enters `verifying` only after continuity is `ready` and the smoothed score reaches `0.60`. Verify that a `200 ms` invalid interval holds progress and adds zero time after recovery, an invalid interval above `300 ms` resets, and exactly `5,000 ms` of accumulated valid intervals becomes `complete`.

```ts
let state = createSmileVerificationState();
state = advanceSmileVerification(
  state,
  sample({ capturedAtMs: 1_000, rawScore: 1, continuity: "ready" }),
);
state = advanceSmileVerification(
  state,
  sample({ capturedAtMs: 1_100, rawScore: 1, continuity: "ready" }),
);
state = advanceSmileVerification(
  state,
  sample({ capturedAtMs: 1_200, rawScore: 1, continuity: "ready" }),
);
expect(state.phase).toBe("verifying");
expect(state.progressMs).toBe(0);
```

- [ ] **Step 2: Verify RED**

Run: `npm exec -- vitest run src/vision/smile-verification.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure transition function**

```ts
export type VerificationPhase = "waiting" | "verifying" | "paused" | "complete";
export type VerificationReason =
  "none" | "warming" | "face-invalid" | "continuity-lost" | "smile-lost";

export interface SmileVerificationState {
  phase: VerificationPhase;
  reason: VerificationReason;
  filter: SmileFilterState;
  progressMs: number;
  invalidSinceMs: number | null;
  lastCapturedAtMs: number | null;
  previousSampleValid: boolean;
}
```

Reject non-finite/decreasing capture timestamps by returning the previous state. A `candidate`, `empty`, or continuity `reset` clears progress immediately. `grace` pauses. Smile/face invalidity begins Grace; expiry is strictly greater than `300 ms`. Recovery adds no invalid interval. Cap progress at `5,000 ms`.

- [ ] **Step 4: Add deterministic property loops**

For all literal grid pairs `left/right = 0, 0.1, ... 1`, assert raw and smoothed score remain in `0..1`. For seeded monotonically increasing timestamp sequences, assert progress never decreases except on reset, never exceeds `5,000`, cannot advance during invalid samples, and a runtime reset returns the exact initial state.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm exec -- vitest run src/vision/smile-score.test.ts src/vision/smile-verification.test.ts`

```bash
git add apps/web/src/vision/smile-verification.ts apps/web/src/vision/smile-verification.test.ts
git commit -m "feat: verify sustained smile timing"
```

---

### Task 4: Reduce worker output to exact smile/continuity evidence

**Files:**

- Modify: `apps/web/src/vision/protocol.ts`
- Test: `apps/web/src/vision/protocol.test.ts`
- Modify: `apps/web/src/vision/worker-runtime.ts`
- Test: `apps/web/src/vision/worker-runtime.test.ts`

**Interfaces:**

- Consumes: Task 1 score calculation and Task 2 face analysis.
- Produces: exact `VisionFaceEvidenceEvent` carrying `observation` and `rawSmileScore`, with no raw MediaPipe collections.

- [ ] **Step 1: Write failing exact-protocol tests**

Extend the event fixture with:

```ts
observation: {
  centerX: 0.5,
  centerY: 0.5,
  width: 0.3,
  height: 0.5,
  anchors: [
    -0.25, -0.2,
     0.25, -0.2,
     0.0,  0.0,
     0.0,  0.3,
  ],
},
rawSmileScore: 0.72,
```

Accept `observation: null` only when a usable single-face observation is absent. Reject extra/missing keys, non-finite/out-of-range observation values, anchor lengths other than eight, non-finite/out-of-range raw score, and accessor/non-plain nested objects.

- [ ] **Step 2: Verify protocol RED, implement exact guards, and run GREEN**

Run: `npm exec -- vitest run src/vision/protocol.test.ts`

Define a protocol-only data observation with a tuple of eight numbers. Validate nested objects by exact own-key sets and own data properties. Do not export the observation from `VisionSnapshot`.

Run: `npm exec -- vitest run src/vision/protocol.test.ts`

- [ ] **Step 3: Write failing real-worker reduction tests**

Return one face landmark fixture and a complete MediaPipe blendshape classification:

```ts
detectForVideo.mockReturnValueOnce({
  faceLandmarks: [landmarks],
  faceBlendshapes: [
    {
      categories: [
        {
          categoryName: "mouthSmileLeft",
          displayName: "",
          index: 44,
          score: 0.8,
        },
        {
          categoryName: "mouthSmileRight",
          displayName: "",
          index: 45,
          score: 0.4,
        },
      ],
      headIndex: 0,
      headName: "",
    },
  ],
  facialTransformationMatrixes: [],
});
```

Assert the posted event contains `rawSmileScore: 0.48` and one normalized observation, but JSON text contains none of `faceLandmarks`, `faceBlendshapes`, `categoryName`, `mouthSmileLeft`, or `mouthSmileRight`. Test no face, multiple faces, missing classification, invalid coefficient, generation rejection, inference failure, cancellation, and bitmap closure.

- [ ] **Step 4: Implement worker reduction and run GREEN**

The worker calls `analyzeFaceLandmarks`, selects blendshapes only when there is exactly one face and one corresponding classification, calculates the aggregate raw score, clones the fixed observation into a plain data object, posts the exact event, and closes the bitmap in `finally`.

Run: `npm exec -- vitest run src/vision/protocol.test.ts src/vision/worker-runtime.test.ts src/vision/runtime-loader.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/vision/protocol.ts apps/web/src/vision/protocol.test.ts apps/web/src/vision/worker-runtime.ts apps/web/src/vision/worker-runtime.test.ts
git commit -m "feat: emit reduced smile evidence"
```

---

### Task 5: Accept evidence into continuity and Verification state

**Files:**

- Modify: `apps/web/src/vision/coordinator.ts`
- Test: `apps/web/src/vision/coordinator.test.ts`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**

- Consumes: Tasks 2–4 only after existing freshness/order checks pass.
- Produces: nested `VisionContinuitySnapshot` and `VisionVerificationSnapshot` without observation geometry.

- [ ] **Step 1: Write failing accepted-only state tests**

Drive three fresh matching observations and assert continuity changes candidate `1`, candidate `2`, ready `3`. Send an old runtime generation, old camera generation, duplicate sequence, decreasing sequence, and age `151 ms`; assert none changes continuity, EMA, phase, or progress. A matching stale event may still settle transferable ownership but cannot alter semantic state.

- [ ] **Step 2: Write failing reset-boundary tests**

Build nonzero progress, then independently exercise `cancel`, `restart`, newer camera generation, worker `error`, worker `messageerror`, protocol `ERROR`, disposal, and App Stop/Switch. Each must restore idle continuity and waiting/zero Verification while preserving only the existing stale counter where documented.

- [ ] **Step 3: Implement private machines and safe snapshots**

```ts
export interface VisionContinuitySnapshot {
  state: ContinuityState;
  reason: ContinuityReason;
  consecutiveMatches: number;
}

export interface VisionVerificationSnapshot {
  phase: VerificationPhase;
  reason: VerificationReason;
  rawScore: number | null;
  smoothedScore: number | null;
  smileValid: boolean;
  progressMs: number;
  progressRatio: number;
  graceRemainingMs: number | null;
}
```

The coordinator owns one tracker and one verification state, recreates both at every reset boundary, and updates them only after `publishFaceEvidence` accepts freshness and ordering. Copy no observation or anchor field into either snapshot. Compute ratio as `progressMs / 5_000`, capped to `0..1`.

- [ ] **Step 4: Increase capture opportunity to the approved continuity cadence**

Change the App frame scheduler from `100 ms` to `50 ms`, retaining one capture-in-progress and coordinator mailbox backpressure. Update fake-timer tests to prove no overlapping bitmap capture and no more than one scheduling attempt per `50 ms`.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm exec -- vitest run src/vision/coordinator.test.ts src/vision/face-frame-pump.test.ts src/App.test.tsx`

```bash
git add apps/web/src/vision/coordinator.ts apps/web/src/vision/coordinator.test.ts apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat: coordinate smile verification"
```

---

### Task 6: Present accessible qualitative progress and current diagnostics

**Files:**

- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**

- Consumes: Task 5 snapshots.
- Produces: one participant status, one semantic progress element, and read-only current diagnostics.

- [ ] **Step 1: Write failing participant-copy and progress tests**

Assert these priority outcomes after camera/runtime recovery states:

```ts
expect(statusFor({ face: "face-ready", continuity: "candidate" })).toBe(
  "Hold still",
);
expect(
  statusFor({ face: "face-ready", continuity: "ready", phase: "waiting" }),
).toBe("Smile when you are ready");
expect(
  statusFor({ face: "face-ready", continuity: "ready", phase: "verifying" }),
).toBe("Keep smiling");
expect(
  statusFor({
    face: "face-ready",
    continuity: "ready",
    phase: "paused",
    reason: "smile-lost",
  }),
).toBe("Keep smiling");
expect(
  statusFor({ face: "face-ready", continuity: "ready", phase: "complete" }),
).toBe("Smile verified");
```

Assert no raw/smoothed number occurs in participant DOM text. While verifying/paused/complete, require a native `progress` element named `Smile verification progress`, with `max=5000`, current `value`, and visible text `Building smile progress`, `Smile progress paused`, or `Smile verification complete`.

- [ ] **Step 2: Verify RED and implement semantic participant UI**

Run: `npm exec -- vitest run src/App.test.tsx`

Render progress outside the Capture Zone and inside the protected bottom chrome. Keep video/guide aria-hidden, the stable polite atomic status, Stop/Switch behavior, 48-pixel controls, reduced-motion behavior, and non-color text/icon semantics.

- [ ] **Step 3: Write failing diagnostics tests**

Open Help and assert current values render as two decimal places with literal labels `Raw smile aggregate`, `Smoothed smile aggregate`, `High threshold`, `Low threshold`, `Smile state`, `Continuity`, and `Grace Window`. Close Help, advance evidence, reopen, and assert only the current instant is shown; no event list or score/time series exists.

- [ ] **Step 4: Implement diagnostics and responsive styling**

Use `0.60`/`0.45` literals from the default profile and `Not available` before evidence. Add a progress track with contrast-safe fill, no pulse, and a discrete reduced-motion update. At mobile width keep progress above Stop/Switch; at desktop keep it centered and never cover the face guide.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm exec -- vitest run src/App.test.tsx src/vision/coordinator.test.ts`

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/styles.css
git commit -m "feat: show sustained smile progress"
```

---

### Task 7: Prove browser behavior, calibration, privacy, and device status

**Files:**

- Create: `apps/web/e2e/smile-verification.spec.ts`
- Modify: `apps/web/e2e/vision-runtime.spec.ts`
- Modify: `docs/architecture/README.md`
- Modify: `docs/privacy/README.md`
- Create: `docs/validation/ticket-05-calibration.md`
- Create: `docs/validation/ticket-05-device-matrix.md`
- Modify: `.scratch/smart-smile-pwa/issues/05-verify-continuity-and-sustained-smile.md`

**Interfaces:**

- Consumes: Tasks 1–6.
- Produces: deterministic browser/privacy evidence, browser-versus-reference numeric report, and honest physical-device checklist.

- [ ] **Step 1: Write the failing Playwright journey**

Install an exact Worker seam before navigation. It must respond to real FRAME commands with exact events containing fixed observations and aggregate scores while the real coordinator, camera lifecycle, generation checks, React UI, storage, and network policy remain active.

Prove:

1. three matching observations reach `Smile when you are ready`;
2. neutral and speech-like aggregates never start progress;
3. broad and asymmetric traces cross hysteresis and display `Keep smiling`;
4. brief no-face interruption pauses without advancing and same-face recovery resumes;
5. replacement during Grace cannot inherit progress, and expiry resets before a new candidate warms;
6. exactly `5,000 ms` accepted valid capture time reaches `Smile verified`;
7. Stop and Switch clear progress;
8. stale/wrong-generation conflicting evidence cannot change the visible state;
9. storage stays empty and every request remains same-origin.

- [ ] **Step 2: Verify browser RED then GREEN**

Run: `npm exec -- playwright test smile-verification.spec.ts`

Expected RED before the coordinator/UI support is present; expected GREEN after Tasks 1–6.

- [ ] **Step 3: Reconcile inherited real-runtime assertions**

Update the existing real-runtime journey to wait for a Ticket 05 semantic result (`Move into the frame`, `Hold still`, or `Smile when you are ready`) rather than the superseded `Camera ready` heading. Keep the inherited first-load race visible as a separate blocker; do not hide it with unconditional retry.

- [ ] **Step 4: Record calibration and privacy evidence**

`ticket-05-calibration.md` records the default profile, SHA-256 of `smile-reference.json`, each trace name, desktop expected values, browser TypeScript values, and zero numeric differences beyond `1e-12`. It states that external GENKI-4K/UvA-NEMO datasets are not redistributed and remain future release-validation inputs.

Architecture/privacy docs state that a fixed ephemeral observation crosses only worker-to-coordinator, is discarded after accepted processing, and never appears in snapshots, DOM, reports, storage, service-worker caches, or network. The device matrix starts with automated Chromium pass and physical Safari/Chrome/Android rows pending.

- [ ] **Step 5: Run every automated gate**

```bash
npm run web:vision:check
npm run web:format:check
npm run web:lint
npm run web:typecheck
npm run web:test
npm run web:build
npm exec -- playwright test face-evidence.spec.ts smile-verification.spec.ts
npm run web:e2e
git diff --check
git status --short --branch
```

The full inherited browser suite may remain red only for a separately documented Ticket 03 first-load race. All Ticket 05 focused suites, unit gates, type/lint/format/build, and privacy assertions must be green.

- [ ] **Step 6: Mark honest status and commit**

Set Ticket 05 to `in review` with automated evidence and physical-device rows pending. Do not mark complete before real Mac Safari/Chrome and Android Chrome checks; iPhone Safari remains explicitly unavailable if no device exists.

```bash
git add apps/web/e2e/smile-verification.spec.ts apps/web/e2e/vision-runtime.spec.ts docs/architecture/README.md docs/privacy/README.md docs/validation/ticket-05-calibration.md docs/validation/ticket-05-device-matrix.md .scratch/smart-smile-pwa/issues/05-verify-continuity-and-sustained-smile.md
git commit -m "test: validate sustained smile journey"
```
