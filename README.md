# Smart Smile

Smart Smile is migrating to a responsive PWA. The existing Python desktop application is
preserved as a frozen behavior reference in `apps/desktop-reference`; new product work will
land in the web application.

## Delivery definitions

- **Web** is the responsive browser application in `apps/web`, built as static assets for
  Cloudflare Pages.
- **Local** is a developer-owned machine. It can run the fast Vite development server or
  locally preview the exact production build.
- **Mobile** is the same Web application in a touch-first mobile browser; it is not a native
  iOS or Android application.

## Web development and validation

Run these commands from the repository root:

```bash
nvm use
npm install --global npm@10.9.7
npm ci
npm run web:dev
```

The development command starts Vite. For a real production-build preview, use a second
terminal after stopping the development server:

```bash
npm run web:build
npm run web:preview
```

### Windows local setup

Use Node.js `22.22.2` and run the following commands in PowerShell from the directory where
you keep projects:

```powershell
git clone https://github.com/v89intern-superai/smart_smile.git smart_smile-windows
cd smart_smile-windows
npm install --global npm@10.9.7
npm ci
npm run web:vision:check
npm run web:dev
```

Open the localhost URL printed by Vite and allow camera access in the browser. If this project
was cloned on Windows before the repository added its cross-platform line-ending rules, a
normal `git pull` can leave the vendored vision files as CRLF and produce a false "manifest is
out of date" error. Do **not** regenerate the manifest in that situation; clone the latest
`main` branch into a new folder using the commands above. If an older Smart Smile screen still
appears afterward, clear the browser's site data for localhost once and reopen the Vite URL.

### Docker local setup

Docker provides the same web runtime on macOS, Windows, and Linux. From the repository root,
run:

```bash
docker compose up --build
```

Then open [http://localhost:4173/](http://localhost:4173/) and allow camera access. The default
Docker build uses demo delivery mode and never sends an email. To test the optional Google Apps
Script delivery, set `VITE_SMART_SMILE_EMAIL_MODE=apps-script` and
`VITE_SMART_SMILE_EMAIL_ENDPOINT` before `docker compose up --build`. See the
[Docker deployment guide](docs/deployment/docker.md) for macOS, Windows PowerShell, and camera
security notes.

Run the complete web quality gates with:

```bash
npm run web:format:check
npm run web:lint
npm run web:typecheck
npm run web:test
npx playwright install chromium
npm run web:build
npm run web:e2e
```

## Capture journey and email delivery

When the browser verifies a smile, Smart Smile now runs this participant journey:

1. Hold a verified smile for 3 seconds.
2. Show a visible 3-second countdown.
3. Capture a three-frame burst and keep the clearest frame that passes the quality gate.
4. Show the original room photo beside the selected preview.
5. Let the participant choose Original room, Warm studio, or Sky blue.
6. Ask for first name, last name, optional nickname, email address, and explicit consent before delivery.

Local development uses a safe demo delivery mode by default; it never sends the photo and
the completion message says so. To enable real delivery, build the web app with:

```bash
VITE_SMART_SMILE_EMAIL_MODE=server \
VITE_SMART_SMILE_EMAIL_ENDPOINT=/api/send-photo.php \
npm run web:build
```

Serve the resulting `apps/web/dist` from a PHP-capable host so `api/send-photo.php` executes.
Configure `RESEND_API_KEY`, `SMART_SMILE_FROM`, and (recommended)
`SMART_SMILE_ALLOWED_ORIGIN` in the PHP server environment. The Resend key must never be a
`VITE_` variable or committed to the repository. The endpoint validates the email, consent,
image type and size, rate-limits requests, forwards an idempotency key, and deletes its
temporary photo file after the provider request.

For the zero-cost classroom demo, Google Apps Script is supported as an optional delivery mode.
Use the manager/team-owned deployment and follow [the Google Apps Script deployment guide](docs/deployment/google-apps-script.md).
The Apps Script request is intentionally fire-and-forget because a public Apps Script Web App
does not provide a browser-readable CORS response. The UI reports that the request was submitted,
not that the recipient's inbox accepted it. The default GitHub Pages build remains mock mode until
the repository variables `SMART_SMILE_EMAIL_MODE` and `SMART_SMILE_EMAIL_ENDPOINT` are configured.

## Offline vision runtime

The self-hosted, on-device vision runtime powers face landmarks, blendshapes, smile
verification, and post-capture person segmentation. No dataset is collected and no custom
model is trained.

The pinned release is `@mediapipe/tasks-vision@0.10.35` with the official Face
Landmarker `float16/1` model. Its generated, checked-in manifest is
`apps/web/src/vision/generated/release-manifest.json` (release ID
`c8e4fbace24ccdb3`); immutable runtime files are under
`apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/`.

To intentionally refresh vendored assets and then verify that the committed
manifest exactly matches them, run:

```bash
npm run vision:vendor --workspace=@smart-smile/web
npm run web:vision:check
npm run web:build
npm run web:e2e -- vision-runtime.spec.ts
```

`vision:vendor` changes the checked-in release only when an explicitly reviewed
upgrade is intended. See the [architecture](docs/architecture/README.md),
[privacy boundary](docs/privacy/README.md), [validation guide](docs/validation/README.md),
and [third-party notices](THIRD_PARTY_NOTICES.md) before redistributing it.

`web:build` creates `apps/web/dist` once. `web:e2e` serves that exact bundle with the committed
production headers and checks the shell at 390x844, 844x390, 768x1024, and 1440x900. The tests
attach one screenshot for each named viewport.

## Python desktop reference

Run these commands from the repository root:

```bash
make python-sync
make python-test
make python-format-check
make python-lint
make python-mypy
make python-run
```

`python-run` opens the local desktop camera preview. On first launch, allow camera access
when macOS asks. Press `q` or Escape to exit; pass `--debug` by running
`cd apps/desktop-reference && uv run smart-smile --debug`.

The supported native macOS environment is Apple Silicon on macOS 13 or later. Platform locks,
the verified Face Landmarker model, and its license notices remain with the desktop reference.

## Cloudflare Pages

Follow [the Cloudflare Pages setup guide](docs/deployment/cloudflare-pages.md) to configure the
private repository's check-gated Direct Upload workflow. A preview URL is intentionally not listed
here: it is created only after the owner configures the real Cloudflare project and GitHub secrets.
