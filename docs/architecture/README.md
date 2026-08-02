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
