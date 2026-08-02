import { readFileSync } from "node:fs";
import { expect, test, type APIResponse, type Page } from "@playwright/test";

type ReleaseManifest = {
  assets: Array<{ path: string; requiredForOffline: boolean }>;
  modelVersion: string;
  releaseId: string;
  runtimeVersion: string;
};

const releaseManifest = JSON.parse(
  readFileSync(
    new URL("../src/vision/generated/release-manifest.json", import.meta.url),
    "utf8",
  ),
) as ReleaseManifest;
const serviceWorkerSource = readFileSync(
  new URL("../dist/sw.js", import.meta.url),
  "utf8",
);
const shellPaths = [
  ...serviceWorkerSource.matchAll(/["']url["']:\s*["']([^"']+)["']/g),
]
  .map((match) => `/${match[1]!.replace(/^\//, "")}`)
  .sort();
const currentCacheName = `smart-smile-vision-${releaseManifest.releaseId}`;
const corruptWasmCookieName = "__smart_smile_e2e_corrupt_wasm";
const corruptAfterFirstWasmCookieName =
  "__smart_smile_e2e_corrupt_after_first_wasm";
const simdWasmPath = releaseManifest.assets.find(({ path }) =>
  path.endsWith("/vision_wasm_internal.wasm"),
)!.path;
const nonRuntimeAssetPath = releaseManifest.assets.find(({ path }) =>
  path.endsWith(".pdf"),
)!.path;
const completionPath = (releaseId: string) =>
  `/__smart-smile/vision-complete/${releaseId}`;
const forbiddenPersistence =
  /blob:|data:|camera|frame|photo|landmarks?(?:$|[/?#._-])|geometry|diagnostic|device[-_ ]?(?:label|id)/i;

test.describe.configure({ mode: "serial" });

async function setCorruptWasm(page: Page, enabled: boolean) {
  const response = await page.request.get(
    `/__e2e__/fault/corrupt-wasm/${enabled ? "on" : "off"}`,
  );
  expect(response.status()).toBe(204);
  const faultCookies = (await page.context().cookies()).filter(
    ({ name }) => name === corruptWasmCookieName,
  );
  if (enabled) {
    expect(faultCookies).toEqual([
      expect.objectContaining({
        httpOnly: true,
        name: corruptWasmCookieName,
        sameSite: "Strict",
        value: expect.stringMatching(/^fault-[a-z0-9]+$/),
      }),
    ]);
  } else {
    expect(faultCookies).toEqual([]);
  }
}

async function setCorruptAfterFirstWasm(page: Page, enabled: boolean) {
  const response = await page.request.get(
    `/__e2e__/fault/corrupt-wasm-after-first/${enabled ? "on" : "off"}`,
  );
  expect(response.status()).toBe(204);
  const faultCookies = (await page.context().cookies()).filter(
    ({ name }) => name === corruptAfterFirstWasmCookieName,
  );
  expect(faultCookies).toHaveLength(enabled ? 1 : 0);
}

async function corruptAfterFirstWasmStatus(page: Page) {
  const response = await page.request.get(
    "/__e2e__/fault/corrupt-wasm-after-first/status",
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as { simdWasmRequests: number };
}

async function controlCorruptWasmBarrier(
  page: Page,
  action: "drain" | "hold" | "release",
  holdTimeoutMs?: number,
) {
  const response = await page.request.get(
    `/__e2e__/fault/corrupt-wasm/${action}${
      action === "hold" && holdTimeoutMs !== undefined
        ? `?timeout=${holdTimeoutMs}`
        : ""
    }`,
  );
  expect(response.status()).toBe(204);
}

async function corruptWasmBarrierStatus(page: Page) {
  const response = await page.request.get("/__e2e__/fault/corrupt-wasm/status");
  expect(response.status()).toBe(200);
  return (await response.json()) as { held: boolean; pendingResponses: number };
}

async function waitForShellWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

test("initializes the real release, commits an allowlisted cache, and reopens offline", async ({
  context,
  page,
}) => {
  const requests: string[] = [];
  context.on("request", (request) => requests.push(request.url()));
  await context.addInitScript(() => {
    window.visionCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.visionCspViolations.push(event.effectiveDirective);
    });
  });

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Continue to camera" }).click();
    await expect(
      page.getByRole("status", { name: "Camera status" }),
    ).toContainText("Smart Smile is ready for offline use", {
      timeout: 60_000,
    });
    await expect(
      page.getByRole("heading", { name: "Camera ready" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Help & system status" }).click();
    const help = page.getByRole("dialog", { name: "Help & system status" });
    await expect(help.getByText("MediaPipe").locator("..")).toContainText(
      releaseManifest.runtimeVersion,
    );
    await expect(help.getByText("Model").locator("..")).toContainText(
      `face_landmarker ${releaseManifest.modelVersion}`,
    );
    await expect(help.getByText("Manifest ID").locator("..")).toContainText(
      releaseManifest.releaseId,
    );
    await expect(help.getByText("WASM tier").locator("..")).toContainText(
      /SIMD|Baseline/,
    );
    await page.getByRole("button", { name: "Close system status" }).click();

    const storage = await page.evaluate(async () => ({
      caches: await Promise.all(
        (await window.caches.keys()).map(async (cacheName) => {
          const cache = await window.caches.open(cacheName);
          const entries = await Promise.all(
            (await cache.keys()).map(async (cacheRequest) => ({
              completion: new URL(cacheRequest.url).pathname.startsWith(
                "/__smart-smile/vision-complete/",
              )
                ? await (await cache.match(cacheRequest))?.json()
                : null,
              url: cacheRequest.url,
            })),
          );
          return { cacheName, entries };
        }),
      ),
      cookies: document.cookie,
      indexedDatabases:
        typeof indexedDB.databases === "function"
          ? (await indexedDB.databases()).length
          : 0,
      localStorageEntries: localStorage.length,
      sessionStorageEntries: sessionStorage.length,
    }));
    expect(storage).toMatchObject({
      cookies: "",
      indexedDatabases: 0,
      localStorageEntries: 0,
      sessionStorageEntries: 0,
    });
    expect(await context.cookies()).toEqual([]);
    expect(storage.caches).toHaveLength(2);
    const shellCache = storage.caches.find(({ cacheName }) =>
      cacheName.startsWith("workbox-precache-"),
    );
    const visionCache = storage.caches.find(
      ({ cacheName }) => cacheName === currentCacheName,
    );
    expect(shellCache).toBeDefined();
    expect(visionCache).toBeDefined();
    expect(
      shellCache!.entries.map(({ url }) => new URL(url).pathname).sort(),
    ).toEqual(shellPaths);
    expect(shellPaths).toContainEqual(
      expect.stringMatching(/^\/assets\/release-manifest-[\w-]+\.json$/),
    );
    expect(
      visionCache!.entries.map(({ url }) => new URL(url).pathname).sort(),
    ).toEqual(
      [
        ...releaseManifest.assets.map(({ path }) => path),
        completionPath(releaseManifest.releaseId),
      ].sort(),
    );
    const completion = visionCache!.entries.find(
      ({ url }) =>
        new URL(url).pathname === completionPath(releaseManifest.releaseId),
    )?.completion;
    expect(completion).toEqual({
      assetCount: releaseManifest.assets.filter(
        ({ requiredForOffline }) => requiredForOffline,
      ).length,
      releaseId: releaseManifest.releaseId,
      schemaVersion: 1,
    });
    for (const { cacheName, entries } of storage.caches) {
      expect(cacheName).not.toMatch(forbiddenPersistence);
      for (const { url } of entries) {
        expect(url).not.toMatch(forbiddenPersistence);
        expect(new URL(url).origin).toBe(new URL(page.url()).origin);
      }
    }
    expect(await page.evaluate(() => window.visionCspViolations)).toEqual([]);
    expect(
      requests.every(
        (url) => new URL(url).origin === new URL(page.url()).origin,
      ),
    ).toBe(true);

    await context.setOffline(true);
    await page.close();
    const offlinePage = await context.newPage();
    await offlinePage.goto("/");
    await offlinePage
      .getByRole("button", { name: "Continue to camera" })
      .click();
    await expect(
      offlinePage.getByRole("heading", { name: "Camera ready" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      offlinePage.getByRole("heading", {
        name: "Connect once to finish setup",
      }),
    ).toHaveCount(0);
    expect(
      await offlinePage.evaluate(() => window.visionCspViolations),
    ).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});

test("shows focused first-use-offline recovery without requesting camera", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.visionCameraRequests = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.visionCameraRequests += 1;
      return original(constraints);
    };
  });
  let page = await context.newPage();
  try {
    await page.goto("/");
    await waitForShellWorker(page);
    await page.close();
    await context.setOffline(true);
    page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Continue to camera" }).click();

    const heading = page.getByRole("heading", {
      name: "Connect once to finish setup",
    });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Try again when online" }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.visionCameraRequests)).toBe(0);
    await expect(page.locator("video")).toHaveCount(0);
  } finally {
    await context.setOffline(false);
    await context.close();
  }
});

test("initializes only after cache completion and consumes cached verified WASM", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("/");
    await setCorruptAfterFirstWasm(page, true);
    await page.getByRole("button", { name: "Continue to camera" }).click();

    await expect(
      page.getByRole("heading", { name: "Camera ready" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("status", { name: "Camera status" }),
    ).toContainText("Smart Smile is ready for offline use");
    await expect
      .poll(() => corruptAfterFirstWasmStatus(page))
      .toEqual({ simdWasmRequests: 1 });
  } finally {
    try {
      await setCorruptAfterFirstWasm(page, false);
    } finally {
      await context.close();
    }
  }
});

test("fails closed before worker or camera when Cache Storage cannot commit", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.visionCameraRequests = 0;
    window.visionWorkerCreations = 0;
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.visionCameraRequests += 1;
      return originalGetUserMedia(constraints);
    };
    window.Worker = new Proxy(window.Worker, {
      construct(target, argumentsList) {
        window.visionWorkerCreations += 1;
        return Reflect.construct(target, argumentsList);
      },
    });
  });
  const page = await context.newPage();
  const devtools = await context.newCDPSession(page);
  let origin: string | undefined;
  try {
    await page.goto("/");
    await waitForShellWorker(page);
    origin = new URL(page.url()).origin;
    const quota = await devtools.send("Storage.getUsageAndQuota", { origin });
    await devtools.send("Storage.overrideQuotaForOrigin", {
      origin,
      quotaSize: quota.usage,
    });

    await page.getByRole("button", { name: "Continue to camera" }).click();

    const heading = page.getByRole("heading", {
      name: "Smile detection setup needs attention",
    });
    await expect(heading).toBeVisible({ timeout: 30_000 });
    await expect(heading).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Try setup again" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => ({
        cameraRequests: window.visionCameraRequests,
        workerCreations: window.visionWorkerCreations,
      })),
    ).toEqual({ cameraRequests: 0, workerCreations: 0 });
    await expect(page.locator("video")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          (cacheName) => caches.keys().then((keys) => keys.includes(cacheName)),
          currentCacheName,
        ),
      )
      .toBe(false);
  } finally {
    if (origin !== undefined) {
      await devtools.send("Storage.overrideQuotaForOrigin", { origin });
    }
    await context.close();
  }
});

