# Smart Smile Capture

A local, CPU-only desktop application that verifies a sustained Smile Score and captures one high-quality Final Photo from a single Participant.

Completed desktop-reference work is recorded in the repository's
`.scratch/smart-smile-mvp-implementation/issues` planning history.

## Run the live camera preview

From the repository root:

```bash
make python-sync
make python-run
```

Or, from this directory:

```bash
uv sync --frozen --all-groups
uv run smart-smile
```

On first launch, allow camera access when macOS asks. Smart Smile opens the built-in
camera through AVFoundation, shows a mirrored preview, and remains in
`CAMERA_WARMUP` for two seconds before reporting `READY`. Press `q` or Escape to
exit. Use `uv run smart-smile --debug` to show delivered resolution, measured FPS,
and mailbox replacement diagnostics.

The supported native macOS environment is Apple Silicon on macOS 13 or later. The approved OpenCV contrib 4.11.0.86 ARM64 wheel sets that combined floor. Hash-locked runtime resolutions are retained separately for Apple-Silicon macOS and Windows x86-64.
