# Validation

Web delivery is validated from the repository root with formatting, ESLint, referenced TypeScript
projects, Vitest, a production build, and Playwright against the built output under production
headers. Ticket 02 Playwright runs Chromium's synthetic camera and checks a decoded, mirrored,
contained preview, intentional stop, responsive control reachability at 390x844, 844x390, 768x1024,
1440x900, and 200/400 percent reflow equivalents. It also verifies the mobile system-status sheet,
desktop drawer, first-viewport mobile camera controls, limited-enumeration facing-mode switching,
mobile release-before-request ordering and failure recovery, no post-load application requests,
one-action front/rear facing-mode toggling without physical-device cycling, no post-load
application requests, and empty IndexedDB, local/session storage, Cache
Storage, service-worker registrations, and script-visible cookies. The Python reference retains its
locked 38-test, Ruff, and strict mypy gates.

The active-session Native Camera Overlay is additionally checked at 390x844,
844x390, 768x1024, 1440x900, and the 360x225 400-percent reflow equivalent.
The checks cover semantic status, Help/Stop/Switch focus order, 48-pixel targets,
full-stage portrait geometry, short-height normal-flow fallback, reduced motion,
and scrim contrast against representative black and white camera frames.

Real-device preview assessment remains a human-only acceptance check: review this MacBook and one
phone before marking the criterion complete.

Real Cloudflare preview and response-header evidence remains an owner-run acceptance step until the
project and credentials are configured.
