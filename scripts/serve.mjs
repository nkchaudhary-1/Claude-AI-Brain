// Local server: static files plus the /api functions, run the way Vercel runs them.
//   node scripts/serve.mjs [port]           dev: serves the source (index.html + ES modules)
//   node scripts/serve.mjs [port] --dist    start: serves the production build in dist/
// Reads .env.local then .env (never overriding real environment variables). Zero dependencies
// beyond what the /api functions themselves import.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const dist = args.includes("--dist");
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 5173);
const staticRoot = dist ? join(root, "dist") : root;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain" };

if (!process.env.BRAIN_IGNORE_ENV) for (const f of [".env.local", ".env"]) {
  try {
    for (const line of (await readFile(join(root, f), "utf8")).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
}

// /api/brain → api/brain.js or api/brain/index.js; folders starting with _ are never routes (as on Vercel)
async function findHandler(path) {
  const rel = path.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  if (!/^[a-z0-9/-]*$/i.test(rel) || rel.split("/").some((s) => s.startsWith("_"))) return null;
  for (const f of [`api/${rel}.js`, `api/${rel || "index"}/index.js`, `api/${rel}/index.js`]) {
    try { if ((await stat(join(root, f))).isFile()) return (await import(pathToFileURL(join(root, f)).href)).default; } catch {}
  }
  return null;
}
function readBody(req, limit = 4.5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8"))); req.on("error", reject);
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = decodeURIComponent(url.pathname);
  if (path.startsWith("/api/") || path === "/api") {
    const handler = await findHandler(path);
    if (!handler) { res.writeHead(404, { "content-type": "application/json" }).end('{"error":{"code":"not_found","message":"Not found"}}'); return; }
    req.query = Object.fromEntries(url.searchParams);
    try {
      const raw = ["GET", "HEAD"].includes(req.method) ? "" : await readBody(req);
      req.body = raw && /json/.test(req.headers["content-type"] || "") ? JSON.parse(raw) : raw || undefined;
    } catch (e) { res.writeHead(e.status || 400, { "content-type": "application/json" }).end('{"error":{"code":"bad_request","message":"That request couldn’t be read."}}'); return; }
    try { await handler(req, res); } catch (e) { console.error("[api]", e); if (!res.headersSent) res.writeHead(500).end(); }
    return;
  }
  const file = normalize(join(staticRoot, path === "/" ? "index.html" : path));
  if (!file.startsWith(staticRoot) || (!dist && /(^|[\\/])(\.env|api|supabase|node_modules)([\\/]|$)/.test(file.slice(staticRoot.length)))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}).listen(port, () => console.log(`My AI Brain → http://localhost:${port}${dist ? " (production build)" : ""}${process.env.SUPABASE_URL ? " · accounts on" : " · accounts off (no SUPABASE_URL)"}`));
