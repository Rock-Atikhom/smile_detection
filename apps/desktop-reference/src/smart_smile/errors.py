from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StartupError(Exception):
    code: str
    message: str
    hint: str
    exit_code: int = 2

    def __str__(self) -> str:
        return f"{self.code}: {self.message} Hint: {self.hint}"
