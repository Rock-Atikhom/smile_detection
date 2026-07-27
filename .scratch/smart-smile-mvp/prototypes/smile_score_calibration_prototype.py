"""THROWAWAY PROTOTYPE — inspect Smile Score smoothing and hysteresis."""

from __future__ import annotations

from dataclasses import dataclass


ALPHA = 0.35
HIGH = 0.60
LOW = 0.45


def smile_score(left: float, right: float) -> float:
    mean = (left + right) / 2.0
    return max(0.0, min(1.0, 0.6 * min(left, right) + 0.4 * mean))


@dataclass
class Hysteresis:
    smoothed: float = 0.0
    smiling: bool = False

    def update(self, raw: float) -> tuple[float, bool]:
        self.smoothed = ALPHA * raw + (1.0 - ALPHA) * self.smoothed
        if not self.smiling and self.smoothed >= HIGH:
            self.smiling = True
        elif self.smiling and self.smoothed < LOW:
            self.smiling = False
        return self.smoothed, self.smiling


SCENARIOS = {
    "balanced ramp": [(v, v) for v in (0.10, 0.25, 0.40, 0.55, 0.70, 0.82)],
    "asymmetric smile": [(0.78, 0.38), (0.80, 0.42), (0.82, 0.50), (0.82, 0.62)],
    "noisy boundary": [(0.56, 0.56), (0.63, 0.61), (0.57, 0.59), (0.62, 0.64), (0.43, 0.44)],
    "neutral": [(0.08, 0.10), (0.14, 0.12), (0.18, 0.16)],
}


for name, samples in SCENARIOS.items():
    print(f"\n{name} (alpha={ALPHA:.2f}, high={HIGH:.2f}, low={LOW:.2f})")
    state = Hysteresis()
    for index, (left, right) in enumerate(samples, start=1):
        raw = smile_score(left, right)
        smoothed, smiling = state.update(raw)
        print(
            f"  {index}: left={left:.2f} right={right:.2f} "
            f"raw={raw:.3f} smoothed={smoothed:.3f} smiling={smiling}"
        )
