// Bundles the project into single self-contained HTML files. Zero dependencies.
//   dist/index.html     standalone page (open directly or host anywhere)
//   dist/artifact.html  body-only fragment for publishing as a claude.ai artifact
//                       (the artifact host adds doctype/head/body itself)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFile(root + p, "utf8");

const [page, css, seed, importer, main] = await Promise.all([
  read("index.html"), read("src/styles.css"), read("src/data/seed.js"), read("src/importer/core.js"), read("src/main.js"),
]);

// Modules → one classic script: drop import lines and `export` keywords.
const script = [
  seed.replace(/^export\s+/gm, ""),
  importer.replace(/^export\s+/gm, ""),
  main.replace(/^import .*?;[ \t]*$/gm, ""),
].join("\n");

const head = page.slice(page.indexOf("<title>"), page.indexOf('<link rel="stylesheet" href="src/styles.css">'));
const body = page.slice(page.indexOf("<body>") + 6, page.indexOf('<script type="module"'));

const fragment = `${head.trim()}\n<style>\n${css}</style>\n${body.trim()}\n<script>\n${script}</script>\n`;
const standalone = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head.trim()}\n<style>\n${css}</style>\n</head>\n<body>\n${body.trim()}\n<script>\n${script}</script>\n</body>\n</html>\n`;

await mkdir(root + "dist", { recursive: true });
await writeFile(root + "dist/artifact.html", fragment);
await writeFile(root + "dist/index.html", standalone);
console.log(`Built dist/index.html (${(standalone.length / 1024).toFixed(1)} KB) and dist/artifact.html`);
