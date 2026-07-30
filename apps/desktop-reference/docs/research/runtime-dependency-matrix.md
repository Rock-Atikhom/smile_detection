# Runtime and dependency matrix research

Research date: 2026-07-27

## Recommendation

Use one conservative, reproducible environment for the MVP:

| Component | Pin / support boundary | Rationale |
|---|---|---|
| Python | CPython `3.12.10`, 64-bit | MediaPipe `0.10.35` advertises Python 3.9–3.12 support. Python 3.12 is therefore the newest documented Python line in that package's classifiers, rather than relying on an unadvertised newer interpreter. |
| MediaPipe Tasks | `mediapipe==0.10.35` | This is the current PyPI release as of the research date and contains Windows x86-64/ARM64 and macOS 11+ ARM64 wheels. The Face Landmarker guide identifies `mediapipe` as the required package. |
| OpenCV | `opencv-contrib-python==4.11.0.86` | Use exactly one OpenCV wheel family because all variants install the same `cv2` namespace. This 4.11 pin stays on the mature OpenCV 4 API and allows the conservative NumPy 1.26 line; do not also install `opencv-python`. |
| NumPy | `numpy==1.26.4` | This release supports Python 3.9+, has Windows/macOS wheels, and avoids making the MVP depend on the NumPy 2 ABI transition. |
| Face Landmarker asset | Vendor the bytes downloaded from Google's official `face_landmarker.task` URL; record and verify a project-owned SHA-256 | Google's guide requires a local compatible model path, but the official download URL uses `latest`, which is not an immutable semantic version. A checksum is therefore the reproducible identity. |
| Windows | Windows 10/11 x86-64 | MediaPipe `0.10.35` publishes a `win_amd64` wheel. This matches the agreed i5 benchmark. |
| macOS | macOS 13 or later on Apple Silicon (ARM64) | MediaPipe publishes `macosx_11_0_arm64`, but the selected OpenCV contrib 4.11 wheel is `macosx_13_0_arm64`; the combined environment therefore has a macOS 13 floor. Neither selected line supplies the required Intel support combination. |

Primary package metadata: [MediaPipe 0.10.35 on PyPI](https://pypi.org/project/mediapipe/0.10.35/), [OpenCV Python 4.11.0.86 on PyPI](https://pypi.org/project/opencv-contrib-python/4.11.0.86/), [NumPy 1.26.4 on PyPI](https://pypi.org/project/numpy/1.26.4/), and the official [Face Landmarker Python guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/python).

## Important platform conclusion

“macOS” cannot presently mean every Mac architecture or every MediaPipe-supported OS version with this combined pin set. MediaPipe `0.10.35` supplies a macOS 11+ ARM64 wheel but no macOS Intel wheel ([PyPI files](https://pypi.org/project/mediapipe/0.10.35/#files)); OpenCV contrib 4.11.0.86 supplies its ARM64 wheel with a macOS 13 tag. The MVP therefore declares macOS 13+ on Apple Silicon as its combined supported target. Supporting Intel Macs or macOS 11/12 would require a separate dependency investigation rather than an unsupported fallback.

## Installation and locking policy

Keep the four direct pins in the project input requirements, resolve transitive dependencies separately on Windows x86-64 and macOS ARM64, and commit platform-specific lock files with hashes. Package metadata—not merely a successful resolution—must be checked, because OpenCV's wheel variants share `cv2`, and installing more than one variant creates an unsupported namespace collision. The OpenCV maintainers explicitly instruct users to select only one package variant ([official opencv-python repository](https://github.com/opencv/opencv-python#installation-and-usage)).

Before accepting the matrix, run clean-environment smoke tests on both target systems:

1. install from the hashed platform lock;
2. import `cv2`, `numpy`, and `mediapipe`;
3. construct a Face Landmarker with the vendored task asset;
4. open the webcam and process synthetic plus live frames for 60 seconds;
5. record `python --version`, package versions, architecture, OS version, and model SHA-256.

This is a metadata-validated candidate matrix, not a claim that the complete webcam pipeline has already passed those two native smoke tests.

## Model licensing and redistribution

The official Face Mesh V2 and Blendshape V2 model cards identify their models as Apache License 2.0 ([Face Mesh model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf), [Blendshape model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf)). The MediaPipe Python package is likewise identified as Apache 2.0 on [PyPI](https://pypi.org/project/mediapipe/0.10.35/).

Bundling is therefore permitted, subject to the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) conditions. A distributable should:

- include a copy of the Apache 2.0 license;
- retain applicable copyright, attribution, and `NOTICE` material supplied with the artifact;
- mark local modifications if the model is changed;
- avoid implying Google endorsement or receiving trademark rights, which Apache 2.0 does not grant;
- document the official source URL, download date, exact filename, and SHA-256 of the vendored `.task` file.

## Remaining uncertainty

- Google's documented model download uses a moving `latest` path. The release process must freeze and checksum the actual bytes; a bare URL is not an adequate pin.
- The combined `.task` archive may contain more components than the two cited model cards. Before public redistribution, inspect the exact downloaded artifact and preserve any accompanying `NOTICE` or additional attribution. The available official model cards support Apache-2.0 redistribution, but they are not a substitute for an artifact-level release audit.
- Native Windows and Apple-Silicon macOS smoke tests remain necessary. If Intel macOS is later made mandatory, reopen the runtime decision rather than silently falling back to an old package or Rosetta.
