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

## Offline vision runtime

Ticket 03 prepares a self-hosted, on-device vision runtime; it stops at runtime
initialization and verified offline reopening. It does not submit camera frames,
extract landmarks or blendshapes for the application, or detect smiles. No
dataset is collected and no custom model is trained.

The pinned release is `@mediapipe/tasks-vision@0.10.35` with the official Face
Landmarker `float16/1` model. Its generated, checked-in manifest is
`apps/web/src/vision/generated/release-manifest.json` (release ID
`6c23e451b7a9b523`); immutable runtime files are under
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
