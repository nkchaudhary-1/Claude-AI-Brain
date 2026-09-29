// One wrapper for every endpoint: method check, same-site check for writes, configuration,
// authentication, and errors that never leak backend detail to the browser.
import { allow, fail, sameSite } from "./http.js";
import { configured, currentUser, supabaseFor } from "./supabase.js";

export function route(methods, handler, { auth = true } = {}) {
  return async function (req, res) {
    try {
      if (!allow(req, res, methods) || !sameSite(req, res)) return;
      if (!configured()) return fail(res, 503, "not_configured");
      const sb = supabaseFor(req, res);
      const user = auth ? await currentUser(sb) : null;
      if (auth && !user) return fail(res, 401, "unauthenticated");
      await handler({ req, res, sb, user });
    } catch (e) {
      const status = e && e.status >= 400 && e.status < 500 ? e.status : 500;
      fail(res, status, status === 400 ? "bad_request" : status === 413 ? "too_large" : status === 409 ? "bad_request" : "unavailable", e);
    }
  };
}

export const bad = (message, status = 400) => Object.assign(new Error(message), { status });
