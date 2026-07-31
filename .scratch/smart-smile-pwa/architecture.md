Status: approved

# Smart Smile PWA Runtime Architecture

## 1. Requirements

### Functional

- Run the same product from production HTTPS, localhost, a locally served production build, and responsive mobile browsers.
- Acquire and switch cameras, with front camera preferred on mobile.
- Run MediaPipe Face Landmarker entirely in the browser.
- Preserve the approved face eligibility, continuity, Smile Score, timing, quality, countdown, burst ranking, and stale-generation contracts.
- Support automatic smile capture and a manual accessibility fallback.
- Hold photos only in memory and expose Download, conditional Share, and Retake.
- Work offline after the complete versioned asset set has been cached.
- Expose privacy-safe, read-only, in-memory diagnostics.

### Non-functional

- UI remains responsive during inference, capture ranking, and image encoding.
- Ordinary camera-read-to-presentation latency target: 50 ms average and 75 ms p95 on the release matrix.
- Latest evidence wins under load; no unbounded frame queue.
- No app request transmits participant camera data.
- WCAG 2.2 AA target.
- Current Chrome, Edge, and Safari are required; Firefox is best-effort.
- App and model updates never replace a running session midway.

## 2. Context and boundaries

The MVP is a static client application. Cloudflare Pages serves immutable files; it does not receive camera frames, inference results, photographs, or analytics.

    GitHub pull request
          |
          v
    CI: test, build, asset verification
          |
          v
    Cloudflare Pages static deployment
          |
          | HTTPS: HTML, JS, CSS, WASM, model, icons
          v
    Browser / installed PWA
      - React UI and session coordinator
      - MediaStream camera owner
      - Dedicated inference worker
      - In-memory capture processor
      - Service worker and Cache Storage
          |
          v
    User-selected Download or operating-system Share

There is intentionally no database, API server, message broker, account service, cloud inference service, image store, or telemetry collector.

## 3. Repository topology

The migration uses a temporary monorepo:

    apps/
      web/                    primary React PWA
      desktop-reference/     existing Python app, frozen except critical fixes
    packages/
      contracts/             framework-neutral state, score, quality and messages
    docs/
      architecture/
      privacy/
      validation/

Recommended package boundaries inside apps/web:

    src/
      app/                    composition, routes, providers, update lifecycle
      camera/                 permission, devices, constraints, track lifecycle
      inference/              worker client, worker entry, MediaPipe adapter
      session/                pure reducer, events, timers, generations
      quality/                lighting, blur, candidate ranking
      capture/                burst, ImageCapture, canvas fallback, encoding
      diagnostics/            allowlisted in-memory events and report preview
      pwa/                    service-worker and offline/update coordination
      ui/                     semantic states, components, tokens, responsive shell
      testing/                fakes, fixtures and synthetic camera adapters

The contracts package must remain free of React, DOM, MediaPipe, and storage APIs. It owns behavior that can be tested deterministically.

## 4. Runtime lanes and ownership

The browser topology adapts the previously approved strict-ownership design.

### Lane A: main UI and session coordinator

Owns:

- React rendering and semantic accessibility state;
- the HTML video element and MediaStream lifecycle adapter;
- the canonical session reducer and monotonic timers;
- generation and sequence allocation;
- permission and visibility/orientation events;
- capture orchestration and review Blob lifetime;
- diagnostics drawer state.

Does not:

- run Face Landmarker inference;
- build an unbounded queue;
- persist images;
- accept a result without freshness checks.

### Lane B: dedicated inference Web Worker

Owns:

- MediaPipe Tasks Vision initialization;
- selected WASM capability variant;
- immutable model bytes and integrity result;
- Face Landmarker VIDEO-mode calls;
- inference-stage measurements;
- returning minimal result contracts.

Google documents that Face Landmarker detection calls are synchronous and block the calling thread; this is why inference is a worker responsibility.

### Lane C: capture and quality processing

For MVP compatibility, capture acquisition remains on the main thread because MediaStreamTrack, ImageCapture support, video elements, and Share are browser-dependent. Heavy candidate operations use OffscreenCanvas in a worker where proven, with a main-thread canvas fallback scheduled outside animation-critical work.

This lane owns:

- bounded candidate collection;
- final-resolution decode and orientation normalization;
- face/lighting/blur rechecks;
- ranking and bounded enhancement;
- JPEG Blob production;
- candidate disposal.

It does not own permanent storage. The only retained object after success is the winning in-memory Blob and its object URL.

### Lane D: service worker

Owns:

- versioned static-asset caching;
- offline responses;
- new-version discovery;
- activation only after the page permits it.

