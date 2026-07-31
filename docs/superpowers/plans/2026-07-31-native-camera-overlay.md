# Native Camera Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active camera session’s phone-unfriendly coach layout with the approved, responsive Native Camera Overlay while preserving the proven one-tap camera switching and privacy behavior.

**Architecture:** Keep `CameraSession` and `useCameraSession` unchanged as the sole camera-domain owners. Rearrange only `App.tsx` active-session markup into semantic top and bottom overlay regions, then add isolated active-session CSS and Playwright coverage for responsive geometry, contrast, zoom, safe areas, and reduced motion.

**Tech Stack:** React 19, TypeScript 6, CSS, Radix Dialog, Vitest, Testing Library, Playwright, Vite

## Global Constraints

- Do not modify `apps/web/src/camera/session.ts` or its camera ownership, facing-mode, generation, warm-up, interruption, or stale-result behavior.
- Mobile Switch camera remains one semantic toggle per activation: `user → environment → user`.
- The preview remains mirrored with `transform: scaleX(-1)` and uncropped with `object-fit: contain`; source semantics remain unmirrored.
- The active session shows only product identity, Help, one current camera status, Stop, and conditional Switch camera.
- Stop and Switch camera remain at least 48 by 48 CSS pixels.
- Use `env(safe-area-inset-*)` padding and keep every action reachable in portrait, landscape, 200 percent zoom, and 400 percent reflow.
- Status is real semantic DOM text with polite announcements; video and face-guide geometry remain hidden from assistive technology.
- Target WCAG 2.2 AA: normal text contrast at least 4.5:1 and controls, focus indicators, and meaningful graphics at least 3:1.
- Backdrop blur is progressive enhancement; an opaque-enough scrim must provide contrast without it.
- Respect `prefers-reduced-motion`.
- Help remains a read-only diagnostics surface and must not change the camera generation.
- Add no inference, capture, analytics, persistence, upload, service worker, or runtime/model network behavior.

## File Structure

- Modify `apps/web/src/App.tsx`: derive overlay presentation state and render the active session’s semantic top/status/control regions.
- Modify `apps/web/src/App.test.tsx`: prove overlay semantics, action order, busy switching, Stop availability, and Help stability.
- Modify `apps/web/src/styles.css`: own the approved visual treatment, responsive geometry, safe areas, zoom reflow, focus, contrast, and reduced motion.
- Create `apps/web/e2e/camera-overlay.spec.ts`: own browser-level responsive, visual, contrast, focus-order, and reflow checks for the overlay.
- Modify `docs/validation/README.md`: record the new automated overlay evidence.
- Modify `.scratch/smart-smile-pwa/issues/02-start-privacy-first-responsive-camera-session.md`: record implementation evidence and leave final real-phone visual approval explicit.

---

### Task 1: Build the Semantic Active-Session Overlay

**Files:**

- Modify: `apps/web/src/App.tsx:157-445`
- Modify: `apps/web/src/App.test.tsx:1-420`

**Interfaces:**

- Consumes: `useCameraSession(): { restart, snapshot, start, stop, switchCamera, videoRef }`
- Consumes: `CameraSnapshot.state`, `CameraSnapshot.reason`, and `CameraSnapshot.canSwitch`
- Produces: `sessionOverlayVisible: boolean`, `switchVisible: boolean`, and `switchBusy: boolean`
- Produces: `.camera-session-overlay`, `.session-chrome__top`, `.session-chrome__bottom`, `.session-status`, `.session-controls`, `.session-control--stop`, and `.session-control--switch`
- Preserves: buttons named `Help & system status`, `Stop camera`, and `Switch camera`

- [ ] **Step 1: Write the failing semantic overlay test**

Add `within` to the Testing Library import and add this test to
`apps/web/src/App.test.tsx`:

```tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

it("renders an active semantic overlay and blocks duplicate switching without hiding Stop", async () => {
  const first = makeStream();
  const getUserMedia = vi
    .fn()
    .mockResolvedValueOnce(first.stream)
    .mockImplementationOnce(() => new Promise<MediaStream>(() => undefined));
  installCamera(getUserMedia, [
    {
      deviceId: "first-camera",
      groupId: "camera-group",
      kind: "videoinput",
      label: "",
    },
    {
      deviceId: "second-camera",
      groupId: "camera-group",
      kind: "videoinput",
      label: "",
    },
  ] as MediaDeviceInfo[]);
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Continue to camera" }));
  const video = await screen.findByLabelText("Live camera preview");
  fireEvent.loadedData(video);

  const overlay = await screen.findByRole("region", {
    name: "Live camera controls",
  });
  expect(within(overlay).getByRole("status")).toHaveTextContent(
    "Getting ready",
  );
  expect(screen.queryByText("Private by design")).not.toBeInTheDocument();

  const help = within(overlay).getByRole("button", {
    name: "Help & system status",
  });
  const stop = within(overlay).getByRole("button", { name: "Stop camera" });
  const switchButton = within(overlay).getByRole("button", {
    name: "Switch camera",
  });
  expect(
    help.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    stop.compareDocumentPosition(switchButton) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  fireEvent.click(help);
  expect(
    screen.getByRole("dialog", { name: "Help & system status" }),
  ).toHaveTextContent("Generation1");
  fireEvent.click(screen.getByRole("button", { name: "Close system status" }));
  expect(help).toHaveFocus();
  expect(getUserMedia).toHaveBeenCalledTimes(1);

  fireEvent.click(switchButton);

  expect(stop).toBeEnabled();
  expect(switchButton).toBeDisabled();
  expect(switchButton).toHaveAttribute("aria-busy", "true");
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the new test and verify the current coach layout fails it**

Run:

```bash
npm run test --workspace=@smart-smile/web -- App.test.tsx -t "renders an active semantic overlay"
```

Expected: FAIL because no region named `Live camera controls` exists and the active
content still renders in `.coach-card`.

- [ ] **Step 3: Add an overlay variant to `SystemStatus`**

Change its props and trigger markup in `apps/web/src/App.tsx`:

```tsx
function SystemStatus({
  openRequest,
  onOpenRequestHandled,
  snapshot,
  variant = "default",
}: {
  openRequest: boolean;
  onOpenRequestHandled: () => void;
  snapshot: CameraSnapshot;
  variant?: "default" | "overlay";
}) {
```

Replace only the existing `Dialog.Trigger` with this exact trigger, leaving the
existing state, focus restoration, and `NativeDialog` sibling unchanged:

```tsx
<Dialog.Trigger
  className={`secondary-action system-status-trigger${
    variant === "overlay" ? " system-status-trigger--overlay" : ""
  }`}
  ref={triggerRef}
  type="button"
>
  {variant === "overlay" && (
    <span aria-hidden="true" className="system-status-trigger__icon">
      ?
    </span>
  )}
  <span className={variant === "overlay" ? "visually-hidden" : undefined}>
    Help &amp; system status
  </span>
</Dialog.Trigger>
```

Do not duplicate the diagnostics dialog or move diagnostics into the active-session
status.

- [ ] **Step 4: Align switch-recovery status with the approved copy**

Change only the `switch-failed` heading in `errorCopy`:

```tsx
"switch-failed": {
  action: "Switch camera",
  heading: "Could not switch cameras",
  text: "The other camera could not start. You can keep using this preview or try switching again.",
},
```

In the existing `renders the actionable switch-failure recovery while retaining the
preview` component test, replace the heading expectation with:

```tsx
expect(
  await screen.findByRole("heading", {
    name: "Could not switch cameras",
  }),
).toBeVisible();
expect(screen.getByLabelText("Camera status")).toHaveTextContent(
  "Camera status: Could not switch cameras.",
);
```

Keep the existing stream-retention, retry, focus, and aria-atomic assertions.

- [ ] **Step 5: Derive presentation-only overlay flags**

Immediately after the existing `active` and `recovery` derivations in `App`, add:

```tsx
const sessionOverlayVisible =
  snapshot.state === "camera-starting" ||
  snapshot.state === "camera-switching" ||
  snapshot.state === "warm-up" ||
  snapshot.state === "ready" ||
  snapshot.reason === "switch-failed";
const switchBusy = snapshot.state === "camera-switching";
const switchVisible =
  (snapshot.canSwitch || snapshot.reason === "switch-failed") &&
  (snapshot.state === "camera-switching" ||
    snapshot.state === "warm-up" ||
    snapshot.state === "ready" ||
    snapshot.reason === "switch-failed");
```

These flags may choose markup and disabled state only. They must not be passed into or
used to alter `CameraSession`.

- [ ] **Step 6: Render the active overlay inside `camera-stage`**

Use conditional shell/stage class names, keep the existing video and capture zone, and
insert this markup after the capture zone:

```tsx
{
  sessionOverlayVisible && (
    <section
      aria-label="Live camera controls"
      className="camera-session-overlay"
    >
      <header className="session-chrome__top">
        <span className="wordmark wordmark--overlay">Smart Smile</span>
        <SystemStatus
          openRequest={helpRequest}
          onOpenRequestHandled={() => setHelpRequest(false)}
          snapshot={snapshot}
          variant="overlay"
        />
      </header>
      <div className="session-chrome__bottom">
        <div
          aria-atomic="true"
          aria-label="Camera status"
          aria-live="polite"
          className="session-status"
          role="status"
        >
          <span aria-hidden="true" className="session-status__dot" />
          <h1 id="camera-heading" ref={recoveryHeadingRef} tabIndex={-1}>
            {copy.heading}
          </h1>
        </div>
        <p className="visually-hidden">{copy.text}</p>
        <div className="session-controls">
          <button
            className="session-control session-control--stop"
            onClick={stop}
            type="button"
          >
            <span aria-hidden="true">■</span>
            Stop camera
          </button>
          {switchVisible && (
            <button
              aria-busy={switchBusy || undefined}
              className="session-control session-control--switch"
              disabled={switchBusy}
              onClick={switchCamera}
              ref={
                snapshot.reason === "switch-failed"
                  ? primaryActionRef
                  : undefined
              }
              type="button"
            >
              <span aria-hidden="true">↻</span>
              Switch camera
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
```

Apply these class names to the existing ancestors:

```tsx
<div
  className={`app-shell${
    sessionOverlayVisible ? " app-shell--camera-active" : ""
  }`}
>
  {!sessionOverlayVisible && (
    <header className="site-header">
      <a
        aria-label="Smart Smile home"
        className="wordmark"
        href="#main-content"
      >
        Smart Smile
      </a>
      <div className="header-actions">
        <span className="privacy-status">On-device</span>
        <PrivacyDisclosure />
      </div>
    </header>
  )}
  <main
    className={`foundation-layout${
      sessionOverlayVisible ? " foundation-layout--camera-active" : ""
    }`}
    id="main-content"
  >
    <section
      aria-label="Camera preview"
      className={`camera-stage${
        sessionOverlayVisible ? " camera-stage--session" : ""
      }`}
    >
```

Render the existing `.coach-card` and `.site-footer` only when
`sessionOverlayVisible` is false. The privacy introduction, permission prompt,
stopped view, and focused recovery views retain their existing structure. Remove the
old `SystemStatus` occurrence from `.coach-card` only after keeping one default
`SystemStatus` there for non-overlay states.

- [ ] **Step 7: Preserve switch-failure focus and active actions**

Keep the current focus effect:

```tsx
useLayoutEffect(() => {
  if (snapshot.reason === "switch-failed") primaryActionRef.current?.focus();
  else if (recovery) recoveryHeadingRef.current?.focus();
}, [recovery, snapshot.reason]);
```

The overlay’s Stop button calls `stop` directly. Its Switch button calls
`switchCamera` directly. Do not route either through a new camera command or change
`runAction`.

- [ ] **Step 8: Run focused component tests**

Run:

```bash
npm run test --workspace=@smart-smile/web -- App.test.tsx
```

Expected: all `App.test.tsx` tests PASS, including switch failure, interruption,
diagnostics focus restoration, and the new busy-switch test.

- [ ] **Step 9: Commit the semantic overlay**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat: add semantic native camera overlay"
```

---

### Task 2: Apply the Approved Native Camera Visual Treatment

**Files:**

- Modify: `apps/web/src/styles.css:3-558`
- Create: `apps/web/e2e/camera-overlay.spec.ts`

**Interfaces:**

- Consumes: the Task 1 class names and accessible button names
- Produces: `--overlay-scrim`, `--overlay-border`, `.visually-hidden`, full-stage active geometry, protected top chrome, visible status pill, and two-action bottom dock
- Preserves: `.camera-preview { object-fit: contain; transform: scaleX(-1); }`

- [ ] **Step 1: Write the failing browser-level layout test**

Create `apps/web/e2e/camera-overlay.spec.ts`:

```ts
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

  await expect(page.getByLabel("Live camera preview")).toHaveCSS(
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
```

- [ ] **Step 2: Run the layout test and verify it fails**

Run:

```bash
npm run web:e2e -- camera-overlay.spec.ts --grep "portrait phone"
```

Expected: FAIL because the stage still has page padding and the overlay classes do not
yet have full-stage positioning or protected control styling.

- [ ] **Step 3: Add overlay tokens and the reusable visually-hidden utility**

Add these tokens to `:root` and this utility near the global focus rules:

```css
:root {
  --overlay-scrim: rgb(13 28 23 / 0.82);
  --overlay-border: rgb(255 255 255 / 0.28);
  --overlay-text: #ffffff;
  --overlay-stop: rgb(105 30 30 / 0.92);
  --overlay-stop-text: #ffe4e1;
  --overlay-switch: #f7fffc;
  --overlay-switch-text: #0b5f4b;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Add the base active-session geometry after existing responsive rules**

Place these rules after the existing `@media (max-width: 560px)` block and before the
existing reduced-motion block so they override the old coach layout only when active:

```css
.app-shell--camera-active {
  position: relative;
  display: block;
  min-height: 100dvh;
  padding: clamp(8px, 2vw, 16px);
  background: var(--canvas);
}

.foundation-layout--camera-active {
  display: block;
  width: 100%;
  height: calc(100dvh - clamp(16px, 4vw, 32px));
  padding: 0;
}

.camera-stage--session {
  width: min(100%, 1120px);
  height: 100%;
  min-height: 0;
  margin-inline: auto;
  border-radius: 24px;
}

.camera-stage--session .camera-preview {
  position: absolute;
  inset: 0;
  min-height: 0;
}

.camera-session-overlay {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: grid;
  box-sizing: border-box;
  grid-template-rows: auto 1fr auto;
  color: var(--overlay-text);
  pointer-events: none;
}

.session-chrome__top,
.session-chrome__bottom {
  position: relative;
  z-index: 1;
  pointer-events: auto;
}

.session-chrome__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: max(16px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right)) 12px
    max(16px, env(safe-area-inset-left));
}

.wordmark--overlay {
  color: var(--overlay-text);
  text-shadow: 0 2px 8px rgb(0 0 0 / 0.65);
}

.system-status-trigger--overlay {
  display: grid;
  width: 48px;
  height: 48px;
  margin: 0;
  padding: 0;
  border-color: var(--overlay-border);
  border-radius: 50%;
  background: var(--overlay-scrim);
  color: var(--overlay-text);
  place-items: center;
  backdrop-filter: blur(14px);
}

.system-status-trigger__icon {
  font-size: 1rem;
  font-weight: 800;
}

.session-chrome__bottom {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 12px max(14px, env(safe-area-inset-right))
    max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
}

.session-status {
  display: flex;
  min-height: 40px;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 8px 14px;
  border: 1px solid var(--overlay-border);
  border-radius: 999px;
  background: var(--overlay-scrim);
  color: var(--overlay-text);
  backdrop-filter: blur(14px);
}

.session-status h1 {
  color: inherit;
  font-size: 0.875rem;
  letter-spacing: 0;
  line-height: 1.25;
}

.session-status__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #43d6a9;
  box-shadow: 0 0 0 4px rgb(67 214 169 / 0.2);
}

.session-controls {
  display: grid;
  width: min(100%, 30rem);
  box-sizing: border-box;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--overlay-border);
  border-radius: 22px;
  background: var(--overlay-scrim);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.3);
  backdrop-filter: blur(16px);
}

