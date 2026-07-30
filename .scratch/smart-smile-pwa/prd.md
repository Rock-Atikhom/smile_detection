Status: approved

# Smart Smile Responsive PWA

## Problem

Smart Smile currently has a partially implemented Python desktop path, but the product now needs to launch as a web application, run locally, and work on mobile. Building separate web, desktop, and native mobile applications would multiply camera, inference, accessibility, privacy, and release work before the core experience has been validated.

A participant needs a friendly way to take one good smiling photo with a phone or computer camera. The experience must not upload camera frames, require an account, expose biometric-looking diagnostics, or freeze while on-device machine learning runs. It must also remain usable when automatic smile capture is inaccessible or the device cannot sustain safe real-time performance.

The manager needs a clear, testable delivery definition. “Responsive” alone is insufficient unless camera permissions, orientation, browser differences, offline startup, capture quality, and real-device acceptance are specified.

## Solution

Build one responsive, installable PWA using React, TypeScript, and Vite. The browser obtains the camera through MediaDevices, and a dedicated Web Worker runs the self-hosted MediaPipe Face Landmarker and WASM assets on device. The default experience guides exactly one participant through privacy introduction, camera permission, framing, sustained smile verification, countdown, bounded capture, review, Download, Share when supported, and Retake.

The application has no backend, accounts, or remote analytics. Camera frames, landmarks, and captured photos are not persisted by application code; only the current winner remains available to the page for review. Only versioned application, model, and runtime assets are deliberately cached for offline operation after the first successful load. A manual shutter is an accessibility fallback; it bypasses the smile trigger only and retains face-count, framing, lighting, stability, and quality checks.

The PWA becomes the primary product. Existing Python work is retained temporarily as a desktop reference, with new Python feature work paused until PWA parity and an explicit archive decision.

## Success definition

The MVP succeeds when all of the following are demonstrated:

1. Web: an account-free production HTTPS URL opens the complete application.
2. Local: the application works on localhost and from a locally served production build.
3. Mobile: the responsive PWA completes camera sessions on iPhone Safari and Android Chrome in portrait and landscape.
4. Desktop web: the same build completes camera sessions in Chrome, Edge, and Safari.
5. Privacy: no application request uploads frames, photos, landmarks, face geometry, or participant identifiers.
6. Offline: after one complete online load, a supported device can reopen the installed or previously visited app and run the camera experience offline.
7. Performance: ordinary camera-read-to-presentation latency is at most 50 ms average and 75 ms p95 on the release device matrix; automatic capture is disabled below the safety floor rather than weakening rules.
8. Accessibility: the core flow meets WCAG 2.2 AA, supports keyboard and touch, respects reduced motion, and includes the manual trigger path.
9. Reliability: switching camera, backgrounding, stream interruption, orientation reconstruction, reset, or app update cannot accept stale progress or stale inference.
10. Capture: a successful session exposes exactly one in-memory Final Photo with Download, Share when supported, and Retake.

## User stories

### Participant and privacy

1. As a participant, I want a short privacy explanation before the browser asks for camera access, so I can make an informed choice.
2. As a participant, I want to know that inference runs on my device, so I understand that my camera is not streamed to a server.
3. As a participant, I want to use the app without an account, so a one-time photo does not require identity data.
4. As a participant, I want the app to request camera but never microphone access, so it asks only for what it needs.
5. As a participant, I want a clear recovery action after denying permission, so I am not trapped.
6. As a participant, I want the camera to stop when I leave the capture experience, so it is not active unnecessarily.
7. As a participant, I want my photo kept only in memory, so it disappears when I retake, close, or refresh.
8. As a participant, I want no gallery or hidden capture history, so rejected candidates are not retained.
9. As a participant, I want privacy details available without interrupting the main flow.

### Camera and responsive use

10. As a mobile participant, I want the front camera selected by default, so the preview behaves like a mirror.
11. As a desktop participant, I want the browser or OS-preferred camera selected by default.
12. As a participant, I want an explicit camera switch when more than one camera is available.
13. As a participant, I want switching cameras to restart warm-up, so old progress cannot carry to a new stream.
14. As a participant, I want the full camera frame contained rather than unexpectedly cropped.
15. As a participant, I want portrait and landscape layouts, so rotation does not hide controls.
16. As a participant, I want mobile safe-area support, so controls remain reachable around notches and browser chrome.
17. As a participant, I want large touch targets, so the interface is comfortable on a phone.
18. As a keyboard user, I want every control reachable in a logical order.
19. As a participant, I want the mirrored preview separated from the correctly oriented output.
20. As a participant, I want warm-up and loading states to explain what is happening.

### Guidance and automatic capture