It must never intercept or manufacture camera frames and must never cache generated photo URLs.

## 5. Frame flow and backpressure

### Envelope

Every submitted frame and derived result carries:

- cameraGeneration: incremented on stream start, switch, restart, resume, reset, or geometry reconstruction;
- sequence: monotonically increasing inside a generation;
- capturedAtMs: performance.now-derived timestamp;
- sourceWidth and sourceHeight;
- inferenceWidth and inferenceHeight;
- orientation and mirror metadata;
- capabilityTier.

### Latest-frame mailbox

The UI submits only when the inference worker is idle. If a newer video frame becomes available while the worker is busy, it replaces the one pending slot. The replaced ImageBitmap is closed immediately and a replacement counter increments.

The worker returns one result, becomes ready, and receives the newest pending frame. There is never more than one running and one pending inference. This freshness-first design bounds memory and latency.

### Transfer format

The compatibility-first frame path is:

1. requestVideoFrameCallback when available, otherwise requestAnimationFrame with currentTime deduplication;
2. create an aspect-preserving inference surface with a tier-specific maximum long edge;
3. create and transfer an ImageBitmap to the worker;
4. close the bitmap in the worker after inference.

VideoFrame and WebCodecs can be benchmarked later but are not required for MVP browser support.

### Acceptance

The coordinator accepts a result only when:

- cameraGeneration equals the active generation;
- sequence is newer than the last accepted sequence;
- capturedAtMs is monotonic;
- result age at presentation is no more than 150 ms;
- session has not been reset, hidden, switched, or superseded.

Rejected work increments a privacy-safe stale counter and cannot advance timers or capture.

## 6. Session state machine

Canonical states:

1. compatibility-check
2. privacy-introduction
3. permission-request
4. camera-starting
5. model-loading
6. warm-up
7. ready
8. verifying
9. countdown
10. capture-burst
11. processing
12. review
13. reconnecting
14. recoverable-error
15. fatal-error
16. stopped

Event priority:

1. user stop or page teardown;
2. integrity/security fatality;
3. generation change, camera loss, visibility suspension;
4. worker or capture failure;
5. reset, camera switch, retake;
6. timer deadline;
7. ordinary inference result.

All timers use monotonic timestamps. Backgrounding pauses the experience, stops submitting inference, invalidates active progress, and requires warm-up on resume.

## 7. Model, WASM, and adaptive performance

### Asset policy

- Pin the MediaPipe Tasks Vision package and exact WASM files.
- Self-host JS, WASM, model, and notices on the app origin.
- Record SHA-256 for model and WASM assets in a generated manifest.
- CI recomputes hashes and fails on an unexplained change.
- Runtime fetches immutable versioned URLs and verifies critical bytes with SubtleCrypto before worker initialization.
- Cache names include the application and model manifest version.

### Capability tiers

The app calibrates during warm-up and selects a tier without changing smile or quality thresholds:

| Tier | Intended behavior | Auto capture |
| --- | --- | --- |
| High | inference long edge up to 640 px, target 20–30 accepted FPS | enabled |
| Balanced | smaller inference input and/or 15–20 accepted FPS | enabled if latency passes |
| Minimum | reduced cadence and conservative UI effects | enabled only if freshness and latency pass |
| Below floor | essential checks may continue at reduced cadence | disabled; manual path only if non-smile gates remain reliable |

WASM SIMD is preferred when supported. Plain WASM is the required fallback. WebGPU is not selected automatically in MVP.

Automatic capture is disabled if warm-up or a sustained runtime window cannot satisfy:

- accepted inference at least 12 FPS;
- p95 end-to-end result age at most 150 ms;
- no repeated long tasks that make countdown or cancellation unreliable;
- required non-smile checks available.

The stricter release goal remains 50 ms average, 75 ms p95, and at least 20 accepted FPS on named release devices.

## 8. Camera lifecycle

Camera request:

- audio is false;
- video initially prefers 1280 by 720 and 30 FPS without exact constraints;
- mobile prefers user-facing;
- desktop omits facingMode unless a prior in-session choice exists.

An interruption restart or participant Stop then Start preserves the last delivered in-session
camera choice. If that remembered exact device is missing or overconstrained, one browser-default
request is used as the explicit fallback so recovery cannot loop on an unavailable camera.

Delivered track settings and decoded video dimensions are authoritative. A minimum decoded frame of 640 by 480 is required for automatic capture unless release validation approves an equivalent portrait resolution.

Permission is requested only after the privacy-introduction action. The app maps NotAllowed, NotFound, NotReadable, Overconstrained, Abort, and inactive-document failures to stable user guidance.

