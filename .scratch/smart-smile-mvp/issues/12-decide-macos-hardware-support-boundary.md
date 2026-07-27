Type: grilling
Status: resolved

# Decide the macOS hardware support boundary

## Question

Given the architecture and minimum-OS tags of the selected MediaPipe and OpenCV wheels, should the MVP explicitly support only Apple Silicon on their combined macOS floor, or expand scope to investigate older releases, unsupported source builds, or alternate detection engines?

## Answer

The MVP supports macOS 13 or later on Apple Silicon (ARM64) only. MediaPipe itself publishes a macOS 11 ARM64 wheel, but the selected `opencv-contrib-python==4.11.0.86` ARM64 wheel is tagged `macosx_13_0_arm64`, making macOS 13 the combined install floor. Intel macOS is explicitly out of scope, including Rosetta, older dependency lines, unsupported source builds, or a second detection engine maintained solely for Intel compatibility.

The managed macOS environment, dependency lock, installation checks, native smoke tests, camera validation, and acceptance claims therefore target ARM64 only. Startup and setup guidance must describe the architecture boundary clearly rather than allowing an Intel installation failure to look like an unexplained dependency error.

This keeps the release and validation surface aligned with the current supported MediaPipe wheel, avoids a legacy compatibility branch, and preserves the conservative dependency baseline. If Intel macOS becomes a future requirement, it must begin as a separate compatibility investigation that re-evaluates the vision stack and its full test burden rather than weakening this MVP boundary.

## Comments

- Initially approved: macOS 11+ on Apple Silicon with Intel macOS outside the MVP.
- Reconciled during implementation: the exact approved OpenCV 4.11 ARM64 wheel raises the combined supported boundary to macOS 13+. This retains the selected dependency baseline and supports the target macOS 26 MacBook without making a false macOS 11/12 claim.
