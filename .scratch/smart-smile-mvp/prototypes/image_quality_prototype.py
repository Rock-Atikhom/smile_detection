"""THROWAWAY PROTOTYPE — inspect image Quality Gates and burst ranking."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Candidate:
    name: str
    y10: float
    y50: float
    y90: float
    sharpness: float
    smile: float
    face_ok: bool = True


def quality_plan(candidate: Candidate) -> str:
    if candidate.y50 < 32 or candidate.y10 < 8:
        return "reject: hard darkness"
    plan = []
    if candidate.y50 < 60:
        plan.append(f"gamma={min(1.35, 60 / max(candidate.y50, 1)):.2f}")
    if candidate.y90 - candidate.y10 < 45:
        plan.append("CLAHE=clip1.5/tile8")
    plan.append("bilateral=d5/sigma25/25")
    return ", ".join(plan)


def valid(candidate: Candidate) -> bool:
    return candidate.face_ok and candidate.y50 >= 32 and candidate.y10 >= 8 and candidate.sharpness >= 80


candidates = [
    Candidate("dark", 4, 22, 55, 210, 0.72),
    Candidate("soft", 30, 54, 120, 65, 0.76),
    Candidate("sharp-dim", 14, 48, 80, 150, 0.68),
    Candidate("sharp-natural", 30, 110, 195, 170, 0.64),
    Candidate("sharpest-smile", 28, 108, 190, 170, 0.71),
]

for candidate in candidates:
    print(
        f"{candidate.name:>15}: valid={valid(candidate)} "
        f"sharpness={candidate.sharpness:>3.0f} smile={candidate.smile:.2f} "
        f"plan={quality_plan(candidate)}"
    )

valid_candidates = [candidate for candidate in candidates if valid(candidate)]
winner = max(valid_candidates, key=lambda c: (c.sharpness, c.smile, -abs(c.y50 - 110)))
print(f"winner: {winner.name}")
