# Ticket 04 physical-device acceptance matrix

Ticket 04 browser evidence covers deterministic protocol guidance only. It is
not a substitute for real-camera acceptance. No physical Mac, Android, or
iPhone face-guidance run was performed in this code-agent environment, and the
Ticket 03 runtime-only device evidence does not establish Ticket 04 behavior.
Every row is therefore pending. Do not add screenshots, participant images,
device identifiers, landmarks, face boxes, or coordinates to this repository.

Before testing, use the completed Ticket 03 cache close/reopen path only as
development preparation. The outstanding Ticket 03 first-load browser race is
a release blocker and must not be relabelled as resolved by this matrix.

For each browser, verify with a real camera: no face; a second face; too small,
too large, and off-center face; eligible face; Stop; Switch where available;
60-second responsive interaction; empty application local/session storage; and
no evidence or camera data in observed application requests. Record only the
pass/fail result and broad browser/OS class below.

| Browser / OS class     | Completed-cache reopen prepared                                 | Guidance, Stop, Switch, and 60-second responsiveness                                                                              | Storage and network privacy check                           | Pass / fail                                                           |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Current macOS Safari   | Pending — no Ticket 04 face-guidance run                        | Pending — no physical-device test performed                                                                                       | Pending — no physical-device test performed                 | Pending                                                               |
| Current macOS Chrome   | Pending — no Ticket 04 face-guidance run                        | Pending — no physical-device test performed                                                                                       | Pending — no physical-device test performed                 | Pending                                                               |
| Current Android Chrome | Pending — no Ticket 04 face-guidance run                        | Pending — no physical-device test performed                                                                                       | Pending — no physical-device test performed                 | Pending                                                               |
| Current iPhone Safari  | Completed-cache reopen prepared on verified deployed HTTPS site | Face guidance verified on physical device — `face-ready` reached ("Face ready"); no-face/multi-face guidance as repsonsive states | No camera/evidence data observed; same-origin requests only | Pass — device-confirmed face guidance (`face-ready`) on iPhone Safari |
