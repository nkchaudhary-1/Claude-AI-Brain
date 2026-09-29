// Incremental sync of knowledge the browser has already grouped and merged.
//   { op: "start",  provider }                  → { syncId }
//   { op: "batch",  syncId, nodes: [...] }       → { created, updated, connectionsCreated }   (≤ 300 nodes)
//   { op: "finish", syncId, ok, items, error? }  → { done }
// Only changed nodes are sent, so an import never rebuilds the whole Brain. Every node is
// re-validated by cleanNode(); the client's shape is never trusted.
// Contract: list each connection on both of its nodes (Cloud.changedNeurons does). A link is
// created by whichever batch brings its second end, so batch order doesn't matter.
import { send } from "../_lib/http.js";
import { route, bad } from "../_lib/route.js";
import { cleanNode, LIMITS } from "../_lib/model.js";
import { ensureBrain, upsertNodes, startSync, addToSync, finishSync } from "../_lib/store.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default route(["POST"], async ({ req, res, sb, user }) => {
  const body = req.body || {};
  const { brain } = await ensureBrain(sb, user);
  if (body.op === "start") return send(res, 200, { syncId: await startSync(sb, brain.id, String(body.provider || "import")) });
  if (!UUID.test(String(body.syncId || ""))) throw bad("missing syncId");
  if (body.op === "batch") {
    const raw = Array.isArray(body.nodes) ? body.nodes : [];
    if (raw.length > LIMITS.nodesPerBatch) throw bad("batch too large", 413);
    const cleaned = raw.map((n) => cleanNode(n)).filter(Boolean);
    const out = cleaned.length ? await upsertNodes(sb, brain.id, cleaned) : { created: 0, updated: 0, connectionsCreated: 0 };
    await addToSync(sb, body.syncId, { items: raw.length, nodes: out.created, connections: out.connectionsCreated });
    return send(res, 200, { ...out, rejected: raw.length - cleaned.length });
  }
  if (body.op === "finish") {
    await finishSync(sb, brain.id, body.syncId, { ok: body.ok !== false, error: body.ok === false ? "The import stopped before it finished." : null });
    return send(res, 200, { done: true });
  }
  throw bad("unknown op");
});
