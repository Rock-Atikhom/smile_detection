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
npm ci
npm run web:dev
```

The development command starts Vite. For a real production-build preview, use a second
terminal after stopping the development server:

```bash
npm run web:build
npm run web:preview
```

Run the complete web quality gates with:

```bash
npm run web:format:check
npm run web:lint
npm run web:typecheck
npm run web:test
npx playwright install chromium
npm run web:e2e
```

`web:e2e` rebuilds `apps/web/dist`, serves it with Vite's production preview, and checks the
shell at 390x844, 844x390, 768x1024, and 1440x900. The tests attach one screenshot for each
named viewport.

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

Follow [the Cloudflare Pages setup guide](docs/deployment/cloudflare-pages.md) to connect the
private GitHub repository and deploy the Web application. A preview URL is intentionally not
listed here: it is created only after the Cloudflare project has been connected.
