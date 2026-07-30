Status: approved

# Smart Smile PWA Delivery Map

## Destination

Release one privacy-first responsive PWA that satisfies the manager’s “web, local, and mobile” requirement, uses the MacBook and phone cameras for on-device inference, works offline after setup, and preserves a testable manual accessibility path.

## Delivery rule

These are thin, demonstrable vertical slices. Each ticket must end with a user-visible or operator-visible capability, automated evidence, and a safe rollback boundary. The planning pack is approved; ticket readiness still follows the dependency path.

## Transition rule

- Pause Python desktop implementation tickets 03–14.
- Preserve completed Python tickets 01–02 as reference behavior.
- Move the existing Python source into apps/desktop-reference only in ticket 01, with its tests and run command preserved.
- Make apps/web the only destination for new product features.
- Archive the desktop reference only after ticket 12 obtains an explicit decision.

## Six milestones

### M1 — Web foundation

- [01 — Establish the PWA workspace and delivery path](issues/01-establish-pwa-workspace-and-delivery-path.md)

Demonstration: the same responsive shell runs in local development, locally served production mode, CI, and a Cloudflare preview.

### M2 — Privacy and camera

- [02 — Start a privacy-first responsive camera session](issues/02-start-privacy-first-responsive-camera-session.md)
- [03 — Load a verified offline-capable vision runtime](issues/03-load-verified-offline-capable-vision-runtime.md)

Demonstration: a participant sees privacy copy, grants camera permission, switches cameras, and can reload the verified app/runtime/model offline.

### M3 — On-device intelligence

- [04 — Guide one participant with worker-based face evidence](issues/04-guide-one-participant-with-worker-face-evidence.md)
- [05 — Verify anonymous continuity and a sustained smile](issues/05-verify-continuity-and-sustained-smile.md)
- [06 — Enforce live quality and adaptive performance](issues/06-enforce-live-quality-and-adaptive-performance.md)

Demonstration: the worker keeps UI responsive while one participant receives framing, smile, light, stability, and performance guidance.

### M4 — Smile experience

- [07 — Run a cancel-safe countdown into a first capture](issues/07-run-cancel-safe-countdown-into-first-capture.md)

Demonstration: sustained valid intent produces a countdown and one in-memory photo; invalidity cancels safely.

### M5 — Capture and delivery

- [08 — Select, review, download, share, and retake](issues/08-select-review-download-share-and-retake.md)
- [09 — Complete the accessible manual capture path](issues/09-complete-accessible-manual-capture-path.md)

Demonstration: the app selects the best candidate and supports automatic or manual capture with an accessible review/delivery flow.

### M6 — PWA release

- [10 — Make sessions resilient, observable, and update-safe](issues/10-make-sessions-resilient-observable-and-update-safe.md)
- [11 — Gate releases with automated privacy and browser evidence](issues/11-gate-releases-with-automated-evidence.md)
- [12 — Validate real devices and decide desktop archival](issues/12-validate-real-devices-and-decide-desktop-archival.md)

Demonstration: approved preview and production builds pass privacy, accessibility, performance, offline, browser, and physical-device acceptance.

## Dependency path

    01
     |
     v
    02 ---> 03
     |       |
     +---+---+
         v
        04
         |
         v
        05
         |
         v
        06
         |
         v
        07
         |
         v
        08
         |
         v
        09
         |
         v
        10
         |
         v
        11
         |
         v
        12

Tickets 02 and 03 may be developed independently after 01, but 04 requires both. The remaining sequence is intentionally ordered so every later slice relies on a working user path.

## Human review points

- Planning pack approval before ticket 01.
- UX review on ticket 02’s real responsive camera preview.
- Calibration review after ticket 06 browser measurements.
- Privacy and accessibility review before ticket 11 can pass.
- Manager and user acceptance in ticket 12.
- Explicit desktop-reference archive/retain decision after parity evidence.

## Definition of done for every ticket

- Acceptance criteria are demonstrated at the public application seam.
- New behavior has proportionate automated tests.
- No unexpected network request occurs during camera or review behavior.
- Accessibility semantics are included in the slice, not postponed.
- Performance and privacy regressions are visible.
- Documentation and stable reason codes are updated.
- Relevant local development and production build commands pass.
- The pull request contains a Cloudflare preview when deployment is available.

## Ready-state policy

Approval of this planning pack changes ticket 01 to ready-for-agent. Later tickets become ready only when their blockers are completed and their acceptance criteria remain valid after preceding implementation findings.
