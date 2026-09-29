// The Claude pass: reads each conversation, then groups the whole history into knowledge.
//   1. digest     batches of conversations → one-line summary, topics, kind, learned, created
//                 (cached per conversation, so re-imports only pay for new or changed chats)
//   2. synthesize all digests + the existing brain → neurons, reusing existing ids where it's
//                 the same knowledge so curated fields survive the merge
// Conversation ids are swapped for short aliases (c1, c2…) in prompts to keep output small.
import { Importer } from "../../src/importer/core.js";

export const MODEL = "claude-opus-5-5";
const PRICE = { input: 4 / 1e6, output: 20 / 1e6 };   // USD per token for MODEL
const CHUNK_CHARS = 80_000;
const CONCURRENCY = 3;
const TYPES = ["foundation", "skill", "project", "experiment", "research", "idea"];
const STATUSES = ["learned", "exploring", "built", "experimenting", "in-progress", "paused", "archived", "idea"];
const DOMAINS = ["design", "ai", "product", "dev", "career"];
const KINDS = ["learn", "build", "research", "experiment", "idea", "other"];

const strs = { type: "array", items: { type: "string" } };
const obj = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const DIGEST_SCHEMA = obj({ conversations: { type: "array", items: obj({
  id: { type: "string" }, summary: { type: "string" }, topics: strs, kind: { type: "string", enum: KINDS }, learned: strs, created: strs,
}) } });
const BRAIN_SCHEMA = obj({ neurons: { type: "array", items: obj({
  id: { type: "string" }, title: { type: "string" },
  domains: { type: "array", items: { type: "string", enum: DOMAINS } },
  type: { type: "string", enum: TYPES }, status: { type: "string", enum: STATUSES },
  weight: { type: "integer", description: "1 (minor) to 5 (central to how I work)" },
  description: { type: "string" }, learned: strs, created: strs, insights: strs, skills: strs,
  conversationIds: strs, connections: strs,
}) } });

const DIGEST_SYSTEM = `You read one person's Claude conversations and write a factual digest of each, for a personal knowledge map.
For every conversation you are given, return one entry with its id exactly as given:
- summary: one sentence on what the conversation was about and where it landed. Plain, specific, no hype.
- topics: 1–4 short canonical topic names in Title Case ("Figma", "Design Systems", "Prompt Engineering"). Use the same wording for the same topic every time.
- kind: learn (understanding something), build (making a real thing), research (comparing or gathering), experiment (trying something out), idea (unbuilt concept), other (one-off personal errands unrelated to their work).
- learned: 0–2 concrete things the person learned, only when the conversation shows it.
- created: 0–2 concrete outputs that came out of it (a component, a prompt, a page, a plan), only when the conversation shows it.
Never invent facts, metrics, names or outcomes. Empty lists are better than guesses.`;

const SYNTH_SYSTEM = `You turn digests of one person's Claude conversations into the neurons of their "AI Brain", a map of what they have explored, learned and built.
A neuron is grouped knowledge, never a single chat: fifty conversations about Figma become a Figma neuron connected to Auto Layout, Components and Design Systems neurons. Aim for roughly one neuron per 4–12 related conversations. A conversation may feed more than one neuron. Leave out one-off personal errands (kind "other") unless they recur.
Fields:
- id: if the neuron is the same knowledge as one in <existing_brain>, reuse that id exactly. Otherwise a short kebab-case id.
- title: 1–4 words, the way the person would name it.
- domains: 1–2 of design, ai, product, dev, career.
- type: foundation (broad base knowledge they keep returning to), skill (a capability built up over several chats), project (a real thing they made), experiment (tried or partly built), research (gathered or compared), idea (unbuilt concept).
- status: learned, exploring, built, experimenting, in-progress, paused, archived or idea. Judge from the dates and summaries: recent activity is exploring or in-progress; something that stopped long ago without an outcome is paused.
- weight: 1–5 by how much accumulated knowledge sits here.
- description: 1–2 sentences.
- learned, created: merged and deduplicated from the digests. insights: 0–3 non-obvious patterns across the conversations. skills: 0–4 skills involved.
- conversationIds: the aliases (c1, c2…) of every conversation that fed this neuron.
- connections: ids of other neurons (new or existing) with a real relationship: one builds on, applies, or informs the other. No decorative links.
Use only what the digests say. Never invent projects, clients, metrics or outcomes.`;

