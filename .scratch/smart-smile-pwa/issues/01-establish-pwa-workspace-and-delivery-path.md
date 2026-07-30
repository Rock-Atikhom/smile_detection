Status: in-progress — external Cloudflare preview evidence pending
Execution: agent-led, with human preview review

# 01 — Establish the PWA workspace and delivery path

## Outcome

A responsive Smart Smile shell runs through one command in local development, one command as a locally served production build, GitHub CI, and a Cloudflare Pages preview, while the existing Python app remains runnable as a reference.

## User stories

- PRD 72: documented local development and production-serving commands.
- PRD 73–74: gated preview and production delivery.
- PRD 68–70: test foundations.

## Acceptance criteria

- [x] Create the approved apps/web, apps/desktop-reference, packages/contracts, and docs topology.
- [x] Move the existing Python application and its assets without changing behavior; preserve its tests and documented run command.
- [x] Scaffold React, TypeScript, Vite, Tailwind, Radix primitives, Vitest, and Playwright with pinned dependencies and one lockfile strategy.
- [x] Render an accessible Smart Smile shell at phone, tablet, and desktop widths.
- [x] Provide local development, production build, and local production-preview commands.
- [x] CI runs formatting, lint, type checks, unit tests, component smoke tests, and production build.
- [ ] Cloudflare Pages build settings publish the Vite output and create a pull-request preview.
- [ ] Preview response headers include the initial restrictive security and Permissions Policy baseline.
- [x] README defines Web, Local, Mobile, and the current non-native MVP boundary.
- [x] No feature from paused desktop tickets 03–14 is accidentally implemented or deleted.

## Verification

- Fresh-clone install and commands.
- Responsive shell screenshots at 390 by 844, 844 by 390, 768 by 1024, and 1440 by 900.
- Python test suite plus new web quality gates.
- Preview URL and response-header evidence.

## Not included

Camera permission, MediaPipe, offline model caching, or photo capture.

## Task 1 — Preserve the Python reference inside the workspace

- Move the existing Python package, tests, configuration, model, notices, locks, and research documentation under apps/desktop-reference.
- Keep root-level developer commands that make the Python reference easy to install, test, lint, type-check, and run.
- Prove the 38-test baseline and existing quality gates still pass from the new topology.

## Task 2 — Build the tested responsive web shell

