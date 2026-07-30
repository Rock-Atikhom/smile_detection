import { expect, test } from "@playwright/test";

const viewports = [
  { name: "portrait-390x844", width: 390, height: 844 },
  { name: "landscape-844x390", width: 844, height: 390 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  test(`preserves the Ticket 01 privacy foundation at ${viewport.name}`, async ({
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
    ).toBeEnabled();
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

    if (viewport.name === "landscape-844x390") {
      const cameraStage = page.getByLabel("Camera preview");
      const footer = page.getByRole("contentinfo");
      const continueAction = page.getByRole("button", {
        name: "Continue to camera",
      });
      const helpAction = page.getByRole("button", {
        name: "Help & system status",
      });
      for (const control of [continueAction, helpAction]) {
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeInViewport();
        await expect(cameraStage).toBeInViewport();
        await expect(footer).toBeInViewport();
      }
    }

    const screenshot = testInfo.outputPath(`${viewport.name}.png`);
    await page.screenshot({ path: screenshot });
    await testInfo.attach(`${viewport.name}-screenshot`, {
      path: screenshot,
      contentType: "image/png",
    });
  });
}

test("opens the privacy dialog under production CSP without requesting camera or adding later features", async ({
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
  await expect
    .poll(() =>
      page.evaluate(async () => ({
        cacheStorageEntries: (await caches.keys()).length,
        canvasElements: document.querySelectorAll("canvas").length,
        cookies: document.cookie,
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
      })),
    )
    .toEqual({
      cacheStorageEntries: 0,
      canvasElements: 0,
      cookies: "",
      fileInputs: 0,
      indexedDatabases: 0,
      localStorageEntries: 0,
      serviceWorkers: 0,
      sessionStorageEntries: 0,
      videoElements: 0,
    });
});

test("preserves Ticket 01 privacy trigger non-text contrast", async ({
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
      const contrast = (first: number, second: number) =>
        (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      const styles = getComputedStyle(element);
      const border = luminance(styles.borderTopColor);
      return {
        interior: contrast(border, luminance(styles.backgroundColor)),
        exterior: contrast(
          border,
          luminance(getComputedStyle(document.documentElement).backgroundColor),
        ),
      };
    });
  expect(contrasts.interior).toBeGreaterThanOrEqual(3);
  expect(contrasts.exterior).toBeGreaterThanOrEqual(3);
});

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
  await page.evaluate(() => {
    const stream = document.querySelector<HTMLVideoElement>("video")
      ?.srcObject as MediaStream | null;
    const track = stream?.getTracks()[0];
    window.cameraTrackForClose = track;
    window.cameraTrackStoppedOnClose = track?.readyState === "ended";
    track?.addEventListener("ended", () => {
      window.cameraTrackStoppedOnClose = true;
    });
  });

  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(
    page.getByRole("heading", { name: "Camera stopped" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.cameraTrackStoppedOnClose ||
          window.cameraTrackForClose?.readyState === "ended",
      ),
    )
    .toBe(true);
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
      const control = page.getByRole("button", { name });
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(48);
      expect(box?.width).toBeGreaterThanOrEqual(48);
    }
    const keyboardTargets = new Set(["Stop camera", "Help & system status"]);
    await page.getByRole("link", { name: "Smart Smile home" }).focus();
    for (let step = 0; step < 8 && keyboardTargets.size > 0; step += 1) {
      await page.keyboard.press("Tab");
      const focusedText = await page.evaluate(
        () => document.activeElement?.textContent?.trim() ?? "",
      );
      keyboardTargets.delete(focusedText);
    }
    expect([...keyboardTargets]).toEqual([]);
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

test("keeps camera actions reachable at the 720 by 450 CSS viewport produced by 200 percent zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();

  for (const name of ["Stop camera", "Help & system status"]) {
    const control = page.getByRole("button", { name });
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    await control.focus();
    await expect(control).toBeFocused();
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

test("reflows camera actions at the 360 by 225 CSS viewport produced by 400 percent zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 225 });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();

  for (const name of ["Stop camera", "Help & system status"]) {
    const control = page.getByRole("button", { name });
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    await control.focus();
    await expect(control).toBeFocused();
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

for (const viewport of [
  { mode: "mobile-sheet", width: 390, height: 844 },
  { mode: "desktop-drawer", width: 1440, height: 900 },
] as const) {
  test(`presents system status as a ${viewport.mode}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Help & system status" }).click();
    const dialog = page.getByRole("dialog", { name: "Help & system status" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (viewport.mode === "mobile-sheet") {
      expect(box!.height).toBeLessThanOrEqual(viewport.height * 0.7 + 1);
      expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
    } else {
      expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
      expect(box!.x + box!.width).toBeGreaterThanOrEqual(viewport.width - 1);
    }
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
  const switchCamera = page.getByRole("button", { name: "Switch camera" });
  await switchCamera.scrollIntoViewIfNeeded();
  await expect(switchCamera).toBeInViewport();
  const box = await switchCamera.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(48);
  expect(box?.width).toBeGreaterThanOrEqual(48);
  await page.getByRole("button", { name: "Stop camera" }).focus();
  await page.keyboard.press("Tab");
  await expect(switchCamera).toBeFocused();
});

test("hides Switch camera when a permitted stream exposes only one choice", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(MediaStreamTrack.prototype, "getCapabilities", {
      configurable: true,
      value: () => ({ facingMode: ["user"] }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();
  await expect(page.getByLabel("Live camera preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch camera" })).toHaveCount(
    0,
  );
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
        cacheStorageEntries: (await caches.keys()).length,
        cookies: document.cookie,
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
      })),
    )
    .toEqual({
      cacheStorageEntries: 0,
      cookies: "",
      indexedDatabases: 0,
      localStorageEntries: 0,
      serviceWorkers: 0,
      sessionStorageEntries: 0,
    });
});

declare global {
  interface Window {
    cameraTrackStoppedOnClose?: boolean;
    cameraTrackForClose?: MediaStreamTrack;
    recordCameraRequest(): Promise<void>;
    recordPolicyViolation(directive: string): void;
  }
}