test("deletes an offline corrupt completed cache and blocks camera", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.visionCameraRequests = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.visionCameraRequests += 1;
      return original(constraints);
    };
  });
  let page = await context.newPage();
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Continue to camera" }).click();
    await expect(
      page.getByRole("heading", { name: "Camera ready" }),
    ).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Stop camera" }).click();
    await page.evaluate(
      async ({ assetPath, cacheName }) => {
        const cache = await caches.open(cacheName);
        await cache.put(assetPath, new Response("corrupt model card"));
      },
      { assetPath: nonRuntimeAssetPath, cacheName: currentCacheName },
    );

    await context.setOffline(true);
    await page.close();
    page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Continue to camera" }).click();

    const heading = page.getByRole("heading", {
      name: "Smart Smile could not start safely",
    });
    await expect(heading).toBeVisible({ timeout: 30_000 });
    await expect(heading).toBeFocused();
    expect(await page.evaluate(() => window.visionCameraRequests)).toBe(0);
    await expect
      .poll(() =>
        page.evaluate(
          (cacheName) => caches.keys().then((keys) => keys.includes(cacheName)),
          currentCacheName,
        ),
      )
      .toBe(false);
  } finally {
    await context.setOffline(false);
    await context.close();
  }
});

test("rejects corrupt WASM without a baseline retry or unsafe residue", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const cleanContext = await browser.newContext();
  await context.addInitScript(() => {
    window.visionCameraTracks = [];
    window.visionCameraRequests = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.visionCameraRequests += 1;
      const stream = await original(constraints);
      window.visionCameraTracks.push(...stream.getVideoTracks());
      return stream;
    };
  });
  const requestedPaths: string[] = [];
  context.on("request", (browserRequest) => {
    requestedPaths.push(new URL(browserRequest.url()).pathname);
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await setCorruptWasm(page, true);
    expect(await cleanContext.cookies()).toEqual([]);
    const [corruptResponse, pristineResponse] = await Promise.all([
      page.request.get(simdWasmPath),
      cleanContext.request.get(simdWasmPath),
    ]);
    expect(corruptResponse.status()).toBe(200);
    expect(pristineResponse.status()).toBe(200);
    expect(corruptResponse.headers()["content-type"]).toBe("application/wasm");
    expect(pristineResponse.headers()["content-type"]).toBe("application/wasm");
    const corruptBytes = await corruptResponse.body();
    const pristineBytes = await pristineResponse.body();
    expect(corruptBytes.length).toBe(pristineBytes.length);
    expect(corruptBytes.subarray(0, -1)).toEqual(pristineBytes.subarray(0, -1));
    expect(corruptBytes.at(-1)).toBe(pristineBytes.at(-1)! ^ 1);
    await page.getByRole("button", { name: "Continue to camera" }).click();

    const recovery = page.locator(".coach-card--recovery");
    const heading = recovery.getByRole("heading", {
      name: "Smart Smile could not start safely",
    });
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await expect(heading).toBeFocused();
    expect((await recovery.innerText()).replace(/\s+/g, " ").trim()).toBe(
      "PRIVATE BY DESIGN Smart Smile could not start safely The required files could not be verified. Reload Smart Smile before using the camera. Camera status: Smart Smile could not start safely. Reload View help You can open Help & system status for a read-only session summary. Help & system status",
    );
    const interactiveControls = recovery.locator(
      'button, a[href], input:not([type="hidden"]), select, textarea, [contenteditable="true"], [role="button"], [role="link"]',
    );
    await expect(interactiveControls).toHaveCount(3);
    const recoveryButtons = recovery.getByRole("button");
    await expect(recoveryButtons).toHaveCount(3);
    expect(
      await recoveryButtons.evaluateAll((buttons) =>
        buttons.map((button) => button.textContent?.trim()),
      ),
    ).toEqual(["Reload", "View help", "Help & system status"]);
    for (const name of ["Reload", "View help", "Help & system status"]) {
      await expect(
        recovery.getByRole("button", { exact: true, name }),
      ).toHaveCount(1);
    }
    const primaryRecoveryActions = recovery.locator(
      ":scope > .camera-actions > button",
    );
    await expect(primaryRecoveryActions).toHaveCount(2);
    expect(await primaryRecoveryActions.allInnerTexts()).toEqual([
      "Reload",
      "View help",
    ]);
    await expect(
      recovery.locator(":scope > button.system-status-trigger"),
    ).toHaveCount(1);
    await expect(
      page.getByRole("status", { name: "Camera status" }),
    ).not.toContainText("Smart Smile is ready for offline use");
    expect(await page.evaluate(() => window.visionCameraRequests)).toBe(0);
    expect(await page.evaluate(() => window.visionCameraTracks.length)).toBe(0);
    const baselinePaths = releaseManifest.assets
      .filter(
        ({ path }) =>
          path.endsWith("vision_wasm_nosimd_internal.js") ||
          path.endsWith("vision_wasm_nosimd_internal.wasm"),
      )
      .map(({ path }) => path);
    expect(baselinePaths).toHaveLength(2);
    expect(
      requestedPaths.filter((path) => baselinePaths.includes(path)),
    ).toEqual([]);
    await expect(page.locator("body")).not.toContainText(
      /TypeError|CompileError|LinkError|DOMException|RuntimeError|\bError\b|failed to fetch|verification (?:failed|error)|verifyVisionResponse|WebAssembly|\bstack\b|\b(?:worker-runtime|runtime-loader|integrity)\.[cm]?[jt]s\b|runtime-integrity-failed|(?:^|\n)\s*at\s+\S+|https?:\/\/|file:\/\/|blob:|data:|[a-z]:\\|\/(?:vision|src|apps|Users)\/|\S+\.wasm\b/im,
    );
    await expect
      .poll(() =>
        page.evaluate(
          async ({ cacheName, markerPath }) => {
            const keys = await caches.keys();
            if (!keys.includes(cacheName)) {
              return { cacheExists: false, completionExists: false };
            }
            const cache = await caches.open(cacheName);
            return {
              cacheExists: true,
              completionExists:
                (await cache.match(new URL(markerPath, location.origin))) !==
                undefined,
            };
          },
          {
            cacheName: currentCacheName,
            markerPath: completionPath(releaseManifest.releaseId),
          },
        ),
      )
      .toEqual({ cacheExists: false, completionExists: false });
  } finally {
    try {
      await setCorruptWasm(page, false);
      expect(await context.cookies()).toEqual([]);
    } finally {
      await Promise.all([context.close(), cleanContext.close()]);
    }
  }
});

