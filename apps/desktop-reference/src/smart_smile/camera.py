from __future__ import annotations

import logging
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from queue import Queue
from threading import Event, Lock, Thread
from typing import Protocol

import cv2
import numpy as np
from numpy.typing import NDArray


class VideoCapture(Protocol):
    def isOpened(self) -> bool: ...

    def set(self, property_id: int, value: float) -> bool: ...

    def get(self, property_id: int) -> float: ...

    def getBackendName(self) -> str: ...

    def read(self) -> tuple[bool, object | None]: ...

    def release(self) -> None: ...


CaptureFactory = Callable[[int, int], VideoCapture]


@dataclass(frozen=True)
class CameraPropertyOutcome:
    name: str
    requested: float
    accepted: bool
    reported: float


@dataclass(frozen=True)
class CameraOpened:
    backend: str
    requested_width: int
    requested_height: int
    requested_fps: int
    property_outcomes: tuple[CameraPropertyOutcome, ...]


class CameraProblem(Exception):
    code: str
    guidance: str


class CameraUnavailable(CameraProblem):
    code = "CAMERA_PERMISSION_OR_UNAVAILABLE"
    guidance = (
        "Allow camera access in System Settings > Privacy & Security > Camera, "
        "close other camera apps, then restart Smart Smile."
    )


class CameraReadFailure(CameraProblem):
    code = "CAMERA_INVALID_FRAME"
    guidance = "The camera stopped delivering video. Close other camera apps and restart."


class CameraResolutionError(CameraProblem):
    code = "CAMERA_RESOLUTION_TOO_LOW"
    guidance = "Select a camera mode that delivers at least 640x480."

    def __init__(self, delivered: tuple[int, int]) -> None:
        self.delivered = delivered


@dataclass(frozen=True)
class CameraFrame:
    generation: int
    sequence: int
    captured_ns: int
    pixels: NDArray[np.uint8]
    width: int
    height: int
    measured_fps: float
    warming_up: bool


@dataclass(frozen=True)
class CameraOpenedEvent:
    backend: str


@dataclass(frozen=True)
class CameraFailureEvent:
    code: str
    guidance: str


type CameraEvent = CameraOpenedEvent | CameraFailureEvent


class LatestFrameMailbox:
    def __init__(self) -> None:
        self._lock = Lock()
        self._frame: CameraFrame | None = None
        self._replacement_count = 0

    def publish(self, frame: CameraFrame) -> None:
        with self._lock:
            if self._frame is not None:
                self._replacement_count += 1
            self._frame = frame

    def take(self) -> CameraFrame | None:
        with self._lock:
            frame = self._frame
            self._frame = None
            return frame

    @property
    def replacement_count(self) -> int:
        with self._lock:
            return self._replacement_count


def _backend_order(system: str) -> tuple[int, ...]:
    if system == "Darwin":
        return cv2.CAP_AVFOUNDATION, cv2.CAP_ANY
    if system == "Windows":
        return cv2.CAP_MSMF, cv2.CAP_DSHOW, cv2.CAP_ANY
    return (cv2.CAP_ANY,)


