import { existsSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { expect, test } from "@playwright/test";

const sourceHeaders = readFileSync(
  new URL("../public/_headers", import.meta.url),
  "utf8",
);
const builtHeaders = readFileSync(
  new URL("../dist/_headers", import.meta.url),
  "utf8",
);
const rootPackage = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as {
  workspaces: string[];
  engines: { node: string; npm: string };
  packageManager: string;
};
const webPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };
const webTypeScriptProject = JSON.parse(
  readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"),
) as { references: Array<{ path: string }> };
const contractsPackage = JSON.parse(
  readFileSync(
    new URL("../../../packages/contracts/package.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;
const architecture = readFileSync(
  new URL("../../../docs/architecture/README.md", import.meta.url),
  "utf8",
);
const privacy = readFileSync(
  new URL("../../../docs/privacy/README.md", import.meta.url),
  "utf8",
);
const validation = readFileSync(
  new URL("../../../docs/validation/README.md", import.meta.url),
  "utf8",
);
const deployment = readFileSync(
  new URL("../../../docs/deployment/cloudflare-pages.md", import.meta.url),
  "utf8",
);
const notices = readFileSync(
  new URL("../../../THIRD_PARTY_NOTICES.md", import.meta.url),
  "utf8",
);
const rootReadme = readFileSync(
  new URL("../../../README.md", import.meta.url),
  "utf8",
);

const builtServiceWorker = existsSync(new URL("../dist/sw.js", import.meta.url))
  ? readFileSync(new URL("../dist/sw.js", import.meta.url), "utf8")
  : "";
const viteConfig = readFileSync(
  new URL("../vite.config.ts", import.meta.url),
  "utf8",
);
const configuredVisionPrecacheIgnores = [
  ...viteConfig.matchAll(/["'](vision\/\*\*\/\*[^"']*)["']/g),
].map((match) => match[1]!);

function parseHeaders(input: string) {
  const result = new Map<string, string>();
  for (const line of input.split("\n").slice(1)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    result.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim(),
    );
  }
  return result;
}

function parseCsp(input: string) {
  return new Map(
    input
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...values]) => [name, values]),
  );
}

