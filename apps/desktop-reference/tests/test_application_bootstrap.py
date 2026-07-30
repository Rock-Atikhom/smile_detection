from __future__ import annotations

import importlib.metadata
import platform
import sys
from pathlib import Path

import cv2
import pytest

from smart_smile.app import ApplicationContext, run_application
from smart_smile.cli import main
from smart_smile.shell import OpenCvShell

APPROVED_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "face_landmarker.task"


class RecordingShell:
    def __init__(self) -> None:
        self.context: ApplicationContext | None = None

    def run(self, context: ApplicationContext) -> None:
        self.context = context


class InterruptingShell:
    def run(self, context: ApplicationContext) -> None:
        raise KeyboardInterrupt


class ClosedCapture:
    def isOpened(self) -> bool:
        return False

    def set(self, _property_id: int, _value: float) -> bool:
        return False

    def get(self, _property_id: int) -> float:
        return 0.0

    def getBackendName(self) -> str:
        return "NONE"

    def read(self) -> tuple[bool, object | None]:
        return False, None

    def release(self) -> None:
        pass


def closed_capture(_index: int, _backend: int) -> ClosedCapture:
    return ClosedCapture()


def write_valid_config(root: Path) -> Path:
    config = root / "config.toml"
    config.write_text(
        f"""
[camera]
index = 0

[vision]
model_path = "{APPROVED_MODEL_PATH}"

[storage]
output_dir = "photos"

[logging]
directory = "logs"
level = "INFO"

[ui]
debug = false
""".strip(),
        encoding="utf-8",
    )
    return config


