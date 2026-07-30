# Cloudflare Pages deployment

## Create the project

In the Cloudflare dashboard, open **Workers & Pages**, create a **Pages** application, and
choose **Import an existing Git repository**. Authorize Cloudflare to access the private GitHub
repository, then select this repository. No Cloudflare project or preview URL is committed to
this repository yet.

Use these build settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run web:build` |
| Build output directory | `apps/web/dist` |
| Node.js version | `22` |

Set Node.js 22 in the Pages build configuration (or the dashboard's equivalent build environment
setting) before the first deployment. The npm workspace lives at the repository root, so the
build command must run from that root rather than from `apps/web`.

## Preview and production behavior

Once Git integration is connected, Cloudflare Pages creates preview deployments for pull requests
and non-production branches according to the project settings. Pushes to `main` create production
deployments. The project owner must record the actual generated URLs after Cloudflare creates
them; this repository does not invent or reserve a preview URL.

## Static security headers

`apps/web/public/_headers` is copied into `apps/web/dist/_headers` by the Vite build. Cloudflare
Pages applies it to every path. It starts with a self-only content policy, blocks embedded objects
and framing, allows the camera only to this origin, disables the microphone, omits referrers,
prevents MIME sniffing, and upgrades HTTPS through HSTS.

Ticket 03 may introduce self-hosted workers or WASM. It must add only the minimum CSP directives
that a verified implementation requires; do not pre-emptively loosen this policy.

## Post-deploy check

After an owner has a real deployment hostname, verify the published response headers without
substituting a guessed URL:

```bash
curl -sSI "https://<verified-deployment-host>/" | rg -i \
  "content-security-policy|permissions-policy|referrer-policy|x-content-type-options|strict-transport-security"
```

Confirm the response contains the values from `_headers`, including `camera=(self)` and
`microphone=()`. Also open the deployed page and check that the response is served over HTTPS.
