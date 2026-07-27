Type: research
Status: resolved

# Reconcile the OpenCV release baseline

## Question

Which OpenCV Python release should the MVP actually pin after reconciling current wheel availability, Python 3.12 and NumPy compatibility, and the camera-backend behavior researched against OpenCV 4.13; and do any cited camera constraints differ materially in the selected release?

## Answer

Pin `opencv-contrib-python==4.11.0.86` with CPython 3.12 and `numpy==1.26.4`, and install no second OpenCV wheel family. OpenCV 4.11 is the last examined wheel release compatible with the chosen NumPy 1.26 line; 4.12 and 4.13 require NumPy 2 for Python 3.12. Comparing the selected 4.11 documentation/source with the earlier 4.13 camera research found no material change to the architectural constraints: backend selection and camera properties remain runtime/device dependent, failed reads must invalidate continuity, and local MSMF/DirectShow/AVFoundation calls still lack portable hard open/read timeouts. Native Windows and Apple-Silicon macOS smoke tests remain required. Full evidence and uncertainty: [OpenCV release baseline reconciliation](../../../docs/research/opencv-release-baseline.md).
