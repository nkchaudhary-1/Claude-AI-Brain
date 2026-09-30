// The Brain data model: the only place that knows both the database rows and the shape the
// visualization consumes. Everything the client sends is re-validated here; nothing is trusted.
//
//   knowledge_nodes row ←→ node { id (stable key), title, domains, type, status, visibility, weight,
//                                 createdAt, updatedAt, description, learned, created, insights,
//                                 skills, conversations, source }
//   connections row     ←→ { source, target, strength, type }   (node keys, not row ids)

export const TYPES = ["foundation", "skill", "project", "experiment", "research", "idea"];
export const DOMAINS = ["design", "ai", "product", "dev", "career"];
export const REGIONS = ["design", "ai", "product", "dev", "research", "ideas"];
export const STATUSES = ["learned", "exploring", "built", "experimenting", "archived", "in-progress", "paused", "idea"];
export const PROVIDERS = ["claude", "chatgpt", "import"];
export const LIMITS = { nodesPerBatch: 300, listItems: 50, itemChars: 500, conversations: 1000, connections: 300 };
const DAY = 864e5;

const str = (v, max) => (typeof v === "string" ? v : v == null ? "" : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
const list = (v, max = LIMITS.listItems) => (Array.isArray(v) ? v : []).map((x) => str(x, LIMITS.itemChars)).filter(Boolean).slice(0, max);
const day = (v) => { if (v == null || v === "") return null; const t = Date.parse(v); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); };
const KEY_RX = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;
export function cleanKey(v) {
  const s = str(v, 200);
  if (KEY_RX.test(s)) return s;
  const slug = s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9_.:-]+/g, "-").replace(/^[^a-z0-9]+/, "").slice(0, 96);
  return slug && KEY_RX.test(slug) ? slug : null;
}
export function regionOf(type, domains) {
  if (type === "research") return "research";
  if (type === "idea") return "ideas";
  return domains.find((d) => d !== "career") || "design";
}
export const activityOf = (lastSeen, now = Date.now()) => {
  const t = lastSeen ? Date.parse(lastSeen) : NaN;
  const age = isNaN(t) ? 400 : (now - t) / DAY;
  return Math.max(0.15, Math.min(1, 1 - age / 75));
};

/** Validates one node from the client. Returns a row (minus brain_id) plus its connection keys, or null. */
export function cleanNode(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  const key = cleanKey(raw.id);
  const title = str(raw.title ?? raw.name, 200);
  if (!key || !title) return null;
  let domains = (Array.isArray(raw.domains) ? raw.domains : []).map((d) => str(d, 20).toLowerCase()).filter((d) => DOMAINS.includes(d));
  domains = [...new Set(domains)].slice(0, 3);
  if (!domains.length) domains = ["product"];
  const type = TYPES.includes(raw.type) ? raw.type : "skill";
  const status = STATUSES.includes(raw.status) ? raw.status : type === "idea" ? "idea" : "exploring";
  const conversations = (Array.isArray(raw.conversations) ? raw.conversations : []).slice(0, LIMITS.conversations).map((c) => (c && typeof c === "object" ? {
    ...(c.id != null ? { id: str(c.id, 64) } : {}), title: str(c.title, 200) || "Untitled conversation", date: day(c.date), summary: str(c.summary, 400), ...(c.approx ? { approx: true } : {}),
  } : null)).filter(Boolean);
  const dates = conversations.map((c) => c.date).filter(Boolean).sort();
  const firstSeen = day(raw.createdAt) || dates[0] || null;
  const lastSeen = day(raw.updatedAt) || dates[dates.length - 1] || firstSeen;
  const weight = Math.max(1, Math.min(5, Math.round(Number(raw.weight) || 2)));
  return {
    row: {
      node_key: key, title, category: regionOf(type, domains), description: str(raw.description, 4000),
      importance: weight, activity: +activityOf(lastSeen, now).toFixed(3),
      metadata: {
        type, status, domains,
        // anything arriving without an explicit choice stays private
        visibility: raw.visibility === "public" ? "public" : "private",
        learned: list(raw.learned), created: list(raw.created), insights: list(raw.insights), skills: list(raw.skills, 20),
        conversations, first_seen: firstSeen, last_seen: lastSeen, source: raw.source === "import" ? "import" : "curated",
        ...cleanLink(raw.link), ...cleanWhy(raw.linkWhy, key),
      },
    },
    connections: [...new Set((Array.isArray(raw.connections) ? raw.connections : []).map(cleanKey).filter((k) => k && k !== key))].slice(0, LIMITS.connections),
  };
}

