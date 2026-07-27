from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import logging
import os
import sys
import tempfile
import tomllib
from collections.abc import Sequence
from dataclasses import dataclass
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class CameraConfig:
    index: int


@dataclass(frozen=True)
class VisionConfig:
    model_path: Path
    model_sha256: str


@dataclass(frozen=True)
class StorageConfig:
    output_dir: Path


@dataclass(frozen=True)
class LoggingConfig:
    directory: Path
    level: str


@dataclass(frozen=True)
class UiConfig:
    debug: bool


@dataclass(frozen=True)
class ApplicationConfig:
    camera: CameraConfig
    vision: VisionConfig
    storage: StorageConfig
    logging: LoggingConfig
    ui: UiConfig


@dataclass(frozen=True)
class ApplicationContext:
    config: ApplicationConfig


@dataclass(frozen=True)
class StartupError(Exception):
    code: str
    message: str
    hint: str
    exit_code: int = 2

    def __str__(self) -> str:
        return f"{self.code}: {self.message} Hint: {self.hint}"


class ApplicationShell(Protocol):
    def run(self, context: ApplicationContext) -> None: ...


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "level": record.levelname,
                "event": record.getMessage(),
            },
            separators=(",", ":"),
        )


def _resolve(base: Path, value: str) -> Path:
    path = Path(value).expanduser()
    return path if path.is_absolute() else base / path


def _reject_unknown_keys(scope: str, values: object, allowed: set[str]) -> None:
    if not isinstance(values, dict):
        raise StartupError("CONFIG_INVALID", f"{scope} must be a table", "Fix the TOML value.")
    unknown = set(values) - allowed
    if unknown:
        key = sorted(unknown)[0]
        raise StartupError(
            "CONFIG_INVALID",
            f"Unknown configuration key {scope}.{key}",
            f"Remove {scope}.{key} or use a supported key.",
        )


def _require_keys(scope: str, values: dict[str, object], required: set[str]) -> None:
    missing = required - set(values)
    if missing:
        key = sorted(missing)[0]
        raise StartupError(
            "CONFIG_INVALID",
            f"Missing required configuration key {scope}.{key}",
            f"Set {scope}.{key} to an accepted value.",
        )


def _load_config(
    path: Path, camera_override: int | None, debug_override: bool
) -> ApplicationConfig:
    try:
        with path.open("rb") as stream:
            raw = tomllib.load(stream)
    except tomllib.TOMLDecodeError as error:
        raise StartupError(
            "CONFIG_INVALID",
            f"Configuration is not valid TOML: {error}",
            "Correct the named TOML location and start again.",
        ) from error
    except OSError as error:
        raise StartupError(
            "CONFIG_INVALID",
            f"Configuration cannot be read: {path}",
            "Select a readable configuration file.",
        ) from error
    _reject_unknown_keys("config", raw, {"camera", "vision", "storage", "logging", "ui"})
    _require_keys("config", raw, {"camera", "vision", "storage", "logging", "ui"})
    base = path.parent
    camera = raw["camera"]
    vision = raw["vision"]
    storage = raw["storage"]
    logging_values = raw["logging"]
    ui = raw["ui"]
    _reject_unknown_keys("camera", camera, {"index"})
    _reject_unknown_keys("vision", vision, {"model_path", "model_sha256"})
    _reject_unknown_keys("storage", storage, {"output_dir"})
    _reject_unknown_keys("logging", logging_values, {"directory", "level"})
    _reject_unknown_keys("ui", ui, {"debug"})
    _require_keys("camera", camera, {"index"})
    _require_keys("vision", vision, {"model_path", "model_sha256"})
    _require_keys("storage", storage, {"output_dir"})
    _require_keys("logging", logging_values, {"directory", "level"})
    _require_keys("ui", ui, {"debug"})
    camera_index = camera_override if camera_override is not None else camera["index"]
    if isinstance(camera_index, bool) or not isinstance(camera_index, int) or camera_index < 0:
        raise StartupError(
            "CONFIG_INVALID",
            "camera.index must be an integer 0 or greater",
            "Select a non-negative camera index.",
        )
    for key, value in {
        "vision.model_path": vision["model_path"],
        "vision.model_sha256": vision["model_sha256"],
        "storage.output_dir": storage["output_dir"],
        "logging.directory": logging_values["directory"],
    }.items():
        if not isinstance(value, str) or not value.strip():
            raise StartupError(
                "CONFIG_INVALID",
                f"{key} must be a non-empty string",
                f"Set {key} to an accepted value.",
            )
    logging_level = logging_values["level"]
    accepted_levels = {"DEBUG", "INFO", "WARNING", "ERROR"}
    if not isinstance(logging_level, str) or logging_level not in accepted_levels:
        raise StartupError(
            "CONFIG_INVALID",
            "logging.level must be DEBUG, INFO, WARNING, or ERROR",
            "Choose one of the supported logging levels.",
        )
    debug = ui["debug"]
    if not isinstance(debug, bool):
        raise StartupError(
            "CONFIG_INVALID",
            "ui.debug must be true or false",
            "Set ui.debug to a TOML boolean.",
        )
    return ApplicationConfig(
        camera=CameraConfig(index=camera_index),
        vision=VisionConfig(
            model_path=_resolve(base, vision["model_path"]),
            model_sha256=vision["model_sha256"],
        ),
        storage=StorageConfig(output_dir=_resolve(base, storage["output_dir"])),
        logging=LoggingConfig(
            directory=_resolve(base, logging_values["directory"]),
            level=logging_level,
        ),
        ui=UiConfig(debug=debug_override or debug),
    )