Camera switch algorithm:

1. increment generation and cancel progress;
2. request the candidate stream before destroying a working stream when the browser permits;
3. attach and verify decoded frames;
4. stop the old track;
5. warm up the new stream;
6. restore the previous stream or offer recovery when switching fails.

On mobile, the facing-mode control remains available when device enumeration exposes
only the active camera. Mobile switching releases the active track before requesting
the replacement because some phone browsers cannot grant concurrent camera ownership.
It toggles `facingMode` directly between `user` and `environment` rather than cycling
physical device IDs, because a phone can expose several lenses for the same direction.
Desktop switching retains candidate-first validation. If a released mobile replacement
fails, the session publishes interruption recovery and never claims that the ended
preview remains active.

Tab hiding stops inference and may stop the camera after a short policy delay. A returned page never reuses earlier evidence.

## 9. Capture pipeline

### Progressive acquisition

1. Prefer ImageCapture.takePhoto when the interface exists, the live track is healthy, and a release probe shows correct orientation/resolution.
2. Otherwise draw the full decoded video frame to a canvas and produce a Blob.
3. Collect a bounded burst of up to five candidates within approximately 300 ms.
4. Cancel on generation change, hidden page, stream loss, user cancellation, or fatality.

ImageCapture is progressive enhancement because implementation coverage differs. Canvas-to-Blob is the broad, required fallback.

### Candidate processing

- Re-run face count, composition, continuity proxy, smile for automatic path, lighting, and sharpness on candidates.
- Manual capture bypasses only smile validity.
- Rank by approved sharpness-first, Smile Score-second, exposure-distance rule.
- Apply only the approved bounded enhancement.
- Encode winner as JPEG quality 0.95.
- Revoke all rejected object URLs, close bitmaps, release arrays, and keep only the winner.

### Review lifetime

Review owns one Blob, one object URL, and safe metadata such as dimensions and capture time. Download creates a temporary anchor action. Share is displayed only when navigator.canShare confirms the file and navigator.share is available. Retake and teardown revoke the URL and release the Blob.

No IndexedDB, Cache Storage, localStorage, sessionStorage, File System Access, or server endpoint stores photos. This is an application-layer no-persistence guarantee: the browser or operating system may internally back memory or encoded Blobs according to its own implementation, which web code cannot fully control.

## 10. Offline and update strategy

Precache:

- application shell and hashed chunks;
- CSS, local fonts, icons, manifest;
- inference worker;
- pinned WASM variants;
- pinned Face Landmarker model;
- static privacy and recovery help.

Do not cache:

- camera output;
- generated Blobs or object URLs;
- diagnostics;
- arbitrary external responses.

First load:

- download and verify the required release manifest;
- install cache atomically;
- show offline-ready only after all required assets are readable.

Update:

- download a new version into a distinct cache;
- notify the page that an update is ready;
- never activate during verifying, countdown, capture, processing, or review;
- activate after the session returns to an idle boundary or after explicit user confirmation;
- remove old caches only after successful activation.

## 11. UI, accessibility, and diagnostics interfaces

The coordinator exposes one semantic ViewModel:

- state and primary instruction;
- face/lighting/stability summaries;
- progress and countdown text;
- allowed actions with blocked reasons;
- camera and offline status;
- recoverability and remediation;
- review Blob URL;
- diagnostics summary.

The UI does not interpret raw landmarks. Canvas overlays are aria-hidden; equivalent status is rendered as semantic text. Guidance changes are debounced before polite live-region announcement.

Diagnostics are read-only and in memory. Export uses an allowlist:

- release and model identifiers;
- browser/OS class, not a raw fingerprint;
- state and stable reason codes;
- selected performance tier;
- aggregate FPS and latency;
- replaced/stale counts;
- camera facing mode and delivered dimensions;
- offline-cache state.

Prohibited fields include images, Blobs, object URLs, landmarks, face boxes, geometry, scores tied to timestamps, device labels, IP/location, names, and persistent identifiers.

## 12. Security and privacy

Recommended response policy:

- Content-Security-Policy permitting self-hosted scripts, styles, workers, WASM, images, and blobs only as narrowly required;
- Permissions-Policy: camera=(self), microphone=();
- Referrer-Policy: no-referrer;
- X-Content-Type-Options: nosniff;
- frame-ancestors none through CSP;
- strict HTTPS and no mixed content.

Avoid cross-origin runtime/model CDNs. Avoid third-party fonts, analytics, tag managers, error collectors, embeds, and ads. Dependency review and lockfile scanning are release gates.

The network privacy test blocks every unexpected request after the static application has loaded and verifies that camera, inference, capture, and review still work.

