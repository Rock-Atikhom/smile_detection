Type: grilling
Status: resolved

# Decide the macOS hardware support boundary

## Question

Given that the current supported MediaPipe release publishes an Apple Silicon macOS wheel but no Intel macOS wheel, should the MVP explicitly support only Apple Silicon on macOS 11+, or expand scope to investigate and maintain an older MediaPipe release, unsupported source build, or alternate detection engine for Intel Macs?

## Answer

The MVP supports macOS 11 or later on Apple Silicon (ARM64) only. Intel macOS is explicitly out of scope, including operation through Rosetta, an older MediaPipe release, an unsupported MediaPipe source build, or a second detection engine maintained solely for Intel compatibility.

The managed macOS environment, dependency lock, installation checks, native smoke tests, camera validation, and acceptance claims therefore target ARM64 only. Startup and setup guidance must describe the architecture boundary clearly rather than allowing an Intel installation failure to look like an unexplained dependency error.

This keeps the release and validation surface aligned with the current supported MediaPipe wheel, avoids a legacy compatibility branch, and preserves the conservative dependency baseline. If Intel macOS becomes a future requirement, it must begin as a separate compatibility investigation that re-evaluates the vision stack and its full test burden rather than weakening this MVP boundary.

## Comments

- Approved by the user: macOS 11+ on Apple Silicon is the supported macOS boundary; Intel macOS is outside the MVP because supporting it would add disproportionate build, dependency, and validation complexity.
