// Delete imported knowledge (nodes, connections, sources and sync history). The brain itself stays.
import { send } from "../_lib/http.js";
import { route } from "../_lib/route.js";
import { ensureBrain, deleteData } from "../_lib/store.js";

export default route(["DELETE"], async ({ res, sb, user }) => {
  const { brain } = await ensureBrain(sb, user);
  await deleteData(sb, brain.id);
  send(res, 200, { deleted: true });
});
