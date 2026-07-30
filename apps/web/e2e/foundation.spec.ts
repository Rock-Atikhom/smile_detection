import { expect, test } from "@playwright/test";

const viewports = [
  { name: "portrait-390x844", width: 390, height: 844 },
  { name: "landscape-844x390", width: 844, height: 390 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
] as const;

test("does not request camera before the explicit privacy action", async ({
  page,
}) => {
  let cameraRequests = 0;
  await page.exposeFunction("recordCameraRequest", () => {
    cameraRequests += 1;
  });
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await window.recordCameraRequest();
      return original(constraints);
    };
  });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Take a smile photo privately" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to camera" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "How privacy works" }).click();
  await expect(
    page.getByRole("dialog", { name: "How privacy works" }),
  ).toBeVisible();
  expect(cameraRequests).toBe(0);
});

test("shows a decoded mirrored contained synthetic-camera preview and stops it intentionally", async ({
  page,
}) => {
  const postLoadRequests: string[] = [];
  await page.goto("/");
  page.on("request", (request) => postLoadRequests.push(request.url()));
  await page.getByRole("button", { name: "Continue to camera" }).click();

  const video = page.getByLabel("Live camera preview");
  await expect(video).toBeVisible();
  await expect
    .poll(() =>
      video.evaluate((element) => {
        const preview = element as HTMLVideoElement;
        return preview.videoWidth > 0 && preview.videoHeight > 0;
      }),
    )
    .toBe(true);
  await expect(video).toHaveCSS("object-fit", "contain");
  await expect(video).toHaveCSS("transform", /matrix\(-1, 0, 0, 1,/);
  await expect(
    page.getByRole("heading", { name: "Getting ready" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Camera ready" })).toBeVisible(
    { timeout: 5_000 },
  );
  expect(postLoadRequests).toEqual([]);

  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(
    page.getByRole("heading", { name: "Camera stopped" }),
  ).toBeVisible();
  await expect(video).toHaveCount(0);
});

for (const viewport of viewports) {
  test(`keeps camera controls reachable without horizontal overflow at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Continue to camera" }).click();
    await expect(
      page.getByRole("button", { name: "Stop camera" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Help & system status" }),
    ).toBeVisible();
    for (const name of ["Stop camera", "Help & system status"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(48);
      expect(box?.width).toBeGreaterThanOrEqual(48);
    }
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    const switchCamera = page.getByRole("button", { name: "Switch camera" });
    await expect(switchCamera).toHaveCount(
      (await switchCamera.count()) > 0 ? 1 : 0,
    );
  });
}

test("shows Switch camera only after permitted video inputs reveal a choice", async ({
  page,
}) => {
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
              deviceId: "synthetic-second-camera",
              groupId: "synthetic-camera-group",
              kind: "videoinput",
              label: "",
              toJSON: () => ({}),
            },
          ]
        : devices;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();
  await expect(
    page.getByRole("button", { name: "Switch camera" }),
  ).toBeVisible();
});

test("keeps application storage empty during a camera session", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();
  await expect(page.getByLabel("Live camera preview")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(async () => ({
        indexedDatabases:
          typeof indexedDB.databases === "function"
            ? (await indexedDB.databases()).length
            : 0,
        localStorageEntries: localStorage.length,
        sessionStorageEntries: sessionStorage.length,
      })),
    )
    .toEqual({
      indexedDatabases: 0,
      localStorageEntries: 0,
      sessionStorageEntries: 0,
    });
});

declare global {
  interface Window {
    recordCameraRequest(): Promise<void>;
  }
}
