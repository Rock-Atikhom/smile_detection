Type: grilling
Status: resolved
Blocked by: 05, 06, 07

# Specify the state machine and timing semantics

## Question

What are the canonical states, events, guards, monotonic-time rules, Grace Window behavior, reset precedence, recovery transitions, and user-visible outcomes for every path from startup through Verification, Countdown, Capture Burst, save, retry, Cooldown, reset, disconnect, and exit?

## Answer

The canonical states are `STARTING`, `CAMERA_WARMUP`, `READY`, `VERIFYING`, `COUNTDOWN`, `CAPTURE_BURST`, `PROCESSING`, `COOLDOWN`, `RECONNECTING`, `FATAL_ERROR`, and `EXITING`. Positioning, no-face, multiple-face, smile, lighting, continuity, retry, and processing conditions are reason codes and gate statuses within these states, not additional states.

The coordinator processes events in this priority order on each loop: `ExitRequested`; `ResetRequested`; fatal worker or storage failure; camera-generation failure or reconnect event; state-time deadlines; then vision results and ordinary frame events. Every event carries or is associated with an active generation. Events from older generations are discarded before guards run.

Exit always wins, increments the active generation, cancels new work, ignores late outcomes, and reaches `EXITING`. Reset increments the session generation, clears the Participant track and timers, cancels any active Countdown or Capture Burst, and returns to `READY`. A camera failure invalidates active Verification or Countdown and enters `RECONNECTING`; already-collected burst data may finish processing because it no longer depends on the camera. A storage commit already in progress is never deleted or half-cancelled; late results are ignored after reset or exit.

All deadlines use monotonic time and frame capture timestamps. `CAMERA_WARMUP` lasts two seconds after camera open and property verification. Verification accumulates only elapsed time covered by fresh eligible evidence and reaches five seconds before entering `COUNTDOWN`. A temporary invalid result or vision gap freezes Verification for up to the 300 ms Grace Window; valid matching evidence resumes it, otherwise it resets to `READY`. During `COUNTDOWN`, the same Grace Window pauses the remaining Countdown; expiry cancels it and returns to `READY`. `CAPTURE_BURST` uses its fixed 250–300 ms acquisition window and never fills missing evidence with stale frames. `COOLDOWN` begins at successful atomic commit and lasts three seconds; reset and exit override it.

The normal transition outcomes are:

- `STARTING` failure for configuration, model, dependency, or output-directory validation → `FATAL_ERROR`.
- `CAMERA_WARMUP` failure → `RECONNECTING`; exhausted retries → `FATAL_ERROR`.
- `PROCESSING` with no valid Capture Candidate → `READY` with retry guidance.
- `PROCESSING` with a valid candidate and successful atomic commit → `COOLDOWN`.
- `PROCESSING` with storage failure or unknown commit outcome → `FATAL_ERROR`; the system never claims success or silently retries a possible duplicate.
- Successful reconnect → `CAMERA_WARMUP` → `READY`; previous Verification and Face Continuity are discarded.
- Inference or model-worker failure → `FATAL_ERROR`.
- Reset is available in active states but cannot disguise a fatal configuration, model, or storage condition.
- Exit is available from every state.

Each transition emits previous state, next state, monotonic timestamp, active generation, semantic reason code, progress, and gate statuses. Initial reason codes include `position_face`, `multiple_faces`, `smile_needed`, `lighting_dark`, `hold_steady`, `countdown_cancelled`, `retry_no_candidate`, `camera_reconnecting`, and `fatal_error`. The reducer is deterministic: an identical ordered event sequence yields identical state, timers, reason codes, and save outcome. Normal mode maps reason codes to friendly copy; debug mode exposes the codes and transition trace.

## Comments

- Approved by the user: the canonical state set and reason-code approach.
- Approved by the user: event priority, generation cancellation, reset/exit precedence, and storage cancellation policy.
- Approved by the user: monotonic timing, five-second Verification, three-second Countdown, 300 ms Grace Window, 250–300 ms Capture Burst, and three-second Cooldown semantics.
- Approved by the user: retry, reconnect, fatal-error, and successful-save transitions.
- Approved by the user: deterministic reducer behavior and transition telemetry.
