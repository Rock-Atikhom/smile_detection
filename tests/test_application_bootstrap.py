from __future__ import annotations

import hashlib
import importlib.metadata
from pathlib import Path

import pytest

from smart_smile.app import ApplicationContext, run_application


class RecordingShell:
    def __init__(self) -> None:
        self.context: ApplicationContext | None = None

    def run(self, context: ApplicationContext) -> None:
        self.context = context


class InterruptingShell:
    def run(self, context: ApplicationContext) -> None:
        raise KeyboardInterrupt


def write_valid_config(root: Path) -> Path:
    model = root / "face_landmarker.task"
    model.write_bytes(b"fixed-test-model")
    checksum = hashlib.sha256(model.read_bytes()).hexdigest()
    config = root / "config.toml"
    config.write_text(
        f"""
[camera]
index = 0

[vision]
model_path = "face_landmarker.task"
model_sha256 = "{checksum}"

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
    (tmp_path / "face_landmarker.task").unlink()
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


def test_missing_required_configuration_key_names_the_key(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    config.write_text(
        config.read_text(encoding="utf-8").replace('level = "INFO"\n', ""),
        encoding="utf-8",
    )
    shell = RecordingShell()

    exit_code = run_application(["--config", str(config)], shell=shell)

    error_output = capsys.readouterr().err
    assert exit_code == 2
    assert shell.context is None
    assert "CONFIG_INVALID" in error_output
    assert "logging.level" in error_output


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


def test_checksum_mismatch_fails_with_safe_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = write_valid_config(tmp_path)
    (tmp_path / "face_landmarker.task").write_bytes(b"changed-model")
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
