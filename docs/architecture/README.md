# Architecture

The approved runtime design lives in
`.scratch/smart-smile-pwa/architecture.md`. This directory is the tracked home for implementation
architecture decisions as the PWA grows. Ticket 02 adds `apps/web/src/camera/` as the sole owner of
browser camera constraints, browser-error mapping, track lifecycle, generations, and allowlisted
in-memory diagnostics. React renders its stable snapshot and invokes only camera actions.

The camera request is video-only (`audio: false`), with non-exact 1280×720/30 FPS ideals. Mobile
clients prefer `facingMode: user`; desktop leaves selection to the browser. A request is considered
an ignored permission prompt after 15 seconds, and successful streams warm up for 1.2 seconds before
becoming ready. Both are named constants so automated lifecycle tests remain deterministic.
