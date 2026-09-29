// Visual smoke test: renders the brain in headless Chromium across the key states
// and saves screenshots to tests/output/. Fails on any page error or console error.
//   npm test                 → tests the dev source (index.html + ES modules)
//   npm test -- --dist       → tests the production build (dist/, with vercel.json's headers and CSP)
// The hosted-app flows run against a mocked /api (see `api` below); tests/integration.mjs covers the real one.
// Needs Playwright: `npm i` (devDependency) then `npx playwright install chromium`.
// WebGL runs through SwiftShader so it works without a GPU.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { makeExport } from "./fixtures/claude-export.mjs";
import { fileURLToPath } from "node:url";
import { SEED } from "../src/data/seed.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = root + "tests/output/";
const useDist = process.argv.includes("--dist");
const port = 5199;
const base = `http://localhost:${port}/`;

await mkdir(out, { recursive: true });
// No .env: the local scenarios run without accounts, exactly like the claude.ai artifact.
const server = spawn(process.execPath, [root + "scripts/serve.mjs", String(port), ...(useDist ? ["--dist"] : [])], { stdio: "ignore", env: { ...process.env, BRAIN_IGNORE_ENV: "1", SUPABASE_URL: "" } });
await new Promise((r) => setTimeout(r, 400));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
let failures = 0;

async function scenario(name, viewport, steps, { hash = "", wait = 6000, touch = false, mock = null, allow = null } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  if (mock) await page.route("**/api/**", (route) => { const u = new URL(route.request().url()), r = mock(u.pathname, route.request()); return r ? route.fulfill({ status: r.status || 200, contentType: "application/json", body: JSON.stringify(r.body) }) : route.continue(); });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)|favicon\.ico/.test(m.location().url || "")) errors.push(m.text()); });
  await page.goto(base + hash);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}${name}-0.png` });
  let i = 1;
  for (const step of steps) {
    try { await step(page); } catch (e) { errors.push("step: " + e.message.split("\n")[0]); }
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${out}${name}-${i++}.png` });
  }
  const real = errors.filter((e) => !/ERR_(FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/.test(e) && !(allow && allow.test(e)));
  console.log(`${real.length ? "✗" : "✓"} ${name}${real.length ? "  " + real.join(" | ") : ""}`);
  failures += real.length;
  await ctx.close();
}

// Labels drift with the idle sway, so clicks on them use force.
await scenario("desktop", { width: 1440, height: 900 }, [
  (p) => p.fill("#q", "design"),
  (p) => p.keyboard.press("Enter"),
  async (p) => { await p.click(".orbs button >> nth=1", { force: true }); await p.waitForTimeout(200); await p.click('[data-tab="conversations"]'); },
  async (p) => { await p.click("#back"); await p.click("#btnInsights"); },
  async (p) => { await p.click("#btnInsights"); await p.$eval("#tl", (el) => { el.value = 400; el.dispatchEvent(new Event("input", { bubbles: true })); }); },
]);
// The five views morph the same data; each gets a screenshot once its morph settles.
await scenario("states", { width: 1440, height: 900 }, [
  (p) => p.keyboard.press("2"),
  (p) => p.keyboard.press("3"),
  (p) => p.keyboard.press("4"),
  async (p) => { await p.keyboard.press("5"); await p.waitForTimeout(600); },
  async (p) => { await p.keyboard.press("1"); await p.waitForTimeout(600); },
]);
await scenario("phone", { width: 390, height: 844 }, [
  (p) => p.click('[data-r="ai"]'),
  (p) => p.click('.nl:not([data-i="-1"]) >> nth=0', { force: true }),
], { touch: true });
await scenario("stress-3000", { width: 1440, height: 900 }, [], { hash: "#stress", wait: 7000 });
await scenario("empty", { width: 1440, height: 900 }, [], { hash: "#empty", wait: 4000 });
// Drop a (synthetic) raw claude.ai export: it's grouped in the page and merged into the seed brain.
await writeFile(out + "claude-export.json", JSON.stringify(makeExport()));
await scenario("import-export", { width: 1440, height: 900 }, [
  async (p) => {
    await p.click("#btnImport");
    // The wrong file from an export, and the zip itself, get a specific message, not a schema error.
    for (const [name, body, want] of [["users.json", '[{"uuid":"u","full_name":"A","email_address":"a@b.c"}]', /users\.json/], ["export.zip", "PK\u0003\u0004rest", /Unzip it first/]]) {
      await p.setInputFiles("#file", { name, mimeType: "application/octet-stream", buffer: Buffer.from(body) });
      await p.waitForFunction((rx) => new RegExp(rx).test(document.getElementById("impMsg").textContent), want.source);
    }
    await p.setInputFiles("#file", out + "claude-export.json");
  },
  async (p) => {
    const msg = await p.textContent("#impMsg"), banner = await p.textContent("#banner");
    if (!/Grouped 25 conversations/.test(msg)) throw new Error(`import message was "${msg}"`);
    if (!/imported/.test(banner)) throw new Error("import banner missing");
    await p.fill("#q", "auto layout"); await p.keyboard.press("Enter");
  },
]);

