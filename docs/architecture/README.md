# Architecture

The approved runtime design lives in
`.scratch/smart-smile-pwa/architecture.md`. This directory is the tracked home for implementation
architecture decisions as the PWA grows. Ticket 02 adds `apps/web/src/camera/` as the sole owner of
browser camera constraints, browser-error mapping, track lifecycle, generations, and allowlisted
in-memory diagnostics. React renders its stable snapshot and invokes only camera actions.

The camera request is video-only (`audio: false`), with non-exact 1280×720/30 FPS ideals. Mobile
clients prefer `facingMode: user`; desktop leaves selection to the browser. A request is considered
an ignored permission prompt after 15 seconds, and successful streams warm up for 1.2 seconds before
becoming ready. Both are named constants so automated lifecycle tests remain deterministic.

## Ticket 03 offline vision runtime boundary

Ticket 03 adds a verified runtime-initialization path only. It pins
`@mediapipe/tasks-vision@0.10.35` and the official Face Landmarker model
`float16/1`. The deterministic release manifest is
`apps/web/src/vision/generated/release-manifest.json`; its current release ID is
`6c23e451b7a9b523`, and it inventories byte counts, SHA-256 values, provenance,
license references, and every same-origin immutable asset beneath
`apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/`.

Ownership stays deliberately narrow:

- The main-thread `VisionCoordinator` owns explicit-camera-intent start,
  worker lifecycle, generation guards, participant-safe state, and commands to
  the service worker. React observes its snapshot; it owns no MediaPipe object
  or persistent runtime data.
- The dedicated classic worker owns manifest and critical-byte verification,
  capability selection, and one Face Landmarker initialization. It tries SIMD
  first, retries the allowlisted ordinary-WASM baseline tier once only when SIMD
  is unsupported or cannot initialize, and never chooses WebGPU. Ticket 03 does
  not submit frames to that instance or expose application landmarks,
  blendshapes, face boxes, geometry, scores, or smile decisions.
- The service worker owns the shell cache, versioned vision-release cache,
  verified cache transaction, and offline immutable-asset responses. It owns no
  MediaPipe instance and never handles participant data.

Worker events may update state only when their generation matches the active
coordinator generation; stale-generation events cannot update runtime readiness,
offline readiness, recovery, or participant-facing state.

The application shell cache contains the small hashed application shell,
including generated release-manifest metadata, but no vendored vision release
files. After **Continue to camera**, the service worker opens a separate
versioned cache and fetches every manifest allowlisted asset from the same
origin. It validates HTTP success, byte count, and SHA-256, stores verified
responses, reads every manifest response back, and writes its completion marker
last. Only a matching cache with that marker and successful readback is usable;
cancellation, a failed download, or an integrity failure deletes the incomplete
new cache while preserving a previously complete release.

On a first offline use with only the shell cache, the coordinator presents
**Connect once to finish setup** without asking for camera permission. A
complete matching release initializes from cache after a close/reopen. An
integrity mismatch blocks initialization, removes affected unverified or
incomplete cache content, stops the camera, and presents safe recovery rather
than raw runtime details.

The service worker claims the current page before runtime preparation, and the
cache client sends commands only to that controlling worker. The coordinator
constructs the classic vision worker only after the complete release cache has
been verified and committed. Immutable vision fetches then have no network
fallback: MediaPipe 0.10.35's loader-script and WASM URL requests are served as
freshly verified copies from that completed cache.

A missing completion marker remains the recoverable first-use state. Once a
marker exists, an invalid marker or a missing/corrupt entry anywhere in the
manifest deletes the whole release cache and enters fatal integrity recovery.
If Cache Storage cannot commit a first release, setup fails closed before worker
creation or camera permission and offers a bounded retry instead of running from
unverifiable URL refetches.

## Ticket 04 worker face-evidence boundary

Ticket 04 sends an aspect-preserving `ImageBitmap` frame directly from the
main-thread frame pump to the already prepared dedicated worker. The coordinator
admits one running frame plus one latest pending frame, closes replaced and
processed bitmaps, and binds every frame and result to distinct runtime
`generation` and camera `cameraGeneration` values, sequence, capture time,
dimensions, orientation, and the standard inference tier. It rejects stale,
duplicate, out-of-order, and wrong-generation or wrong-camera-generation
results before React can observe them.

The worker alone runs Face Landmarker VIDEO inference and immediately reduces
its result to categorical evidence: a capped face count, one of no face,
multiple faces, move back, move closer, center your face, or face ready, and
an eligibility boolean. React receives only that participant-safe categorical
snapshot through the coordinator; it never receives a frame, MediaPipe object,
landmarks, blendshapes, boxes, geometry, coordinates, or a smile score. The
application uses no participant dataset and does no custom model training.
Smile Score remains Ticket 05 work.

The browser coordinator has one optional Worker factory read only at worker
construction. Production uses the bundled worker. Playwright installs the
factory before navigation to supply deterministic protocol events with exact
current runtime and camera tuples; it exposes no participant data and provides
no UI control in the application.

Ticket 04 does not remove the Ticket 03 first-load browser race: it remains a
release blocker. A completed-cache close/reopen is valid only for development
demonstration and manual testing preparation until Ticket 03 is resolved.

## Ticket 05 continuity and sustained-smile boundary

Ticket 05 computes an anonymous continuity match and a sustained-smile
verification from worker-reduced evidence. The worker reduces one accepted
frame to a fixed ephemeral observation (center, width, height, and an
eight-number anchor vector) plus one aggregate raw Smile Score, and posts only
those to the coordinator. The coordinator then feeds a pure continuity tracker
and a pure verification reducer; React renders only the resulting qualitative
status (`Hold still`, `Smile when you are ready`, `Keep smiling`, `Smile
verified`) and a native progress element.

The fixed ephemeral observation crosses only worker-to-coordinator and is
discarded after accepted processing; it is never copied into a snapshot, DOM,
report, storage, service-worker cache, or network. No biopsy geometry, anchors,
landmark arrays, blendshapes, category names, participant identifiers, or a
biometric time series are retained. Current raw/smoothed aggregates appear only
in the current-instant Help diagnostics, never persisted.
