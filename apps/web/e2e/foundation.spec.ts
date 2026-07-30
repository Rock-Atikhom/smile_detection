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

    if (viewport.name === "landscape-844x390") {
      const cameraStage = page.getByLabel("Camera foundation preview");
      const footer = page.getByRole("contentinfo");
      const action = page.getByRole("button", { name: "Continue to camera" });
      const explanation = page.getByText(
        "Camera setup is the next delivery step.",
      );

      await expect(cameraStage).toBeInViewport();
      await expect(footer).toBeInViewport();
      await explanation.scrollIntoViewIfNeeded();
      await expect(explanation).toBeInViewport();
      await expect(cameraStage).toBeInViewport();
      await expect(footer).toBeInViewport();
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      await expect(cameraStage).toBeInViewport();
      await expect(footer).toBeInViewport();
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

    const screenshot = testInfo.outputPath(`${viewport.name}.png`);
    await page.screenshot({ path: screenshot });
    await testInfo.attach(`${viewport.name}-screenshot`, {
      path: screenshot,
      contentType: "image/png",
    });
  });
}

test("opens the privacy dialog under the production CSP without exposing the background", async ({
  page,
}) => {
  const policyViolations: string[] = [];
  let cameraRequests = 0;
  await page.exposeFunction("recordPolicyViolation", (directive: string) => {
    policyViolations.push(directive);
  });
  await page.exposeFunction("recordCameraRequest", () => {
    cameraRequests += 1;
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => window.recordCameraRequest(),
      },
    });
    document.addEventListener("securitypolicyviolation", (event) => {
      void window.recordPolicyViolation(event.effectiveDirective);
    });
  });

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain(
    "style-src 'self'",
  );

  await page.getByRole("button", { name: "How privacy works" }).click();
  const dialog = page.getByRole("dialog", { name: "How privacy works" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector("dialog")?.matches(":modal")),
    )
    .toBe(true);

  const focusStayedInDialog = await page.evaluate(() => {
    document.querySelector<HTMLElement>(".wordmark")?.focus();
    return Boolean(
      document.activeElement?.closest("dialog[open]") &&
      document.querySelector("dialog[open]")?.contains(document.activeElement),
    );
  });
  expect(focusStayedInDialog).toBe(true);
  expect(policyViolations).toEqual([]);

  await page.getByRole("button", { name: "Close privacy details" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "How privacy works" }),
  ).toBeFocused();
  expect(cameraRequests).toBe(0);

  const laterFeatureState = await page.evaluate(async () => ({
    canvasElements: document.querySelectorAll("canvas").length,
    fileInputs: document.querySelectorAll('input[type="file"]').length,
    indexedDatabases:
      typeof indexedDB.databases === "function"
        ? (await indexedDB.databases()).length
        : 0,
    localStorageEntries: localStorage.length,
    serviceWorkers:
      "serviceWorker" in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : 0,
    sessionStorageEntries: sessionStorage.length,
    videoElements: document.querySelectorAll("video").length,
  }));
  expect(laterFeatureState).toEqual({
    canvasElements: 0,
    fileInputs: 0,
    indexedDatabases: 0,
    localStorageEntries: 0,
    serviceWorkers: 0,
    sessionStorageEntries: 0,
    videoElements: 0,
  });
});

test("privacy trigger boundary meets non-text contrast on both sides", async ({
  page,
}) => {
  await page.goto("/");

  const contrasts = await page
    .getByRole("button", { name: "How privacy works" })
    .evaluate((element) => {
      const toRgb = (value: string) =>
        value
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? [];
      const luminance = (value: string) => {
        const [red, green, blue] = toRgb(value).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      const styles = getComputedStyle(element);
      const border = luminance(styles.borderTopColor);
      const interior = luminance(styles.backgroundColor);
      const canvas = luminance(
        getComputedStyle(document.documentElement).backgroundColor,
      );
      const contrast = (first: number, second: number) =>
        (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      return {
        interior: contrast(border, interior),
        exterior: contrast(border, canvas),
      };
    });

  expect(contrasts.interior).toBeGreaterThanOrEqual(3);
  expect(contrasts.exterior).toBeGreaterThanOrEqual(3);
});

declare global {
  interface Window {
    recordPolicyViolation(directive: string): void;
    recordCameraRequest(): Promise<void>;
  }
}
