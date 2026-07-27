Type: research
Status: resolved

# Determine portable camera behavior

## Question

What do official OpenCV documentation and source establish about Windows and macOS capture backends, resolution/FPS negotiation, camera-property support, frame-read failure behavior, and safe camera reopening, and which facts must constrain the portable design?

## Answer

OpenCV establishes platform backends but not uniform camera behavior: use MSMF with DirectShow fallback on Windows and AVFoundation on macOS, log the backend actually opened, treat resolution/FPS and camera controls as best-effort requests, and verify delivered dimensions from decoded frames plus FPS from a monotonic rolling measurement. A failed/empty read invalidates smile continuity; reconnect by releasing the sole capture owner, opening a fresh capture, reapplying properties, and warming up again. OpenCV's documented open/read timeouts do not cover these local-camera backends, so the agreed 10-second retry window is only best-effort unless camera I/O is isolated in a killable helper process. Device modes, control support, and failure latency require target-hardware tests. Full evidence and direct primary-source links: [Portable camera behavior in OpenCV](../../../docs/research/portable-camera-behavior.md).
