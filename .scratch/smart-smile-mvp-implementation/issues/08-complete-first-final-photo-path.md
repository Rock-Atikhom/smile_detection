# 08 — Complete the first Final Photo path

**What to build:** The first complete happy path from Countdown zero through a bounded Capture Burst, exactly one atomic Final Photo, visible confirmation, and Cooldown using a deterministic all-valid burst.

**Blocked by:** 07 — Run a cancel-safe Countdown.

**Status:** ready-for-agent

- [ ] Countdown zero starts a five-frame, full-resolution Capture Burst lasting 250–300 ms with no normal-frame replacement inside the bounded burst buffer.
- [ ] Burst processing and storage run off the UI lane while PROCESSING remains responsive.
- [ ] For an all-valid equivalent burst, one deterministic unmirrored candidate is encoded as JPEG quality 95 and committed exactly once.
- [ ] Filenames use UTC milliseconds, exclusive collision suffixes, and never overwrite an existing Final Photo.
- [ ] Storage uses a same-directory temporary file, flush/fsync, and atomic rename; success is emitted only after final commit.
- [ ] Successful commit enters a three-second Cooldown that displays the unmirrored Final Photo and prevents new Verification.
- [ ] Integration tests use a real temporary directory to verify one complete file, no partial file, collision behavior, Cooldown, and return to READY.
