# 04 — Maintain anonymous Face Continuity

**What to build:** Anonymous Participant continuity that tolerates ordinary movement and brief interruptions without allowing a second person to inherit Verification progress.

**Blocked by:** 03 — Guide one Participant into the Capture Zone.

**Status:** paused — superseded by Smart Smile PWA planning pending approval

- [ ] A new Participant becomes continuity-eligible only after three consecutive matches over roughly 150 ms.
- [ ] Matching enforces the approved center-distance, height-ratio, and normalized anchor-geometry limits and adapts the reference by the approved factor.
- [ ] An established Participant receives the approved Capture Zone tolerance without weakening initial admission.
- [ ] No-face, multiple-face, and nonmatching observations hold the existing anonymous track for at most 300 ms; expiry clears it.
- [ ] A replacement face cannot inherit progress during the hold, and reset, reconnect, exit, or generation change clears continuity.
- [ ] The overlay and debug panel expose continuity status and safe reason codes without recognition, names, embeddings, or persistent identity.
- [ ] Timestamped Validation Fixtures cover movement, distance change, head turns, occlusion, multiple faces, replacement during hold, recovery, and expiry.
