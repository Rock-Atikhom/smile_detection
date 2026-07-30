Status: approved

# Smart Smile Responsive UX Specification

## 1. Interface decision

Three intentionally different concepts were compared:

| Concept | Defining idea | Strongest quality | Main risk |
| --- | --- | --- | --- |
| Live Lens | immersive, camera-first surface | quickest and most natural framing | guidance can be hidden or lose contrast |
| Calm Coach | instruction-first, accessibility-led flow | clearest semantics and most equitable path | can feel less visually immersive |
| Quiet Camera, Observable System | participant mode plus read-only diagnostics | best for demos, QA, and support | technical affordance can distract |

### Selected synthesis

Use Live Lens for the visual hierarchy, Calm Coach for interaction and accessibility, and the read-only diagnostics drawer from Quiet Camera.

The result is a camera-dominant single screen with:

- one plain-language instruction at a time;
- a visible but secondary manual shutter;
- privacy before permission;
- a semantic coach card that never relies on the overlay;
- read-only diagnostics hidden behind “Help & system status”;
- a stable review surface with Download, conditional Share, and Retake.

This is preferred over adopting any concept unchanged because it preserves the immediacy of a camera product without making the camera overlay the only accessible source of truth.

## 2. Experience principles

1. One next action. Show the highest-priority, most actionable instruction.
2. Camera first, meaning second. The preview is visually dominant; semantic text explains every important state.
3. Private by construction. Explain local processing before permission and never suggest cloud saving.
4. Automatic, not compulsory. Auto capture is primary; manual capture provides an equitable route.
5. Calm, not gamified. Avoid stars, streaks, celebration confetti, clinical scores, or judgment.
6. Honest degradation. Slower devices receive adapted cadence or manual mode, never weaker smile rules.
7. Recover in place. Ordinary face, light, and position changes do not open modals.
8. Diagnostics observe. Operator information never changes calibrated thresholds in production.
9. No surprise retention. Review explains that the photo exists only in the current page.

## 3. Information architecture

Always available in the capture shell:

- Smart Smile identity;
- current privacy/runtime status when useful;
- contained camera preview;
- Capture Zone;
- primary coach message;
- auto-capture state and progress;
- manual shutter;
- camera switch when available;
- Help & system status.

Progressively disclosed:

- privacy details;
- camera choice;
- capture assistance, including prefer-manual mode;
- complete quality checklist;
- offline/update status;
- read-only diagnostics;
- privacy-safe report preview.

Review replaces the live camera stage with the selected photo but preserves shell geometry and action order.

## 4. State and copy contract

| State | Heading | Supporting copy | Primary action |
| --- | --- | --- | --- |
| Compatibility check | Checking this device | Making sure camera and on-device smile detection are available. | none |
| Unsupported | This browser is not supported yet | Open Smart Smile in the latest Chrome, Edge, or Safari. | View help |
| Privacy introduction | Take a smile photo privately | Camera and smile detection run on this device. No camera image or photo is uploaded. | Continue to camera |
| Permission pending | Allow camera access | Your browser will ask to use the camera. Microphone access is not needed. | Allow camera |
| Permission denied | Camera access is off | Allow camera access in browser or device settings, then return here. | Try again |
| Camera starting | Starting the camera | This may take a moment. | Cancel |
| Model loading | Getting smile detection ready | Required files are verified and stay on this device for offline use. | Cancel |
| Warm-up | Getting ready | Hold the device steady while the camera settles. | Cancel |
| No face | Move into the frame | Place one face inside the guide. | manual shutter, blocked |
| Multiple faces | One person at a time | Ask others to step outside the camera view. | manual shutter, blocked |
| Too far | Move a little closer | Keep your full face inside the guide. | manual shutter, blocked |
| Too close | Move a little farther away | Keep your full face inside the guide. | manual shutter, blocked |
| Off-center | Center your face | Follow the arrow from your mirrored view. | manual shutter, blocked |
| Low light | Find brighter, even light | Face a window or a soft light source. | manual shutter, blocked |
| Unstable | Hold still | Keep the camera and your face steady. | manual shutter, blocked |
| Ready | Framing looks good | Smile when you are ready, or use the shutter. | manual shutter |
| Verifying | Keep smiling | Hold your expression while the ring completes. | Cancel |
| Countdown | Photo in 3 | Keep your position and expression. | Cancel |
| Capturing | Hold still | Taking a short set of photos on this device. | Cancel if safe |
| Processing | Choosing the clearest photo | Nothing is uploaded. | none |
| Empty burst | Let’s try that again | No photo met all quality checks. | Try again |
| Review | Keep this photo? | It stays only in this page until you download, share, retake, or leave. | Download |
| Below performance floor | Automatic capture is unavailable here | You can use the shutter when framing, light, and stability are ready. | Use manual capture |
| Camera interrupted | The camera stopped | Start it again to continue. | Restart camera |
| First use offline | Connect once to finish setup | Smart Smile needs its on-device model before it can work offline. | Try again when online |
| Update ready | An update is ready | Finish this photo first. The update can start afterward. | Later |
| Fatal integrity error | Smart Smile could not start safely | A required app or model file did not pass verification. | Reload |

