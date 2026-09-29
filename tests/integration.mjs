// End-to-end API test against real Supabase components: node tests/integration.mjs
//
//   browser-like client (cookie jar) → scripts/serve.mjs → /api handlers → @supabase/ssr + supabase-js
//     → gateway → PostgREST (postgrest/postgrest) → Postgres (supabase/postgres, with the migration)
//                → GoTrue stand-in (below)
//
// Postgres and PostgREST are the real images Supabase runs. GoTrue couldn't be pulled here, so a
// small stand-in implements the endpoints supabase-js calls (otp, verify, pkce + refresh token,
// user, logout), signing HS256 JWTs with the same secret PostgREST verifies. Needs Docker; skips
// cleanly without it.
import { spawn, execFileSync } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("..", import.meta.url));
const SECRET = "integration-test-secret-at-least-32-characters";
const DB = { port: 54329, host: "127.0.0.1", user: "postgres", password: "postgres", database: "postgres" };
const PORTS = { rest: 54330, gateway: 54331, app: 5188 };
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try { sh("docker", ["info", "--format", "{{.ServerVersion}}"]); } catch { console.log("- integration tests skipped: Docker isn't running"); process.exit(0); }
const hasImage = (i) => { try { sh("docker", ["image", "inspect", i]); return true; } catch { return false; } };
if (!hasImage("supabase/postgres:17.6.1.171") || !hasImage("postgrest/postgrest:v12.2.3")) { console.log("- integration tests skipped: pull supabase/postgres:17.6.1.171 and postgrest/postgrest:v12.2.3 first"); process.exit(0); }

// ── containers ─────────────────────────────────────────────────────────────
try { sh("docker", ["network", "create", "brainnet"]); } catch {}
for (const n of ["brain-db", "brain-rest"]) try { sh("docker", ["rm", "-f", n]); } catch {}
sh("docker", ["run", "-d", "--name", "brain-db", "--network", "brainnet", "-e", "POSTGRES_PASSWORD=postgres", "-p", `${DB.port}:5432`, "supabase/postgres:17.6.1.171"]);
let db;
for (let i = 0; i < 60; i++) { try { db = new pg.Client(DB); await db.connect(); await db.query("select 1"); break; } catch { db = null; await wait(1000); } }
if (!db) throw new Error("postgres did not start");
await wait(3000);
// What GoTrue's own migrations install on hosted projects: auth.uid()/jwt() read the JSON claims PostgREST sets.
const admin = new pg.Client({ ...DB, user: "supabase_admin" }); await admin.connect();
await admin.query(`
  alter role authenticator with password 'postgres';
  create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  create or replace function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;`);
await admin.end();
// the migration runs as postgres, the role Supabase's SQL editor and CLI use
for (const f of (await readdir(root + "supabase/migrations")).sort()) await db.query(await readFile(root + "supabase/migrations/" + f, "utf8"));
sh("docker", ["run", "-d", "--name", "brain-rest", "--network", "brainnet", "-p", `${PORTS.rest}:3000`,
  "-e", "PGRST_DB_URI=postgres://authenticator:postgres@brain-db:5432/postgres", "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon",
  "-e", `PGRST_JWT_SECRET=${SECRET}`, "-e", "PGRST_DB_MAX_ROWS=1000", "postgrest/postgrest:v12.2.3"]);

