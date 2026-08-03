import { expect, test, type Page } from "@playwright/test";

type FaceGuidance =
  | "no-face"
  | "multiple-faces"
  | "too-close"
  | "too-far"
  | "off-center"
  | "face-ready";

type EvidenceOverrides = Partial<{
  cameraGeneration: number;
  capturedAtMs: number;
  generation: number;
  sequence: number;
}>;

type FaceEvidenceTestBridge = {
  emit(guidance: FaceGuidance, overrides?: EvidenceOverrides): void;
  facts(): {
    cancelled: number;
    latestCameraGeneration: number | null;
    terminated: number;
    workers: number;
  };
  next(guidance: FaceGuidance): Promise<void>;
  waitForNewCameraGeneration(previous: number): Promise<void>;
};

declare global {
  interface Window {
    __smartSmileFaceEvidence?: FaceEvidenceTestBridge;
    __smartSmileCreateVisionWorker?: () => unknown;
  }
}

async function exposeSecondCamera(page: Page) {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.enumerateDevices.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.enumerateDevices = async () => {
      const devices = await original();
      const video = devices.find((device) => device.kind === "videoinput");
      return video
        ? [
            video,
            {
              deviceId: video.deviceId,
              groupId: "synthetic-camera-group",
              kind: "videoinput",
              label: "",
              toJSON: () => ({}),
            },
          ]
        : devices;
    };
  });
}

async function installFaceEvidenceWorker(page: Page) {
  await page.addInitScript(() => {
    type Frame = {
      cameraGeneration: number;
      generation: number;
      height: number;
      orientation: "landscape" | "portrait";
      sequence: number;
      tier: "standard";
      width: number;
    };
    type Listener = (event: MessageEvent<unknown>) => void;
    type FakeWorker = {
      addEventListener(type: string, listener: Listener): void;
      dispatch(data: unknown): void;
      latestFrame?: Frame;
      postMessage(message: Record<string, unknown>): void;
      removeEventListener(type: string, listener: Listener): void;
      terminate(): void;
    };
    type NextWaiter = { guidance: FaceGuidance; resolve(): void };
    type CameraWaiter = { previous: number; resolve(): void };

    const guidanceFacts: Record<
      FaceGuidance,
      { eligible: boolean; faceCount: 0 | 1 | 2 }
    > = {
      "face-ready": { eligible: true, faceCount: 1 },
      "multiple-faces": { eligible: false, faceCount: 2 },
      "no-face": { eligible: false, faceCount: 0 },
      "off-center": { eligible: false, faceCount: 1 },
      "too-close": { eligible: false, faceCount: 1 },
      "too-far": { eligible: false, faceCount: 1 },
    };
    const state: {
      cancelled: number;
      lastDeliveredSequence: number;
      latestCameraGeneration: number | null;
      terminated: number;
      waitForCamera: CameraWaiter[];
      waitForNext: NextWaiter | null;
      workers: FakeWorker[];
    } = {
      cancelled: 0,
      lastDeliveredSequence: -1,
      latestCameraGeneration: null,
      terminated: 0,
      waitForCamera: [],
      waitForNext: null,
      workers: [],
    };

    const dispatchEvidence = (
      worker: FakeWorker,
      guidance: FaceGuidance,
      overrides: EvidenceOverrides = {},
    ) => {
      const frame = worker.latestFrame;
      if (frame === undefined) throw new Error("No current frame to answer");
      const facts = guidanceFacts[guidance];
      worker.dispatch({
        cameraGeneration: frame.cameraGeneration,
        capturedAtMs: performance.now(),
        completedAtMs: performance.now(),
        generation: frame.generation,
        guidance,
        height: frame.height,
        orientation: frame.orientation,
        sequence: frame.sequence,
        tier: frame.tier,
        type: "FACE_EVIDENCE",
        width: frame.width,
        ...facts,
        ...overrides,
      });
      if (
        overrides.generation === undefined &&
        overrides.cameraGeneration === undefined &&
        overrides.sequence === undefined
      ) {
        state.lastDeliveredSequence = frame.sequence;
      }
    };

    const currentWorker = () => state.workers.at(-1);
    const tryDeliverNext = () => {
      const worker = currentWorker();
      if (
        worker === undefined ||
        state.waitForNext === null ||
        worker.latestFrame === undefined ||
        worker.latestFrame.sequence <= state.lastDeliveredSequence
      ) {
        return;
      }
      const next = state.waitForNext;
      if (next === null) return;
      state.waitForNext = null;
      dispatchEvidence(worker, next.guidance);
      next.resolve();
    };

    window.__smartSmileCreateVisionWorker = () => {
      const listeners = new Set<Listener>();
      const worker: FakeWorker = {
        latestFrame: undefined,
        addEventListener(type, listener) {
          if (type === "message") listeners.add(listener);
        },
        dispatch(data) {
          for (const listener of listeners) {
            listener({ data } as MessageEvent<unknown>);
          }
        },
        postMessage(message) {
          if (message.type === "PREPARE") {
            const prepare = message as {
              generation: number;
              releaseId: string;
              type: "PREPARE";
            };
            queueMicrotask(() =>
              worker.dispatch({
                generation: prepare.generation,
                releaseId: prepare.releaseId,
                type: "READY",
                wasmTier: "simd",
              }),
            );
            return;
          }
          if (message.type === "CANCEL") {
            state.cancelled += 1;
            return;
          }
          if (message.type === "FRAME") {
            const frame = message as Frame & { type: "FRAME" };
            worker.latestFrame = frame;
            state.latestCameraGeneration = frame.cameraGeneration;
            for (const waiter of state.waitForCamera.splice(0)) {
              if (frame.cameraGeneration > waiter.previous) waiter.resolve();
              else state.waitForCamera.push(waiter);
            }
            tryDeliverNext();
          }
        },
        removeEventListener(type, listener) {
          if (type === "message") listeners.delete(listener);
        },
        terminate() {
          state.terminated += 1;
          listeners.clear();
        },
      };
      state.workers.push(worker);
      return worker;
    };
    window.__smartSmileFaceEvidence = {
      emit(guidance, overrides) {
        const worker = currentWorker();
        if (worker === undefined) throw new Error("No active worker");
        dispatchEvidence(worker, guidance, overrides);
      },
      facts() {
        return {
          cancelled: state.cancelled,
          latestCameraGeneration: state.latestCameraGeneration,
          terminated: state.terminated,
          workers: state.workers.length,
        };
      },
      next(guidance) {
        return new Promise((resolve) => {
          state.waitForNext = { guidance, resolve };
          tryDeliverNext();
        });
      },
      waitForNewCameraGeneration(previous) {
        const worker = currentWorker();
        if (
          worker?.latestFrame !== undefined &&
          worker.latestFrame.cameraGeneration > previous
        ) {
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          state.waitForCamera.push({ previous, resolve });
        });
      },
    };
  });
}