def _validate_startup(config: ApplicationConfig) -> None:
    try:
        model_bytes = config.vision.model_path.read_bytes()
    except OSError as error:
        raise StartupError(
            "MODEL_MISSING",
            f"Face Landmarker model asset cannot be read: {config.vision.model_path}",
            "Restore the approved model asset and start again.",
            exit_code=3,
        ) from error
    digest = hashlib.sha256(model_bytes).hexdigest()
    if digest != config.vision.model_sha256:
        raise StartupError(
            "MODEL_CHECKSUM_MISMATCH",
            "Face Landmarker model checksum does not match the approved asset",
            "Restore the approved model asset; do not use unknown model bytes.",
            exit_code=3,
        )
    try:
        config.storage.output_dir.mkdir(parents=True, exist_ok=True)
        if not config.storage.output_dir.is_dir():
            raise NotADirectoryError(config.storage.output_dir)
        with tempfile.NamedTemporaryFile(dir=config.storage.output_dir) as probe:
            probe.write(b"smart-smile-output-check")
            probe.flush()
            os.fsync(probe.fileno())
    except OSError as error:
        raise StartupError(
            "OUTPUT_UNUSABLE",
            f"Final Photo output directory is not writable: {config.storage.output_dir}",
            "Choose a writable output directory and start again.",
            exit_code=4,
        ) from error


def _validate_runtime() -> None:
    if sys.version_info[:3] != (3, 12, 10):
        raise StartupError(
            "DEPENDENCY_VERSION",
            "Smart Smile requires CPython 3.12.10",
            "Run the application through the locked project environment.",
            exit_code=5,
        )

    for distribution in (
        "opencv-python",
        "opencv-python-headless",
        "opencv-contrib-python-headless",
    ):
        try:
            importlib.metadata.version(distribution)
        except importlib.metadata.PackageNotFoundError:
            continue
        raise StartupError(
            "DEPENDENCY_CONFLICT",
            f"Conflicting OpenCV distribution is installed: {distribution}",
            "Keep only opencv-contrib-python in the Smart Smile environment.",
            exit_code=5,
        )

    for distribution, expected in {
        "mediapipe": "0.10.35",
        "numpy": "1.26.4",
        "opencv-contrib-python": "4.11.0.86",
    }.items():
        try:
            actual = importlib.metadata.version(distribution)
        except importlib.metadata.PackageNotFoundError as error:
            raise StartupError(
                "DEPENDENCY_MISSING",
                f"Required distribution is not installed: {distribution}",
                "Restore the locked project environment.",
                exit_code=5,
            ) from error
        if actual != expected:
            raise StartupError(
                "DEPENDENCY_VERSION",
                f"{distribution} must be {expected}, found {actual}",
                "Restore the locked project environment.",
                exit_code=5,
            )


def _configure_logging(config: LoggingConfig) -> logging.Logger:
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
    logger.handlers.clear()
    logger.setLevel(config.level)
    logger.propagate = False
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    logger.addHandler(console_handler)
    file_handler.setFormatter(JsonFormatter())
    logger.addHandler(file_handler)
    return logger


def run_application(argv: Sequence[str], *, shell: ApplicationShell) -> int:
    parser = argparse.ArgumentParser(prog="smart-smile")
    parser.add_argument("--config", type=Path, default=Path("config.toml"))
    parser.add_argument("--camera", type=int)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args(argv)

    try:
        config = _load_config(args.config, args.camera, args.debug)
        _validate_runtime()
        _validate_startup(config)
        logger = _configure_logging(config.logging)
        logger.info("startup_validated")
        try:
            shell.run(ApplicationContext(config=config))
        except KeyboardInterrupt:
            logger.info("exit_requested")
            return 130
        return 0
    except StartupError as error:
        print(error, file=sys.stderr)
        return error.exit_code
