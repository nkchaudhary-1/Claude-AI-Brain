// Small response helpers shared by every function. Vercel's Node runtime and scripts/serve.mjs
// both give handlers a Node req/res with req.query and a parsed JSON req.body.

// Users only ever see these sentences. Technical detail goes to the server log.
export const MESSAGES = {
  unauthenticated: "Your session has ended. Sign in again to open your Brain.",
  unavailable: "Your Brain is temporarily unavailable. Your existing knowledge is safe.",
  not_configured: "Accounts aren’t set up on this deployment yet.",
  bad_request: "That request couldn’t be read.",
  forbidden: "That request isn’t allowed.",
  method: "That action isn’t supported here.",
  auth: "We couldn’t authenticate your account.",
  provider: "We couldn’t connect to this AI source.",
  too_large: "That import is too large to send at once.",
};

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body === undefined ? "" : JSON.stringify(body));
}

export function fail(res, status, code, detail) {
  if (detail) console.error(`[api] ${code}:`, detail && detail.message ? detail.message : detail);
  send(res, status, { error: { code, message: MESSAGES[code] || MESSAGES.unavailable } });
}

export function redirect(res, location) {
  res.statusCode = 303;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

export function allow(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  fail(res, 405, "method");
  return false;
}

// Cookie-authenticated writes must come from this site: a custom header forces a CORS preflight
// (which this API never answers), and the Origin, when sent, must match the host.
export function sameSite(req, res) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = req.headers.origin;
  let okOrigin = true;
  if (origin) { try { okOrigin = new URL(origin).host === host; } catch { okOrigin = false; } }
  if (req.headers["x-brain-request"] !== "1" || !okOrigin) { fail(res, 403, "forbidden", `blocked ${req.method} ${req.url} origin=${origin} host=${host}`); return false; }
  return true;
}

export function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || (req.socket && req.socket.encrypted ? "https" : "http");
  return `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

// Only same-site relative paths, so a crafted link can't bounce a fresh session elsewhere.
export const safeNext = (n) => (typeof n === "string" && /^\/(?!\/)[\w\-./?=&#%]*$/.test(n) ? n : "/");

export const isSecure = (req) => (req.headers["x-forwarded-proto"] || "").split(",")[0] === "https" || !!(req.socket && req.socket.encrypted);