Copy rules:

- Use “we” only for a product action, never to imply a human observer.
- Prefer verbs: move, center, hold, retry, download.
- Never say “failed smile,” “bad face,” “biometric,” or “confidence” in participant mode.
- Avoid unexplained error codes; show codes only in help.
- Avoid exclamation marks and urgency.
- Do not instruct “left” or “right” without an arrow oriented to the mirrored preview.

## 5. Responsive layout

### Mobile portrait: 320–767 CSS px

    ┌──────────────────────────────┐
    │ Smart Smile     Private ●  ↻ │
    ├──────────────────────────────┤
    │                              │
    │      CONTAINED CAMERA        │
    │                              │
    │        ╭──────────╮          │
    │       ╱ FACE GUIDE ╲         │
    │       ╲            ╱         │
    │        ╰──────────╯          │
    │                              │
    ├──────────────────────────────┤
    │ Center your face             │
    │ Follow the arrow in preview. │
    │ Framing · Light · Stability  │
    ├──────────────────────────────┤
    │ [ Take photo manually ]      │
    │ [ Help & system status ]     │
    └──────── safe area ───────────┘

- Single column and portrait first.
- Camera gets the largest available region but uses object-fit contain.
- Coach card follows the preview in DOM order.
- Bottom actions may be sticky only when they do not cover content at 200 percent zoom.
- Use env(safe-area-inset-*) padding.
- Target controls are at least 48 by 48 CSS pixels.

### Mobile landscape and compact tablet: 568–1023 CSS px

    ┌────────────────────────────────────────────┐
    │ Smart Smile              Private ●  ↻     │
    ├───────────────────────────┬────────────────┤
    │                           │ Center your    │
    │      CAMERA PREVIEW       │ face           │
    │                           │                │
    │       FACE GUIDE          │ status details │
    │                           │                │
    │                           │ [Shutter]      │
    │                           │ [Help]         │
    └───────────────────────────┴────────────────┘

- Two columns only when coach text remains at least 18 rem wide.
- If height is limited, controls scroll independently without hiding camera state.
- Orientation change invalidates capture progress and briefly returns to warm-up.

### Desktop and large tablet: 1024 CSS px and above

    ┌──────────────────────────────────────────────────────┐
    │ Smart Smile                 On-device · Privacy Help │
    ├───────────────────────────────┬──────────────────────┤
    │                               │ Center your face     │
    │                               │ Follow the arrow.    │
    │       CONTAINED CAMERA        │                      │
    │                               │ Framing      Check   │
    │         FACE GUIDE            │ Light        Ready   │
    │                               │ Stability    Ready   │
    │                               │                      │
    │                               │ [Manual shutter]     │
    │                               │ [Capture assistance] │
    └───────────────────────────────┴──────────────────────┘

- Camera remains dominant at roughly two thirds of available width.
- Coach panel maximum reading width is 28 rem.
- Do not stretch the entire composition beyond a comfortable camera stage; use a centered max width.
- Diagnostics docks to the right on sufficiently wide screens and becomes an overlay drawer below that breakpoint.

### Review

    ┌──────────────────────────────┐
    │ Your photo                   │
    │ ┌──────────────────────────┐ │
    │ │                          │ │
    │ │      SELECTED PHOTO      │ │
    │ │                          │ │
    │ └──────────────────────────┘ │
    │ Kept only in this page.      │
    │ [ Download ] [ Share ]       │
    │ [ Retake ]                   │
    └──────────────────────────────┘

