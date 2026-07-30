# 06 — Enforce lighting Quality Gates

**What to build:** Live lighting assessment that stops capture progress in unusable conditions, explains the problem to the Participant, and provides deterministic diagnostics for installation tuning.

**Blocked by:** 03 — Guide one Participant into the Capture Zone.

**Status:** paused — superseded by Smart Smile PWA planning pending approval

- [ ] Face-ROI Y10/Y50/Y90 and full-frame median are computed from the approved inset region without changing the preview's color semantics.
- [ ] Face Y50 below 32 or Y10 below 8 is a hard darkness failure that cannot be rescued by enhancement.
- [ ] Low-light and low-contrast enhancement eligibility is reported separately from hard rejection.
- [ ] Lighting invalidity blocks READY/VERIFYING progress and yields high-priority, actionable guidance.
- [ ] Debug mode shows the luma measurements and active Quality Gate reason without retaining source imagery.
- [ ] Seeded image fixtures cover normal, dim, backlit, low-contrast, clipped, and noisy conditions at 1280x720 and 640x480 with boundary-value assertions.
