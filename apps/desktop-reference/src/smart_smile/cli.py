from __future__ import annotations

import sys
from collections.abc import Sequence

from smart_smile.app import run_application


def main(argv: Sequence[str] | None = None) -> int:
    return run_application(list(sys.argv[1:] if argv is None else argv))


if __name__ == "__main__":
    raise SystemExit(main())