- Photo uses contain; never crop the result for presentation.
- Download is primary.
- Share is present only when the file capability check passes.
- Retake is visible and does not sit next to Download without adequate spacing.
- Browser back, refresh, or close uses the clearest feasible warning but does not claim guaranteed interception.

## 6. Camera overlay

The overlay is assistive, not diagnostic:

- rounded portrait-shaped guide with four corner accents;
- no dense landmark mesh, face rectangle, confidence label, or tracking dots;
- mirrored directional arrow;
- progress ring outside the guide;
- countdown numeral centered without covering eyes;
- solid or strongly opaque scrim behind text.

Overlay coordinate transform:

1. Start with decoded source dimensions and orientation.
2. Compute the contain scale into the displayed video rectangle.
3. Center letterbox offsets.
4. Mirror x only for preview coordinates.
5. Apply safe-area and stage offsets.
6. Use the same transform for guide and direction calculations.
7. Keep source/capture pixels unmirrored unless output policy explicitly changes.

Recompute on resize, orientation change, track settings change, or video dimension change. Any reconstruction increments generation and cancels active progress.

## 7. Interaction details

### Privacy and permission

- The Continue to camera button is the user gesture that begins permission.
- Never ask on initial page load.
- Do not repeatedly trigger permission after denial.
- Privacy details open a nonblocking disclosure with short data-flow bullets.

### Camera switch

- Show only if more than one usable input exists or the platform supports facing-mode switching.
- Label with text in the accessible name, not only a rotate-camera icon.
- On activation: announce “Switching camera,” cancel progress, warm up, then announce readiness.

### Automatic capture

- Participant sees qualitative progress and elapsed hold language, not raw blendshape scores.
- Brief invalidity pauses progress; longer invalidity resets with one reason.
- Countdown always has Cancel and cancels automatically when a gate fails.
- No sound is required. Optional tone/haptic settings are future enhancements.

### Manual capture

- Label: Take photo manually.
- It is discoverable after camera readiness.
- If blocked, keep it focusable and expose an adjacent reason rather than using an unexplained disabled control.
- Activating it bypasses sustained smile verification only.
- Prefer manual capture in Capture assistance disables automatic countdown for the current session.

### Diagnostics

Entry label: Help & system status.

Mobile: bottom sheet with compact health summary, expandable to at most about 70 percent viewport height.

Desktop: overlay drawer; dock only at large widths.

Views:

1. Status: camera facing mode, delivered resolution, permission, worker, model hash status, online/offline, cache readiness, generation.
2. Performance: tier, accepted FPS, average/p95 end-to-end latency, replacements, stale results, automatic-capture availability.
3. Events: stable state transitions and recovery reasons.
4. Report: preview allowlisted text, then Copy or Download report.

No production threshold editing. Closing restores focus to the trigger and does not reset the session.

## 8. Accessibility contract

- Target WCAG 2.2 AA.
- Normal text contrast at least 4.5:1; large text, meaningful icons, component boundaries, and focus indicators at least 3:1.
- No status relies on color alone.
- Semantic page landmarks, headings, buttons, progress elements, status, and alert roles.
- Canvas and video overlay are aria-hidden; text carries equivalent meaning.
- One polite live region announces stable changes only.
- Countdown start and blocking errors may use an assertive message once.
- Do not announce scores, frames, coordinates, or every guidance fluctuation.
- Visible focus with at least 2 CSS-pixel equivalent perimeter and no clipping.
- DOM order matches visual order.
- Escape closes nonessential drawers and cancels countdown; standard Enter and Space behavior is preserved.
- Focus moves to review or a blocking recovery heading; ordinary coaching never steals focus.
- Modal disclosures trap and restore focus; the diagnostics drawer uses appropriate dialog or complementary semantics based on layout.
- Support browser zoom to 200 percent and reflow at 400 percent without two-dimensional page scrolling.
- Controls remain reachable with touch, keyboard, switch, VoiceOver, and TalkBack.
- Respect prefers-reduced-motion: no pulsing, zooming, parallax, flashing, or animated guide rings.
- If motion is allowed, transitions are subtle crossfades under 200 ms; warnings never flash.
- Use text-first status and avoid dependence on facial-expression ability through the manual path.
- Real-device acceptance includes VoiceOver on iPhone and macOS, TalkBack on Android, and keyboard-only Windows.

## 9. Visual system

### Character

