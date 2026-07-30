# 07 — Run a cancel-safe Countdown

**What to build:** A clear three-second Countdown that starts only after successful Verification and cancels safely whenever the Participant, smile, lighting, camera, or generation becomes invalid.

**Blocked by:** 05 — Verify a sustained Smile Score; 06 — Enforce lighting Quality Gates.

**Status:** paused — superseded by Smart Smile PWA planning pending approval

- [ ] Five seconds of valid Verification transitions once into COUNTDOWN with no duplicate start.
- [ ] The Countdown uses monotonic deadlines and displays large, deterministic remaining values.
- [ ] Every face, Face Continuity, Smile Score, lighting, and freshness gate remains active throughout Countdown.
- [ ] Brief invalidity uses the approved Grace Window semantics; expiry cancels to READY with a stable reason.
- [ ] Reset, exit, camera failure, generation change, or fatal worker/storage event cancels Countdown according to the approved event priority.
- [ ] Deterministic capture-session tests cover successful completion, every cancellation reason, deadline/event ties, and stale-result arrival at zero.