21. As a participant, I want one primary instruction at a time, so competing problems do not overwhelm me.
22. As a participant, I want a subtle Capture Zone, so positioning is clear without feeling like surveillance.
23. As a participant, I want guidance when I am too close, too far, or off-center.
24. As a participant, I want exactly one face required, so another person cannot inherit or trigger my progress.
25. As a participant, I want an explicit multiple-face message.
26. As a participant, I want low-light guidance before capture.
27. As a participant, I want a plain-language prompt when motion or blur is too high.
28. As a participant, I want smile progress shown without a clinical numeric score.
29. As a participant, I want brief detection flicker tolerated, so normal motion does not feel punitive.
30. As a participant, I want sustained smile verification, so automatic capture represents deliberate intent.
31. As a participant, I want all quality and eligibility gates active through countdown.
32. As a participant, I want countdown cancelled safely when conditions become invalid.
33. As a participant, I want clear processing feedback while the best candidate is selected.
34. As a participant, I want a retry path when no candidate is usable.

### Accessible manual capture

35. As a participant who cannot or does not want to hold the detected smile, I want a visible manual shutter.
36. As a participant, I want the manual shutter to bypass only the smile trigger, not the safety and quality checks.
37. As a participant, I want to know the most important reason when manual capture is temporarily unavailable.
38. As a participant, I want a preference to stop automatic countdowns and use manual capture for the current session.
39. As a screen-reader user, I want stable semantic status without frame-by-frame announcements.
40. As a reduced-motion user, I want static state changes instead of pulsing or zooming animations.
41. As a participant using 200 percent zoom, I want controls to reflow without becoming inaccessible.
42. As a participant, I want color paired with text, icon, and shape.

### Review and delivery

43. As a participant, I want the selected photo shown clearly before I decide what to do.
44. As a participant, I want a Download action that works without a server.
45. As a participant on a supported device, I want to share the photo through the operating system share sheet.
46. As a participant on an unsupported Share implementation, I want Download to remain available.
47. As a participant, I want Retake to discard the current photo and restart safely.
48. As a participant, I want to know that leaving review discards the in-memory image.
49. As a participant, I want overlays excluded from the Final Photo.

### Offline, diagnostics, and support

50. As a returning participant, I want the complete experience to reopen offline after initial setup.
51. As a first-time offline participant, I want an explanation that one online load is required.
52. As a participant, I want an update deferred until the active session ends.
53. As an operator, I want a quiet health summary without changing participant state.
54. As an operator, I want camera, runtime, model, cache, performance-tier, and state-transition facts.
55. As an operator, I want diagnostics held only in memory.
56. As an operator, I want a manually initiated privacy-safe report that I can inspect before sharing.
57. As a maintainer, I want diagnostics schema tests to prohibit images, landmarks, geometry, participant identity, and unredacted device labels.
58. As a maintainer, I want no automatic remote analytics or crash reporting.

### Quality, performance, and release

59. As a maintainer, I want blocking MediaPipe inference off the UI thread.
60. As a maintainer, I want a one-item latest-frame mailbox, so overload drops old work rather than building a queue.
61. As a maintainer, I want generation, sequence, and capture-time metadata on cross-lane messages.
62. As a maintainer, I want stale results rejected after camera switch, reset, resume, or orientation reconstruction.
63. As a participant, I want animation, controls, and guidance to remain responsive during inference and photo processing.
64. As a participant on slower hardware, I want reduced inference resolution or cadence without weaker smile rules.
65. As a participant below the automatic-capture performance floor, I want honest manual-mode guidance.
66. As a maintainer, I want normal WASM fallback when WASM SIMD is unavailable.
67. As a maintainer, I want WebGPU excluded from the critical path until its browser behavior and benefit are proven.
68. As a release owner, I want unit and contract tests for deterministic state and scoring.
69. As a release owner, I want component and accessibility tests for every user-visible state.
70. As a release owner, I want Playwright tests with synthetic camera input.
71. As a release owner, I want real-device evidence on the agreed browser and device matrix.
72. As a manager, I want one documented command for local development and one for serving a production build.
73. As a manager, I want pull requests to receive a test verdict and a preview URL.
74. As a manager, I want production deployment to follow an approved merge rather than a manual file upload.

## Implementation decisions

### Product and platform

- One responsive browser PWA is the primary product. Native desktop bundles, App Store delivery, and Android APK delivery are not MVP requirements.
- Required browsers are release-current Chrome and Edge on desktop, Safari on macOS and iPhone, and Chrome on Android. Firefox is best-effort until it passes the same release gates.
- Exact version numbers are recorded at release time rather than frozen in this planning document.
- The public application is account-free. Processing is on device and there is no application backend.
- Cloudflare Pages is the recommended production host, with GitHub-connected preview deployments.
- The PWA is usable online on first load and fully offline after required versioned assets are cached.

### Web stack

