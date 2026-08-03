# SDD ledger — plan: docs/superpowers/plans/2026-08-03-offline-vision-runtime-release-blockers.md

Emergency Ticket 03 follow-up authorized by the project owner on 2026-08-03 before the professor delivery deadline.

Pre-flight: one tightly coupled correction task; no conflict found with the approved Ticket 03 constraints. Base `03b05e0`; branch remains local and unpushed.

Root-cause verification:
- `sw.ts` maps typed operational immutable-cache failures to an indistinguishable empty 503; `verifyVisionResponse()` then classifies that HTTP response as `runtime-download-failed`, losing the required recoverable `offline-cache-failed` outcome.
- `vision-cache.ts` checks cancellation immediately before the awaited completion-marker write but not after it, so cancellation during persistence can still return `ready` and retain the marker.

Task 1 implementation: complete from base `03b05e0` with both regressions observed RED before production edits. Operational immutable-cache exceptions now cross the synthetic response boundary as an exact bounded `offline-cache-failed` token while retaining an empty 503 and no network fallback. Completion-marker persistence now rechecks cancellation after the awaited write; cancellation enters the existing owned incomplete-cache cleanup before any ready result.

Verification status: focused routing/cache/integrity/loader/worker tests pass (5 files, 83 tests), and the full non-browser local gates pass (vision manifest, formatting, lint, typecheck, 14 files/242 unit tests, production build, and diff check). Browser, delivery, runtime E2E, full E2E, controller review, CI/deployment, device acceptance, push, and merge remain pending under the plan's release boundary. This ledger does not claim a clean controller review or release approval.

Task 1: complete (commits `03b05e0..fb99371`, task spec compliance and quality review clean; no Critical, Important, or Minor findings).

Final whole-branch review: three Important findings identified after Task 1 — stale v1 controller proof, ambient trust of the operational response marker, and cache population blocking the independent online runtime/camera path.

Final whole-branch review fix wave: implemented locally with strict RED/GREEN regressions. The handshake contract is v2; response-marker trust is explicit and limited to the verified immutable runtime route; missing-cache population and runtime startup are independent while query/integrity/first-use-offline checks remain fail closed. Fresh focused tests pass (8 files/173 tests), and all non-browser local gates pass (vision manifest, formatting, lint, typecheck, 14 files/246 unit tests, production build, and diff check). The controller's scoped re-review, browser/release gates, CI/deployment, device acceptance, push, and merge remain pending. This ledger does not claim the final scoped re-review is clean or grant release approval.

Final whole-branch review scoped re-review: clean — all three Important findings ADDRESSED with no new Critical, Important, or Minor breakage in `bf28649..f8f0622`. Independent controller verification, push/CI/deployment, and fresh device acceptance remain pending.

Independent verification: BLOCKED — focused 173/173, full unit 246/246, manifest, formatting, lint, typecheck, production build, diff, and delivery 15/15 gates passed. The real runtime browser journey failed before `Camera ready`: with runtime and cache started independently, the worker requested `face_landmarker.task` while the release cache was incomplete; the service worker returned 503 under the no-network-fallback route, runtime entered `Smile detection needs attention`, and the cache later completed. This is a load-bearing architecture gap, not a timeout-only assertion. Per the final-review breaker, no additional fix wave, push, deployment, device acceptance, merge, or Ticket 04 work was performed.
