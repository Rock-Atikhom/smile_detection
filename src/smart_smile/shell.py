from __future__ import annotations

import cv2
import numpy as np

from smart_smile.app import ApplicationContext


class OpenCvShell:
    """The initial desktop window; camera ownership arrives in the next ticket."""

    window_name = "Smart Smile Capture"

    def run(self, context: ApplicationContext) -> None:
        canvas = np.full((720, 1280, 3), (24, 27, 32), dtype=np.uint8)
        cv2.putText(
            canvas,
            "Smart Smile Capture",
            (80, 300),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.6,
            (255, 255, 255),
            3,
            cv2.LINE_AA,
        )
        status = "Debug enabled" if context.config.ui.debug else "Application ready"
        cv2.putText(
            canvas,
            status,
            (84, 360),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (118, 214, 156),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            canvas,
            "Press q or Esc to exit",
            (84, 650),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (200, 204, 210),
            1,
            cv2.LINE_AA,
        )

        try:
            while True:
                cv2.imshow(self.window_name, canvas)
                key = cv2.waitKey(16) & 0xFF
                if key in (27, ord("q")):
                    return
                if cv2.getWindowProperty(self.window_name, cv2.WND_PROP_VISIBLE) < 1:
                    return
        finally:
            cv2.destroyWindow(self.window_name)
