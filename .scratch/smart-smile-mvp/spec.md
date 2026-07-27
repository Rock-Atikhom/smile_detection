Status: ready-for-agent

# Smart Smile Detection & Capture MVP

## Problem Statement

A walk-up Participant needs a simple way to have one good smiling photo taken without operating a shutter, reviewing a gallery, or handing biometric data to a cloud service. A naïve smile detector is not sufficient: momentary expression flicker, multiple people, poor composition, weak lighting, blur, camera failures, and slow processing can all trigger the wrong capture or produce an unusable image. The operator also needs predictable setup, privacy-safe diagnostics, and clear failure behavior on ordinary Windows and supported macOS hardware.

The MVP must therefore turn a live webcam feed into a deterministic, understandable capture flow. It must verify that one anonymous Participant is correctly positioned and sustaining a smile, keep all eligibility and Quality Gates active through the Countdown, select the best frame from a short Capture Burst, and atomically store exactly one Final Photo only when every required condition remains valid.

## Solution

Build a local, silent, CPU-only Python application that guides a single Participant into a visible Capture Zone, derives a live Smile Score with MediaPipe Face Landmarker, and advances Verification only while face eligibility, Face Continuity, smile, lighting, and single-participant conditions are satisfied. A short Grace Window absorbs brief score flicker; longer invalidity resets progress. Successful Verification begins a three-second Countdown, after which the application collects a short full-resolution Capture Burst, rejects invalid candidates, gently enhances acceptable candidates, selects the sharpest one, and atomically saves a single JPEG Final Photo.

Normal mode provides friendly, minimal guidance. Debug mode exposes operational measurements and state transitions without recording images or biometric geometry. Camera setup is best-effort and portable across the explicitly supported platforms, with observable backend selection, delivered-resolution checks, warm-up, failure detection, and bounded reconnection attempts. Configuration is validated before the capture session begins, and the application remains usable on the agreed Windows baseline while retaining native validation requirements for both supported operating systems.

## User Stories