## 13. Deployment and CI

Pull request:

1. install from the pinned lock;
2. lint and type-check;
3. run unit, contract, component, accessibility, browser, storage, and privacy tests;
4. verify model/WASM hashes and notices;
5. build the production bundle;
6. inspect bundle and asset manifest budgets;
7. publish a Cloudflare Pages preview only when required checks pass.

Main branch:

- repeats all gates;
- deploys the immutable production build;
- records Git commit, package lock hash, asset-manifest hash, model hash, and Cloudflare deployment ID;
- performs a post-deploy smoke check for HTTPS, headers, assets, service worker, camera intro, and offline readiness.

Preview deployments are public by default in Cloudflare Pages. If test builds contain unreleased behavior, use Cloudflare Access for previews and never include real participant data.

## 14. Capacity and cost

This application has zero application-server requests after static assets are loaded.

Planning estimate per new release/device:

- compressed JS/CSS/application shell: 1–3 MB;
- MediaPipe WASM/runtime: 2–8 MB;
- model bundle: verify actual vendored size during implementation;
- icons/fonts/help: under 1 MB;
- expected first-load transfer: approximately 5–15 MB, subject to measured bundle output.

Returning users should fetch only changed hashed assets. Cloud hosting cost is static bandwidth and build minutes; there is no inference compute, image storage, database, or per-capture backend cost.

## 15. Failure and recovery matrix

| Failure | Behavior |
| --- | --- |
| Insecure context | block camera; explain HTTPS or localhost requirement |
| Permission denied | do not reprompt in a loop; show settings help and Retry |
| No camera | show device guidance and retry/selection |
| Camera busy/interrupted | invalidate generation, reconnect, warm up |
| Model/WASM integrity mismatch | fatal; never infer with unverified bytes |
| First use while offline | explain one complete online setup is required |
| Cache update incomplete | keep the last complete version |
| Inference too slow | adapt tier; disable auto capture below floor |
| Worker crash | invalidate generation; one bounded restart, then fatal |
| Candidate set empty | save nothing; return to guidance |
| Share unavailable/fails | preserve review photo and Download |
| Orientation/visibility change | pause, invalidate, reconstruct, warm up |
| New version available mid-session | defer activation |

## 16. Tradeoffs

### Chosen: one PWA

Benefits: one product, broad reach, instant previews, local and mobile delivery, no store process, no image backend.

Costs: browser camera and capture behavior varies; real-device tests are mandatory; native filesystem and camera controls remain limited.

### Chosen: dedicated worker plus latest-frame mailbox

Benefits: responsive UI, bounded memory, explicit freshness.

Costs: worker-compatible MediaPipe initialization and transferable-frame behavior need early proof.

### Chosen: self-hosted immutable assets

Benefits: reproducibility, strict privacy, offline operation, narrow CSP.

Costs: larger deployments and explicit model/license/update ownership.

### Chosen: memory-only photos

Benefits: clear privacy story and minimal data governance.

Costs: refresh or closure loses the photo; UX must warn at review.

### Chosen: adaptive tiers without threshold weakening

Benefits: broader device reach without changing intent semantics.

Costs: some devices receive manual capture only; release UX must explain this respectfully.

## 17. Design assessment

Score: 9 out of 10 for MVP readiness.

Strong points:

- minimal system boundary and no unnecessary backend;
- explicit ownership, backpressure, freshness, and update semantics;
- privacy is enforced structurally rather than only through copy;
- progressive enhancement covers capture and Share differences;
- deployment and real-device evidence are first-class.

To reach 10 out of 10:

1. Prove MediaPipe worker initialization and ImageBitmap transfer in Safari, Chrome Android, and iPhone Safari.
2. Measure the exact model/WASM bundle, startup time, memory, and latency on named release devices.
3. Validate ImageCapture orientation and resolution, then decide its exact per-browser enablement.
4. Approve the release browser/version and physical-device matrix with the manager.
5. Run a privacy/security header review on the first Cloudflare preview.

These are implementation validation obligations, not reasons to add a backend or split the product.

## 18. Primary sources

- MediaPipe Face Landmarker for Web: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
- Face Landmarker model overview and model cards: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/index
- MediaDevices camera security and permission behavior: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- Web Workers and message transfer: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- ImageCapture: https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/takePhoto
- Canvas Blob fallback: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- Web Share progressive enhancement: https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API
- PWA service workers and offline caching: https://web.dev/learn/pwa/service-workers and https://web.dev/learn/pwa/assets-and-data/
- Cloudflare Pages previews: https://developers.cloudflare.com/pages/configuration/preview-deployments/
