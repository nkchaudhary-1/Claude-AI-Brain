// Recall, notes and the library's data: node tests/recall.mjs (no browser, no network).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Recall } from "../src/recall/core.js";
import { Learn } from "../src/learn/core.js";
import { Cloud } from "../src/cloud.js";
import { DEMO } from "../src/data/demo.js";
import { cleanNode, toClientNode, cleanPatches } from "../api/_lib/model.js";
import brainHandler from "../api/brain/index.js";
import { patchNodes } from "../api/_lib/store.js";

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.log(`✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`); }
}
const DAY = 864e5, NOW = Date.parse("2026-10-27T10:00:00"), today = Recall.dayOf(NOW);
const html = readFileSync(new URL("./fixtures/article.html", import.meta.url), "utf8");
const dg = Learn.digest(Learn.extractHtml(html, "https://fieldnotes.example/onboarding"));
const article = (when) => Learn.toNeurons(dg, DEMO.neurons, { now: when }).neurons;
const brain = [...DEMO.neurons, ...article(NOW - 3 * DAY)];

await test("cards are the exact sentences saved, with one distinctive word hidden", () => {
  const all = Recall.items(brain, { now: NOW });
  const quotes = all.filter((x) => x.kind === "quote"), learned = all.filter((x) => x.kind === "learned");
  assert.equal(quotes.length, 4, "one card per key idea; the source node has none");
  assert.ok(learned.length > 40, `${learned.length} learned lines`);
  // a line with no distinctive word becomes a plain "recall the idea" card instead of a weak gap
  assert.ok(all.filter((x) => !x.cloze).length <= all.length * .05, "almost every card hides a word");
  for (const x of all.filter((x) => x.cloze)) {
    assert.equal(x.cloze.parts.map((p) => p.t).join(""), x.text, "the sentence is unchanged around the gap");
    const gap = x.cloze.parts.find((p) => p.gap).t;
    assert.ok(gap.length >= 5, gap);
    assert.ok(!x.context.toLowerCase().includes(gap.toLowerCase()), `the title gives away "${gap}": ${x.context}`);
  }
  const q = quotes.find((x) => /activation/i.test(x.node.title));
  assert.equal(q.context, "Designing Onboarding That Sticks · Find the activation moment");
  assert.equal(q.text, q.node.link.quote);
});

await test("remembering stretches the gap (1, 3, 7, 16, 35, 90 days); forgetting brings it back tomorrow", () => {
  let st = null; const gaps = [];
  for (let i = 0; i < 7; i++) { st = Recall.grade(st, true, { now: NOW }); gaps.push(st[1] - today); }
  assert.deepEqual(gaps, [1, 3, 7, 16, 35, 90, 90]);
  assert.equal(st[2], 7, "reps counted");
  const lost = Recall.grade(st, false, { now: NOW });
  assert.deepEqual([lost[0], lost[1] - today, lost[3]], [0, 1, st[3]], "back to the start, first-seen day kept");
});

await test("today's session: due cards first, five new a day, nothing added today until tomorrow", () => {
  const fresh = Recall.items([...DEMO.neurons, ...article(NOW)], { now: NOW });
  assert.ok(fresh.filter((x) => x.kind === "quote").every((x) => !x.ready), "an article added today waits for tomorrow");
  let all = Recall.items(brain, { now: NOW });
  let q = Recall.queue(all, { now: NOW });
  assert.equal(q.length, 5);
  assert.ok(q.slice(0, 4).every((x) => x.kind === "quote"), "new reading comes before old lines");
  // answer all five: no more new ones today, and none due
  const byId = new Map(brain.map((n) => [n.id, { ...n, review: { ...(n.review || {}) } }]));
  q.forEach((x) => { const n = byId.get(x.node.id); n.review[x.key] = Recall.grade(n.review[x.key], true, { now: NOW }); });
  all = Recall.items([...byId.values()], { now: NOW });
  assert.equal(Recall.queue(all, { now: NOW }).length, 0);
  assert.equal(Recall.queue(all, { now: NOW, practise: true }).length, 5, "practise still works");
  const c = Recall.counts(all, { now: NOW });
  assert.deepEqual([c.waiting, c.next - today], [0, 1]);
  // tomorrow: the five answered are due, plus five new ones
  const tomorrow = Recall.queue(Recall.items([...byId.values()], { now: NOW + DAY }), { now: NOW + DAY });
  assert.equal(tomorrow.length, 10);
  assert.ok(tomorrow.slice(0, 5).every((x) => x.due));
});

await test("stored review state is validated, wherever it comes from", () => {
  assert.deepEqual(Recall.cleanReview({ abc: [1, 20760, 3, 20750], "bad key!": [1, 2], x: "no", y: [99, 1], z: [0, -5] }), { abc: [1, 20760, 3, 20750] });
  assert.deepEqual(Recall.cleanReview([1, 2]), {});
  assert.deepEqual(Recall.cleanReview(null), {});
});