- React plus TypeScript and Vite.
- Tailwind CSS, Radix UI primitives, and a small Smart Smile design token layer.
- MediaPipe Tasks Vision for Web with Face Landmarker, WebAssembly, and a dedicated Web Worker.
- WASM SIMD is preferred; ordinary WASM is the required fallback. WebGPU is future research only.
- Vitest for pure and component tests; Playwright for browser journeys and synthetic camera tests.
- A Vite PWA integration and Workbox-based service worker manage versioned application/runtime/model caching.
- Dependency and asset versions are pinned during implementation and upgraded only through tested pull requests.

### Model and data provenance

- The project does not train its own smile model and does not download a public smile-photo dataset.
- It consumes the official pretrained MediaPipe Face Landmarker bundle and derives Smile Score from the left and right mouth-smile blendshape outputs.
- The exact model bytes are self-hosted, versioned, SHA-256 recorded, and checked during build and runtime initialization.
- The current official bundle combines face detection, face mesh, and blendshape models. Google’s model cards describe consented smartphone/AR imagery for face detection and face mesh, and controlled multi-view subject recordings plus generated samples for blendshapes.
- Upstream model cards do not eliminate project responsibility. Release validation must cover relevant lighting, skin-tone, face-position, device, and expression variation using consented or synthetic test material.
- No participant camera data is reused for training or evaluation without a separate explicit consent and governance decision.

### Capture contract

- Automatic capture remains primary; manual capture is a secondary accessibility path.
- The approved Smile Score formula, hysteresis, Grace Window, face eligibility, continuity, lighting, sharpness, and countdown semantics from the desktop specification remain the starting behavioral contract. They must be revalidated in browser model/runtime output before release.
- Final capture progressively enhances: ImageCapture.takePhoto when available and reliable, otherwise a full-resolution canvas capture.
- A bounded burst is ranked locally; only the winner remains for review.
- Download is always offered. Share is shown only after a runtime capability check and direct user activation.

### Privacy and telemetry

- No camera, photo, landmark, geometry, identity, usage, or crash payload is sent by the application.
- Photos and candidates remain in memory. The service worker caches only application, runtime, model, font, icon, and static help assets.
- Local diagnostics use an allowlisted schema, are retained only in memory, and can be manually copied or downloaded only after preview.
- Privacy copy appears before permission request.

## Testing decisions

1. Pure contracts: score math, thresholds, reducer, generations, timing, prioritization, quality rules, adaptive tiers, and diagnostics redaction.
2. Component/accessibility: all states, focus, keyboard, live regions, zoom, reduced motion, contrast, touch targets, and responsive breakpoints.
3. Browser integration: permission outcomes, camera lifecycle, worker messaging, stale-result rejection, offline cache, update deferral, capture, Download, conditional Share, and Retake.
4. Playwright: synthetic-camera happy paths and faults in Chromium; browser-specific smoke journeys where automation allows.
5. Real devices: current iPhone Safari, Android Chrome, macOS Safari/Chrome, and Windows Chrome/Edge. Record browser, OS, device, camera, runtime/model hashes, orientation, performance tier, latency, FPS, memory, and outcomes.
6. Privacy: block unexpected network requests during camera and review sessions; scan diagnostic payloads and browser storage.
7. Performance: three 60-second preview runs and at least ten captures per release-class device. Ordinary latency target is at most 50 ms average and 75 ms p95.
8. Accessibility: automated checks plus manual VoiceOver on iPhone/macOS, TalkBack on Android, and keyboard-only desktop acceptance.

## Out of scope

- Separate native iOS, Android, Windows, or macOS applications.
- App Store, Play Store, APK, executable, installer, or code-signing delivery.
- Accounts, login, cloud storage, server-side inference, uploads, remote analytics, and remote administration.
- Persistent photo gallery, browser photo history, video recording, or retention of rejected candidates.
- Facial recognition, identification, named profiles, group capture, or surveillance.
- Project-owned model training or collection of participant imagery for training.
- WebGPU as a release dependency.
- Firefox as a required MVP browser before it passes the release suite.
- Multi-language UI in the first release; copy remains localization-ready.
- Automatic publishing of user diagnostics.
- Archiving the Python application before the parity acceptance decision.

## Notes and sources

- Google documents that the Web Face Landmarker outputs landmarks and blendshapes and that its synchronous video calls block the UI thread, recommending Web Workers: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
- Google’s Face Landmarker overview and official model-card links describe the bundled models and their intended use: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/index
- Camera permission requires a secure context and explicit user permission; localhost is treated as secure for development: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- ImageCapture can provide a photo Blob where implemented, while canvas-to-Blob is the broad fallback: https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/takePhoto and https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- Web Share is a progressive enhancement and must be triggered by user activation: https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API
- Cloudflare Pages creates unique GitHub pull-request previews: https://developers.cloudflare.com/pages/configuration/preview-deployments/
