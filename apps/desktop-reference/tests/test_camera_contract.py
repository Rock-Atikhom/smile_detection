from __future__ import annotations

import io
import logging
from collections.abc import Sequence
from queue import Queue
from threading import Event, get_ident

import cv2
import numpy as np
import pytest

from smart_smile.app import ApplicationContext
from smart_smile.camera import (
    CameraDevice,
    CameraEvent,
    CameraFrame,
    CameraLane,
    CameraReadFailure,
    CameraResolutionError,
    CameraUnavailable,
    LatestFrameMailbox,
)
from smart_smile.config import ApplicationConfig
from smart_smile.shell import OpenCvShell


class FakeCapture:
    def __init__(
        self,
        *,
        opened: bool,
        backend_name: str,
        reads: Sequence[tuple[bool, object | None]] = (),
    ) -> None:
        self.opened = opened
        self.backend_name = backend_name
        self.released = False
        self.set_calls: list[tuple[int, float]] = []
        self.reads = iter(reads)

    def isOpened(self) -> bool:
        return self.opened

    def set(self, property_id: int, value: float) -> bool:
        self.set_calls.append((property_id, value))
        return True

    def get(self, _property_id: int) -> float:
        return 0.0

    def getBackendName(self) -> str:
        return self.backend_name

    def read(self) -> tuple[bool, object | None]:
        return next(self.reads, (False, None))

    def release(self) -> None:
        self.released = True


class FakeCaptureFactory:
    def __init__(self, captures: Sequence[FakeCapture]) -> None:
        self.captures = iter(captures)
        self.backends: list[int] = []

    def __call__(self, index: int, backend: int) -> FakeCapture:
        assert index == 0
        self.backends.append(backend)
        return next(self.captures)


def test_macos_camera_tries_avfoundation_then_any_and_releases_failed_attempt() -> None:
    failed = FakeCapture(opened=False, backend_name="AVFOUNDATION")
    opened = FakeCapture(opened=True, backend_name="AVFOUNDATION")
    factory = FakeCaptureFactory([failed, opened])

    device = CameraDevice(factory=factory, system="Darwin")
    result = device.open(index=0)

    assert factory.backends == [cv2.CAP_AVFOUNDATION, cv2.CAP_ANY]
    assert failed.released is True
    assert result.backend == "AVFOUNDATION"


def test_open_requests_hd_mode_in_width_height_fps_order() -> None:
    capture = FakeCapture(opened=True, backend_name="AVFOUNDATION")
    device = CameraDevice(factory=FakeCaptureFactory([capture]), system="Darwin")

    result = device.open(index=0)

    assert capture.set_calls == [
        (cv2.CAP_PROP_FRAME_WIDTH, 1280.0),
        (cv2.CAP_PROP_FRAME_HEIGHT, 720.0),
        (cv2.CAP_PROP_FPS, 30.0),
    ]
    assert result.requested_width == 1280
    assert result.requested_height == 720
    assert result.requested_fps == 30


class AdvisoryPropertyCapture(FakeCapture):
    def set(self, property_id: int, value: float) -> bool:
        super().set(property_id, value)
        return property_id != cv2.CAP_PROP_FRAME_HEIGHT

    def get(self, property_id: int) -> float:
        return {
            cv2.CAP_PROP_FRAME_WIDTH: 1280.0,
            cv2.CAP_PROP_FRAME_HEIGHT: 720.0,
            cv2.CAP_PROP_FPS: 29.97,
        }[property_id]


def test_camera_property_acceptance_and_readback_are_observable() -> None:
    capture = AdvisoryPropertyCapture(opened=True, backend_name="AVFOUNDATION")
    device = CameraDevice(factory=FakeCaptureFactory([capture]), system="Darwin")

    result = device.open(index=0)

    assert [
        (outcome.name, outcome.requested, outcome.accepted, outcome.reported)
        for outcome in result.property_outcomes
    ] == [
        ("width", 1280.0, True, 1280.0),
        ("height", 720.0, False, 720.0),
        ("fps", 30.0, True, 29.97),
    ]


def test_unavailable_camera_has_stable_permission_guidance() -> None:
    factory = FakeCaptureFactory(
        [
            FakeCapture(opened=False, backend_name="AVFOUNDATION"),
            FakeCapture(opened=False, backend_name="ANY"),
        ]
    )
    device = CameraDevice(factory=factory, system="Darwin")

    with pytest.raises(CameraUnavailable) as raised:
        device.open(index=0)

    assert raised.value.code == "CAMERA_PERMISSION_OR_UNAVAILABLE"
    assert "System Settings" in raised.value.guidance


