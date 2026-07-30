from __future__ import annotations

import tomllib
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from smart_smile.errors import StartupError

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class CameraConfig:
    index: int = 0


@dataclass(frozen=True)
class VisionConfig:
    model_path: Path = PROJECT_ROOT / "models" / "face_landmarker.task"


@dataclass(frozen=True)
class StorageConfig:
    output_dir: Path = PROJECT_ROOT / "output"


@dataclass(frozen=True)
class LoggingConfig:
    directory: Path = PROJECT_ROOT / "logs"
    level: str = "INFO"


@dataclass(frozen=True)
class TimingConfig:
    camera_warmup_seconds: float = 2.0


@dataclass(frozen=True)
class UiConfig:
    debug: bool = False


@dataclass(frozen=True)
class ApplicationConfig:
    camera: CameraConfig = field(default_factory=CameraConfig)
    vision: VisionConfig = field(default_factory=VisionConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    timing: TimingConfig = field(default_factory=TimingConfig)
    ui: UiConfig = field(default_factory=UiConfig)


def _read_document(path: Path) -> dict[str, Any]:
    try:
        with path.open("rb") as stream:
            return tomllib.load(stream)
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


def _section(
    document: Mapping[str, object],
    name: str,
    allowed: set[str],
) -> Mapping[str, object]:
    value = document.get(name, {})
    if not isinstance(value, dict):
        raise StartupError(
            "CONFIG_INVALID",
            f"{name} must be a table",
            "Fix the TOML value.",
        )
    unknown = set(value) - allowed
    if unknown:
        key = sorted(unknown)[0]
        raise StartupError(
            "CONFIG_INVALID",
            f"Unknown configuration key {name}.{key}",
            f"Remove {name}.{key} or use a supported key.",
        )
    return value


def _string(
    section: Mapping[str, object],
    key: str,
    default: str,
    *,
    label: str | None = None,
) -> str:
    value = section.get(key, default)
    display_name = label or key
    if not isinstance(value, str) or not value.strip():
        raise StartupError(
            "CONFIG_INVALID",
            f"{display_name} must be a non-empty string",
            f"Set {display_name} to an accepted value.",
        )
    return value


def _path(section: Mapping[str, object], key: str, default: Path, base: Path) -> Path:
    if key not in section:
        return default
    value = Path(_string(section, key, str(default))).expanduser()
    return value if value.is_absolute() else base / value


def load_config(
    path: Path | None,
    *,
    camera_override: int | None,
    debug_override: bool,
) -> ApplicationConfig:
    defaults = ApplicationConfig()
    document = _read_document(path) if path is not None else {}
    allowed_sections = {"camera", "vision", "storage", "logging", "timing", "ui"}
    unknown_sections = set(document) - allowed_sections
    if unknown_sections:
        name = sorted(unknown_sections)[0]
        raise StartupError(
            "CONFIG_INVALID",
            f"Unknown configuration section {name}",
            f"Remove {name} or use a supported section.",
        )
    base = path.parent if path is not None else PROJECT_ROOT

    camera_values = _section(document, "camera", {"index"})
    camera_index = (
        camera_override
        if camera_override is not None
        else camera_values.get("index", defaults.camera.index)
    )
    if isinstance(camera_index, bool) or not isinstance(camera_index, int) or camera_index < 0:
        raise StartupError(
            "CONFIG_INVALID",
            "camera.index must be an integer 0 or greater",
            "Select a non-negative camera index.",
        )

    vision_values = _section(document, "vision", {"model_path"})
    storage_values = _section(document, "storage", {"output_dir"})
    logging_values = _section(document, "logging", {"directory", "level"})
    timing_values = _section(document, "timing", {"camera_warmup_seconds"})
    ui_values = _section(document, "ui", {"debug"})

    camera_warmup_seconds = timing_values.get(
        "camera_warmup_seconds",
        defaults.timing.camera_warmup_seconds,
    )
    if (
        isinstance(camera_warmup_seconds, bool)
        or not isinstance(camera_warmup_seconds, int | float)
        or not 0 <= camera_warmup_seconds <= 30
    ):
        raise StartupError(
            "CONFIG_INVALID",
            "timing.camera_warmup_seconds must be a number from 0 through 30",
            "Choose a warm-up duration from 0 through 30 seconds.",
        )

    logging_level = _string(
        logging_values,
        "level",
        defaults.logging.level,
        label="logging.level",
    )
    if logging_level not in {"DEBUG", "INFO", "WARNING", "ERROR"}:
        raise StartupError(
            "CONFIG_INVALID",
            "logging.level must be DEBUG, INFO, WARNING, or ERROR",
            "Choose one of the supported logging levels.",
        )
    debug = ui_values.get("debug", defaults.ui.debug)
    if not isinstance(debug, bool):
        raise StartupError(
            "CONFIG_INVALID",
            "ui.debug must be true or false",
            "Set ui.debug to a TOML boolean.",
        )

    return ApplicationConfig(
        camera=CameraConfig(index=camera_index),
        vision=VisionConfig(
            model_path=_path(
                vision_values,
                "model_path",
                defaults.vision.model_path,
                base,
            )
        ),
        storage=StorageConfig(
            output_dir=_path(
                storage_values,
                "output_dir",
                defaults.storage.output_dir,
                base,
            )
        ),
        logging=LoggingConfig(
            directory=_path(
                logging_values,
                "directory",
                defaults.logging.directory,
                base,
            ),
            level=logging_level,
        ),
        timing=TimingConfig(camera_warmup_seconds=float(camera_warmup_seconds)),
        ui=UiConfig(debug=debug_override or debug),
    )
