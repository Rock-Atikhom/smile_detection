# 01 — Launch a validated application shell

**What to build:** A locally runnable Smart Smile application shell that validates its runtime, configuration, model asset, output location, and logging before showing a responsive window or an actionable startup failure.

**Blocked by:** None — can start immediately.

**Status:** in-progress

- [ ] A clean supported Python environment installs the approved direct dependencies without a conflicting OpenCV wheel family.
- [ ] Startup verifies the Face Landmarker model checksum and refuses missing or mismatched assets with a stable safe error.
- [ ] Built-in defaults, a selected TOML document, and explicit camera/config/debug CLI options are accepted with the approved precedence.
- [ ] Unknown keys, malformed values, invalid ranges, and unusable output paths fail before camera startup with an actionable message.
- [ ] Successful startup opens the application shell, initializes privacy-safe console and rotating JSONL logging, and exits cleanly with `q` or Escape.
- [ ] Automated tests exercise successful startup and each startup-fatal category through the public application seam.

## Implementation note

The locked `opencv-contrib-python==4.11.0.86` ARM64 wheel is tagged `macosx_13_0_arm64`. The implemented startup boundary is therefore macOS 13+ on Apple Silicon, including the current macOS 26 MacBook. The planning promise of macOS 11+ must be reconciled before final native release validation; this slice does not falsely claim macOS 11/12 compatibility.
