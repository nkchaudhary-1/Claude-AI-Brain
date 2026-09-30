// Learn-from-a-link tests: node tests/learn.mjs (no browser, no network).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Learn } from "../src/learn/core.js";
import { DEMO } from "../src/data/demo.js";
import { checkUrl, isPrivateAddress, FetchError } from "../api/_lib/fetchpage.js";
import handler from "../api/learn.js";

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.log(`✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`); }
}
const html = readFileSync(new URL("./fixtures/article.html", import.meta.url), "utf8");
const pageText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const x = Learn.extractHtml(html, "https://fieldnotes.example/onboarding");
const dg = Learn.digest(x);

await test("reads the article, not the page furniture", () => {
  assert.deepEqual([x.page.title, x.page.site, x.page.published], ["Designing Onboarding That Sticks", "Field Notes", "2026-08-14"]);
  assert.match(x.page.description, /teach a single habit/);
  const text = x.blocks.map((b) => b.text).join(" | ");
  for (const junk of [/cookies/i, /All rights reserved/, /About us/, /Download the checklist/, /Related posts/, /window\.tracking/]) assert.doesNotMatch(text, junk);
  assert.ok(x.blocks.filter((b) => b.h === 2).length >= 4);
});

await test("key ideas are real sentences from the page, titled by their sections", () => {
  assert.ok(dg.ideas.length >= 3 && dg.ideas.length <= 5, `${dg.ideas.length} ideas`);
  for (const i of dg.ideas) assert.ok(pageText.includes(i.quote), `quote not in the page: ${i.quote}`);
  assert.deepEqual(dg.ideas.map((i) => i.title).slice(0, 2), ["Find the activation moment", "Teach one habit, not ten features"]);
  assert.ok(dg.keywords.includes("onboarding"));
  assert.equal(dg.summary, x.page.description);
});

await test("new nodes link to the brain only through distinctive shared words, and say why", () => {
  const r = Learn.toNeurons(dg, DEMO.neurons, { now: Date.parse("2026-09-30") });
  const [src, ...ideas] = r.neurons;
  assert.equal(src.link.kind, "source"); assert.equal(src.link.url, "https://fieldnotes.example/onboarding");
  assert.ok(ideas.every((n) => n.connections[0] === src.id && n.link.source === src.id && n.link.quote === n.description && n.visibility === "private"));
  const habit = ideas.find((n) => /habit/i.test(n.title));
  assert.equal(habit.linkWhy["habit-app"], "Both about habit");
  const perm = ideas.find((n) => /permission/i.test(n.title));
  assert.ok(!perm.connections.includes("prompting"), "a homonym (permission prompts vs prompt writing) must not link");
  // the same link again replaces the same ids
  assert.deepEqual(Learn.toNeurons(dg, [...DEMO.neurons, ...r.neurons]).neurons.map((n) => n.id), r.neurons.map((n) => n.id));
});

await test("pasted text works the same way, with headings or without", () => {
  const t = Learn.fromText("# Retrieval for beginners\n\nRetrieval-augmented generation fetches relevant documents and adds them to the prompt so the model can answer from them. Good chunking matters more than the model you pick.\n\nEmbeddings turn each chunk into a vector, and semantic search finds the closest chunks for a question. Hybrid search adds keyword matching for names and codes.");
  assert.equal(t.page.title, "Retrieval for beginners");
  const r = Learn.toNeurons(Learn.digest(t), DEMO.neurons);
  assert.ok(r.neurons.some((n) => n.connections.includes("rag")) && r.neurons.some((n) => n.connections.includes("embeddings")));
  assert.equal(Learn.digest(Learn.fromText("Too short.")).ideas.length, 0);
});

await test("jump-to-passage links use text fragments, safely encoded", () => {
  const u = Learn.passageUrl("https://a.example/post#top", "Measure how long new users take to reach that moment, because shortening that time is the single most reliable lever for activation.");
  assert.equal(u, "https://a.example/post#:~:text=Measure%20how%20long%20new%20users,reliable%20lever%20for%20activation.");
  assert.match(Learn.passageUrl("https://a.example/", "Well-known, trusted sources win."), /Well%2Dknown%2C%20trusted/);
});

await test("the reader refuses anything that isn't a public web page", () => {
  for (const [u, code] of [["http://127.0.0.1/", "blocked_url"], ["http://2130706433/", "blocked_url"], ["http://[::1]/", "blocked_url"], ["http://169.254.169.254/latest/meta-data", "blocked_url"],
    ["http://10.0.0.5/", "blocked_url"], ["http://intranet/", "blocked_url"], ["http://printer.local/", "blocked_url"], ["https://user:pw@example.com/", "blocked_url"],
    ["https://example.com:8443/", "blocked_url"], ["ftp://example.com/", "invalid_url"], ["javascript:alert(1)", "invalid_url"], ["not a url", "invalid_url"]]) {
    assert.throws(() => checkUrl(u), (e) => e instanceof FetchError && e.code === code, u);
  }
  assert.equal(checkUrl("https://example.com/a?b=1").hostname, "example.com");
  for (const ip of ["10.1.2.3", "172.20.0.1", "192.168.1.1", "100.64.0.1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "0.0.0.0"]) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ["93.184.216.34", "2606:4700::1111"]) assert.ok(!isPrivateAddress(ip), ip);
});

await test("the endpoint needs the same-site header and a URL, and never reaches internal addresses", async () => {
  const call = (body, headers = { "x-brain-request": "1" }) => new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: b ? JSON.parse(b) : null }); } };
    handler({ method: "POST", headers: { host: "localhost", ...headers }, body, socket: { remoteAddress: "t" + Math.random() } }, res);
  });
  assert.equal((await call({ url: "https://example.com/" }, {})).status, 403);
  assert.equal((await call({})).body.error.code, "invalid_url");
  const r = await call({ url: "http://169.254.169.254/latest/meta-data" });
  assert.deepEqual([r.status, r.body.error.code], [400, "blocked_url"]);
  assert.match(r.body.error.message, /public web pages/);
});

console.log(failures ? `\n${failures} learn test(s) failed.` : "\nLearn tests passed.");
process.exit(failures ? 1 : 0);
