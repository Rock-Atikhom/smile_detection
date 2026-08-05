# Ticket 03 Release-Blocker Correction Plan

> Authorized by the project owner on 2026-08-03 as an emergency follow-up before the professor delivery deadline. Execute with subagent-driven development and strict test-driven development.

**Goal:** Close the two load-bearing findings left by the one permitted scoped re-review of commit `03b05e0`, without broadening Ticket 03 beyond verified runtime initialization.

**Architecture:** Preserve the existing compiled-manifest trust boundary, source-client transaction ownership, and typed cache/integrity errors. Carry an operational immutable-cache serve failure to the runtime as the bounded recoverable `offline-cache-failed` outcome, distinct from HTTP/network download failure and proven corruption. Treat completion-marker persistence as part of the owned cancellable transaction, with a cancellation check after the awaited write and cleanup before any ready result.

## Global Constraints

- Preserve every constraint in `docs/superpowers/specs/2026-07-31-offline-vision-runtime-design.md` and the completed follow-up plan.
- Ticket 03 stops at verified Face Landmarker initialization. Do not add frame submission, face evidence, landmarks, smile scoring, capture, guidance, or participant data.
- Fix both findings as one bounded task using real RED evidence before production changes.
- Operational cache/response/digest failures expose only recoverable `offline-cache-failed`; proven missing bytes, size mismatch, hash mismatch, malformed completion records, and inventory mismatch remain fatal `runtime-integrity-failed`.
- An owned transaction cancelled during completion-marker persistence must not return ready or retain a completion marker/incomplete release.
- Do not push or merge until task review, final scoped review, full automated gates, CI/deployment, and required device acceptance are resolved.

### Task 1: Close the operational-serve and marker-cancellation gaps

**Files:**

- Modify only as required: `apps/web/src/service-worker/sw.ts`
- Modify only as required: `apps/web/src/service-worker/sw.test.ts`
- Modify only as required: `apps/web/src/service-worker/vision-cache.ts`
- Modify only as required: `apps/web/src/service-worker/vision-cache.test.ts`
- Modify only as required: `apps/web/src/vision/integrity.ts`
- Modify only as required: `apps/web/src/vision/integrity.test.ts`
- Modify only as required: runtime loader/worker tests if the existing boundary requires an explicit typed transport contract

- [x] Reproduce the immutable target-cache operational failure end-to-end and prove it currently becomes `runtime-download-failed` instead of recoverable `offline-cache-failed`.
- [x] Implement the smallest typed response/transport boundary that preserves operational failure classification without weakening the no-network or integrity behavior.
- [x] Reproduce cancellation while the completion-marker `put` is pending and prove the transaction can currently commit/return ready.
- [x] Add the post-write ownership/cancellation check and cleanup needed to prevent marker retention and ready publication.
- [ ] Run focused tests for service-worker routing, integrity/loader classification, cache transactions, and cancellation; then run the full Ticket 03 automated gates.
- [x] Append exact RED/GREEN evidence, changed files, self-review, and concerns to this plan's report; commit locally without pushing.

## Review and Release Boundary

After the task receives clean spec/quality review and a clean final scoped review, independently run the full unit, manifest, format, lint, typecheck, build, delivery, runtime E2E, full E2E, and diff gates. Only then push PR #3, wait for GitHub/Cloudflare success, and request fresh Mac Safari, Mac Chrome, and Android Chrome acceptance. Ticket 04 begins only after Ticket 03 is genuinely complete.
