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
import { makeZip } from "./fixtures/zip.mjs";
import { Learn } from "../src/learn/core.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEED } from "../src/data/seed.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = root + "tests/output/";
const useDist = process.argv.includes("--dist");
const port = 5199;
const base = `http://localhost:${port}/`;

await mkdir(out, { recursive: true });
// No .env: the local scenarios run without accounts, exactly like the claude.ai artifact.
const server = spawn(process.execPath, [root + "scripts/serve.mjs", String(port), ...(useDist ? ["--dist"] : [])], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BRAIN_IGNORE_ENV: "1", SUPABASE_URL: "" } });
// Wait for *our* server to say it's listening, in the right mode. A stale server on the same port would
// otherwise answer instead, and a --dist run would silently test the dev build.
await new Promise((resolve, reject) => {
  let log = "";
  const done = (e) => { clearTimeout(timer); e ? reject(e) : resolve(); };
  const timer = setTimeout(() => done(new Error("test server didn't start:\n" + log)), 8000);
  server.stdout.on("data", (d) => { log += d; if (/My AI Brain →/.test(log)) done(useDist && !/production build/.test(log) ? new Error("server isn't serving dist/") : null); });
  server.stderr.on("data", (d) => { log += d; });
  server.on("exit", (code) => done(new Error(`test server exited (${code}); is port ${port} already in use?\n` + log)));
});

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
// Understanding the map: first-visit guide, the ? legend, and a reason on every link.
await scenario("guide", { width: 1440, height: 900 }, [
  async (p) => { await p.waitForSelector("#tour:not([hidden])", { timeout: 6000 }); if (!/Each node/.test(await p.textContent("#tour"))) throw new Error("guide step 1"); await p.click("[data-tour-next]"); },
  async (p) => { if (!/Lines connect/.test(await p.textContent("#tour"))) throw new Error("guide step 2"); await p.click("[data-tour-next]"); await p.click("[data-tour-next]"); if (await p.isVisible("#tour")) throw new Error("guide didn't close"); await p.click("#btnHelp"); },
  async (p) => { if (!/A line means related/.test(await p.textContent("#help"))) throw new Error("legend"); await p.keyboard.press("Escape"); await p.fill("#q", "design"); await p.keyboard.press("Enter"); },
  async (p) => { const why = await p.$$eval(".orbs.rel .rw", (els) => els.map((e) => e.textContent)); if (!why.length || why.some((w) => !w.trim())) throw new Error("link reasons missing: " + JSON.stringify(why)); console.log("    why linked: " + why.slice(0, 3).join(" | ")); },
], { wait: 5500 });
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
await writeFile(out + "conversations-000.zip", makeZip([{ name: "conversations.json", text: JSON.stringify(makeExport()) }]));
await scenario("import-export", { width: 1440, height: 900 }, [
  async (p) => {
    await p.click("#btnImport");
    // The wrong file from an export, and the zip itself, get a specific message, not a schema error.
    const manifest = JSON.stringify({ version: "1.0", data_files: [{ category: "conversations", filename: "conversations-000.zip", export_url: "https://claude.ai/export/x/download/y" }] });
    for (const [name, body, want] of [["users.json", '[{"uuid":"u","full_name":"A","email_address":"a@b.c"}]', /users\.json/], ["broken.zip", "PK\u0003\u0004rest", /couldn’t be opened/], ["manifest.json", manifest, /export manifest/]]) {
      await p.setInputFiles("#file", { name, mimeType: "application/octet-stream", buffer: Buffer.from(body) });
      await p.waitForFunction((rx) => new RegExp(rx).test(document.getElementById("impMsg").textContent), want.source);
    }
    const link = await p.getAttribute("#impMsg a", "href");
    if (link !== "https://claude.ai/export/x/download/y") throw new Error(`manifest link was ${link}`);
    await p.setInputFiles("#file", out + "conversations-000.zip");
    await p.waitForFunction(() => /Grouped/.test(document.getElementById("impMsg").textContent));
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

// Learn from a link: the reader (/api/learn) is mocked with the real digest of a fixture article.
const ARTICLE = "https://fieldnotes.example/onboarding";
const DIGEST = Learn.digest(Learn.extractHtml(readFileSync(new URL("./fixtures/article.html", import.meta.url), "utf8"), ARTICLE));
const withLearn = (base) => (path, req) => (path === "/api/learn" ? (JSON.parse(req.postData() || "{}").url === ARTICLE ? { body: DIGEST } : { status: 422, body: { error: { code: "no_text", message: "We couldn’t find readable writing on that page." } } }) : base ? base(path, req) : null);
await scenario("learn", { width: 1440, height: 900 }, [
  async (p) => { await p.click("#btnLearn"); await visible(p, "#learnScrim"); await p.fill("#learnIn", "hello"); await p.click("#learnForm .cta"); if (!/full article link/.test(await p.textContent("#learnMsg"))) throw new Error("bad input message");
    await p.fill("#learnIn", "fieldnotes.example/nothing-here"); await p.click("#learnForm .cta"); await p.waitForTimeout(600);
    if (!/couldn’t find readable writing/.test(await p.textContent("#learnMsg"))) throw new Error("error message: " + (await p.textContent("#learnMsg"))); await p.fill("#learnIn", "Worth a read: " + ARTICLE + " (via a friend)"); await p.press("#learnIn", "Enter"); },
  async (p) => { await p.waitForSelector("#panel.open", { timeout: 8000 }); const t = await p.textContent("#pBody");
    if (!/Designing Onboarding That Sticks/.test(t) || !/Key ideas · 4/.test(t)) throw new Error("source panel: " + t.slice(0, 200));
    if ((await p.getAttribute("#pBody a.ext", "href")) !== ARTICLE) throw new Error("read-the-original link");
    if (!/demo for this visit/.test(await p.textContent("#banner"))) throw new Error("demo banner");
    await p.click("#pBody .orbs.rel button >> nth=1"); },
  async (p) => { await p.waitForTimeout(800); const href = await p.getAttribute("#pBody a.ext", "href");
    if (!href || !href.startsWith(ARTICLE + "#:~:text=")) throw new Error("jump-to-passage link: " + href);
    if (!(await p.isVisible("#pBody .p-quote"))) throw new Error("quote");
    const why = await p.$$eval("#pBody .orbs.rel .rw", (els) => els.map((e) => e.textContent)); console.log("    idea links: " + why.join(" | "));
    await p.click("#back"); await p.click("#btnLearn");
    await p.fill("#learnIn", "# Retrieval for beginners\n\nRetrieval-augmented generation fetches relevant documents and adds them to the prompt so the model can answer from them. Good chunking matters more than the model you pick.\n\nEmbeddings turn each chunk into a vector, and semantic search finds the closest chunks for a question. Hybrid search adds keyword matching for names and codes. Retrieval quality limits answer quality, so evaluate the search step on its own before tuning the prompt.");
    await p.click("#learnForm .cta"); },
  async (p) => { await p.waitForSelector("#panel.open", { timeout: 8000 }); if (!/Retrieval for beginners/.test(await p.textContent("#pTitle"))) throw new Error("pasted text source"); },
], { mock: withLearn(null), wait: 6500, allow: /status of 422/ });
await scenario("learn-landing", { width: 1440, height: 900 }, [
  async (p) => { await visible(p, "#landingLearn"); await p.fill("#landingUrl", ARTICLE); await p.press("#landingUrl", "Enter"); },
  async (p) => { await p.waitForSelector("#panel.open", { timeout: 8000 }); if (!/Designing Onboarding That Sticks/.test(await p.textContent("#pTitle"))) throw new Error("landing → source panel"); },
], { mock: withLearn(api(null, null)), wait: 7000 });
await scenario("learn-link", { width: 1440, height: 900 }, [
  async (p) => { await p.waitForSelector("#panel.open", { timeout: 8000 }); if (!/Designing Onboarding That Sticks/.test(await p.textContent("#pTitle"))) throw new Error("?learn= didn't map the article");
    if (/learn=/.test(await p.evaluate(() => location.search))) throw new Error("?learn= left in the address"); },
], { mock: withLearn(null), wait: 7000, hash: "?learn=" + encodeURIComponent(ARTICLE) });
// Remember what you read: the daily nudge, a recall session, the library, and a note that survives a reload.
await scenario("recall", { width: 1440, height: 900 }, [
  async (p) => { if (await p.isVisible("#tour")) await p.click("[data-tour-skip]"); await p.waitForSelector("#nudge:not([hidden])", { timeout: 9000 });
    if (!/to bring back/.test(await p.textContent("#nudge"))) throw new Error("nudge"); await p.click("[data-nudge-go]"); await visible(p, "#recallScrim");
    if (!(await p.isVisible("#recallBody .gap"))) throw new Error("no hidden word on the first card"); },
  async (p) => { await p.keyboard.press("Space"); const ans = await p.textContent("#recallBody mark"); if (!ans || ans.length < 5) throw new Error("answer: " + ans);
    await p.keyboard.press("2"); await p.keyboard.press("Space"); await p.keyboard.press("1"); },
  async (p) => { for (let i = 0; i < 12 && (await p.isVisible("[data-rc-show]")); i++) { await p.click("[data-rc-show]"); await p.click('[data-rc-grade="1"]'); }
    const t = await p.textContent("#recallBody"); if (!/recalled · \d+ remembered first time/.test(t) || !/come back tomorrow/.test(t)) throw new Error("done screen: " + t.slice(0, 160));
    const mine = JSON.parse(await p.evaluate(() => localStorage.getItem("aibrain:mine")) || "{}"); if (Object.values(mine).reduce((a, m) => a + Object.keys(m.review || {}).length, 0) < 5) throw new Error("progress not kept: " + JSON.stringify(mine).slice(0, 120));
    await p.click("[data-rc-close]"); if (await p.isVisible("#recallBadge")) throw new Error("badge still showing after the session"); },
  async (p) => { await p.click("#btnLibrary"); await visible(p, "#library"); if ((await p.$$(".lib-tops li")).length < 20) throw new Error("library topics");
    const all = (await p.$$(".lib-tops li")).length; await p.fill("#libQ", "prompt"); const n = (await p.$$(".lib-tops li")).length;
    if (n < 1 || n >= all) throw new Error(`search found ${n} of ${all}`); await p.click(".lib-tops button >> nth=0"); },
  async (p) => { await p.waitForSelector("#panel.open"); if (await p.isVisible("#library")) throw new Error("library stayed open"); await p.click("[data-note-edit]");
    await p.fill("#noteIn", "Explain this to the team before the offsite."); await p.keyboard.press("Control+Enter"); await p.waitForTimeout(300);
    if (!/Explain this to the team/.test(await p.textContent("#pBody .sec.mine"))) throw new Error("note not shown"); await p.click("#back"); },
  async (p) => { await p.fill("#q", "offsite"); await p.waitForTimeout(300); if (!/Your note/.test(await p.textContent("#results"))) throw new Error("search doesn't reach notes"); await p.reload(); await p.waitForTimeout(6500);
    await p.click("#btnLibrary"); await p.click('[data-lib-f="notes"]'); if (!/Explain this to the team/.test(await p.textContent("#library"))) throw new Error("note lost on reload"); },
], { wait: 6000 });
// Signed in: recall progress and notes are saved to the account as they happen (PATCH /api/brain { nodes }),
// articles fill the library, and it downloads as Markdown with links back to each passage.
const LEARNED = Learn.toNeurons(DIGEST, nodes, { now: Date.now() - 3 * 864e5 }).neurons;
const patches = [];
const learnedPayload = { ...payload(true), nodes: [...nodes, ...LEARNED.map(({ connections, ...n }) => n)],
  connections: [...edges, ...LEARNED.flatMap((n) => n.connections.map((c) => ({ source: n.id, target: c, strength: .6, type: "related" })))] };
const withPatch = (base) => (path, req) => (path === "/api/brain" && req.method() === "PATCH" ? (patches.push(JSON.parse(req.postData() || "{}")), { body: { updated: 1 } }) : base(path, req));
await scenario("recall-app", { width: 1440, height: 900 }, [
  async (p) => { if (await p.isVisible("#tour")) await p.click("[data-tour-skip]"); await p.click("#btnRecall"); await visible(p, "#recallScrim");
    if (!/From Designing Onboarding That Sticks/.test(await p.textContent(".rc-ctx"))) throw new Error("new reading should come first");
    await p.keyboard.press("Space"); await p.keyboard.press("2"); await p.waitForTimeout(1400);
    const sent = patches.flatMap((b) => b.nodes); if (!sent.some((n) => LEARNED.some((l) => l.id === n.id) && n.review && Object.keys(n.review).length)) throw new Error("recall progress not saved: " + JSON.stringify(patches));
    await p.keyboard.press("Escape"); },
  async (p) => { await p.click("#btnLibrary"); await p.click('[data-lib-f="articles"]'); const t = await p.textContent("#library");
    if (!/Designing Onboarding That Sticks/.test(t) || !/4 key ideas/.test(t)) throw new Error("library articles: " + t.slice(0, 200));
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("[data-lib-md]")]); const md = readFileSync(await dl.path(), "utf8");
    if (!md.includes("[Designing Onboarding That Sticks](" + ARTICLE + ")") || !md.includes(ARTICLE + "#:~:text=") || !md.includes(DIGEST.ideas[0].quote)) throw new Error("markdown: " + md.slice(0, 300));
    await p.click(".lib-ideas button >> nth=0"); },
  async (p) => { await p.waitForSelector("#panel.open"); await p.click("[data-note-edit]"); await p.fill("#noteIn", "Use for the signup flow."); await p.click("[data-note-save]"); await p.waitForTimeout(1400);
    if (!patches.some((b) => b.nodes.some((n) => n.note === "Use for the signup flow."))) throw new Error("note not saved to the account"); },
], { mock: withPatch(api(user, { body: learnedPayload })), wait: 8000 });
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
