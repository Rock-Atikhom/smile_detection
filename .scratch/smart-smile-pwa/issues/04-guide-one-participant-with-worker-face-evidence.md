Status: in review — automated acceptance complete; physical-device acceptance pending
Execution: agent-led

# 04 — Guide one participant with worker-based face evidence

## Outcome

The PWA runs Face Landmarker off the UI thread and guides exactly one participant into the Capture Zone without exposing landmark geometry in participant mode or retaining it.

## User stories

- PRD 21–27: one-action framing and quality guidance.
- PRD 59–63: responsive worker flow and freshness.
- PRD 53–58: safe diagnostics.

## Acceptance criteria

- [x] Initialize Face Landmarker in VIDEO mode with blendshape output in the dedicated worker.
- [x] Submit aspect-preserving inference ImageBitmaps through one running plus one pending latest-frame slot.
- [x] Close replaced and processed bitmaps and keep memory bounded.
- [x] Carry generation, sequence, capture timestamp, dimensions, orientation, and tier on every message.
- [x] Reject old-generation, out-of-order, duplicate, and older-than-150-ms results.
- [x] Require exactly one face within approved initial Capture Zone and size bounds.
- [x] Show only the highest-priority no-face, multiple-face, too-close, too-far, or off-center guidance.
- [x] Keep the video and overlay aria-hidden while equivalent semantic status remains available.
- [x] Diagnostics expose aggregate freshness and face-count state without landmarks or coordinates.
- [x] UI interaction and animation remain responsive while inference runs.

## Verification

- Pure transform, envelope, mailbox, and freshness tests.
- Timestamped synthetic landmark fixtures for every boundary.
- Component states across responsive layouts.
- Worker fault and memory-disposal tests.
- Long-task and interaction-latency observation on the preview.

## Ticket 04 acceptance evidence

The production-header Playwright journey in
`apps/web/e2e/face-evidence.spec.ts` deterministically supplies exact current
runtime and camera generation tuples through a construction-only Worker seam.
It verifies all six guidance strings, wrong-tuple and stale-evidence rejection,
Switch camera-generation clearing, Stop worker cancellation/termination,
same-origin observed requests, and empty local/session storage. Physical-device
acceptance remains pending in
`docs/validation/ticket-04-device-matrix.md`; this issue must not be marked
complete until that available evidence and review are recorded.

The Ticket 03 first-load browser race remains a release blocker. A completed
cache close/reopen is development-only preparation, not release acceptance.

## Blocked by

02 — Start a privacy-first responsive camera session.

03 — Load a verified offline-capable vision runtime.

## Not included

Smile verification, countdown, or final photo.
