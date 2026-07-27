# Smart Smile Capture

A local, CPU-only desktop application that verifies a sustained Smile Score and captures one high-quality Final Photo from a single Participant.

Implementation is proceeding through the approved tracer-bullet tickets in `.scratch/smart-smile-mvp-implementation/issues`.

## Run the validated shell

```bash
uv sync --frozen --all-groups
uv run smart-smile
```

Press `q` or Escape to exit. The next implementation ticket adds the live MacBook camera preview.

The current native macOS environment is Apple Silicon on macOS 13 or later. Although the original planning boundary said macOS 11+, the approved OpenCV contrib 4.11.0.86 ARM64 wheel is tagged for macOS 13; startup reports older macOS versions as unsupported until that dependency/support decision is revised. Hash-locked runtime resolutions are retained separately for Apple-Silicon macOS and Windows x86-64.
