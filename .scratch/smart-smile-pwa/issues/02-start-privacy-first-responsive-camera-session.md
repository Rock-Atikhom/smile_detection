Status: phone-review correction implemented — phone preview retest pending
Execution: agent-led, with human UX review

# 02 — Start a privacy-first responsive camera session

## Outcome

A participant understands the privacy boundary, grants camera permission through a user action, sees a contained mirrored preview on phone and desktop, switches cameras, and receives actionable recovery.

## User stories

- PRD 1–9: privacy and permission.
- PRD 10–20: camera and responsive use.
- PRD 39–42: baseline accessibility.

## Acceptance criteria

- [x] Show the approved privacy introduction before any camera request.
- [x] Request video only; never request microphone access.
- [x] Map secure-context, denied, missing, busy, unreadable, overconstrained, and ignored-prompt outcomes to approved guidance.
- [x] Prefer the front camera on mobile and browser/OS-preferred camera on desktop.
- [x] Show the decoded stream in a mirrored, object-fit contain stage while preserving unmirrored source semantics.
- [x] Expose a labeled camera switch when multiple inputs or facing modes are available.
- [x] Switching, rotation reconstruction, tab resume, and stream restart increment generation, clear progress, and run warm-up.
- [x] Preserve every control in portrait, landscape, safe areas, zoom, touch, and keyboard use.
- [x] Stop tracks on teardown and when the experience intentionally closes.
- [x] Emit only allowlisted, in-memory camera lifecycle diagnostics.

## Verification

- [x] Fake-media contract tests for error mapping and generations.
- [x] Component/a11y tests for privacy, permission, warm-up, and recovery states.
- [x] Playwright synthetic-camera preview in Chromium.
- [x] Manual preview review on this MacBook (passed 2026-07-31).
- [ ] Manual preview review on one phone before completion.
- [x] Network assertion that camera sessions emit no application data.

## Blocked by

01 — Establish the PWA workspace and delivery path.

## Not included

Face inference, photo capture, or offline model operation.

## Task 1: Deliver the complete privacy-first camera session

Implement this ticket as one cohesive browser-camera slice while preserving every
Ticket 01 privacy and delivery guarantee.

### Camera domain and lifecycle

- Add a camera-owned module boundary under `apps/web/src/camera/`; React components
  must not directly interpret browser exception names or construct ad-hoc constraints.
- Define stable camera states and recovery reasons covering privacy introduction,
  permission pending, camera starting, warm-up, ready, stopped, insecure context,
  denied permission, missing camera, busy/unreadable camera, overconstrained request,
  aborted request, inactive document, ignored prompt, interruption, and unsupported
  camera APIs.
- Treat a permission request that remains unsettled for a bounded, documented period
  as an ignored prompt. Late streams from a superseded or timed-out request must have
  every track stopped and must never replace the active generation.
- Request `{ audio: false }` and video only. Use non-exact ideals around 1280x720 at
  30 FPS. Prefer `facingMode: user` only when the client is classified as mobile;
  otherwise preserve browser/OS default selection. Never use a raw device label in
  UI, diagnostics, storage, or logs.
- Attach a successful stream to a `playsInline`, muted, autoplay video. Wait for a
  decoded frame, call `play()`, render it mirrored with `object-fit: contain`, and keep
  source/capture semantics unmirrored.
- Enumerate video inputs only after permission. Show `Switch camera` only when more
  than one usable input exists or delivered track capabilities expose multiple facing
  modes. Acquire and validate the candidate before stopping a working stream; retain
  the prior stream and show actionable recovery if switching fails.
- Own a monotonic camera generation. Successful start, successful switch, stream
  restart, tab resume, and orientation reconstruction each increment it exactly once,
  clear prior progress, and enter warm-up before ready. Stale async completions cannot
  change state. Track interruption invalidates the generation and offers
  `Restart camera`.
- On tab hiding, suspend the active session and stop its tracks. If the page returns
  while the session was active, restart safely and warm up. Stop every owned track on
  component teardown and when the participant selects `Stop camera`.

### Participant experience and accessibility

- Keep the approved privacy introduction visible before the first camera request.
  `Continue to camera` is enabled and is the explicit user gesture that begins the
  request; no camera request may occur on load or by opening privacy details.
- Use the approved UX headings and supporting copy where specified. Every failure has
  one plain-language primary recovery action and optional help; do not expose raw
  browser error names in participant copy.
- During an active stream, keep the camera visually dominant, add a subtle aria-hidden
  capture-zone guide, and provide semantic text for camera/warm-up status. Preserve
  header, coach content, controls, and footer at 390x844, 844x390, 768x1024, and
  1440x900 with no horizontal overflow. Controls remain at least 48x48 CSS pixels,
  keyboard reachable, safe-area aware, usable at 200% zoom, and reduced-motion safe.
- Add a `Help & system status` disclosure that restores focus on close and exposes
  read-only, bounded, in-memory allowlisted diagnostics only: stable state/reason,
  permission status, facing mode, delivered dimensions, generation, and stable
  lifecycle events. It must exclude images, media objects, object URLs, device labels,
  landmarks, geometry, face data, timestamps tied to face evidence, and persistent IDs.
- Do not add inference, capture, service-worker, analytics, persistence, upload, or
  runtime/model network behavior in this ticket.

### Verification and documentation

- Add deterministic Vitest contract tests for constraints, error mapping, permission
  timeout, stale/late stream disposal, generation transitions, switching fallback,
  visibility/orientation reconstruction, interruption, and teardown.
- Add component tests for no request before the explicit action; video-only request;
  privacy, pending, starting, warm-up, ready, stop, and recovery UI; accessible
  disclosures; and sanitized diagnostics.
- Add Playwright coverage using Chromium's synthetic camera for the decoded mirrored
  contained preview, responsive control reachability, switch visibility contract,
  zero application requests after static load, zero browser storage, and track stop on
  intentional close where automation can observe it.
- Preserve the Ticket 01 tests and the complete Python desktop-reference gate.
- Update relevant architecture/privacy/validation documentation and this ticket's
  evidence/status. Do not mark the real-device criterion complete until a human has
  reviewed the preview on this MacBook and one phone.
- Run formatting, lint, TypeScript, unit/component tests, production build, Playwright,
  Python tests, Python formatting/lint/type checks, `git diff --check`, and confirm a
  clean worktree. Commit the implementation and write the required task report.

## Phone review correction

The first phone review found that camera switching was unavailable and the primary
controls fell below the initial 390×844 viewport. The correction treats a mobile
facing-mode choice as switchable even when enumeration exposes only the active camera,
keeps intentional replacement ownership when Safari ends the prior track, and presents
the preview with Stop, Switch, and Help controls together in the first mobile viewport.
The phone criterion remains open until the corrected HTTPS preview is reviewed again.
