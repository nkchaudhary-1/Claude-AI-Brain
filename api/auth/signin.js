// OAuth start: Google or GitHub. PKCE verifier goes into an httpOnly cookie; the browser is sent
// to Supabase Auth, then to the provider, and comes back to /api/auth/callback.
import { allow, redirect, safeNext, siteUrl } from "../_lib/http.js";
import { configured, supabaseFor } from "../_lib/supabase.js";

const OAUTH = ["google", "github"];

export default async function handler(req, res) {
  if (!allow(req, res, ["GET"])) return;
  const provider = String((req.query && req.query.provider) || "");
  if (!configured() || !OAUTH.includes(provider)) return redirect(res, "/?auth_error=unavailable");
  try {
    const next = encodeURIComponent(safeNext(req.query.next));
    const { data, error } = await supabaseFor(req, res).auth.signInWithOAuth({
      provider, options: { redirectTo: `${siteUrl(req)}/api/auth/callback?next=${next}`, skipBrowserRedirect: true },
    });
    if (error || !data || !data.url) throw error || new Error("no authorize url");
    redirect(res, data.url);
  } catch (e) {
    console.error("[api] auth signin:", e && e.message);
    redirect(res, "/?auth_error=signin");
  }
}
