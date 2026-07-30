Status: planned
Execution: agent-led

# 10 — Make sessions resilient, observable, and update-safe

## Outcome

Camera, worker, visibility, orientation, offline, and application-update failures recover deterministically, while a read-only diagnostic surface provides privacy-safe evidence.

## User stories

- PRD 50–58: offline, updates, support, and diagnostics.
- PRD 61–63: generations and responsiveness.
- PRD 5–6: permission recovery and camera lifetime.

## Acceptance criteria

- [ ] Complete bounded camera and worker restart policies with generation invalidation and warm-up.
- [ ] Hidden/resumed tabs, track ended/mute, orientation reconstruction, and device switch cannot reuse prior evidence.
- [ ] Define recoverable versus fatal integrity, runtime, camera, capture, and update errors with stable codes and remediation.
- [ ] Defer service-worker activation during Verification, Countdown, Capture, Processing, or Review.
- [ ] Keep the last complete cache active on update failure and clean old versions only after successful activation.
- [ ] Add Help & system status with Status, Performance, Events, and Report views.
- [ ] Keep diagnostics read-only and in memory; production UI cannot edit thresholds.
- [ ] Report preview uses an explicit allowlist and requires manual Copy or Download.
- [ ] Exclude images, Blobs, URLs, landmarks, face geometry, persistent score series, raw device labels, fingerprints, location, and identifiers.
- [ ] Closing diagnostics restores focus and never changes session state.
- [ ] All recovery paths remain responsive and leave no camera track, worker, bitmap, object URL, or pending timer leak.

## Verification

- Fault injection at every state: camera stop, worker crash, corrupt cache, offline update, reset, switch, background, rotation, and late message.
- Diagnostics schema snapshot and prohibited-field tests.
- Resource lifecycle/heap checks across repeated sessions.
- Service-worker upgrade journey during Ready, Countdown, and Review.
- Responsive diagnostics accessibility tests.

## Blocked by

09 — Complete the accessible manual capture path.

## Not included

Automatic upload, remote support, editable calibration, or persistent logs.
