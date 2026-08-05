# Privacy

Smart Smile's MVP boundary is on-device processing with no account, camera upload, microphone use,
application photo persistence, or analytics collector. Ticket 02 requests a camera only from the
participant's `Continue to camera` gesture and requests video with `audio: false`.

Camera diagnostics are bounded, read-only, and in memory only. They contain stable state/reason,
permission status, facing mode, delivered dimensions, generation, and lifecycle events. They never
contain images, streams, object URLs, device labels, device IDs, landmarks, geometry, face data,
face-linked timestamps, or persistent identifiers. Later tickets must preserve these guarantees and
document any minimum CSP expansion before it is accepted.

## Ticket 03 static-runtime storage boundary

Ticket 03 uses the official pretrained Face Landmarker `float16/1` bundle with
`@mediapipe/tasks-vision@0.10.35`. It collects no dataset and performs no custom
model training. This ticket initializes the runtime only: it does not submit
camera frames or produce application face evidence or smile decisions.

Camera frames are never written to Cache Storage. Nor are camera output, photos,
Blobs, object URLs, landmarks, blendshapes, face boxes, geometry, score data,
diagnostics, device labels, device IDs, persistent identifiers, participant
names, network identifiers, localStorage values, sessionStorage values, or
IndexedDB records. No analytics, crash reporting, upload endpoint, remote model
CDN, or participant-data request is used.

The persisted static allowlist is exact: the Workbox shell cache may contain the
hashed application shell, PWA icons, static recovery help, and the generated
release-manifest metadata; the separate versioned vision cache may contain only
the immutable manifest paths for release `6c23e451b7a9b523` plus its matching
completion-marker record. That release is MediaPipe runtime/WASM files, the
Face Landmarker `float16/1` task bundle, the MediaPipe license and notice, and
the three upstream model cards. The completion marker is written only after
every manifest response has been integrity-checked and read back, so a partial
cache is not an offline-ready release.

The runtime starts only from a completed cache whose entire manifest inventory
verifies. A corrupt completed release is deleted as one cache before fatal
recovery, and immutable runtime URLs never fall back to network bytes. A storage
or quota failure prevents camera authorization and exposes only bounded recovery
state; it never permits an unverified runtime execution path.

First use while offline is intentionally recoverable: a shell-only device is
told to connect once and is not prompted for a camera. Integrity failure never
uses affected bytes; it clears incomplete cache material, stops the camera, and
shows safe recovery. These guarantees apply to application-controlled browser
storage; browsers and operating systems may manage their own internal memory.

## Ticket 04 frame and evidence boundary

Ticket 04 transfers transient inference `ImageBitmap` frames only from the
camera frame pump to the dedicated worker. The worker closes each processed
frame, and the coordinator closes discarded pending frames. Frames do not enter
React state, Cache Storage, localStorage, sessionStorage, IndexedDB, cookies,
network requests, logs, diagnostics, or any other persistence mechanism.

The only worker output admitted to application state is categorical evidence:
a capped 0/1/2 face count, one framing-guidance category, eligibility, and
protocol freshness metadata used for rejection. The application never stores or
exports screenshots, participant images, landmarks, blendshapes, face boxes,
geometry, coordinates, device identifiers, or a smile score. No participant
dataset is collected or used for custom training. Smile Score is explicitly
outside Ticket 04 and remains Ticket 05 work.

The Ticket 04 browser journey checks that localStorage and sessionStorage are
empty and that every observed request remains same-origin while exercising
guidance, stale-result rejection, Stop, and Switch. This is application-level
evidence, not a claim about browser or operating-system internal memory. The
Ticket 03 first-load race remains a release blocker; completed-cache reopen is
development-only preparation for subsequent face-guidance testing.