1. As a Participant, I want the application to begin with clear visual guidance, so that I know how to enter the capture flow without instruction from an operator.
2. As a Participant, I want to see a subtle Capture Zone, so that I can position my face correctly without the preview feeling clinical.
3. As a Participant, I want the live preview to be mirrored, so that adjusting my position feels natural.
4. As a Participant, I want the saved Final Photo to be unmirrored by default, so that the resulting image has conventional camera orientation.
5. As a Participant, I want the system to wait until my face is sufficiently large and inside the Capture Zone, so that it does not save a poorly composed photo.
6. As a Participant, I want friendly guidance when I am too far away or outside the Capture Zone, so that I can correct my position.
7. As a Participant, I want the system to require exactly one eligible face, so that another person cannot accidentally affect or appear in my capture flow.
8. As a Participant, I want an explicit warning when multiple faces are visible, so that everyone knows why Verification is not progressing.
9. As a Participant, I want my progress tracked anonymously through ordinary movement, so that brief motion does not restart the flow unnecessarily.
10. As a Participant, I want Face Continuity to avoid facial recognition or persistent identity matching, so that the experience remains privacy-preserving.
11. As a Participant, I want to see a live smile gauge, so that I understand how my expression affects Verification.
12. As a Participant, I want to see Verification progress, so that I know how long to keep smiling.
13. As a Participant, I want the smile requirement to use stable high and low thresholds, so that small measurement fluctuations do not make progress feel erratic.
14. As a Participant, I want a brief Grace Window for momentary invalidity, so that a blink, tiny movement, or one noisy result does not immediately discard my progress.
15. As a Participant, I want Verification to reset after invalidity lasts beyond the Grace Window, so that stale progress cannot produce an unintended photo.
16. As a Participant, I want the system to require a sustained smile for five seconds, so that the capture represents an intentional expression rather than a transient detection.
17. As a Participant, I want poor lighting to stop progress and produce actionable guidance, so that I can improve the conditions before a photo is taken.
18. As a Participant, I want unusably dark conditions called out clearly, so that I do not wait for progress that cannot complete.
19. As a Participant, I want all eligibility and Quality Gates to remain active during the Countdown, so that moving away or stopping my smile cancels an invalid capture.
20. As a Participant, I want a clear three-second visual Countdown, so that I can hold still for the photo.
21. As a Participant, I want the system to collect several frames after the Countdown, so that it can avoid saving a blink or a momentarily blurred image.
22. As a Participant, I want only valid smiling frames considered as Capture Candidates, so that the Final Photo still represents the expression I verified.
23. As a Participant, I want the sharpest valid Capture Candidate selected, so that the Final Photo is as clear as the camera conditions allow.
24. As a Participant, I want gentle enhancement and denoising, so that the Final Photo is improved without looking artificial.
25. As a Participant, I want the system to save nothing when no Capture Candidate passes the Quality Gates, so that an unusable photo is never presented as success.
26. As a Participant, I want a clear retry prompt after a failed Capture Burst, so that I understand the flow can begin again.
27. As a Participant, I want the saved Final Photo shown for a three-second Cooldown, so that I receive unmistakable confirmation of success.
28. As a Participant, I want new Verification disabled during Cooldown, so that the system cannot immediately capture a duplicate photo.
29. As a Participant, I want exactly one Final Photo saved for one successful flow, so that a Capture Burst does not create several files.
30. As a Participant, I want the application to work without audio, so that it remains suitable for quiet or noisy walk-up environments.
31. As a privacy-conscious Participant, I want all vision processing performed locally, so that my camera feed is not sent to a network service.
32. As a privacy-conscious Participant, I want operational logs to exclude images, landmarks, face geometry, and identity data, so that diagnostics do not become a biometric record.
33. As an operator, I want the output directory validated at startup, so that Participants do not complete the flow when saving cannot succeed.
34. As an operator, I want Final Photos written atomically, so that interruptions do not leave a partial JPEG that looks successfully captured.
35. As an operator, I want a commented configuration file with validated values, so that thresholds and runtime behavior can be adjusted safely for the installation.
36. As an operator, I want to select the camera and configuration at startup, so that the application can run in installations with multiple devices or profiles.
37. As an operator, I want to start directly in debug mode, so that setup and troubleshooting measurements are immediately available.
38. As an operator, I want to toggle diagnostics at runtime, so that I can inspect behavior without restarting the application.
39. As an operator, I want to reset the current capture session at runtime, so that I can recover from a confusing interaction without relaunching.
40. As an operator, I want standard keyboard exits, so that I can stop the local application quickly and predictably.
41. As an operator, I want the camera backend that actually opened to be logged, so that platform-specific device problems can be diagnosed.
42. As an operator, I want requested and delivered resolution plus measured FPS shown in diagnostics, so that I can distinguish configured intent from actual camera behavior.
43. As an operator, I want unsupported camera controls treated as warnings rather than fatal errors, so that ordinary automatic camera behavior remains usable across devices.
44. As an operator, I want the application to reject a stream whose decoded frames are below the minimum resolution, so that the installation cannot silently operate below the quality floor.
45. As an operator, I want failed or empty camera reads to invalidate the active capture flow, so that an old frame can never be mistaken for current evidence.
46. As an operator, I want the camera released and reopened after sustained read failure, so that unplug/replug and transient device problems can recover without an application restart.
47. As an operator, I want reconnection attempts bounded and visibly reported, so that camera failure does not look like a frozen interface.
48. As an operator, I want rotating operational logs, so that unattended use does not consume storage indefinitely.
49. As an operator, I want startup errors to explain configuration, model, camera, permission, and storage failures, so that installation problems can be fixed efficiently.
50. As a maintainer, I want direct runtime dependencies pinned and platform locks reproducible, so that supported installations use a known compatible environment.
51. As a maintainer, I want the Face Landmarker asset vendored and checksum-verified, so that a moving upstream download cannot silently change model behavior.
52. As a maintainer, I want only one OpenCV wheel family installed, so that the shared `cv2` namespace cannot be corrupted by conflicting packages.
53. As a maintainer, I want deterministic state transitions driven by monotonic time, so that system-clock changes cannot alter Verification, Grace Window, Countdown, or Cooldown behavior.
54. As a maintainer, I want detection performed on downscaled frames while full camera frames are retained for capture, so that CPU performance does not unnecessarily reduce Final Photo resolution.
55. As a maintainer, I want stale inference results discarded, so that delayed work cannot advance the current Participant using evidence from an older frame.
56. As a maintainer, I want representative synthetic scenarios for smile, continuity, lighting, blur, and camera faults, so that external behavior is repeatable in automated tests.
57. As a maintainer, I want target-hardware performance reports, so that the CPU-only frame-rate and latency contract is demonstrated rather than inferred from development hardware.
58. As a maintainer, I want native Windows and macOS smoke tests, so that wheel availability and mocked camera behavior are not mistaken for platform compatibility.
59. As a maintainer, I want frame and result generations attached to every cross-lane message, so that reset, reconnect, and exit can never accept stale work.
60. As a maintainer, I want bounded single-slot mailboxes and explicit replacement metrics, so that load produces freshness-first backpressure rather than unbounded memory growth.
61. As an operator, I want stable reason codes and safe error codes, so that the same failure is understandable across normal UI, debug UI, and logs.
62. As an operator, I want structured performance telemetry without image or biometric content, so that latency regressions can be diagnosed without creating a biometric record.
63. As a maintainer, I want deterministic synthetic fixtures and fault injection at the capture-session seam, so that camera, inference, timing, quality, and storage behavior can be regression-tested without a physical camera.
64. As a release owner, I want reproducible native acceptance reports for Windows and supported macOS, so that platform support is demonstrated on the agreed hardware rather than inferred from mocks.