function normalizeDocumentation(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function expectDocumentedClause(document: string, clause: string) {
  expect(normalizeDocumentation(document)).toContain(
    normalizeDocumentation(clause),
  );
}

test("keeps the empty shared-contracts workspace boundary", () => {
  expect(rootPackage.workspaces).toContain("packages/*");
  expect(contractsPackage.name).toBe("@smart-smile/contracts");
  expect(contractsPackage.private).toBe(true);
  expect(contractsPackage).not.toHaveProperty("dependencies");
  expect(contractsPackage).not.toHaveProperty("scripts");
});

test("keeps the required restrictive Cloudflare Pages security headers", () => {
  expect(builtHeaders).toBe(sourceHeaders);
  const headers = parseHeaders(sourceHeaders);
  const csp = parseCsp(headers.get("Content-Security-Policy") ?? "");

  expect([...csp]).toEqual([
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'wasm-unsafe-eval'"]],
    ["style-src", ["'self'"]],
    ["connect-src", ["'self'"]],
    ["worker-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["upgrade-insecure-requests", []],
  ]);
  expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
  expect(csp.get("worker-src")).not.toContain("blob:");
  expect(csp.get("worker-src")).not.toContain("data:");
  expect(headers.get("Permissions-Policy")).toBe(
    "camera=(self), microphone=()",
  );
  expect(headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(headers.get("Strict-Transport-Security")).toBe(
    "max-age=31536000; includeSubDomains; preload",
  );
});

test("precaches the hashed application manifest but not vision release files", () => {
  const precacheUrls = [
    ...builtServiceWorker.matchAll(/["']url["']:\s*["']([^"']+)["']/g),
  ].map((match) => match[1]!);

  expect(precacheUrls).toContainEqual(
    expect.stringMatching(/^assets\/release-manifest-[\w-]+\.json$/),
  );
  expect(precacheUrls).not.toContainEqual(expect.stringMatching(/\.wasm$/));
  expect(precacheUrls).not.toContainEqual(expect.stringMatching(/\.task$/));
  expect(precacheUrls).not.toContainEqual(expect.stringMatching(/\.pdf$/));
  expect(precacheUrls).not.toContainEqual(expect.stringMatching(/^vision\//));
});

test("keeps future vision images outside the shell precache policy", () => {
  for (const path of [
    "vision/preview.png",
    "vision/diagram.svg",
    "vision/favicon.ico",
  ]) {
    expect(
      configuredVisionPrecacheIgnores.some((pattern) =>
        matchesGlob(path, pattern),
      ),
    ).toBe(true);
  }
});

test("pins the supported Node and npm toolchain", () => {
  expect(rootPackage.engines).toEqual({
    node: ">=22.22.2 <23",
    npm: "10.9.7",
  });
  expect(rootPackage.packageManager).toBe("npm@10.9.7");
  expect(
    readFileSync(new URL("../../../.nvmrc", import.meta.url), "utf8").trim(),
  ).toBe("22.22.2");
  expect(webPackage.scripts["format:check"]).not.toContain("'");
  expect(webPackage.scripts["test:e2e"]).toBe("playwright test");
  expect(webTypeScriptProject.references.map(({ path }) => path)).toContain(
    "./tsconfig.e2e.json",
  );
});

test("tracks the complete offline vision architecture boundary", () => {
  for (const path of [
    "../../../docs/architecture/README.md",
    "../../../docs/privacy/README.md",
    "../../../docs/validation/README.md",
  ]) {
    expect(existsSync(new URL(path, import.meta.url))).toBe(true);
  }

  for (const clause of [
    `Ticket 03 adds a verified runtime-initialization path only. It pins
    \`@mediapipe/tasks-vision@0.10.35\` and the official Face Landmarker model
    \`float16/1\`. The deterministic release manifest is
    \`apps/web/src/vision/generated/release-manifest.json\`; its current release ID is
    \`6c23e451b7a9b523\`, and it inventories byte counts, SHA-256 values, provenance,
    license references, and every same-origin immutable asset beneath
    \`apps/web/public/vision/mediapipe-0.10.35-face-landmarker-float16-v1/\`.`,
    `- The main-thread \`VisionCoordinator\` owns explicit-camera-intent start,
    worker lifecycle, generation guards, participant-safe state, and commands to
    the service worker. React observes its snapshot; it owns no MediaPipe object
    or persistent runtime data.`,
    `- The dedicated classic worker owns manifest and critical-byte verification,
    capability selection, and one Face Landmarker initialization. It tries SIMD
    first, retries the allowlisted ordinary-WASM baseline tier once only when SIMD
    is unsupported or cannot initialize, and never chooses WebGPU. Ticket 03 does
    not submit frames to that instance or expose application landmarks,
    blendshapes, face boxes, geometry, scores, or smile decisions.`,
    `- The service worker owns the shell cache, versioned vision-release cache,
    verified cache transaction, and offline immutable-asset responses. It owns no
    MediaPipe instance and never handles participant data.`,
    `Worker events may update state only when their generation matches the active
    coordinator generation; stale-generation events cannot update runtime readiness,
    offline readiness, recovery, or participant-facing state.`,
    `The application shell cache contains the small hashed application shell,
    including generated release-manifest metadata, but no vendored vision release
    files. After **Continue to camera**, the service worker opens a separate
    versioned cache and fetches every manifest allowlisted asset from the same
    origin. It validates HTTP success, byte count, and SHA-256, stores verified
    responses, reads every required response back, and writes its completion marker
    last. Only a matching cache with that marker and successful readback is usable;
    cancellation, a failed download, or an integrity failure deletes the incomplete
    new cache while preserving a previously complete release.`,
    `On a first offline use with only the shell cache, the coordinator presents
    **Connect once to finish setup** without asking for camera permission. A
    complete matching release initializes from cache after a close/reopen. An
    integrity mismatch blocks initialization, removes affected unverified or
    incomplete cache content, stops the camera, and presents safe recovery rather
    than raw runtime details.`,
  ]) {
    expectDocumentedClause(architecture, clause);
  }
});

test("tracks the complete non-goal and persistence boundary", () => {
  expectDocumentedClause(
    rootReadme,
    `Ticket 03 prepares a self-hosted, on-device vision runtime; it stops at runtime
    initialization and verified offline reopening. It does not submit camera frames,
    extract landmarks or blendshapes for the application, or detect smiles. No
    dataset is collected and no custom model is trained.`,
  );

  for (const clause of [
    `Camera frames are never written to Cache Storage. Nor are camera output, photos,
    Blobs, object URLs, landmarks, blendshapes, face boxes, geometry, score data,
    diagnostics, device labels, device IDs, persistent identifiers, participant
    names, network identifiers, localStorage values, sessionStorage values, or
    IndexedDB records. No analytics, crash reporting, upload endpoint, remote model
    CDN, or participant-data request is used.`,
    `The persisted static allowlist is exact: the Workbox shell cache may contain the
    hashed application shell, PWA icons, static recovery help, and the generated
    release-manifest metadata; the separate versioned vision cache may contain only
    the immutable manifest paths for release \`6c23e451b7a9b523\` plus its matching
    completion-marker record. That release is MediaPipe runtime/WASM files, the
    Face Landmarker \`float16/1\` task bundle, the MediaPipe license and notice, and
    the three upstream model cards. The completion marker is written only after
    every required response has been integrity-checked and read back, so a partial
    cache is not an offline-ready release.`,
  ]) {
    expectDocumentedClause(privacy, clause);
  }
});

test("tracks the exact CSP, acceptance, and provenance clauses", () => {
  expectDocumentedClause(
    deployment,
    `Ticket 03 uses only the minimum proven expansion for the self-hosted runtime:
    \`worker-src 'self'\` permits the bundled classic worker from this origin and
    continues to reject \`blob:\` and \`data:\` workers. \`script-src 'self'
    'wasm-unsafe-eval'\` permits WebAssembly compilation for the pinned local
    runtime; \`'wasm-unsafe-eval'\` does not enable JavaScript \`eval()\`. Do not add
    \`'unsafe-eval'\`, a remote runtime/CDN origin, or a broad worker source.`,
  );
  expectDocumentedClause(
    validation,
    `For named physical-browser acceptance, use online preparation followed by
    airplane-mode close/reopen: online, select **Continue to camera** and wait until
    both runtime and offline use report ready; close the browser page; enable airplane
    mode; reopen the page; select **Continue to camera**; then confirm **Camera ready**
    without a network request.`,
  );
  expectDocumentedClause(
    notices,
    `Smart Smile redistributes the self-hosted MediaPipe Tasks Vision runtime
    \`@mediapipe/tasks-vision@0.10.35\` and the official Face Landmarker model
    \`float16/1\` as release \`6c23e451b7a9b523\`. The immutable release inventory,
    SHA-256 values, byte counts, and per-asset provenance are in
    \`apps/web/src/vision/generated/release-manifest.json\`.`,
  );
  expectDocumentedClause(
    notices,
    `The upstream-original \`LICENSE-MediaPipe.txt\` is copied from the MediaPipe
    \`v0.10.35\` license; Smart Smile's vendor script generates \`NOTICE.txt\` locally
    from the pinned package, model, model-card, and license source URLs.`,
  );
  expectDocumentedClause(
    notices,
    `- MediaPipe Tasks Vision package source:
    <https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz>
    - MediaPipe source and release: <https://github.com/google-ai-edge/mediapipe/tree/v0.10.35>
    - MediaPipe license: <https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.35/LICENSE>
    - Face Landmarker model bundle:
    <https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task>
    - BlazeFace Short Range model card:
    <https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf>
    - Face Mesh V2 model card:
    <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf>
    - Blendshape V2 model card:
    <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf>`,
  );
});

test("rejects contradictory Ticket 03 documentation", () => {
  const documentedBoundary = normalizeDocumentation(
    [rootReadme, architecture, privacy, validation, deployment, notices].join(
      "\n",
    ),
  );
  for (const contradiction of [
    /\b(?:(?:uses|runs in|creates) (?:a )?module worker|(?:a )?module worker (?:is|may be|can be) (?:used|enabled|selected))\b/i,
    /\b(?:WebGPU (?:is|may be|can be) (?:enabled|selected|used)|(?:Ticket 03|the runtime) enables WebGPU)\b/i,
    /\bCamera frames (?:are|may be|can be) (?:written|stored|cached) (?:in|to) Cache Storage\b/i,
    /\bparticipant data (?:is|may be|can be) (?:written|stored|cached) (?:in|to) Cache Storage\b/i,
    /\b(?:remote|CDN) runtime (?:is|may be|can be) (?:enabled|selected|used|allowed)\b/i,
    /\bTicket 03 (?:detects smiles|(?:performs|implements|enables|includes|delivers) smile detection)\b/i,
  ]) {
    expect(documentedBoundary).not.toMatch(contradiction);
  }
});

test("keeps Cloudflare deployment downstream of the complete web gate", () => {
  const workflow = readFileSync(
    new URL("../../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  expect(workflow).toContain("deploy-pages:");
  expect(workflow).toContain("needs: [web, macos-arm64]");
  expect(workflow).toContain("CLOUDFLARE_PAGES_DEPLOY_ENABLED");
  expect(workflow).toContain("pages deploy apps/web/dist");
  expect(workflow).toContain(
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  );
  expect(workflow).toContain(
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  );
  expect(workflow).toContain(
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  );
  expect(workflow).toContain(
    "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
  );
  expect(workflow).toContain(
    "cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0",
  );
  expect(workflow).toContain("wranglerVersion: 4.115.0");
  expect(workflow).not.toMatch(/uses:\s+\S+@(v\d+|main|master)(?:\s|$)/);
});
