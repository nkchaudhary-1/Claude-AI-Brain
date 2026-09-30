// Fetch a public web page for /api/learn, safely. The server fetches on the user's behalf, so it must never
// be pointed at anything internal (SSRF): only http(s) on ports 80/443, no credentials in the URL, every
// hostname resolved once and the connection pinned to that checked address (no DNS rebinding), every
// redirect re-checked, and hard limits on time, size and content type.
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

export class FetchError extends Error {
  constructor(code, detail) { super(detail || code); this.code = code; }
}

const v4 = (ip) => ip.split(".").map(Number);
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = v4(ip);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8");
  }
  return true;
}

export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new FetchError("invalid_url"); }
  if (!/^https?:$/.test(u.protocol)) throw new FetchError("invalid_url");
  if (u.username || u.password) throw new FetchError("blocked_url");
  if (u.port && !["80", "443"].includes(u.port)) throw new FetchError("blocked_url");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || /\.(localhost|local|internal|home|lan|corp)$/.test(host) || !host.includes(".") && !net.isIP(host)) throw new FetchError("blocked_url");
  if (net.isIP(host) && isPrivateAddress(host)) throw new FetchError("blocked_url");
  if (u.href.length > 2000) throw new FetchError("invalid_url");
  return u;
}

async function resolveSafe(host) {
  host = host.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return { address: host, family: net.isIP(host) };
  let addrs;
  try { addrs = await lookup(host, { all: true }); } catch { throw new FetchError("unreachable", "dns"); }
  if (!addrs.length) throw new FetchError("unreachable", "dns");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new FetchError("blocked_url");
  return addrs[0];
}

function request(u, addr, deadline) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(u, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; MyAIBrain/0.6; link reader)",
        accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en;q=0.9,*;q=0.5",
      },
      // connect only to the address we already checked
      lookup: (_h, opts, cb) => (opts && opts.all ? cb(null, [{ address: addr.address, family: addr.family }]) : cb(null, addr.address, addr.family)),
      timeout: Math.max(1000, deadline - Date.now()),
    }, resolve);
    req.on("timeout", () => req.destroy(new FetchError("timeout")));
    req.on("error", (e) => reject(e instanceof FetchError ? e : new FetchError("unreachable", e.code || e.message)));
    req.end();
  });
}

function readBody(res, maxBytes, deadline) {
  return new Promise((resolve, reject) => {
    const enc = String(res.headers["content-encoding"] || "").toLowerCase();
    const stream = enc.includes("gzip") ? res.pipe(zlib.createGunzip()) : enc.includes("deflate") ? res.pipe(zlib.createInflate()) : enc.includes("br") ? res.pipe(zlib.createBrotliDecompress()) : res;
    const parts = []; let size = 0, done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); res.destroy(); resolve(Buffer.concat(parts)); };
    const timer = setTimeout(finish, Math.max(500, deadline - Date.now()));   // slow page: keep what arrived
    stream.on("data", (c) => { if (done) return; size += c.length; parts.push(c); if (size >= maxBytes) finish(); });
    stream.on("end", finish);
    stream.on("error", (e) => { if (!done) { done = true; clearTimeout(timer); reject(new FetchError("unreachable", e.message)); } });
  });
}

function decodeText(buf, contentType) {
  let cs = (contentType.match(/charset=["']?([\w-]+)/i) || [])[1];
  if (!cs) cs = (buf.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  try { return new TextDecoder(cs || "utf-8").decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

export async function fetchPage(raw, { timeoutMs = 8000, maxBytes = 2_500_000, maxRedirects = 4 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let u = checkUrl(raw);
  for (let hop = 0; ; hop++) {
    const addr = await resolveSafe(u.hostname);
    const res = await request(u, addr, deadline);
    if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
      res.resume();
      if (hop >= maxRedirects || !res.headers.location) throw new FetchError("unreachable", "redirects");
      u = checkUrl(new URL(res.headers.location, u).href);
      continue;
    }
    if (res.statusCode >= 400) {
      res.resume();
      throw new FetchError(res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429 ? "forbidden_page" : res.statusCode === 404 || res.statusCode === 410 ? "not_found" : "unreachable", String(res.statusCode));
    }
    const type = String(res.headers["content-type"] || "").toLowerCase();
    if (type && !/text\/html|application\/xhtml\+xml|text\/plain/.test(type)) { res.resume(); throw new FetchError("not_html", type); }
    const buf = await readBody(res, maxBytes, deadline);
    return { url: u.href, contentType: type, text: decodeText(buf, type) };
  }
}