## Implementation Decisions

- The MVP is a managed-environment, desktop Python application. It is local, silent, single-Participant, CPU-only, and has no cloud or networking dependency.
- Supported operating systems are Windows 10/11 on x86-64 and macOS 11 or later on Apple Silicon. Intel macOS is not part of the current support promise because the selected MediaPipe release has no matching wheel.
- The Windows performance baseline is an eighth-generation Intel Core i5, 8 GB RAM, CPU-only execution, and a standard 720p webcam.
- The direct runtime baseline is 64-bit CPython 3.12.10, MediaPipe 0.10.35, OpenCV contrib 4.11.0.86, and NumPy 1.26.4. No second OpenCV wheel family may be installed.
- Transitive dependencies will be resolved into separate, hash-locked environments for Windows x86-64 and macOS ARM64.
- The Face Landmarker task asset will be vendored from the official source and treated as immutable by recording and verifying a project-owned SHA-256. Distribution will include required Apache 2.0 license, attribution, and notice material.
- MediaPipe Face Landmarker supplies anonymous face landmarks and blendshape evidence. The system performs Face Continuity, not facial recognition, and does not create a persistent identity.
- Ordinary inference uses downscaled frames to protect CPU latency. The corresponding full camera frames remain available for the Capture Burst and Final Photo selection.
- A Participant becomes eligible only when exactly one face is visible, the face is sufficiently large, it is positioned within the Capture Zone, Face Continuity is valid, the Smile Score meets the active threshold, and lighting passes its Quality Gate.
- Verification requires five seconds of sustained eligibility. Smile validity uses high/low hysteresis, and a configurable 300 ms Grace Window pauses progress during brief invalidity before a longer violation resets it.
- Multiple faces and unusably dark conditions stop progress and produce explicit red guidance.
- Successful Verification begins a three-second Countdown. Every eligibility rule and Quality Gate remains active through the Countdown; invalidity cancels it rather than allowing a stale capture to proceed.
- At zero, the system collects approximately five full-resolution frames over 250–300 ms. The Capture Burst is not stored as video and does not produce multiple output files.
- Capture Candidates must continue to satisfy smile, continuity, face, composition, and image-quality requirements. Invalid or blurred candidates are rejected, and the sharpest remaining candidate is selected.
- If no valid Capture Candidate remains, no file is saved and the Participant is invited to retry.
- The chosen candidate receives gentle enhancement and denoising, then is encoded as a JPEG at quality 95. The live preview is mirrored; the Final Photo is unmirrored by default.
- The output directory is validated before the capture flow starts. Final Photo storage uses an atomic commit so partial output cannot be mistaken for success.
- A successful save begins a three-second Cooldown that freezes the Final Photo and prevents new Verification.
- Normal mode shows friendly status, a subtle Capture Zone, a smile gauge, Verification progress, Countdown, warnings, retry guidance, and save confirmation.
- Debug mode additionally shows raw scores, active thresholds, face bounds, luminance, sharpness, delivered resolution, measured FPS, selected backend, and state transitions.
- Runtime controls are `q` or Escape to exit, `d` to toggle diagnostics, and `r` to reset the active capture flow.
- Configuration is supplied through a commented and validated TOML document. Startup arguments include camera selection, configuration selection, and initial debug mode.
- The camera requests 1280x720 at 30 FPS as a best effort, preferably setting width and height before FPS. Delivered frame shape, not requested or reported properties, is authoritative.
- The application accepts camera adaptation down to a minimum decoded-frame resolution of 640x480. Lower-resolution or repeatedly invalid frames prevent operation.
- The camera warms up for a configurable two seconds before Participant evidence can advance the flow.
- Backend attempts are explicit and ordered: Media Foundation then DirectShow on Windows, and AVFoundation on macOS, with automatic backend selection only as a final compatibility fallback. Each failed attempt is released before the next begins.
- Camera controls such as exposure, white balance, gain, and focus remain automatic by default. Overrides are opt-in and best-effort; unsupported or materially mismatched requests are logged as warnings rather than causing startup failure.
- Delivered throughput is measured with a monotonic clock. Camera-reported FPS is diagnostic metadata, not proof of achieved processing rate.
- A camera read is failed when the call reports failure, the returned frame is absent, or the returned frame is empty. A failed read is never replaced with or displayed as a newly processed copy of the preceding frame.
- Camera read failure immediately invalidates active Face Continuity. A small configurable transient allowance may precede reconnect mode, after which the sole capture owner is released and recreated, requested properties are reapplied, and warm-up runs again.
- Reconnection has an agreed ten-second retry budget only while native backend calls return. A strict wall-clock guarantee is not claimed by the current OpenCV architecture because local camera opens and reads cannot be portably cancelled.
- Operational logs rotate and contain no images, landmarks, face geometry, or identity information.
- The application performance target on the Windows baseline is at least 20 average frames per second over 60 seconds, with at least 95% of ordinary detection frames completing within 75 ms. Capture Burst processing is excluded from the ordinary-frame latency measure.

