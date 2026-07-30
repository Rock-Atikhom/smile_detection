Status: planned
Execution: agent-led, with performance/calibration review

# 06 — Enforce live quality and adaptive performance

## Outcome

Lighting, stability, and device performance become honest capture gates. The app adapts inference size or cadence while preserving smile semantics and disables automatic capture below the reliability floor.

## User stories

- PRD 26–27 and 31: live quality gates.
- PRD 63–67: responsiveness, tiers, and non-WebGPU fallback.
- PRD 37 and 65: understandable manual fallback.

## Acceptance criteria

- [ ] Compute approved face-region and frame luma measures without retaining imagery.
- [ ] Enforce hard darkness and expose low-light/low-contrast enhancement eligibility separately.
- [ ] Compute a live stability/blur proxy appropriate for guidance and keep final sharpness validation for candidate processing.
- [ ] Show only the most actionable light or stability instruction.
- [ ] Warm-up selects High, Balanced, Minimum, or Below-floor tier from measured capability.
- [ ] Tier changes affect inference dimensions, cadence, and optional visual effects only.
- [ ] No tier changes Smile Score formula, hysteresis, duration, face gates, lighting gates, or final quality.
- [ ] Disable automatic capture below 12 accepted FPS, above 150 ms result-age p95, or when essential checks are unreliable.
- [ ] Keep the manual shutter path available only when non-smile gates remain trustworthy.
- [ ] Emit in-memory tier, FPS, average/p95 latency, replacement, stale, and long-task summaries.
- [ ] Record whether the 50 ms average, 75 ms p95, and 20 accepted FPS release goal passes on each benchmark device.

## Verification

- Seeded luma, contrast, motion, and blur fixtures at landscape and portrait resolutions.
- Capability-tier tests with simulated timing windows and oscillation prevention.
- Main-thread long-task checks.
- Three 60-second preview benchmarks on this MacBook.
- Calibration review before defaults become release candidates.

## Blocked by

05 — Verify anonymous continuity and a sustained smile.

## Not included

Countdown, photo burst, or review.