// A node learned from the web: where it came from and the exact quote. Only http(s) links are kept.
function cleanLink(l) {
  if (!l || typeof l !== "object" || !["source", "idea"].includes(l.kind)) return {};
  let url = null;
  try { const u = new URL(String(l.url || "")); if (/^https?:$/.test(u.protocol) && u.href.length <= 2000) url = u.href; } catch {}
  const mins = Math.round(Number(l.readMinutes));
  return { link: {
    kind: l.kind, url, site: str(l.site, 100), keywords: list(l.keywords, 10).map((k) => k.slice(0, 40)),
    ...(l.kind === "source" ? { published: day(l.published), readMinutes: mins >= 1 && mins <= 600 ? mins : null }
      : { quote: str(l.quote, 600), section: str(l.section, 140) || null, source: cleanKey(l.source) }),
  } };
}
// Why this node links to others: { otherKey: "Both about habit" }.
function cleanWhy(w, key) {
  if (!w || typeof w !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(w).slice(0, LIMITS.connections)) { const ck = cleanKey(k); if (ck && ck !== key && typeof v === "string" && v.trim()) out[ck] = str(v, 120); }
  return Object.keys(out).length ? { why: out } : {};
}

export function toClientNode(row) {
  const m = row.metadata || {};
  return {
    id: row.node_key, title: row.title, domains: m.domains || [], type: m.type || "skill", status: m.status || "exploring",
    visibility: m.visibility === "public" ? "public" : "private", weight: row.importance, createdAt: m.first_seen || null, updatedAt: m.last_seen || null,
    description: row.description || "", learned: m.learned || [], created: m.created || [], insights: m.insights || [], skills: m.skills || [],
    conversations: m.conversations || [], ...(m.source === "import" ? { source: "import" } : {}),
    ...(m.link ? { link: m.link } : {}), ...(m.why ? { linkWhy: m.why } : {}),
  };
}

/** Database rows → what the visualization consumes. The renderer never sees a row or a query. */
export function brainPayload({ brain, profile, nodes, connections, sources, history }) {
  const byId = new Map(nodes.map((r) => [r.id, r.node_key]));
  const clientNodes = nodes.map(toClientNode);
  const edges = connections.map((c) => ({ source: byId.get(c.source_node_id), target: byId.get(c.target_node_id), strength: c.strength, type: c.relationship_type })).filter((e) => e.source && e.target);
  const clusters = REGIONS.map((r) => {
    const members = nodes.filter((n) => n.category === r);
    return { id: r, nodes: members.length, activity: members.length ? +(members.reduce((s, n) => s + n.activity, 0) / members.length).toFixed(3) : 0 };
  }).filter((c) => c.nodes);
  const last = nodes.reduce((a, n) => ((n.metadata && n.metadata.last_seen) > a ? n.metadata.last_seen : a), "");
  return {
    brain: { id: brain.id, name: brain.name, createdAt: brain.created_at },
    profile: profile ? { name: profile.display_name, email: profile.email, avatar: profile.avatar_url } : null,
    nodes: clientNodes, connections: edges, clusters,
    metadata: { nodes: nodes.length, connections: edges.length, lastActivity: last || null },
    sources: sources || [], history: history || [],
  };
}
