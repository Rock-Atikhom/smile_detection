Status: planned
Execution: human-in-the-loop release acceptance

# 12 — Validate real devices and decide desktop archival

## Outcome

The manager and user receive auditable proof that Smart Smile launches on Web, Local, and Mobile, after which the desktop-reference future is decided explicitly.

## User stories

- PRD success definition 1–10.
- PRD 71–74: real-device evidence and managed delivery.
- PRD 39–42: assistive-technology acceptance.

## Acceptance criteria

- [ ] Approve and record exact release-time browser versions and physical devices before testing.
- [ ] Required minimum matrix includes iPhone Safari, Android Chrome, macOS Safari and Chrome, and Windows Chrome and Edge.
- [ ] Each device completes privacy, permission, portrait/landscape where relevant, switch, framing, smile, light, manual path, countdown cancellation, capture, review, Download, conditional Share, Retake, offline reopen, interruption recovery, and update behavior.
- [ ] Each required device completes three 60-second preview runs and ten capture sessions.
- [ ] Required release-class devices meet agreed latency, accepted-FPS, result-age, memory, and capture-duration gates.
- [ ] Below-floor devices demonstrate honest manual degradation without threshold weakening.
- [ ] VoiceOver is manually checked on iPhone and macOS, TalkBack on Android, and keyboard-only use on Windows.
- [ ] Privacy acceptance confirms no participant data transmission or browser persistence.
- [ ] Production Cloudflare Pages URL, localhost, and locally served production build all pass the same smoke journey.
- [ ] Manager signs off that this satisfies Web, Local, and Mobile without native packages.
- [ ] Compare PWA behavior with completed desktop reference and document parity, intentional differences, and remaining risk.
- [ ] Record an explicit decision: archive desktop-reference, retain it temporarily with an owner/date, or reopen a separate native requirement.
- [ ] If archived, preserve history and documentation; do not delete it as part of this ticket without separately approved cleanup.

## Verification

- Signed Markdown and machine-readable acceptance reports with screenshots or screen recordings that contain only consented test participants.
- Links to production deployment, Git commit, asset manifest, model hash, and CI verdict.
- Manager/user acceptance note and desktop-reference decision record.

## Blocked by

11 — Gate releases with automated privacy and browser evidence.

## Not included

App Store, Play Store, APK, executable, installer, or native application delivery.
