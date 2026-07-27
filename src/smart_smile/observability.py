from __future__ import annotations

import json
import logging
import sys
import time
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler

from smart_smile.config import LoggingConfig
from smart_smile.errors import StartupError


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "utc": datetime.now(UTC).isoformat(timespec="milliseconds"),
                "monotonic_ns": time.monotonic_ns(),
                "level": record.levelname,
                "event": record.getMessage(),
            },
            separators=(",", ":"),
        )


def configure_logging(config: LoggingConfig) -> logging.Logger:
    try:
        config.directory.mkdir(parents=True, exist_ok=True)
        if not config.directory.is_dir():
            raise NotADirectoryError(config.directory)
        file_handler = RotatingFileHandler(
            config.directory / "smart-smile.log.jsonl",
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
    except OSError as error:
        raise StartupError(
            "LOG_UNUSABLE",
            f"Operational log directory is not writable: {config.directory}",
            "Choose a writable log directory and start again.",
            exit_code=6,
        ) from error

    logger = logging.getLogger("smart_smile")
    for existing_handler in logger.handlers:
        existing_handler.close()
    logger.handlers.clear()
    logger.setLevel(config.level)
    logger.propagate = False

    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    logger.addHandler(console_handler)
    file_handler.setFormatter(JsonFormatter())
    logger.addHandler(file_handler)
    return logger
