# 12 — Finish the Participant and debug overlays

**What to build:** A polished, responsive normal experience for the Participant and a togglable diagnostic surface for the operator across every capture and failure state.

**Blocked by:** 10 — Make the Capture Session race-safe.

**Status:** paused — superseded by Smart Smile PWA planning pending approval

- [ ] Normal mode uses the mirrored preview, centered Capture Zone, top-left status, bottom-center Smile Score/Verification progress, large Countdown, and unmirrored Cooldown confirmation.
- [ ] Guidance follows the approved priority from fatal/camera through multiple faces, darkness, position/size, continuity, smile, quality, processing/retry, and success.
- [ ] Color is always paired with text or icon semantics; warning animation remains at or below two flashes per second.
- [ ] At 640x480 and larger, responsive scaling preserves the approved safe margin and minimum readable status, gauge, and Countdown sizes.
- [ ] `d` toggles a right-side debug panel without changing Capture Session state; `r` resets; `q` and Escape exit.
- [ ] Debug mode includes state/reason, Smile Score, gates, continuity, quality, camera/backend, FPS, queues, generations, stale/replaced counts, and transitions without prohibited biometric persistence.
- [ ] Render-level scenario tests or approved image snapshots cover normal, warning, Verification, Countdown, processing, retry, Cooldown, reconnect, and fatal states.
