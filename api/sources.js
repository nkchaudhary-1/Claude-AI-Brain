// Connected AI.
//   GET   every provider with its honest capabilities and this brain's status
//   POST  { provider, action: "connect" | "disconnect" | "sync" }
import { send } from "./_lib/http.js";
import { route, bad } from "./_lib/route.js";
import { ensureBrain } from "./_lib/store.js";
import { PROVIDERS, NotAvailable, describe } from "./_lib/providers.js";

export default route(["GET", "POST"], async ({ req, res, sb, user }) => {
  const { brain } = await ensureBrain(sb, user);
  const { data: rows } = await sb.from("ai_sources").select("provider,status,last_synced_at,next_sync_at").eq("brain_id", brain.id).throwOnError();
  const rowOf = (id) => rows.find((r) => r.provider === id) || null;
  if (req.method === "GET") return send(res, 200, { sources: Object.values(PROVIDERS).map((p) => describe(p, rowOf(p.id))) });

  const { provider: id, action } = req.body || {};
  const provider = PROVIDERS[id];
  if (!provider || !["connect", "disconnect", "sync"].includes(action)) throw bad("unknown provider or action");
  const ctx = {
    sourceRow: rowOf,
    resetSource: (pid) => sb.from("ai_sources").update({ status: "not_connected", last_synced_at: null, next_sync_at: null }).eq("brain_id", brain.id).eq("provider", pid).throwOnError(),
  };
  try {
    await provider[action](ctx);
    const { data: fresh } = await sb.from("ai_sources").select("provider,status,last_synced_at,next_sync_at").eq("brain_id", brain.id).eq("provider", id).maybeSingle().throwOnError();
    send(res, 200, { source: describe(provider, fresh) });
  } catch (e) {
    if (e instanceof NotAvailable) return send(res, 409, { error: { code: "not_available", message: e.message }, source: describe(provider, rowOf(id)) });
    throw e;
  }
});
