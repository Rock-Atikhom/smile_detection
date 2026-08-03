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
