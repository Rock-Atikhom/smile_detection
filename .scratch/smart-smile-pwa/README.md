Status: approved

# Smart Smile Responsive PWA Planning Pack

This planning pack converts the approved product direction into the implementation contract. The user approved it on 2026-07-30.

## Recommended direction

Build one privacy-first, responsive Progressive Web App that runs in:

- production at a public HTTPS URL;
- local development on localhost and as a locally served production build;
- current mobile browsers on iPhone and Android, with optional home-screen installation.

This is the best MVP interpretation of “web, local, and mobile.” It avoids three separate products while preserving one codebase, one behavior contract, and one validation surface.

## Review order

1. [Product requirements](prd.md)
2. [Runtime architecture](architecture.md)
3. [Responsive UX specification](ux-spec.md)
4. [Ordered delivery map](map.md)
5. [Proposed implementation tickets](issues/)

## Transition from the Python MVP

- Completed desktop tickets 01 and 02 remain valid reference work.
- Unimplemented desktop tickets 03 through 14 are paused, not deleted.
- New feature development moves to the PWA after this planning pack is approved.
- The Python app remains under apps/desktop-reference during parity work.
- After PWA acceptance, the team makes an explicit archive decision; no code is silently discarded.

## Approval gate

The planning pack is approved. Ticket 01 is ready-for-agent; later tickets remain planned until their blockers are complete.
