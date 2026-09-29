// Importer unit tests: node tests/importer.mjs (no browser, no network, no API calls).
import assert from "node:assert/strict";
import { Importer } from "../src/importer/core.js";
import { CONV, SEED } from "../src/data/seed.js";
import { toBrainNeurons } from "../scripts/importer/llm.mjs";
import { makeExport, TOPIC_TITLES } from "./fixtures/claude-export.mjs";

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.log(`✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`); }
}
const NOW = Date.parse("2026-09-29");
const run = (base = [], data = makeExport()) => Importer.fromExport(data, { base, conv: CONV, now: NOW });
const imported = (brain) => brain.neurons.filter((n) => n.source === "import");
const homeOf = (brain, title) => imported(brain).filter((n) => n.conversations.some((c) => c.title === title));

test("parses the claude.ai export and skips empty conversations", () => {
  const convs = Importer.parseExport(makeExport());
  assert.equal(convs.length, 25);
  assert.ok(convs.every((c) => c.id && c.title && c.date && c.human.length));
  assert.equal(Importer.isClaudeExport({ conversations: makeExport() }), true);
  assert.equal(Importer.isClaudeExport(SEED), false);
});

test("reads a ChatGPT export: user and assistant turns in time order", () => {
  const data = [{ id: "gpt-1", title: "Figma auto layout", create_time: 1760000000, update_time: 1760003600, mapping: {
    a: { message: { author: { role: "system" }, content: { parts: ["You are ChatGPT"] }, create_time: 1 } },
    c: { message: { author: { role: "assistant" }, content: { parts: ["Use fixed padding."] }, create_time: 3 } },
    b: { message: { author: { role: "user" }, content: { parts: ["How does auto layout padding work?", { asset: "image" }] }, create_time: 2 } },
    d: { message: null } } }, { id: "gpt-empty", title: "Empty", mapping: {} }];
  assert.equal(Importer.exportKind(data), "chatgpt");
  const [c] = Importer.parseExport(data);
  assert.deepEqual([c.id, c.title, c.date, c.turns, c.human, c.assistant], ["gpt-1", "Figma auto layout", "2025-10-09", 2, ["How does auto layout padding work?"], ["Use fixed padding."]]);
  assert.throws(() => Importer.parseExport([{ foo: 1 }]), /No conversations found/);
});

test("groups conversations into knowledge, not one neuron per chat", () => {
  const { brain, stats } = run();
  assert.ok(stats.topics <= 10, `expected ≤10 topics from 25 chats, got ${stats.topics}`);
  for (const [topic, titles] of Object.entries(TOPIC_TITLES)) {
    const homes = new Map();
    titles.forEach((t) => homeOf(brain, t).forEach((n) => homes.set(n.id, (homes.get(n.id) || 0) + 1)));
    const top = Math.max(...homes.values());
    assert.ok(top / titles.length >= .6, `${topic}: largest group holds ${top}/${titles.length} (${[...homes.keys()].join(", ")})`);
  }
  const recipe = homeOf(brain, "Recipe scaling")[0];
  assert.equal(recipe.conversations.length, 1, "an unrelated one-off chat shouldn't join a topic");
});

test("new neurons are private, well-formed and linked to real ids", () => {
  const { brain } = run();
  const ids = new Set(brain.neurons.map((n) => n.id));
  assert.equal(ids.size, brain.neurons.length, "ids are unique");
  for (const n of imported(brain)) {
    assert.equal(n.visibility, "private");
    assert.ok(n.weight >= 1 && n.weight <= 5);
    assert.ok(["foundation", "skill", "project", "experiment", "research", "idea"].includes(n.type), n.type);
    assert.ok(n.domains.length >= 1);
    assert.ok(n.connections.every((c) => ids.has(c) && c !== n.id));
    assert.ok(n.conversations.every((c) => c.id && c.title));
    assert.deepEqual([n.learned, n.created, n.insights], [[], [], []], "offline pass must not invent learnings");
  }
  assert.ok(imported(brain).some((n) => n.connections.length), "related topics get connected");
});

test("merging keeps the seed brain intact", () => {
  const { brain } = run(SEED.neurons);
  for (const s of SEED.neurons) {
    const n = brain.neurons.find((x) => x.id === s.id);
    assert.ok(n, `seed neuron ${s.id} kept`);
    assert.equal(n.title, s.title); assert.equal(n.visibility ?? "public", s.visibility ?? "public");
  }
  assert.equal(brain.neurons.length, SEED.neurons.length + imported(brain).length);
});

