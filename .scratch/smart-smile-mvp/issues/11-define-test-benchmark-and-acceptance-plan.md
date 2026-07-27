Type: grilling
Status: resolved
Claimed by: codex
Blocked by: 02, 03, 05, 06, 07, 08, 09, 10, 12, 13

# Define the test, benchmark, and acceptance plan

## Question

What test matrix, synthetic fixtures, mocked landmark sequences, fault injections, image-quality scenarios, benchmark instrumentation, target-machine procedure, and pass/fail report prove that the agreed product and performance contract has been met?

## Answer

Adopt a traceable validation pyramid. Every contract item maps to at least one deterministic automated test and, where hardware or OS behavior is involved, one native smoke or manual acceptance scenario.

### Test matrix and seams

1. **Pure contract tests** cover the Smile Score formula and clamp, EMA and hysteresis boundaries, Grace Window arithmetic, Capture Zone and face-size limits, Face Continuity matching/adaptation, luma/darkness/enhancement decisions, Laplacian sharpness, candidate ranking, configuration parsing/ranges/precedence, safe error codes, and collision-safe filename generation. Test exact boundary values, missing/NaN values, timestamp equality, and generation equality/inequality.
2. **Deterministic coordinator/reducer tests** feed timestamped vision, camera, worker, reset, and exit events through the public session seam. They assert every canonical state, event-priority rule, progress freeze/expiry, Countdown cancellation, Capture Burst retry, Cooldown, reconnect, generation invalidation, and the invariant that a session commits zero or one Final Photo.
3. **Lane and adapter contract tests** use fakes for the camera, Face Landmarker, clock, filesystem, encoder, and mailboxes. They verify backend ordering and release, advisory property handling, decoded-resolution checks, warm-up and empty-read behavior, single-slot replacement, stale-result rejection, burst FIFO behavior, cancellation, bounded queues, atomic same-directory commit, fsync/rename failure handling, and absence of stale-generation writes.
4. **Scenario tests** run the same application-facing result contract against prerecorded/synthetic streams and assert visible state/reason, Verification and Countdown timing, candidate acceptance, retry behavior, telemetry, and storage outcome. They do not assert private helper calls or internal container types.
5. **Native platform tests** are release gates on a clean Windows 10/11 x86-64 baseline and macOS 11+ Apple Silicon. They install from the locked dependency set, import direct dependencies, verify the model SHA-256, construct Face Landmarker, open a real webcam, and process synthetic plus live frames for at least 60 seconds. Intel macOS is explicitly not a release target.

### Deterministic fixtures

Keep fixtures versioned by scenario name, schema version, seed, frame dimensions, and timestamp cadence. The landmark fixture stream uses a fixed 30 FPS clock and includes neutral, speech, gradual/broad/weak/asymmetric smiles, brief sub-300 ms spikes, blinking, occlusion, head turns, ordinary movement, no face, multiple faces, and Participant replacement. Each record contains only the application-facing face count, normalized geometry, blendshape coefficients, and capture timestamp; no identity label or raw biometric artifact is required.

Use a seeded image-fixture generator at 1280x720 and 640x480 for nominal exposure, dim, backlit, low-contrast, clipped highlights, sensor noise, uniform blur, localized blur, and composition/size boundaries. Store expected Y10/Y50/Y90, enhancement decision, sharpness score, Quality Gate result, and selected candidate rank beside each fixture. GENKI-4K and UvA-NEMO remain optional offline calibration inputs with person-disjoint splits; they stay outside the product repository, and only permitted derived numeric traces are retained. A small consented local webcam set covers camera-specific appearance and lighting.

### Fault injection

The harness must inject camera-open failure, backend fallback, unsupported property, empty reads, transient read failure, disconnect/reconnect, a permanently blocking/reconnect-exhaustion path, stale and out-of-order inference results, worker exception, malformed/missing/checksum-invalid model, invalid/unknown configuration, unwritable output, encoder failure, fsync failure, rename failure, filename collision, and an unknown commit outcome. For each injection assert the stable safe code, state/reason transition, generation behavior, bounded shutdown/recovery, and that no partial or duplicate Final Photo is exposed.

### Benchmark instrumentation and procedure

Record a run ID, source revision/fingerprint, OS/version/architecture, Python and package versions, model checksum, camera/backend, requested and delivered resolution/FPS, configuration hash, fixture hashes, CPU/RAM, and whether the run is synthetic or live. Emit privacy-safe JSONL stage samples for camera-read handoff, downscale/color conversion, inference, state update, render, burst acquisition, quality processing, encode, and commit. Also record queue age, replaced-frame count, stale-result count, accepted-result FPS, reconnect count, RSS, and periodic aggregates. Ordinary-frame latency is camera-read return to presentation and includes queueing; burst work is reported separately.

On each target machine, run three independent 60-second ordinary-preview runs after warm-up, then ten successful Capture Bursts and the complete native smoke suite. Do not hide failures with retries; retain raw aggregate files and a generated Markdown/JSON report. The Windows baseline is an Intel 8th-generation Core i5, 8 GB RAM, CPU-only, 720p webcam. macOS validation uses a supported Apple-Silicon machine and macOS 11 or newer.

### Release pass/fail gates

All automated contract and scenario tests must pass. The release fixture suite must produce zero Verification starts for neutral, speech, blink, brief occlusion, head movement, no-face, multiple-face, and Participant-replacement cases; intended sustained smiles must remain above the high threshold for at least 95% of accepted post-warm-up samples; sub-300 ms spikes must never start or complete Verification; and boundary/noise traces must not oscillate.

Every benchmark run must average at least 20 FPS, have ordinary-frame latency average at or below 50 ms and p95 at or below 75 ms, and keep the accepted-result stream within the agreed freshness cutoff. Across ten successful bursts, zero-to-confirmation p95 must be at or below 1.5 s, with exactly one valid unmirrored JPEG committed per success. RSS must stay below 1 GB and show no more than 10% growth over the run. Camera recovery must honor the 10-second budget, and reset/exit must leave no active worker or temporary-file leak.

The report is **PASS** only when every hard gate is met on both supported native platforms and all required artifacts are present. Any crash, deadlock, privacy-data emission, stale-generation commit, duplicate/partial file, model/dependency checksum mismatch, or missing native smoke result is an automatic **FAIL**. The report lists each requirement, fixture/scenario ID, observed value, threshold, verdict, and links to the relevant JSONL trace; failed runs remain reproducible from the recorded environment and seeds.

## Comments

- Approved by the user: the traceable validation pyramid, deterministic landmark/image fixtures, injected camera/inference/storage/config faults, privacy-safe benchmark telemetry, native target-machine procedure, and hard release gates above.
