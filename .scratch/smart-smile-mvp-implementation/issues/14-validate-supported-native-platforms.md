# 14 — Validate the supported native platforms

**What to build:** Native release evidence that the completed application works first with this Apple-Silicon MacBook's built-in camera and then meets the agreed Windows baseline, without treating mocks as proof of platform compatibility.

**Blocked by:** 13 — Generate a reproducible Acceptance Report.

**Status:** paused — superseded by Smart Smile PWA planning pending approval

- [ ] On this Apple-Silicon MacBook, a clean environment installs from the approved lock, verifies the model, obtains camera permission, opens the built-in camera through AVFoundation, and completes live Capture Sessions.
- [ ] The macOS run exercises normal/dim/backlit scenes, no face, multiple faces, brief/prolonged interruption, Participant replacement, natural/weak smiles, Countdown cancellation, invalid burst retry, debug toggle, reset, and clean exit.
- [ ] Three 60-second MacBook preview benchmarks and ten live Capture Bursts generate a complete Acceptance Report with no privacy violations or partial/duplicate files.
- [ ] A clean Windows 10/11 x86-64 environment on the eighth-generation Core i5/8 GB/720p baseline performs the equivalent dependency, model, webcam, smoke, and benchmark procedure.
- [ ] Both platforms meet the hard functional and performance gates; platform-specific camera substitutions or unsupported controls are recorded as diagnostics rather than hidden.
- [ ] Intel macOS, Rosetta, unsupported source builds, alternate face engines, standalone installers, and code signing remain outside this ticket.
