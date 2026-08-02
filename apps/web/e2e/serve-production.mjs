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
const corruptAfterFirstWasmCookieName =
  "__smart_smile_e2e_corrupt_after_first_wasm";
const defaultFaultHoldTimeoutMs = 10_000;
const heldFaultScopes = new Set();
const heldFaultTimers = new Map();
const pendingFaultResponses = new Map();
const corruptAfterFirstRequestCounts = new Map();
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

function corruptAfterFirstScope(request) {
  for (const cookie of (request.headers.cookie ?? "").split(";")) {
    const [name, ...value] = cookie.trim().split("=");
    if (name !== corruptAfterFirstWasmCookieName) continue;
    const scope = value.join("=");
    return /^fault-[a-z0-9]+$/.test(scope) ? scope : undefined;
  }
  return undefined;
}

function releaseFaultScope(scope) {
  if (scope === undefined) return;
  heldFaultScopes.delete(scope);
  const timer = heldFaultTimers.get(scope);
  if (timer !== undefined) clearTimeout(timer);
  heldFaultTimers.delete(scope);
  const pending = pendingFaultResponses.get(scope) ?? [];
  pendingFaultResponses.delete(scope);
  for (const send of pending) send();
}

function holdFaultScope(scope, timeoutMs = defaultFaultHoldTimeoutMs) {
  if (scope === undefined) return;
  const previousTimer = heldFaultTimers.get(scope);
  if (previousTimer !== undefined) clearTimeout(previousTimer);
  heldFaultScopes.add(scope);
  const timer = setTimeout(() => releaseFaultScope(scope), timeoutMs);
  timer.unref();
  heldFaultTimers.set(scope, timer);
}

function drainFaultScopes() {
  const scopes = new Set([
    ...heldFaultScopes,
    ...heldFaultTimers.keys(),
    ...pendingFaultResponses.keys(),
  ]);
  for (const scope of scopes) releaseFaultScope(scope);
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
    if (pending.size === 0) releaseFaultScope(scope);
  });
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
  const pathname = requestUrl.pathname;
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
    const requestedTimeout = Number(requestUrl.searchParams.get("timeout"));
    const timeoutMs =
      Number.isInteger(requestedTimeout) &&
      requestedTimeout >= 100 &&
      requestedTimeout <= defaultFaultHoldTimeoutMs
        ? requestedTimeout
        : defaultFaultHoldTimeoutMs;
    holdFaultScope(faultScope(request), timeoutMs);
    response.writeHead(204, { "Cache-Control": "no-store" }).end();
    return;
  }
  if (pathname === "/__e2e__/fault/corrupt-wasm/release") {
    releaseFaultScope(faultScope(request));
    response.writeHead(204, { "Cache-Control": "no-store" }).end();
    return;
  }
  if (pathname === "/__e2e__/fault/corrupt-wasm/drain") {
    drainFaultScopes();
    response.writeHead(204, { "Cache-Control": "no-store" }).end();
    return;
  }
  if (pathname === "/__e2e__/fault/corrupt-wasm/status") {
    const scope = faultScope(request);
    response
      .writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      })
      .end(
        JSON.stringify({
          held: scope !== undefined && heldFaultScopes.has(scope),
          pendingResponses:
            scope === undefined
              ? 0
              : (pendingFaultResponses.get(scope)?.size ?? 0),
        }),
      );
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
  if (pathname === "/__e2e__/fault/corrupt-wasm-after-first/on") {
    const previousScope = corruptAfterFirstScope(request);
    if (previousScope !== undefined) {
      corruptAfterFirstRequestCounts.delete(previousScope);
    }
    faultScopeSequence += 1;
    const scope = `fault-${faultScopeSequence.toString(36)}`;
    corruptAfterFirstRequestCounts.set(scope, new Map());
    response
      .writeHead(204, {
        "Cache-Control": "no-store",
        "Set-Cookie": `${corruptAfterFirstWasmCookieName}=${scope}; Path=/; HttpOnly; SameSite=Strict`,
      })
      .end();
    return;
  }
  if (pathname === "/__e2e__/fault/corrupt-wasm-after-first/status") {
    const scope = corruptAfterFirstScope(request);
    const counts = corruptAfterFirstRequestCounts.get(scope);
    const simdWasmRequests = [...(counts?.entries() ?? [])]
      .filter(([path]) => path.endsWith("/vision_wasm_internal.wasm"))
      .reduce((total, [, count]) => total + count, 0);
    response
      .writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      })
      .end(JSON.stringify({ simdWasmRequests }));
    return;
  }
  if (pathname === "/__e2e__/fault/corrupt-wasm-after-first/off") {
    const scope = corruptAfterFirstScope(request);
    if (scope !== undefined) corruptAfterFirstRequestCounts.delete(scope);
    response
      .writeHead(204, {
        "Cache-Control": "no-store",
        "Set-Cookie": `${corruptAfterFirstWasmCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
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
  const afterFirstScope = corruptAfterFirstScope(request);
  if (afterFirstScope !== undefined && extension === ".wasm") {
    const counts = corruptAfterFirstRequestCounts.get(afterFirstScope);
    if (counts !== undefined) {
      const count = (counts.get(pathname) ?? 0) + 1;
      counts.set(pathname, count);
      const bytes = Buffer.from(readFileSync(filePath));
      if (count > 1 && bytes.length > 0) bytes[bytes.length - 1] ^= 1;
      response.end(bytes);
      return;
    }
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(
    `Production-header server listening on http://${host}:${port}\n`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    drainFaultScopes();
    corruptAfterFirstRequestCounts.clear();
    server.close(() => process.exit(0));
  });
}
