Status: planned
Execution: agent-led, with human UX review

# 02 — Start a privacy-first responsive camera session

## Outcome

A participant understands the privacy boundary, grants camera permission through a user action, sees a contained mirrored preview on phone and desktop, switches cameras, and receives actionable recovery.

## User stories

- PRD 1–9: privacy and permission.
- PRD 10–20: camera and responsive use.
- PRD 39–42: baseline accessibility.

## Acceptance criteria

- [ ] Show the approved privacy introduction before any camera request.
- [ ] Request video only; never request microphone access.
- [ ] Map secure-context, denied, missing, busy, unreadable, overconstrained, and ignored-prompt outcomes to approved guidance.
- [ ] Prefer the front camera on mobile and browser/OS-preferred camera on desktop.
- [ ] Show the decoded stream in a mirrored, object-fit contain stage while preserving unmirrored source semantics.
- [ ] Expose a labeled camera switch when multiple inputs or facing modes are available.
- [ ] Switching, rotation reconstruction, tab resume, and stream restart increment generation, clear progress, and run warm-up.
- [ ] Preserve every control in portrait, landscape, safe areas, zoom, touch, and keyboard use.
- [ ] Stop tracks on teardown and when the experience intentionally closes.
- [ ] Emit only allowlisted, in-memory camera lifecycle diagnostics.

## Verification

- Fake-media contract tests for error mapping and generations.
- Component/a11y tests for privacy, permission, warm-up, and recovery states.
- Playwright synthetic-camera preview in Chromium.
- Manual preview review on this MacBook and one phone before completion.
- Network assertion that camera sessions emit no application data.

## Blocked by

01 — Establish the PWA workspace and delivery path.

## Not included

Face inference, photo capture, or offline model operation.
