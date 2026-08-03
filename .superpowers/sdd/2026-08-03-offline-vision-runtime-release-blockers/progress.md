# SDD ledger — plan: docs/superpowers/plans/2026-08-03-offline-vision-runtime-release-blockers.md

Emergency Ticket 03 follow-up authorized by the project owner on 2026-08-03 before the professor delivery deadline.

Pre-flight: one tightly coupled correction task; no conflict found with the approved Ticket 03 constraints. Base `03b05e0`; branch remains local and unpushed.

Root-cause verification:
- `sw.ts` maps typed operational immutable-cache failures to an indistinguishable empty 503; `verifyVisionResponse()` then classifies that HTTP response as `runtime-download-failed`, losing the required recoverable `offline-cache-failed` outcome.
- `vision-cache.ts` checks cancellation immediately before the awaited completion-marker write but not after it, so cancellation during persistence can still return `ready` and retain the marker.

Task 1 implementation: complete from base `03b05e0` with both regressions observed RED before production edits. Operational immutable-cache exceptions now cross the synthetic response boundary as an exact bounded `offline-cache-failed` token while retaining an empty 503 and no network fallback. Completion-marker persistence now rechecks cancellation after the awaited write; cancellation enters the existing owned incomplete-cache cleanup before any ready result.

Verification status: focused routing/cache/integrity/loader/worker tests pass (5 files, 83 tests), and the full non-browser local gates pass (vision manifest, formatting, lint, typecheck, 14 files/242 unit tests, production build, and diff check). Browser, delivery, runtime E2E, full E2E, controller review, CI/deployment, device acceptance, push, and merge remain pending under the plan's release boundary. This ledger does not claim a clean controller review or release approval.
