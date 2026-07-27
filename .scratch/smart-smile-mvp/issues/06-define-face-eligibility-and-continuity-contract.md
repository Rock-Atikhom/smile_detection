Type: prototype
Status: resolved
Blocked by: 04

# Define face eligibility and continuity contract

## Question

What measurable Capture Zone, minimum face size, boundary tolerance, face-count, and anonymous Face Continuity rules should determine whether Verification may progress across ordinary movement, brief occlusion, and participant replacement scenarios?

## Answer

All face geometry is normalized to the delivered frame. The visible Capture Zone is `x = 0.20..0.80` and `y = 0.12..0.82`. Initial eligibility requires the face bounding-box center inside the inner zone `x = 0.23..0.77`, `y = 0.16..0.78`, with a normalized boundary tolerance of `0.03` for an already eligible Participant. The face bounding box must have width at least `0.18`, height at least `0.30`, height no greater than `0.80`, and remain inside the delivered frame.

Configure Face Landmarker to return up to two faces. A result with two or more faces is multiple-face invalid and cannot advance Verification or a Countdown. Multiple-face and no-face results keep the current anonymous track only for the 300 ms Grace Window; they do not supply new eligibility evidence.

Face Continuity is an ephemeral in-memory track, not recognition. Start a track from the first single eligible face. A subsequent single face matches the track only when all of these hold: center movement is no more than `0.15` normalized frame units; face-height ratio is between `0.67` and `1.50`; and normalized anchor geometry differs by no more than `0.12` using eye centers, nose tip, and mouth center after scale normalization. A non-matching face cannot take over while the previous track is within its grace period.

After each successful match, adapt the transient reference toward the new observation with factor `0.25` for center, size, and anchor geometry. This follows gradual movement while still rejecting sudden replacement. Require three consecutive matching observations across roughly 150 ms before a new or cleared track becomes eligible for Verification. If a matching face returns within 300 ms after a no-face, multiple-face, or continuity-invalid result, resume the track; otherwise expire it and allow a new Participant to begin. Camera-generation change, reset, and exit clear the track immediately.

Prototype evidence: [throwaway Capture Zone and Face Continuity prototype](../prototypes/face_continuity_prototype.py). It exercises normalized geometry, adaptive movement, three-observation warm-up, brief invalidity recovery, replacement rejection, and track expiry. It is retained as a local scratch artifact because this project has no Git repository or throwaway branch.

## Comments

- Approved by the user: normalized Capture Zone geometry, face-size limits, and `0.03` boundary tolerance.
- Approved by the user: up-to-two-face detection, the anonymous continuity match thresholds, 300 ms invalidity grace, replacement protection, and immediate camera-generation clearing.
- Approved by the user: adaptive reference factor `0.25` and three matching observations across roughly 150 ms before Verification eligibility.
