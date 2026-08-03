Status: approved in conversation; written-spec review pending

# Worker Face Evidence Design

## Context

Ticket 04 adds the first visible on-device intelligence to Smart Smile. The
camera session already owns permission, switching, preview, and stop/restart.
Ticket 03 owns the self-hosted MediaPipe Face Landmarker and verified offline
runtime. Ticket 04 submits bounded camera frames to that existing worker and
returns only safe categorical face evidence to the participant interface.

The project does not train a face or smile model and does not use a downloaded
face-photo dataset. It uses the vendored official MediaPipe Face Landmarker
`float16/1` bundle. This ticket detects and frames faces; it does not calculate
Smile Score, continuity, lighting, countdown, or capture.

## Goals

- Run video-frame Face Landmarker inference only in the dedicated worker.
- Keep the UI responsive through freshness-first bounded backpressure.
- Detect zero, one, or multiple faces and guide one participant into the
  approved Capture Zone and face-size bounds.
- Reject stale, duplicate, out-of-order, and old-camera-generation results.
- Expose categorical guidance and bounded aggregate diagnostics without
  exposing or retaining landmarks, coordinates, frames, or identity data.
- Preserve camera switching, stop/restart, offline use, accessibility,
  responsive layouts, and the verified runtime boundary.

## Non-goals

- Smile Score, smile hysteresis, sustained verification, or continuity.
- Lighting, sharpness, stability, performance-tier calibration, countdown,
  capture, review, download, or sharing.
- Face recognition, embeddings, named profiles, persistent identifiers, or
  multi-participant tracking.
- Rendering face boxes or landmark points in participant mode.
- Persisting frames, ImageBitmaps, landmarks, geometry, or inference results.
- Sending camera or inference data over the network.

## Approved Product Contract

The visible Capture Zone is normalized to `x = 0.20..0.80` and
`y = 0.12..0.82`. Initial eligibility requires the single face bounding-box
center inside `x = 0.23..0.77` and `y = 0.16..0.78`. The bounding box must stay
inside the delivered frame, have width at least `0.18`, height at least `0.30`,
and height no greater than `0.80`.

Face Landmarker returns at most two faces. Results are categorized as zero,
one, or multiple (`2+`). Only one face may become eligible. Guidance has one
highest-priority value:

1. `no-face`
2. `multiple-faces`
3. `too-close`
4. `too-far`
5. `off-center`
6. `face-ready`

The participant sees friendly text derived from that enum: **Show your face**,
**Only one person**, **Move back**, **Move closer**, **Center your face**, or
**Face ready**. No raw model output appears in participant-facing state.

## Architecture and Ownership

### Main-thread frame pump

The camera integration owns frame capture but not inference state. It creates
an aspect-preserving inference `ImageBitmap` only while the camera and verified
runtime are ready. Every envelope contains camera generation, monotonically
increasing sequence, monotonic capture time, delivered width and height,
orientation, and performance tier.

At most one frame is processing and one latest frame is pending. A new pending
frame replaces and closes the previous pending bitmap. Stop, camera switch,
generation change, or disposal closes the pending bitmap and sends cancellation
before any new generation can submit frames.

### Vision worker

The existing worker continues owning the single Face Landmarker instance. It
runs `detectForVideo()` in VIDEO mode with blendshape output enabled and
`numFaces = 2`. Ticket 04 consumes landmarks only long enough to derive face
count and normalized bounding boxes. Blendshapes remain internal for Ticket 05.

The worker closes each processed bitmap in `finally`, promotes at most the
latest pending frame, and never queues an unbounded list. A malformed frame,
inference exception, cancellation, or generation change produces a bounded
safe event and releases all owned bitmaps.

### Face-evidence contract

Worker results contain only:

- generation, sequence, capture time, and processing completion time;
- delivered frame dimensions and orientation;
- capped face count (`0 | 1 | 2`);
- categorical guidance and eligibility;
- safe aggregate latency/freshness counters needed for local diagnostics.

