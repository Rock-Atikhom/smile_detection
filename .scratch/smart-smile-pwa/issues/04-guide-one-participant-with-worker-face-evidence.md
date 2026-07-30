Status: planned
Execution: agent-led

# 04 — Guide one participant with worker-based face evidence

## Outcome

The PWA runs Face Landmarker off the UI thread and guides exactly one participant into the Capture Zone without exposing landmark geometry in participant mode or retaining it.

## User stories

- PRD 21–27: one-action framing and quality guidance.
- PRD 59–63: responsive worker flow and freshness.
- PRD 53–58: safe diagnostics.

## Acceptance criteria

- [ ] Initialize Face Landmarker in VIDEO mode with blendshape output in the dedicated worker.
- [ ] Submit aspect-preserving inference ImageBitmaps through one running plus one pending latest-frame slot.
- [ ] Close replaced and processed bitmaps and keep memory bounded.
- [ ] Carry generation, sequence, capture timestamp, dimensions, orientation, and tier on every message.
- [ ] Reject old-generation, out-of-order, duplicate, and older-than-150-ms results.
- [ ] Require exactly one face within approved initial Capture Zone and size bounds.
- [ ] Show only the highest-priority no-face, multiple-face, too-close, too-far, or off-center guidance.
- [ ] Keep the video and overlay aria-hidden while equivalent semantic status remains available.
- [ ] Diagnostics expose aggregate freshness and face-count state without landmarks or coordinates.
- [ ] UI interaction and animation remain responsive while inference runs.

## Verification

- Pure transform, envelope, mailbox, and freshness tests.
- Timestamped synthetic landmark fixtures for every boundary.
- Component states across responsive layouts.
- Worker fault and memory-disposal tests.
- Long-task and interaction-latency observation on the preview.

## Blocked by

02 — Start a privacy-first responsive camera session.

03 — Load a verified offline-capable vision runtime.

## Not included

Smile verification, countdown, or final photo.
