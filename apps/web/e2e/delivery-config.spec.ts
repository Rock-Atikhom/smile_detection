import { existsSync, readFileSync } from "node:fs";
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
    ["script-src", ["'self'"]],
    ["style-src", ["'self'"]],
    ["connect-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["upgrade-insecure-requests", []],
  ]);
  expect(headers.get("Permissions-Policy")).toBe(
    "camera=(self), microphone=()",
  );
  expect(headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(headers.get("Strict-Transport-Security")).toBe(
    "max-age=31536000; includeSubDomains; preload",
  );
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
