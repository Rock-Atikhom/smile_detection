Status: approved

# Offline Vision Runtime Design

## Context

Ticket 02 delivered and validated the privacy-first responsive camera session on
MacBook and phone. Ticket 03 supplies the next dependency in the approved PWA
delivery path: a verified, self-hosted MediaPipe Face Landmarker runtime that can
initialize online and reopen offline after one complete setup.

The project does not train a smile model or download a smile-photo dataset. It
uses the official pretrained Face Landmarker task bundle. Later tickets will
derive face evidence and Smile Score from its landmarks and blendshape outputs.
This ticket stops at verified runtime initialization.

## Goals

- Pin MediaPipe Tasks Vision for Web at `0.10.35`.
- Self-host every required runtime, WASM, model, license, notice, and model-card
  asset under immutable same-origin paths.
- Generate and enforce a deterministic asset manifest with provenance, byte
  size, and SHA-256 for every shipped vision asset.
- Initialize one Face Landmarker in a dedicated classic Web Worker without
  blocking the UI thread.
- Prefer WASM SIMD and retry once with ordinary WASM when SIMD is unavailable or
  cannot initialize.
- Cache the complete vision release atomically after explicit camera intent and
  reopen from the last complete release when offline.
- Keep camera frames, photos, landmarks, geometry, diagnostics, object URLs, and
  identifiers out of all browser persistence.
- Preserve the camera lifecycle, accessibility, privacy, responsive behavior,
  and check-gated Cloudflare delivery established by Tickets 01 and 02.

## Non-goals

- Submitting camera frames to MediaPipe.
- Exposing face landmarks, blendshapes, face boxes, or transformation matrices.
- Calculating Smile Score or applying smile hysteresis.
- Participant framing, continuity, lighting, stability, or quality guidance.
- Adaptive inference cadence, performance-tier calibration, automatic capture,
  manual capture, review, download, or sharing.
- WebGPU or a remote runtime/CDN fallback.
- Updating to MediaPipe Tasks Vision `1.x` in this ticket.
- Completing the update-activation and diagnostic-report surfaces owned by
  Ticket 10.

## Approved decisions

### Runtime version

Pin `@mediapipe/tasks-vision` to exact version `0.10.35`. Version `1.0.0` was
published on 2026-07-30, while the established upstream release and current
documentation remain centered on `0.10.35`. A future upgrade must be isolated in
its own tested pull request.

### Download timing

Register the lightweight application-shell service worker on the initial page
load, but do not fetch the large vision release until the participant activates
**Continue to camera**. Camera acquisition and runtime preparation then proceed
in parallel.

The shell cache exists separately from the vision release cache. This lets a
device that previously loaded only the shell reopen offline and explain that one
online setup is required, without downloading roughly 38 MB of vision assets for
a visitor who never starts a session.

### Worker type

Use one Vite-bundled classic worker. Vite's `iife` worker output keeps the
TypeScript authoring and package imports while supplying the `importScripts()`
environment expected by MediaPipe `0.10.35`.

Rejected alternatives:

- A module worker would require an upstream patch or compatibility shim because
  the MediaPipe loader still falls back to DOM script injection when
  `importScripts()` is unavailable.
- Main-thread initialization or inference would violate the approved
  non-blocking UI and runtime-lane contract.

## Architecture and ownership

### Main-thread runtime coordinator

One coordinator owns worker creation, runtime generations, participant-facing
state, and service-worker commands. It exposes a read-only semantic snapshot to
React. React never stores worker instances, MediaPipe objects, manifest bytes,
model bytes, or future inference evidence.

The coordinator begins preparation only after explicit camera intent. It may run
alongside camera startup, but camera and runtime retain independent ownership.
Camera switching does not recreate the vision runtime.

### Classic vision worker

The worker owns:

- capability detection;
- manifest validation for the assets it consumes;
- selected runtime and model fetching;
- SHA-256 verification before initialization;
- SIMD-first and baseline fallback selection;
- exactly one Face Landmarker instance;
- verified byte-buffer lifetime and cleanup.

The Face Landmarker is configured for one face, video running mode, CPU/WASM,
and blendshape output. No frames are submitted in Ticket 03.

### Service worker

Use `vite-plugin-pwa@1.3.0` with Workbox `7.4.1` in `injectManifest` mode so the
application owns the vision-cache transaction and update boundaries.

The service worker owns:

- the small application-shell precache;
- versioned vision release caches;
- fetch, byte-count, and SHA-256 validation for every required cached asset;
- the completion marker written only after the entire release passes;
- deletion of incomplete new caches;
- retention of the last complete cache when a new release fails;
- offline responses for immutable runtime/model/notice assets.

It never receives or caches a camera frame, photo, Blob, object URL, landmark,
geometry record, score series, event timeline, or diagnostic report.

## Asset and provenance contract

### Vendored assets

Commit the exact files under an immutable release directory such as:

`apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/`

The directory contains:

- all JavaScript and WASM variants shipped in the `0.10.35` package that are
  required for SIMD and ordinary-WASM startup;
