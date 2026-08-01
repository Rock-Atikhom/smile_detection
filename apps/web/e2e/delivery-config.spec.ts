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

test("tracks the approved architecture, privacy, and validation boundaries", () => {
  for (const path of [
    "../../../docs/architecture/README.md",
    "../../../docs/privacy/README.md",
    "../../../docs/validation/README.md",
  ]) {
    expect(existsSync(new URL(path, import.meta.url))).toBe(true);
  }

  expect(architecture).toContain("@mediapipe/tasks-vision@0.10.35");
  expect(architecture).toContain("classic worker");
  expect(architecture).toContain("generation");
  expect(privacy).toContain("Camera frames are never written to Cache Storage");
  expect(validation).toContain(
    "online preparation followed by airplane-mode close/reopen",
  );
  expect(deployment).toContain("'wasm-unsafe-eval'");
  expect(notices).toContain("MediaPipe");
  expect(notices).toContain("Face Landmarker");
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
