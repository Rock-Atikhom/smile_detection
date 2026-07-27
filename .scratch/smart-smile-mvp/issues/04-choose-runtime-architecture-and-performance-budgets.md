Type: grilling
Status: resolved
Blocked by: 02, 03, 12, 13

# Choose the runtime architecture and performance budgets

## Question

What capture, preprocessing, inference, rendering, burst-processing, and storage architecture should the MVP adopt, and how should the 50 ms average frame budget be allocated while preventing stale frames and keeping state transitions deterministic?

## Answer

Adopt a single-process architecture with four strictly owned execution lanes:

- The camera-owner lane exclusively opens, reads, releases, and reconnects the webcam.
- The inference lane consumes a single-slot latest-frame mailbox and uses blocking MediaPipe video-mode calls. A newer ordinary frame replaces a pending frame when inference is busy.
- The main coordinator/UI lane exclusively owns capture-flow state, monotonic timers, keyboard input, and rendering.
- The burst-processing/storage lane ranks, enhances, encodes, and atomically commits Capture Candidates without blocking the UI.

Lanes communicate through bounded mailboxes and immutable messages. No worker mutates another lane's state or frame. A frame envelope carries a capture generation, monotonic sequence number, capture timestamp, full-resolution frame, and derived inference frame. A result echoes the generation, sequence, and timestamp. The coordinator accepts a result only when it belongs to the active generation, is newer than the last accepted result, and is no more than 150 ms old when consumed. Late or stale results cannot advance Verification or a Countdown. State transitions use the frame's capture timestamp rather than worker completion time. A vision-gap event is emitted when fresh results stop arriving; the state-machine contract decides the exact pause/reset consequence.

The renderer may continue showing the newest camera frame while status reflects the newest accepted analysis result. Rendering owns its drawing copies. The coordinator is the only state owner, and workers return timestamped outcome events rather than triggering transitions directly. Only one Capture Burst or storage commit may be active. Shutdown stops new work, releases the camera owner, drains or cancels workers, and prevents late outcomes from re-entering a closed session.

The ordinary-frame latency contract is measured from successful camera-read return to presentation of the state derived from that frame. Hardware exposure time and time blocked waiting for the next frame are measured separately; queueing is included. The budget is:

- capture handoff: 3 ms average / 5 ms p95;
- downscale and color conversion: 5 ms average / 7 ms p95;
- Face Landmarker inference: 34 ms average / 50 ms p95;
- state evaluation: 2 ms average / 3 ms p95;
- overlay and rendering: 6 ms average / 10 ms p95.

The total target is 50 ms average and 75 ms p95 for ordinary detection frames. Capture Burst ranking, enhancement, encoding, and storage are excluded from this ordinary-frame measure and receive a separate zero-to-confirmation target.

At Countdown completion, the coordinator creates a burst request bound to the active generation. The camera-owner lane samples five distinct full-resolution frames across a 250–300 ms acquisition window. During that bounded window, the inference lane temporarily uses a five-item FIFO so each sampled frame can be evaluated. A reset, exit, camera failure, or generation change cancels the burst and makes all of its candidates ineligible for saving. The recommended p95 target from Countdown zero to confirmation is 1.5 seconds: at most 300 ms acquisition, 350 ms remaining inference, 350 ms quality/ranking/enhancement, 300 ms JPEG encoding and atomic commit, and 200 ms coordination margin.

Each session uses a fixed inference geometry: preserve aspect ratio, never upscale, and cap the long edge at 640 pixels. Full-resolution frames remain available for the Capture Burst. Under load, the runtime is freshness-first: replace pending ordinary frames, never drop frames from an active burst, discard results older than 150 ms, and record replacements, stale results, stage latency, accepted-result FPS, and queue age. If the baseline machine cannot meet the fixed-geometry performance contract, that is a benchmark failure requiring optimization or recalibration, not permission for silent quality degradation.

The single-process choice deliberately leaves camera recovery as best effort. A native camera `open()` or `read()` that blocks indefinitely cannot be safely cancelled from Python. The watchdog keeps the UI responsive, stops Verification, reports a camera-unresponsive state, and retries only when native calls return. The ten-second reconnect window is therefore a best-effort retry budget; after it expires, the operator is instructed to restart. A late return from the old camera lane cannot revive its capture generation. A strict wall-clock recovery guarantee remains future work requiring a supervised helper process.

## Comments

- Approved by the user: four-lane single-process topology with a single-slot ordinary-frame mailbox, generation counters, immutable message ownership, and main-thread state ownership.
- Approved by the user: 50 ms average / 75 ms p95 ordinary-frame budget and the component allocation above, with telemetry for the stage and queue metrics.
- Approved by the user: 150 ms stale-result cutoff, timestamped event model, five-frame temporary burst FIFO over 250–300 ms, and 1.5-second p95 zero-to-confirmation target.
- Approved by the user: fixed 640-pixel inference geometry, freshness-first overload behavior, and best-effort in-process camera recovery without a hard timeout guarantee.
