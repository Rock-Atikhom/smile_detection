import { expect, test, type Page } from "@playwright/test";

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
}

test("uses the approved full-stage overlay on a portrait phone", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await exposeSecondCamera(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();

  const stage = page.locator(".camera-stage--session");
  const overlay = page.getByRole("region", { name: "Live camera controls" });
  await expect(stage).toBeVisible();
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole("status")).toContainText(
    /Getting ready|Camera ready/,
  );

  const box = await stage.boundingBox();
  expect(box?.x).toBeLessThanOrEqual(1);
  expect(box?.y).toBeLessThanOrEqual(1);
  expect(box?.width).toBeGreaterThanOrEqual(389);
  expect(box?.height).toBeGreaterThanOrEqual(843);

  for (const name of ["Help & system status", "Stop camera", "Switch camera"]) {
    const control = overlay.getByRole("button", { name });
    await expect(control).toBeInViewport();
    const controlBox = await control.boundingBox();
    expect(controlBox?.width).toBeGreaterThanOrEqual(48);
    expect(controlBox?.height).toBeGreaterThanOrEqual(48);
  }

  const safePadding = await page.evaluate(() => ({
    bottom: Number.parseFloat(
      getComputedStyle(document.querySelector(".session-chrome__bottom")!)
        .paddingBottom,
    ),
    top: Number.parseFloat(
      getComputedStyle(document.querySelector(".session-chrome__top")!)
        .paddingTop,
    ),
  }));
  expect(safePadding.top).toBeGreaterThanOrEqual(16);
  expect(safePadding.bottom).toBeGreaterThanOrEqual(14);

  await expect(page.locator(".camera-preview")).toHaveCSS(
    "object-fit",
    "contain",
  );
  expect(await page.evaluate(() => scrollY)).toBe(0);

  const screenshot = testInfo.outputPath("native-camera-overlay-390x844.png");
  await page.screenshot({ path: screenshot });
  await testInfo.attach("native-camera-overlay-390x844", {
    path: screenshot,
    contentType: "image/png",
  });
});
