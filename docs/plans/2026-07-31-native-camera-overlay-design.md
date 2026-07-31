# Native Camera Overlay UX Design

- **Status:** Approved
- **Approved:** 2026-07-31
- **Applies to:** Smart Smile responsive web camera session
- **Primary user:** Staff or operators who need fast, dependable camera controls

## Context

The Ticket 02 camera session works on the target MacBook and phone. The phone review
also confirmed that one press now switches between front and rear facing modes.
However, the first responsive control layout was not comfortable or visually clear
enough on a phone.

This design improves the active-session interface without changing the working camera
domain, stream ownership, generation counter, interruption recovery, privacy boundary,
or one-tap facing-mode switch.

## Goals

- Make the live session feel like a familiar native phone camera.
- Keep the camera preview visually dominant.
- Keep current status, Stop, Switch camera, and Help immediately reachable.
- Make controls legible over bright, dark, or visually busy camera frames.
- Work in mobile portrait, mobile landscape, tablet, and desktop browsers.
- Preserve touch, keyboard, screen-reader, zoom, reduced-motion, and safe-area access.
- Keep technical diagnostics out of the primary operator workflow.

## Non-goals

- Smile inference, scoring, automatic capture, or photo review.
- Changes to camera constraints, selection, switching, or recovery logic.
- New telemetry, analytics, persistence, uploads, or media storage.
- Editable production thresholds or other operator configuration.
- A native iOS or Android application.

## Considered directions

| Direction               | Strength                                          | Cost                                          | Decision     |
| ----------------------- | ------------------------------------------------- | --------------------------------------------- | ------------ |
| Operator camera console | Stable controls outside the preview               | Less immersive and uses more vertical space   | Not selected |
| Native camera overlay   | Maximum preview area and familiar camera behavior | Requires deliberate contrast protection       | **Selected** |
| Split control deck      | Most room for explanatory guidance                | Smaller preview and slower repeated operation | Not selected |

The user selected the Native Camera Overlay and approved its refined high-contrast
control treatment.

## Experience model

### Before permission

The approved privacy introduction remains a normal document surface. Camera permission
is requested only after the user selects **Continue to camera**. The application never
requests a microphone.

### Active session

The camera stage becomes the dominant viewport surface. It contains:

1. A compact Smart Smile identity at the safe top edge.
2. A Help button at the opposite safe top edge.
3. An aria-hidden face guide centered over the preview.
4. A short semantic status pill immediately above the controls.
5. An always-visible bottom control dock containing Stop and Switch camera.

No technical metrics, device names, lifecycle history, or raw browser errors appear in
the active surface.

### Help and diagnostics

Help opens the existing read-only diagnostics as a mobile bottom sheet or desktop
drawer. Closing it restores focus to Help and does not reset or reconstruct the camera
session.

### Stopped and recovery states

Stopping the session releases the owned tracks and replaces the live stage with the
approved stopped state and restart action. Permission, interruption, unavailable-camera,
and switch-recovery messages remain plain-language semantic content. A failed switch
must retain or restore the previous stream according to the existing camera contract.

## Layout

### Mobile portrait

- The live surface uses the available dynamic viewport height and safe-area padding.
- The video fills the camera stage while retaining `object-fit: contain`; source pixels
  are never cropped or mirrored for capture semantics.
- Smart Smile and Help sit inside a protected top overlay.
- Status sits above the bottom dock so it is visible but does not compete with actions.
- The bottom dock uses two columns: Stop is secondary; Switch camera is primary.
- Both controls remain at least 48 by 48 CSS pixels.
- The dock clears `env(safe-area-inset-bottom)` and supports one-handed use.

### Mobile landscape and short viewports

- Top controls remain inside safe left, right, and top insets.
- The control dock stays at the lower safe edge when sufficient height exists.
- When the viewport is too short to preserve readable status and controls, the layout
  reflows into a camera-and-controls split rather than hiding or overlapping actions.
- Orientation reconstruction keeps the existing generation and warm-up contract.

### Tablet and desktop

- The camera remains the dominant centered stage with a reasonable maximum size.
- The same overlay hierarchy and action order are preserved.
- Controls do not expand into oversized desktop buttons.
- Help opens as a drawer when enough width exists.

### Browser zoom and reflow

- At 200 percent zoom, all actions remain visible and operable without horizontal
  scrolling.
- At 400 percent zoom or an equivalently constrained viewport, status and actions leave
  absolute overlay positioning and enter normal document flow below the preview.
- The visual treatment may become less immersive during this accessibility fallback,
  but no content or functionality is lost.

## Visual treatment

- Camera surround: `#101615`.
- Text and controls over video use a dark, strongly translucent scrim with backdrop
  blur as enhancement, not as the only source of contrast.
- Switch camera uses the light primary treatment with dark green text.
- Stop uses a restrained danger treatment and is never communicated by color alone.
- Status includes a text label and state icon; color is redundant.
- The face guide is subtle, aria-hidden, and never displays landmarks or tracking
  geometry.
