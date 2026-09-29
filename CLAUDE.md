# My AI Brain

An interactive 3D brain that visualizes everything Neelesh has explored, learned and built with Claude. Knowledge items are neurons, relationships are connections, and areas of work are color-coded lobes. Private first, with a curated public view later.

- Original brief: `docs/brief.md` (17 sections)
- Visual reference: `docs/ui-reference.png` (a concept board, not a spec; see "Deviations from the reference")
- Live prototype: https://claude.ai/artifact/71NzTJtAW4DnjrNs74uhR4 (private artifact, republish from `dist/artifact.html`)

## Commands

```bash
npm run dev          # static server at http://localhost:5173 (no deps, no build step)
npm run build        # → dist/index.html (standalone) + dist/artifact.html (claude.ai artifact fragment)
npm run import -- <conversations.json | export folder> [--llm]   # → data/brain.json (see Importer)
npm test             # importer unit tests, then headless Chromium smoke test → tests/output/*.png
npm run test:importer  # importer unit tests only (no browser, no network)
npm run test:dist    # build, then test the bundled file
```

`npm test` needs `npm i && npx playwright install chromium` once. Set `CHROMIUM_PATH` to use an existing Chromium. WebGL runs on SwiftShader, so no GPU is needed. Labels drift with the idle sway, so test clicks on them use `{ force: true }`.

## Architecture

Zero runtime dependencies in the page. Raw WebGL, no three.js. It started that way because the first build environment couldn't reach a CDN, and it stayed because it's small, fast and fully under our control.

```
index.html          markup only; loads src/styles.css and src/main.js as an ES module
src/styles.css      all styles; tokens on :root; single dark world (no light theme by design)
src/data/seed.js    CONV (conversation table), SEED (neurons), EDGES (connection list)
src/importer/core.js  Importer: parse export → vocabulary vectors → clusters → neurons → merge. Pure JS,
                    shared by the page and the CLI; one top-level name because the build concatenates
src/main.js         everything else, in this order:
  MODEL             DOMAINS, REGIONS (lobes), LAYERS, normalize(), exportData()
  BRAIN GEOMETRY    ELL (6 ellipsoids = sagittal brain), fb() implicit fn, buildShell(), buildMesh(), layout()
  WEBGL             4 programs: shell points, shell mesh lines, knowledge links, neurons (+signals reuse it)
  FRAME             camera tween + idle sway, emphasis lerp, signals, projection
  LABELS            region labels (HTML) + pooled neuron pill labels with overlap rejection
  INTERACTION       pick(), hover tooltip, select()/closePanel(), renderPanel() with tabs
  search / nav / timeline / view toggle / metrics / insights
  IMPORT / EMPTY / STRESS (importExport() for raw exports), load(), boot()
scripts/serve.mjs   dev server
scripts/build.mjs   inlines CSS + seed + importer + main into single files
scripts/import.mjs  CLI: export → data/brain.json, offline or with the Claude pass
scripts/importer/llm.mjs  the Claude pass (@anthropic-ai/sdk, dev dependency, loaded only with --llm)
tests/importer.mjs  importer unit tests (grouping, privacy, merge, idempotency, Claude-pass validation, 3k perf)
tests/smoke.mjs     5 scenarios: desktop flow, phone flow, 3,000-neuron stress, empty state, raw-export import
tests/fixtures/claude-export.mjs  synthetic export in the real conversations.json shape (tests only)
```

Draw order each frame: cortex mesh → cortex points → knowledge links → neurons → signals. All use additive blending, with no depth test.

### Coordinate system
Brain units (u, v, w): u runs front (−) to back (+), v runs up, w is lateral. The brain faces left. World = `toWorld(u,v,w)` = `[u·RB·XS, v·RB, w·RB]` with RB=12, XS=1.06. The camera at th=0 sits on +z looking at the left hemisphere.

