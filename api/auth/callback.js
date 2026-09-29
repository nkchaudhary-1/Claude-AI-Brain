// OAuth and magic-link return: exchange the one-time code for a session cookie, then enter the Brain.
import { allow, redirect, safeNext } from "../_lib/http.js";
import { configured, supabaseFor } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (!allow(req, res, ["GET"])) return;
  const q = req.query || {};
  if (!configured() || q.error || !q.code) {
    if (q.error) console.error("[api] auth callback:", String(q.error_description || q.error).slice(0, 200));
    return redirect(res, "/?auth_error=callback");
  }
  const { error } = await supabaseFor(req, res).auth.exchangeCodeForSession(String(q.code));
  if (error) { console.error("[api] auth exchange:", error.message); return redirect(res, "/?auth_error=callback"); }
  redirect(res, safeNext(q.next));
}
