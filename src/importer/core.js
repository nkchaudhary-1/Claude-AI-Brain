/* Claude history importer: Conversations → Topics → Knowledge → Neurons → Connections.
   Pure JS with no DOM or Node APIs, so the page (drop a conversations.json) and the CLI
   (scripts/import.mjs) share it. One top-level name because the build concatenates files.
   The offline pass here is honest but shallow: it groups by shared vocabulary and derives
   counts, dates and labels. What was learned, created and concluded comes from the Claude
   pass in scripts/importer/llm.mjs. */
export const Importer = (() => {
  const DAY = 864e5;
  const STOP = new Set(("a about above after again against all also am an and any are aren as at be because been before being below between both but by can cannot could did do does doing don down during each few for from further get got had has have having he her here hers him his how i if in into is isn it its itself just let lets like make me more most much my myself need no nor not now of off on once only or other our ours out over own please same she should so some such than that the their theirs them then there these they this those through to too under until up us use using very want was we were what when where which while who whom why will with would you your yours yourself " +
    "able actually add again already always another anything around ask back best better bit case change come could currently different done doesn every example fine first following give going good great help here hey hi idea ideas instead keep kind know last look looking lot made many maybe mean might much new next okay one ones part point pretty put quite really right say see seems set should show something still sure take tell thank thanks thing things think though time try trying two way well across along via etc whether work working yeah yes yet claude chat conversation message reply answer question questions").split(" "));
  const SHORT = {ai:"AI",ux:"UX",ui:"UI","3d":"3D",ar:"AR",vr:"VR",ml:"ML",js:"JS",ts:"TS",ios:"iOS",api:"API",css:"CSS",sql:"SQL",seo:"SEO",sip:"SIP",llm:"LLM",mcp:"MCP",n8n:"n8n",gpt:"GPT",pm:"PM",qa:"QA",prd:"PRD",html:"HTML",cta:"CTA",mvp:"MVP"};
  const DOMAIN_RX = {
    design:/\b(design|designs|figma|ui|ux|typography|font|fonts|colou?rs?|layout|components?|wireframes?|motion|animation|icons?|visual|brand|branding|mockups?|screens?|prototyp\w*|tokens?)\b/g,
    ai:/\b(ai|claude|llm|llms|prompts?|prompting|agents?|agentic|gpt|models?|mcp|embeddings?|automation|automate|n8n|chatbot|rag)\b/g,
    dev:/\b(code|coding|javascript|typescript|react|css|html|api|python|swift|swiftui|bug|deploy|server|database|git|github|npm|docker|backend|frontend|function|script|webgl)\b/g,
    product:/\b(product|roadmap|metrics?|prd|features?|strategy|pricing|growth|onboarding|market|users?|retention|conversion|mvp|launch)\b/g,
    career:/\b(resume|cv|portfolio|interview|job|recruiter|linkedin|salary|career|hiring|offer)\b/g
  };
  const TYPE_RX = {
    idea:/\b(idea|ideas|concept|brainstorm\w*|what if|side project|startup|could i build|someday)\b/g,
    research:/\b(research|compare|comparison|competitors?|market|benchmarks?|analy[sz]\w*|references?|trends?|landscape|alternatives)\b/g,
    project:/\b(build|building|built|implement\w*|deploy\w*|ship|launch|fix|bug|error|website|app|page|screen|feature|release)\b/g,
    experiment:/\b(experiment\w*|try|tried|test|testing|prototype|explore|exploring|poc|proof of concept|hack)\b/g,
    skill:/\b(learn|learning|explain|how do|how does|how to|what is|understand|tutorial|guide|best practices?|principles?|basics)\b/g
  };

  const iso = t => new Date(t).toISOString().slice(0, 10);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function when(a, b) {
    const A = new Date(a), B = new Date(b), m = d => MONTHS[d.getUTCMonth()], y = d => d.getUTCFullYear();
    if (b == null || (m(A) === m(B) && y(A) === y(B))) return `in ${m(A)} ${y(A)}`;
    return y(A) === y(B) ? `from ${m(A)} to ${m(B)} ${y(B)}` : `from ${m(A)} ${y(A)} to ${m(B)} ${y(B)}`;
  }
  const slug = s => String(s).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "neuron";
  const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
  const stem = w => w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w;
  const count = (rx, s) => (s.match(rx) || []).length;

  /* ---------- 1. Conversations ---------- */
  const claudeMsgs = c => Array.isArray(c.chat_messages) ? c.chat_messages : Array.isArray(c.messages) && c.messages.some(m => m && "sender" in m) ? c.messages : null;
  const kindOf = c => !c || typeof c !== "object" ? null : claudeMsgs(c) ? "claude" : c.mapping && typeof c.mapping === "object" ? "chatgpt" : null;
  // The conversation list: the file itself, its "conversations" array, or any top-level array of conversations.
  function listOf(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return null;
    if (Array.isArray(data.conversations)) return data.conversations;
    return Object.values(data).find(v => Array.isArray(v) && v.slice(0, 50).some(kindOf)) || null;
  }
  // "claude" (conversations.json from claude.ai), "chatgpt" (conversations.json from ChatGPT), or null.
  // Looks past the first few entries, since an export can start with an empty or unusual conversation.
  function exportKind(data) {
    const list = listOf(data);
    if (!list) return null;
    for (const c of list.slice(0, 50)) { const k = kindOf(c); if (k) return k; }
    return null;
  }
  // A plain-language reason a file isn't an export, naming the sibling files people most often pick by mistake.
  function describe(data) {
    const list = Array.isArray(data) ? data : null, first = list && list.find(x => x && typeof x === "object");
    const keys = Object.keys((list ? first : data) || {}).slice(0, 8);
    const has = (...k) => k.some(x => keys.includes(x));
    const wrong = f => `This looks like ${f} from your export. Choose conversations.json from the same folder.`;
    if (manifestOf(data)) return "This is the export manifest: it only lists download links. Download conversations-000.zip from it and choose that zip here.";
    if (list && !first) return "This file is an empty list. If it’s conversations.json, the export has no chats in it yet.";
    if (has("email_address", "full_name", "verified_phone_number")) return wrong("users.json");
    if (has("docs", "prompt_template", "is_starter_project")) return wrong("projects.json");
    if (keys.some(k => /memor/i.test(k))) return wrong("memories.json");
    return `This file isn’t a Claude or ChatGPT conversations.json, or a brain.json. An export folder holds several files; choose conversations.json.${keys.length ? ` (It contains: ${keys.join(", ")}.)` : ""}`;
  }
  const isClaudeExport = data => exportKind(data) !== null;
  function messageText(m) {
    if (typeof m.text === "string" && m.text.trim()) return m.text;
    return (Array.isArray(m.content) ? m.content : []).filter(b => b && b.type === "text" && b.text).map(b => b.text).join("\n");
  }
  // ChatGPT keeps each conversation as a tree of nodes; the visible thread is every user and
  // assistant message in time order. Images, tool output and system prompts are skipped.
  function chatgptMessages(c) {
    return Object.values(c.mapping || {}).map(x => x && x.message).filter(m => m && m.author && (m.author.role === "user" || m.author.role === "assistant"))
      .map(m => ({ who: m.author.role === "user" ? "human" : "assistant", t: +m.create_time || 0,
        text: Array.isArray(m.content && m.content.parts) ? m.content.parts.filter(p => typeof p === "string").join("\n") : (m.content && typeof m.content.text === "string" ? m.content.text : "") }))
      .filter(m => m.text.trim()).sort((a, b) => a.t - b.t);
  }
  /* ---------- 0. Files: zips from the export email, JSON, JSON Lines, the manifest ---------- */
  // Newer claude.ai exports arrive as a manifest JSON listing one-time download links to several zips
  // (conversations-000.zip, projects-000.zip, …). Returns the listed files, links checked to be claude.ai.
  function manifestOf(data) {
    const files = data && !Array.isArray(data) && Array.isArray(data.data_files) ? data.data_files : null;
    if (!files || !files.some(f => f && f.export_url)) return null;
    const safe = u => { try { const x = new URL(u); return x.protocol === "https:" && x.hostname === "claude.ai" && x.pathname.startsWith("/export/") ? x.href : null; } catch { return null; } };
    return files.filter(f => f && typeof f === "object").map(f => ({ category: String(f.category || ""), filename: String(f.filename || "export.zip"), url: safe(f.export_url) }));
  }
  const isZip = u8 => u8.length > 3 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 3 && u8[3] === 4;
  const ZIP_HELP = "That zip couldn’t be opened here. Unzip it yourself, then choose the conversations .json file inside.";
  // Minimal zip reader (stored + deflate) on the platform's DecompressionStream: no dependencies, same code in the browser and Node.
  function zipEntries(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error(ZIP_HELP);
    const count = dv.getUint16(eocd + 10, true), out = [];
    let p = dv.getUint32(eocd + 16, true);
    if (p === 0xffffffff || count === 0xffff) throw new Error(ZIP_HELP);
    for (let k = 0; k < count && p + 46 <= u8.length && dv.getUint32(p, true) === 0x02014b50; k++) {
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true), local = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
      if (name.endsWith("/")) continue;
      if (size === 0xffffffff || local === 0xffffffff) throw new Error(ZIP_HELP);
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      out.push({ name, method, data: u8.subarray(start, start + size) });
    }
    return out;
  }
  async function entryText(e) {
    if (e.method === 0) return new TextDecoder().decode(e.data);
    if (e.method !== 8 || typeof DecompressionStream === "undefined") throw new Error(ZIP_HELP);
    return new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  }
  // JSON, or JSON Lines (one conversation per line)
  function parseText(text) {
    try { return [JSON.parse(text)]; }
    catch (e) {
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length > 1 && lines.every(l => /^\s*[[{]/.test(l))) return lines.map(l => JSON.parse(l));
      throw e;
    }
  }
  // Everything the person chose, in one pass: conversations.json, the export zips (no need to unzip),
  // several files at once, or JSON Lines. files = [{ name, bytes: Uint8Array }].
  // → { conversations, kind } | { manifest } | { data } (a single other JSON, e.g. a brain.json)
  async function readExport(files) {
    const docs = [];
    for (const f of files) {
      if (!isZip(f.bytes)) { docs.push({ name: f.name, values: parseText(new TextDecoder().decode(f.bytes)) }); continue; }
      const entries = zipEntries(f.bytes).filter(e => /\.jsonl?$/i.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name));
      if (!entries.length) throw new Error(`${f.name} has no JSON files inside. Choose conversations-000.zip from the export email.`);
      for (const e of entries) docs.push({ name: e.name, values: parseText(await entryText(e)) });
    }
    // The same chat can appear in more than one file (a metadata copy and the full one): keep the fuller copy.
    const conversations = [], at = new Map(), size = c => (claudeMsgs(c) || Object.keys(c.mapping || {})).length;
    let kind = null;
    const take = c => {
      const k = kindOf(c), id = k && (c.uuid || c.id || c.conversation_id);
      if (!k) return;
      kind = kind || k;
      if (id && at.has(id)) { const i = at.get(id); if (size(c) > size(conversations[i])) conversations[i] = c; return; }
      if (id) at.set(id, conversations.length);
      conversations.push(c);
    };
    for (const d of docs) for (const v of d.values) kindOf(v) ? take(v) : (listOf(v) || []).forEach(take);
    if (conversations.length) return { conversations, kind };
    const values = docs.flatMap(d => d.values), manifest = values.map(manifestOf).find(Boolean);
    if (manifest) return { manifest };
    if (files.some(f => isZip(f.bytes))) throw new Error(`No conversations in ${files.length === 1 ? files[0].name : "these files"}. Your chats are in conversations-000.zip (and -001, -002… if there are more parts).`);
    if (values.length === 1) return { data: values[0] };
    throw new Error(describe(values[0]));
  }

  function parseExport(data) {
    const list = listOf(data);
    if (!list || !exportKind(data)) throw new Error(describe(data));
    const out = [];
    list.forEach((c, i) => {
      const kind = kindOf(c);
      if (!kind) return;
      let msgs, created, updated, name;
      if (kind === "claude") {
        const cm = claudeMsgs(c);
        if (!cm) return;
        msgs = cm.map(m => ({ who: m.sender === "human" ? "human" : "assistant", text: messageText(m) })).filter(m => m.text.trim());
        created = Date.parse(c.created_at || (cm[0] && cm[0].created_at) || ""); updated = Date.parse(c.updated_at || "") || created; name = c.name;
      } else {
        msgs = chatgptMessages(c);
        created = c.create_time ? c.create_time * 1000 : NaN; updated = c.update_time ? c.update_time * 1000 : created; name = c.title;
      }
      if (!msgs.length) return;
      const human = msgs.filter(m => m.who === "human").map(m => m.text);
      const assistant = msgs.filter(m => m.who === "assistant").map(m => m.text);
      const title = clip(name, 90) || clip((human[0] || "").split("\n")[0], 60) || "Untitled conversation";
      out.push({ id: String(c.uuid || c.id || c.conversation_id || `conv-${i + 1}`), title, date: isNaN(created) ? null : iso(created), updated: isNaN(updated) ? null : updated,
        summary: clip(c.summary || human[0] || "", 160), human, assistant, turns: msgs.length });
    });
    if (!out.length) throw new Error("The export has conversations, but none of them contain any messages.");
    return out;
  }

  /* ---------- 2. Topics (vocabulary vectors) ---------- */
  function terms(text, surface) {
    const toks = [];
    for (const orig of text.replace(/```[\s\S]*?```/g, " ").replace(/https?:\/\/\S+/g, " ").split(/[^\p{L}\p{N}]+/u)) {
      const raw = orig.toLowerCase();
      if (!raw || /^\d+$/.test(raw) || STOP.has(raw)) { toks.push(null); continue; }
      if (raw.length < 3 && !SHORT[raw]) { toks.push(null); continue; }
      const s = stem(raw); toks.push(s);
      const f = surface.get(s) || new Map(); f.set(orig, (f.get(orig) || 0) + 1); surface.set(s, f);
    }
    const out = toks.filter(Boolean);
    for (let i = 0; i < toks.length - 1; i++) if (toks[i] && toks[i + 1] && toks[i] !== toks[i + 1]) out.push(toks[i] + " " + toks[i + 1]);
    return out;
  }
  function vectorize(convs) {
    const surface = new Map(), df = new Map(), N = convs.length;
    const tfs = convs.map(c => {
      const tf = new Map(), add = (list, w) => list.forEach(t => tf.set(t, (tf.get(t) || 0) + w));
      add(terms(c.title, surface), 3);
      add(terms(c.human.join("\n").slice(0, 4000), surface), 1);
      tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1));
      c.tset = new Set(tf.keys());
      return tf;
    });
    // Terms unique to one conversation stay in its vector: they never match anything, but they
    // keep one incidental shared word from making two unrelated chats look identical.
    const maxDf = Math.max(3, N * .4), ids = new Map();
    convs.forEach((c, i) => {
      const v = new Map();
      tfs[i].forEach((n, t) => {
        const d = df.get(t); if (d > maxDf) return;
        let k = ids.get(t); if (k == null) ids.set(t, k = ids.size);
        v.set(k, (1 + Math.log(n)) * (Math.log((N + 1) / (d + 1)) + 1));
      });
      c.vec = vec(v);
    });
    return { surface, df, N, maxDf, dense: new Float64Array(ids.size) };
  }
  // Sparse vectors are parallel typed arrays (term ids, weights), unit length. Similarity scatters
  // one vector into a shared dense buffer and reads the other against it, which keeps thousands
  // of conversations × hundreds of topics fast enough for the main thread.
  function vec(map, keep = 0) {
    let e = [...map.entries()];
    if (keep && e.length > keep) e = e.sort((a, b) => b[1] - a[1]).slice(0, keep);
    const n = Math.sqrt(e.reduce((s, [, w]) => s + w * w, 0)) || 1;
    return { i: Int32Array.from(e, x => x[0]), w: Float64Array.from(e, x => x[1] / n) };
  }
  const scatter = (D, v, on = true) => { for (let k = 0; k < v.i.length; k++) D[v.i[k]] = on ? v.w[k] : 0; };
  const dot = (D, v) => { let s = 0; for (let k = 0; k < v.i.length; k++) s += D[v.i[k]] * v.w[k]; return s; };
  function best(D, v, groups, skip) {
    scatter(D, v); let bi = -1, bs = 0;
    groups.forEach((g, gi) => { if (gi === skip || !g.m.length) return; const s = dot(D, g.c); if (s > bs) { bs = s; bi = gi; } });
    scatter(D, v, false); return [bi, bs];
  }
  const group = members => { const sum = new Map(); members.forEach(c => add(sum, c)); return { m: members, sum, c: vec(sum, 80) }; };
  const add = (sum, c) => { for (let k = 0; k < c.vec.i.length; k++) sum.set(c.vec.i[k], (sum.get(c.vec.i[k]) || 0) + c.vec.w[k]); };

  /* ---------- 3. Knowledge (clusters) ---------- */
  function cluster(convs, vocab, { threshold = .16 } = {}) {
    const T = threshold, D = vocab.dense, sorted = [...convs].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let groups = [];
    for (const c of sorted) {                        // one pass in time order: join the closest topic or start one
      const [bi, bs] = best(D, c.vec, groups);
      if (bi >= 0 && bs >= T) { const g = groups[bi]; g.m.push(c); add(g.sum, c); g.c = vec(g.sum, 80); } else groups.push(group([c]));
    }
    for (let pass = 0; pass < 2; pass++) {           // refine: move each conversation to its best centroid
      const next = groups.map(() => []);
      groups.forEach((g, gi) => g.m.forEach(c => {
        scatter(D, c.vec); const own = dot(D, g.c); scatter(D, c.vec, false);
        const [bi, bs] = best(D, c.vec, groups, gi);
        next[bi >= 0 && bs > own + .02 ? bi : gi].push(c);
      }));
      groups = next.filter(m => m.length).map(group);
    }
    for (let merged = true; merged;) {              // merge topics that turned out to be one (union-find)
      const root = groups.map((_, i) => i), find = i => root[i] === i ? i : (root[i] = find(root[i]));
      merged = false;
      groups.forEach((g, i) => {
        scatter(D, g.c);
        for (let j = i + 1; j < groups.length; j++) if (dot(D, groups[j].c) >= T + .15) { root[find(j)] = find(i); merged = true; }
        scatter(D, g.c, false);
      });
      if (merged) { const by = new Map(); groups.forEach((g, i) => { const r = find(i); by.set(r, [...(by.get(r) || []), ...g.m]); }); groups = [...by.values()].map(group); }
    }
    for (const g of groups) if (g.m.length === 1) {  // fold loose one-offs into a close topic
      const [bi, bs] = best(D, g.m[0].vec, groups, groups.indexOf(g));
      if (bi >= 0 && bs >= T * .6) { const h = groups[bi]; h.m.push(g.m[0]); add(h.sum, g.m[0]); h.c = vec(h.sum, 80); g.m = []; }
    }
    return groups.filter(g => g.m.length);
  }

  /* ---------- 4. Neurons ---------- */
  function display(t, surface) {
    return t.split(" ").map(p => {
      if (SHORT[p]) return SHORT[p];
      const f = surface.get(p), forms = f ? [...f.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w) : [p];
      const w = forms.find(x => /\p{Lu}/u.test(x.slice(1))) || forms[0];   // keep "WebGL", "iOS" as written
      return SHORT[w.toLowerCase()] || w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ");
  }
  // A topic's label is what most of its conversations mention and the rest of the history doesn't:
  // coverage inside the cluster × rarity outside it, with a nudge towards phrases ("auto layout").
  function labelTerms(g, vocab, n) {
    const cdf = new Map(); g.m.forEach(c => c.tset.forEach(t => cdf.set(t, (cdf.get(t) || 0) + 1)));
    const min = g.m.length > 1 ? 2 : 1, idf = t => Math.log((vocab.N + 1) / (vocab.df.get(t) + 1)) + 1;
    const score = t => cdf.get(t) * idf(t) * (t.includes(" ") ? 1.15 : 1);
    const ranked = [...cdf.keys()].filter(t => cdf.get(t) >= min && vocab.df.get(t) <= vocab.maxDf).sort((a, b) => score(b) - score(a)), out = [];
    for (const t of ranked) {
      if (out.length >= n) break;
      if (out.some(o => o.split(" ").some(p => t.split(" ").includes(p)))) continue;
      out.push(t);
    }
    return out;
  }
  function classify(text, size, bigSize) {
    const s = {}; for (const k in TYPE_RX) s[k] = count(TYPE_RX[k], text);
    let type = Object.keys(s).sort((a, b) => s[b] - s[a])[0];
    if (!s[type]) type = "skill";
    if (type === "skill" && size >= bigSize) type = "foundation";
    const d = {}; for (const k in DOMAIN_RX) d[k] = count(DOMAIN_RX[k], text);
    const top = Math.max(...Object.values(d));
    const domains = top ? Object.keys(d).filter(k => d[k] >= top * .4).sort((a, b) => d[b] - d[a]).slice(0, 2) : ["product"];
    return { type, domains };
  }
  function toNeurons(groups, vocab, { now = Date.now() } = {}) {
    const surface = vocab.surface;
    const sizes = groups.map(g => g.m.length).sort((a, b) => a - b), median = sizes[sizes.length >> 1] || 1;
    const bigSize = Math.max(6, median * 3), used = new Set();
    const neurons = groups.map(g => {
      const m = [...g.m].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const dates = m.map(c => Date.parse(c.date)).filter(t => !isNaN(t));
      const first = dates.length ? Math.min(...dates) : null, last = m.reduce((x, c) => Math.max(x, c.updated || 0), 0) || (dates.length ? Math.max(...dates) : null);
      const words = labelTerms(g, vocab, 4);
      const title = m.length === 1 || !words.length ? m[0].title : words.slice(0, 2).map(t => display(t, surface)).join(" · ");
      const text = m.map(c => c.title + " " + c.human.join(" ").slice(0, 1500)).join("\n").toLowerCase();
      const { type, domains } = classify(text, m.length, bigSize);
      const recent = last && (now - last) / DAY <= 30;
      const status = type === "idea" ? "idea" : type === "project" || type === "experiment" ? (recent ? "in-progress" : "paused") : recent ? "exploring" : "learned";
      const turns = m.reduce((s, c) => s + c.turns, 0);
      const weight = Math.max(1, Math.min(5, Math.round(1 + Math.log2(m.length) * .9 + Math.log10(turns) * .4)));
      let id = "imp-" + slug(title), k = 2; while (used.has(id)) id = `imp-${slug(title)}-${k++}`; used.add(id);
      const span = first ? when(first, m.length > 1 ? last : null) : "with no recorded date";
      return { id, title, domains, type, status, visibility: "private", weight, source: "import",
        createdAt: first ? iso(first) : null, updatedAt: last ? iso(last) : null,
        description: `${m.length} conversation${m.length === 1 ? "" : "s"} ${span}.${m.length > 1 && words.length ? " Most discussed: " + words.map(t => display(t, surface)).join(", ") + "." : ""}`,
        learned: [], created: [], insights: [], skills: [],
        conversations: m.map(c => ({ id: c.id, title: c.title, date: c.date, summary: c.summary })),
        connections: [], _c: g.c };
    });
    const D = vocab.dense;
    neurons.forEach((n, i) => {                       // link each neuron to its closest topics
      scatter(D, n._c); const near = neurons.map((o, j) => [j, i === j ? 0 : dot(D, o._c)]).sort((a, b) => b[1] - a[1]); scatter(D, n._c, false);
      near.filter(([, s], k) => s >= .12 || (k === 0 && s >= .05)).slice(0, 3)
        .forEach(([j]) => { if (!n.connections.includes(neurons[j].id)) n.connections.push(neurons[j].id); });
    });
    neurons.forEach(n => delete n._c);
    return neurons;
  }

  /* ---------- 5. Merge into an existing brain ---------- */
  const tkey = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const ckey = c => c.id ? "id:" + c.id : "t:" + tkey(c.title) + "|" + (c.date || "");
  function expand(n, conv) {
    n = JSON.parse(JSON.stringify(n));
    if (!n.conversations && Array.isArray(n.conv)) n.conversations = n.conv.map(k => conv && conv[k] ? { ...conv[k] } : { title: k, date: null, summary: "" });
    delete n.conv;
    n.conversations = n.conversations || []; n.connections = n.connections || [];
    return n;
  }
  const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];
  // Seed and hand-written neurons keep every field and only gain conversations and lists.
  // Previously imported neurons refresh their generated fields; title, visibility, weight
  // and insights are treated as curated and always survive a re-import.
  function merge(base, incoming, { conv } = {}) {
    const out = base.map(n => expand(n, conv)), byId = new Map(out.map(n => [n.id, n])), byTitle = new Map(out.map(n => [tkey(n.title), n]));
    const owner = new Map(); out.forEach(n => n.conversations.forEach(c => c.id && owner.set(c.id, n)));
    const idMap = new Map(); let added = 0, updated = 0;
    for (const raw of incoming) {
      const n = expand(raw, conv);
      let m = byId.get(n.id) || byTitle.get(tkey(n.title));
      if (!m && n.conversations.length) {
        const votes = new Map(); n.conversations.forEach(c => { const o = c.id && owner.get(c.id); if (o) votes.set(o, (votes.get(o) || 0) + 1); });
        const [o, v] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] || [];
        if (o && v >= n.conversations.length * .5) m = o;
      }
      if (!m) {
        n.visibility = n.visibility === "public" ? "public" : "private";
        out.push(n); byId.set(n.id, n); byTitle.set(tkey(n.title), n); n.conversations.forEach(c => c.id && owner.set(c.id, n));
        idMap.set(raw.id, n.id); added++; continue;
      }
      idMap.set(raw.id, m.id); updated++;
      const seen = new Set(m.conversations.map(ckey));
      n.conversations.forEach(c => { if (!seen.has(ckey(c))) { seen.add(ckey(c)); m.conversations.push(c); owner.set(c.id, m); } });
      if (m.source === "import") {
        for (const f of ["type", "domains", "status", "description"]) if (n[f] != null && n[f] !== "") m[f] = n[f];
        for (const f of ["learned", "created", "skills"]) if (n[f] && n[f].length) m[f] = n[f];
      } else {
        for (const f of ["learned", "created", "skills"]) m[f] = union(m[f], n[f]);
      }
      const ds = m.conversations.map(c => Date.parse(c.date)).filter(t => !isNaN(t));
      if (ds.length && (m.createdAt || m.source === "import")) { m.createdAt = iso(Math.min(...ds)); m.updatedAt = iso(Math.max(...ds)); }
    }
    incoming.forEach(raw => {
      const m = byId.get(idMap.get(raw.id)); if (!m) return;
      (raw.connections || []).forEach(cid => { const t = idMap.get(cid) || (byId.has(cid) ? cid : null); if (t && t !== m.id && !m.connections.includes(t)) m.connections.push(t); });
    });
    return { neurons: out, stats: { added, updated } };
  }

  /* ---------- Offline pipeline, end to end ---------- */
  function fromExport(data, { base = [], conv, threshold, now } = {}) {
    const convs = parseExport(data);
    const vocab = vectorize(convs);
    const groups = cluster(convs, vocab, { threshold });
    const neurons = toNeurons(groups, vocab, { now });
    const { neurons: merged, stats } = merge(base, neurons, { conv });
    return { brain: { version: 2, generatedAt: iso(now || Date.now()), source: { kind: `${exportKind(data)}-export`, mode: "offline", conversations: convs.length }, neurons: merged },
      stats: { conversations: convs.length, topics: neurons.length, ...stats } };
  }

  return { isClaudeExport, exportKind, describe, manifestOf, readExport, parseExport, vectorize, cluster, toNeurons, merge, expand, fromExport, clip, slug, iso };
})();
