# 02 — Show a live MacBook camera preview

**What to build:** A live, mirrored preview from the MacBook's built-in camera, owned by a dedicated camera lane, with visible warm-up and camera failure guidance so the user can test the application on this Mac immediately.

**Blocked by:** 01 — Launch a validated application shell.

**Status:** ready-for-agent

- [ ] On the current Apple-Silicon MacBook, the built-in camera opens through AVFoundation after macOS camera permission is granted.
- [ ] The camera requests 1280x720 at 30 FPS as best effort, accepts delivered frames down to 640x480, and treats decoded frame dimensions as authoritative.
- [ ] A two-second CAMERA_WARMUP state prevents Participant evidence from advancing while the preview remains visibly active.
- [ ] The preview is mirrored, responsive, and rendered only by the main UI lane while camera open/read/release remains owned by the camera lane.
- [ ] Permission denial, unavailable camera, invalid/empty frames, and below-minimum decoded resolution produce stable visible guidance and privacy-safe telemetry.
- [ ] Selected backend, requested and delivered modes, measured FPS, and property outcomes are observable in logs.
- [ ] Fake-camera contract tests verify backend ordering, release between attempts, frame validation, warm-up, and the prohibition on treating an old frame as a new read.
