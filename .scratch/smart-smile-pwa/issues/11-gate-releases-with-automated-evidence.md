Status: planned
Execution: agent-led, with privacy/accessibility sign-off

# 11 — Gate releases with automated privacy and browser evidence

## Outcome

Every pull request and production candidate receives reproducible functional, privacy, accessibility, offline, performance, and browser evidence before deployment.

## User stories

- PRD 68–74: complete release gates and delivery.
- PRD 57–58: diagnostic privacy and no remote telemetry.
- PRD 69–71: accessibility, browser, and physical-device preparation.

## Acceptance criteria

- [ ] One documented validation command runs pure contracts, reducer, components, accessibility, camera adapters, worker, capture, service worker, storage, and privacy suites.
- [ ] Playwright synthetic-camera scenarios cover the complete automatic and manual happy paths plus defined faults.
- [ ] CI performs clean install, lock validation, type/lint/test, production build, bundle budgets, asset hash, license, and security-header checks.
- [ ] A network allowlist proves camera through review makes no unexpected request.
- [ ] Browser storage inventory proves photos, frames, landmarks, and diagnostics are not persisted.
- [ ] Automated accessibility checks cover every canonical state and responsive breakpoint.
- [ ] Benchmark output records Git, lock, app, model/WASM, fixture, browser, OS class, camera dimensions, tier, FPS, latency, replacements, stale counts, long tasks, memory, and capture duration.
- [ ] Release thresholds encode 50 ms average, 75 ms p95, 20 accepted FPS on release devices, result age at most 150 ms, bounded memory, and zero privacy violations.
- [ ] Required automated evidence runs for Chromium; WebKit and supported browser smoke coverage is recorded where automation capabilities permit.
- [ ] Cloudflare preview is created only from a passing build, and production deployment requires approved main-branch checks.
- [ ] The report links failures to stable reason codes and never hides failed attempts through automatic retry.

## Verification

The ticket is the verification harness. Completion requires one generated candidate report from CI plus one local benchmark report using synthetic media.

## Blocked by

10 — Make sessions resilient, observable, and update-safe.

## Not included

Claiming physical-browser support from automation alone.
