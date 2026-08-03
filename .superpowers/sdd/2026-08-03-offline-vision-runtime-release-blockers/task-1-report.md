# Task 1 report: operational serve and marker cancellation

## Status

Implemented both coupled Ticket 03 release-blocker corrections from local base
`03b05e0`. The branch remains local and unpushed. No merge, reset, squash,
device-matrix edit, deferred UI change, Ticket 04 behavior, or participant-data
surface was introduced. Controller review and the post-review browser/release
gates remain pending; this report does not claim a clean review or release
approval.

## Root causes and production data flow

### Operational immutable-target cache failure

`matchCompletedVisionAsset()` already converted Cache Storage, response-body,
and digest exceptions to the bounded `offline-cache-failed` operational type.
The immutable fetch route in `sw.ts` discarded that type, however, returning the
same empty 503 used for an ordinary unavailable response. The runtime's real
`verifyVisionResponse()` boundary therefore saw only `response.ok === false`
and emitted `runtime-download-failed`.

The correction adds one exact same-origin synthetic-response header,
`x-smart-smile-vision-error: offline-cache-failed`, only for caught operational
immutable-cache failures. `verifyVisionResponse()` recognizes that allowlisted
token only on a non-success response and restores the existing bounded
operational error. Ordinary HTTP failures remain `runtime-download-failed`.
Proven missing target bytes, size/hash mismatch, malformed completion records,
and inventory mismatch retain the existing fatal integrity path. The response
body stays empty and the immutable route never falls back to the network.

### Cancellation during completion-marker persistence

`cacheVisionRelease()` checked its owned abort signal before awaiting the
completion-marker `cache.put()`, then immediately returned `ready`. Cancellation
while that promise was pending could abort the owned controller but was never
observed after persistence completed.

The correction rechecks the owned abort signal immediately after the awaited
marker write. Cancellation now throws the bounded `AbortError` into the
existing mutation cleanup, which deletes the incomplete current release before
the function can publish `ready`; a previously completed older release remains
untouched.

## Strict TDD evidence

All Vitest commands ran from `apps/web`.

### RED: operational immutable-cache transport

```bash
npm exec -- vitest run src/service-worker/sw.test.ts -t "carries an operational immutable-cache failure"
```

Result before production edits: exit 1; 1 failed and 16 skipped. The real
runtime verifier received `VisionAssetError` with
`code: "runtime-download-failed"` instead of expected
`code: "offline-cache-failed"`. This proved the type was lost at the synthetic
service-worker response boundary.

### GREEN: operational immutable-cache transport

The same command exited 0 with 1 passed and 16 skipped after the exact bounded
response token and verifier recognition were added.

### RED: held completion-marker write

```bash
npm exec -- vitest run src/service-worker/vision-cache.test.ts -t "cancelled while the completion-marker write is pending"
```

Result before production edits: exit 1; 1 failed and 27 skipped. The
deterministically held marker `put()` was cancelled after persisting but before
its promise resolved; `cacheVisionRelease()` resolved `"ready"` instead of
rejecting. This proved the missing post-write cancellation check.

### GREEN: held completion-marker write

The same command exited 0 with 1 passed and 27 skipped after the post-write
abort check was added. The regression also proves current-release deletion and
older-release retention.

### Focused GREEN

```bash
npm exec -- vitest run src/service-worker/sw.test.ts \
  src/service-worker/vision-cache.test.ts \
  src/vision/integrity.test.ts \
  src/vision/runtime-loader.test.ts \
  src/vision/worker-runtime.test.ts
```

Result: exit 0; 5 files and 83 tests passed.

After the mechanical Prettier correction, the directly affected routing and
integrity slice was rerun: 2 files and 22 tests passed.

## Non-browser local gates

- `npm run web:vision:check` — exit 0; generated manifest exact.
- `npm run web:format:check` — the first run correctly reported the two newly
  edited files; after Prettier, the fresh final run exited 0 with all matched
  files formatted.
