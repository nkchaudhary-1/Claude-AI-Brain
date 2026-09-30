// POST /api/learn { url } → the page's key ideas: { page, summary, ideas[], keywords[], domains[], readMinutes }.
// Free: no AI, no paid service. The page is fetched safely (api/_lib/fetchpage.js), reduced to readable text,
// and digested by the same pure module the browser uses (src/learn/core.js). Only the derived snippets are
// returned; the page's full text never leaves the function. No account needed, so it works on the demo.
import { allow, fail, send, sameSite } from "./_lib/http.js";
import { fetchPage, FetchError } from "./_lib/fetchpage.js";
import { Learn } from "../src/learn/core.js";

// Best-effort limit per instance: enough for real reading, not enough to use this as a crawler.
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 12;
}

export default async function handler(req, res) {
  if (!allow(req, res, ["POST"]) || !sameSite(req, res)) return;
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  if (limited(ip)) return fail(res, 429, "learn_rate_limited");
  const url = req.body && typeof req.body.url === "string" ? req.body.url : "";
  if (!url) return fail(res, 400, "invalid_url");
  try {
    const got = await fetchPage(url);
    const dg = Learn.digest(/html|xhtml/.test(got.contentType) || !got.contentType ? Learn.extractHtml(got.text, got.url) : Learn.fromText(got.text, got.url));
    if (!dg || !dg.ideas.length) return fail(res, 422, "no_text");
    send(res, 200, dg);
  } catch (e) {
    if (e instanceof FetchError) return fail(res, e.code === "blocked_url" || e.code === "invalid_url" ? 400 : 422, e.code, e.message !== e.code ? e : undefined);
    fail(res, 500, "unavailable", e);
  }
}