def test_valid_startup_launches_application_shell(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    assert exit_code == 0
    assert shell.context is not None
    assert shell.context.config.storage.output_dir == tmp_path / "photos"
    assert any((tmp_path / "logs").glob("smart-smile.log.jsonl"))
    assert "startup_validated" in capsys.readouterr().err


def test_unknown_configuration_key_fails_before_shell_launch(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    config.write_text(
        config.read_text(encoding="utf-8").replace("index = 0", "index = 0\nunknown = true"),
        encoding="utf-8",
    )
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 2
    assert shell.context is None
    assert "CONFIG_INVALID" in error_output
    assert "camera.unknown" in error_output


def test_malformed_configuration_fails_with_actionable_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = tmp_path / "broken.toml"
    config.write_text("[camera\nindex = nope", encoding="utf-8")
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 2
    assert shell.context is None
    assert "CONFIG_INVALID" in error_output
    assert "valid TOML" in error_output


def test_out_of_range_camera_override_fails_before_shell_launch(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    shell = RecordingShell()

    exit_code = run_application(
        ["--config", str(config), "--camera", "-1"],
        shell=shell,
    )

    error_output = capsys.readouterr().err
    assert exit_code == 2
    assert shell.context is None
    assert "CONFIG_INVALID" in error_output
    assert "camera.index" in error_output
    assert "0 or greater" in error_output


def test_missing_model_fails_with_safe_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    config.write_text(
        config.read_text(encoding="utf-8").replace(
            str(APPROVED_MODEL_PATH),
            str(tmp_path / "missing-face-landmarker.task"),
        ),
        encoding="utf-8",
    )
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 3
    assert shell.context is None
    assert "MODEL_MISSING" in error_output
    assert "model asset" in error_output


def test_unusable_output_path_fails_before_shell_launch(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    (tmp_path / "photos").write_text("not a directory", encoding="utf-8")
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 4
    assert shell.context is None
    assert "OUTPUT_UNUSABLE" in error_output
    assert "output directory" in error_output


def test_conflicting_opencv_distribution_fails_before_shell_launch(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = write_valid_config(tmp_path)
    shell = RecordingShell()
    real_version = importlib.metadata.version

    def installed_version(distribution: str) -> str:
        if distribution == "opencv-python":
            return "4.11.0.86"
        return real_version(distribution)

    monkeypatch.setattr(importlib.metadata, "version", installed_version)

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 5
    assert shell.context is None
    assert "DEPENDENCY_CONFLICT" in error_output
    assert "opencv-python" in error_output


def test_missing_selected_configuration_fails_with_actionable_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = tmp_path / "missing.toml"
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 2
    assert shell.context is None
    assert "CONFIG_INVALID" in error_output
    assert str(config) in error_output


def test_invalid_logging_level_fails_before_shell_launch(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    config.write_text(
        config.read_text(encoding="utf-8").replace('level = "INFO"', 'level = "VERBOSE"'),
        encoding="utf-8",
    )
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 2
    assert shell.context is None
    assert "CONFIG_INVALID" in error_output
    assert "logging.level" in error_output
    assert "DEBUG, INFO, WARNING, or ERROR" in error_output


def test_unusable_log_directory_fails_with_safe_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    (tmp_path / "logs").write_text("not a directory", encoding="utf-8")
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 6
    assert shell.context is None
    assert "LOG_UNUSABLE" in error_output
    assert "log directory" in error_output


def test_cli_overrides_camera_and_debug_mode(
    tmp_path: Path,
) -> None:
    config = write_valid_config(tmp_path)
    shell = RecordingShell()

    exit_code = run_application(
        ["--config", str(config), "--camera", "2", "--debug"],
        shell=shell,
    )

    assert exit_code == 0
    assert shell.context is not None
    assert shell.context.config.camera.index == 2
    assert shell.context.config.ui.debug is True


def test_camera_warmup_duration_is_loaded_from_timing_configuration(tmp_path: Path) -> None:
    config = write_valid_config(tmp_path)
    config.write_text(
        config.read_text(encoding="utf-8") + "\n\n[timing]\ncamera_warmup_seconds = 1.25\n",
        encoding="utf-8",
    )
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    assert exit_code == 0
    assert shell.context is not None
    assert shell.context.config.timing.camera_warmup_seconds == 1.25


def test_out_of_range_camera_warmup_fails_before_shell_launch(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config = write_valid_config(tmp_path)
    config.write_text(
        config.read_text(encoding="utf-8") + "\n\n[timing]\ncamera_warmup_seconds = -0.1\n",
        encoding="utf-8",
    )
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 2
    assert shell.context is None
    assert "timing.camera_warmup_seconds" in error_output
    assert "0 through 30" in error_output


def test_checksum_mismatch_fails_with_safe_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    changed_model = tmp_path / "changed-model.task"
    changed_model.write_bytes(b"changed-model")
    config.write_text(
        config.read_text(encoding="utf-8").replace(
            str(APPROVED_MODEL_PATH),
            str(changed_model),
        ),
        encoding="utf-8",
    )
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 3
    assert shell.context is None
    assert "MODEL_CHECKSUM_MISMATCH" in error_output


def test_terminal_interrupt_exits_without_traceback(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)

    exit_code = run_application(["--config", str(config)], shell=InterruptingShell())

    assert exit_code == 130
    assert "exit_requested" in capsys.readouterr().err


def test_operator_cannot_override_approved_model_checksum(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    config.write_text(
        config.read_text(encoding="utf-8").replace(
            f'model_path = "{APPROVED_MODEL_PATH}"',
            f'model_path = "{APPROVED_MODEL_PATH}"\nmodel_sha256 = "{"0" * 64}"',
        ),
        encoding="utf-8",
    )
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 2
    assert shell.context is None
    assert "CONFIG_INVALID" in error_output
    assert "vision.model_sha256" in error_output


def test_partial_configuration_inherits_built_in_defaults(tmp_path: Path) -> None:
    config = tmp_path / "partial.toml"
    config.write_text(
        f"""
[storage]
output_dir = "{tmp_path / "photos"}"

[logging]
directory = "{tmp_path / "logs"}"
""".strip(),
        encoding="utf-8",
    )
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    assert exit_code == 0
    assert shell.context is not None
    assert shell.context.config.camera.index == 0
    assert shell.context.config.vision.model_path == APPROVED_MODEL_PATH
    assert shell.context.config.ui.debug is False


def test_no_configuration_uses_built_in_defaults() -> None:
    shell = RecordingShell()

    exit_code = run_application([], shell=shell)

    assert exit_code == 0
    assert shell.context is not None
    assert shell.context.config.camera.index == 0
    assert shell.context.config.vision.model_path == APPROVED_MODEL_PATH


def test_unsupported_intel_macos_fails_with_actionable_error(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = write_valid_config(tmp_path)
    monkeypatch.setattr(platform, "system", lambda: "Darwin")
    monkeypatch.setattr(platform, "machine", lambda: "x86_64")

    exit_code = run_application(["--config", str(config)], shell=RecordingShell())

    error_output = capsys.readouterr().err
    assert exit_code == 5
    assert "UNSUPPORTED_PLATFORM" in error_output
    assert "Apple Silicon" in error_output


def test_macos_below_locked_opencv_boundary_fails_safely(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = write_valid_config(tmp_path)
    monkeypatch.setattr(platform, "system", lambda: "Darwin")
    monkeypatch.setattr(platform, "machine", lambda: "arm64")
    monkeypatch.setattr(platform, "mac_ver", lambda: ("12.7.6", ("", "", ""), ""))

    exit_code = run_application(["--config", str(config)], shell=RecordingShell())

    error_output = capsys.readouterr().err
    assert exit_code == 5
    assert "UNSUPPORTED_PLATFORM" in error_output
    assert "macOS 13 or later" in error_output


def test_wrong_python_line_fails_with_actionable_error(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = write_valid_config(tmp_path)
    monkeypatch.setattr(sys, "version_info", (3, 12, 11))

    exit_code = run_application(["--config", str(config)], shell=RecordingShell())

    error_output = capsys.readouterr().err
    assert exit_code == 5
    assert "DEPENDENCY_VERSION" in error_output
    assert "CPython 3.12.10" in error_output


def test_missing_runtime_distribution_fails_with_actionable_error(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = write_valid_config(tmp_path)
    real_version = importlib.metadata.version

    def installed_version(distribution: str) -> str:
        if distribution == "mediapipe":
            raise importlib.metadata.PackageNotFoundError(distribution)
        return real_version(distribution)

    monkeypatch.setattr(importlib.metadata, "version", installed_version)

    exit_code = run_application(["--config", str(config)], shell=RecordingShell())

    error_output = capsys.readouterr().err
    assert exit_code == 5
    assert "DEPENDENCY_MISSING" in error_output
    assert "mediapipe" in error_output


@pytest.mark.parametrize("exit_key", [ord("q"), 27])
def test_application_shell_exits_for_standard_keys(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    exit_key: int,
) -> None:
    config = write_valid_config(tmp_path)
    monkeypatch.setattr(cv2, "imshow", lambda _name, _frame: None)
    monkeypatch.setattr(cv2, "waitKey", lambda _delay: exit_key)
    monkeypatch.setattr(cv2, "destroyWindow", lambda _name: None)

    exit_code = run_application(
        ["--config", str(config)],
        shell=OpenCvShell(capture_factory=closed_capture),
    )

    assert exit_code == 0


def test_real_cli_reports_dependency_import_failure_safely(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = write_valid_config(tmp_path)
    real_import = importlib.import_module

    def import_runtime_module(name: str) -> object:
        if name == "cv2":
            raise ImportError("broken cv2")
        return real_import(name)

    monkeypatch.setattr(importlib, "import_module", import_runtime_module)

    exit_code = main(["--config", str(config)])

    error_output = capsys.readouterr().err
    assert exit_code == 5
    assert "DEPENDENCY_IMPORT" in error_output
    assert "cv2" in error_output


def test_malformed_cli_value_has_stable_safe_error(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = run_application(["--camera", "not-a-number"], shell=RecordingShell())

    error_output = capsys.readouterr().err
    assert exit_code == 2
    assert "CONFIG_INVALID" in error_output
    assert "--camera" in error_output
