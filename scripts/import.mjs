// Claude history → brain.json. See CLAUDE.md "Importer".
//   npm run import -- <conversations-000.zip | conversations.json | export folder> [more files…] [options]
//     --llm            run the Claude pass (reads every chat; costs API credits, asks first)
//     --yes            skip the cost confirmation for --llm
//     --out <file>     default data/brain.json (gitignored: it's personal)
//     --base <file>    brain to merge into. Default: --out if it exists, else the seed brain
//     --threshold <n>  offline grouping strictness, 0.1 (looser) to 0.3 (stricter). Default 0.16
// Then load the result in the app: Import → choose data/brain.json.
import { readFile, readdir, writeFile, mkdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Importer } from "../src/importer/core.js";
import { CONV, SEED } from "../src/data/seed.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2), flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const inputs = args.filter((a, i) => !a.startsWith("--") && !["--out", "--base", "--threshold"].includes(args[i - 1]));
const out = resolve(opt("--out", join(root, "data/brain.json")));
const cachePath = join(root, ".brain-cache/digests.json");
const exists = (p) => stat(p).then(() => true, () => false);
const fail = (m) => { console.error("✗ " + m); process.exit(1); };

if (!inputs.length) fail("Pass the export: the zip from the email (no need to unzip), conversations.json, or the export folder.\n  npm run import -- ~/Downloads/conversations-000.zip");
// A folder means its conversations.json, or else every conversations*.zip / *.json in it.
const paths = [];
for (const input of inputs) {
  const p = resolve(input);
  if (!(await stat(p).catch(() => fail(`Not found: ${input}`))).isDirectory()) { paths.push(p); continue; }
  const names = await readdir(p);
  const pick = names.includes("conversations.json") ? ["conversations.json"] : names.filter((n) => /^conversations.*\.(zip|jsonl?)$/i.test(n));
  if (!pick.length) fail(`No conversations.json or conversations-*.zip in ${input}.`);
  paths.push(...pick.map((n) => join(p, n)));
}
let data;
try {
  const r = await Importer.readExport(await Promise.all(paths.map(async (p) => ({ name: basename(p), bytes: new Uint8Array(await readFile(p)) }))));
  if (r.manifest) {
    const convs = r.manifest.filter((f) => f.category === "conversations" && f.url);
    fail(`That's the export manifest: it lists download links, not your chats.${convs.length ? " Download " + convs.map((f) => f.filename).join(", ") + " (each link works once), then pass the zip:\n  " + convs.map((f) => f.url).join("\n  ") : ""}`);
  }
  data = r.conversations || r.data;
} catch (e) { fail(e instanceof SyntaxError ? `${paths.map((p) => basename(p)).join(", ")} isn't valid JSON.` : e.code ? `Couldn't read ${paths.join(", ")}.` : e.message); }

const basePath = opt("--base", (await exists(out)) ? out : null);
let base = SEED.neurons;
if (basePath) { const b = JSON.parse(await readFile(resolve(basePath), "utf8")); base = Array.isArray(b) ? b : b.neurons || []; }
console.log(`Merging into ${basePath ? basePath.replace(root, "") : "the seed brain"} (${base.length} neurons)`);

let brain, stats;
try {
  if (!flag("--llm")) {
    ({ brain, stats } = Importer.fromExport(data, { base, conv: CONV, threshold: +opt("--threshold", .16) }));
  } else {
    const llm = await import("./importer/llm.mjs");
    const convs = Importer.parseExport(data);
    const cache = (await exists(cachePath)) ? JSON.parse(await readFile(cachePath, "utf8")) : {};
    const est = llm.estimate(convs, (c) => cache[c.id] && cache[c.id].updated === c.updated);
    console.log(`${convs.length} conversations, ${est.todo} not yet digested. Model: ${llm.MODEL}`);
    console.log(`Estimate: ~${(est.tokens.input / 1e3).toFixed(0)}k input + ~${(est.tokens.output / 1e3).toFixed(0)}k output tokens ≈ $${est.usd.toFixed(2)}`);
    if (!flag("--yes")) {
      if (!process.stdin.isTTY) fail("Add --yes to run the Claude pass non-interactively.");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ok = /^y/i.test(await rl.question("Run the Claude pass? [y/N] ")); rl.close();
      if (!ok) process.exit(0);
    }
    const client = await llm.makeClient();
    let saving = Promise.resolve();   // serialised: digest workers finish concurrently
    const saveCache = () => (saving = saving.then(async () => { await mkdir(dirname(cachePath), { recursive: true }); await writeFile(cachePath, JSON.stringify(cache)); }));
    const u1 = await llm.digestAll(client, convs, cache, { onProgress: async (d, t) => { process.stdout.write(`\r  digested ${d}/${t}`); await saveCache(); } });
    if (est.todo) process.stdout.write("\n");
    await saveCache();
    console.log("  grouping into knowledge…");
    const { neurons, usage: u2 } = await llm.synthesize(client, convs, cache, base.map((n) => Importer.expand(n, CONV)));
    const merged = Importer.merge(base, neurons, { conv: CONV });
    brain = { version: 2, generatedAt: Importer.iso(Date.now()), source: { kind: "claude-export", mode: "llm", model: llm.MODEL, conversations: convs.length }, neurons: merged.neurons };
    const covered = new Set(neurons.flatMap((n) => n.conversations.map((c) => c.id)));
    stats = { conversations: convs.length, topics: neurons.length, ...merged.stats, left: convs.length - covered.size };
    console.log(`  tokens used: ${u1.input + u2.input} in, ${u1.output + u2.output} out`);
  }
} catch (e) { fail(e.message); }

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(brain, null, 1));
const edges = new Set(); brain.neurons.forEach((n) => (n.connections || []).forEach((c) => edges.add([n.id, c].sort().join("|"))));
console.log(`✓ ${stats.conversations} conversations → ${stats.topics} knowledge neurons (${stats.added} new, ${stats.updated} merged into existing)` +
  (stats.left ? `, ${stats.left} one-off chats left out` : ""));
console.log(`  ${brain.neurons.length} neurons, ${edges.size} connections → ${out.replace(root, "")}`);
console.log(`  Imported neurons are private. Open the app → Import → choose this file.`);
if (!flag("--llm")) console.log(`  For what you learned, built and concluded, add --llm (the Claude pass).`);