.session-control {
  display: inline-flex;
  min-width: 48px;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 15px;
  font-weight: 750;
}

.session-control--stop {
  border: 1px solid rgb(255 170 170 / 0.55);
  background: var(--overlay-stop);
  color: var(--overlay-stop-text);
}

.session-control--switch {
  border: 1px solid transparent;
  background: var(--overlay-switch);
  color: var(--overlay-switch-text);
}

.session-control--switch:disabled {
  cursor: progress;
  opacity: 0.72;
}

.session-control:focus-visible,
.system-status-trigger--overlay:focus-visible {
  outline-color: #a99cff;
  box-shadow: 0 0 0 3px rgb(16 22 21 / 0.8);
}
```

- [ ] **Step 5: Make portrait mobile truly full-stage**

Add this active-only mobile rule after the base overlay rules:

```css
@media (max-width: 767px) {
  .app-shell--camera-active {
    padding: 0;
  }

  .foundation-layout--camera-active {
    height: 100dvh;
  }

  .camera-stage--session {
    width: 100%;
    height: 100dvh;
    border-radius: 0;
  }

  .camera-stage--session .capture-zone {
    width: min(58%, 14rem);
  }
}
```

- [ ] **Step 6: Run the portrait overlay test and the existing responsive journey**

Run:

```bash
npm run web:e2e -- camera-overlay.spec.ts --grep "portrait phone"
npm run web:e2e -- foundation.spec.ts --grep "complete mobile camera journey"
```

Expected: both tests PASS and the attached screenshot shows a full-stage contained
preview, protected Help button, visible status, and stable bottom dock.

- [ ] **Step 7: Commit the approved visual treatment**

```bash
git add apps/web/src/styles.css apps/web/e2e/camera-overlay.spec.ts
git commit -m "feat: style native camera overlay"
```

---

### Task 3: Harden Responsive Reflow, Contrast, and Focus

**Files:**

- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/camera-overlay.spec.ts`