def test_decoded_frame_shape_is_authoritative_and_warmup_lasts_two_seconds() -> None:
    first_pixels = np.zeros((480, 640, 3), dtype=np.uint8)
    second_pixels = np.ones((720, 1280, 3), dtype=np.uint8)
    capture = FakeCapture(
        opened=True,
        backend_name="AVFOUNDATION",
        reads=[(True, first_pixels), (True, second_pixels)],
    )
    times = iter([1_000_000_000, 2_500_000_000, 3_100_000_000])
    device = CameraDevice(
        factory=FakeCaptureFactory([capture]),
        system="Darwin",
        clock_ns=lambda: next(times),
    )
    device.open(index=0)

    first = device.read()
    second = device.read()

    assert (first.width, first.height, first.sequence) == (640, 480, 1)
    assert first.warming_up is True
    assert first.pixels.flags.writeable is False
    assert (second.width, second.height, second.sequence) == (1280, 720, 2)
    assert second.warming_up is False
    assert second.measured_fps == pytest.approx(1.0 / 0.6)


def test_failed_read_never_reuses_the_previous_frame_or_sequence() -> None:
    pixels = np.zeros((480, 640, 3), dtype=np.uint8)
    replacement = np.ones((480, 640, 3), dtype=np.uint8)
    capture = FakeCapture(
        opened=True,
        backend_name="AVFOUNDATION",
        reads=[(True, pixels), (False, pixels), (True, replacement)],
    )
    times = iter([0, 1_000_000_000, 1_100_000_000])
    device = CameraDevice(
        factory=FakeCaptureFactory([capture]),
        system="Darwin",
        clock_ns=lambda: next(times),
    )
    device.open(index=0)
    first = device.read()

    with pytest.raises(CameraReadFailure) as raised:
        device.read()

    third = device.read()
    assert raised.value.code == "CAMERA_INVALID_FRAME"
    assert first.sequence == 1
    assert third.sequence == 2
    assert third.pixels is replacement


def test_below_minimum_decoded_resolution_is_rejected() -> None:
    capture = FakeCapture(
        opened=True,
        backend_name="AVFOUNDATION",
        reads=[(True, np.zeros((360, 640, 3), dtype=np.uint8))],
    )
    times = iter([0, 1])
    device = CameraDevice(
        factory=FakeCaptureFactory([capture]),
        system="Darwin",
        clock_ns=lambda: next(times),
    )
    device.open(index=0)

    with pytest.raises(CameraResolutionError) as raised:
        device.read()

    assert raised.value.code == "CAMERA_RESOLUTION_TOO_LOW"
    assert raised.value.delivered == (640, 360)


def test_latest_frame_mailbox_replaces_pending_frame_and_clears_on_take() -> None:
    pixels = np.zeros((480, 640, 3), dtype=np.uint8)
    first = CameraFrame(1, 1, 10, pixels, 640, 480, 0.0, True)
    second = CameraFrame(1, 2, 20, pixels, 640, 480, 30.0, True)
    mailbox = LatestFrameMailbox()

    mailbox.publish(first)
    mailbox.publish(second)

    assert mailbox.take() is second
    assert mailbox.take() is None
    assert mailbox.replacement_count == 1


class ThreadRecordingCapture(FakeCapture):
    def __init__(self) -> None:
        super().__init__(opened=True, backend_name="AVFOUNDATION")
        self.called = Event()
        self.owner_thread_ids: list[int] = []

    def _record(self) -> None:
        self.owner_thread_ids.append(get_ident())

    def isOpened(self) -> bool:
        self._record()
        return super().isOpened()

    def set(self, property_id: int, value: float) -> bool:
        self._record()
        return super().set(property_id, value)

    def getBackendName(self) -> str:
        self._record()
        return super().getBackendName()

    def read(self) -> tuple[bool, object | None]:
        self._record()
        self.called.set()
        return True, np.zeros((480, 640, 3), dtype=np.uint8)

    def release(self) -> None:
        self._record()
        super().release()