// ── GoTrue stand-in + gateway ─────────────────────────────────────────────
const b64u = (b) => Buffer.from(b).toString("base64url");
const jwt = (claims) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify(claims)); return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const verify = (t) => { const [h, p, s] = String(t || "").split("."); if (!s || createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null; const c = JSON.parse(Buffer.from(p, "base64url")); return c.exp > Date.now() / 1000 ? c : null; };
const ANON = jwt({ role: "anon", iss: "supabase", exp: Math.floor(Date.now() / 1000) + 3600 });
const otps = new Map(), codes = new Map(), refresh = new Map(), users = new Map();
let accessTtl = 3600;
async function userFor(email, provider, meta = {}) {
  let u = [...users.values()].find((x) => x.email === email);
  if (u) return u;
  const id = randomUUID();
  await db.query(`insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, $4, now(), now())`, [id, email, { provider }, meta]);
  u = { id, aud: "authenticated", role: "authenticated", email, app_metadata: { provider }, user_metadata: meta, created_at: new Date().toISOString() };
  users.set(id, u); return u;
}
function session(u) {
  const now = Math.floor(Date.now() / 1000), rt = randomBytes(16).toString("hex");
  refresh.set(rt, u.id);
  return { access_token: jwt({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, iat: now, exp: now + accessTtl, session_id: randomUUID() }), token_type: "bearer", expires_in: accessTtl, expires_at: now + accessTtl, refresh_token: rt, user: u };
}
const body = (req) => new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
const out = (res, status, data) => { res.writeHead(status, { "content-type": "application/json" }); res.end(data === undefined ? "" : JSON.stringify(data)); };
const gotrueErr = (res, status, msg) => out(res, status, { code: status, error_code: "bad_request", msg });
const gateway = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/rest/v1/")) {   // Kong's job: forward to PostgREST untouched
    const up = httpRequest({ host: "127.0.0.1", port: PORTS.rest, path: url.pathname.slice(8) + url.search, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${PORTS.rest}` } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on("error", () => out(res, 502, {})); req.pipe(up); return;
  }
  const p = url.pathname.replace(/^\/auth\/v1/, "");
  if (p === "/otp" && req.method === "POST") { const b = await body(req); await userFor(b.email, "email"); const th = randomBytes(12).toString("hex"); otps.set(th, b.email); return out(res, 200, {}); }
  if (p === "/verify" && req.method === "POST") { const b = await body(req); const email = otps.get(b.token_hash); if (!email) return gotrueErr(res, 403, "Token has expired or is invalid"); otps.delete(b.token_hash); return out(res, 200, session(await userFor(email, "email"))); }
  if (p === "/token" && req.method === "POST") {
    const b = await body(req), gt = url.searchParams.get("grant_type");
    if (gt === "pkce") { const c = codes.get(b.auth_code); codes.delete(b.auth_code);
      if (!c || createHash("sha256").update(b.code_verifier || "").digest("base64url") !== c.challenge) return gotrueErr(res, 400, "invalid flow state");
      return out(res, 200, session(c.user)); }
    if (gt === "refresh_token") { const id = refresh.get(b.refresh_token); refresh.delete(b.refresh_token); if (!id) return gotrueErr(res, 400, "Invalid Refresh Token"); accessTtl = 3600; return out(res, 200, session(users.get(id))); }
  }
  if (p === "/user" && req.method === "GET") { const c = verify((req.headers.authorization || "").replace(/^Bearer /, "")); return c && users.get(c.sub) ? out(res, 200, users.get(c.sub)) : gotrueErr(res, 401, "invalid JWT"); }
  if (p === "/logout" && req.method === "POST") { res.writeHead(204); return res.end(); }
  // test hooks: read the last magic link, finish an OAuth round trip as the provider would
  if (p === "/__test/otp") return out(res, 200, { token_hash: [...otps.entries()].reverse().find(([, e]) => e === url.searchParams.get("email"))?.[0] });
  if (p === "/__test/oauth") { const u = await userFor(url.searchParams.get("email"), url.searchParams.get("provider"), { full_name: "Grace Hopper", avatar_url: "https://example.com/a.png" }); const code = randomUUID(); codes.set(code, { challenge: url.searchParams.get("code_challenge"), user: u }); return out(res, 200, { code }); }
  gotrueErr(res, 404, `stand-in has no ${req.method} ${p}`);
}).listen(PORTS.gateway);

// ── the app ───────────────────────────────────────────────────────────────
const app = spawn(process.execPath, [root + "scripts/serve.mjs", String(PORTS.app)], { stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BRAIN_IGNORE_ENV: "1", SUPABASE_URL: `http://127.0.0.1:${PORTS.gateway}`, SUPABASE_ANON_KEY: ANON, SITE_URL: `http://localhost:${PORTS.app}` } });
let appLog = ""; app.stdout.on("data", (d) => (appLog += d)); app.stderr.on("data", (d) => (appLog += d));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORTS.rest}/`); break; } catch { await wait(500); } }
await wait(800);

// A browser: a cookie jar, same-site headers on writes, manual redirects.
class Browser {
  constructor() { this.jar = new Map(); this.flags = new Map(); }
  async go(path, { method = "GET", json, headers = {} } = {}) {
    const res = await fetch(`http://localhost:${PORTS.app}${path}`, { method, redirect: "manual",
      headers: { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "), ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(method !== "GET" ? { "x-brain-request": "1", origin: `http://localhost:${PORTS.app}` } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : undefined });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";"), i = pair.indexOf("="), name = pair.slice(0, i).trim(), value = pair.slice(i + 1);
      this.flags.set(name, attrs.map((a) => a.trim().toLowerCase()));
      if (/max-age=0/i.test(c) || value === "") this.jar.delete(name); else this.jar.set(name, value);
    }
    let data = null; try { data = await res.clone().json(); } catch {}
    return { status: res.status, location: res.headers.get("location"), data, headers: res.headers };
  }
}
const gw = (p) => fetch(`http://127.0.0.1:${PORTS.gateway}/auth/v1${p}`).then((r) => r.json());
let failures = 0;
async function t(name, fn) { try { await fn(); console.log(`✓ ${name}`); } catch (e) { failures++; console.log(`✗ ${name}\n    ${e.message}`); } }
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const { SEED } = await import(root + "src/data/seed.js");
const { Cloud } = await import(root + "src/cloud.js");
// what the browser sends: every neuron with its links listed on both ends
const NEURONS = Cloud.changedNeurons([], SEED.neurons);
const isSession = (k) => /-auth-token(\.\d+)?$/.test(k);
const ada = new Browser(), grace = new Browser(), stranger = new Browser();

