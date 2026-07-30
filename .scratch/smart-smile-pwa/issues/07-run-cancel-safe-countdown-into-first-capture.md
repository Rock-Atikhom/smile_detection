Status: planned
Execution: agent-led

# 07 — Run a cancel-safe countdown into a first capture

## Outcome

Five seconds of valid automatic Verification produces a clear three-second countdown and one first in-memory photo, while every invalidation path cancels safely.

## User stories

- PRD 29–34: sustained verification, countdown, processing, and retry.
- PRD 43 and 49: clean photo review.
- PRD 61–63: race-safe responsive behavior.

## Acceptance criteria

- [ ] The pure reducer owns the approved state/event priority and monotonic deadlines.
- [ ] Five seconds of valid Verification starts exactly one three-second countdown.
- [ ] Face, continuity, smile, lighting, stability, freshness, and performance remain active throughout countdown.
- [ ] Grace Window behavior is preserved; expiry cancels to guidance with a stable reason.
- [ ] Cancel, reset, switch, hidden page, orientation reconstruction, camera failure, worker failure, generation change, and update never permit stale capture.
- [ ] Countdown zero starts one bounded acquisition transaction.
- [ ] Implement canvas-to-Blob as the required first capture path using full decoded resolution and correct unmirrored orientation.
- [ ] Produce one deterministic first candidate and move to an in-memory review state without persistence.
- [ ] Keep the UI responsive and show Capturing then Processing copy.
- [ ] Retake releases the Blob/object URL and returns through warm-up or Ready as specified.

## Verification

- Reducer tests for every state, priority, tie, cancellation, and late result.
- Synthetic-camera end-to-end path from Ready to Review.
- Orientation/mirroring fixture proving overlays are absent from output.
- Browser storage and network assertions.
- Object URL and bitmap disposal tests.

## Blocked by

06 — Enforce live quality and adaptive performance.

## Not included

Multi-candidate ranking, ImageCapture progressive enhancement, Share, or manual capture.