**Interfaces:**

- Consumes: Task 2’s `.camera-stage--session` and overlay regions
- Produces: a normal-flow fallback at CSS viewports no taller than 300 pixels
- Produces: verified focus order `Help & system status → Stop camera → Switch camera`
- Produces: deterministic light/dark scrim contrast checks and reduced-motion evidence

- [ ] **Step 1: Add failing landscape, zoom, and focus tests**

Append to `apps/web/e2e/camera-overlay.spec.ts`:

```ts
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
  const video = page.getByLabel("Live camera preview");
  const status = overlay.getByRole("status");
  await expect(overlay).toHaveCSS("position", "static");

  const videoBox = await video.boundingBox();
  const statusBox = await status.boundingBox();
  expect(statusBox!.y).toBeGreaterThanOrEqual(videoBox!.y + videoBox!.height);

  for (const name of ["Help & system status", "Stop camera", "Switch camera"]) {
    const control = overlay.getByRole("button", { name });
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
  }
});

test("uses the approved keyboard order in the active session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await exposeSecondCamera(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue to camera" }).click();

  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  for (const name of ["Help & system status", "Stop camera", "Switch camera"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name })).toBeFocused();
  }
});
```

- [ ] **Step 2: Run the new responsive tests and verify the short viewport fails**