### Approved implementation addendum

- The process is split into four strictly owned lanes: a camera-owner thread (open/read/reconnect/release only), an inference worker (latest-frame single-slot mailbox and blocking MediaPipe video-mode calls), the main coordinator/UI thread (state, timers, keyboard, and rendering only), and a burst-processing/storage worker (rank, enhance, encode, and atomically commit only). Cross-lane messages are immutable.
- A frame envelope and every derived result carry a camera generation, sequence number, and monotonic capture timestamp. The coordinator accepts only results from the active generation that are newer than the last accepted result and no older than 150 ms; late or stale results are ignored. Reset, reconnect, and exit advance or invalidate generations.
- The ordinary latency boundary is camera-read return to presentation, including queueing. The target budget is 50 ms average and 75 ms p95, allocated approximately to handoff 3/5 ms p95, downscale/color 5/7 ms, inference 34/50 ms, state 2/3 ms, and render 6/10 ms. The Windows baseline must sustain at least 20 FPS over 60 seconds.
- A Capture Burst collects five full-resolution frames over 250–300 ms. Temporary burst buffering is bounded to five items; reset, exit, camera-generation change, or camera failure cancels active acquisition. Zero-to-confirmation p95 has a 1.5-second allocation: 300 ms acquisition, 350 ms inference, 350 ms quality, 300 ms encode/commit, and 200 ms margin.
- Smile Score uses MediaPipe `MOUTH_SMILE_LEFT` and `MOUTH_SMILE_RIGHT`: `mean=(left+right)/2`, then `raw_score=clamp(0.6*min(left,right)+0.4*mean,0,1)`. An EMA with alpha 0.35 enters validity at 0.60 and remains valid until below 0.45. Alpha, high, and low thresholds are validated configuration values; the low/high gap is at least 0.05. The separate Grace Window is 300 ms.
- Face eligibility uses a normalized visible Capture Zone of x=.20–.80 and y=.12–.82, with inner eligibility x=.23–.77 and y=.16–.78, a .03 tolerance for an already eligible Participant, face width at least .18, and face height .30–.80. More than one detected face is invalid. Anonymous continuity matching uses center movement <=.15, height ratio .67–1.50, and normalized anchor-geometry difference <=.12, requiring three consecutive matches over roughly 150 ms; the reference adapts by factor .25. A no-face, multiple-face, or nonmatching interval holds the current track for at most 300 ms.
- Image Quality Gates use face-ROI and full-frame luma percentiles. Hard darkness is face Y50<32 or Y10<8; enhancement is considered below face Y50<60 or full-frame median<45. Gamma is bounded to 1.0–1.35, CLAHE is limited to clipLimit 1.5 with 8x8 tiles when Y90-Y10<45, and one bilateral d5 filter is permitted. Sharpness is variance of the Laplacian on a normalized 256x256 face ROI and must be at least 80. Candidate ranking is sharpness first, Smile Score second, then face median closest to 110.
- The canonical states are STARTING, CAMERA_WARMUP, READY, VERIFYING, COUNTDOWN, CAPTURE_BURST, PROCESSING, COOLDOWN, RECONNECTING, FATAL_ERROR, and EXITING. Exit outranks reset, worker/storage fatality, generation/reconnect, deadlines, and ordinary vision events. Verification lasts five seconds; Countdown lasts three seconds; Cooldown lasts three seconds. Timers use monotonic time and capture timestamps.
- Configuration is strict commented TOML with camera, vision, smile, quality, timing, storage, logging, and UI sections. Precedence is built-in defaults, selected TOML, then explicit CLI overrides for camera/config/debug. Unknown keys, malformed values, invalid paths, and range errors fail before camera startup; there are no environment-variable overrides.
- Observability is human-readable console output plus privacy-safe rotating JSONL (10 MB with five backups). Events include UTC and monotonic timestamps, state, reason, generation, safe error code, camera/backend facts, stage latency, queue age, replaced/stale counts, accepted FPS, and save outcome. Images, landmarks, face geometry, identity, and network telemetry are excluded.
- Final Photos use UTC-millisecond names with exclusive collision suffixes, unmirrored JPEG quality 95, same-directory temporary files, flush/fsync, and atomic rename. Success is emitted only after rename; one commit is active at a time. Encode, output, unknown-commit, and atomicity failures are fatal.

