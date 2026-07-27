Type: prototype
Status: resolved
Blocked by: 08

# Design the overlay experience

## Question

What concrete normal and debug overlays—layout, hierarchy, copy, color, scaling, guide treatment, progress display, Countdown, warnings, and frozen-photo confirmation—remain legible across supported resolutions without obscuring the Participant?

## Answer

Normal mode uses a full-window mirrored preview with four stable regions: a subtle Capture Zone in the center; one short friendly status line in the top-left; Smile Score and Verification progress in a bottom-center gauge; and a large centered Countdown numeral only during `COUNTDOWN`. During `COOLDOWN`, the unmirrored Final Photo is fitted inside the preview with a small confirmation panel and no new Verification begins.

The Capture Zone follows the approved normalized geometry and remains visible without obscuring the Participant. Overlay safe margins are 4% of the viewport. Geometry and text scale from the smaller viewport dimension; at the 640x480 quality floor, status text is at least 18 px, the Countdown numeral at least 72 px, and gauge text at least 16 px. Text is antialiased and uses high-contrast backgrounds.

Use redundant visual semantics: neutral white, eligible green, warning amber, and invalid red paired with text and/or icons. Warnings do not flash faster than twice per second. The normal status line is non-technical and maps from state reason codes. Guidance priority is fatal/camera unavailable; multiple faces; hard darkness; face position or size; Face Continuity; Smile Score; hold-steady/image quality; then processing, retry, or success.

Debug mode preserves the normal composition and adds a semi-transparent right-side diagnostics panel capped at 28% of viewport width. It shows state and reason code; raw and smoothed Smile Score; thresholds and Grace Window; face count, Capture Zone, Face Continuity, and bounds; luma, sharpness, enhancement and candidate status; delivered resolution, backend and measured FPS; frame age, queue replacements, stale-result count, generation, and recent transitions. Face boxes and anchor points use thin outlines over the preview. Toggling diagnostics does not change capture state.

The throwaway storyboard is [overlay_storyboard.html](../prototypes/overlay_storyboard.html). Run `python3 -m http.server 8000 --directory .scratch/smart-smile-mvp/prototypes` and open `overlay_storyboard.html?variant=normal`, `debug`, `warning`, `countdown`, or `cooldown` to inspect the approved variants. It is retained as a local scratch artifact because this project has no Git repository or throwaway branch.

## Comments

- Approved by the user: normal-mode hierarchy, Capture Zone treatment, progress/gauge placement, Countdown treatment, and frozen-photo confirmation.
- Approved by the user: debug panel contents, placement, scaling, and non-interference with capture state.
- Approved by the user: guidance priority, short non-technical copy, redundant color/icon/text semantics, and flashing limit.
- Approved by the user: responsive scaling, safe margins, minimum sizes, high contrast, and unmirrored Cooldown presentation.
