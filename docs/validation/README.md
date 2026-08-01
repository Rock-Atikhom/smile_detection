# Validation

Web delivery is validated from the repository root with formatting, ESLint, referenced TypeScript
projects, Vitest, a production build, and Playwright against the built output under production
headers. Ticket 02 Vitest coverage owns the camera-controller and React contracts: permission
timeouts and cancellation, late-stream disposal, decoded attachment, track-end recovery,
generation and warm-up transitions, retained-stream and mobile release-before-request switching,
permission preservation, interruption and orientation recovery, teardown, semantic controls, and
focus restoration. Playwright runs Chromium's synthetic camera against the production build and
checks the decoded, mirrored, contained preview, intentional stop, responsive browser geometry,
mobile system-status sheet, desktop drawer, first-viewport controls, conditional switching, no
post-load application requests, and empty IndexedDB, local/session storage, Cache Storage,
service-worker registrations, and script-visible cookies. The Python reference retains its locked
38-test, Ruff, and strict mypy gates.

The active-session Native Camera Overlay is additionally checked at 390x844,
844x390, 768x1024, 1440x900, and the 360x225 400-percent reflow equivalent.
The checks cover semantic status, Help/Stop/Switch focus order, 48-pixel targets, direct
360x225 overflow and target sizing, full-stage portrait geometry, compact top and bottom
chrome anchored to the stage edges, short-height normal-flow fallback, reduced motion, and
scrim contrast for status, controls, Help, and product identity against representative black
and white camera frames.

The base Ticket 02 device review passed on the target MacBook and phone, including one-tap
front/rear switching. Only the new Native Camera Overlay phone visual review remains pending; it
covers portrait and landscape composition, bright and dark scenes, Stop/Restart/Help, one-handed
comfort, assistive announcements, and MacBook keyboard behavior.

Real Cloudflare preview and response-header evidence remains an owner-run acceptance step until the
project and credentials are configured.

## Ticket 03 runtime validation

Ticket 03's automated browser acceptance initializes the self-hosted
`@mediapipe/tasks-vision@0.10.35` / Face Landmarker `float16/1` release from
same-origin assets, verifies the manifest release ID `6c23e451b7a9b523`, and
proves an online setup can close and reopen offline. It also covers the
shell-only first-use-offline recovery, integrity failure, incomplete-cache
rollback, the allowlisted static-cache inventory, and production CSP. This is a
runtime-initialization boundary only; it is not evidence of frame processing,
landmark extraction, or smile detection.

Run the release checks from the repository root:

```bash
npm run vision:vendor --workspace=@smart-smile/web
npm run web:vision:check
npm run web:format:check
npm run web:lint
npm run web:typecheck
npm run web:test
npm run web:build
npm run web:e2e -- vision-runtime.spec.ts delivery-config.spec.ts
npm run web:e2e
```

The vendoring command is for an intentional reviewed refresh; the manifest check
must pass before shipping. For named physical-browser acceptance, use online preparation followed by airplane-mode close/reopen: online, select **Continue to camera** and wait until both runtime and offline use report ready; close the browser page; enable airplane mode; reopen the page; select **Continue to camera**; then confirm **Camera ready** without a network request. Record only the privacy-safe fields in [the Ticket 03 device matrix](ticket-03-device-matrix.md).
Do not record camera content, device identifiers, landmarks, geometry, scores,
or participant information.
