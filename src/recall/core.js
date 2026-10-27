/* Recall: bring saved knowledge back so it sticks, with no AI. Every card is a sentence the person
   saved (an article's quoted key idea, or a line they learned) with one distinctive word hidden.
   Remember it and the next recall waits longer (1, 3, 7, 16, 35, 90 days); forget it and it's back tomorrow.
   State lives on the node: review = { [itemKey]: [step, dueDay, reps, firstDay] }, days counted locally.
   Pure JS, shared by the page and the tests. One top-level name (the build concatenates). */
export const Recall = (() => {
  const STEPS = [1, 3, 7, 16, 35, 90];
  const NEW_PER_DAY = 5, SESSION = 10, MAX_ITEMS = 60;
  const STOP = new Set(("about above after again against almost along already also although always among another anyone anything around because become before being " +
    "below between both cannot could doesn during each either else enough every everyone everything first from further given going having here hers herself himself " +
    "however into itself just least less many maybe might more most much must myself never next none nothing often only other others otherwise ourselves over perhaps " +
    "quite rather really same several should since some someone something sometimes still such than that their theirs them themselves then there these they thing " +
    "things think this those though through thus together toward towards under until upon very what whatever when where whether which while whole whom whose will with " +
    "within without would your yours yourself every people makes making made using used uses useful better best good great small large often usually doesn't don't isn't " +
    "can't won't it's that's there's what's they're you're we're instead ideally simply always really shown known taken given seen become becomes "+
    "felt feels gets getting looks matters means needs wants starts different understand important certain simple clear clearly whenever wherever apply")
    .split(" "));
  const DAY = 864e5;
  const dayOf = (t) => { const d = new Date(t); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
  const dateOfDay = (k) => { const u = new Date(k * DAY); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()).getTime(); };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const words = (s) => [...String(s).matchAll(/[\p{L}][\p{L}\p{N}’'-]*[\p{L}\p{N}]|[\p{L}]/gu)];
  const low = (w) => w.toLowerCase().replace(/[’']s$/, "");
  const stem = (w) => { w = low(w); return w.length > 5 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; };

  /** A review state from anything (storage, the server, a file): [step, dueDay, reps, firstDay] or null. */
  function cleanState(v) {
    if (!Array.isArray(v) || v.length < 2) return null;
    const [s, d, n = 1, f = d] = v.map((x) => Math.round(+x));
    if (![s, d, n, f].every(Number.isFinite) || s < 0 || s >= STEPS.length || d < 0 || d > 1e6 || n < 0 || n > 1e5 || f < 0 || f > 1e6) return null;
    return [s, d, n, f];
  }
  function cleanReview(r) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return {};
    const out = {};
    for (const [k, v] of Object.entries(r).slice(0, MAX_ITEMS)) { const st = cleanState(v); if (/^[a-z0-9]{1,12}$/.test(k) && st) out[k] = st; }
    return out;
  }

  /** What can be recalled: an idea's quote, or the lines a node says were learned. Source nodes have nothing to recall. */
  function itemsOf(n) {
    if (!n || n.synthetic) return [];
    const L = n.link;
    if (L && L.kind === "source") return [];
    const texts = L && L.kind === "idea" ? [L.quote || n.description] : (n.learned || []);
    return texts.map((t) => String(t || "").trim()).filter((t) => words(t).length >= 6 && t.length <= 600).slice(0, MAX_ITEMS)
      .map((text) => ({ key: hash(text), text, kind: L ? "quote" : "learned" }));
  }

  // How rare each word is across everything recallable, so the hidden word is the one that carries the idea.
  function vocabulary(nodes) {
    const df = new Map();
    for (const n of nodes) for (const it of itemsOf(n)) new Set(words(it.text).map((m) => stem(m[0]))).forEach((w) => df.set(w, (df.get(w) || 0) + 1));
    return df;
  }

  /** Picks the word to hide: distinctive, not filler, and not given away by the title shown above the card. */
  function cloze(text, { keywords = [], context = "", df = null } = {}) {
    const ctx = new Set(words(context).flatMap((m) => [m[0], ...m[0].split(/[-’']/)]).map(stem));
    const keys = keywords.map((k) => stem(String(k))), ctxLow = context.toLowerCase();
    let best = null;
    for (const m of words(text)) {
      const w = m[0], s = stem(w);
      if (w.length < 5 || STOP.has(low(w)) || ctx.has(s) || ctxLow.includes(s) || /[\d’']/.test(w)) continue;
      let score = Math.min(w.length, 12) / 12;
      if (/(ed|ly|ing)$/.test(low(w))) score -= .7;   // nouns carry ideas; participles and adverbs rarely do
      if (keys.some((k) => k && (s === k || s.startsWith(k) || k.startsWith(s)))) score += 3;
      if (df) score += 2 / (df.get(s) || 1);
      if (m.index > 0 && /[A-Z]/.test(w[0]) && !/[.!?:]\s*$/.test(text.slice(0, m.index))) score += .6;
      if (!best || score > best.score) best = { score, s };
    }
    if (!best) return null;
    // hide every form of that word, so the sentence can't give it away
    const parts = []; let at = 0, answer = null;
    for (const m of words(text)) {
      if (stem(m[0]) !== best.s) continue;
      if (m.index > at) parts.push({ t: text.slice(at, m.index) });
      parts.push({ t: m[0], gap: true }); answer = answer || m[0]; at = m.index + m[0].length;
    }
    if (at < text.length) parts.push({ t: text.slice(at) });
    return { answer, parts };
  }

  /** Every recallable item in a brain, with its state. nodes: the renderer's neurons or plain brain.json nodes. */
  function items(nodes, { now = Date.now() } = {}) {
    const today = dayOf(now), byId = new Map(nodes.map((n) => [n.id, n])), df = vocabulary(nodes), out = [];
    for (const n of nodes) {
      const rev = n.review || {};
      for (const it of itemsOf(n)) {
        const src = n.link && n.link.source ? byId.get(n.link.source) : null;
        const context = src ? `${src.title} · ${n.title}` : n.title;
        const added = n.createdAt != null ? dayOf(typeof n.createdAt === "number" ? n.createdAt : Date.parse(n.createdAt)) : null;
        const st = cleanState(rev[it.key]);
        out.push({ ...it, node: n, context, source: src, state: st, cloze: cloze(it.text, { keywords: (n.link && n.link.keywords) || n.skills || [], context, df }),
          due: st ? st[1] <= today : false, fresh: !st, ready: !st && (added == null || isNaN(added) || added < today) });
      }
    }
    return out;
  }

  /** Today's session: overdue cards first, then a few new ones. practise: anything, when nothing is due. */
  function queue(all, { now = Date.now(), practise = false, limit = SESSION } = {}) {
    const today = dayOf(now);
    const due = all.filter((x) => x.due).sort((a, b) => a.state[1] - b.state[1]);
    const newToday = all.filter((x) => x.state && x.state[3] === today).length;
    const fresh = all.filter((x) => x.ready).sort(order).slice(0, Math.max(0, NEW_PER_DAY - newToday));
    let q = [...due, ...fresh].slice(0, limit);
    if (!q.length && practise) q = all.filter((x) => !x.due).sort((a, b) => (a.state ? a.state[1] : -1) - (b.state ? b.state[1] : -1) || order(a, b)).slice(0, 5);
    return q;
  }
  // newer reading first (an article saved this week beats a line learned a year ago), then the weightier node
  const order = (a, b) => (b.node.link ? 1 : 0) - (a.node.link ? 1 : 0) || (time(b.node) - time(a.node)) || (b.node.weight || 0) - (a.node.weight || 0);
  const time = (n) => { const t = typeof n.createdAt === "number" ? n.createdAt : Date.parse(n.createdAt); return isNaN(t) ? 0 : t; };

  /** The next state after a card is answered. */
  function grade(state, remembered, { now = Date.now() } = {}) {
    const today = dayOf(now), st = cleanState(state);
    const step = remembered ? (st ? Math.min(st[0] + 1, STEPS.length - 1) : 0) : 0;
    return [step, today + (remembered ? STEPS[step] : 1), (st ? st[2] : 0) + 1, st ? st[3] : today];
  }

  /** What's waiting: due now, new ones that can start today, and when the next one comes due. */
  function counts(all, { now = Date.now() } = {}) {
    const today = dayOf(now), due = all.filter((x) => x.due).length;
    const newToday = all.filter((x) => x.state && x.state[3] === today).length;
    const fresh = Math.min(all.filter((x) => x.ready).length, Math.max(0, NEW_PER_DAY - newToday));
    const later = all.map((x) => (x.state ? x.state[1] : x.fresh ? today + 1 : Infinity)).filter((d) => d > today);
    const next = later.length ? Math.min(...later) : null;
    const at = (x) => (x.state ? x.state[1] : x.fresh ? today + 1 : -1);
    const nextCount = next == null ? 0 : all.filter((x) => x.state && at(x) === next).length + (next === today + 1 ? Math.min(NEW_PER_DAY, all.filter((x) => !x.state).length) : 0);
    return { due, fresh, waiting: Math.min(SESSION, due + fresh), total: all.length, next, nextCount: Math.min(SESSION, nextCount) };
  }

  return { STEPS, NEW_PER_DAY, SESSION, dayOf, dateOfDay, hash, itemsOf, cloze, items, queue, grade, counts, cleanState, cleanReview };
})();