- the official Face Landmarker `float16/1` task bundle;
- the MediaPipe Apache-2.0 license and applicable notice material;
- the upstream face detector, face mesh, and blendshape model cards;
- no generated application data.

Each individual file remains below the Cloudflare Pages per-file limit. Keeping
the assets in the private source repository makes local, CI, preview, and
production builds reproducible without a runtime CDN.

### Generated manifest

A deterministic Node script generates a checked-in JSON manifest. Every entry
contains:

- stable asset identifier;
- immutable same-origin path;
- exact byte count;
- lowercase hexadecimal SHA-256;
- upstream source URL;
- package or model version;
- role and capability variant;
- license or notice reference;
- whether the asset is required for offline readiness.

The manifest also contains one release identifier derived from its canonical
content. The generator uses sorted paths and stable JSON serialization.

CI regenerates the manifest and rejects:

- an unexplained byte, hash, or size change;
- a missing vendored file, model card, license, or notice;
- an unexpected file in the release directory;
- an external or unversioned runtime path;
- a missing source or license/notice reference;
- nondeterministic manifest output.

The project records only what upstream material supports. It does not overstate
the licensing terms of model bytes when upstream documentation uses a separate
model-card or terms reference.

## Cache model and offline semantics

### Shell cache

The service worker registers on an ordinary online page load and precaches only
the hashed application shell, static recovery help, manifest metadata, and PWA
icons. This cache is intentionally small and does not make the application
offline-ready for vision use.

### Vision release cache

After **Continue to camera**, the coordinator sends one `CACHE_RELEASE` command
with the current generation and release identifier. The service worker:

1. Opens a distinct versioned cache for the release.
2. Fetches every required asset from the same origin.
3. Validates HTTP success, exact byte count, and SHA-256.
4. Stores only verified responses.
5. Reads the required entries back successfully.
6. Writes a completion marker last.
7. Reports `ready` only after the marker and readback pass.

An incomplete cache is never considered usable. Cancellation or failure aborts
pending work and deletes the incomplete new cache. A previously complete cache
is not removed.

### Offline startup

- Complete matching cache: initialize from the cached immutable assets.
- Shell cache but no complete vision cache: render **Connect once to finish
  setup** and do not request camera permission.
- Network available but cache population fails while worker initialization
  succeeds: allow the online camera session to continue and report offline setup
  as incomplete in Help.
- Integrity mismatch: do not initialize, stop the camera, discard affected
  unverified bytes/cache content, and enter a fatal recovery state.

`navigator.onLine` is advisory only. Actual fetch and verified-cache outcomes
determine state.

## Runtime protocol and state

### Snapshot dimensions

Keep runtime and offline readiness independent:

- Runtime: `idle | preparing | ready | error`
- Offline cache: `not-ready | caching | ready | error`
- WASM tier: `unknown | simd | baseline`

The safe snapshot may also expose release identifier, stable reason code, and
whether retry is available. It does not expose paths containing user data, raw
exceptions, stack traces, bytes, landmarks, geometry, or timestamped score data.

### Worker messages

Main to worker:

- `PREPARE { generation, manifestUrl, releaseId }`
- `CANCEL { generation }`

Worker to main:

- `PHASE { generation, phase }`
- `READY { generation, releaseId, wasmTier }`
- `ERROR { generation, code, recoverable }`

Every message is runtime-validated. Unknown message types and malformed payloads
are ignored and recorded only as bounded safe reason codes.

### Generation and cancellation rules

- Stop, Cancel, restart, and coordinator disposal increment the generation.
- Old-generation messages cannot update state.
- Cancel terminates a preparing worker, aborts worker fetches, releases verified
  buffers, requests service-worker cache cancellation, and deletes incomplete
  cache content.
- Restart creates a fresh worker and generation.
- Camera switching does not invalidate a ready model because the model contains
  no participant evidence.
- A completed offline cache remains available after a later session stops.

### Fallback and failure policy

- Prefer SIMD after a deterministic WebAssembly capability probe.
- If SIMD is unsupported or initialization fails with the allowlisted
  unsupported-runtime reason, retry ordinary WASM once in the same generation.
- Do not fallback after an integrity mismatch.
- Do not select WebGPU.
- Do not loop worker restarts; repeated-runtime recovery belongs to Ticket 10.

Stable participant/runtime reasons include:

- `first-use-offline`
- `runtime-download-failed`
- `runtime-integrity-failed`
- `runtime-initialization-failed`
- `runtime-cancelled`
- `offline-cache-failed`

Raw upstream errors remain inside the worker and are never rendered or persisted.

## User experience and accessibility

### Active preparation

The privacy introduction remains unchanged. After **Continue to camera**:

- show **Getting smile detection ready**;
- show **Required files are verified and stay on this device for offline use**;
- retain Stop/Cancel throughout preparation;
- return to the normal **Camera ready** state after initialization;
- announce **Smart Smile is ready for offline use** once after complete cache
  verification.

No percentage is shown because initialization and caching do not provide a
single honest participant-facing progress measure.

### Help and system status

Add two quiet rows:

- **On-device smile detection:** Preparing / Ready / Needs attention
- **Offline use:** Preparing / Ready / Connect once to finish setup

