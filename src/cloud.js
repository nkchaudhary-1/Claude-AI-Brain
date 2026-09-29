/* The browser's side of the backend: fetch wrappers for /api and the adapter between the
   Brain data model ({ nodes, connections, clusters, metadata }) and what the renderer takes
   ({ neurons } with connection keys). The renderer never sees a database row or a request.
   Sessions live in httpOnly cookies, so there is no token here to leak.
   One top-level name, because the build concatenates files. */
export const Cloud = (() => {
  class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  const FALLBACK = "Your Brain is temporarily unavailable. Your existing knowledge is safe.";

  async function call(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await fetch(path, { method, credentials: "same-origin", headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(method !== "GET" ? { "x-brain-request": "1" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) { throw new ApiError(0, "offline", "We couldn’t reach your Brain. Check your connection and try again."); }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new ApiError(res.status, (data && data.error && data.error.code) || "unavailable", (data && data.error && data.error.message) || FALLBACK);
    return data;
  }

  /** Brain data model → renderer input. Connections become per-neuron key lists, both directions. */
  function toVisual(payload) {
    const adj = new Map();
    (payload.connections || []).forEach(({ source, target }) => {
      if (!adj.has(source)) adj.set(source, new Set()); if (!adj.has(target)) adj.set(target, new Set());
      adj.get(source).add(target); adj.get(target).add(source);
    });
    return { neurons: (payload.nodes || []).map((n) => ({ ...n, connections: [...(adj.get(n.id) || [])] })) };
  }

  // Only what changed goes up: a stable signature per neuron decides.
  const sig = (n) => JSON.stringify([n.title, n.domains, n.type, n.status, n.visibility, n.weight, n.description, n.learned, n.created, n.insights, n.skills,
    (n.conversations || []).map((c) => [c.id, c.title, c.date, c.summary]), [...(n.connections || [])].sort()]);
  function changedNeurons(base, next) {
    const adj = new Map();const link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
    next.forEach((n) => (n.connections || []).forEach((k) => { link(n.id, k); link(k, n.id); }));
    const full = next.map((n) => ({ ...n, connections: [...(adj.get(n.id) || [])] }));
    const before = new Map(base.map((n) => [n.id, sig(n)]));
    return full.filter((n) => before.get(n.id) !== sig(n));
  }

  /** Sends changed neurons in batches under one sync record. onProgress(done, total). */
  async function sync(provider, neurons, onProgress = () => {}) {
    const { syncId } = await call("/api/brain/import", { method: "POST", body: { op: "start", provider } });
    const total = { created: 0, updated: 0, connectionsCreated: 0 };
    try {
      for (let i = 0; i < neurons.length; i += 250) {
        const r = await call("/api/brain/import", { method: "POST", body: { op: "batch", syncId, nodes: neurons.slice(i, i + 250) } });
        total.created += r.created; total.updated += r.updated; total.connectionsCreated += r.connectionsCreated;
        onProgress(Math.min(neurons.length, i + 250), neurons.length);
      }
      await call("/api/brain/import", { method: "POST", body: { op: "finish", syncId, ok: true } });
    } catch (e) {
      call("/api/brain/import", { method: "POST", body: { op: "finish", syncId, ok: false } }).catch(() => {});
      throw e;
    }
    return total;
  }

  const ago = (iso) => {
    if (!iso) return "never";
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  return {
    ApiError, toVisual, changedNeurons, sync, ago,
    config: () => call("/api/config"),
    session: () => call("/api/session"),
    brain: () => call("/api/brain"),
    rename: (name) => call("/api/brain", { method: "PATCH", body: { name } }),
    deleteBrain: () => call("/api/brain", { method: "DELETE" }),
    deleteData: () => call("/api/brain/data", { method: "DELETE" }),
    sources: () => call("/api/sources"),
    source: (provider, action) => call("/api/sources", { method: "POST", body: { provider, action } }),
    emailLink: (email) => call("/api/auth/email", { method: "POST", body: { email } }),
    signOut: () => call("/api/auth/signout", { method: "POST", body: {} }),
    signInUrl: (provider) => `/api/auth/signin?provider=${encodeURIComponent(provider)}`,
  };
})();