Run:

```bash
npm run web:e2e -- camera-overlay.spec.ts --grep "400 percent|keyboard order|landscape-phone"
```

Expected: the 400-percent-equivalent test FAILS because the overlay remains absolutely
positioned instead of entering normal flow.

- [ ] **Step 3: Add the short-viewport normal-flow fallback**

Add after the active mobile rule:

```css
@media (max-height: 300px) {
  .app-shell--camera-active {
    min-height: 100%;
    padding: 8px;
    overflow: visible;
  }

  .foundation-layout--camera-active {
    height: auto;
  }

  .camera-stage--session {
    display: block;
    height: auto;
    min-height: 0;
    overflow: visible;
    border-radius: 16px;
  }

  .camera-stage--session .camera-preview {
    position: relative;
    display: block;
    height: max(10rem, 55dvh);
  }

  .camera-stage--session .capture-zone {
    display: none;
  }

  .camera-session-overlay {
    position: static;
    display: grid;
    grid-template-rows: auto auto;
    background: var(--camera-surround);
  }

  .session-chrome__top {
    padding: 10px;
  }

  .session-chrome__bottom {
    padding: 0 10px 10px;
  }

  .session-status,
  .session-controls {
    width: 100%;
  }
}
```

- [ ] **Step 4: Add deterministic contrast and reduced-motion tests**

Append these helpers and test to `camera-overlay.spec.ts`:

```ts
function linearChannel(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: [number, number, number]) {
  return (
    0.2126 * linearChannel(red) +
    0.7152 * linearChannel(green) +
    0.0722 * linearChannel(blue)
  );
}

function contrast(
  first: [number, number, number],
  second: [number, number, number],
) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

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
  ]) {
    const scrim = await page.locator(selector).evaluate((element) => {
      const match = getComputedStyle(element).backgroundColor.match(/[\d.]+/g);
      return match?.map(Number) ?? [];
    });
    expect(scrim).toHaveLength(4);
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
      const parse = (value: string) =>
        (value
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? []) as [number, number, number];
      return {
        background: parse(styles.backgroundColor),
        foreground: parse(styles.color),
      };
    });
    expect(
      contrast(colors.foreground, colors.background),
    ).toBeGreaterThanOrEqual(4.5);
  }

  await expect(page.locator(".session-controls")).toHaveCSS(
    "transition-duration",
    /0.01ms|0s/,
  );
});
```

