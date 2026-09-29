// What this deployment supports. No secrets: only whether accounts are configured.
import { allow, send } from "./_lib/http.js";
import { configured } from "./_lib/supabase.js";

export default function handler(req, res) {
  if (!allow(req, res, ["GET"])) return;
  send(res, 200, { accounts: configured(), signIn: configured() ? ["google", "github", "email"] : [] });
}
