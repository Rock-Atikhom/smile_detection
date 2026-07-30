import { expect, test } from "@playwright/test";

const viewports = [
  { name: "portrait-390x844", width: 390, height: 844 },
  { name: "landscape-844x390", width: 844, height: 390 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  test(`serves the privacy foundation at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Take a smile photo privately",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Camera and smile detection run on this device. No camera image or photo is uploaded.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue to camera" }),
    ).toBeDisabled();
    await expect(page.locator("video")).toHaveCount(0);

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    const screenshot = testInfo.outputPath(`${viewport.name}.png`);
    await page.screenshot({ path: screenshot });
    await testInfo.attach(`${viewport.name}-screenshot`, {
      path: screenshot,
      contentType: "image/png",
    });
  });
}
