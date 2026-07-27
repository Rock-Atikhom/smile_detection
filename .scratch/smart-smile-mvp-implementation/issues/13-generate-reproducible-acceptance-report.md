# 13 — Generate a reproducible Acceptance Report

**What to build:** A deterministic validation and benchmark harness that exercises the complete Capture Session, injects failures, measures the agreed budgets, and produces auditable Markdown and JSON release verdicts.

**Blocked by:** 11 — Make operation configurable and diagnosable; 12 — Finish the Participant and debug overlays.

**Status:** ready-for-agent

- [ ] The highest automated seam drives timestamped camera/vision events, clock, worker/storage outcomes, and controls while observing state, guidance, telemetry, and committed Final Photos.
- [ ] Versioned Validation Fixtures cover smile, Face Continuity, face count/position/size, lighting, blur, candidate ranking, cancellation, retry, and fault scenarios.
- [ ] Pure contract, reducer, adapter, storage, configuration, privacy, scenario, and fault-injection suites all run from one documented validation command.
- [ ] Benchmarks report source/config/model/fixture fingerprints, environment, stage p50/p95/p99, average FPS, queue age, replacements, stale results, RSS, reconnects, and burst duration.
- [ ] A benchmark session runs three independent 60-second ordinary previews after warm-up and ten successful Capture Bursts without hiding failures through automatic retry.
- [ ] PASS requires all functional gates, >=20 average FPS, <=50 ms average and <=75 ms p95 ordinary latency, <=1.5 s burst-to-confirmation p95, exactly one Final Photo per success, and the approved memory/privacy requirements.
- [ ] Any crash, deadlock, privacy-data emission, stale-generation commit, duplicate/partial file, checksum mismatch, or missing required evidence produces FAIL with links to the relevant traces.
