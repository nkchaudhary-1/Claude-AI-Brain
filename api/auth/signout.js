// Sign out of this device: revokes the session and clears the auth cookies.
import { send } from "../_lib/http.js";
import { route } from "../_lib/route.js";

export default route(["POST"], async ({ res, sb }) => {
  await sb.auth.signOut({ scope: "local" });
  send(res, 200, { signedOut: true });
}, { auth: false });
