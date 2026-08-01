import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 4173;
const dist = resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");
const headerLines = readFileSync(resolve(dist, "_headers"), "utf8")
  .split("\n")
  .slice(1)
  .map((line) => line.trim())
  .filter(Boolean);
const headers = Object.fromEntries(
  headerLines.map((line) => {
    const separator = line.indexOf(":");
    return [line.slice(0, separator), line.slice(separator + 1).trim()];
  }),
);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".task", "application/octet-stream"],
  [".wasm", "application/wasm"],
]);
const corruptWasmCookieName = "__smart_smile_e2e_corrupt_wasm";
const corruptWasmDelayMs = 250;

function hasCorruptWasmCookie(request) {
  return (request.headers.cookie ?? "")
    .split(";")
    .some((cookie) => cookie.trim() === `${corruptWasmCookieName}=1`);
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${host}:${port}`)
    .pathname;
  if (pathname === "/__e2e__/fault/corrupt-wasm/on") {
    response
      .writeHead(204, {
        "Cache-Control": "no-store",
        "Set-Cookie": `${corruptWasmCookieName}=1; Path=/; HttpOnly; SameSite=Strict`,
      })
      .end();
    return;
  }
  if (pathname === "/__e2e__/fault/corrupt-wasm/off") {
    response
      .writeHead(204, {
        "Cache-Control": "no-store",
        "Set-Cookie": `${corruptWasmCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
      })
      .end();
    return;
  }
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(dist, requestedPath);

  if (!filePath.startsWith(`${dist}${sep}`)) {
    response.writeHead(400).end("Bad request");
    return;
  }

  try {
    if (!statSync(filePath).isFile()) throw new Error("Not a file");
  } catch {
    response.writeHead(404, headers).end("Not found");
    return;
  }

  const extension = extname(filePath);
  response.writeHead(200, {
    ...headers,
    "Content-Type": contentTypes.get(extension) ?? "application/octet-stream",
  });
  if (hasCorruptWasmCookie(request) && extension === ".wasm") {
    const bytes = Buffer.from(readFileSync(filePath));
    if (bytes.length > 0) bytes[bytes.length - 1] ^= 1;
    setTimeout(() => response.end(bytes), corruptWasmDelayMs);
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(
    `Production-header server listening on http://${host}:${port}\n`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