### Two layers of "neurons"
1. **Cortex** (`buildShell`, ~16k points + ~11k mesh segments). This is structure, not data. It's generated from the ellipsoid union with fold/sulcus noise, and colored by a soft blend of the lobe centres. It gives the reference's density without inventing numbers.
2. **Knowledge neurons** (`G.neurons`). This is the real data: bright orbs placed inside their lobe at a depth set by their layer (`LAYERS[].f` = target implicit-function value), then relaxed with a small force pass.

Never present cortex points as knowledge, and never count them in metrics.

## Data model

A neuron is authored in `src/data/seed.js` or imported as `brain.json` (schema in the Import panel):

```js
{ id, title, domains:["design","ai",...], type, status, visibility:"public"|"private", weight:1-5,
  createdAt?, updatedAt?, description, learned:[], created:[], insights:[], skills:[],
  conversations:[{id?,title,date,summary}] | conv:["key into CONV"], connections:[ids], source?:"import" }
```

- `type`: foundation | skill | project | experiment | research | idea. This sets the layer, meaning depth inside the lobe.
- `region` (lobe) is derived by `regionOf()`: research → Research, idea → Ideas, otherwise the first non-career domain. Career folds into Design.
- `createdAt`/`updatedAt` are derived from conversation dates when absent. `approx` conversations render as "By 15 Sep 2026".
- `normalize()` accepts loose input (`category` strings, plural types, unknown statuses) and builds an undirected edge list, `adj`, `degree`, `activity` (recency) and `size`.
- `density` scales brightness and size down past 250 neurons so large brains don't blow out.
- `source:"import"` marks neurons the importer created; conversation `id` is the claude.ai uuid. Both drive re-import merging.

## Importer

Conversations → Topics → Knowledge → Neurons → Connections. Input is `conversations.json` from claude.ai → Settings → Privacy → Export data (unzip it first). ChatGPT exports are rejected with a clear message.