- Shapes follow the existing 8-pixel spacing system, 12–16-pixel control radii, and
  20–24-pixel dock radius.
- Motion is limited to subtle state crossfades under 200 milliseconds and is removed
  under `prefers-reduced-motion`.

Exact scrim opacity and text/control color combinations must pass WCAG 2.2 AA contrast
checks against representative light and dark frames before acceptance.

## Content hierarchy

The active session shows only:

- product identity;
- Help;
- one current camera status;
- Stop;
- Switch camera when switching is supported.

Approved active-state labels include:

| State           | Status text              | Available actions                  |
| --------------- | ------------------------ | ---------------------------------- |
| Starting        | Starting the camera      | Stop                               |
| Warm-up         | Getting ready            | Stop, Switch camera when supported |
| Ready           | Camera ready             | Stop, Switch camera when supported |
| Switching       | Switching camera         | Stop; Switch is busy               |
| Interrupted     | The camera stopped       | Restart camera, Help               |
| Switch recovery | Could not switch cameras | Retry switch, Stop, Help           |
| Stopped         | Camera is off            | Restart camera, Help               |

The status pill uses `role="status"` with polite announcements for stable state changes.
Blocking recovery headings use focused semantic content. Rapid camera lifecycle events
are not repeatedly announced.

## Interaction contract

### Switch camera

- One activation performs one semantic facing-mode toggle on mobile:
  `user → environment → user`.
- The visual control never requires an extra confirmation press.
- While switching, the control is busy and protected from duplicate activation.
- The accessible name remains **Switch camera**; the icon is decorative.
- Switching preserves the existing generation, warm-up, stale-result, stream-release,
  and interruption-recovery rules.

### Stop

- Stop is always visible while a session owns or is acquiring a stream.
- One activation intentionally closes the session and stops every owned track.
- It does not open a confirmation dialog because no photo or persistent work exists in
  this ticket.

### Help

- Help is a labeled 48-pixel target, even if its compact visual is icon-forward.
- It opens without pausing, restarting, or otherwise changing camera state.
- The diagnostics surface remains read-only, bounded, in-memory, and allowlisted.

## Accessibility

- Target WCAG 2.2 AA.
- Normal text contrast is at least 4.5:1; controls, focus indicators, and meaningful
  graphics are at least 3:1.
- Semantic reading order is identity, Help, status, Stop, Switch camera. Keyboard focus
  visits Help, Stop, and Switch camera in that order.
- Video and decorative overlay geometry are hidden from assistive technology.
- Status is real DOM text, not painted into canvas or encoded only visually.
- Controls work with touch, keyboard, VoiceOver, TalkBack, and switch input.
- Focus indicators are visible over every camera background.
- No status depends on color, motion, or sound.
- Reduced motion disables nonessential transitions.

## Component impact

Presentation changes are limited to the active camera experience:

- `CameraStage` owns the full-stage responsive composition.
- `SessionChrome` provides safe top and bottom overlay regions.
- `CameraStatus` renders the single semantic status.
- `CameraControls` renders Stop and conditional Switch camera.
- `HelpAndSystemStatus` retains its existing disclosure and diagnostics behavior.

The component names describe responsibilities; implementation may preserve existing
component boundaries when that avoids unnecessary refactoring.

The camera session/controller remains the only owner of:

- media acquisition and release;
- mobile facing-mode toggles;
- desktop device selection;
- camera generations;
- warm-up timing;
- interruption and visibility recovery;
- privacy-safe lifecycle diagnostics.

CSS and React presentation code must not reproduce or reinterpret that domain logic.

## Verification

Automated coverage must prove:

- the active status and controls appear over the live camera stage;
- Switch camera remains conditional and performs exactly one controller action;
- Stop remains reachable and stops the session;
- Help remains reachable and does not change the active generation;
- busy switching prevents duplicate activation without requiring a second press;
- portrait, landscape, tablet, and desktop fixtures have no hidden controls or
  horizontal overflow;
- safe-area padding is applied;
- the short-height and 400-percent reflow fallback exposes all semantic content;
- keyboard order, accessible names, status semantics, reduced motion, and contrast
  tokens satisfy the approved contract;
- existing camera lifecycle, privacy, zero-storage, and zero-application-network tests
  remain green.

Manual acceptance must cover:

1. iPhone or Android phone in portrait and landscape.
2. One-tap front/rear/front switching.
3. Bright and dark camera backgrounds.
4. Stop, Restart, and Help.
5. One-handed touch comfort.
6. VoiceOver or TalkBack announcements.
7. MacBook responsive and keyboard behavior.

## Delivery boundary

This design is an approved UX amendment for Ticket 02. Implementation must be a
presentation-only change except for UI-facing busy/disabled state already exposed by
the camera controller. Any discovered need to modify stream ownership, facing-mode
selection, generation behavior, privacy guarantees, or diagnostics contents requires
separate technical review before changing the proven camera behavior.
