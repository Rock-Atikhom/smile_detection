from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import os
import platform
import sys
import tempfile
from pathlib import Path

from smart_smile.config import ApplicationConfig
from smart_smile.errors import StartupError

APPROVED_MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
RUNTIME_DISTRIBUTIONS = {"mediapipe", "numpy", "opencv-contrib-python"}
CONFLICTING_OPENCV_DISTRIBUTIONS = {
    "opencv-python",
    "opencv-python-headless",
    "opencv-contrib-python-headless",
}


def _normalized(name: str) -> str:
    return name.lower().replace("_", "-")


def _approved_versions() -> dict[str, str]:
    requirements = importlib.metadata.requires("smart-smile")
    if requirements is None:
        raise StartupError(
            "DEPENDENCY_MISSING",
            "Smart Smile project metadata is unavailable",
            "Restore the locked project environment.",
            exit_code=5,
        )
    approved: dict[str, str] = {}
    for requirement in requirements:
        requirement_without_marker = requirement.split(";", maxsplit=1)[0].strip()
        name, separator, version = requirement_without_marker.partition("==")
        normalized_name = _normalized(name.strip())
        if separator and normalized_name in RUNTIME_DISTRIBUTIONS:
            approved[normalized_name] = version.strip()
    return approved


def _validate_platform() -> None:
    system = platform.system()
    machine = platform.machine().lower()
    supported_mac = system == "Darwin" and machine == "arm64"
    supported_windows = system == "Windows" and machine in {"amd64", "x86_64"}
    if not (supported_mac or supported_windows):
        raise StartupError(
            "UNSUPPORTED_PLATFORM",
            f"Unsupported platform: {system} {machine}",
            "Use Apple Silicon macOS or Windows 10/11 x86-64.",
            exit_code=5,
        )
    if supported_mac:
        version = platform.mac_ver()[0]
        major = int(version.split(".", maxsplit=1)[0]) if version else 0
        if major < 13:
            raise StartupError(
                "UNSUPPORTED_PLATFORM",
                "The locked OpenCV 4.11 ARM64 wheel requires macOS 13 or later",
                "Upgrade macOS or revise the approved OpenCV dependency baseline.",
                exit_code=5,
            )


def validate_runtime() -> None:
    if sys.version_info[:2] != (3, 12):
        raise StartupError(
            "DEPENDENCY_VERSION",
            "Smart Smile requires CPython 3.12",
            "Run the application through the locked Python 3.12.10 environment.",
            exit_code=5,
        )
    _validate_platform()

    for distribution in CONFLICTING_OPENCV_DISTRIBUTIONS:
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

    for distribution, expected in _approved_versions().items():
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

    for module_name in ("cv2", "mediapipe", "numpy"):
        try:
            importlib.import_module(module_name)
        except Exception as error:
            raise StartupError(
                "DEPENDENCY_IMPORT",
                f"Required runtime module cannot be imported: {module_name}",
                "Restore the locked project environment.",
                exit_code=5,
            ) from error


def validate_startup(config: ApplicationConfig) -> None:
    _validate_model(config.vision.model_path)
    _validate_output(config.storage.output_dir)


def _validate_model(path: Path) -> None:
    try:
        model_bytes = path.read_bytes()
    except OSError as error:
        raise StartupError(
            "MODEL_MISSING",
            f"Face Landmarker model asset cannot be read: {path}",
            "Restore the approved model asset and start again.",
            exit_code=3,
        ) from error
    digest = hashlib.sha256(model_bytes).hexdigest()
    if digest != APPROVED_MODEL_SHA256:
        raise StartupError(
            "MODEL_CHECKSUM_MISMATCH",
            "Face Landmarker model checksum does not match the approved asset",
            "Restore the approved model asset; do not use unknown model bytes.",
            exit_code=3,
        )


def _validate_output(path: Path) -> None:
    try:
        path.mkdir(parents=True, exist_ok=True)
        if not path.is_dir():
            raise NotADirectoryError(path)
        with tempfile.NamedTemporaryFile(dir=path) as probe:
            probe.write(b"smart-smile-output-check")
            probe.flush()
            os.fsync(probe.fileno())
    except OSError as error:
        raise StartupError(
            "OUTPUT_UNUSABLE",
            f"Final Photo output directory is not writable: {path}",
            "Choose a writable output directory and start again.",
            exit_code=4,
        ) from error
