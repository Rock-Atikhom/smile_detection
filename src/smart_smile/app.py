from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Never, Protocol

from smart_smile.config import ApplicationConfig, load_config
from smart_smile.errors import StartupError
from smart_smile.observability import configure_logging
from smart_smile.runtime import validate_runtime, validate_startup


@dataclass(frozen=True)
class ApplicationContext:
    config: ApplicationConfig


class ApplicationShell(Protocol):
    def run(self, context: ApplicationContext) -> None: ...


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> Never:
        raise StartupError(
            "CONFIG_INVALID",
            f"Invalid command line: {message}",
            "Use --help and provide an accepted value.",
        )


def _arguments(argv: Sequence[str]) -> argparse.Namespace:
    parser = SafeArgumentParser(prog="smart-smile")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--camera", type=int)
    parser.add_argument("--debug", action="store_true")
    return parser.parse_args(argv)


def _default_shell() -> ApplicationShell:
    try:
        from smart_smile.shell import OpenCvShell

        return OpenCvShell()
    except Exception as error:
        raise StartupError(
            "DEPENDENCY_IMPORT",
            "The desktop shell dependencies could not be imported",
            "Restore the locked project environment.",
            exit_code=5,
        ) from error


def run_application(
    argv: Sequence[str],
    *,
    shell: ApplicationShell | None = None,
) -> int:
    try:
        args = _arguments(argv)
        config = load_config(
            args.config,
            camera_override=args.camera,
            debug_override=args.debug,
        )
        validate_runtime()
        validate_startup(config)
        logger = configure_logging(config.logging)
        logger.info("startup_validated")
        active_shell = shell if shell is not None else _default_shell()
        try:
            active_shell.run(ApplicationContext(config=config))
        except KeyboardInterrupt:
            logger.info("exit_requested")
            return 130
        return 0
    except StartupError as error:
        print(error, file=sys.stderr)
        return error.exit_code
