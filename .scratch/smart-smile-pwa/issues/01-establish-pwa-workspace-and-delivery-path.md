Status: ready-for-agent
Execution: agent-led, with human preview review

# 01 — Establish the PWA workspace and delivery path

## Outcome

A responsive Smart Smile shell runs through one command in local development, one command as a locally served production build, GitHub CI, and a Cloudflare Pages preview, while the existing Python app remains runnable as a reference.

## User stories

- PRD 72: documented local development and production-serving commands.
- PRD 73–74: gated preview and production delivery.
- PRD 68–70: test foundations.

## Acceptance criteria

- [ ] Create the approved apps/web, apps/desktop-reference, packages/contracts, and docs topology.
- [ ] Move the existing Python application and its assets without changing behavior; preserve its tests and documented run command.
- [ ] Scaffold React, TypeScript, Vite, Tailwind, Radix primitives, Vitest, and Playwright with pinned dependencies and one lockfile strategy.
- [ ] Render an accessible Smart Smile shell at phone, tablet, and desktop widths.
- [ ] Provide local development, production build, and local production-preview commands.
- [ ] CI runs formatting, lint, type checks, unit tests, component smoke tests, and production build.
- [ ] Cloudflare Pages build settings publish the Vite output and create a pull-request preview.
- [ ] Preview response headers include the initial restrictive security and Permissions Policy baseline.
- [ ] README defines Web, Local, Mobile, and the current non-native MVP boundary.
- [ ] No feature from paused desktop tickets 03–14 is accidentally implemented or deleted.

## Verification

- Fresh-clone install and commands.
- Responsive shell screenshots at 390 by 844, 844 by 390, 768 by 1024, and 1440 by 900.
- Python test suite plus new web quality gates.
- Preview URL and response-header evidence.

## Blocked by

Planning pack approval.

## Not included

Camera permission, MediaPipe, offline model caching, or photo capture.

## Task 1 — Preserve the Python reference inside the workspace

- Move the existing Python package, tests, configuration, model, notices, locks, and research documentation under apps/desktop-reference.
- Keep root-level developer commands that make the Python reference easy to install, test, lint, type-check, and run.
- Prove the 38-test baseline and existing quality gates still pass from the new topology.

## Task 2 — Build the tested responsive web shell

- Establish the npm workspace and apps/web package with React, TypeScript, Vite, Tailwind, and Radix.
- Use strict TDD for observable shell behavior: privacy-first wording, semantic structure, responsive content, and no camera request.
- Implement only the approved ticket-01 shell; do not add camera or inference behavior.

## Task 3 — Add reproducible quality and delivery gates

- Add pinned web dependencies, formatting, lint, type-check, unit/component test, Playwright smoke, and production build commands.
- Extend GitHub CI without weakening the preserved Python checks.
- Add Cloudflare Pages static configuration and the initial restrictive headers policy.
- Document Web, Local, Mobile, development, production-preview, Python-reference, and deployment commands.

## Task 4 — Verify and close ticket 01

- Run the complete Python and web validation commands from a clean dependency state.
- Verify responsive artifacts, security headers, and that no ticket-02 camera functionality was added.
- Update this ticket with completion evidence and mark it completed only when every acceptance criterion has evidence.
