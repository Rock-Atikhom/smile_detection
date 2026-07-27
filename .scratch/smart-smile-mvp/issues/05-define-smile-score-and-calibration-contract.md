Type: prototype
Status: resolved
Blocked by: 02, 04

# Define the smile score and calibration contract

## Question

How should left/right smile evidence become one Smile Score, what high/low hysteresis defaults and ranges should ship, and what operator calibration experience and representative scenarios are sufficient to justify those defaults without participant calibration?

## Answer

Enable Face Landmarker blendshapes and use `MOUTH_SMILE_LEFT` and `MOUTH_SMILE_RIGHT` as the primary smile evidence. For left and right coefficients in the model's normalized score range, calculate:

```text
mean = (left + right) / 2
raw_score = clamp(0.6 * min(left, right) + 0.4 * mean, 0, 1)
```

The minimum term requires both corners to contribute; the mean term tolerates a naturally asymmetric smile. Eye squint, jaw opening, dimple, and other blendshapes remain diagnostic signals rather than primary Smile Score inputs. Missing or invalid blendshape evidence is not smiling evidence.

Smooth the raw score with an exponential moving average using `alpha = 0.35`. Enter smile validity when the smoothed score is at least `0.60`; remain valid until it falls below `0.45`. The 300 ms Grace Window is a separate temporal rule and must not be hidden inside score smoothing. The validated configuration ranges are `alpha` from `0.15` to `0.60`, high threshold from `0.45` to `0.80`, and low threshold from `0.35` to `0.70`, with `low < high` and a minimum hysteresis gap of `0.05`.

The MVP ships one runtime default profile. It has no Participant calibration wizard and no live self-calibration. Operators may change validated thresholds through configuration, and debug mode exposes raw score, smoothed score, active thresholds, and smile-validity state. Runtime behavior never silently adapts thresholds from a Participant or camera session.

A maintainer-only offline calibration command evaluates numeric score traces and reports score distributions, activation/rejection counts, and hysteresis transitions. It does not store images, landmarks, face geometry, or identity data. The representative fixture set includes neutral expression, speech, gradual/broad/weak/asymmetric smiles, blinking, brief occlusion, head turns, ordinary movement, no face, multiple faces, Participant replacement, distance and composition boundaries, and normal, dim, backlit, and noisy camera conditions.

The default profile is accepted for release only when the fixtures produce zero Verification starts during neutral, speech, blink, brief-occlusion, head-movement, no-face, multiple-face, and Participant-replacement scenarios; intended sustained smiles keep the smoothed score above the high threshold for at least 95% of accepted samples after smoothing warm-up; sub-300 ms score spikes never start or complete Verification; hysteresis does not oscillate repeatedly in noisy boundary traces; and results hold across supported Windows-baseline and Apple-Silicon macOS camera fixtures under normal, dim, and backlit conditions. Weak or ambiguous smiles may require a clearer expression and are not, by themselves, a calibration failure.

Prototype evidence: [throwaway Smile Score calibration prototype](../prototypes/smile_score_calibration_prototype.py). The prototype demonstrates the formula, smoothing, and hysteresis against synthetic balanced, asymmetric, noisy-boundary, and neutral sequences. It is retained as a local scratch artifact because this project has no Git repository or throwaway branch.

## Comments

- Approved by the user: the bilateral `0.6 * min + 0.4 * mean` Smile Score formula.
- Approved by the user: EMA `alpha = 0.35`, high threshold `0.60`, low threshold `0.45`, validated ranges, and minimum hysteresis gap.
- Approved by the user: one runtime default profile, no Participant calibration, configuration/debug visibility, and maintainer-only offline calibration.
- Approved by the user: the representative fixture set and release acceptance criteria above.
- Approved by the user: use [GENKI-4K](https://mplab.ucsd.edu/398/) for static smile/non-smile validation and the [UvA-NEMO Smile Database](https://www.uva-nemo.org/) for temporal spontaneous/posed smile validation, supplemented by a small consented local webcam fixture set.
- Dataset policy: keep external datasets outside the product repository and do not redistribute them with the application. Use person-disjoint evaluation splits and retain only derived numeric calibration traces where permitted. [KAIST Face MPMI](https://www.ivylab.kaist.ac.kr/database/mpmi) and [GEFAV](https://www.unige.ch/cisa/gefav/) remain optional research sources subject to their access and usage terms.
