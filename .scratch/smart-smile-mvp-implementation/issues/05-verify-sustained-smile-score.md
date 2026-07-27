# 05 — Verify a sustained Smile Score

**What to build:** A Participant-facing Smile Score and five-second Verification flow that accepts an intentional sustained smile while rejecting expression flicker, speech, and stale or invalid evidence.

**Blocked by:** 04 — Maintain anonymous Face Continuity.

**Status:** ready-for-agent

- [ ] Smile Score combines left/right mouth-smile evidence with the approved bilateral formula and treats missing/invalid evidence as non-smiling.
- [ ] EMA alpha 0.35, high threshold 0.60, low threshold 0.45, validated ranges, and the minimum hysteresis gap are enforced.
- [ ] READY enters VERIFYING only for an eligible Participant at the high threshold; validity remains until below the low threshold.
- [ ] Verification advances for five seconds using capture timestamps and monotonic time.
- [ ] The 300 ms Grace Window pauses rather than advances progress, and expiry resets Verification.
- [ ] The normal overlay presents Smile Score and Verification progress; debug mode adds raw/smoothed values, thresholds, hysteresis state, and Grace Window status.
- [ ] Deterministic fixtures produce zero false starts for neutral, speech, blink, brief occlusion, head motion, no face, multiple faces, and Participant replacement, while sustained intended smiles meet the approved acceptance rate.
