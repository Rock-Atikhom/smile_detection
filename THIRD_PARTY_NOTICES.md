# Third-party notices

## MediaPipe Tasks Vision, Face Landmarker, and Selfie Segmenter release

Smart Smile redistributes the self-hosted MediaPipe Tasks Vision runtime
`@mediapipe/tasks-vision@0.10.35`, the official Face Landmarker model
`float16/1`, and the official Selfie Segmenter model as release
`c8e4fbace24ccdb3`. The immutable release inventory,
SHA-256 values, byte counts, and per-asset provenance are in
`apps/web/src/vision/generated/release-manifest.json`.

- MediaPipe Tasks Vision package source:
  <https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz>
- MediaPipe source and release: <https://github.com/google-ai-edge/mediapipe/tree/v0.10.35>
- MediaPipe license: <https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.35/LICENSE>
- Face Landmarker model bundle:
  <https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task>
- Selfie Segmenter model bundle:
  <https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite>
- BlazeFace Short Range model card:
  <https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf>
- Face Mesh V2 model card:
  <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf>
- Blendshape V2 model card:
  <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf>

The shipped release directory is
`apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/`. The
upstream-original `LICENSE-MediaPipe.txt` is copied from the MediaPipe
`v0.10.35` license; Smart Smile's vendor script generates `NOTICE.txt` locally
from the pinned package, model, model-card, and license source URLs. Retain both
files and this notice when redistributing the vendored runtime or derivative
source distribution. The MediaPipe license is Apache License 2.0. This notice
records upstream provenance and does not state model licensing terms beyond the
linked upstream model bundle and model cards.