MediaPipe version, model release, manifest identifier, and SIMD/baseline tier may
appear in system details. They do not replace participant guidance.

### Recovery

- First-use offline: focused **Connect once to finish setup** screen with **Try
  again when online**. Do not request camera permission.
- Integrity failure: stop camera and show focused **Smart Smile could not start
  safely** with Reload and Help.
- Cache-only failure with ready online runtime: keep the camera usable and show
  the offline warning only in Help.

### Accessibility

- Reuse one polite atomic live region and announce only meaningful phase changes.
- Move focus to recovery headings and restore it to the invoking control when
  Help closes.
- Preserve the established 48 CSS-pixel targets, keyboard order, contrast,
  browser-zoom reflow, reduced-motion behavior, and hidden-video semantics.
- Do not expose model bytes, raw runtime messages, or technical progress churn to
  assistive technology.

## Security and privacy

Keep all executable and model assets on the application origin. Preserve:

- `connect-src 'self'`
- `object-src 'none'`
- `frame-ancestors 'none'`
- `microphone=()`
- `camera=(self)`

Add:

- `worker-src 'self'`
- `'wasm-unsafe-eval'` to `script-src`

`'wasm-unsafe-eval'` permits WebAssembly compilation without enabling JavaScript
`eval()` or remote executable sources. Do not add `'unsafe-eval'`, a CDN origin,
or a broad blob/data worker source.

The application makes no analytics, crash-reporting, camera, model-result, or
participant-data request. MediaPipe processing remains local. Storage inventory
tests permit only the approved shell and immutable vision release assets.

## Verification strategy

### Manifest and asset tests

- deterministic manifest regeneration;
- literal byte counts and SHA-256 values;
- complete source and notice references;
- missing, changed, unexpected, external, and unversioned asset rejection;
- production bundle contains the exact manifest inventory.

### Runtime contract tests

- classic-worker construction and protocol validation;
- explicit-camera-intent start boundary;
- SIMD preference and ordinary-WASM fallback;
- no fallback after integrity failure;
- one Face Landmarker initialization and close;
- cancellation, generation rejection, late-message disposal, and worker cleanup;
- stable allowlisted errors without raw exception leakage.

### Service-worker contract tests

- shell-only initial installation;
- explicit vision-cache start;
- completion marker written last;
- readback required before ready;
- cancellation and incomplete-cache deletion;
- failed update preserves the last complete release;
- cache inventory rejects camera/session data and unknown URLs.

### Browser journeys

- production-CSP initialization using the real self-hosted MediaPipe files and
  Face Landmarker bundle;
- online setup reaches runtime ready and offline ready;
- browser offline mode then closes/reopens and initializes successfully;
- shell-only cache shows first-use-offline guidance without requesting camera;
- corrupt and missing assets cannot initialize or claim readiness;
- no unexpected application network request occurs during the camera session
  after offline setup;
- storage remains limited to approved static cache entries;
- keyboard, focus, live-region, touch-target, contrast, and responsive tests stay
  green.

### Real-device acceptance

Run online preparation followed by airplane-mode close/reopen on:

- current iPhone Safari;
- current Android Chrome;
- MacBook Safari and Chrome.

Record browser and OS class, release/manifest identifier, model identifier,
SIMD/baseline tier, preparation duration, cache outcome, and pass/fail. Do not
record a persistent identifier, raw device label, camera content, landmark,
geometry, or score.

## Component and file impact

Expected implementation units:

- exact package pins in the web workspace;
- vendored immutable vision release directory;
- deterministic vendor/manifest scripts and manifest contract tests;
- a small vision protocol module shared by coordinator and worker;
- a runtime coordinator and React hook;
- a testable runtime loader plus one classic worker entry;
- an injected Workbox service worker and registration/cache client;
- runtime/offline status integration in the current App and Help surface;
- production-header, asset, runtime, offline, privacy, and accessibility tests;
- architecture, privacy, validation, deployment, and third-party notice updates.

Each unit has one owner. The worker does not own UI state, the service worker does
not own MediaPipe instances, React does not own imperative runtime resources, and
the camera session does not own offline caching.

## Acceptance boundary

Ticket 03 is complete when the exact runtime release initializes in its classic
worker, the complete verified release reopens offline, first-use-offline and
integrity recovery are accessible, sensitive data remains absent from storage,
all automated gates pass, and named real-device evidence is recorded.

Successful initialization does not mean face guidance or smile detection has
been delivered. Ticket 04 first submits bounded worker frames and exposes
participant face evidence; Ticket 05 adds continuity and sustained Smile Score.

## Primary upstream references

- MediaPipe Tasks Vision package:
  <https://www.npmjs.com/package/@mediapipe/tasks-vision>
- MediaPipe releases: <https://github.com/google-ai-edge/mediapipe/releases>
- MediaPipe repository and license:
  <https://github.com/google-ai-edge/mediapipe>
- Official Face Landmarker model bundle:
  <https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task>
- Blendshape model card:
  <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf>
- Face Mesh V2 model card:
  <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf>
- Content Security Policy Level 3:
  <https://www.w3.org/TR/CSP/#directive-script-src>