test("re-importing is idempotent", () => {
  const first = run(SEED.neurons).brain;
  const { brain, stats } = run(first.neurons);
  assert.equal(stats.added, 0);
  assert.equal(brain.neurons.length, first.neurons.length);
  assert.deepEqual(brain.neurons.map((n) => n.id), first.neurons.map((n) => n.id));
  for (const n of imported(brain)) assert.equal(new Set(n.conversations.map((c) => c.id)).size, n.conversations.length, "no duplicate conversations");
});

test("curated fields survive a re-import", () => {
  const first = run(SEED.neurons).brain;
  const target = imported(first).find((n) => n.conversations.length > 2);
  Object.assign(target, { title: "Auto Layout", visibility: "public", weight: 5, insights: ["Hand-written insight"] });
  const { brain } = run(first.neurons);
  const n = brain.neurons.find((x) => x.id === target.id);
  assert.deepEqual([n.title, n.visibility, n.weight, n.insights], ["Auto Layout", "public", 5, ["Hand-written insight"]]);
});

test("new conversations join the existing neuron on the next import", () => {
  const full = makeExport();
  const early = full.filter((c) => c.name !== "Figma variants cleanup");
  const first = run(SEED.neurons, early).brain;
  const { brain } = run(first.neurons, full);
  const homes = homeOf(brain, "Figma variants cleanup");
  assert.equal(homes.length, 1);
  assert.ok(homes[0].conversations.length > 1, "joined an existing topic instead of forming a lone neuron");
});

test("Claude pass output is validated and mapped back to real conversations", () => {
  const convs = Importer.parseExport(makeExport());
  const aliases = new Map(convs.map((c, i) => ["c" + (i + 1), c]));
  const base = SEED.neurons.map((n) => Importer.expand(n, CONV));
  const out = toBrainNeurons({ neurons: [
    { id: "figma", title: "Figma", domains: ["design", "bogus"], type: "skill", status: "exploring", weight: 9, description: "d",
      learned: ["Auto layout wraps"], created: [], insights: [], skills: ["Figma"], conversationIds: ["c1", "c6", "c99"], connections: ["tokens", "s-ds", "nope"] },
    { id: "tokens", title: "Design Tokens", domains: ["design"], type: "skill", status: "learned", weight: 3, description: "",
      learned: [], created: [], insights: [], skills: [], conversationIds: ["c2"], connections: [] },
    { id: "s-ds", title: "Design Systems", domains: ["design"], type: "skill", status: "built", weight: 5, description: "",
      learned: [], created: [], insights: [], skills: [], conversationIds: ["c2"], connections: [] },
    { id: "ghost", title: "No chats", domains: ["ai"], type: "idea", status: "idea", weight: 1, description: "",
      learned: [], created: [], insights: [], skills: [], conversationIds: ["c404"], connections: [] },
  ] }, aliases, base);
  assert.deepEqual(out.map((n) => n.id), ["imp-figma", "imp-tokens", "s-ds"], "new ids prefixed, existing id reused, empty neuron dropped");
  const figma = out[0];
  assert.equal(figma.weight, 5); assert.deepEqual(figma.domains, ["design"]);
  assert.equal(figma.conversations.length, 2, "unknown aliases dropped");
  assert.equal(figma.conversations[0].id, convs[0].id);
  assert.deepEqual(figma.connections, ["imp-tokens", "s-ds"]);
  const merged = Importer.merge(SEED.neurons, out, { conv: CONV }).neurons;
  const ds = merged.find((n) => n.id === "s-ds");
  assert.equal(ds.title, "Design Systems"); assert.equal(ds.visibility ?? "public", "public");
  assert.ok(ds.conversations.some((c) => c.id === convs[1].id), "seed neuron gains the conversation");
});

test("handles 3,000 conversations quickly", () => {
  const base = makeExport().filter((c) => c.chat_messages.length);
  const big = Array.from({ length: 3000 }, (_, i) => ({ ...base[i % base.length], uuid: `big-${i}` }));
  const t = performance.now();
  const { stats } = run([], big);
  const ms = performance.now() - t;
  assert.ok(ms < 8000, `took ${ms.toFixed(0)}ms`);
  assert.ok(stats.topics < 60, `3,000 repetitive chats should collapse into few topics, got ${stats.topics}`);
  console.log(`    3,000 conversations → ${stats.topics} topics in ${ms.toFixed(0)}ms`);
});

console.log(failures ? `\n${failures} importer test(s) failed.` : "\nImporter tests passed.");
process.exit(failures ? 1 : 0);
