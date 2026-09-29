// Email sign-in: sends a magic link. The response never says whether the address has an account.
import { send, siteUrl } from "../_lib/http.js";
import { route, bad } from "../_lib/route.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export default route(["POST"], async ({ req, res, sb }) => {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  if (!EMAIL.test(email)) throw bad("invalid email");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${siteUrl(req)}/api/auth/callback`, shouldCreateUser: true } });
  if (error) {
    if (error.status === 429) { return send(res, 429, { error: { code: "rate_limited", message: "Too many links requested. Wait a minute, then try again." } }); }
    throw error;
  }
  send(res, 200, { sent: true });
}, { auth: false });
