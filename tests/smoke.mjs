// Visual smoke test: renders the brain in headless Chromium across the key states
// and saves screenshots to tests/output/. Fails on any page error or console error.
//   npm test                 → tests the dev source (index.html + ES modules)
//   npm test -- --dist       → tests the bundled dist/index.html
// Needs Playwright: `npm i` (devDependency) then `npx playwright install chromium`.
// WebGL runs through SwiftShader so it works without a GPU.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = root + "tests/output/";
const useDist = process.argv.includes("--dist");
const port = 5199;
const base = `http://localhost:${port}/${useDist ? "dist/index.html" : ""}`;

await mkdir(out, { recursive: true });
const server = spawn(process.execPath, [root + "scripts/serve.mjs", String(port)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 400));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
let failures = 0;

async function scenario(name, viewport, steps, { hash = "", wait = 6000, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
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
  const real = errors.filter((e) => !/ERR_(FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/.test(e));
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
  async (p) => { await p.click("#btnInsights"); await p.click('[data-m="7"]', { force: true }); },
]);
await scenario("phone", { width: 390, height: 844 }, [
  (p) => p.click('[data-r="ai"]'),
  (p) => p.click('.nl:not([data-i="-1"]) >> nth=0', { force: true }),
], { touch: true });
await scenario("stress-3000", { width: 1440, height: 900 }, [], { hash: "#stress", wait: 7000 });
await scenario("empty", { width: 1440, height: 900 }, [], { hash: "#empty", wait: 4000 });

await browser.close();
server.kill();
console.log(failures ? `\n${failures} problem(s). Screenshots in tests/output/` : "\nAll scenarios clean. Screenshots in tests/output/");
process.exit(failures ? 1 : 0);
