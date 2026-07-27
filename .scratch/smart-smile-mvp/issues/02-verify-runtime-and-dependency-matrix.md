Type: research
Status: resolved

# Verify the runtime and dependency matrix

## Question

Which current Python, MediaPipe Tasks, OpenCV, NumPy, model-asset, and operating-system versions can be pinned together for a supported managed environment on Windows 10/11 and macOS, and what licensing or redistribution constraints apply to the bundled Face Landmarker model?

## Answer

Use a metadata-validated candidate baseline of 64-bit CPython `3.12.10`, `mediapipe==0.10.35`, `opencv-contrib-python==4.11.0.86` (and no other OpenCV wheel variant), and `numpy==1.26.4`; produce hashed locks separately for Windows x86-64 and macOS ARM64. The combined pins support the agreed Windows target and Apple Silicon macOS 13+, but not Intel macOS or macOS 11/12, so those Macs are not a supportable MVP promise without a separate investigation. Vendor Google's official `face_landmarker.task` bytes and pin them by SHA-256 because the published download uses a moving `latest` path. The cited Face Mesh and Blendshape model cards specify Apache 2.0: redistribution is allowed with the license, retained notices/attribution, modification notices, and no implied trademark or endorsement rights. Native install/import/model/camera smoke tests on both target platforms are still required before this candidate becomes the release lock. Full evidence and direct primary-source links: [runtime and dependency matrix research](../../../docs/research/runtime-dependency-matrix.md).
