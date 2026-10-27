// The person's own additions to nodes already in their Brain, saved as they happen:
//   PATCH { nodes: [{ id, note?, review? }] }  → { updated }   (≤ 50 nodes)
// note: their words about a node ("" removes it). review: where each recall card stands.
// Nothing else on a node can change here; imports do that.
import { send } from "../_lib/http.js";
import { route, bad } from "../_lib/route.js";
import { cleanKey, cleanMine, LIMITS } from "../_lib/model.js";
import { ensureBrain, patchNodes } from "../_lib/store.js";

export function cleanPatches(body) {
  const raw = body && Array.isArray(body.nodes) ? body.nodes : null;
  if (!raw || !raw.length) throw bad("no nodes");
  if (raw.length > LIMITS.patchNodes) throw bad("too many nodes", 413);
  const out = [];
  for (const n of raw) {
    const key = n && cleanKey(n.id);
    if (!key || !(typeof n === "object") || !("note" in n || "review" in n)) continue;
    const mine = cleanMine(n), set = {};
    if ("note" in n) set.note = mine.note ?? null;
    if ("review" in n) set.review = mine.review ?? null;
    out.push({ key, set });
  }
  if (!out.length) throw bad("nothing to change");
  return out;
}

export default route(["PATCH"], async ({ req, res, sb, user }) => {
  const patches = cleanPatches(req.body);
  const { brain } = await ensureBrain(sb, user);
  send(res, 200, { updated: await patchNodes(sb, brain.id, patches) });
});