await test("the server keeps the person's note and recall progress, and only those change in a patch", () => {
  const raw = { id: "src-x-1", title: "An idea", type: "research", note: "  Try this on the onboarding flow.  ", review: { k1: [2, 20760, 3, 20750], evil: "<script>" } };
  const { row } = cleanNode(raw);
  assert.equal(row.metadata.note, "Try this on the onboarding flow.");
  assert.deepEqual(row.metadata.review, { k1: [2, 20760, 3, 20750] });
  const back = toClientNode({ ...row, node_key: row.node_key });
  assert.deepEqual([back.note, back.review], [row.metadata.note, row.metadata.review]);
  assert.ok(!("note" in cleanNode({ id: "a", title: "A" }).row.metadata), "no empty note stored");
  assert.ok(cleanNode({ id: "a", title: "A", note: "x".repeat(5000) }).row.metadata.note.length === 2000);
  const p = cleanPatches({ nodes: [{ id: "src-x-1", note: "" }, { id: "b", review: { k: [0, 1, 1, 1] }, title: "ignored" }, { id: "", note: "x" }] });
  assert.deepEqual(p, [{ key: "src-x-1", set: { note: null } }, { key: "b", set: { review: { k: [0, 1, 1, 1] } } }]);
  assert.throws(() => cleanPatches({ nodes: [] }));
  assert.throws(() => cleanPatches({ nodes: Array.from({ length: 51 }, (_, i) => ({ id: "n" + i, note: "x" })) }), (e) => e.status === 413);
});

await test("a patch merges only the person's fields into the stored node, in their own brain", async () => {
  // a stand-in for the supabase-js query builder: enough to see what's read and written
  const rows = [{ id: "r1", brain_id: "b1", node_key: "idea-1", metadata: { type: "research", link: { kind: "idea" }, note: "old", review: { a: [0, 1, 1, 1] } } },
    { id: "r2", brain_id: "b1", node_key: "idea-2", metadata: { type: "skill" } }, { id: "r3", brain_id: "b2", node_key: "idea-1", metadata: { note: "someone else's" } }];
  const writes = [];
  const sb = { from: () => {
    const f = {}; const q = { filters: [] };
    q.select = () => q; q.eq = (k, v) => { q.filters.push((r) => r[k] === v); return q; }; q.in = (k, vs) => { q.filters.push((r) => vs.includes(r[k])); return q; };
    q.then = (ok) => ok({ data: rows.filter((r) => q.filters.every((t) => t(r))), error: null });
    q.update = (v) => { const u = { filters: [] }; u.eq = (k, x) => { u.filters.push((r) => r[k] === x); return u; };
      u.throwOnError = async () => { rows.filter((r) => u.filters.every((t) => t(r))).forEach((r) => { writes.push(r.id); Object.assign(r, v); }); }; return u; };
    return Object.assign(f, q);
  } };
  const n = await patchNodes(sb, "b1", cleanPatches({ nodes: [{ id: "idea-1", note: "", review: { b: [1, 5, 2, 3] } }, { id: "idea-2", note: "new note" }, { id: "missing", note: "x" }] }));
  assert.equal(n, 2);
  assert.deepEqual(writes.sort(), ["r1", "r2"], "only this brain's rows");
  assert.deepEqual(rows[0].metadata, { type: "research", link: { kind: "idea" }, review: { b: [1, 5, 2, 3] } }, "note removed, review replaced, the rest untouched");
  assert.deepEqual(rows[1].metadata, { type: "skill", note: "new note" });
  assert.equal(rows[2].metadata.note, "someone else's");
});

await test("a changed note or recall state counts as a change to sync", () => {
  const base = [{ id: "a", title: "A", connections: [] }];
  assert.equal(Cloud.changedNeurons(base, [{ id: "a", title: "A", connections: [] }]).length, 0);
  assert.equal(Cloud.changedNeurons(base, [{ id: "a", title: "A", note: "mine", connections: [] }]).length, 1);
  assert.equal(Cloud.changedNeurons(base, [{ id: "a", title: "A", review: { k: [0, 1, 1, 1] }, connections: [] }]).length, 1);
});

await test("the patch endpoint needs the same-site header", async () => {
  const call = (headers) => new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: b ? JSON.parse(b) : null }); } };
    brainHandler({ method: "PATCH", headers: { host: "localhost", ...headers }, body: { nodes: [{ id: "a", note: "x" }] }, socket: { remoteAddress: "t" } }, res);
  });
  assert.equal((await call({})).status, 403);
  // without Supabase configured: 503; with it but no session: 401. Never a crash, never a write.
  assert.ok([401, 503].includes((await call({ "x-brain-request": "1" })).status));
});

console.log(failures ? `\n${failures} recall test(s) failed.` : "\nRecall tests passed.");
process.exit(failures ? 1 : 0);
