# Offline Vision Runtime Follow-up Correction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `subagent-driven-development` and `test-driven-development` to execute this
> bounded correction task. The original Ticket 03 final-review wave is closed;
> this plan owns the follow-up work and its independent review.

**Goal:** Remove the two remaining Ticket 03 release blockers by proving that
only the current safe service worker can authorize vision startup and by
bounding completed-cache verification without weakening integrity semantics.

**Architecture:** The page and service worker share an exact, versioned
handshake contract. A page controlled by an old or unrecognized worker remains
fail-closed while the newly registered worker activates, claims the page, and
passes the handshake. The service worker verifies one completed release
inventory once per worker lifetime/cache generation, shares an in-flight
verification, invalidates trust before every owned mutation or deletion, and
still verifies each requested immutable asset immediately before serving it.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Workbox 7.4.1, Vitest 4,
Playwright 1.62, Cache Storage, Service Worker lifecycle APIs.

## Global Constraints

- Preserve all constraints and acceptance boundaries in
  `docs/superpowers/specs/2026-07-31-offline-vision-runtime-design.md`.
- Ticket 03 still ends at verified runtime initialization. Do not add frame
  submission, landmarks, smile scoring, capture, guidance, or participant data.
- Do not push or merge the branch until this plan's task review and final review
  are clean and all automated gates pass.
- Never authorize cache population, runtime-worker creation, or camera startup
  through an old, unrecognized, timed-out, or otherwise unverified service
  worker controller.
- A service-worker/cache-query timeout is a distinct indeterminate failure. It
  must never be reported as `missing`, must never trigger repopulation, and must
  fail closed as `offline-cache-failed` before runtime-worker or camera
  authorization.
- Use an explicit shared service-worker protocol/build identifier. The new
  worker must activate and claim existing pages safely; the page must prove the
  controlling worker speaks the expected contract before constructing the
  vision-cache client.
- The previous Ticket 03 worker does not understand the new handshake. Upgrade
  behavior must be tested with an old controller that ignores the handshake and
  a new controller that becomes active through `controllerchange`.
- Verify a completed release's full inventory at most once per service-worker
  lifetime/cache generation, including concurrent query and immutable-fetch
  callers. Memoization may cover only a successfully verified completed cache
  and any in-flight verification for that exact cache generation.
- Invalidate memoized trust before cache population, completion-marker mutation,
  cache deletion, corruption cleanup, or release replacement. A fresh service
  worker starts with no trusted cache state.
- Continue exact size/SHA-256 verification of the requested immutable asset on
  every serve. Any route-time mismatch deletes the release cache, invalidates
  trust, and returns the existing fatal integrity behavior without network
  fallback.
- Keep all request/reply waits bounded and all message guards exact. Do not leak
  raw errors, cache bytes, camera data, device labels, or participant evidence.
- Preserve the existing single-slot/generation ownership, accessible recovery,
  responsive camera UI, offline semantics, and local-only asset policy.

---

### Task 1: Enforce a verified controller boundary and bounded cache trust

**Files:**

- Modify: `apps/web/src/vision/protocol.ts`
- Modify: `apps/web/src/vision/protocol.test.ts`
- Modify: `apps/web/src/service-worker/client.ts`
- Modify: `apps/web/src/service-worker/client.test.ts`
- Modify: `apps/web/src/service-worker/sw.ts`
- Modify: `apps/web/src/service-worker/sw.test.ts`
- Modify: `apps/web/src/service-worker/vision-cache.ts`
- Modify: `apps/web/src/service-worker/vision-cache.test.ts`
- Modify: `apps/web/src/vision/coordinator.ts`
- Modify: `apps/web/src/vision/coordinator.test.ts`
- Modify browser acceptance only where needed to prove an upgrade or timeout
  boundary: `apps/web/e2e/vision-runtime.spec.ts`

**Interfaces:**

- Produces an exact shared handshake command/event and protocol/build identifier
  used by both the page and `sw.ts`.
- Extends cache-query outcomes with a distinct indeterminate result that the
  coordinator maps to bounded `offline-cache-failed` recovery.
- Keeps `ready`, `missing`, and `integrity-failed` semantics unchanged.
- Adds service-worker-lifetime completed-cache trust with explicit invalidation
  inside `vision-cache.ts`; no UI or React state owns this trust.

- [x] **Step 1: Write and run failing protocol/controller tests**

  Add behavioral tests proving: exact handshake messages are accepted and
  malformed/version-mismatched messages are rejected; a current controller must
  reply with the expected identifier before use; an old controller that ignores
  the handshake is never used; registration waits for `controllerchange` and
  accepts only the newly controlling worker after its valid reply; handshake and
  cache-query timeouts resolve as indeterminate rather than missing; and
  postMessage/registration failures stay fail-closed.

- [x] **Step 2: Implement the safe service-worker activation and handshake**

  Add the minimal exact protocol types/guards, make the new service worker enter
  the activation path needed to replace the old Ticket 03 controller, retain
  `clientsClaim()`, answer the handshake without touching cache state, and make
  the client select only a controller that proves the expected contract. Clean
  up temporary listeners, timers, and pending requests on every terminal path.

- [x] **Step 3: Write and run the failing coordinator timeout test**

  Prove an indeterminate query result publishes recoverable
  `offline-cache-failed`, performs no manifest preflight or cache population,
  constructs no runtime worker, and therefore cannot authorize camera startup.
  Also prove thrown query failures follow the same path rather than becoming
  `missing`.

- [x] **Step 4: Implement the coordinator's indeterminate fail-closed path**

  Extend the bounded query result and route it before all network/cache/runtime
  work. Preserve fatal `runtime-integrity-failed` for verified corruption and
  `first-use-offline` only for a genuine missing cache plus failed manifest
  reachability.

- [x] **Step 5: Write and run failing cache-verification tests**

  Instrument the real verification dependency and prove: repeated and concurrent
  query/immutable-match calls perform one full inventory verification; every
  immutable serve still verifies its target; owned population/deletion and a
  detected target mismatch invalidate trust; the next cache generation performs
  one new full scan; corruption remains fatal and never reaches the network.
  Expectations must assert observable verification counts and outcomes, not
  private implementation structure.

- [x] **Step 6: Implement per-generation cache trust and invalidation**

  Memoize only successful or in-flight completed-inventory inspection for the
  exact cache-storage instance/release generation. Invalidate before all owned
  mutations and deletion attempts. Share concurrent inspection promises, remove
  rejected/failed entries, and keep per-target verification on every immutable
  response. Do not add a timer that converts slow verification into cache
  absence.

- [x] **Step 7: Run focused and full gates**

  Run the focused protocol, client, service-worker, cache, coordinator, and
  runtime browser tests; then run the full web unit suite, TypeScript, lint,
  formatting, vision-manifest check, production build, built-artifact checks,
  runtime E2E, and full E2E. Output must be pristine except already documented
  upstream build warnings.

- [x] **Step 8: Commit and self-review the bounded correction**

  Commit only this plan and its implementation/tests/report artifacts. Report
  exact RED/GREEN commands and results, changed files, and any remaining
  performance or lifecycle concern. Do not push.

## Review and release boundary

After Task 1 receives clean spec and quality verdicts, run a broad whole-branch
review against the Ticket 03 merge base. Only after that review is clean may the
controller push, wait for CI/Cloudflare preview, and request fresh Mac Safari,
Mac Chrome, and Android Chrome first-use/offline-reopen performance evidence.
iPhone Safari remains Pending unless a device becomes available or the project
owner explicitly waives that external acceptance row.
