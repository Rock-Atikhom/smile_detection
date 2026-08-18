# Privacy

Smart Smile's MVP boundary is on-device processing with no account, camera upload, microphone use,
application photo persistence, or analytics collector. Ticket 02 requests a camera only from the
participant's `Continue to camera` gesture and requests video with `audio: false`.

## Capture and email delivery boundary

After a verified three-second smile and three-second countdown, the browser captures a transient
three-frame burst. It selects one frame using dimensions, one-face/continuity evidence, lighting,
and sharpness gates. The original and a selected background treatment are displayed before the
participant enters first name, last name, an optional nickname, an email address, and gives explicit
consent.

The local default is demo delivery and does not make a network request. Production delivery sends
only the selected image, participant details, email address, consent flag, and one idempotency key to the configured
same-origin PHP endpoint. The PHP endpoint keeps the Resend credential server-side, validates the
request, applies a bounded IP rate limit, writes the image only to a temporary file for the provider
request, and deletes that file before responding. Smart Smile does not save the image, email, or
participant record after delivery. The provider's own retention and delivery records are outside
the browser application boundary and must be covered by the deployment operator's privacy notice.

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
the immutable manifest paths for release `c8e4fbace24ccdb3` plus its matching
completion-marker record. That release is MediaPipe runtime/WASM files, the
Face Landmarker `float16/1` and Selfie Segmenter task bundles, the MediaPipe
license and notice, and the three upstream model cards. The completion marker is written only after
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

## Ticket 05 smile-score and continuity privacy boundary

Ticket 05 derives one aggregate raw Smile Score per accepted frame from the two
mouth-smile blendshapes and an anonymous continuity observation. The worker
reduces the frame to that fixed observation plus the raw score and discards all
MediaPipe geometry; landmark arrays, blendshapes, category names, coordinates,
and images never cross the worker boundary.

The observation is ephemeral and is only used to maintain a pure continuity
tracker. It is discarded after accepted processing and is never exposed through
React state, the DOM, diagnostics, reports, storage (Cache Storage,
localStorage, sessionStorage, IndexedDB, cookies), service-worker caches,
network requests, or logs. Current raw/smoothed aggregates appear only as a
current-instant readout in the on-device Help panel; no score time series or
biometric record is retained. No participant dataset is collected or used for
custom training.
