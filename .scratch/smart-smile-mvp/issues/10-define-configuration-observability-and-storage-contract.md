Type: grilling
Status: resolved
Blocked by: 04, 08

# Define the configuration, observability, and storage contract

## Question

What exact configuration schema, validation and override precedence, logging events and rotation policy, filename collision policy, atomic-save protocol, and startup/runtime error taxonomy should operators rely on across Windows and macOS?

## Answer

Use a strict, commented `config.toml` with sections `[camera]`, `[vision]`, `[smile]`, `[quality]`, `[timing]`, `[storage]`, `[logging]`, and `[ui]`. These sections cover camera selection and requested modes; minimum decoded resolution, warm-up, backend and reconnect policy; inference cap, stale cutoff, face count, and continuity limits; Smile Score and Grace Window settings; luma, enhancement, denoise, sharpness, and Capture Burst settings; Countdown and Cooldown; output path, JPEG quality, and filename prefix; log level and rotation; and initial debug/scaling options.

Override precedence is built-in safe defaults, then the selected TOML file, then explicit CLI overrides `--camera`, `--config`, and `--debug`. The MVP has no environment-variable overrides. Unknown keys, malformed values, invalid paths, and out-of-range settings fail before camera startup, identifying the section/key and accepted range.

Observability uses concise human-readable console output plus one structured JSONL rotating file. Default level is `INFO`; `DEBUG` adds per-transition and stage diagnostics but never records images, landmarks, face geometry, or identity data. Events include UTC and monotonic timestamps, event name, state, reason code, generation, and safe error code. Camera events include selected backend, delivered resolution, measured FPS, reconnect attempts, and property outcomes. Performance telemetry includes stage latency, queue age, replaced-frame count, stale-result count, accepted-result FPS, and periodic aggregate summaries. Save events include only commit outcome and generated filename. Rotate at 10 MB with five backups; no network export or remote telemetry.

Final Photo filenames use `smile_<UTC timestamp with milliseconds>.jpg`. Existing names are never overwritten; a collision receives `-01`, `-02`, and subsequent suffixes using exclusive creation. The selected unmirrored candidate is encoded at JPEG quality `95`. Storage writes a temporary file in the same output directory, flushes and `fsync`s it, then atomically replaces it into the final filename. Temporary files are cleaned on failure, and success is emitted only after the final rename. One commit is active at a time. Unwritable output, encoding failure, or unknown commit outcome is fatal.

Errors are classified as startup fatal, recoverable runtime, or runtime fatal. Startup fatal includes invalid configuration, unknown/out-of-range values, missing or checksum-mismatched model, dependency failure, unsupported architecture, unusable output directory, and failure to open any camera backend. Recoverable runtime includes transient empty frames, stale results, no-face/multiple-face/lighting/quality invalidity, and rejected Capture Bursts. Runtime fatal includes exhausted reconnect budget, inference/model-worker failure, storage encode/commit failure, and unknown commit outcome. Each error has a stable safe code, operator-readable message, remediation hint, state transition, and process exit code where applicable; no biometric or image data is included.

## Comments

- Approved by the user: strict configuration sections, built-in/file/CLI precedence, and fail-before-camera validation.
- Approved by the user: structured JSONL plus console logging, privacy exclusions, telemetry fields, rotation, and no remote export.
- Approved by the user: timestamped collision-safe filenames, JPEG quality `95`, same-directory temporary writes, flush/fsync, atomic rename, and no overwrite.
- Approved by the user: startup-fatal, recoverable-runtime, and runtime-fatal error classes with stable safe codes and remediation hints.
