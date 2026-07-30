# Smart Smile

Smart Smile is migrating to a responsive PWA. The existing Python desktop application is
preserved as a frozen behavior reference in `apps/desktop-reference`; new product work will
land in the web application.

## Python desktop reference

Run these commands from the repository root:

```bash
make python-sync
make python-test
make python-format-check
make python-lint
make python-mypy
make python-run
```

`python-run` opens the local desktop camera preview. On first launch, allow camera access
when macOS asks. Press `q` or Escape to exit; pass `--debug` by running
`cd apps/desktop-reference && uv run smart-smile --debug`.

The supported native macOS environment is Apple Silicon on macOS 13 or later. Platform locks,
the verified Face Landmarker model, and its license notices remain with the desktop reference.
