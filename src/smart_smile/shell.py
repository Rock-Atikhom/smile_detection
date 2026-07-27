from __future__ import annotations

import platform
from queue import Empty, Queue
from typing import cast

import cv2
import numpy as np
from numpy.typing import NDArray

from smart_smile.app import ApplicationContext
from smart_smile.camera import (
    CameraEvent,
    CameraFrame,
    CameraLane,
    CaptureFactory,
    LatestFrameMailbox,
    open_cv_capture,
)


class OpenCvShell:
    """Main-thread UI renderer backed by a dedicated camera-owner lane."""

    window_name = "Smart Smile Capture"

    def __init__(
        self,
        *,
        capture_factory: CaptureFactory = open_cv_capture,
        system: str | None = None,
    ) -> None:
        self._capture_factory = capture_factory
        self._system = system or platform.system()

    @staticmethod
    def _placeholder() -> NDArray[np.uint8]:
        return np.full((720, 1280, 3), (24, 27, 32), dtype=np.uint8)

    @staticmethod
    def _draw_status(
        canvas: NDArray[np.uint8],
        *,
        frame: CameraFrame | None,
        event: CameraEvent | None,
        debug: bool,
        replacements: int,
    ) -> None:
        if event is not None and event.kind == "failure":
            cv2.rectangle(canvas, (40, 40), (canvas.shape[1] - 40, 180), (45, 45, 180), -1)
            cv2.putText(
                canvas,
                "Camera access unavailable",
                (70, 92),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
            cv2.putText(
                canvas,
                event.guidance or "Check camera access, then restart Smart Smile.",
                (70, 140),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )
            return

        warming_up = frame is None or frame.warming_up
        state = "CAMERA_WARMUP" if warming_up else "READY"
        guidance = "Camera warming up..." if warming_up else "Camera ready"
        cv2.rectangle(canvas, (20, 20), (420, 105), (24, 27, 32), -1)
        cv2.putText(
            canvas,
            guidance,
            (42, 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.78,
            (118, 214, 156),
            2,
            cv2.LINE_AA,
        )
        if debug and frame is not None:
            details = (
                f"{state}  {frame.width}x{frame.height}  "
                f"{frame.measured_fps:.1f} FPS  replaced={replacements}"
            )
            cv2.putText(
                canvas,
                details,
                (42, 92),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.48,
                (220, 220, 220),
                1,
                cv2.LINE_AA,
            )

    def run(self, context: ApplicationContext) -> None:
        mailbox = LatestFrameMailbox()
        events: Queue[CameraEvent] = Queue()
        lane = CameraLane(
            index=context.config.camera.index,
            factory=self._capture_factory,
            system=self._system,
            mailbox=mailbox,
            events=events,
        )
        latest_frame: CameraFrame | None = None
        latest_event: CameraEvent | None = None
        canvas = self._placeholder()
        lane.start()

        try:
            while True:
                frame = mailbox.take()
                if frame is not None:
                    latest_frame = frame
                    canvas = cast(NDArray[np.uint8], cv2.flip(frame.pixels, 1))

                try:
                    while True:
                        latest_event = events.get_nowait()
                except Empty:
                    pass

                rendered = canvas.copy()
                self._draw_status(
                    rendered,
                    frame=latest_frame,
                    event=latest_event,
                    debug=context.config.ui.debug,
                    replacements=mailbox.replacement_count,
                )
                cv2.imshow(self.window_name, rendered)
                key = cv2.waitKey(16) & 0xFF
                if key in (27, ord("q")):
                    return
                if cv2.getWindowProperty(self.window_name, cv2.WND_PROP_VISIBLE) < 1:
                    return
        finally:
            lane.stop()
            lane.join(timeout=2.0)
            cv2.destroyWindow(self.window_name)