const clip = (s, n) => Importer.clip(s, n);
const esc = (s) => String(s).replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›"));

function convBlock(c, alias) {
  const asks = c.human.length > 4 ? [...c.human.slice(0, 3), c.human[c.human.length - 1]] : c.human;
  const reply = c.assistant[c.assistant.length - 1] || "";
  return `<conversation id="${alias}" date="${c.date || "unknown"}" title="${esc(c.title)}">\n` +
    asks.map((t) => `<user>${esc(clip(t, 700))}</user>`).join("\n") +
    (reply ? `\n<last_reply>${esc(clip(reply, 500))}</last_reply>` : "") + "\n</conversation>";
}
function chunks(items, size) {
  const out = [[]];
  let n = 0;
  for (const it of items) {
    if (n + it.text.length > size && out[out.length - 1].length) { out.push([]); n = 0; }
    out[out.length - 1].push(it); n += it.text.length;
  }
  return out.filter((c) => c.length);
}

export async function makeClient() {
  let Anthropic;
  try { ({ default: Anthropic } = await import("@anthropic-ai/sdk")); }
  catch { throw new Error("The Claude pass needs the Anthropic SDK. Run `npm install` first."); }
  return new Anthropic();   // ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile
}

async function ask(client, { system, user, schema, effort, maxTokens }) {
  const msg = await client.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",   // a declined request is re-run on Anthropic's recommended fallback
    thinking: { type: "adaptive" },
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  }).finalMessage();
  if (msg.stop_reason === "refusal") throw new Error(`Claude declined this batch${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ""}.`);
  if (msg.stop_reason === "max_tokens") throw new Error("The response hit max_tokens. Try again with fewer conversations per run.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { data: JSON.parse(text), usage: msg.usage };
}

/** Rough token and cost estimate so the CLI can ask before spending. */
export function estimate(convs, cached) {
  const todo = convs.filter((c) => !cached(c));
  const mapIn = todo.reduce((s, c) => s + convBlock(c, "c0").length, 0) / 3.5 + Math.ceil(todo.length / 40) * 600;
  const mapOut = todo.length * 120;
  const redIn = convs.length * 70 + 2000, redOut = convs.length * 25 + Math.ceil(convs.length / 8) * 300;
  const tokens = { input: Math.round(mapIn + redIn), output: Math.round(mapOut + redOut) };
  return { todo: todo.length, tokens, usd: tokens.input * PRICE.input + tokens.output * PRICE.output * 1.5 };   // ×1.5: thinking
}

