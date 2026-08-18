import { expect, test, type Page } from "@playwright/test";

type FaceGuidance =
  | "no-face"
  | "multiple-faces"
  | "too-close"
  | "too-far"
  | "off-center"
  | "face-ready";

type Observation = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  anchors: [number, number, number, number, number, number, number, number];
};

type EvidenceOverrides = Partial<{
  cameraGeneration: number;
  capturedAtMs: number;
  generation: number;
  sequence: number;
}>;

type EvidenceInput = {
  observation?: Observation | null;
  rawScore?: number;
  overrides?: EvidenceOverrides;
};

type SmileVerificationTestBridge = {
  emit(guidance: FaceGuidance, input: EvidenceInput): void;
  facts(): {
    cancelled: number;
    latestCameraGeneration: number | null;
    latestCapturedAtMs: number | null;
    latestGeneration: number | null;
    latestSequence: number | null;
    terminated: number;
    workers: number;
  };
  next(guidance: FaceGuidance, input: EvidenceInput): Promise<void>;
  waitForNewCameraGeneration(previous: number): Promise<void>;
};

declare global {
  interface Window {
    __smartSmileVerification?: SmileVerificationTestBridge;
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
    const SYNTHETIC_SECOND_CAMERA = "synthetic-second-camera";
    let previousReturnedStream: MediaStream | undefined;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const deviceId = requestedDeviceId(constraints);
      // The headless fake-device backend (notably Linux CI) only exposes a
      // single default camera, so requesting the synthetic second device id
      // yields the same capture and the switch can never advance the camera
      // generation. Map the synthetic second camera to an environment-facing
      // request (ideal, so it never rejects) which is a genuinely distinct,
      // attachable stream, then report the synthetic device id through the track
      // settings so the rest of the app behaves as with a real second camera.
      const effective =
        deviceId === SYNTHETIC_SECOND_CAMERA
          ? {
              audio: false,
              video: {
                facingMode: { ideal: "environment" },
                frameRate: { ideal: 30 },
                height: { ideal: 720 },
                width: { ideal: 1280 },
              },
            }
          : (() => {
              const neutral = { ...(constraints ?? {}) };
              if (neutral.video && typeof neutral.video === "object") {
                const neutralVideo = { ...neutral.video };
                delete neutralVideo.deviceId;
                neutral.video = neutralVideo;
              }
              return neutral;
            })();
      // Fully release the previous capture before fulfilling the synthetic second
      // camera: stop its tracks and clear the live <video> element's srcObject,
      // otherwise the fake device keeps the old capture pinned and the switch
      // never advances the camera generation on Linux CI.
      if (deviceId !== undefined && previousReturnedStream) {
        previousReturnedStream.getTracks().forEach((track) => track.stop());
        const preview = document.querySelector("video");
        if (preview && preview.srcObject === previousReturnedStream) {
          preview.srcObject = null;
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      const stream = await originalGetUserMedia(effective);
      previousReturnedStream = stream;
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

const STABLE_OBSERVATION: Observation = {
  centerX: 0.5,
  centerY: 0.5,
  width: 0.3,
  height: 0.5,
  anchors: [0, -0.2, 0, -0.2, -0.2, 0.1, 0.2, 0.1],
};

const REPLACEMENT_OBSERVATION: Observation = {
  centerX: 0.5,
  centerY: 0.5,
  width: 0.3,
  height: 0.5,
  anchors: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25],
};

async function installSmileVerificationWorker(page: Page) {
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
      deliveredSequence: number;
      dispatch(data: unknown): void;
      latestFrame?: Frame;
      postMessage(message: Record<string, unknown>): void;
      removeEventListener(type: string, listener: Listener): void;
      terminate(): void;
    };
    type NextWaiter = {
      guidance: FaceGuidance;
      input: EvidenceInput;
      resolve(): void;
    };
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
      latestCameraGeneration: number | null;
      latestCapturedAtMs: number | null;
      latestGeneration: number | null;
      latestSequence: number | null;
      terminated: number;
      waitForCamera: CameraWaiter[];
      waitForNext: NextWaiter | null;
      workers: FakeWorker[];
    } = {
      cancelled: 0,
      latestCameraGeneration: null,
      latestCapturedAtMs: null,
      latestGeneration: null,
      latestSequence: null,
      terminated: 0,
      waitForCamera: [],
      waitForNext: null,
      workers: [],
    };

    const dispatchEvidence = (
      worker: FakeWorker,
      guidance: FaceGuidance,
      input: EvidenceInput = {},
    ) => {
      const frame = worker.latestFrame;
      if (frame === undefined) throw new Error("No current frame to answer");
      const facts = guidanceFacts[guidance];
      if (
        input.overrides?.generation === undefined &&
        input.overrides?.cameraGeneration === undefined &&
        input.overrides?.sequence === undefined
      ) {
        worker.deliveredSequence = Math.max(
          worker.deliveredSequence,
          frame.sequence,
        );
      }
      worker.dispatch({
        cameraGeneration: frame.cameraGeneration,
        capturedAtMs: frame.capturedAtMs,
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
        observation: input.observation ?? null,
        rawSmileScore: input.rawScore ?? 0,
        ...(input.overrides ?? {}),
      });
    };

    const currentWorker = () => state.workers.at(-1);
    const tryDeliverNext = () => {
      const worker = currentWorker();
      if (
        worker === undefined ||
        state.waitForNext === null ||
        worker.latestFrame === undefined ||
        worker.latestFrame.sequence <= worker.deliveredSequence
      ) {
        return;
      }
      const next = state.waitForNext;
      if (next === null) return;
      const ageMs = performance.now() - worker.latestFrame.capturedAtMs;
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 150) {
        dispatchEvidence(worker, next.guidance, next.input);
        return;
      }
      state.waitForNext = null;
      dispatchEvidence(worker, next.guidance, next.input);
      next.resolve();
    };

    window.__smartSmileCreateVisionWorker = () => {
      const listeners = new Set<Listener>();
      const worker: FakeWorker = {
        deliveredSequence: -1,
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
    window.__smartSmileVerification = {
      emit(guidance, input) {
        const worker = currentWorker();
        if (worker === undefined) throw new Error("No active worker");
        dispatchEvidence(worker, guidance, input);
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
      next(guidance, input) {
        return new Promise((resolve) => {
          state.waitForNext = { guidance, input, resolve };
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

async function openCamera(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();
  const status = page.getByRole("status", { name: "Camera status" });
  await expect(status).toContainText("Camera ready");
  return status;
}

async function stepReady(page: Page, rawScore: number) {
  await page.evaluate(
    async ({ observation, score }) => {
      const bridge = window.__smartSmileVerification;
      if (bridge === undefined) throw new Error("Missing smile bridge");
      await bridge.next("face-ready", { observation, rawScore: score });
    },
    { observation: STABLE_OBSERVATION, score: rawScore },
  );
}

async function warmToReady(page: Page) {
  const status = page.getByRole("status", { name: "Camera status" });
  for (let sample = 0; sample < 6; sample += 1) {
    await stepReady(page, 0);
    if ((await status.textContent())?.includes("Smile when you are ready")) {
      return;
    }
  }
  await expect(status).toContainText("Smile when you are ready");
}

const progressBar = (page: Page) =>
  page.getByRole("progressbar", {
    name: "Smile verification progress",
  });

function progressValue(page: Page): Promise<number> {
  return page
    .getByRole("progressbar", { name: "Smile verification progress" })
    .evaluate((element) => Number((element as HTMLProgressElement).value));
}

async function buildProgress(page: Page) {
  await warmToReady(page);
  for (let i = 0; i < 12; i += 1) await stepReady(page, 1);
}

test("three matching observations reach Smile when you are ready", async ({
  page,
}) => {
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  const status = await openCamera(page);

  await stepReady(page, 0);
  await expect(status).toContainText("Hold still");

  await stepReady(page, 0);
  await expect(status).toContainText("Hold still");

  await stepReady(page, 0);
  await expect(status).toContainText("Smile when you are ready");
  await expect(progressBar(page)).toBeHidden();
});

test("neutral and speech-like aggregates never start progress", async ({
  page,
}) => {
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  const status = await openCamera(page);

  for (let i = 0; i < 3; i += 1) await stepReady(page, 0);
  await expect(status).toContainText("Smile when you are ready");
  await expect(progressBar(page)).toBeHidden();

  for (let i = 0; i < 4; i += 1) await stepReady(page, 0.2);
  await expect(status).toContainText("Smile when you are ready");
  await expect(progressBar(page)).toBeHidden();
});

test("broad and asymmetric traces cross hysteresis and display Keep smiling", async ({
  page,
}) => {
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  const status = await openCamera(page);

  await warmToReady(page);
  await expect(status).toContainText("Smile when you are ready");

  for (let i = 0; i < 4; i += 1) await stepReady(page, 0.8);
  await expect(status).toContainText("Keep smiling");
  await expect(progressBar(page)).toBeVisible();

  await stepReady(page, 0.5);
  await expect(status).toContainText("Keep smiling");
  await expect(progressBar(page)).toBeVisible();
});

test("brief no-face interruption pauses then same-face recovery resumes", async ({
  page,
}) => {
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  const status = await openCamera(page);

  await buildProgress(page);
  await expect(status).toContainText("Keep smiling");
  const during = await progressValue(page);
  expect(during).toBeGreaterThan(0);

  await page.evaluate(async () => {
    const bridge = window.__smartSmileVerification;
    if (bridge === undefined) throw new Error("Missing smile bridge");
    await bridge.next("no-face", { observation: null, rawScore: 0 });
  });
  await expect(status).toContainText("Show your face");
  expect(await progressValue(page)).toBe(during);

  await stepReady(page, 1);
  await expect(status).toContainText("Keep smiling");
  expect(await progressValue(page)).toBe(during);

  await stepReady(page, 1);
  await expect(status).toContainText("Keep smiling");
  expect(await progressValue(page)).toBeGreaterThan(during);
});

test("replacement during grace cannot inherit progress and expiry resets", async ({
  page,
}) => {
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  const status = await openCamera(page);

  await buildProgress(page);
  await expect(status).toContainText("Keep smiling");
  const heldProgress = await progressValue(page);
  expect(heldProgress).toBeGreaterThan(0);

  await page.evaluate(async () => {
    const bridge = window.__smartSmileVerification;
    if (bridge === undefined) throw new Error("Missing smile bridge");
    await bridge.next("no-face", { observation: null, rawScore: 0 });
  });

  await page.evaluate(async (replacement) => {
    const bridge = window.__smartSmileVerification;
    if (bridge === undefined) throw new Error("Missing smile bridge");
    await bridge.next("face-ready", {
      observation: replacement,
      rawScore: 1,
    });
  }, REPLACEMENT_OBSERVATION);
  await expect(status).toContainText("Keep smiling");
  expect(await progressValue(page)).toBe(heldProgress);

  await page.waitForTimeout(400);
  await stepReady(page, 0);
  await expect(status).toContainText("Hold still");
  await expect(progressBar(page)).toBeHidden();
});

test("exactly three thousand milliseconds reaches Smile verified", async ({
  page,
}) => {
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  const status = await openCamera(page);

  await warmToReady(page);
  await expect(status).toContainText("Smile when you are ready");

  for (let i = 0; i < 130; i += 1) await stepReady(page, 1);

  await expect(status).toContainText("Smile verified");
  const progress = progressBar(page);
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute("max", "3000");
  await expect(
    page.getByRole("heading", { name: "Choose your photo" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: "Original room" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Warm studio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sky blue" })).toBeVisible();
  await page.getByRole("button", { name: "Warm studio" }).click();
  await page.getByRole("button", { name: "Use this photo" }).click();
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Nickname (optional)").fill("Ada");
  await page.getByLabel("Email address").fill("participant@example.com");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send photo" }).click();
  await expect(
    page.getByRole("status", { name: "Photo request status" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await expect(page.getByText("Demo mode is active")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start another participant" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Start another participant" }).click();
  await warmToReady(page);
  for (let i = 0; i < 130; i += 1) await stepReady(page, 1);
  await expect(
    page.getByRole("heading", { name: "Choose your photo" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel("Email address")).toBeHidden();
});

test("starts a new detection for the next person without restarting the camera", async ({
  page,
}) => {
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  const status = await openCamera(page);

  await warmToReady(page);
  for (let i = 0; i < 130; i += 1) await stepReady(page, 1);
  await expect(status).toContainText("Smile verified");

  const beforeReset = await page.evaluate(() =>
    window.__smartSmileVerification?.facts(),
  );
  await page.getByRole("button", { name: "Retake" }).click();

  await expect(status).toContainText("Face ready");
  await expect(progressBar(page)).toBeHidden();
  const afterReset = await page.evaluate(() =>
    window.__smartSmileVerification?.facts(),
  );
  expect(afterReset?.latestCameraGeneration).toBe(
    beforeReset?.latestCameraGeneration,
  );

  await warmToReady(page);
  await expect(status).toContainText("Smile when you are ready");
});

test("stop and switch clear progress", async ({ page }) => {
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  const status = await openCamera(page);

  await buildProgress(page);
  await expect(status).toContainText("Keep smiling");
  await expect(progressBar(page)).toBeVisible();

  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(
    page.getByRole("heading", { name: "Camera is off" }),
  ).toBeVisible();
  await expect(progressBar(page)).toBeHidden();

  await page.getByRole("button", { name: "Restart camera" }).click();
  await expect(status).toContainText("Camera ready");
  await expect(progressBar(page)).toBeHidden();

  await buildProgress(page);
  await expect(status).toContainText("Keep smiling");
  await expect(progressBar(page)).toBeVisible();

  const beforeSwitch = await page.evaluate(() =>
    window.__smartSmileVerification?.facts(),
  );
  expect(beforeSwitch?.latestCameraGeneration).not.toBeNull();
  await page.getByRole("button", { name: "Switch camera" }).click();
  await page.evaluate(async (previous) => {
    const bridge = window.__smartSmileVerification;
    if (bridge === undefined) throw new Error("Missing smile bridge");
    await bridge.waitForNewCameraGeneration(previous);
  }, beforeSwitch!.latestCameraGeneration!);
  await expect(status).toContainText("Camera ready");
  await expect(progressBar(page)).toHaveCount(0);
});

test("stale or wrong-generation conflicting evidence cannot change visible state", async ({
  page,
}) => {
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  const status = await openCamera(page);

  await warmToReady(page);
  for (let i = 0; i < 3; i += 1) await stepReady(page, 1);
  await expect(status).toContainText("Keep smiling");

  const latest = await page.evaluate(() =>
    window.__smartSmileVerification?.facts(),
  );
  await page.evaluate(
    async ({ facts, observation }) => {
      const bridge = window.__smartSmileVerification;
      if (bridge === undefined) throw new Error("Missing smile bridge");
      bridge.emit("face-ready", {
        observation,
        rawScore: 1,
        overrides: { generation: (facts?.latestGeneration ?? 0) + 1 },
      });
    },
    { facts: latest, observation: STABLE_OBSERVATION },
  );
  await expect(status).toContainText("Keep smiling");

  await page.evaluate(
    async ({ facts, observation }) => {
      const bridge = window.__smartSmileVerification;
      if (bridge === undefined) throw new Error("Missing smile bridge");
      bridge.emit("face-ready", {
        observation,
        rawScore: 1,
        overrides: {
          cameraGeneration: (facts?.latestCameraGeneration ?? 0) + 1,
        },
      });
    },
    { facts: latest, observation: STABLE_OBSERVATION },
  );
  await expect(status).toContainText("Keep smiling");

  await page.evaluate(async (facts) => {
    const bridge = window.__smartSmileVerification;
    if (bridge === undefined) throw new Error("Missing smile bridge");
    bridge.emit("no-face", {
      observation: null,
      rawScore: 0,
      overrides: { sequence: (facts?.latestSequence ?? 0) - 1 },
    });
  }, latest);
  await expect(status).toContainText("Keep smiling");
});

test("application storage stays empty and every request remains same-origin", async ({
  context,
  page,
}) => {
  const requests: string[] = [];
  context.on("request", (request) => requests.push(request.url()));
  await exposeSecondCamera(page);
  await installSmileVerificationWorker(page);
  await openCamera(page);

  await warmToReady(page);
  await expect(
    page.getByRole("status", { name: "Camera status" }),
  ).toContainText("Smile when you are ready");

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
