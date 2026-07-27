# 02 — Show a live MacBook camera preview

**What to build:** A live, mirrored preview from the MacBook's built-in camera, owned by a dedicated camera lane, with visible warm-up and camera failure guidance so the user can test the application on this Mac immediately.

**Blocked by:** 01 — Launch a validated application shell.

**Status:** completed

- [x] On the current Apple-Silicon MacBook, the built-in camera opens through AVFoundation after macOS camera permission is granted.
- [x] The camera requests 1280x720 at 30 FPS as best effort, accepts delivered frames down to 640x480, and treats decoded frame dimensions as authoritative.
- [x] A two-second CAMERA_WARMUP state prevents Participant evidence from advancing while the preview remains visibly active.
- [x] The preview is mirrored, responsive, and rendered only by the main UI lane while camera open/read/release remains owned by the camera lane.
- [x] Permission denial, unavailable camera, invalid/empty frames, and below-minimum decoded resolution produce stable visible guidance and privacy-safe telemetry.
- [x] Selected backend, requested and delivered modes, measured FPS, and property outcomes are observable in logs.
- [x] Fake-camera contract tests verify backend ordering, release between attempts, frame validation, warm-up, and the prohibition on treating an old frame as a new read.

## Completion evidence

- Two native runs on the target Apple-Silicon Mac opened `AVFOUNDATION`, delivered authoritative `1280x720` frames at approximately `30 FPS`, displayed the mirrored preview, and released the camera cleanly.
- The requested `1280x720@30` mode, accepted/reported property outcomes, delivered mode, measured FPS, and mailbox replacement count appeared in privacy-safe telemetry.
- The configurable default `timing.camera_warmup_seconds = 2.0` keeps the preview active during `CAMERA_WARMUP`; published frame buffers are read-only across lanes.
- `38` automated tests pass; Ruff formatting/lint and strict mypy checks pass.
- Independent standards and specification re-reviews of `origin/main...dacc761` reported no remaining findings.
