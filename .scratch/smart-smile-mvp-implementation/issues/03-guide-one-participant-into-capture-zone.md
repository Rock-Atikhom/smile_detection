# 03 — Guide one Participant into the Capture Zone

**What to build:** Live single-face eligibility that tells a Participant how to enter the Capture Zone while keeping inference fresh and preventing absent, undersized, oversized, out-of-zone, or multiple faces from progressing.

**Blocked by:** 02 — Show a live MacBook camera preview.

**Status:** paused — superseded by Smart Smile PWA planning pending approval

- [ ] MediaPipe Face Landmarker runs in the inference lane on aspect-preserving, non-upscaled frames capped at a 640-pixel long edge.
- [ ] Immutable frame/result envelopes carry generation, sequence number, and monotonic capture timestamp through the single-slot latest-frame mailbox.
- [ ] Results from an old generation, out of order, or older than 150 ms are rejected and counted.
- [ ] Exactly one face inside the approved Capture Zone and face-size bounds is eligible; zero or multiple faces are not.
- [ ] The normal overlay distinguishes position, distance/size, and multiple-face guidance without exposing biometric data.
- [ ] Debug diagnostics show face count, normalized bounds, Capture Zone status, frame age, accepted FPS, replacements, and stale-result counts.
- [ ] Deterministic capture-session tests cover every Capture Zone and face-size boundary, no-face behavior, multiple faces, stale results, and mailbox replacement.
