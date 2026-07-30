Status: planned
Execution: agent-led, with human photo-quality review

# 08 — Select, review, download, share, and retake

## Outcome

A short bounded burst yields the best valid Final Photo, which the participant can review, download, share when supported, or discard through Retake.

## User stories

- PRD 33–34: best-candidate processing and retry.
- PRD 43–49: review and delivery.
- PRD 7–8: memory-only retention.

## Acceptance criteria

- [ ] Acquire up to five full-resolution candidates over approximately 300 ms with bounded memory.
- [ ] Probe ImageCapture.takePhoto and enable it only on validated browser/device combinations; retain canvas fallback everywhere.
- [ ] Recheck generation, face count, composition, continuity proxy, smile, lighting, stability, and sharpness for automatic candidates.
- [ ] Apply the approved bounded gamma, contrast, and denoise operations only when indicated.
- [ ] Rank by approved sharpness, Smile Score, and exposure-distance tie breakers.
- [ ] Save nothing and show retry guidance when no candidate is valid.
- [ ] Encode only the winner as JPEG quality 0.95 and release every rejected candidate.
- [ ] Show a contained, correctly oriented review image with no overlay.
- [ ] Download creates a sensible collision-resistant filename without server storage.
- [ ] Show Share only when file sharing passes navigator.canShare; require direct activation and preserve the photo on cancellation/failure.
- [ ] Retake and teardown revoke the URL and release the Blob.

## Verification

- Seeded candidate fixtures for blur, local blur, low light, contrast, clipping, noise, face invalidity, and ties.
- ImageCapture/canvas adapter contract tests.
- Playwright review, download, Share-present, Share-absent, Share-cancel, and Retake paths.
- Real visual comparison of preview orientation and output on MacBook and phone.
- Heap/storage/network evidence that only the current winner remains.

## Blocked by

07 — Run a cancel-safe countdown into a first capture.

## Not included

Manual accessibility capture or final release hardening.
