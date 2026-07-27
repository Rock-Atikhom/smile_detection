Type: prototype
Status: resolved
Blocked by: 03, 04

# Define image quality and enhancement contract

## Question

What luminance measurements, enhancement triggers, hard darkness gate, gamma/CLAHE limits, denoising strength, sharpness metric, Capture Burst ranking, and rejection thresholds best preserve natural-looking Final Photos while remaining within the CPU budget?

## Answer

Measure 8-bit luma on an inward-inset face ROI and retain the full-frame median for diagnostics. The face ROI is the detected face bounding box inset by 10% on each side and clipped to the delivered frame. Record `Y10`, `Y50` (median), and `Y90`.

Apply a hard darkness Quality Gate when `Y50 < 32` or `Y10 < 8`. Hard-darkness candidates are rejected and produce explicit guidance; enhancement must not attempt to rescue them. Trigger bounded enhancement when `Y50 < 60` or the full-frame median is below `45`. Keep these thresholds configurable and validate them against normal, dim, backlit, and noisy fixtures.

For candidates that pass the hard gate, brighten the Y channel with a gamma LUT when `Y50 < 60`, using `gamma = clamp(60 / max(Y50, 1), 1.0, 1.35)`. When face contrast is low (`Y90 - Y10 < 45`), apply CLAHE to the luminance channel only with `clipLimit = 1.5` and an `8x8` tile grid. Apply one mild bilateral denoise pass after enhancement with diameter `5`, color sigma `25`, and spatial sigma `25`. Never alter hue or saturation. If enhancement produces material clipping or pushes the face median above `180`, reduce the enhancement and retry once; if the result still clips, reject it. Sharpness is always measured before enhancement.

Measure sharpness on the full-resolution face ROI after a 10% inset, grayscale conversion, and resize to `256x256`. Use variance of the Laplacian as the score. Reject candidates below the configurable default threshold `80`; use higher scores as the primary ranking signal. Low-light noise cannot bypass the luma gate and does not qualify a soft image as sharp.

A Capture Candidate is valid only when its active-generation result still has exactly one face, matching Face Continuity, eligible Capture Zone and face size, active smile validity with smoothed Smile Score at or above the low threshold, no hard-darkness failure, and sharpness at least `80`. Rank valid candidates by highest pre-enhancement sharpness, then higher smoothed Smile Score, then face-median luminance closest to `110`. If no burst frame passes all gates, save nothing and return to retry guidance. Only the winner is enhanced and retained; rejected burst frames are discarded.

Prototype evidence: [throwaway image-quality prototype](../prototypes/image_quality_prototype.py). It exercises hard darkness, soft-frame rejection, bounded enhancement plans, and sharpness-first burst ranking. It is retained as a local scratch artifact because this project has no Git repository or throwaway branch.

## Comments

- Approved by the user: inward-inset luma measurements, hard-darkness thresholds, enhancement trigger, and explicit no-rescue behavior.
- Approved by the user: gamma cap, Y-channel CLAHE limits, bilateral denoise parameters, naturalness/clipping guard, and pre-enhancement sharpness measurement.
- Approved by the user: normalized Laplacian sharpness gate and threshold `80`.
- Approved by the user: Capture Candidate validity gates, sharpness-first ranking, tie-breakers, and all-or-nothing save behavior.
