Status: in review
Execution: agent-led, with calibration review

# 05 — Verify anonymous continuity and a sustained smile

## Outcome

One anonymous participant can build understandable smile progress while short noise is tolerated and another person can never inherit progress.

## User stories

- PRD 24–25: exactly one participant.
- PRD 28–32: smile progress, intentional verification, and cancellation.
- PRD 60–62: freshness and reset safety.

## Acceptance criteria

- [x] Port the approved anonymous continuity contract without recognition, embeddings, names, or persistent identity.
- [ ] Require three consecutive continuity matches before progress and preserve the approved brief hold/expiry behavior.
- [ ] Derive Smile Score from left/right mouth-smile blendshapes with the approved bilateral formula.
- [ ] Apply approved EMA alpha, high/low hysteresis, validation ranges, and Grace Window.
- [ ] Advance sustained Verification using accepted capture timestamps and monotonic time only.
- [ ] Brief invalidity pauses; longer invalidity resets with one stable participant-facing reason.
- [ ] Reset, switch, resume, orientation reconstruction, stream loss, worker failure, and generation change clear continuity and progress.
- [ ] Participant mode shows qualitative progress and “Keep smiling,” not a raw score.
- [ ] Diagnostics may show aggregate raw/smoothed values for the current instant but never persist a biometric time series.
- [ ] Browser results are compared with desktop reference fixtures before retaining or recalibrating defaults.

## Verification

- Deterministic sequences for neutral, speech, broad/weak/asymmetric smile, blink, occlusion, motion, multiple faces, replacement, pause, reset, and stale results.
- Property tests for score range, hysteresis, timing, and generation cancellation.
- Browser-versus-reference calibration report on consented or synthetic validation material.
- UX review of progress and reset language.

## Blocked by

04 — Guide one participant with worker-based face evidence.

## Not included

Lighting, sharpness, countdown, or capture.