async function emitNext(page: Page, guidance: FaceGuidance) {
  await page.evaluate(async (nextGuidance) => {
    const testBridge = window.__smartSmileFaceEvidence;
    if (testBridge === undefined)
      throw new Error("Missing face evidence bridge");
    await testBridge.next(nextGuidance);
  }, guidance);
}

test("guides one face through the real coordinator without retaining or sending evidence", async ({
  context,
  page,
}) => {
  const requests: string[] = [];
  context.on("request", (request) => requests.push(request.url()));
  await exposeSecondCamera(page);
  await installFaceEvidenceWorker(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();

  const status = page.getByRole("status", { name: "Camera status" });
  await expect(status).toContainText("Camera ready");

  for (const [guidance, copy] of [
    ["no-face", "Show your face"],
    ["multiple-faces", "Only one person"],
    ["too-close", "Move back"],
    ["too-far", "Move closer"],
    ["off-center", "Center your face"],
    ["face-ready", "Face ready"],
  ] as const) {
    await emitNext(page, guidance);
    await expect(status).toContainText(copy);
  }

  await page.evaluate(() => {
    const testBridge = window.__smartSmileFaceEvidence;
    if (testBridge === undefined)
      throw new Error("Missing face evidence bridge");
    testBridge.emit("face-ready", { generation: 999 });
  });
  await expect(status).toContainText("Face ready");
  await page.evaluate(() => {
    window.__smartSmileFaceEvidence?.emit("face-ready", {
      capturedAtMs: 0,
    });
  });
  await expect(status).toContainText("Face ready");

  const beforeSwitch = await page.evaluate(() =>
    window.__smartSmileFaceEvidence?.facts(),
  );
  expect(beforeSwitch?.latestCameraGeneration).not.toBeNull();
  await page.getByRole("button", { name: "Switch camera" }).click();
  await page.evaluate(async (previous) => {
    const testBridge = window.__smartSmileFaceEvidence;
    if (testBridge === undefined)
      throw new Error("Missing face evidence bridge");
    await testBridge.waitForNewCameraGeneration(previous);
  }, beforeSwitch!.latestCameraGeneration!);
  await page.evaluate(() => {
    const testBridge = window.__smartSmileFaceEvidence;
    if (testBridge === undefined)
      throw new Error("Missing face evidence bridge");
    testBridge.emit("face-ready", { cameraGeneration: 0 });
  });
  await expect(status).not.toContainText("Face ready");
  await page.evaluate(() => {
    window.__smartSmileFaceEvidence?.emit("face-ready");
  });
  await expect(status).toContainText("Face ready");

  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(
    page.getByRole("heading", { name: "Camera is off" }),
  ).toBeVisible();
  const afterStop = await page.evaluate(() =>
    window.__smartSmileFaceEvidence?.facts(),
  );
  expect(afterStop).toMatchObject({ cancelled: 1, terminated: 1, workers: 1 });
  await page.evaluate(() => {
    window.__smartSmileFaceEvidence?.emit("face-ready");
  });
  await expect(
    page.getByRole("heading", { name: "Camera is off" }),
  ).toBeVisible();

  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(
    requests.every((url) => new URL(url).origin === new URL(page.url()).origin),
  ).toBe(true);
});
