Label: wayfinder:map

# Chart the Smart Smile MVP Implementation Route

## Destination

Reach an implementation-ready technical blueprint for the approved Smart Smile Detection & Capture MVP, with no unresolved architecture, calibration, interaction, reliability, or validation decisions before coding begins.

## Notes

- Domain: real-time, local, CPU-only webcam computer vision on Windows 10/11 and macOS.
- This effort plans decisions; it does not implement the application.
- Every session should consult the `wayfinder`, `grilling`, and `domain-modeling` skills. Research tickets must use primary sources through the `research` skill.
- Refer to map and ticket titles by name in human-facing narration.
- The approved performance baseline is an Intel 8th-generation Core i5 with 8 GB RAM, CPU-only, and a 720p webcam on Windows 10/11.
- Preserve the vocabulary in [`CONTEXT.md`](../../CONTEXT.md) and update it as domain terms are sharpened.

## Decisions so far

- [Establish the MVP product contract](issues/01-establish-mvp-product-contract.md) — locks the agreed product behavior, platform scope, privacy posture, reliability expectations, and acceptance boundary.
- [Verify the runtime and dependency matrix](issues/02-verify-runtime-and-dependency-matrix.md) — establishes a candidate Python/MediaPipe/OpenCV/NumPy matrix, model redistribution duties, and the lack of a current Intel-macOS MediaPipe wheel.
- [Determine portable camera behavior](issues/03-determine-portable-camera-behavior.md) — establishes advisory camera properties, explicit backend ordering, decoded-frame verification, and the architectural cost of hard reconnect timeouts.
- [Reconcile the OpenCV release baseline](issues/13-reconcile-opencv-release-baseline.md) — confirms OpenCV contrib 4.11.0.86 for Python 3.12 with NumPy 1.26.4 and carries the researched camera constraints onto that exact line.
- [Decide the macOS hardware support boundary](issues/12-decide-macos-hardware-support-boundary.md) — limits MVP macOS support and validation to macOS 11+ on Apple Silicon, with Intel compatibility deferred to a separate future investigation.
- [Choose the runtime architecture and performance budgets](issues/04-choose-runtime-architecture-and-performance-budgets.md) — fixes four owned lanes, bounded frame/result flow, timestamp and generation semantics, ordinary-frame latency budgets, burst timing, and best-effort in-process camera recovery.
- [Define the smile score and calibration contract](issues/05-define-smile-score-and-calibration-contract.md) — fixes bilateral Smile Score composition, smoothing and hysteresis defaults, a single runtime profile, offline maintainer calibration, and release acceptance fixtures.
- [Define face eligibility and continuity contract](issues/06-define-face-eligibility-and-continuity-contract.md) — fixes normalized Capture Zone and face-size bounds, multiple-face handling, anonymous continuity matching, adaptive tracking, and brief-invalidity recovery.
- [Define image quality and enhancement contract](issues/07-define-image-quality-and-enhancement-contract.md) — fixes luma and darkness gates, bounded natural enhancement, normalized sharpness rejection, Capture Candidate validity, and sharpness-first burst ranking.
- [Specify state machine and timing semantics](issues/08-specify-state-machine-and-timing-semantics.md) — fixes canonical states, event priority, generation cancellation, monotonic timers, Grace Window behavior, recovery outcomes, and deterministic reason-code transitions.
- [Design the overlay experience](issues/09-design-the-overlay-experience.md) — fixes normal/debug layout, guidance priority, Capture Zone and progress treatment, responsive scaling, warning semantics, Countdown, and Cooldown presentation.
- [Define the configuration, observability, and storage contract](issues/10-define-configuration-observability-and-storage-contract.md) — fixes strict configuration precedence, privacy-safe telemetry, log rotation, collision-safe atomic storage, and stable error taxonomy.
- [Define the test, benchmark, and acceptance plan](issues/11-define-test-benchmark-and-acceptance-plan.md) — fixes the traceable validation pyramid, deterministic fixtures and fault injections, target-machine benchmark procedure, telemetry, and hard release pass/fail gates.

## Not yet specified

- No unresolved in-scope decisions remain. The implementation handoff can now be assembled from the closed tickets and their linked answers.

## Out of scope

- Facial recognition, group capture, cloud services, networking, uploads, video recording, gallery/deletion UI, authentication, image encryption, audio, automatic model updates, and standalone `.exe`/`.app` packaging are outside this MVP.
- [Intel macOS support](issues/12-decide-macos-hardware-support-boundary.md) is outside the MVP, including Rosetta, older MediaPipe lines, unsupported source builds, and an alternate Intel-only detection engine.
- Application implementation is beyond this planning map; it begins only after the destination is reached and handed off.