Landmark arrays, bounding-box coordinates, blendshape values, transformation
matrices, images, and object URLs never cross into React state. Geometry is
ephemeral inside the worker and is discarded after classification.

### React integration

One face-evidence coordinator validates every event before publishing a
semantic snapshot. It rejects mismatched generations, duplicate or decreasing
sequences, and results older than 150 ms at receipt. React renders only the
current guidance and safe aggregate status. The video and any decorative
Capture Zone overlay remain `aria-hidden`; an atomic polite status exposes the
equivalent guidance text.

## Data Flow

1. Camera and verified runtime both reach ready.
2. The frame pump captures an aspect-preserving bitmap and transfers ownership
   to the worker with its exact envelope.
3. If inference is busy, the latest pending bitmap replaces and closes the old
   pending bitmap.
4. The worker runs Face Landmarker, derives normalized bounds, classifies the
   highest-priority guidance, discards geometry, and closes the bitmap.
5. The coordinator validates generation, order, uniqueness, and age before
   publishing categorical evidence.
6. UI updates guidance without blocking camera controls or animation.

## Failure and Lifecycle Rules

- Runtime not ready: submit no frames and show the existing runtime recovery.
- Camera stop/switch: increment generation, cancel inference, close pending
  frames, clear evidence, and wait for the new generation.
- Stale/out-of-order/duplicate result: ignore it and increment only a bounded
  in-memory aggregate counter.
- Worker fault: stop frame submission, close owned bitmaps, publish safe
  recoverable face-detection guidance, and preserve Stop/Help controls.
- Zero or multiple faces: publish guidance immediately; never treat the prior
  face as current evidence in this ticket.
- No result, frame, landmark, geometry, coordinate, or identifier is persisted
  or sent to analytics, diagnostics storage, service-worker cache, or network.

## Accessibility and UI

The existing native camera overlay gains a subtle Capture Zone and one short
status chip. Guidance uses text, not color alone. The semantic status remains
available at browser zoom and responsive phone/desktop layouts without exposing
the hidden video or decorative overlay to assistive technology. Meaningful
guidance changes use the existing polite atomic live region; repeated identical
inference results do not announce again.

## Testing Strategy

- Pure tests for normalized bounds, exact Capture Zone/size boundaries,
  priority ordering, malformed landmarks, and face-count capping.
- Protocol tests for full envelopes and rejection of malformed messages.
- Mailbox tests proving one running plus one latest pending frame, replacement
  closure, processed closure, cancellation closure, and bounded memory.
- Coordinator tests for generation, sequence, duplicate, order, and 150 ms
  freshness rejection.
- Component/accessibility tests for all six guidance states, live-region
  deduplication, hidden video/overlay, touch targets, zoom, and responsive flow.
- Browser tests with synthetic camera input proving visible face guidance,
  worker responsiveness, no unexpected network traffic, and no forbidden
  persistence.
- Mac Safari/Chrome and Android Chrome smoke tests on the deployed preview.

## Dependency and Delivery Risk

Ticket 04 depends on Ticket 03 runtime readiness. The current dependent base
has a documented first-load race: background cache population can cause the
service worker to return 503 to a simultaneous runtime asset request. Ticket 04
development may proceed using a completed verified cache and page reopen, but
the preview cannot be called release-ready until that runtime/cache route is
corrected and its browser journey passes. This risk must remain visible in the
implementation plan and professor handoff.

## Acceptance Boundary

Ticket 04 is complete when a real camera frame is processed in the worker,
zero/one/multiple faces produce the correct safe guidance, exactly one eligible
face produces **Face ready**, frame ownership stays bounded, stale generations
cannot update UI, privacy/storage/network checks pass, and the deployed preview
passes the available Mac and Android smoke journeys.

Successful face guidance does not mean smile detection has been delivered.
Ticket 05 consumes internal left/right mouth-smile blendshapes and adds the
approved sustained Smile Score contract.
