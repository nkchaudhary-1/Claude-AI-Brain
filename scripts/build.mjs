// Builds two things. Zero dependencies.
//   dist/                         the hosted app (Vercel's output directory)
//     index.html                  markup, no inline script (so the CSP can forbid it)
//     assets/app-<hash>.js|css    content-hashed, cached forever
//   dist-artifact/artifact.html   the personal claude.ai artifact: one inline fragment, local mode,
//                                 full seed. Never deployed.
//
// The hosted app is public, and anyone can read its source, so its brain is a general-knowledge demo
// (src/data/demo.js), never the personal seed. The build fails if seed text appears in the bundle.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFile(root + p, "utf8");
const [page, css, seedSrc, importer, learn, cloud, main] = await Promise.all([
  read("index.html"), read("src/styles.css"), read("src/data/seed.js"), read("src/importer/core.js"), read("src/learn/core.js"), read("src/cloud.js"), read("src/main.js"),
]);
const strip = (s) => s.replace(/^export\s+/gm, "");
const app = [strip(importer), strip(learn), strip(cloud), main.replace(/^import .*?;[ \t]*$/gm, "")].join("\n");

// ── demo brain ─────────────────────────────────────────────────────────────
// The hosted app is public, and anyone can read its source, so it carries none of the personal seed:
// its landing, guest view and "Explore the demo" use src/data/demo.js (general knowledge). The build
// fails if any seed title, description or conversation text reaches the bundle.
const demoSrc = await read("src/data/demo.js");
const { CONV, SEED } = await import(pathToFileURL(root + "src/data/seed.js").href);
const { DEMO } = await import(pathToFileURL(root + "src/data/demo.js").href);
const demoIds = new Set(DEMO.neurons.map((n) => n.id));
if (demoIds.size !== DEMO.neurons.length) throw new Error("Duplicate ids in src/data/demo.js.");
for (const n of DEMO.neurons) for (const c of n.connections) { const id = typeof c === "object" ? c.id : c; if (!demoIds.has(id)) throw new Error(`Demo neuron "${n.id}" links to unknown "${id}".`); }
const webScript = `${strip(demoSrc)}\nconst CONV = {};\nconst SEED = DEMO;\n` + app;
const personal = [...SEED.neurons.flatMap((n) => [n.title, n.description, ...(n.learned || []), ...(n.created || []), ...(n.insights || [])]),
  ...Object.values(CONV).flatMap((c) => [c.title, c.summary])].filter((x) => typeof x === "string" && x.length >= 5 && x !== "My AI Brain"); // the product name itself
const leaks = [...new Set(personal.filter((x) => webScript.includes(x)))];
if (leaks.length) throw new Error(`Personal seed text reached the public bundle:\n  ${leaks.join("\n  ")}`);

// ── pages ─────────────────────────────────────────────────────────────────
const head = page.slice(page.indexOf("<title>"), page.indexOf('<link rel="stylesheet" href="src/styles.css">')).trim();
const bodyTag = page.match(/<body[^>]*>/)[0];
const body = page.slice(page.indexOf(bodyTag) + bodyTag.length, page.indexOf('<script type="module"')).trim();
// Notes for the personal build only (seed provenance, the CLI) stay out of the public page entirely.
const webBody = body.replace(/\s*<p class="local-only">[\s\S]*?<\/p>/g, "");
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);
const jsName = `app-${hash(webScript)}.js`, cssName = `app-${hash(css)}.css`;

await rm(root + "dist", { recursive: true, force: true });
await mkdir(root + "dist/assets", { recursive: true });
await writeFile(root + `dist/assets/${jsName}`, webScript);
await writeFile(root + `dist/assets/${cssName}`, css);
await writeFile(root + "dist/index.html", `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}\n<link rel="stylesheet" href="/assets/${cssName}">\n<script src="/assets/${jsName}" defer></script>\n</head>\n${bodyTag}\n${webBody}\n</body>\n</html>\n`);
await writeFile(root + "dist/robots.txt", "User-agent: *\nAllow: /$\nDisallow: /api/\n");

const artifactHead = head.replace('<meta name="brain-mode" content="app">', '<meta name="brain-mode" content="local">');
const fragment = `${artifactHead}\n<style>\n${css}</style>\n${body}\n<script>\n${strip(seedSrc)}\n${app}</script>\n`;
await mkdir(root + "dist-artifact", { recursive: true });
await writeFile(root + "dist-artifact/artifact.html", fragment);

console.log(`Built dist/ (${(webScript.length / 1024).toFixed(0)} KB js, demo brain: ${DEMO.neurons.length} neurons, no personal seed) and dist-artifact/artifact.html (personal seed)`);
