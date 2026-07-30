import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const headers = readFileSync(
  new URL("../public/_headers", import.meta.url),
  "utf8",
);

test("keeps the required restrictive Cloudflare Pages security headers", () => {
  expect(headers).toContain("default-src 'self'");
  expect(headers).toContain("script-src 'self'");
  expect(headers).toContain("style-src 'self'");
  expect(headers).toContain("connect-src 'self'");
  expect(headers).toContain("object-src 'none'");
  expect(headers).toContain("base-uri 'self'");
  expect(headers).toContain("form-action 'self'");
  expect(headers).toContain("frame-ancestors 'none'");
  expect(headers).toContain("upgrade-insecure-requests");
  expect(headers).toContain("Permissions-Policy: camera=(self), microphone=()");
  expect(headers).toContain("Referrer-Policy: no-referrer");
  expect(headers).toContain("X-Content-Type-Options: nosniff");
  expect(headers).toContain("Strict-Transport-Security:");
});
