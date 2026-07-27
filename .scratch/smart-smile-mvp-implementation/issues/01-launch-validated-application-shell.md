# 01 — Launch a validated application shell

**What to build:** A locally runnable Smart Smile application shell that validates its runtime, configuration, model asset, output location, and logging before showing a responsive window or an actionable startup failure.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] A clean supported Python environment installs the approved direct dependencies without a conflicting OpenCV wheel family.
- [x] Startup verifies the Face Landmarker model checksum and refuses missing or mismatched assets with a stable safe error.
- [x] Built-in defaults, a selected TOML document, and explicit camera/config/debug CLI options are accepted with the approved precedence.
- [x] Unknown keys, malformed values, invalid ranges, and unusable output paths fail before camera startup with an actionable message.
- [x] Successful startup opens the application shell, initializes privacy-safe console and rotating JSONL logging, and exits cleanly with `q` or Escape.
- [x] Automated tests exercise successful startup and each startup-fatal category through the public application seam.

## Implementation note

The locked `opencv-contrib-python==4.11.0.86` ARM64 wheel is tagged `macosx_13_0_arm64`. The supported and implemented boundary is therefore macOS 13+ on Apple Silicon, including the current macOS 26 MacBook; the planning artifacts were reconciled to avoid a false macOS 11/12 claim.

## Completion evidence

- Frozen environment sync succeeded with exact CPython `3.12.10` and separate hashed macOS ARM64 and Windows x86-64 locks.
- The vendored Face Landmarker SHA-256 is `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
- `24` public-seam tests pass; Ruff formatting/lint and mypy checks pass.
- Native Apple-Silicon smoke checks constructed the CPU Face Landmarker and launched the OpenCV shell successfully.
- Independent standards and specification reviews of `b4fb070...ac7fc10` reported no remaining issues.