Calm, trustworthy, contemporary, and warm. The product should feel like a private camera assistant, not a medical scanner or social-media filter.

### Tokens

| Token | Proposed value | Use |
| --- | --- | --- |
| canvas | #F5F7F6 | light page background |
| camera surround | #101615 | high-contrast camera stage |
| surface | #FFFFFF | coach and review cards |
| text strong | #17211F | headings |
| text muted | #52615D | supporting copy |
| action | #0D766E | primary action |
| action hover | #095F59 | hover/pressed |
| ready | #16856D | ready status with icon/text |
| guidance | #9A6400 | correctable guidance |
| danger | #B42318 | blocking error |
| focus | #6D5CE7 | focus ring distinct from status |

All proposed combinations require automated and manual contrast verification before implementation acceptance.

### Typography

- Use a self-hosted system-oriented sans stack; avoid third-party font requests.
- Body minimum 16 CSS px.
- Coach heading 22–28 CSS px responsive.
- Countdown 64–112 CSS px responsive.
- Line length 45–70 characters in instruction panels.
- Use tabular numerals for countdown and diagnostic metrics.

### Shape and spacing

- 8 px base spacing system.
- 12–16 px control radius; cards 20–24 px; do not make every element pill-shaped.
- Buttons have clear hierarchy: filled primary, outlined secondary, text tertiary.
- Camera stage radius may reduce on compact mobile to maximize usable area.
- Shadows are subtle and never required to understand boundaries.

## 10. Motion and feedback

- State changes: 120–180 ms opacity transition.
- Guide correction: static arrow plus message; no bouncing.
- Verification: ring fills smoothly only when motion is allowed; reduced motion uses discrete progress text.
- Countdown: numeral replacement; optional very slight scale when motion is allowed.
- Capture: brief opaque flash only when not reduced-motion and never more than once.
- Processing: indeterminate bar or spinner with text, not a fake percentage.
- Success: transition to review; no confetti.

## 11. Error recovery behavior

- Face, position, smile, light, and stability are inline coach states.
- Permission, unsupported browser, first-use offline, and integrity failures use focused recovery screens.
- Camera interruption keeps shell context and offers Restart camera.
- A failed camera switch attempts to retain or restore the previous stream.
- Share failure never destroys the photo.
- A failed cache update keeps the current complete version.
- A worker restart is bounded and visible in diagnostics; repeated failure becomes a focused error.
- Every error has one primary recovery action and optional help.

## 12. Component inventory

- AppShell
- BrandHeader
- PrivacyIntroduction
- CameraStage
- VideoSurface
- CaptureZoneOverlay
- CoachCard
- StatusChecklist
- VerificationProgress
- CountdownOverlay
- CameraSwitch
- ManualShutter
- CaptureAssistance
- ProcessingState
- ReviewStage
- DownloadAction
- ConditionalShareAction
- RetakeAction
- RecoveryPanel
- OfflineUpdateNotice
- DiagnosticsDrawer
- HealthSummary
- PerformanceSummary
- EventTimeline
- ReportPreview

Radix primitives are appropriate for dialogs, disclosures, tabs, and accessible focus behavior. Camera, coach, progress, and review components remain custom because their semantics and geometry are product-specific.

## 13. UX acceptance scenarios

At minimum, approved visual and semantic fixtures cover:

1. privacy introduction;
2. permission denial and recovery;
3. camera/model warm-up;
4. portrait no-face guidance;
5. landscape off-center guidance;
6. multiple faces;
7. low light;
8. ready;
9. automatic verification and Grace Window pause;
10. countdown and cancellation;
11. below-floor manual mode;
12. processing;
13. empty-burst retry;
14. review with Share;
15. review without Share;
16. diagnostics compact and expanded;
17. first-use offline;
18. update deferred;
19. camera interruption;
20. fatal integrity error;
21. 200 and 400 percent zoom;
22. reduced motion;
23. keyboard-only;
24. VoiceOver and TalkBack announcements.

## 14. Open validation obligations

The direction is decided; implementation must still validate:

- the exact mobile viewport behavior around Safari and Chrome browser chrome;
- readable scrim opacity against extreme camera backgrounds;
- VoiceOver/TalkBack announcement timing;
- whether ImageCapture output visually matches the contained preview;
- touch comfort with one-handed use;
- manager acceptance of the desktop/mobile release-device matrix;
- Thai and English localization in a later scoped ticket if required.
