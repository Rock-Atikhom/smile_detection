# Cloudflare Pages deployment

Smart Smile deploys a prebuilt, already validated artifact from GitHub Actions. Do not enable
Cloudflare Pages Git integration for this project: an independent Pages build could publish before
the repository quality gates finish. The workflow uses Cloudflare Pages Direct Upload instead.

No Cloudflare project, credential, or preview URL is committed to this repository.

## Fixed delivery toolchain

The repository pins Node `22.22.2` in `.nvmrc`, npm `10.9.7` in `package.json`, and Wrangler
`4.115.0` in `.github/workflows/ci.yml`. CI builds from the repository root with:

```bash
npm ci
npm run web:build
```

The resulting Pages directory is `apps/web/dist`.

## One-time owner setup

1. In **Workers & Pages**, create a Pages project using **Direct Upload**, not Git integration.
   Set the production branch to `main`. Alternatively, after authenticating locally, create it
   with `npx wrangler@4.115.0 pages project create`.
2. In the private GitHub repository, create Actions secrets named `CLOUDFLARE_ACCOUNT_ID` and
   `CLOUDFLARE_API_TOKEN`. Scope the token to the minimum Pages deployment permission for the
   intended account.
3. Create an Actions variable named `CLOUDFLARE_PAGES_PROJECT` containing the real Pages project
   name.
4. Only after the project, variable, and both secrets exist, create the Actions variable
   `CLOUDFLARE_PAGES_DEPLOY_ENABLED` with the exact value `true`.

Until the final variable is enabled, the deployment job is intentionally skipped. Pull requests
from forks are also skipped because GitHub does not expose deployment secrets to them.

## Check-gated preview and production behavior

The `deploy-pages` job depends on both the complete web gate and the preserved Python reference
gate. The web gate builds once, runs unit and browser tests against that exact output, then uploads
`apps/web/dist` as a short-lived GitHub artifact. Only after both required jobs pass does the
deployment job download that same artifact and run the pinned equivalent of:

```bash
npx wrangler@4.115.0 pages deploy apps/web/dist \
  --project-name="<verified-project-name>" \
  --branch="<pull-request-branch-or-main>"
```

A pull request from a branch in this repository creates a Pages preview deployment. A push to
`main` creates the production deployment. Record only URLs emitted by the successful Cloudflare
deployment; do not guess a `pages.dev` hostname.

## Static security headers

`apps/web/public/_headers` is copied byte-for-byte into `apps/web/dist/_headers`. Cloudflare Pages
applies it to every path. It keeps scripts, styles, and connections self-only, upgrades insecure
subresource requests through CSP, blocks objects and framing, allows the camera only for this
origin, disables the microphone, omits referrers, prevents MIME sniffing, and enables HSTS.

### Ticket 03 runtime CSP

Ticket 03 uses only the minimum proven expansion for the self-hosted runtime:
`worker-src 'self'` permits the bundled classic worker from this origin and
continues to reject `blob:` and `data:` workers. `script-src 'self'
'wasm-unsafe-eval'` permits WebAssembly compilation for the pinned local
runtime; `'wasm-unsafe-eval'` does not enable JavaScript `eval()`. Do not add
`'unsafe-eval'`, a remote runtime/CDN origin, or a broad worker source. The
browser acceptance suite verifies these exact CSP boundaries while initializing
the runtime; Ticket 03 does not process participant frames.

## Post-deploy check

After the workflow emits a real deployment hostname, verify the published response without
substituting a guessed URL:

```bash
curl -sSI "https://<verified-deployment-host>/" | rg -i \
  "content-security-policy|permissions-policy|referrer-policy|x-content-type-options|strict-transport-security"
```

Confirm the live values match `apps/web/public/_headers`, including `style-src 'self'`,
`camera=(self)`, and `microphone=()`. Open the deployed page, open and close **How privacy works**,
and confirm the browser console reports no Content Security Policy violations.

## Primary references

- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages Direct Upload with continuous integration](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Cloudflare Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/)
- [GitHub dependency pinning guidance](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-third-party-actions)