The existing global reduced-motion selector applies the transition duration; do not add
animation to the overlay.

- [ ] **Step 5: Run the complete overlay E2E file**

Run:

```bash
npm run web:e2e -- camera-overlay.spec.ts
```

Expected: all overlay tests PASS at portrait, landscape, tablet, desktop, reduced
motion, keyboard, contrast, and 400-percent-equivalent reflow.

- [ ] **Step 6: Run all web component and browser tests**

Run:

```bash
npm run web:test
npm run web:e2e
```

Expected: all existing Ticket 01 and Ticket 02 tests PASS without changes to the
camera-session domain tests.

- [ ] **Step 7: Commit responsive and accessibility hardening**

```bash
git add apps/web/src/styles.css apps/web/e2e/camera-overlay.spec.ts
git commit -m "test: harden camera overlay accessibility"
```

---

### Task 4: Verify the Complete Product Gate and Record Evidence

**Files:**

- Modify: `docs/validation/README.md`
- Modify: `.scratch/smart-smile-pwa/issues/02-start-privacy-first-responsive-camera-session.md`

**Interfaces:**

- Consumes: Tasks 1–3 implementation and automated test evidence
- Produces: reproducible validation commands and an explicit final phone visual-review gate
- Preserves: the repository’s 38-test Python reference gate

- [ ] **Step 1: Run formatting, lint, type, unit, build, and browser gates**

Run each command separately from the repository root:

```bash
npm run web:format:check
npm run web:lint
npm run web:typecheck
npm run web:test
npm run web:build
npm run web:e2e
```

Expected: every command exits zero. Record the exact Vitest and Playwright counts from
the command output.

- [ ] **Step 2: Run the unchanged Python reference gate**

Run:

```bash
make python-test
make python-format-check
make python-lint
make python-mypy
```

Expected: 38 Python tests PASS; Ruff formatting, Ruff lint, and strict mypy PASS.

- [ ] **Step 3: Run repository hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` prints nothing. Before the documentation commit,
`git status --short` lists only the two evidence documents.

- [ ] **Step 4: Record automated overlay evidence**

Update `docs/validation/README.md` so its Ticket 02 paragraph explicitly includes:

```markdown
The active-session Native Camera Overlay is additionally checked at 390x844,
844x390, 768x1024, 1440x900, and the 360x225 400-percent reflow equivalent.
The checks cover semantic status, Help/Stop/Switch focus order, 48-pixel targets,
full-stage portrait geometry, short-height normal-flow fallback, reduced motion,
and scrim contrast against representative black and white camera frames.
```

Keep the existing privacy, storage, network, switching, and Python evidence.

- [ ] **Step 5: Record implementation status without claiming unperformed phone review**

Append this section to
`.scratch/smart-smile-pwa/issues/02-start-privacy-first-responsive-camera-session.md`:

```markdown
## Native Camera Overlay implementation

The approved active-session design is implemented as presentation-only React and CSS.
Camera ownership, one-tap mobile facing-mode toggling, generation, warm-up,
interruption recovery, diagnostics allowlisting, and privacy behavior remain owned by
the existing camera session.

Automated acceptance covers semantic status and controls, busy switching, portrait,
landscape, tablet, desktop, 200/400 percent reflow equivalents, safe-area padding,
focus order, touch targets, reduced motion, scrim contrast, zero application camera
traffic, and empty browser storage. The final implementation remains pending one human
phone visual review of the new overlay before Ticket 02 is closed.

The final human review covers phone portrait and landscape, one-tap
front/rear/front switching, bright and dark camera scenes, Stop/Restart/Help,
one-handed touch comfort, VoiceOver or TalkBack announcements, and MacBook keyboard
behavior.
```

Change the top status to:

```text
Status: Native Camera Overlay implemented and automated — final phone visual review pending
```

- [ ] **Step 6: Commit validation evidence**

```bash
git add docs/validation/README.md .scratch/smart-smile-pwa/issues/02-start-privacy-first-responsive-camera-session.md
git commit -m "docs: record native camera overlay validation"
```

- [ ] **Step 7: Confirm the implementation branch is ready for preview**

Run:

```bash
git status --short --branch
git log -5 --oneline
```

Expected: the worktree is clean; the four implementation commits appear above
`docs: approve native camera overlay design`. Push and Cloudflare preview deployment
remain a separate handoff action after the implementation review.