- `npm run web:lint` — exit 0; pristine ESLint output.
- `npm run web:typecheck` — exit 0; TypeScript build passed.
- `npm run web:test` — exit 0; 14 files and 242/242 tests passed.
- `npm run web:build` — exit 0; 80 client and 73 service-worker modules, seven
  precache entries, and `dist/sw.js` emitted. The only warning was the existing
  upstream `inlineDynamicImports` deprecation.
- `git diff --check` — exit 0.

Per the task's non-browser local verification boundary and the plan's explicit
post-review release boundary, delivery, runtime E2E, full E2E, CI/deployment,
and device acceptance were not claimed here. The prior managed environment's
localhost-bind restriction also remains relevant to controller-run browser
verification.

## Changed files

- `apps/web/src/vision/integrity.ts`
- `apps/web/src/service-worker/sw.ts`
- `apps/web/src/service-worker/sw.test.ts`
- `apps/web/src/service-worker/vision-cache.ts`
- `apps/web/src/service-worker/vision-cache.test.ts`
- `docs/superpowers/plans/2026-08-03-offline-vision-runtime-release-blockers.md`
- `.superpowers/sdd/2026-08-03-offline-vision-runtime-release-blockers/progress.md`
- `.superpowers/sdd/2026-08-03-offline-vision-runtime-release-blockers/task-1-report.md`

## Self-review and concerns

- Mutation check: removing either the operational response token or its exact
  verifier recognition makes the end-to-end regression return
  `runtime-download-failed`; removing the post-marker abort check makes the held
  write regression resolve `ready` and retain the current release.
- The typed transport contains one fixed reason token, no raw error, URL,
  cache bytes, headers from upstream, participant data, or stack. The response
  body is empty.
- The token is recognized only for non-success responses. Generic 404/503 and
  fetch rejection behavior remains `runtime-download-failed`; the existing
  short-body and fatal-route tests preserve `runtime-integrity-failed` for
  proven corruption.
- The operational route still calls no network fallback. The fatal route still
  invalidates/deletes corrupt cache trust and serves bounded empty bytes so the
  runtime's exact size/hash contract rejects them.
- Cancellation cleanup remains keyed by trusted source client, generation, and
  release. The deterministic test writes the marker before holding the `put()`
  promise, which covers the load-bearing race rather than merely cancelling
  before persistence begins.
- No production refactor was performed beyond the exact typed boundary and
  post-write ownership check. The deferred passive-hook UI minor and all Ticket
  04 frame/evidence/scoring behavior remain untouched.
- Remaining concerns are procedural/external: controller review, browser and
  delivery gates, CI/deployment, and fresh required-device acceptance are still
  pending. No clean verdict is asserted.

## Final whole-branch review fix wave

### Status and scope

Addressed all three Important findings from the final whole-branch review in
one permitted local fix wave. The branch remains unpushed. This section records
implementation and self-verification only: the controller's scoped re-review,
browser/release gates, CI/deployment, and device acceptance remain pending, and
no clean review or release verdict is claimed. The deferred passive-hook UI
Minor and Ticket 04 behavior remain untouched.

### Root causes and corrections

1. The page and service worker still advertised
   `smart-smile-vision-sw-v1` after the controller-proof contract changed. A
   previously installed v1 controller could therefore satisfy the exact guard.
   The shared protocol is now v2, which rejects the old ACK symmetrically while
   retaining the existing bounded replacement-controller acquisition.
2. `verifyVisionResponse()` trusted the bounded operational header in every
   call context. A failed origin response or completed-cache entry could spoof
   that header and be downgraded from corruption/download failure to a
   recoverable cache error. Verification now defaults to untrusted; only the
   verified service-worker immutable runtime route passes an explicit trusted
   context. Cache population, inventory, and completed-cache verification stay
   untrusted, so a spoofed failed cached entry invalidates/deletes the release.
3. `runPreflight()` awaited missing-cache population before constructing the
   runtime worker, and any cache-only operational result returned `failed`,
   withholding camera authorization. After the existing query, integrity, and
   first-use-offline fail-closed checks, runtime initialization and cache
   population now proceed independently. Cache-only operational failure marks
   offline use as needing attention while the online runtime may reach ready.
   Cache integrity remains fatal and cancels/terminates the concurrent runtime;
   cancellation and generation guards suppress late publication in both
   directions.

