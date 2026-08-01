import { readFileSync } from "node:fs";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

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
const completionPath = (releaseId: string) =>
  `/__smart-smile/vision-complete/${releaseId}`;
const forbiddenPersistence =
  /blob:|data:|camera|frame|photo|landmarks?(?:$|[/?#._-])|geometry|diagnostic|device[-_ ]?(?:label|id)/i;

test.describe.configure({ mode: "serial" });

async function setCorruptWasm(request: APIRequestContext, enabled: boolean) {
  const response = await request.get(
    `/__e2e__/fault/corrupt-wasm/${enabled ? "on" : "off"}`,
  );
  expect(response.status()).toBe(204);
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

test("rejects corrupt WASM without a baseline retry or unsafe residue", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.visionCameraTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
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
    await setCorruptWasm(request, true);
    await page.getByRole("button", { name: "Continue to camera" }).click();

    const heading = page.getByRole("heading", {
      name: "Smart Smile could not start safely",
    });
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await expect(heading).toBeFocused();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Camera status" }),
    ).not.toContainText("Smart Smile is ready for offline use");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.visionCameraTracks.length > 0 &&
            window.visionCameraTracks.every(
              (track) => track.readyState === "ended",
            ),
        ),
      )
      .toBe(true);
    const baselineWasmPath = releaseManifest.assets.find(({ path }) =>
      path.endsWith("vision_wasm_nosimd_internal.wasm"),
    )!.path;
    expect(
      requestedPaths.filter((path) => path === baselineWasmPath).length,
    ).toBeLessThanOrEqual(1);
    await expect(page.locator("body")).not.toContainText(
      /runtime-integrity-failed|VisionRuntimeError|Vision runtime failed|WebAssembly\./,
    );
    await expect
      .poll(() =>
        page.evaluate(
          async ({ cacheName, markerPath }) => {
            const keys = await caches.keys();
            const cache = await caches.open(cacheName);
            return {
              cacheExists: keys.includes(cacheName),
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
      await setCorruptWasm(request, false);
    } finally {
      await context.close();
    }
  }
});

test("rolls back a corrupt current release while retaining a completed sentinel", async ({
  browser,
  request,
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
    await setCorruptWasm(request, true);
    await page.getByRole("button", { name: "Continue to camera" }).click();
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
            const current = await caches.open(currentName);
            const sentinel = await caches.open(sentinelName);
            return {
              currentCompletion:
                (await current.match(currentMarker)) !== undefined,
              currentExists: cacheNames.includes(currentName),
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
      await setCorruptWasm(request, false);
    } finally {
      if (!page.isClosed()) {
        await page.evaluate(
          async ({ currentName, sentinelName }) => {
            await caches.delete(currentName);
            await caches.delete(sentinelName);
          },
          { currentName: currentCacheName, sentinelName: sentinelCacheName },
        );
      }
      await context.close();
    }
  }
});

declare global {
  interface Window {
    visionCameraRequests: number;
    visionCameraTracks: MediaStreamTrack[];
    visionCspViolations: string[];
  }
}
