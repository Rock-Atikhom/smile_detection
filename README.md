# Smart Smile Capture

A local, CPU-only desktop application that verifies a sustained Smile Score and captures one high-quality Final Photo from a single Participant.

Implementation is proceeding through the approved tracer-bullet tickets in `.scratch/smart-smile-mvp-implementation/issues`.

## Run the validated shell

```bash
uv sync --all-groups
uv run smart-smile
```

Press `q` or Escape to exit. The next implementation ticket adds the live MacBook camera preview.