### Strict TDD evidence

All targeted Vitest commands ran from `apps/web`.

- Prior-controller proof RED:
  `npm exec -- vitest run src/service-worker/client.test.ts -t "prior-protocol controller"`
  exited 1 with 1 failed/20 skipped before production edits. The authoritative
  assertion expected the replacement-controller listener to remain registered
  but received zero, proving the v1 ACK had completed acquisition. The initial
  draft reached a later TypeError for the same reason; the harness was tightened
  before changing production code. The same command then exited 0 with 1
  passed/20 skipped after the v2 bump.
- Spoofed-marker RED:
  `npm exec -- vitest run src/vision/integrity.test.ts src/service-worker/vision-cache.test.ts -t "spoof"`
  exited 1 with 2 failed/33 skipped. The untrusted response was classified
  `offline-cache-failed` instead of `runtime-download-failed`, and the completed
  cache rejected operationally instead of resolving `integrity-failed` and
  being deleted. The same command then exited 0 with 2 passed/33 skipped.
- Runtime/cache independence RED:
  `npm exec -- vitest run src/vision/coordinator.test.ts -t "cache-only operational failure independent"`
  exited 1 with 1 failed/30 skipped because `prepare()` returned `failed`
  instead of `started`. The same command then exited 0 with 1 passed/30 skipped.
- Fresh focused GREEN:
  `npm exec -- vitest run src/vision/protocol.test.ts src/service-worker/client.test.ts src/service-worker/sw.test.ts src/vision/integrity.test.ts src/service-worker/vision-cache.test.ts src/vision/runtime-loader.test.ts src/vision/coordinator.test.ts src/App.test.tsx`
  exited 0 with 8 files and 173/173 tests passed.

### Final non-browser gates

- `npm run web:vision:check` — exit 0; generated manifest exact.
- `npm run web:format:check` — exit 0 after formatting the two reported files;
  all matched files use Prettier style.
- `npm run web:lint` — exit 0.
- `npm run web:typecheck` — exit 0 after replacing a test-fixture-only
  `undefined` override with the explicitly imported real verifier.
- `npm run web:test` — exit 0; 14 files and 246/246 tests passed.
- `npm run web:build` — exit 0; 80 client modules, 73 service-worker modules,
  seven precache entries, and `dist/sw.js` emitted. The existing upstream
  `inlineDynamicImports` deprecation warning remains.
- `git diff --check` — exit 0 before staging.

### Final-wave changed files and self-review

- Protocol/controller proof: `apps/web/src/vision/protocol.ts` and
  `apps/web/src/service-worker/client.test.ts`.
- Response trust boundary: `apps/web/src/vision/integrity.ts`, its test,
  `apps/web/src/vision/runtime-loader.ts`, and the service-worker/cache tests.
- Independent orchestration: `apps/web/src/vision/coordinator.ts`, its test,
  and `apps/web/src/App.test.tsx`.
- Mutation checks are load-bearing: restoring v1 accepts the prior-controller
  ACK; removing the explicit trust check lets both spoof tests regress; awaiting
  cache completion again makes `prepare()` fail and prevents camera request.
- Query indeterminacy, completed-cache integrity, and first-use-offline still
  fail closed. Generic HTTP failure stays `runtime-download-failed`; only the
  verified immutable route may restore the bounded operational cache reason.
- Cache-only failure cannot terminate or withhold an otherwise valid online
  runtime. Conversely, concurrent cache integrity posts worker cancellation,
  terminates it, and publishes fatal integrity. Runtime integrity aborts the
  matching preflight and cancels owned cache work. Restart/cancel generation
  guards ignore late cache completion.
- No participant data, raw error, cache bytes, arbitrary URL/header, or stack
  crosses a public boundary. No passive-hook UI implementation, scoring,
  evidence, frame processing, or other Ticket 04 scope was added.
