Status: planned
Execution: agent-led

# 03 — Load a verified offline-capable vision runtime

## Outcome

The application downloads, verifies, initializes, and caches the exact MediaPipe runtime, WASM variants, model, and license material so a returning device can start offline.

## User stories

- PRD 50–52: offline and safe updates.
- PRD 59 and 66–67: worker and WASM policy.
- PRD 73–74: reproducible delivery.

## Acceptance criteria

- [ ] Pin and self-host MediaPipe Tasks Vision, WASM SIMD, normal WASM, and the exact Face Landmarker bundle.
- [ ] Generate a versioned asset manifest with byte size, SHA-256, source, license, and notice references.
- [ ] CI rejects unexplained runtime/model byte changes or missing notices.
- [ ] A dedicated worker verifies critical asset bytes before Face Landmarker initialization.
- [ ] Capability selection prefers SIMD and falls back to ordinary WASM without using WebGPU.
- [ ] The service worker atomically caches the complete release asset set under a versioned name.
- [ ] Offline-ready appears only after every required asset can be read.
- [ ] First use while offline shows the approved connection guidance.
- [ ] A failed update leaves the last complete version usable.
- [ ] Photos, camera frames, object URLs, and diagnostics are proven absent from Cache Storage and other browser persistence.

## Verification

- Hash-manifest and notice tests.
- Worker startup tests for SIMD, fallback, corrupt asset, missing asset, and offline cases.
- Service-worker install/update/rollback tests.
- Browser storage inventory before and after a synthetic session.
- Online-first then offline-reload Playwright journey.

## Blocked by

01 — Establish the PWA workspace and delivery path.

## Not included

Live Face Landmarker results or participant guidance.