// ── hosted app flows, with /api mocked ────────────────────────────────────
const user = { id: "u-1", email: "ada@example.com", name: "Ada Lovelace", avatar: null, provider: "google" };
const nodes = SEED.neurons.map(({ conv, connections, ...n }) => ({ ...n, conversations: [] }));
const edges = SEED.neurons.flatMap((n) => n.connections.map((c) => ({ source: n.id, target: c, strength: .6, type: "related" })));
const payload = (withNodes) => ({ brain: { id: "b-1", name: "My AI Brain" }, profile: { name: user.name, email: user.email }, nodes: withNodes ? nodes : [], connections: withNodes ? edges : [], clusters: [], metadata: {},
  sources: withNodes ? [{ provider: "claude", status: "connected", last_synced_at: new Date(Date.now() - 24 * 60e3).toISOString(), next_sync_at: null }] : [],
  history: withNodes ? [{ id: "h1", provider: "claude", started_at: new Date().toISOString(), status: "completed", items_processed: 25, nodes_created: 7, connections_created: 9 }] : [] });
const api = (session, brain) => (path) => ({ "/api/config": { body: { accounts: true, signIn: ["google", "github", "email"] } }, "/api/session": { body: { user: session, accounts: true } },
  "/api/brain": brain, "/api/auth/email": { body: { sent: true } } })[path] || null;
const visible = async (p, sel) => { if (!(await p.isVisible(sel))) throw new Error(`${sel} is not visible`); };

await scenario("app-landing", { width: 1440, height: 900 }, [
  async (p) => { await visible(p, "#landing"); await p.click("#landingBuild"); await visible(p, "#auth"); },
  async (p) => { await p.click("#authEmailBtn"); await p.fill("#authEmailIn", "ada@example.com"); await p.press("#authEmailIn", "Enter"); await p.waitForTimeout(400);
    if (!/Check your inbox/.test(await p.textContent("#authMsg"))) throw new Error("no confirmation"); },
  async (p) => { await p.keyboard.press("Escape"); await visible(p, "#landing"); await p.click("#landingDemo"); if (await p.isVisible("#landing")) throw new Error("landing still up"); },
], { mock: api(null, null), wait: 7000 });
await scenario("app-welcome", { width: 1440, height: 900 }, [
  async (p) => { await visible(p, "#welcome"); if (!/Welcome to your Brain/.test(await p.textContent("#welcomeTitle"))) throw new Error("title"); await p.click('[data-act="connect-claude"]'); await visible(p, "#connect"); },
], { mock: api(user, { body: payload(false) }), wait: 7000 });
await scenario("app-brain", { width: 1440, height: 900 }, [
  async (p) => { if (await p.isVisible("#welcome")) throw new Error("welcome shown for a full brain"); await p.click("#btnAccount"); await visible(p, "#account");
    if (!/Imported · 24 min ago/.test(await p.textContent("#account"))) throw new Error("source status"); },
  async (p) => { await p.click('#account [data-act="del-data"]'); if (!/Confirm/.test(await p.textContent('#account [data-act="del-data"]'))) throw new Error("no confirm step"); },
], { mock: api(user, { body: payload(true) }), wait: 8000 });
await scenario("app-error", { width: 1440, height: 900 }, [
  async (p) => { await visible(p, "#errorState"); if (/PGRST|sql|stack/i.test(await p.textContent("#errorState"))) throw new Error("leaked detail"); },
], { mock: api(user, { status: 500, body: { error: { code: "unavailable", message: "Your Brain is temporarily unavailable. Your existing knowledge is safe." } } }), wait: 5000, allow: /status of 500/ });
await scenario("app-phone-auth", { width: 390, height: 844 }, [
  async (p) => { await p.click("#landingBuild"); await visible(p, "#auth"); },
], { mock: api(null, null), wait: 7000, touch: true });

await browser.close();
server.kill();
console.log(failures ? `\n${failures} problem(s). Screenshots in tests/output/` : "\nAll scenarios clean. Screenshots in tests/output/");
process.exit(failures ? 1 : 0);
