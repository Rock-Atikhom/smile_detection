# Smart Smile Capture

A local, CPU-only desktop application that verifies a sustained Smile Score and captures one high-quality Final Photo from a single Participant.

Implementation is proceeding through the approved tracer-bullet tickets in `.scratch/smart-smile-mvp-implementation/issues`.

## Run the validated shell

```bash
uv sync --frozen --all-groups
uv run smart-smile
```

Press `q` or Escape to exit. The next implementation ticket adds the live MacBook camera preview.

The supported native macOS environment is Apple Silicon on macOS 13 or later. The approved OpenCV contrib 4.11.0.86 ARM64 wheel sets that combined floor. Hash-locked runtime resolutions are retained separately for Apple-Silicon macOS and Windows x86-64.
