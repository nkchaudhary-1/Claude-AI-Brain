// Server-side Supabase client. The session lives in httpOnly cookies that only these functions
// read and write; the browser never holds a Supabase token or client. Every query runs as the
// signed-in user, so row level security is what decides which rows come back.
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { isSecure } from "./http.js";

export function env() {
  return {
    url: process.env.SUPABASE_URL || "",
    // the anon (or newer "publishable") key: safe to be public, but here it never leaves the server
    key: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  };
}
export const configured = () => { const e = env(); return !!(e.url && e.key); };

function appendCookie(res, cookie) {
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", prev ? [].concat(prev, cookie) : [cookie]);
}

export function supabaseFor(req, res) {
  const { url, key } = env();
  const secure = isSecure(req);
  return createServerClient(url, key, {
    auth: { flowType: "pkce" },
    cookieOptions: { httpOnly: true, sameSite: "lax", secure, path: "/" },
    cookies: {
      getAll: () => parseCookieHeader(req.headers.cookie || "").map(({ name, value }) => ({ name, value: value ?? "" })),
      setAll(list, headers) {
        for (const { name, value, options } of list) appendCookie(res, serializeCookieHeader(name, value, { ...options, httpOnly: true, sameSite: "lax", secure, path: "/" }));
        if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      },
    },
  });
}

// getUser() validates the access token with Supabase Auth (and refreshes it when needed),
// unlike getSession(), which only decodes the cookie.
export async function currentUser(sb) {
  const { data, error } = await sb.auth.getUser();
  if (error || !data || !data.user) return null;
  return data.user;
}

export function publicUser(user) {
  if (!user) return null;
  const m = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email || null,
    name: m.full_name || m.name || m.user_name || (user.email ? user.email.split("@")[0] : "You"),
    avatar: typeof m.avatar_url === "string" && /^https:\/\//.test(m.avatar_url) ? m.avatar_url : null,
    provider: (user.app_metadata && user.app_metadata.provider) || "email",
  };
}
