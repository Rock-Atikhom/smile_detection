# Privacy

Smart Smile's MVP boundary is on-device processing with no account, camera upload, microphone use,
application photo persistence, or analytics collector. Ticket 02 requests a camera only from the
participant's `Continue to camera` gesture and requests video with `audio: false`.

Camera diagnostics are bounded, read-only, and in memory only. They contain stable state/reason,
permission status, facing mode, delivered dimensions, generation, and lifecycle events. They never
contain images, streams, object URLs, device labels, device IDs, landmarks, geometry, face data,
face-linked timestamps, or persistent identifiers. Later tickets must preserve these guarantees and
document any minimum CSP expansion before it is accepted.
