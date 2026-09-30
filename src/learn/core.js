/* Learn: turn a web page (or pasted text) into knowledge nodes, with no AI and no paid service.
   Page → readable blocks → sentences → the article's own distinctive vocabulary → key ideas
   (each one an exact sentence from the page) → a source node + idea nodes linked into the brain.
   Pure JS, shared by the page, /api/learn and the tests. One top-level name (the build concatenates). */
export const Learn = (() => {
  const STOP = new Set(("a about above after again against all almost also although always am among an and another any anyone anything are aren around as at away " +
    "back be became because become becomes been before being below best better between both but by can cannot could couldn did didn do does doesn doing done don down during " +
    "each easy either else enough even ever every everyone everything example few first for found from further get gets getting give given go goes going gone good got great " +
    "had hadn has hasn have haven having he her here hers herself him himself his how however i if in into is isn it its itself just keep know known last least less let lets like " +
    "likely made make makes making many may maybe me might mine more most much must my myself need needs never new next no nor not nothing now of off often oh ok on once one only " +
    "onto or other others our ours ourselves out over own part per perhaps put quite rather re really right said same say says see seem seems several shall she should shouldn " +
    "show since so some someone something sometimes still such sure take takes than that the their theirs them themselves then there these they thing things think this those " +
    "though through thus to too took toward towards try under until up upon us use used uses using very via want wants was wasn way ways we well went were weren what whatever " +
    "when where whether which while who whom whose why will with within without won work works would wouldn yet you your yours yourself yourselves able across actually add " +
    "already anyway bit came come comes day days etc especially everything find going got here's however isn't it's lot lots mean means one's point real set start started " +
    "still stuff time times today use year years called look looks looking read post article blog page click share subscribe newsletter via also").split(" "));
  const SHORT = new Set(["ai", "ux", "ui", "ml", "db", "js", "ts", "pm", "qa", "os", "ar", "vr", "3d", "hr", "go", "r"]);
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
    copy: "©", reg: "®", trade: "™", middot: "·", bull: "•", laquo: "«", raquo: "»", times: "×", eacute: "é", egrave: "è", aacute: "á", uuml: "ü", ouml: "ö", auml: "ä", ccedil: "ç", ntilde: "ñ" };
  const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1); try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; } catch { return ""; } }
    return ENT[e.toLowerCase()] ?? m;
  });
  const squash = (s) => s.replace(/\s+/g, " ").trim();
  const strip = (html) => squash(decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")));
  const JUNK = /(cookie|subscribe|sign up|signup|newsletter|all rights reserved|privacy policy|terms of (use|service)|share (this|on)|follow us|advertis|log ?in|related (posts|articles)|read more|comments?\b|©|\bskip to\b|accept all)/i;
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

  /* ---------- 1. Page → readable blocks ---------- */
  function attr(tag, name) {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    return m ? squash(decode(m[2] ?? m[3] ?? m[4] ?? "")) : "";
  }
  function metas(html) {
    const out = {};
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
      const k = (attr(m[0], "property") || attr(m[0], "name") || attr(m[0], "itemprop")).toLowerCase(), v = attr(m[0], "content");
      if (k && v && !(k in out)) out[k] = v;
    }
    return out;
  }
  // The part of the page that holds the writing: the <article> (or <main>) with the most paragraphs, else <body>.
  function region(html) {
    const pick = (tag) => {
      const a = html.search(new RegExp(`<${tag}\\b`, "i")), b = html.toLowerCase().lastIndexOf(`</${tag}>`);
      return a >= 0 && b > a ? html.slice(a, b) : null;
    };
    const count = (s) => (s ? (s.match(/<p\b/gi) || []).length : 0);
    const art = pick("article"), main = pick("main");
    if (art && count(art) >= 3) return art;
    if (main && count(main) >= 3) return main;
    const body = pick("body");
    return body || html;
  }
  function extractHtml(html, url = "") {
    html = String(html || "").slice(0, 3_000_000);
    const head = html.slice(0, Math.max(0, html.search(/<body\b/i)) || 20000);
    const m = metas(head || html);
    const titleTag = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    let host = ""; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    const clean = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|template|iframe|canvas|select|button|form|nav|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, " ");
    const body = region(clean).replace(/<(header)\b[\s\S]*?<\/\1\s*>/gi, " ");
    const blocks = [], seen = new Set();
    let chars = 0;
    for (const b of body.matchAll(/<(h[1-4]|p|li|blockquote|dd|figcaption)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
      const tag = b[1].toLowerCase(), inner = b[2];
      if (tag === "figcaption") continue;
      const text = strip(inner);
      if (!text || seen.has(text)) continue;
      if (tag[0] === "h") {
        if (text.length < 3 || text.length > 140 || JUNK.test(text)) continue;
        blocks.push({ h: +tag[1], text }); seen.add(text); continue;
      }
      const links = [...inner.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].reduce((n, a) => n + strip(a[1]).length, 0);
      if (text.length < (tag === "li" ? 30 : 45) || links / text.length > 0.5) continue;
      if (text.length < 200 && JUNK.test(text)) continue;
      blocks.push({ text }); seen.add(text); chars += text.length;
      if (blocks.length >= 600 || chars > 120_000) break;
    }
    const title = squash(m["og:title"] || m["twitter:title"] || strip(titleTag || "") || (blocks.find((b) => b.h) || {}).text || host || "Untitled page");
    return {
      page: {
        url, title: clip(title, 200), site: m["og:site_name"] || host, lang: (html.match(/<html\b[^>]*\blang\s*=\s*["']?([a-z-]+)/i) || [])[1] || "",
        description: clip(m["og:description"] || m.description || m["twitter:description"] || "", 400),
        published: (m["article:published_time"] || m.datepublished || m.date || "").slice(0, 10) || null,
      },
      blocks,
    };
  }
  // Pasted text: blank lines separate paragraphs; markdown headings or short title-like lines are headings.
  function fromText(text, url = "") {
    const paras = String(text || "").replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const blocks = [];
    for (const p of paras) {
      const md = p.match(/^(#{1,4})\s+(.+)$/);
      if (md && !p.includes("\n")) { blocks.push({ h: md[1].length, text: squash(md[2]) }); continue; }
      const one = squash(p);
      if (!p.includes("\n") && one.length <= 90 && !/[.!?:;,]$/.test(one) && one.split(" ").length <= 12) { blocks.push({ h: 2, text: one }); continue; }
      blocks.push({ text: one });
    }
    let host = ""; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    const first = blocks[0];
    const title = first && first.h ? first.text : clip((first ? first.text : "Pasted text").split(/(?<=[.!?])\s/)[0], 120);
    if (first && first.h) blocks.shift();
    return { page: { url, title, site: host || "Pasted text", lang: "", description: "", published: null }, blocks };
  }

  /* ---------- 2. Blocks → sentences → vocabulary ---------- */
  const PROTECT = /\b(e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Jr|Sr|St|No|Fig|approx|U\.S|U\.K|a\.m|p\.m)\./g;
  function sentences(text) {
    const safe = text.replace(PROTECT, (m) => m.replace(/\./g, "․"));
    return safe.split(/(?<=[.!?…])["”’)\]]*\s+(?=[“"‘(\[]?[A-Z0-9])/).map((s) => s.replace(/․/g, ".").trim()).filter(Boolean);
  }
  const stem = (w) => (w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !/(ss|us|is|ics)$/.test(w) ? w.slice(0, -1) : w);
  function tokens(text, surface) {
    const out = [];
    for (const m of String(text).matchAll(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu)) {
      const raw = m[0].replace(/[’'](s|t|re|ve|ll|d)?$/i, ""), low = raw.toLowerCase();
      if (!low || /^\d+$/.test(low) || STOP.has(low) || (low.length < 3 && !SHORT.has(low))) continue;
      const s = stem(low);
      if (STOP.has(s)) continue;
      out.push(s);
      if (surface) { const f = surface.get(s) || new Map(); f.set(raw, (f.get(raw) || 0) + 1); surface.set(s, f); }
    }
    return out;
  }
  const display = (t, surface) => {
    const f = surface && surface.get(t);
    if (!f) return t;
    const best = [...f.entries()].sort((a, b) => b[1] - a[1] || (a[0] === a[0].toLowerCase() ? -1 : 1))[0][0];
    return /^[A-Z0-9]{2,}$/.test(best) ? best : best.toLowerCase();
  };

  /* ---------- 3. Key ideas: the article's most distinctive sentences, one per section ---------- */
  function digest({ page, blocks }, { maxIdeas = 5 } = {}) {
    const surface = new Map(), sections = [];
    let cur = { heading: null, sents: [] };
    sections.push(cur);
    const titleT = new Set(tokens(page.title)), descT = new Set(tokens(page.description));
    let words = 0;
    for (const b of blocks) {
      if (b.h) {
        if (b.h === 1 && tokens(b.text).join(" ") === [...titleT].join(" ")) continue;
        cur = { heading: b.text, sents: [] }; sections.push(cur); continue;
      }
      for (const s of sentences(b.text)) {
        const t = tokens(s, surface); words += s.split(/\s+/).length;
        cur.sents.push({ text: s, t, i: cur.sents.length });
      }
    }
    const all = sections.flatMap((s) => s.sents);
    if (!all.length) return null;
    const headT = new Set(sections.flatMap((s) => (s.heading ? tokens(s.heading) : [])));
    const tf = new Map(), bi = new Map();
    for (const s of all) {
      s.t.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
      for (let i = 0; i < s.t.length - 1; i++) if (s.t[i] !== s.t[i + 1]) { const k = s.t[i] + " " + s.t[i + 1]; bi.set(k, (bi.get(k) || 0) + 1); }
    }
    const weight = new Map();
    for (const [t, n] of tf) weight.set(t, Math.pow(n, 0.8) * (titleT.has(t) ? 2.2 : 1) * (headT.has(t) ? 1.5 : 1) * (descT.has(t) ? 1.4 : 1));
    const kw = [...weight.entries()].sort((a, b) => b[1] - a[1]);
    const pairs = [...bi.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const keywords = [...pairs.map(([k]) => k.split(" ").map((t) => display(t, surface)).join(" ")), ...kw.slice(0, 12).map(([t]) => display(t, surface))]
      .filter((k, i, a) => a.indexOf(k) === i && !pairs.some(([p]) => i >= pairs.length && p.split(" ").includes(k))).slice(0, 10);
    const score = (s) => {
      const n = s.text.split(/\s+/).length;
      if (n < 7 || n > 48 || /[:?]$/.test(s.text) || /^[a-z,;)]/.test(s.text) || /https?:\/\//.test(s.text) || JUNK.test(s.text) || new Set(s.t).size < 3) return 0;
      let v = [...new Set(s.t)].reduce((a, t) => a + (weight.get(t) || 0), 0) / (Math.sqrt(s.t.length) + 2);
      if (s.i === 0) v *= 1.2;
      if (s.t.some((t) => titleT.has(t))) v *= 1.1;
      if ((s.text.match(/\d/g) || []).length > 8) v *= 0.7;
      return v;
    };
    all.forEach((s) => (s.score = score(s)));
    const jac = (a, b) => { const A = new Set(a.t), B = new Set(b.t); let x = 0; A.forEach((t) => B.has(t) && x++); return x / (A.size + B.size - x || 1); };
    const label = (s) => {
      const ts = [...new Set(s.t)].sort((a, b) => (weight.get(b) || 0) - (weight.get(a) || 0)).slice(0, 2);
      return ts.map((t) => { const d = display(t, surface); return /^[A-Z0-9]{2,}$/.test(d) ? d : d[0].toUpperCase() + d.slice(1); }).join(" · ");
    };
    const cleanHead = (h) => clip(h.replace(/^\s*(\d+[.)]|step \d+[:.]?|part \d+[:.]?|chapter \d+[:.]?)\s*/i, "").replace(/[:.]\s*$/, ""), 70);
    let ideas = [];
    const headed = sections.filter((s) => s.heading && s.sents.some((x) => x.score > 0));
    if (headed.length >= 2) {
      const ranked = headed.map((s) => { const top = [...s.sents].sort((a, b) => b.score - a.score); return { s, best: top[0], v: top[0].score + 0.3 * ((top[1] || {}).score || 0) }; })
        .sort((a, b) => b.v - a.v).slice(0, maxIdeas);
      ideas = ranked.sort((a, b) => sections.indexOf(a.s) - sections.indexOf(b.s)).map(({ s, best }) => ({ title: cleanHead(s.heading), quote: best.text, section: s.heading, s: best }));
    } else {
      const pool = all.filter((s) => s.score > 0), want = Math.min(maxIdeas, Math.max(2, Math.round(pool.length / 6)));
      const chosen = [];
      while (chosen.length < want && pool.length) {
        let best = null, bv = -1;
        for (const s of pool) { const v = s.score - 0.7 * Math.max(0, ...chosen.map((c) => jac(s, c))) * s.score; if (v > bv) { bv = v; best = s; } }
        chosen.push(best); pool.splice(pool.indexOf(best), 1);
      }
      ideas = chosen.sort((a, b) => all.indexOf(a) - all.indexOf(b)).map((s) => ({ title: label(s), quote: s.text, section: null, s }));
    }
    const used = new Map();
    ideas = ideas.map((x) => {
      const n = (used.get(x.title) || 0) + 1; used.set(x.title, n);
      const kws = [...new Set(x.s.t)].sort((a, b) => (weight.get(b) || 0) - (weight.get(a) || 0)).slice(0, 4).map((t) => display(t, surface));
      return { title: n > 1 ? `${x.title} (${n})` : x.title, quote: x.quote, section: x.section, keywords: kws };
    });
    const quoted = new Set(ideas.map((x) => x.quote)), ranked = [...all].sort((a, b) => b.score - a.score);
    const top = ranked.find((s) => !quoted.has(s.text) && s.score > 0) || ranked[0];   // don't repeat a key idea as the summary
    const summary = page.description && page.description.length >= 50 ? page.description : top.text;
    const text = [page.title, page.description, ...blocks.map((b) => b.text)].join(" ").toLowerCase();
    const count = (rx) => (text.match(rx) || []).length;
    const dom = [["ai", count(/\b(ai|llms?|gpt|claude|prompts?|agents?|neural|machine learning|embeddings?|rag|models?)\b/g)],
      ["design", count(/\b(design|designers?|ux|ui|figma|typography|layout|interfaces?|prototyp\w*|visual)\b/g)],
      ["dev", count(/\b(code|coding|api|javascript|typescript|react|database|sql|server|deploy\w*|git|python|css|html|programming|software|engineer\w*)\b/g)],
      ["product", count(/\b(product|roadmap|metrics?|growth|strategy|customers?|market\w*|pricing|launch\w*|users?)\b/g)]]
      .filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d]) => d);
    return { page, summary: clip(summary, 400), ideas, keywords, domains: dom.length ? dom : ["product"], readMinutes: Math.max(1, Math.round(words / 230)), words };
  }

  /* ---------- 4. Digest → nodes, linked into an existing brain ---------- */
  const today = (now) => new Date(now || Date.now()).toISOString().slice(0, 10);
  // Words too general to justify a link on their own.
  const GENERIC = new Set(("value feel second reason state flow design designing instruction product user people person need moment level part simple clear small large big high " +
    "low long short important different hard less number place case fact idea problem question result system change step end kind type form group show lead help create build " +
    "based whole able called allow give often around below above quickly general common key main core basic full open close true false early late previous week month minute hour " +
    "screen good bad wrong turn run move line matter approach process example option feature detail team person better best learn learning reading writer word words sentence").split(" "));
  const strong = (n) => {   // the terms a node is really about: its title, skills and keywords, and words its text repeats
    const set = new Set(tokens([n.title, ...(n.skills || []), ...((n.link && n.link.keywords) || [])].join(" ")));
    const rep = new Map(); tokens([n.description, ...(n.learned || [])].join(" ")).forEach((t) => rep.set(t, (rep.get(t) || 0) + 1));
    rep.forEach((c, t) => c >= 2 && set.add(t));
    return set;
  };
  const nodeText = (n) => [n.title, n.description, ...(n.skills || []), ...(n.learned || []), ...((n.link && n.link.keywords) || [])].join(" ");
  // Links a new node to existing ones about the same distinctive thing; the reason names it.
  function toNeurons(dg, brain = [], { now, maxLinks = 2 } = {}) {
    const key = dg.page.url ? dg.page.url.replace(/#.*$/, "").replace(/\/$/, "") : dg.page.title + "|" + dg.summary;
    const sid = "src-" + hash(key), date = today(now);
    const existing = brain.filter((n) => n && n.id && n.id !== sid && !(n.link && n.link.source === sid));
    const base = { domains: dg.domains, type: "research", status: "exploring", visibility: "private", createdAt: date, updatedAt: date,
      learned: [], created: [], insights: [], skills: [], conversations: [] };
    const source = { ...base, id: sid, title: dg.page.title, weight: 3, description: dg.summary, connections: [], linkWhy: {},
      link: { kind: "source", url: dg.page.url || null, site: dg.page.site, published: dg.page.published, readMinutes: dg.readMinutes, keywords: dg.keywords.slice(0, 8) } };
    const ideas = dg.ideas.map((x, i) => ({ ...base, id: `${sid}-${i + 1}`, title: x.title, weight: 2, description: x.quote, connections: [sid], linkWhy: { [sid]: "Key idea from this article" },
      link: { kind: "idea", url: dg.page.url || null, site: dg.page.site, quote: x.quote, section: x.section, source: sid, keywords: x.keywords } }));
    ideas.forEach((n) => { source.connections.push(n.id); source.linkWhy[n.id] = "Key idea from this article"; });
    const surface = new Map(), df = new Map(), all = [...existing, source, ...ideas];
    all.forEach((n) => new Set(tokens(nodeText(n), surface)).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
    const titles = new Map(), titleT = (n) => titles.get(n) || (titles.set(n, new Set(tokens(n.title))), titles.get(n));
    const N = all.length, rare = Math.max(2, Math.ceil(N * 0.12)), strongOf = new Map(existing.map((o) => [o, strong(o)]));
    const link = (n, terms, k) => {
      const mine = new Set(tokens(terms.join(" ")).filter((t) => !GENERIC.has(t) && t.length >= 4 && (df.get(t) || 0) <= rare)), found = [];
      if (!mine.size) return;
      for (const o of existing) {
        const shared = [...mine].filter((t) => strongOf.get(o).has(t));
        // one shared word is only enough when it's in both titles ("habit" ↔ Habit Tracker); otherwise a homonym
        // like "permission prompts" vs "prompt writing" would link, so ask for two
        if (!shared.length || (shared.length === 1 && !(titleT(n).has(shared[0]) && titleT(o).has(shared[0])))) continue;
        const v = shared.reduce((a, t) => a + Math.log(N / (df.get(t) || 1)), 0);
        if (v >= 2) found.push({ o, v, shared: shared.sort((a, b) => df.get(a) - df.get(b)) });
      }
      found.sort((a, b) => b.v - a.v).slice(0, k).forEach(({ o, shared }) => {
        if (n.connections.includes(o.id)) return;
        n.connections.push(o.id); n.linkWhy[o.id] = "Both about " + shared.slice(0, 2).map((t) => display(t, surface)).join(" and ");
      });
    };
    ideas.forEach((n) => link(n, [n.title, ...n.link.keywords], maxLinks));
    link(source, [source.title, ...dg.keywords], maxLinks + 1);
    return { neurons: [source, ...ideas], sourceId: sid, linked: [source, ...ideas].reduce((a, n) => a + n.connections.filter((c) => !c.startsWith(sid)).length, 0) };
  }
  // A link straight to the passage in the original page (URL text fragments; ignored where unsupported).
  function passageUrl(url, quote) {
    if (!url || !quote) return url || null;
    const w = quote.replace(/[“”"]/g, "").split(/\s+/), enc = (s) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C").replace(/&/g, "%26");
    const frag = w.length > 10 ? `${enc(w.slice(0, 5).join(" "))},${enc(w.slice(-4).join(" "))}` : enc(w.join(" "));
    return url.replace(/#.*$/, "") + "#:~:text=" + frag;
  }
  return { extractHtml, fromText, digest, toNeurons, passageUrl, tokens, sentences, hash };
})();
