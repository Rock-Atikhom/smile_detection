# 10 — Make the Capture Session race-safe

**What to build:** Deterministic reset, reconnect, failure, cancellation, and shutdown behavior that prevents late camera, inference, burst, or storage work from corrupting the active Capture Session.

**Blocked by:** 09 — Select the best Capture Candidate.

**Status:** ready-for-agent

- [ ] The canonical state reducer implements the approved states, transition reasons, and event-priority order.
- [ ] Reset advances the session generation, clears Participant continuity and timers, cancels Countdown/burst work, and returns safely to READY.
- [ ] Empty/read failures invalidate the active flow, enter bounded reconnect behavior, release/reopen the camera, repeat warm-up, and never reuse stale frames.
- [ ] The ten-second reconnect budget is honored while native calls return; exhaustion becomes a visible runtime-fatal outcome.
- [ ] Inference failure, storage/encode/commit failure, and unknown commit outcome enter FATAL_ERROR with stable safe codes and no false success.
- [ ] Exit invalidates active generations, stops owned lanes, releases the camera, cleans temporary files, and ignores all late results.
- [ ] Fault injection covers out-of-order/stale results, reset at each state, camera disconnect, reconnect, worker exception, fsync/rename failure, and unknown commit outcome.
