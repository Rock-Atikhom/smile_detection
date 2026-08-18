import { expect, test, type Page } from "@playwright/test";
import { contrast, parseCssColor, type Rgb } from "./color";

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
    /Getting smile detection ready|Getting ready|Camera ready/,
  );

  const box = await stage.boundingBox();
  expect(box?.x).toBeLessThanOrEqual(1);
  expect(box?.y).toBeLessThanOrEqual(1);
  expect(box?.width).toBeGreaterThanOrEqual(389);
  expect(box?.height).toBeGreaterThanOrEqual(843);

  const topBox = await page.locator(".session-chrome__top").boundingBox();
  const bottomBox = await page.locator(".session-chrome__bottom").boundingBox();
  expect(topBox?.height).toBeLessThanOrEqual(80);
  expect(bottomBox?.height).toBeLessThanOrEqual(150);
  expect(
    Math.abs(bottomBox!.y + bottomBox!.height - (box!.y + box!.height)),
  ).toBeLessThanOrEqual(1);

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

for (const viewport of [
  { name: "landscape-phone", width: 844, height: 390 },
  { name: "zoom-200-percent", width: 720, height: 450 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`keeps overlay controls reachable at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await exposeSecondCamera(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Continue to camera" }).click();

    const overlay = page.getByRole("region", {
      name: "Live camera controls",
    });
    for (const name of [
      "Help & system status",
      "Stop camera",
      "Switch camera",
    ]) {
      const control = overlay.getByRole("button", { name });
      await expect(control).toBeInViewport();
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(48);
      expect(box?.height).toBeGreaterThanOrEqual(48);
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
  });
}

test("reflows status and controls below the preview at the 400 percent equivalent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 225 });
  await exposeSecondCamera(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();

  const overlay = page.getByRole("region", { name: "Live camera controls" });
  const video = page.locator(".camera-preview");
  const status = overlay.getByRole("status");
  await expect(overlay).toHaveCSS("position", "static");

  const shortViewportPadding = await page.evaluate(() => {
    const padding = (selector: string) => {
      const styles = getComputedStyle(document.querySelector(selector)!);
      return [
        styles.paddingTop,
        styles.paddingRight,
        styles.paddingBottom,
        styles.paddingLeft,
      ];
    };
    return {
      bottom: padding(".session-chrome__bottom"),
      top: padding(".session-chrome__top"),
    };
  });
  expect(shortViewportPadding).toEqual({
    bottom: ["0px", "10px", "10px", "10px"],
    top: ["10px", "10px", "10px", "10px"],
  });

  const videoBox = await video.boundingBox();
  const statusBox = await status.boundingBox();
  expect(statusBox!.y).toBeGreaterThanOrEqual(videoBox!.y + videoBox!.height);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  for (const name of ["Help & system status", "Stop camera", "Switch camera"]) {
    const control = overlay.getByRole("button", { name });
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(48);
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
});

test("uses the approved keyboard order in the active session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await exposeSecondCamera(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();
  await expect(
    page.getByRole("region", { name: "Live camera controls" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch camera" }),
  ).toBeVisible();

  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  for (const name of ["Help & system status", "Stop camera", "Switch camera"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name })).toBeFocused();
  }
});

test("keeps live guidance visible and interaction motion explicit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await exposeSecondCamera(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();

  const status = page.getByRole("status", { name: "Camera status" });
  await expect(status.locator(".session-status__hint")).toBeVisible();
  await expect(status.locator(".session-status__hint")).not.toHaveText("");

  const transition = await page
    .locator(".session-control--stop")
    .evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(transition).toContain("transform");
  expect(transition).not.toBe("all");
});

test("protects overlay text against light and dark camera frames and removes motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await exposeSecondCamera(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();

  for (const selector of [
    ".session-controls",
    ".session-status",
    ".system-status-trigger--overlay",
    ".wordmark--overlay",
  ]) {
    const scrim = parseCssColor(
      await page
        .locator(selector)
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    );
    const [red, green, blue, alpha] = scrim;
    expect(alpha).toBeGreaterThanOrEqual(0.8);

    for (const frame of [
      [0, 0, 0],
      [255, 255, 255],
    ] as [number, number, number][]) {
      const composite = [
        Math.round(red * alpha + frame[0] * (1 - alpha)),
        Math.round(green * alpha + frame[1] * (1 - alpha)),
        Math.round(blue * alpha + frame[2] * (1 - alpha)),
      ] as [number, number, number];
      expect(contrast([255, 255, 255], composite)).toBeGreaterThanOrEqual(4.5);
    }
  }

  for (const selector of [
    ".session-control--stop",
    ".session-control--switch",
  ]) {
    const colors = await page.locator(selector).evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        background: styles.backgroundColor,
        foreground: styles.color,
      };
    });
    const background = parseCssColor(colors.background);
    const foreground = parseCssColor(colors.foreground);
    expect(
      contrast(foreground.slice(0, 3) as Rgb, background.slice(0, 3) as Rgb),
    ).toBeGreaterThanOrEqual(4.5);
  }

  await expect(page.locator(".session-controls")).toHaveCSS(
    "transition-duration",
    /0.01ms|0s|1e-05s/,
  );
});
