# 11 — Make operation configurable and diagnosable

**What to build:** The complete operator contract for validated configuration, stable error/reason semantics, privacy-safe telemetry, performance visibility, and diagnosable storage/camera behavior.

**Blocked by:** 10 — Make the Capture Session race-safe.

**Status:** ready-for-agent

- [ ] The complete camera, vision, smile, quality, timing, storage, logging, and UI TOML sections implement the approved defaults and validation ranges.
- [ ] Configuration precedence remains built-in defaults, selected TOML, then explicit camera/config/debug CLI overrides, with no environment-variable overrides.
- [ ] Console and rotating JSONL output include UTC/monotonic time, state, reason, generation, safe error, camera facts, save outcomes, and performance aggregates.
- [ ] Stage latency, queue age, frame replacements, stale results, accepted FPS, reconnects, and Capture Burst timings are measured at the agreed boundaries.
- [ ] Logs and diagnostics never emit images, landmarks, face geometry, identity, or network telemetry.
- [ ] Error classes distinguish startup fatal, recoverable runtime, and runtime fatal outcomes with operator-readable messages and remediation hints.
- [ ] Contract tests validate complete documents, defaults, overrides, malformed/unknown values, rotation, telemetry schema, privacy exclusions, and stable error codes.
