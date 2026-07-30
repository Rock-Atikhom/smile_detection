# Smart Smile Capture

This context describes the language of a walk-up system that verifies a sustained smile and captures one high-quality photo of a single participant.

## Language

**Participant**:
The single person currently eligible to progress through the capture flow.
_Avoid_: User, subject, identity

**Capture Zone**:
The visible region in which the Participant's face must be positioned and sufficiently large to become eligible.
_Avoid_: Face box, target box

**Face Continuity**:
Confidence that the currently observed face is the same anonymous Participant whose progress is being tracked.
_Avoid_: Face recognition, identity matching

**Smile Score**:
A live measure of how strongly the Participant's expression indicates a smile.
_Avoid_: Smile confidence, happiness score

**Verification**:
The period during which an eligible Participant must sustain a valid Smile Score before a Countdown may begin.
_Avoid_: Detection timer, smile timer

**Grace Window**:
A short interval during which temporary invalidity pauses progress without immediately discarding it.
_Avoid_: Delay, debounce

**Countdown**:
The final visible interval after Verification and before the system begins collecting photo candidates.
_Avoid_: Capture timer

**Capture Burst**:
A short sequence of full-resolution frames collected after the Countdown so the best valid photo can be selected.
_Avoid_: Video, recording

**Capture Candidate**:
A frame from the Capture Burst that still satisfies smile, continuity, and image-quality requirements.
_Avoid_: Snapshot, raw photo

**Final Photo**:
The single processed Capture Candidate successfully committed to storage.
_Avoid_: Raw frame, original photo

**Quality Gate**:
A condition that prevents progress or saving when lighting, sharpness, composition, or face validity is inadequate.
_Avoid_: Filter, validation check

**Cooldown**:
The post-save confirmation period during which the Final Photo remains visible and no new Verification can begin.
_Avoid_: Sleep, delay

**Validation Fixture**:
A deterministic, timestamped representation of a camera or vision scenario used to verify the Capture Session's externally observable behavior.
_Avoid_: Test sample, random case

**Acceptance Report**:
The reproducible record of a validation run's environment, scenarios, measured contract values, and release verdict.
_Avoid_: Log dump, benchmark note
