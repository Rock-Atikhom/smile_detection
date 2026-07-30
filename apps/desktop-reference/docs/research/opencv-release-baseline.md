# OpenCV release baseline reconciliation

Research date: 2026-07-27

## Decision

Pin `opencv-contrib-python==4.11.0.86` alongside CPython 3.12 and
`numpy==1.26.4`. Install no other OpenCV wheel family in the same environment.

The exact ARM64 macOS wheel is tagged `macosx_13_0_arm64`. Although the selected
MediaPipe wheel supports macOS 11+, the combined managed environment therefore
supports macOS 13+ on Apple Silicon.

This is not a preference for an older API. It is the newest published
`opencv-contrib-python` release in the examined sequence whose official package
metadata remains compatible with the project's deliberately conservative NumPy
1.26 pin:

- The [4.11.0.86 PyPI metadata](https://pypi.org/pypi/opencv-contrib-python/4.11.0.86/json)
  supplies Python 3.12 through ABI3 wheels and, for Python 3.12, requires NumPy
  at least 1.26; `numpy==1.26.4` satisfies that marker.
- The [4.12.0.88 PyPI metadata](https://pypi.org/pypi/opencv-contrib-python/4.12.0.88/json)
  moves supported modern Python environments, including Python 3.12, to NumPy
  2.x. The [4.13.0.90 metadata](https://pypi.org/pypi/opencv-contrib-python/4.13.0.90/json)
  retains the NumPy 2.x requirement. Neither release can be combined with the
  selected exact `numpy==1.26.4` constraint.
- OpenCV's wheel maintainers state that the four wheel variants share the same
  `cv2` namespace and only one may be installed. The project already selected
  the desktop contrib family, so the exact package pin must remain
  `opencv-contrib-python`, not an additional `opencv-python` install
  ([official wheel repository](https://github.com/opencv/opencv-python#installation-and-usage)).

Choosing OpenCV 4.12 or 4.13 would therefore require a separate decision to
move the entire environment to NumPy 2 and revalidate MediaPipe plus the native
Windows/macOS locks. That is not necessary for this MVP.

## Camera-behavior comparison: 4.11 versus 4.13

The camera constraints previously derived from OpenCV 4.13 do **not** differ
materially in OpenCV 4.11. The relevant 4.11 public contracts and backend
boundaries establish the same design obligations:

- Backend choice remains build/runtime dependent; Windows exposes MSMF and
  DirectShow and Apple platforms expose AVFoundation. The application must
  inspect the backend that actually opened rather than treating `CAP_ANY` as a
  portable selection policy ([4.11 video-I/O overview](https://docs.opencv.org/4.11.0/d0/da7/videoio_overview.html),
  [4.11 backend identifiers](https://docs.opencv.org/4.11.0/d4/d15/group__videoio__flags__base.html)).
- Width, height, FPS, exposure, gain, white balance, and related properties
  remain backend/driver/device dependent. `VideoCapture.set()` indicates that a
  backend handled a property, not that the camera delivered the exact requested
  value; delivered dimensions and throughput still require measurement
  ([4.11 `VideoCapture`](https://docs.opencv.org/4.11.0/d8/dfe/classcv_1_1VideoCapture.html),
  [4.11 property caveats](https://docs.opencv.org/4.11.0/d4/d15/group__videoio__flags__base.html)).
- `read()` still returns failure with an empty image when a frame cannot be
  grabbed; `isOpened()` is an initialization result, not a continuing liveness
  guarantee. Release/reopen remains the supported recovery sequence
  ([4.11 `VideoCapture`](https://docs.opencv.org/4.11.0/d8/dfe/classcv_1_1VideoCapture.html),
  [4.11 implementation](https://github.com/opencv/opencv/blob/4.11.0/modules/videoio/src/cap.cpp)).
- `CAP_PROP_OPEN_TIMEOUT_MSEC` and `CAP_PROP_READ_TIMEOUT_MSEC` remain scoped to
  FFmpeg/GStreamer rather than the local MSMF, DirectShow, and AVFoundation
  webcam backends. Consequently, the ten-second reconnect budget is still only
  enforceable while native backend calls return; a hard wall-clock guarantee
  still requires camera ownership in a killable helper process
  ([4.11 timeout-property documentation](https://docs.opencv.org/4.11.0/d4/d15/group__videoio__flags__base.html)).
- The same platform backends remain distinct implementations in the selected
  source release: [MSMF](https://github.com/opencv/opencv/blob/4.11.0/modules/videoio/src/cap_msmf.cpp),
  [DirectShow](https://github.com/opencv/opencv/blob/4.11.0/modules/videoio/src/cap_dshow.cpp),
  and [AVFoundation](https://github.com/opencv/opencv/blob/4.11.0/modules/videoio/src/cap_avfoundation_mac.mm).

Accordingly, the earlier portable-camera policy can be retained unchanged when
the application pins 4.11.0.86. This conclusion concerns the documented public
behavior that drives the architecture; it does not claim the 4.11 and 4.13
backend implementations are byte-for-byte identical.

## Residual uncertainty and validation

This is a package-metadata and source/documentation reconciliation, not a native
runtime certification. Clean Windows x86-64 and Apple-Silicon macOS installs
must still verify dependency resolution, imports, the backend actually selected,
720p/30 negotiation, controls, unplug/replug behavior, and the 60-second
performance target. Camera modes and blocking behavior remain dependent on the
specific webcam, driver, permissions, OS, and wheel build.

The exact 4.11 pin is stable, but “latest release” is time-sensitive. If the
project later relaxes the NumPy 1.26 constraint, re-evaluate a newer OpenCV wheel
as a new dependency-baseline decision rather than silently upgrading it.
