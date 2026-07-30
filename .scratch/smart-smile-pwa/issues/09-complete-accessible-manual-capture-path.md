Status: planned
Execution: agent-led, with human accessibility review

# 09 — Complete the accessible manual capture path

## Outcome

A participant who cannot or does not want to use automatic smile verification can take a quality-checked photo, and the whole flow satisfies the agreed responsive accessibility contract.

## User stories

- PRD 35–42: manual route and accessibility.
- PRD 17–18: touch and keyboard.
- PRD 43–48: accessible review.

## Acceptance criteria

- [ ] Keep Take photo manually discoverable after camera readiness.
- [ ] Manual capture bypasses only sustained smile verification; face count, framing, lighting, stability, freshness, and final quality remain required.
- [ ] A blocked shutter remains understandable through one adjacent reason and assistive description.
- [ ] Prefer manual capture disables automatic countdown for the current session.
- [ ] Every capture/review/recovery control is operable by keyboard, touch, switch, VoiceOver, and TalkBack semantics.
- [ ] DOM order matches the responsive visual order and the overlay is never the only instruction.
- [ ] One throttled polite live region announces meaningful guidance; errors/countdown use bounded announcements.
- [ ] Visible focus, target size, contrast, zoom/reflow, and reduced-motion contracts pass.
- [ ] Focus moves only for review and blocking recovery and returns correctly from disclosures/drawers.
- [ ] Automated capture remains the default unless the participant selects manual preference or capability falls below the floor.

## Verification

- Component accessibility tests and axe checks for every state.
- Keyboard-only journey at desktop widths.
- 200 and 400 percent zoom/reflow evidence.
- Reduced-motion snapshots.
- Manual VoiceOver on iPhone/macOS and TalkBack on Android.
- Human review that the route does not describe disability or expression difference as failure.

## Blocked by

08 — Select, review, download, share, and retake.

## Not included

Remote accessibility telemetry, voice control integration, or localization.
