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
const heldFaultScopes = new Set();
const pendingFaultResponses = new Map();
let faultScopeSequence = 0;

function faultScope(request) {
  for (const cookie of (request.headers.cookie ?? "").split(";")) {
    const [name, ...value] = cookie.trim().split("=");
    if (name !== corruptWasmCookieName) continue;
    const scope = value.join("=");
    return /^fault-[a-z0-9]+$/.test(scope) ? scope : undefined;
  }
  return undefined;
}

function releaseFaultScope(scope) {
  if (scope === undefined) return;
  heldFaultScopes.delete(scope);
  for (const send of pendingFaultResponses.get(scope) ?? []) send();
  pendingFaultResponses.delete(scope);
}

function sendCorruptResponse(scope, response, bytes) {
  const send = () => {
    if (!response.destroyed) response.end(bytes);
  };
  if (!heldFaultScopes.has(scope)) {
    send();
    return;
  }
  const pending = pendingFaultResponses.get(scope) ?? new Set();
  pending.add(send);
  pendingFaultResponses.set(scope, pending);
  response.on("close", () => {
    if (response.writableEnded) return;
    pending.delete(send);
    if (pending.size === 0) pendingFaultResponses.delete(scope);
  });
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${host}:${port}`)
    .pathname;
  if (pathname === "/__e2e__/fault/corrupt-wasm/on") {
    releaseFaultScope(faultScope(request));
    faultScopeSequence += 1;
    const scope = `fault-${faultScopeSequence.toString(36)}`;
    response
      .writeHead(204, {
        "Cache-Control": "no-store",
        "Set-Cookie": `${corruptWasmCookieName}=${scope}; Path=/; HttpOnly; SameSite=Strict`,
      })
      .end();
    return;
  }
  if (pathname === "/__e2e__/fault/corrupt-wasm/hold") {
    const scope = faultScope(request);
    if (scope !== undefined) heldFaultScopes.add(scope);
    response.writeHead(204, { "Cache-Control": "no-store" }).end();
    return;
  }
  if (pathname === "/__e2e__/fault/corrupt-wasm/release") {
    releaseFaultScope(faultScope(request));
    response.writeHead(204, { "Cache-Control": "no-store" }).end();
    return;
  }
  if (pathname === "/__e2e__/fault/corrupt-wasm/off") {
    releaseFaultScope(faultScope(request));
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
  const requestFaultScope = faultScope(request);
  if (requestFaultScope !== undefined && extension === ".wasm") {
    const bytes = Buffer.from(readFileSync(filePath));
    if (bytes.length > 0) bytes[bytes.length - 1] ^= 1;
    sendCorruptResponse(requestFaultScope, response, bytes);
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
