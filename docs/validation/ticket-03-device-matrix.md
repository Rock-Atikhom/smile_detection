# Ticket 03 physical-device acceptance matrix

Ticket 03 acceptance is limited to runtime initialization and offline reopen;
it does not establish frame processing, landmark extraction, or smile detection.
No Ticket 03 manual device run was performed in this implementation environment.
Every unexecuted result below is explicitly pending rather than inferred from
prior automated or Ticket 02 device evidence.

For each row, prepare online by selecting **Continue to camera** and waiting for
both runtime and offline use to report ready. Close the browser page, enable
airplane mode, reopen the page, select **Continue to camera**, and confirm
**Camera ready** without network access. Record no device label or ID, camera
content, landmark, geometry, score, or other participant identifier.

| Browser / OS class           | Release ID                                                                                   | Model ID                                                                                      | SIMD / baseline tier | Preparation duration                                                                                  | Cache outcome                                            | Pass / fail                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Current iPhone Safari        | Release `6c23e451b7a9b523` confirmed through the real deployed HTTPS URL and status flow     | MediaPipe `0.10.35`; Face Landmarker `float16/1`                                              | WASM SIMD            | Approximately 2 minutes — verified on physical iPhone via the deployed HTTPS site                     | Verified release ready; face guidance observed on device | Pass — online Camera Ready, runtime Ready, and device-verified guidance |
| Current Android Chrome       | Stable alias origin; release `6c23e451b7a9b523` confirmed through the instructed status flow | MediaPipe `0.10.35`; Face Landmarker `float16/1` confirmed through the instructed status flow | WASM SIMD            | Approximately 30 seconds — user-reported, not instrumented telemetry                                  | Verified release ready; offline close/reopen succeeded   | Pass — user-confirmed online and airplane-mode offline close/reopen     |
| Current macOS MacBook Safari | Stable alias origin; release `6c23e451b7a9b523`                                              | MediaPipe `0.10.35`; Face Landmarker `float16/1`                                              | SIMD                 | Approximately 2 minutes — observed from preparation and ready screenshots, not instrumented telemetry | Verified release ready; offline close/reopen succeeded   | Pass — online Camera Ready, runtime Ready, and offline Ready            |
| MacBook Chrome               | Stable alias origin; release `6c23e451b7a9b523`                                              | MediaPipe `0.10.35`; face_landmarker `float16/1`                                              | WASM SIMD            | Approximately 1 minute — observed user flow and screenshots, not instrumented telemetry               | Verified release ready; offline close/reopen succeeded   | Pass — online Camera Ready, runtime Ready, and offline Ready            |
