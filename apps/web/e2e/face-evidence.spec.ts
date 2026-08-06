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
    latestCapturedAtMs: number | null;
    latestGeneration: number | null;
    latestSequence: number | null;
    terminated: number;
    workers: number;
  };
  next(guidance: FaceGuidance): Promise<void>;
  waitForNewCameraGeneration(previous: number): Promise<void>;
  waitForNewSequence(previous: number): Promise<void>;
};

declare global {
  interface Window {
    __smartSmileFaceEvidence?: FaceEvidenceTestBridge;
    __smartSmileCreateVisionWorker?: () => unknown;
  }
}

async function exposeSecondCamera(page: Page) {
  await page.addInitScript(() => {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const requestedDeviceId = (
      constraints: MediaStreamConstraints | undefined,
    ) => {
      const video = constraints?.video;
      if (video && typeof video === "object" && "deviceId" in video) {
        const deviceId = (video as { deviceId: unknown }).deviceId;
        if (typeof deviceId === "string") return deviceId;
        if (deviceId && typeof deviceId === "object" && "exact" in deviceId) {
          const exact = (deviceId as { exact: unknown }).exact;
          if (typeof exact === "string") return exact;
        }
      }
      return undefined;
    };
    let previousReturnedStream: MediaStream | undefined;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const neutral = { ...(constraints ?? {}) };
      if (neutral.video && typeof neutral.video === "object") {
        const neutralVideo = { ...neutral.video };
        delete neutralVideo.deviceId;
        neutral.video = neutralVideo;
      }
      // On headless fake-device backends (notably Linux CI) the fake camera
      // cannot serve two simultaneous captures, so a switch request that keeps
      // the prior stream attached can return a track that ends immediately and
      // never advances the camera generation. Release the previous fake stream
      // (whether the initial camera or a prior synthetic switch) before
      // fulfilling the synthetic second camera, mirroring the production mobile
      // release-before-request path.
      if (
        requestedDeviceId(constraints) !== undefined &&
        previousReturnedStream
      ) {
        previousReturnedStream.getTracks().forEach((track) => track.stop());
      }
      const stream = await originalGetUserMedia(neutral);
      previousReturnedStream = stream;
      const deviceId = requestedDeviceId(constraints);
      if (deviceId !== undefined) {
        const track = stream.getVideoTracks()[0];
        if (track) {
          const settings = track.getSettings();
          const capabilities = track.getCapabilities?.() ?? {};
          Object.defineProperty(track, "getSettings", {
            configurable: true,
            value: () => ({ ...settings, deviceId }),
          });
          Object.defineProperty(track, "getCapabilities", {
            configurable: true,
            value: () => ({ ...capabilities, deviceId }),
          });
        }
      }
      return stream;
    };
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
              deviceId: "synthetic-second-camera",
              groupId: "synthetic-camera-group",
              kind: "videoinput",
              label: "synthetic-second-camera",
              toJSON: () => ({}),
            },
          ]
        : devices;
    };
  });
}