test("rolls back a corrupt current release while retaining a completed sentinel", async ({
  browser,
}) => {
  const sentinelReleaseId = "0123456789abcdef";
  const sentinelCacheName = `smart-smile-vision-${sentinelReleaseId}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("/");
    await waitForShellWorker(page);
    await page.evaluate(
      async ({ markerPath, releaseId, sentinelName }) => {
        const cache = await caches.open(sentinelName);
        await cache.put(
          "/vision/sentinel-static.txt",
          new Response("verified sentinel", { status: 200 }),
        );
        await cache.put(
          markerPath,
          Response.json({
            assetCount: 1,
            releaseId,
            schemaVersion: 1,
          }),
        );
      },
      {
        markerPath: completionPath(sentinelReleaseId),
        releaseId: sentinelReleaseId,
        sentinelName: sentinelCacheName,
      },
    );
    await setCorruptWasm(page, true);
    await controlCorruptWasmBarrier(page, "hold");
    await page.getByRole("button", { name: "Continue to camera" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          async ({ cacheName, markerPath }) => {
            if (!(await caches.keys()).includes(cacheName)) return false;
            const cache = await caches.open(cacheName);
            const entries = await cache.keys();
            return (
              entries.length > 0 &&
              (await cache.match(markerPath)) === undefined
            );
          },
          {
            cacheName: currentCacheName,
            markerPath: completionPath(releaseManifest.releaseId),
          },
        ),
      )
      .toBe(true);
    await controlCorruptWasmBarrier(page, "release");
    await expect(
      page.getByRole("heading", {
        name: "Smart Smile could not start safely",
      }),
    ).toBeVisible({ timeout: 60_000 });

    await expect
      .poll(() =>
        page.evaluate(
          async ({
            currentName,
            currentMarker,
            sentinelMarker,
            sentinelName,
          }) => {
            const cacheNames = await caches.keys();
            const sentinel = await caches.open(sentinelName);
            const currentExists = cacheNames.includes(currentName);
            let currentCompletion = false;
            let currentEntries: string[] = [];
            if (currentExists) {
              const current = await caches.open(currentName);
              currentCompletion =
                (await current.match(currentMarker)) !== undefined;
              currentEntries = (await current.keys()).map(
                (request) => request.url,
              );
            }
            return {
              currentCompletion,
              currentEntries,
              currentExists,
              sentinelCompletion:
                (await (await sentinel.match(sentinelMarker))?.json()) ?? null,
              sentinelExists: cacheNames.includes(sentinelName),
            };
          },
          {
            currentMarker: completionPath(releaseManifest.releaseId),
            currentName: currentCacheName,
            sentinelMarker: completionPath(sentinelReleaseId),
            sentinelName: sentinelCacheName,
          },
        ),
      )
      .toEqual({
        currentCompletion: false,
        currentEntries: [],
        currentExists: false,
        sentinelCompletion: {
          assetCount: 1,
          releaseId: sentinelReleaseId,
          schemaVersion: 1,
        },
        sentinelExists: true,
      });
  } finally {
    try {
      await controlCorruptWasmBarrier(page, "release");
    } finally {
      try {
        await setCorruptWasm(page, false);
        expect(await context.cookies()).toEqual([]);
      } finally {
        try {
          if (!page.isClosed()) {
            await page.evaluate(
              async ({ currentName, sentinelName }) => {
                await caches.delete(currentName);
                await caches.delete(sentinelName);
              },
              {
                currentName: currentCacheName,
                sentinelName: sentinelCacheName,
              },
            );
          }
        } finally {
          await context.close();
        }
      }
    }
  }
});

test("auto-releases an abandoned held corrupt response", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let pendingResponse: Promise<APIResponse> | undefined;
  try {
    await page.goto("/");
    await setCorruptWasm(page, true);
    await controlCorruptWasmBarrier(page, "hold", 1_000);
    pendingResponse = page.request.get(simdWasmPath);
    await expect
      .poll(() => corruptWasmBarrierStatus(page))
      .toEqual({ held: true, pendingResponses: 1 });
    expect((await pendingResponse).status()).toBe(200);
    await expect
      .poll(() => corruptWasmBarrierStatus(page))
      .toEqual({ held: false, pendingResponses: 0 });
  } finally {
    try {
      await controlCorruptWasmBarrier(page, "release");
      await pendingResponse?.catch(() => undefined);
    } finally {
      try {
        await setCorruptWasm(page, false);
      } finally {
        await context.close();
      }
    }
  }
});

test("drains held corrupt responses through the shutdown cleanup path", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let pendingResponse: Promise<APIResponse> | undefined;
  try {
    await page.goto("/");
    await setCorruptWasm(page, true);
    await controlCorruptWasmBarrier(page, "hold");
    pendingResponse = page.request.get(simdWasmPath);
    await expect
      .poll(() => corruptWasmBarrierStatus(page))
      .toEqual({ held: true, pendingResponses: 1 });
    await controlCorruptWasmBarrier(page, "drain");
    expect((await pendingResponse).status()).toBe(200);
    await expect(corruptWasmBarrierStatus(page)).resolves.toEqual({
      held: false,
      pendingResponses: 0,
    });
  } finally {
    try {
      await controlCorruptWasmBarrier(page, "release");
      await pendingResponse?.catch(() => undefined);
    } finally {
      try {
        await setCorruptWasm(page, false);
      } finally {
        await context.close();
      }
    }
  }
});

declare global {
  interface Window {
    visionCameraRequests: number;
    visionCameraTracks: MediaStreamTrack[];
    visionCspViolations: string[];
    visionWorkerCreations: number;
  }
}
