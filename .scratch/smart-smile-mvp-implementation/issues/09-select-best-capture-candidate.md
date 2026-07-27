# 09 — Select the best Capture Candidate

**What to build:** Full Capture Candidate qualification, bounded natural enhancement, sharpness-first ranking, and a safe retry outcome when an entire Capture Burst is unusable.

**Blocked by:** 08 — Complete the first Final Photo path.

**Status:** ready-for-agent

- [ ] Candidate validity rechecks active generation, exactly one face, Face Continuity, Capture Zone/size, Smile Score, darkness, and sharpness.
- [ ] Sharpness uses variance of the Laplacian on the normalized face ROI and rejects scores below 80 before enhancement.
- [ ] Approved bounded gamma, CLAHE, and bilateral denoising are applied only when indicated, with clipping/over-brightness reduction or rejection.
- [ ] Valid candidates rank by sharpness, then Smile Score, then face median closest to 110.
- [ ] An all-invalid burst saves nothing, cleans temporary artifacts, returns to READY, and displays retry guidance.
- [ ] Seeded fixtures cover blur, localized blur, low light, low contrast, clipping, noise, invalid faces, tie-breaking, enhancement, and an empty candidate set.
- [ ] End-to-end tests prove that only the selected candidate becomes the Final Photo and rejected Capture Candidates are not retained.
