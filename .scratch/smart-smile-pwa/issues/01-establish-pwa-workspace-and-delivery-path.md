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
