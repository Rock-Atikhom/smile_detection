# Portable camera behavior in OpenCV

Research baseline: OpenCV 4.13.0 official documentation and the matching OpenCV repository tag. These findings must be rechecked if the project pins a different major/minor release.

## Established behavior

### Backend selection is runtime- and build-dependent

- OpenCV exposes `CAP_MSMF` and `CAP_DSHOW` on Windows and `CAP_AVFOUNDATION` on Apple platforms. `CAP_ANY` does not mean a stable cross-platform backend; it asks OpenCV to use the first available backend. Backend availability depends on how the installed binary was built. OpenCV provides the video-I/O registry and `VideoCapture.getBackendName()` so an application can inspect what is actually available and what opened successfully. [Video I/O overview](https://docs.opencv.org/4.13.0/d0/da7/videoio_overview.html), [backend identifiers](https://docs.opencv.org/4.13.0/d4/d15/group__videoio__flags__base.html)
- In the documented default build configuration, MSMF and DirectShow are enabled on Windows; DirectShow is older and deprecated in favor of MSMF, although both may coexist. AVFoundation is enabled by default on Apple platforms. The Python wheel/build used by the project remains the final authority at runtime. [OpenCV configuration reference](https://docs.opencv.org/4.13.0/db/d05/tutorial_config_reference.html)
- The backends are separate implementations, not interchangeable wrappers with identical semantics. Their platform-specific code lives in [MSMF](https://github.com/opencv/opencv/blob/4.13.0/modules/videoio/src/cap_msmf.cpp), [DirectShow](https://github.com/opencv/opencv/blob/4.13.0/modules/videoio/src/cap_dshow.cpp), and [AVFoundation](https://github.com/opencv/opencv/blob/4.13.0/modules/videoio/src/cap_avfoundation_mac.mm).

**Design constraint:** try an explicit ordered backend list and log the selected backend: MSMF then DirectShow on Windows, AVFoundation on macOS, with `CAP_ANY` only as a final compatibility fallback. A failed attempt must be released before trying the next backend. At startup, log `cv2.getBuildInformation()`-derived video-I/O availability or the registry result and `getBackendName()` for the successful capture.

### Resolution, FPS, and controls are requests, not contracts

- `CAP_PROP_FRAME_WIDTH`, `CAP_PROP_FRAME_HEIGHT`, and `CAP_PROP_FPS` are generic property identifiers, but OpenCV explicitly warns that property behavior depends on the backend, operating system, driver, and hardware. A backend may not support a property at all. [VideoCapture properties](https://docs.opencv.org/4.13.0/d4/d15/group__videoio__flags__base.html)
- `VideoCapture.set()` reports whether the backend supports handling the property; its documented return value does **not** guarantee that the device accepted the exact requested value. `get()` may return `0` for an unsupported property. [VideoCapture class reference](https://docs.opencv.org/4.13.0/d8/dfe/classcv_1_1VideoCapture.html)
- Exposure, auto-exposure, gain, brightness, white balance, autofocus, and similar controls have the same backend/device dependency. There is no portable numeric exposure scale across these backends. [Property identifiers and caveat](https://docs.opencv.org/4.13.0/d4/d15/group__videoio__flags__base.html)

**Design constraint:** request 1280x720 and 30 FPS as best effort, preferably set width and height before FPS, then warm up and verify. The authoritative delivered dimensions are `frame.shape`; property readback is diagnostic. Accept a stream only when repeatedly decoded frames are at least 640x480. Treat `CAP_PROP_FPS` as device/backend metadata, not achieved throughput; calculate rolling FPS and frame latency with a monotonic clock. Camera-control overrides must be opt-in and best-effort: record each `set()` result and readback, warn on rejection or material mismatch, and continue with the camera's automatic defaults.

### A read failure is explicit but not classified

- `VideoCapture.read()` combines `grab()` and `retrieve()`. If no frame was grabbed, including when a camera disconnects, it returns `false` and returns an empty image. The API does not classify the cause as transient versus permanent. `isOpened()` only reports whether initialization/open succeeded; it is not a liveness guarantee. [VideoCapture `read`, `isOpened`, and `release`](https://docs.opencv.org/4.13.0/d8/dfe/classcv_1_1VideoCapture.html)
- The public implementation clears/releases the output on a failed grab before returning failure, so callers must check both the Boolean result and an empty frame rather than reuse an earlier buffer. [OpenCV `VideoCapture` implementation](https://github.com/opencv/opencv/blob/4.13.0/modules/videoio/src/cap.cpp)

**Design constraint:** regard `not ok` **or** `frame is None` **or** `frame.size == 0` as a failed read; never process or display the preceding frame as if it were new. A failed read immediately invalidates smile continuity. Permit only a small configurable number/time window of isolated failures before entering reconnect mode.

### Reopening is supported, but a hard local-camera timeout is not portable

- `release()` closes the device. A subsequent `open()` automatically calls `release()` first, and destruction also releases the capture. [VideoCapture class reference](https://docs.opencv.org/4.13.0/d8/dfe/classcv_1_1VideoCapture.html)
- `CAP_PROP_OPEN_TIMEOUT_MSEC` and `CAP_PROP_READ_TIMEOUT_MSEC` are documented for FFmpeg and GStreamer, not MSMF, DirectShow, or AVFoundation local-camera capture. OpenCV therefore does not establish a portable, enforceable timeout for a blocking webcam `open()` or `read()` call. [Timeout property scope](https://docs.opencv.org/4.13.0/d4/d15/group__videoio__flags__base.html)
- MSMF may use hardware transforms; OpenCV documents that setting `OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS=0` can improve initialization time. This is a troubleshooting option, not a default portability guarantee. [MSMF backend note](https://docs.opencv.org/4.13.0/d4/d15/group__videoio__flags__base.html)

**Design constraint:** reconnect sequentially: stop consuming frames, release the sole capture owner, create a fresh `VideoCapture`, retry the explicit platform backend order with short backoff, then reapply and reverify requested properties and rerun warm-up. The agreed 10-second reconnect window can bound the retry loop only when backend calls return. If a strict wall-clock guarantee is required even when native `open()`/`read()` hangs, camera ownership must be isolated in a killable helper **process** supervised by the UI process; a Python thread cannot safely cancel a blocked native call. This process boundary is an architectural decision, not functionality promised by OpenCV.

## Recommended portable policy

1. Enumerate/inspect available camera backends and try the platform-specific order above.
2. Require `isOpened()`, then request 720p/30; treat all property sets as advisory.
3. Read through the configured two-second warm-up and derive actual dimensions from frames.
4. Reject actual frames below 640x480; otherwise continue and show actual dimensions plus measured FPS in diagnostics.
5. Keep automatic camera behavior by default; optional overrides never make startup fail solely because a property is unsupported.
6. On read failure, reset capture workflow state. After a small transient allowance, release and reopen with bounded backoff.
7. Decide before implementation whether “10 seconds” is a best-effort retry budget or a hard wall-clock guarantee. Choose a helper process for the latter.

## Uncertainty requiring target-hardware validation

- Exact supported modes, rounding/substitution of 1280x720@30, control ranges, and disconnect latency are webcam/driver specific and cannot be established from OpenCV alone.
- Backend ordering under `CAP_ANY` and backend availability may differ between `opencv-python` wheel versions and locally built OpenCV. Always observe the runtime backend.
- Official documentation does not guarantee that local-camera `read()` or `open()` returns within a finite time after every failure mode. Manual unplug/replug and permission-denied tests are therefore required on both Windows and macOS.
