// Builds two things. Zero dependencies.
//   dist/                         the hosted app (Vercel's output directory)
//     index.html                  markup, no inline script (so the CSP can forbid it)
//     assets/app-<hash>.js|css    content-hashed, cached forever
//   dist-artifact/artifact.html   the personal claude.ai artifact: one inline fragment, local mode,
//                                 full seed. Never deployed.
//
// The hosted app is public, and anyone can read its source, so its demo brain is the *public*
// seed: private neurons, conversations they touch and list items naming them are removed at build
// time, and the build fails if any of that text still appears in the bundle.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFile(root + p, "utf8");
const [page, css, seedSrc, importer, cloud, main] = await Promise.all([
  read("index.html"), read("src/styles.css"), read("src/data/seed.js"), read("src/importer/core.js"), read("src/cloud.js"), read("src/main.js"),
]);
const strip = (s) => s.replace(/^export\s+/gm, "");
const app = [strip(importer), strip(cloud), main.replace(/^import .*?;[ \t]*$/gm, "")].join("\n");

// ── public seed ────────────────────────────────────────────────────────────
const { CONV, SEED } = await import(pathToFileURL(root + "src/data/seed.js").href);
const priv = SEED.neurons.filter((n) => n.visibility === "private");
const privIds = new Set(priv.map((n) => n.id));
const privConv = new Set(priv.flatMap((n) => n.conv || []));
const privTerms = priv.map((n) => n.title.toLowerCase());
const mentions = (s) => privTerms.some((t) => String(s).toLowerCase().includes(t));
const pubNeurons = SEED.neurons.filter((n) => !privIds.has(n.id)).map((n) => {
  const o = { ...n, connections: (n.connections || []).filter((c) => !privIds.has(c)) };
  if (n.conv) o.conv = n.conv.filter((k) => !privConv.has(k));
  for (const f of ["learned", "created", "insights", "skills"]) if (n[f]) o[f] = n[f].filter((x) => !mentions(x));
  if (mentions(n.description)) throw new Error(`Public neuron "${n.id}" describes a private one. Edit its description in src/data/seed.js.`);
  return o;
});
const pubConv = Object.fromEntries(Object.entries(CONV).filter(([k]) => !privConv.has(k)));
const publicSeed = `const CONV = ${JSON.stringify(pubConv)};\nconst SEED = ${JSON.stringify({ version: SEED.version, neurons: pubNeurons })};\n`;
const webScript = publicSeed + app;
const leaks = [...priv.flatMap((n) => [n.title, n.description]), ...[...privConv].map((k) => CONV[k] && CONV[k].summary)].filter((s) => s && webScript.includes(s));
if (leaks.length) throw new Error(`Private seed text reached the public bundle:\n  ${leaks.join("\n  ")}`);

// ── pages ─────────────────────────────────────────────────────────────────
const head = page.slice(page.indexOf("<title>"), page.indexOf('<link rel="stylesheet" href="src/styles.css">')).trim();
const bodyTag = page.match(/<body[^>]*>/)[0];
const body = page.slice(page.indexOf(bodyTag) + bodyTag.length, page.indexOf('<script type="module"')).trim();
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);
const jsName = `app-${hash(webScript)}.js`, cssName = `app-${hash(css)}.css`;

await rm(root + "dist", { recursive: true, force: true });
await mkdir(root + "dist/assets", { recursive: true });
await writeFile(root + `dist/assets/${jsName}`, webScript);
await writeFile(root + `dist/assets/${cssName}`, css);
await writeFile(root + "dist/index.html", `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}\n<link rel="stylesheet" href="/assets/${cssName}">\n<script src="/assets/${jsName}" defer></script>\n</head>\n${bodyTag}\n${body}\n</body>\n</html>\n`);
await writeFile(root + "dist/robots.txt", "User-agent: *\nAllow: /$\nDisallow: /api/\n");

const artifactHead = head.replace('<meta name="brain-mode" content="app">', '<meta name="brain-mode" content="local">');
const fragment = `${artifactHead}\n<style>\n${css}</style>\n${body}\n<script>\n${strip(seedSrc)}\n${app}</script>\n`;
await mkdir(root + "dist-artifact", { recursive: true });
await writeFile(root + "dist-artifact/artifact.html", fragment);

console.log(`Built dist/ (${(webScript.length / 1024).toFixed(0)} KB js, public seed: ${pubNeurons.length} of ${SEED.neurons.length} neurons) and dist-artifact/artifact.html`);
