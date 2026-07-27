Type: grilling
Status: resolved

# Establish the MVP product contract

## Question

What user experience, operating constraints, privacy rules, reliability behavior, and acceptance boundary define the Smart Smile MVP?

## Answer

The MVP is a local, silent, single-participant Python application for Windows 10/11 and macOS. Its Windows performance baseline is an Intel 8th-generation Core i5, 8 GB RAM, CPU-only, and a standard 720p webcam. It uses MediaPipe Face Landmarker on downscaled inference frames while retaining the full camera frame for capture.

The Participant must be alone, positioned inside a subtle Capture Zone, sufficiently large in frame, continuously tracked without recognition, and above a configurable smile threshold for five seconds. High/low hysteresis and a 300 ms Grace Window absorb brief flicker; longer face, smile, continuity, lighting, or multiple-face failures reset Verification or cancel the Countdown. Multiple faces and unusably dark conditions receive explicit red guidance.

Successful Verification starts a three-second visual Countdown during which every eligibility condition remains active. At zero, the system collects approximately five full-resolution frames over 250–300 ms, rejects invalid or blurred candidates, and chooses the sharpest valid smiling Capture Candidate. If none qualifies, it saves nothing and asks the Participant to retry.

Only one gently enhanced, denoised JPEG is stored at quality 95. The output directory is validated at startup and saving is atomic. The live preview is mirrored; the Final Photo is unmirrored by default. A successful save freezes the Final Photo for a three-second Cooldown.

Normal mode shows friendly status, the Capture Zone, a smile gauge, progress, and Countdown. Debug mode adds scores, thresholds, boxes, luminance, sharpness, actual resolution, measured FPS, and state transitions. Runtime keys are `q`/Escape to exit, `d` to toggle diagnostics, and `r` to reset. The application is configured through a commented, validated `config.toml` with `--camera`, `--config`, and `--debug` startup arguments.

The camera requests 1280×720 at 30 FPS, adapts down to a minimum of 640×480, warms up for a configurable two seconds, keeps automatic exposure and white balance by default, and attempts bounded reconnection for 10 seconds. Operational logs rotate and never contain images, landmarks, face geometry, or identity data.

Validation combines unit tests, synthetic/mock integration tests, and manual Windows/macOS checks. The Windows baseline must average at least 20 FPS over 60 seconds, with at least 95% of ordinary detection frames completing within 75 ms; capture processing is excluded. Managed Python environments are the MVP delivery format. Standalone bundles and all features listed in the map's Out of scope section are deferred.

## Comments

- Imported from the completed user grilling session that preceded this map.