class CameraDevice:
    def __init__(
        self,
        *,
        factory: CaptureFactory,
        system: str,
        clock_ns: Callable[[], int] = time.monotonic_ns,
        generation: int = 1,
        warmup_seconds: float = 2.0,
    ) -> None:
        self._factory = factory
        self._system = system
        self._clock_ns = clock_ns
        self._generation = generation
        self._warmup_ns = int(warmup_seconds * 1_000_000_000)
        self._capture: VideoCapture | None = None
        self._ready_ns = 0
        self._sequence = 0
        self._timestamps: deque[int] = deque(maxlen=30)

    def open(self, *, index: int) -> CameraOpened:
        for backend in _backend_order(self._system):
            capture = self._factory(index, backend)
            if not capture.isOpened():
                capture.release()
                continue
            property_outcomes = tuple(
                CameraPropertyOutcome(
                    name=name,
                    requested=requested,
                    accepted=capture.set(property_id, requested),
                    reported=capture.get(property_id),
                )
                for name, property_id, requested in (
                    ("width", cv2.CAP_PROP_FRAME_WIDTH, 1280.0),
                    ("height", cv2.CAP_PROP_FRAME_HEIGHT, 720.0),
                    ("fps", cv2.CAP_PROP_FPS, 30.0),
                )
            )
            self._capture = capture
            self._ready_ns = self._clock_ns() + self._warmup_ns
            return CameraOpened(
                backend=capture.getBackendName(),
                requested_width=1280,
                requested_height=720,
                requested_fps=30,
                property_outcomes=property_outcomes,
            )
        raise CameraUnavailable

    def read(self) -> CameraFrame:
        if self._capture is None:
            raise CameraReadFailure
        success, pixels = self._capture.read()
        if (
            not success
            or not isinstance(pixels, np.ndarray)
            or pixels.size == 0
            or pixels.ndim != 3
            or pixels.shape[2] != 3
        ):
            raise CameraReadFailure

        height, width = int(pixels.shape[0]), int(pixels.shape[1])
        if width < 640 or height < 480:
            raise CameraResolutionError((width, height))

        captured_ns = self._clock_ns()
        pixels.setflags(write=False)
        self._timestamps.append(captured_ns)
        measured_fps = 0.0
        if len(self._timestamps) > 1:
            elapsed_ns = self._timestamps[-1] - self._timestamps[0]
            if elapsed_ns > 0:
                measured_fps = (len(self._timestamps) - 1) * 1_000_000_000 / elapsed_ns
        self._sequence += 1
        return CameraFrame(
            generation=self._generation,
            sequence=self._sequence,
            captured_ns=captured_ns,
            pixels=pixels,
            width=width,
            height=height,
            measured_fps=measured_fps,
            warming_up=captured_ns < self._ready_ns,
        )

    def release(self) -> None:
        if self._capture is not None:
            self._capture.release()
            self._capture = None


def open_cv_capture(index: int, backend: int) -> VideoCapture:
    return cv2.VideoCapture(index, backend)


class CameraLane:
    def __init__(
        self,
        *,
        index: int,
        mailbox: LatestFrameMailbox,
        events: Queue[CameraEvent],
        factory: CaptureFactory = open_cv_capture,
        system: str,
        generation: int = 1,
        warmup_seconds: float = 2.0,
        logger: logging.Logger | None = None,
    ) -> None:
        self._index = index
        self._mailbox = mailbox
        self._events = events
        self._factory = factory
        self._system = system
        self._generation = generation
        self._warmup_seconds = warmup_seconds
        self._logger = logger or logging.getLogger("smart_smile")
        self._stop_requested = Event()
        self._thread = Thread(target=self._run, name="smart-smile-camera", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop_requested.set()

    def join(self, timeout: float | None = None) -> None:
        self._thread.join(timeout)

    def is_alive(self) -> bool:
        return self._thread.is_alive()

    def _run(self) -> None:
        device = CameraDevice(
            factory=self._factory,
            system=self._system,
            generation=self._generation,
            warmup_seconds=self._warmup_seconds,
        )
        try:
            opened = device.open(index=self._index)
            self._events.put(CameraOpenedEvent(backend=opened.backend))
            self._logger.info(
                "camera_opened backend=%s requested=%dx%d@%d",
                opened.backend,
                opened.requested_width,
                opened.requested_height,
                opened.requested_fps,
            )
            for outcome in opened.property_outcomes:
                materially_mismatched = abs(outcome.reported - outcome.requested) > max(
                    1.0,
                    outcome.requested * 0.05,
                )
                log_property = (
                    self._logger.warning
                    if not outcome.accepted or materially_mismatched
                    else self._logger.info
                )
                log_property(
                    "camera_property name=%s requested=%.2f accepted=%s reported=%.2f",
                    outcome.name,
                    outcome.requested,
                    outcome.accepted,
                    outcome.reported,
                )
            logged_mode = False
            while not self._stop_requested.is_set():
                frame = device.read()
                self._mailbox.publish(frame)
                if not logged_mode:
                    self._logger.info(
                        "camera_mode delivered=%dx%d measured_fps=%.2f",
                        frame.width,
                        frame.height,
                        frame.measured_fps,
                    )
                    logged_mode = True
                if frame.sequence == 2 or frame.sequence % 300 == 0:
                    self._logger.info(
                        "camera_metrics delivered=%dx%d measured_fps=%.2f replacements=%d",
                        frame.width,
                        frame.height,
                        frame.measured_fps,
                        self._mailbox.replacement_count,
                    )
        except CameraProblem as error:
            self._events.put(
                CameraFailureEvent(
                    code=error.code,
                    guidance=error.guidance,
                )
            )
            self._logger.error("camera_failure code=%s", error.code)
        finally:
            device.release()
            self._logger.info("camera_released")