## Testing Decisions

- Good automated tests assert externally observable behavior: visible state and guidance, Verification progress or reset, Countdown eligibility, retry behavior, and whether zero or one Final Photo is committed. Tests should not assert private helper calls, internal collection types, or a particular implementation of a score or queue unless that representation becomes part of a public contract.
- The primary automated seam is the complete capture-session controller. Tests provide timestamped frames or frame descriptors, Face Landmarker results, storage outcomes, and a monotonic clock, then observe rendered state, diagnostics, state transitions, and committed output. This is the highest seam that can exercise the product flow deterministically without owning a physical camera.
- Scenario tests at that seam cover startup and warm-up; face absence; face size and Capture Zone boundaries; multiple faces; Face Continuity loss and replacement; Smile Score hysteresis; Grace Window pause and expiry; lighting gates; successful Verification; Countdown cancellation; valid and empty Capture Bursts; candidate ranking; save success and failure; Cooldown; reset; and exit.
- Recorded or synthetic image fixtures cover luminance, blur, composition, ordinary expressions, asymmetric smiles, occlusion, and boundary cases. Landmark-result fixtures and timestamped event sequences isolate state behavior from model nondeterminism while still using the same application-facing result contract.
- Storage tests use a real temporary directory at the public storage seam to verify directory validation, JPEG output, atomic commit, no partial file on failure, and exactly one Final Photo after a successful Capture Burst.
- Configuration tests load complete documents through the public configuration loader and assert accepted values, defaults, range errors, unknown or malformed values, startup-argument overrides, and actionable error messages.
- Camera adapter contract tests use a fake capture device to verify backend ordering, release between attempts, best-effort property requests, decoded-frame size validation, warm-up, empty-read handling, transient failure allowance, reconnect sequencing, and the prohibition on reusing a stale frame.
- Native platform acceptance remains a separate seam because backend availability, camera modes, permissions, controls, disconnect latency, and blocking behavior cannot be proven by mocks. Clean Windows x86-64 and Apple-Silicon macOS environments must install from their hashed locks, import all direct dependencies, verify the model checksum, construct the Face Landmarker, open a real webcam, and process synthetic plus live frames for at least 60 seconds.
- Target-hardware performance tests record interpreter and package versions, OS and architecture, model checksum, camera and selected backend, delivered resolution, measured FPS, ordinary-frame latency percentiles, dropped or stale frames, and Capture Burst duration. The Windows baseline passes only when it satisfies the agreed 20 FPS and 95%-within-75-ms criteria.
- Manual acceptance scenarios cover camera permission denial, unavailable camera, camera unplug/replug, requested-mode substitution, low light, backlight, multiple faces, brief and prolonged occlusion, Participant replacement, natural and weak smiles, head movement, Countdown cancellation, an all-blurred Capture Burst, unwritable output, filename collision behavior once defined, debug toggling, reset, and clean exit.
- There is no existing application or test suite to use as prior art. The local product contract and camera/runtime research are the current behavioral references; the first test harness should establish the single high-level capture-session seam described above rather than create many low-level seams.
- The validation pyramid also includes pure boundary/property tests, deterministic reducer and generation tests, lane/adapter contract tests, seeded landmark and image Validation Fixtures, and injected camera-open/read/reconnect, stale-result, worker, configuration/model, encoder, fsync, rename, collision, and unknown-commit failures.
- Landmark fixtures use fixed timestamps and cover neutral, speech, gradual/broad/weak/asymmetric smiles, sub-300 ms spikes, blinking, occlusion, head turns, no face, multiple faces, and Participant replacement. Seeded image fixtures cover nominal, dim, backlit, low-contrast, clipping, noise, uniform/local blur, and composition boundaries at 1280x720 and 640x480.
- Benchmark runs record a run ID, source fingerprint, OS/architecture, interpreter and package versions, model checksum, camera/backend, requested and delivered modes, configuration and fixture hashes, CPU/RAM, stage latency percentiles, queue age, replaced/stale counts, accepted FPS, reconnects, RSS, and Capture Burst duration. Run three independent 60-second previews after warm-up and ten successful Capture Bursts on each supported target.
- Release passes only when all automated tests pass; no prohibited scenario starts Verification; intended smiles meet the 95% post-warm-up acceptance criterion; ordinary latency is <=50 ms average and <=75 ms p95; average throughput is >=20 FPS; zero-to-confirmation burst p95 is <=1.5 s; exactly one valid Final Photo is committed per success; RSS remains below 1 GB without more than 10% growth; and both native platform smoke suites succeed. Crashes, deadlocks, privacy-data emission, stale-generation commits, duplicate/partial files, checksum mismatches, or missing native evidence fail the release.

