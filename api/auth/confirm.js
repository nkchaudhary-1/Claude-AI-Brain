// Magic link that works across devices: the email template links here with a token hash
// (see README → Email template), so the link can be opened in a different browser than the one
// that asked for it. The PKCE /callback route covers the same-browser case.
import { allow, redirect, safeNext } from "../_lib/http.js";
import { configured, supabaseFor } from "../_lib/supabase.js";

const TYPES = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

export default async function handler(req, res) {
  if (!allow(req, res, ["GET"])) return;
  const { token_hash, type, next } = req.query || {};
  if (!configured() || !token_hash || !TYPES.includes(type)) return redirect(res, "/?auth_error=link");
  const { error } = await supabaseFor(req, res).auth.verifyOtp({ token_hash: String(token_hash), type });
  if (error) { console.error("[api] auth confirm:", error.message); return redirect(res, "/?auth_error=link"); }
  redirect(res, safeNext(next));
}
