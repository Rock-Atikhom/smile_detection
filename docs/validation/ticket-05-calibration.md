# Ticket 05 smile-score calibration evidence

## Default profile

- `alpha` (EMA): `0.35`
- `highThreshold`: `0.60`
- `lowThreshold`: `0.45`
- `graceMs` (Grace Window): `300`
- `verificationMs` (sustained verification target): `5_000`
- Bilateral raw formula: `clamp(0.6 * min(left, right) + 0.4 * ((left + right) / 2), 0, 1)`;
  missing, duplicate, non-finite, or out-of-range smile categories yield `0`.

## Reference fixture

- File: `apps/web/src/vision/fixtures/smile-reference.json`
- Source prototype: `.scratch/smart-smile-mvp/prototypes/smile_score_calibration_prototype.py`
- SHA-256: `54d4171a504290f6e460dd3ebb3c5f4eb1770448ccc0d82f7e899fc55708b86a`

## Traces and desktop-expected values

Each named trace in the fixture lists literal `left`, `right`, `rawScore`,
`smoothedScore`, and `smileValid` values ported from the approved desktop
prototype. The browser `smile-score.test.ts` replays the same literal samples
and asserts TypeScript-computed raw/smoothed/smile-valid results match the
fixture exactly (within `1e-12`).

- `balanced ramp`
- `asymmetric smile`
- `noisy boundary`
- `neutral`

The verification journey (`smile-verification.spec.ts`) proves the end-to-end
sustained-smile path (continuity `ready` -> smoothed `0.60` -> 5,000 ms)
against these calibrated aggregates on a real browser.

## Dataset statement

External validation datasets (GENKI-4K and UvA-NEMO) are **not redistributed**
in this repository and remain future release-validation inputs only. This
ticket uses the committed synthetic/calibrated fixtures above; no real
participant biometric data is stored or sent.