def test_camera_lane_exclusively_owns_open_read_and_release() -> None:
    capture = ThreadRecordingCapture()
    mailbox = LatestFrameMailbox()
    events: Queue[CameraEvent] = Queue()
    lane = CameraLane(
        index=0,
        factory=FakeCaptureFactory([capture]),
        system="Darwin",
        mailbox=mailbox,
        events=events,
    )

    lane.start()
    assert capture.called.wait(timeout=1.0)
    lane.stop()
    lane.join(timeout=1.0)

    assert lane.is_alive() is False
    assert capture.released is True
    assert len(set(capture.owner_thread_ids)) == 1
    assert capture.owner_thread_ids[0] != get_ident()
    assert mailbox.take() is not None


def test_camera_lane_logs_property_outcomes_delivered_mode_and_measured_fps() -> None:
    pixels = np.zeros((480, 640, 3), dtype=np.uint8)
    capture = AdvisoryPropertyCapture(
        opened=True,
        backend_name="AVFOUNDATION",
        reads=[(True, pixels), (True, pixels), (False, None)],
    )
    stream = io.StringIO()
    logger = logging.Logger("camera-contract")
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    logger.addHandler(handler)
    lane = CameraLane(
        index=0,
        factory=FakeCaptureFactory([capture]),
        system="Darwin",
        mailbox=LatestFrameMailbox(),
        events=Queue(),
        logger=logger,
    )

    lane.start()
    lane.join(timeout=1.0)

    log = stream.getvalue()
    assert "WARNING camera_property name=height requested=720.00 accepted=False" in log
    assert "camera_mode delivered=640x480" in log
    assert "camera_metrics delivered=640x480 measured_fps=" in log


class RepeatingCapture(FakeCapture):
    def __init__(self, pixels: np.ndarray[tuple[int, ...], np.dtype[np.uint8]]) -> None:
        super().__init__(opened=True, backend_name="AVFOUNDATION")
        self.pixels = pixels

    def read(self) -> tuple[bool, object | None]:
        return True, self.pixels


def test_shell_renders_a_mirrored_live_frame_on_the_main_ui_lane(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pixels = np.zeros((480, 640, 3), dtype=np.uint8)
    pixels[:, :320] = (10, 20, 30)
    pixels[:, 320:] = (200, 210, 220)
    capture = RepeatingCapture(pixels)
    shown: list[np.ndarray[tuple[int, ...], np.dtype[np.uint8]]] = []

    def show(_name: str, frame: np.ndarray[tuple[int, ...], np.dtype[np.uint8]]) -> None:
        shown.append(frame.copy())

    def key(_delay: int) -> int:
        if shown and shown[-1].shape == (480, 640, 3):
            return ord("q")
        return -1

    monkeypatch.setattr(cv2, "imshow", show)
    monkeypatch.setattr(cv2, "waitKey", key)
    monkeypatch.setattr(cv2, "getWindowProperty", lambda _name, _property: 1.0)
    monkeypatch.setattr(cv2, "destroyWindow", lambda _name: None)
    shell = OpenCvShell(
        capture_factory=FakeCaptureFactory([capture]),
        system="Darwin",
    )

    shell.run(ApplicationContext(config=ApplicationConfig()))

    live = shown[-1]
    assert tuple(live[240, 10]) == (200, 210, 220)
    assert tuple(live[240, 630]) == (10, 20, 30)
    assert capture.released is True


def test_shell_displays_camera_permission_or_unavailable_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shown: list[np.ndarray[tuple[int, ...], np.dtype[np.uint8]]] = []
    factory = FakeCaptureFactory(
        [
            FakeCapture(opened=False, backend_name="AVFOUNDATION"),
            FakeCapture(opened=False, backend_name="ANY"),
        ]
    )

    def show(_name: str, frame: np.ndarray[tuple[int, ...], np.dtype[np.uint8]]) -> None:
        shown.append(frame.copy())

    def key(_delay: int) -> int:
        if shown and tuple(shown[-1][80, 80]) == (45, 45, 180):
            return ord("q")
        return -1

    monkeypatch.setattr(cv2, "imshow", show)
    monkeypatch.setattr(cv2, "waitKey", key)
    monkeypatch.setattr(cv2, "getWindowProperty", lambda _name, _property: 1.0)
    monkeypatch.setattr(cv2, "destroyWindow", lambda _name: None)
    shell = OpenCvShell(capture_factory=factory, system="Darwin")

    shell.run(ApplicationContext(config=ApplicationConfig()))

    assert tuple(shown[-1][80, 80]) == (45, 45, 180)