- Add a private root npm workspace for apps/web and packages/*, one root package-lock.json, Node 22 engine metadata, and exact dependency versions without semver ranges.
- Pin this verified compatibility set: react 19.2.8, react-dom 19.2.8, @types/react 19.2.17, @types/react-dom 19.2.3, @types/node 26.1.2, TypeScript 6.0.3, Vite 8.1.5, @vitejs/plugin-react 6.0.4, Vitest 4.1.10, Tailwind and @tailwindcss/vite 4.3.3, @radix-ui/react-dialog 1.1.23, @testing-library/react 16.3.2, @testing-library/jest-dom 7.0.0, and jsdom 30.0.1.
- Create apps/web with React 19, TypeScript, Vite, Tailwind 4 through the Vite plugin, and a Radix Dialog privacy disclosure.
- Use strict TDD for observable shell behavior. Write and run the component test before App implementation; record the expected failure caused by missing participant-facing behavior, then implement the minimum shell and record the passing run.
- The shell must expose a semantic header, main region, footer, one h1, the exact heading “Take a smile photo privately,” and the exact promise “Camera and smile detection run on this device. No camera image or photo is uploaded.”
- “How privacy works” opens an accessible disclosure explaining no account, no upload, no microphone, and no application photo persistence.
- Show a clearly labeled foundation-preview camera stage with no video element. “Continue to camera” remains visibly and semantically disabled with an explanation that camera setup is the next delivery step.
- A test must prove initial render and interaction never call navigator.mediaDevices.getUserMedia, even when that API is present.
- Implement the approved calm visual tokens, at least 48-by-48 CSS-pixel controls, visible focus, reduced-motion handling, safe-area padding, and responsive single-column mobile/two-column desktop layout.
- Do not add camera streams, MediaPipe, service workers, offline behavior, capture, diagnostics, or photo behavior.

## Task 3 — Add reproducible quality and delivery gates

- Pin ESLint 10.8.0, @eslint/js 10.0.1, typescript-eslint 8.65.0, globals 17.8.0, eslint-plugin-react-hooks 7.1.1, eslint-plugin-react-refresh 0.5.3, Prettier 3.9.6, and @playwright/test 1.62.0 without version ranges.
- Add root and web commands for development, formatting check, lint, type-check, unit/component tests, Playwright browser tests, production build, and locally serving the production build.
- Add an ESLint flat configuration, Prettier configuration, and Playwright configuration. Browser tests must exercise the real built shell at 390x844, 844x390, 768x1024, and 1440x900; assert the semantic privacy shell, disabled camera action, absence of video, and no horizontal page overflow; attach a screenshot for each viewport.
- Extend GitHub CI with a Node 22 web job using npm ci and all web gates. Preserve the existing Python job and its exact checks.
- Add apps/web/public/_headers so Cloudflare Pages applies: a self-only default/script/style/connect policy, no objects, self base/form, no framing, camera self only, microphone disabled, no referrer, nosniff, and HTTPS upgrade. Keep the policy compatible with later self-hosted workers/WASM by documenting that ticket 03 will add only the minimum verified directives it requires.
- Add docs/deployment/cloudflare-pages.md with the private GitHub repository connection, root npm build command, apps/web/dist output, Node 22 setting, preview-deployment behavior, production branch, and post-deploy header check. Do not claim a preview URL until the external Cloudflare project is actually connected.
- Expand the root README with the formal Web, Local, and Mobile definitions plus exact development, local production, validation, Python-reference, and Cloudflare setup commands.
- Verify the production build contains _headers and no camera, MediaPipe, service-worker, photo, or analytics code.

## Task 4 — Verify and close ticket 01

- Remove dependency/build caches in a targeted, recoverable way only when required, then run npm ci and the complete Python/web validation commands from the repository root.
- Verify the four responsive Playwright artifacts, built _headers, exact dependency pins, production bundle, and the absence of ticket-02 camera, MediaPipe, service-worker, photo, persistence, and analytics behavior.
- Check whether a Cloudflare credential/project is available without exposing secret values. If unavailable, record the external preview as the only human-owned acceptance item and do not falsely mark it complete.
- Update the ticket checklist and completion evidence. Mark the ticket completed only if every acceptance criterion, including an actual Cloudflare preview, has evidence; otherwise mark it in-progress with the exact remaining human action.

## Completion evidence

Verified locally on 2026-07-30 from the repository root with Node 22.22.2 and the committed
lockfiles:

- `npm ci` completed with zero reported vulnerabilities; formatting, ESLint, TypeScript,
  two Vitest component tests, and the production build passed.
- Playwright passed its delivery-policy checks and the built-shell checks at 390 by 844,
  844 by 390, 768 by 1024, and 1440 by 900. Each viewport produced a correctly sized
  screenshot artifact, the camera action stayed disabled, no video existed, and no page
  overflow was detected.
- `apps/web/dist/_headers` is byte-identical to `apps/web/public/_headers`. The policy includes
  the documented CSP HTTPS upgrade and restrictive Cloudflare Pages headers.
- The production bundle is 230.93 kB JavaScript and 8.37 kB CSS before gzip. Source inspection,
  browser checks, and the component guard found no camera acquisition, MediaPipe, service
  worker, capture, persistence, or analytics behavior. The runtime made only the three expected
  same-origin shell requests and left browser storage empty.
- All required npm dependency versions are exact in the web manifest and resolve to those
  versions through the root lockfile. The empty `packages/contracts` boundary is protected by
  a delivery test and contains no scripts, dependencies, or runtime implementation.
- `make python-sync`, the 38 Python tests, Ruff formatting and lint checks, and strict mypy all
  passed for the preserved desktop reference.
- No Cloudflare credential indicator, project configuration, verified deployment hostname, or
  preview-response evidence was available in this environment. No URL has been guessed.

Remaining human-owned action: the repository owner must connect the private GitHub repository
to a Cloudflare Pages project using `docs/deployment/cloudflare-pages.md`, create a pull-request
preview, record its real URL, and verify its live response headers. Only then may the two open
Cloudflare acceptance criteria be checked and this ticket marked completed.