await t("signed out: /api/session is empty and the brain is refused", async () => {
  eq((await stranger.go("/api/session")).data.user, null, "user");
  const r = await stranger.go("/api/brain"); eq(r.status, 401, "status"); eq(r.data.error.code, "unauthenticated", "code");
});
await t("email: magic link → /api/auth/confirm sets an httpOnly session cookie", async () => {
  eq((await ada.go("/api/auth/email", { method: "POST", json: { email: "ada@example.com" } })).data, { sent: true }, "send");
  const { token_hash } = await gw("/__test/otp?email=ada@example.com");
  const r = await ada.go(`/api/auth/confirm?token_hash=${token_hash}&type=email`);
  eq([r.status, r.location], [303, "/"], "redirect");
  const auth = [...ada.flags].find(([k]) => isSession(k));
  if (!auth || !auth[1].includes("httponly") || !auth[1].some((a) => a === "samesite=lax")) throw new Error("session cookie missing HttpOnly/SameSite: " + JSON.stringify(auth));
  eq((await ada.go("/api/session")).data.user.email, "ada@example.com", "session user");
});
await t("email: a used or forged link is refused without detail", async () => {
  const r = await stranger.go("/api/auth/confirm?token_hash=forged&type=email");
  eq([r.status, r.location], [303, "/?auth_error=link"], "redirect");
});
await t("oauth: sign-in redirects to the provider with PKCE; callback exchanges the code", async () => {
  const r = await grace.go("/api/auth/signin?provider=github");
  const loc = new URL(r.location);
  eq([r.status, loc.pathname, loc.searchParams.get("provider"), loc.searchParams.get("code_challenge_method")], [303, "/auth/v1/authorize", "github", "s256"], "authorize url");
  if (!loc.searchParams.get("redirect_to").startsWith(`http://localhost:${PORTS.app}/api/auth/callback`)) throw new Error("redirect_to " + loc.searchParams.get("redirect_to"));
  const { code } = await gw(`/__test/oauth?provider=github&email=grace@example.com&code_challenge=${loc.searchParams.get("code_challenge")}`);
  const cb = await grace.go(`/api/auth/callback?code=${code}&next=/`);
  eq([cb.status, cb.location], [303, "/"], "callback");
  const s = (await grace.go("/api/session")).data.user;
  eq([s.email, s.name, s.provider], ["grace@example.com", "Grace Hopper", "github"], "profile from provider");
});
await t("oauth: a code without this browser's verifier is refused", async () => {
  const other = new Browser();
  const r = await other.go("/api/auth/signin?provider=google"), ch = new URL(r.location).searchParams.get("code_challenge");
  const { code } = await gw(`/__test/oauth?provider=google&email=eve@example.com&code_challenge=${ch}`);
  const cb = await stranger.go(`/api/auth/callback?code=${code}`);
  eq([cb.status, cb.location], [303, "/?auth_error=callback"], "refused");
});
await t("open redirects are neutralised", async () => {
  const { token_hash } = await (async () => { await stranger.go("/api/auth/email", { method: "POST", json: { email: "mallory@example.com" } }); return gw("/__test/otp?email=mallory@example.com"); })();
  eq((await new Browser().go(`/api/auth/confirm?token_hash=${token_hash}&type=email&next=//evil.example`)).location, "/", "next");
});
let brainA;
await t("first visit creates a profile and an empty brain", async () => {
  const r = await ada.go("/api/brain"); brainA = r.data;
  eq([r.status, r.data.nodes.length, r.data.brain.name], [200, 0, "My AI Brain"], "brain");
});
await t("import: start → batches → finish writes nodes, connections and a sync record", async () => {
  const neurons = NEURONS;
  const { syncId } = (await ada.go("/api/brain/import", { method: "POST", json: { op: "start", provider: "import" } })).data;
  let created = 0, conns = 0;
  for (let i = 0; i < neurons.length; i += 25) { const r = (await ada.go("/api/brain/import", { method: "POST", json: { op: "batch", syncId, nodes: neurons.slice(i, i + 25) } })).data; created += r.created; conns += r.connectionsCreated; }
  eq((await ada.go("/api/brain/import", { method: "POST", json: { op: "finish", syncId, ok: true } })).data, { done: true }, "finish");
  const b = (await ada.go("/api/brain")).data;
  const edges = new Set(); SEED.neurons.forEach((n) => n.connections.forEach((c) => edges.add([n.id, c].sort().join("|"))));
  eq([created, b.nodes.length, conns, b.connections.length], [SEED.neurons.length, SEED.neurons.length, edges.size, edges.size], "counts");
  eq([b.history[0].status, b.history[0].nodes_created, b.sources.find((s) => s.provider === "import").status], ["completed", SEED.neurons.length, "connected"], "sync state");
  const gold = b.nodes.find((n) => n.id === "p-gold");
  eq([gold.visibility, gold.title, b.nodes.find((n) => n.id === "s-ds").visibility], ["private", "Gold Investment App", "private"], "visibility defaults");
});
await t("re-import is incremental: nothing new is created", async () => {
  const { syncId } = (await ada.go("/api/brain/import", { method: "POST", json: { op: "start", provider: "claude" } })).data;
  const r = (await ada.go("/api/brain/import", { method: "POST", json: { op: "batch", syncId, nodes: NEURONS.slice(0, 20) } })).data;
  await ada.go("/api/brain/import", { method: "POST", json: { op: "finish", syncId, ok: true } });
  eq([r.created, r.updated, r.connectionsCreated], [0, 20, 0], "incremental");
});
await t("isolation: another account sees none of it and cannot write into it", async () => {
  const g = (await grace.go("/api/brain")).data;
  eq([g.nodes.length, g.connections.length, g.brain.id === brainA.brain.id], [0, 0, false], "grace's brain");
  const { syncId } = (await ada.go("/api/brain/import", { method: "POST", json: { op: "start", provider: "import" } })).data;
  const hijack = await grace.go("/api/brain/import", { method: "POST", json: { op: "batch", syncId, nodes: [{ id: "planted", title: "Planted", type: "idea" }] } });
  if (hijack.status < 400) throw new Error("grace wrote into ada's sync: " + hijack.status);
  if (/planted|sync|row/i.test(JSON.stringify(hijack.data))) throw new Error("error leaked detail: " + JSON.stringify(hijack.data));
  eq((await ada.go("/api/brain")).data.nodes.some((n) => n.id === "planted"), false, "ada untouched");
  await ada.go("/api/brain/import", { method: "POST", json: { op: "finish", syncId, ok: true } });
});
await t("hostile input is cleaned or rejected by the server", async () => {
  const { syncId } = (await grace.go("/api/brain/import", { method: "POST", json: { op: "start", provider: "chatgpt" } })).data;
  const r = (await grace.go("/api/brain/import", { method: "POST", json: { op: "batch", syncId, nodes: [
    { id: "ok-1", title: "<img src=x onerror=alert(1)>", type: "rocket", weight: 99, domains: ["ai", "evil"], visibility: "public", connections: ["missing", "ok-1"] },
    { id: "", title: "no key" }, { id: "x", title: "" }, "not an object"] } })).data;
  eq([r.created, r.rejected], [1, 3], "accepted/rejected");
  const n = (await grace.go("/api/brain")).data.nodes.find((x) => x.id === "ok-1");
  eq([n.type, n.weight, n.domains, n.visibility], ["skill", 5, ["ai"], "public"], "normalised");   // text stays text; the renderer escapes it
  const big = await grace.go("/api/brain/import", { method: "POST", json: { op: "batch", syncId, nodes: Array.from({ length: 301 }, (_, i) => ({ id: "n" + i, title: "n" })) } });
  eq(big.status, 413, "batch cap");
});
await t("connected AI reports honest capabilities; Claude can't be 'connected'", async () => {
  const s = (await ada.go("/api/sources")).data.sources;
  eq(s.map((x) => [x.provider, x.capabilities.connect, x.capabilities.import]), [["claude", false, true], ["chatgpt", false, true], ["import", false, true]], "capabilities");
  const c = await ada.go("/api/sources", { method: "POST", json: { provider: "claude", action: "connect" } });
  eq([c.status, c.data.error.code], [409, "not_available"], "connect");
  const d = await ada.go("/api/sources", { method: "POST", json: { provider: "claude", action: "disconnect" } });
  eq([d.status, d.data.source.status, d.data.source.lastSyncedAt], [200, "not_connected", null], "disconnect");
});
await t("writes without the same-site header or from another origin are refused", async () => {
  const r1 = await ada.go("/api/brain/data", { method: "DELETE", headers: { "x-brain-request": "0" } });
  const r2 = await ada.go("/api/brain/data", { method: "DELETE", headers: { origin: "https://evil.example" } });
  eq([r1.status, r2.status, (await ada.go("/api/brain")).data.nodes.length], [403, 403, SEED.neurons.length], "blocked");
});
await t("an expiring session refreshes itself and rotates the cookie", async () => {
  accessTtl = 5;   // the next session expires almost at once
  const b = new Browser();
  await b.go("/api/auth/email", { method: "POST", json: { email: "ada@example.com" } });
  await b.go(`/api/auth/confirm?token_hash=${(await gw("/__test/otp?email=ada@example.com")).token_hash}&type=email`);
  const before = [...b.jar].find(([k]) => isSession(k))[1];
  const r = await b.go("/api/session");
  const after = [...b.jar].find(([k]) => isSession(k))[1];
  eq([r.data.user && r.data.user.email, before !== after], ["ada@example.com", true], "refreshed");
});
await t("a tampered session cookie is treated as signed out", async () => {
  const b = new Browser(); b.jar = new Map([...ada.jar].map(([k, v]) => [k, v.slice(0, -12) + "tamperedAAAA"]));
  eq((await b.go("/api/brain")).status, 401, "status");
});
await t("delete imported data, then the whole brain", async () => {
  eq((await ada.go("/api/brain/data", { method: "DELETE" })).data, { deleted: true }, "data");
  const b = (await ada.go("/api/brain")).data;
  eq([b.nodes.length, b.connections.length, b.history.length, b.sources.length], [0, 0, 0, 0], "after data delete");
  await ada.go("/api/brain", { method: "PATCH", json: { name: "Ada’s Brain" } });
  eq((await ada.go("/api/brain")).data.brain.name, "Ada’s Brain", "rename");
  eq((await ada.go("/api/brain", { method: "DELETE" })).data, { deleted: true }, "brain");
  const fresh = (await ada.go("/api/brain")).data;
  eq([fresh.brain.id !== b.brain.id, fresh.brain.name, fresh.nodes.length], [true, "My AI Brain", 0], "fresh brain");
});
await t("sign out clears the session", async () => {
  eq((await ada.go("/api/auth/signout", { method: "POST", json: {} })).data, { signedOut: true }, "signout");
  eq([(await ada.go("/api/session")).data.user, (await ada.go("/api/brain")).status], [null, 401], "after");
});
await t("database errors reach the log, not the browser", async () => {
  const r = await grace.go("/api/brain/import", { method: "POST", json: { op: "batch", syncId: randomUUID(), nodes: [] } });
  if (r.status < 400 || /PGRST|JSON object|coerce|relation|sql/i.test(JSON.stringify(r.data))) throw new Error(JSON.stringify(r));
  if (!/\[api\]/.test(appLog)) throw new Error("nothing logged server-side");
});

app.kill(); gateway.close(); await db.end();
for (const n of ["brain-rest", "brain-db"]) try { sh("docker", ["rm", "-f", n]); } catch {}
console.log(failures ? `\n${failures} integration test(s) failed.` : "\nIntegration tests passed.");
process.exit(failures ? 1 : 0);