/** Step 1: per-conversation digests. `cache` is { [id]: { updated, digest } } and is updated in place. */
export async function digestAll(client, convs, cache, { onProgress = () => {} } = {}) {
  const todo = convs.filter((c) => !(cache[c.id] && cache[c.id].updated === c.updated));
  const batches = chunks(todo.map((c, i) => ({ c, alias: "c" + (i + 1), text: convBlock(c, "c" + (i + 1)) })), CHUNK_CHARS);
  const usage = { input: 0, output: 0 };
  let done = 0, next = 0;
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      const { data, usage: u } = await ask(client, {
        system: DIGEST_SYSTEM, schema: DIGEST_SCHEMA, effort: "medium", maxTokens: 32000,
        user: batch.map((b) => b.text).join("\n\n") + `\n\nDigest all ${batch.length} conversations above.`,
      });
      const byAlias = new Map(batch.map((b) => [b.alias, b.c]));
      for (const d of data.conversations || []) {
        const c = byAlias.get(d.id); if (!c) continue;
        cache[c.id] = { updated: c.updated, digest: { summary: d.summary, topics: d.topics, kind: d.kind, learned: d.learned, created: d.created } };
      }
      usage.input += u.input_tokens || 0; usage.output += u.output_tokens || 0;
      await onProgress(done += batch.length, todo.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return usage;
}

/** Step 2: group digests into neurons. Returns neurons ready for Importer.merge(). */
export async function synthesize(client, convs, cache, base) {
  const aliases = new Map(), lines = [];
  convs.forEach((c, i) => {
    const d = cache[c.id] && cache[c.id].digest; if (!d) return;
    const a = "c" + (i + 1); aliases.set(a, c); c.digestSummary = d.summary;
    lines.push(`${a} | ${c.date || "undated"} | ${esc(c.title)} | ${d.kind} | ${(d.topics || []).join(", ")} | ${esc(d.summary)}` +
      (d.learned?.length ? ` | learned: ${d.learned.map(esc).join("; ")}` : "") + (d.created?.length ? ` | created: ${d.created.map(esc).join("; ")}` : ""));
  });
  const existing = base.map((n) => `${n.id} | ${n.type} | ${n.title}`).join("\n");
  const { data, usage } = await ask(client, {
    system: SYNTH_SYSTEM, schema: BRAIN_SCHEMA, effort: "high", maxTokens: 128000,
    user: `<existing_brain>\n${existing || "(empty)"}\n</existing_brain>\n\n<digests count="${lines.length}">\nalias | date | title | kind | topics | summary\n${lines.join("\n")}\n</digests>\n\nBuild the neurons.`,
  });
  return { neurons: toBrainNeurons(data, aliases, base), usage: { input: usage.input_tokens || 0, output: usage.output_tokens || 0 } };
}

/** Validates Claude's neurons and maps aliases back to real conversations. Pure, so it's unit-tested. */
export function toBrainNeurons(data, aliases, base) {
  const baseIds = new Set(base.map((n) => n.id)), used = new Set(), idOf = new Map();
  const list = (data && Array.isArray(data.neurons) ? data.neurons : []).filter((n) => n && n.title);
  const out = [];
  for (const n of list) {
    const convs = [...new Set(n.conversationIds || [])].map((a) => aliases.get(a)).filter(Boolean);
    if (!convs.length && !baseIds.has(n.id)) continue;
    let id = baseIds.has(n.id) ? n.id : "imp-" + Importer.slug(n.id || n.title), k = 2;
    if (!baseIds.has(id)) while (used.has(id) || baseIds.has(id)) id = `imp-${Importer.slug(n.id || n.title)}-${k++}`;
    used.add(id); idOf.set(n.id, id);
    const dates = convs.map((c) => Date.parse(c.date)).filter((t) => !isNaN(t));
    out.push({
      id, title: String(n.title).trim(), domains: (n.domains || []).filter((d) => DOMAINS.includes(d)).slice(0, 2),
      type: TYPES.includes(n.type) ? n.type : "skill", status: STATUSES.includes(n.status) ? n.status : "exploring",
      visibility: "private", weight: Math.max(1, Math.min(5, Math.round(+n.weight || 2))), source: "import",
      createdAt: dates.length ? Importer.iso(Math.min(...dates)) : null, updatedAt: dates.length ? Importer.iso(Math.max(...dates)) : null,
      description: String(n.description || ""), learned: n.learned || [], created: n.created || [], insights: n.insights || [], skills: n.skills || [],
      conversations: convs.map((c) => ({ id: c.id, title: c.title, date: c.date, summary: c.digestSummary || c.summary })),
      connections: n.connections || [],
    });
  }
  out.forEach((n) => { n.connections = [...new Set(n.connections.map((c) => idOf.get(c) || (baseIds.has(c) ? c : null)).filter((c) => c && c !== n.id))]; });
  return out;
}
