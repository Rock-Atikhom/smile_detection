# Ticket 05 sustained-smile device-acceptance matrix

Ticket 05 adds sustained-smile verification (5,000 ms) and qualitative progress.
Acceptance is recorded honestly: automated Chromium evidence is present; each
physical-device row remains pending until a real Mac Safari, Mac Chrome, and
Android Chrome run is performed. iPhone Safari is declared unavailable unless a
physical device is provided. No screenshots, participant identifiers, landmarks,
geometry, or raw score series are recorded here.

For each device, verify with a real camera: three consecutive matches reach
`Smile when you are ready`; holding a smile for 5 seconds reaches `Smile
verified`; a no-face/small interruption pauses without advancing and same-face
recovery resumes; another person entering the frame cannot inherit progress;
Stop/Switch clear progress; the Help diagnostics show only the current instant;
and application storage stays empty with same-origin requests only.

| Browser / OS class     | Automated / manual base       | Sustained-smile verification (5 s)              | Pause/reset + privacy            | Pass / fail |
| ---------------------- | ----------------------------- | ----------------------------------------------- | -------------------------------- | ----------- |
| Automated Chromium     | Deterministic Playwright seam | 5,000 ms accepted time reaches `Smile verified` | Pause/reset/stale proven         | Pass        |
| Current macOS Safari   | Pending — no physical T05 run | Pending — no physical-device test performed     | Pending — not performed          | Pending     |
| Current macOS Chrome   | Pending — no physical T05 run | Pending — no physical-device test performed     | Pending — not performed          | Pending     |
| Current Android Chrome | Pending — no physical T05 run | Pending — no physical-device test performed     | Pending — not performed          | Pending     |
| Current iPhone Safari  | Unavailable — no device       | Unavailable — no physical device                | Unavailable — no physical device | Pending     |
