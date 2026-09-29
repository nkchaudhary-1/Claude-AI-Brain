// Who is signed in, validated with Supabase Auth. Refreshes the session cookie when needed.
import { allow, fail, send } from "./_lib/http.js";
import { configured, currentUser, publicUser, supabaseFor } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (!allow(req, res, ["GET"])) return;
  if (!configured()) return send(res, 200, { user: null, accounts: false });
  try { send(res, 200, { user: publicUser(await currentUser(supabaseFor(req, res))), accounts: true }); }
  catch (e) { fail(res, 500, "unavailable", e); }
}
