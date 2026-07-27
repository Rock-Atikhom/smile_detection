from __future__ import annotations

import sys
from collections.abc import Sequence

from smart_smile.app import run_application
from smart_smile.shell import OpenCvShell


def main(argv: Sequence[str] | None = None) -> int:
    return run_application(
        list(sys.argv[1:] if argv is None else argv),
        shell=OpenCvShell(),
    )


if __name__ == "__main__":
    raise SystemExit(main())
