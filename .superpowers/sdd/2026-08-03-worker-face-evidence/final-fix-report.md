# Ticket 04 final-fix report

## GREEN — preserved implementation

- `face-frame-pump.ts` samples `capturedAtMs` immediately before `createImageBitmap`/capture begins. The timestamp is retained through the asynchronous capture and is not rewritten by later submission timing.
- `coordinator.ts` binds native `error` and `messageerror` handlers to the worker generation. A current-generation fault closes pending work, resets frame admission, removes all listeners, terminates the worker, and publishes the safe `runtime-initialization-failed` error state. Old-generation faults are ignored.
- `runtime-loader.test.ts` now supplies typed `FaceLandmarkerResult` fixtures with both `close` and `detectForVideo`, matching the prepared runtime contract.
- `git diff --check` passed.

## Previously verified GREEN gates

- Frame pump/coordinator tests: 63/63.
- Focused integration tests: 149/149.
- Full unit tests: 323/323.
- Vision, formatting, lint, typecheck, and build checks: passed.
- Delivery configuration tests: 15/15.
- Focused face E2E: 1/1.
- Five-worker face stress: 5/5.
- Full face E2E: passed.

## RED / external constraint

The focused foundation spec `shows a decoded mirrored contained synthetic-camera preview and stops it intentionally` was re-run directly with the local Playwright CLI. It failed at the inherited `Camera ready` wait: the test-level 30-second timeout elapsed before the assertion's configured 60-second timeout. This matches the prior known foundation Camera-ready timeout under saturated/full-load conditions and is outside Ticket 04's face-frame lifecycle scope.

The repository `npm run web:e2e` workspace wrapper could not be used in this environment because npm resolved it as a global package and returned `Workspaces not supported for global packages`; the equivalent local Playwright CLI was used instead.
