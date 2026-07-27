"""THROWAWAY PROTOTYPE — inspect Capture Zone and anonymous continuity rules."""

from __future__ import annotations

from dataclasses import dataclass
from math import hypot, log


ZONE = (0.20, 0.12, 0.80, 0.82)
ELIGIBLE_ZONE = (0.23, 0.16, 0.77, 0.78)
BOUNDARY_TOLERANCE = 0.03
MIN_WIDTH, MIN_HEIGHT = 0.18, 0.30
MAX_HEIGHT = 0.80
MATCH_CENTER = 0.15
MIN_SCALE, MAX_SCALE = 0.67, 1.50
MATCH_SHAPE = 0.12
TRACK_ALPHA = 0.25
WARMUP_MATCHES = 3
INVALID_GRACE_MS = 300


@dataclass
class Face:
    cx: float
    cy: float
    width: float
    height: float
    shape: float


def eligible(face: Face) -> bool:
    return (
        ELIGIBLE_ZONE[0] - BOUNDARY_TOLERANCE <= face.cx <= ELIGIBLE_ZONE[2] + BOUNDARY_TOLERANCE
        and ELIGIBLE_ZONE[1] - BOUNDARY_TOLERANCE <= face.cy <= ELIGIBLE_ZONE[3] + BOUNDARY_TOLERANCE
        and MIN_WIDTH <= face.width
        and MIN_HEIGHT <= face.height <= MAX_HEIGHT
    )


def matches(previous: Face, current: Face) -> bool:
    center_delta = hypot(current.cx - previous.cx, current.cy - previous.cy)
    scale_ratio = current.height / previous.height
    shape_delta = abs(current.shape - previous.shape)
    return (
        center_delta <= MATCH_CENTER
        and MIN_SCALE <= scale_ratio <= MAX_SCALE
        and shape_delta <= MATCH_SHAPE
    )


def adapt(previous: Face, current: Face) -> Face:
    blend = lambda old, new: (1.0 - TRACK_ALPHA) * old + TRACK_ALPHA * new
    return Face(
        blend(previous.cx, current.cx),
        blend(previous.cy, current.cy),
        blend(previous.width, current.width),
        blend(previous.height, current.height),
        blend(previous.shape, current.shape),
    )


sequence = [
    (0, [Face(0.50, 0.48, 0.26, 0.42, 0.50)]),
    (50, [Face(0.52, 0.48, 0.26, 0.42, 0.51)]),
    (100, [Face(0.55, 0.49, 0.27, 0.43, 0.52)]),
    (150, [Face(0.58, 0.50, 0.27, 0.44, 0.53)]),
    (200, []),
    (250, [Face(0.60, 0.51, 0.28, 0.45, 0.54)]),
    (300, [Face(0.87, 0.51, 0.28, 0.45, 0.86)]),
    (650, [Face(0.87, 0.51, 0.28, 0.45, 0.86)]),
]

reference = None
matches_seen = 0
invalid_since = None

for timestamp, faces in sequence:
    if len(faces) != 1:
        matches_seen = 0
        if invalid_since is None:
            invalid_since = timestamp
        continuity = "invalid (no face or multiple faces)"
    elif reference is None:
        reference = faces[0]
        matches_seen = 1
        invalid_since = None
        continuity = "candidate track"
    elif matches(reference, faces[0]):
        reference = adapt(reference, faces[0])
        matches_seen += 1
        invalid_since = None
        continuity = "match"
    else:
        if invalid_since is None:
            invalid_since = timestamp
        matches_seen = 0
        continuity = "invalid (non-matching face)"

    warm = matches_seen >= WARMUP_MATCHES
    if invalid_since is not None and timestamp - invalid_since > INVALID_GRACE_MS:
        reference = None
        matches_seen = 0
        warm = False
        continuity += "; track expired"

    print(
        f"t={timestamp:>3}ms faces={len(faces)} eligible="
        f"{len(faces) == 1 and eligible(faces[0])} continuity={continuity} "
        f"matches={matches_seen} verification_ready={warm}"
    )