## Out of Scope

- Facial recognition, named identity, persistent biometric profiles, and participant-specific calibration are outside the MVP.
- Group capture and any flow that intentionally handles more than one Participant are outside the MVP.
- Cloud inference, networking, uploads, remote administration, and other online services are outside the MVP.
- Video recording and retaining the Capture Burst or rejected Capture Candidates are outside the MVP.
- Gallery, review, deletion, sharing, and retake-history interfaces are outside the MVP.
- Authentication, authorization, image encryption, and broader data-retention management are outside the MVP.
- Audio cues or speech are outside the MVP.
- Automatic model or application updates are outside the MVP.
- Standalone Windows executables, macOS application bundles, installers, and code signing are outside the MVP; delivery uses managed Python environments.
- Intel-macOS support, alternative face engines, unsupported MediaPipe source builds, and maintenance of an older MediaPipe line are outside the current platform boundary.
- A hard wall-clock recovery guarantee for a native camera call that never returns is outside the current in-process camera architecture. Meeting that guarantee would require a supervised, killable helper process and a separate architecture decision.

## Further Notes

- This document incorporates the closed Smart Smile MVP planning map and is ready for implementation. The map contains no unresolved in-scope architecture, calibration, interaction, reliability, or validation decisions.
- The highest automated test seam is the complete capture-session controller: deterministic frame/result descriptors, a monotonic clock, storage outcomes, rendered state, diagnostics, transitions, and committed output. Native camera and platform behavior remains a separate smoke/acceptance seam because it cannot be proven by mocks.
- Exact camera property support and model behavior still require the prescribed target-machine validation; those are validation obligations, not open product decisions.
- The upstream Face Landmarker download uses a moving `latest` URL. A release is reproducible only when the downloaded bytes, source metadata, and SHA-256 are recorded together and required notices have been audited.