async function installFaceEvidenceWorker(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "createImageBitmap", {
      configurable: true,
      value: async () => ({ close: () => undefined }) as unknown as ImageBitmap,
    });
    type Frame = {
      cameraGeneration: number;
      capturedAtMs: number;
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
      latestCapturedAtMs: number | null;
      latestGeneration: number | null;
      latestSequence: number | null;
      terminated: number;
      waitForCamera: CameraWaiter[];
      waitForNext: NextWaiter | null;
      waitForSequence: Array<{ previous: number; resolve(): void }>;
      workers: FakeWorker[];
    } = {
      cancelled: 0,
      lastDeliveredSequence: -1,
      latestCameraGeneration: null,
      latestCapturedAtMs: null,
      latestGeneration: null,
      latestSequence: null,
      terminated: 0,
      waitForCamera: [],
      waitForNext: null,
      waitForSequence: [],
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
      if (
        overrides.generation === undefined &&
        overrides.cameraGeneration === undefined &&
        overrides.sequence === undefined
      ) {
        state.lastDeliveredSequence = Math.max(
          state.lastDeliveredSequence,
          frame.sequence,
        );
      }
      const observation = facts.eligible
        ? {
            anchors: [-0.25, -0.2, 0.25, -0.2, 0.0, 0.0, 0.0, 0.3],
            centerX: 0.5,
            centerY: 0.5,
            height: 0.5,
            width: 0.3,
          }
        : null;
      worker.dispatch({
        cameraGeneration: frame.cameraGeneration,
        capturedAtMs: frame.capturedAtMs,
        completedAtMs: performance.now(),
        generation: frame.generation,
        guidance,
        height: frame.height,
        observation,
        orientation: frame.orientation,
        rawSmileScore: facts.eligible ? 0.72 : 0,
        sequence: frame.sequence,
        tier: frame.tier,
        type: "FACE_EVIDENCE",
        width: frame.width,
        ...facts,
        ...overrides,
      });
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
      const ageMs = performance.now() - worker.latestFrame.capturedAtMs;
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 150) {
        // Settle the stale in-flight frame so the coordinator can transfer its
        // pending fresh frame. Keep the waiter until that frame is answered.
        dispatchEvidence(worker, next.guidance);
        return;
      }
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
            state.latestCapturedAtMs = frame.capturedAtMs;
            state.latestGeneration = frame.generation;
            state.latestSequence = frame.sequence;
            for (const waiter of state.waitForCamera.splice(0)) {
              if (frame.cameraGeneration > waiter.previous) waiter.resolve();
              else state.waitForCamera.push(waiter);
            }
            for (const waiter of state.waitForSequence.splice(0)) {
              if (frame.sequence > waiter.previous) waiter.resolve();
              else state.waitForSequence.push(waiter);
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
          latestCapturedAtMs: state.latestCapturedAtMs,
          latestGeneration: state.latestGeneration,
          latestSequence: state.latestSequence,
          terminated: state.terminated,
          workers: state.workers.length,
        };
      },
      next(guidance) {
        if (state.waitForNext !== null) {
          throw new Error("Previous next() not yet delivered");
        }
        return new Promise((resolve) => {
          state.waitForNext = { guidance, resolve };
          const poll = () => {
            const waiter = state.waitForNext;
            tryDeliverNext();
            if (waiter === state.waitForNext) setTimeout(poll, 25);
          };
          tryDeliverNext();
          if (state.waitForNext !== null) setTimeout(poll, 25);
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
          const poll = () => {
            if (
              state.waitForCamera.some(
                (w) =>
                  w.previous === previous &&
                  currentWorker()?.latestFrame?.cameraGeneration !==
                    undefined &&
                  (currentWorker()?.latestFrame?.cameraGeneration ?? -1) >
                    previous,
              )
            ) {
              state.waitForCamera = state.waitForCamera.filter(
                (w) => w.previous !== previous,
              );
              resolve();
              return;
            }
            setTimeout(poll, 25);
          };
          setTimeout(poll, 25);
        });
      },
      waitForNewSequence(previous) {
        const worker = currentWorker();
        if (
          worker?.latestFrame !== undefined &&
          worker.latestFrame.sequence > previous
        ) {
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          state.waitForSequence.push({ previous, resolve });
          const poll = () => {
            if (
              state.waitForSequence.some(
                (w) =>
                  w.previous === previous &&
                  currentWorker()?.latestFrame?.sequence !== undefined &&
                  (currentWorker()?.latestFrame?.sequence ?? -1) > previous,
              )
            ) {
              state.waitForSequence = state.waitForSequence.filter(
                (w) => w.previous !== previous,
              );
              resolve();
              return;
            }
            setTimeout(poll, 25);
          };
          setTimeout(poll, 25);
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
  await expect(status).toContainText("Camera ready", { timeout: 60_000 });

  for (const [guidance, copy] of [
    ["no-face", "Show your face"],
    ["multiple-faces", "Only one person"],
    ["too-close", "Move back"],
    ["too-far", "Move closer"],
    ["off-center", "Center your face"],
    ["face-ready", "Hold still"],
  ] as const) {
    await emitNext(page, guidance);
    await expect(status).toContainText(copy);
  }

  const acceptedSequence = await page.evaluate(
    () => window.__smartSmileFaceEvidence?.facts().latestSequence,
  );
  expect(acceptedSequence).not.toBeNull();
  await page.evaluate(async (previous) => {
    const testBridge = window.__smartSmileFaceEvidence;
    if (testBridge === undefined)
      throw new Error("Missing face evidence bridge");
    await testBridge.waitForNewSequence(previous);
  }, acceptedSequence!);

  await page.evaluate(() => {
    const testBridge = window.__smartSmileFaceEvidence;
    if (testBridge === undefined)
      throw new Error("Missing face evidence bridge");
    const { latestGeneration } = testBridge.facts();
    if (latestGeneration === null) throw new Error("Missing frame generation");
    testBridge.emit("no-face", { generation: latestGeneration + 1 });
  });
  await expect(status).toContainText("Hold still");
  await page.evaluate(() => {
    const testBridge = window.__smartSmileFaceEvidence;
    if (testBridge === undefined)
      throw new Error("Missing face evidence bridge");
    const { latestSequence } = testBridge.facts();
    if (latestSequence === null) throw new Error("Missing frame sequence");
    testBridge.emit("no-face", { sequence: latestSequence + 1 });
  });
  await expect(status).toContainText("Hold still");
  await page.evaluate(() => {
    const testBridge = window.__smartSmileFaceEvidence;
    if (testBridge === undefined)
      throw new Error("Missing face evidence bridge");
    const { latestCapturedAtMs } = testBridge.facts();
    if (latestCapturedAtMs === null)
      throw new Error("Missing frame capture time");
    testBridge.emit("no-face", {
      capturedAtMs: Math.max(0, latestCapturedAtMs - 1_000),
    });
  });
  await expect(status).toContainText("Hold still");

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
  await page.evaluate((oldCameraGeneration) => {
    const testBridge = window.__smartSmileFaceEvidence;
    if (testBridge === undefined)
      throw new Error("Missing face evidence bridge");
    testBridge.emit("no-face", {
      cameraGeneration: oldCameraGeneration,
    });
  }, beforeSwitch!.latestCameraGeneration!);
  await expect(status).toContainText("Camera ready");
  await page.evaluate(() => {
    window.__smartSmileFaceEvidence?.emit("face-ready");
  });
  await expect(status).toContainText("Hold still");

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