**Two passes, one merge.**
1. **Offline** (`Importer.fromExport`, in the page and the CLI). TF-IDF over titles (×3) and the person's own messages (code blocks stripped, first 4k chars), unigrams + bigrams. Greedy time-ordered clustering at cosine ≥ `threshold` (default 0.16), two refine passes, a union-find merge of near-identical topics, and one-offs folded in only when close. Labels are the terms most of a cluster's chats share and the rest of the history doesn't (`Auto Layout · Figma`). Type, domains and status come from keyword rules and recency; weight from chat count and turns. It never writes `learned`, `created` or `insights`. Those stay empty rather than guessed. About 2s for 3,000 varied conversations on the main thread.
2. **Claude pass** (`--llm`, CLI only, `claude-opus-5-5`). Step 1 digests batches of ~80k chars (the user's first 3 + last message, the last reply) into summary, topics, kind, learned and created, with structured JSON output at effort medium. Digests are cached in `.brain-cache/digests.json` by conversation id + `updated_at`, so re-imports only pay for new chats. Step 2 sends every digest plus the existing brain's ids and titles and asks for neurons at effort high, reusing existing ids where it's the same knowledge. Conversation ids go out as `c1, c2…` aliases and come back validated through `toBrainNeurons()`. It shows an estimate and asks before spending (`--yes` skips the prompt). Server-side `fallbacks: "default"` handles refusals.
3. **Merge** (`Importer.merge`, both passes). New neurons match existing ones by id, then by title, then by ≥50% conversation overlap. Seed and hand-written neurons keep every field and only gain conversations, learned, created and skills. Previously imported neurons refresh type, domains, status and description. Title, visibility, weight and insights are curated and always survive. New neurons are always `private`. Re-importing the same export changes nothing.

**Where data lives.** In the page, the merged brain is stored in localStorage (base = the stored import if any, else the seed). The CLI writes `data/brain.json` and merges into it on the next run. `data/`, `.brain-cache/` and `conversations.json` are gitignored. Never commit personal history.

## Product rules (don't break these)

- **Never invent data.** No made-up metrics, projects, clients or conversations. Counts on screen are computed from the data. The reference board's "1,284 nodes" is decoration. The same rule applies to the portfolio at neelesh.one.
- **Client confidentiality.** The Gold Investment app is client work. It and anything derived from it (SIP autonomy dial, the component library) stay `visibility:"private"`. Public view must never show them.
- **Private first.** The Private view is the default. Public is a curated subset.
- Conversation titles in the seed are descriptive labels, not real chat titles. Replace them when the export is imported.
- Neurons are grouped knowledge. Never draw one neuron per conversation.

## Decisions so far

| # | Decision | Why | Revisit when |
|---|---|---|---|
| 1 | Private first, public later via `visibility` | Conversation history is personal; client work can't be public | Public launch on neelesh.one |
| 2 | Seed from known projects before building the importer | Real data now; the importer is the hard part | Export is available |
| 3 | Raw WebGL instead of three.js/R3F | No CDN in the build env; small and fast; no deps | Need post-processing (real bloom/DOF) or complex meshes |
| 4 | Full 3D on phones too (user's call) | Wanted the same experience everywhere | Real-device perf is poor |
| 5 | Lobes = Design, AI, Product, Development, Research, Ideas (from the reference) | Matches the mental model in the reference | Import reveals different clusters |
| 6 | Research/Ideas lobes keyed by type; Career folded into Design | Resolves the layer-vs-filter overlap in the brief | Career grows big enough to need a lobe |
| 7 | Cortex as a generated structure; knowledge as bright orbs | Reference density without fake counts | — |
| 8 | Insights computed from the graph (hub, region pairs, recency, paused, cross-lobe edge) | Honest stand-in until the LLM pass exists | Importer lands |
| 9 | Time scrubber = the brain as of end of a month/year (cumulative) | Shows the brain growing; undated items count as always present | — |
| 10 | Importer runs offline in the page; the Claude pass is CLI-only | Dropping an export should just work with no key and nothing leaving the browser. The LLM pass needs an API key and costs money, so it's explicit | A hosted version with auth |
| 11 | Offline pass leaves learned/created/insights empty | Keyword guesses there would be invented data | — |
| 12 | Claude pass uses `@anthropic-ai/sdk` as a dev dependency, dynamically imported | The page stays zero-dep; offline import works without `npm i` | — |

## Deviations from the reference
- Real counts, not the board's numbers.
- The board's "Zoom levels" and "Import thumbnail" tiles are presentation panels, so they're built as behaviour instead: zoom level drives the Explore/Zoom/Discover labels on the orb, and import is a dialog.
- There's no depth-layer legend any more. Layers still set how deep a neuron sits and show as the type in the detail card.

## Roadmap

**Next**
- Run the importer on the real export, then tune `--threshold` and the keyword rules against it.
- Curation UI in the detail panel (visibility, title, weight) so the curated fields that survive a merge can be set without editing JSON.

**Later**
- Move offline grouping to a Web Worker past ~5k conversations (it's ~2s on the main thread at 3k today).
- AI insight layer as meta-neurons (what I keep learning, building, abandoning; unexpected connections), written by Claude and not just computed.
- Public view published on neelesh.one.
- Real bloom and depth of field (would justify moving to three.js with post-processing).
- LOD / progressive loading beyond ~5k neurons (hover picking is O(n) per pointer move today).
- Split `src/main.js` into modules (model, geometry, renderer, ui). It's one file only because it was one artifact.

## Known gaps
- Not yet checked on a real GPU or phone. Glow and point sizes may differ from the SwiftShader screenshots.
- Fonts (Geist, Geist Mono via Google Fonts) weren't visible in headless tests. Fallbacks are system sans and mono.
- Canvas neurons aren't keyboard-reachable. Search is the keyboard path, and labels are focusable buttons.
- The Claude pass has only run against a mocked API (the wire format and output validation are tested). Its first real run is on the user's export.
- Offline labels are vocabulary, not names ("Agent · Prompt"). Rename them in brain.json; titles survive re-imports.
