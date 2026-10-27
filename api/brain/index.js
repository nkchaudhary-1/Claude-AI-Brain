// The signed-in person's Brain.
//   GET     load (creates the profile and an empty brain on first visit)
//   PATCH   rename { name }, or the person's own fields on existing nodes { nodes: [{ id, note?, review? }] } (≤ 50):
//           their note and recall progress. Nothing else on a node changes here; imports do that.
//           (One function for both: Vercel's free plan allows 12 functions, and this keeps it at 12.)
//   DELETE  delete the brain and everything in it; the next visit starts an empty one
import { send } from "../_lib/http.js";
import { route, bad } from "../_lib/route.js";
import { ensureBrain, loadBrain, deleteBrain, patchNodes } from "../_lib/store.js";
import { cleanPatches } from "../_lib/model.js";

export default route(["GET", "PATCH", "DELETE"], async ({ req, res, sb, user }) => {
  if (req.method === "GET") return send(res, 200, await loadBrain(sb, user));
  const { brain } = await ensureBrain(sb, user);
  if (req.method === "PATCH" && req.body && Array.isArray(req.body.nodes)) return send(res, 200, { updated: await patchNodes(sb, brain.id, cleanPatches(req.body)) });
  if (req.method === "PATCH") {
    const name = String((req.body && req.body.name) || "").trim().slice(0, 80);
    if (!name) throw bad("empty name");
    await sb.from("brains").update({ name }).eq("id", brain.id).throwOnError();
    return send(res, 200, { name });
  }
  await deleteBrain(sb, brain.id);
  send(res, 200, { deleted: true });
});
