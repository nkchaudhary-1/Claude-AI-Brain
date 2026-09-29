# My AI Brain

An interactive 3D brain that visualizes everything Neelesh has explored, learned and built with Claude. Knowledge items are neurons, relationships are connections, and areas of work are color-coded lobes. Private first, with a curated public view later.

- Original brief: `docs/brief.md` (17 sections)
- Visual reference: `docs/ui-reference.png` (a concept board, not a spec; see "Deviations from the reference")
- Live prototype: https://claude.ai/artifact/71NzTJtAW4DnjrNs74uhR4 (private artifact, republish from `dist/artifact.html`)

## Commands

```bash
npm run dev          # static server at http://localhost:5173 (no deps, no build step)
npm run build        # → dist/index.html (standalone) + dist/artifact.html (claude.ai artifact fragment)
npm test             # headless Chromium smoke test → tests/output/*.png, exits 1 on errors
npm run test:dist    # build, then test the bundled file
```

`npm test` needs `npm i && npx playwright install chromium` once. Set `CHROMIUM_PATH` to use an existing Chromium. WebGL runs on SwiftShader, so no GPU is needed. Labels drift with the idle sway, so test clicks on them use `{ force: true }`.

## Architecture

Zero runtime dependencies. Raw WebGL, no three.js. It started that way because the first build environment couldn't reach a CDN, and it stayed because it's small, fast and fully under our control.

```
index.html          markup only; loads src/styles.css and src/main.js as an ES module
src/styles.css      all styles; tokens on :root; single dark world (no light theme by design)
src/data/seed.js    CONV (conversation table), SEED (neurons), EDGES (connection list)
src/main.js         everything else, in this order:
  MODEL             DOMAINS, REGIONS (lobes), LAYERS, normalize(), exportData()
  BRAIN GEOMETRY    ELL (6 ellipsoids = sagittal brain), fb() implicit fn, buildShell(), buildMesh(), layout()
  WEBGL             4 programs: shell points, shell mesh lines, knowledge links, neurons (+signals reuse it)
  FRAME             camera tween + idle sway, emphasis lerp, signals, projection
  LABELS            region labels (HTML) + pooled neuron pill labels with overlap rejection
  INTERACTION       pick(), hover tooltip, select()/closePanel(), renderPanel() with tabs
  search / nav / timeline / view toggle / metrics / insights
  IMPORT / EMPTY / STRESS, load(), boot()
scripts/serve.mjs   dev server
scripts/build.mjs   inlines CSS + JS into single files
tests/smoke.mjs     4 scenarios: desktop flow, phone flow, 3,000-neuron stress, empty state
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
  conversations:[{title,date,summary}] | conv:["key into CONV"], connections:[ids] }
```

- `type`: foundation | skill | project | experiment | research | idea. This sets the layer, meaning depth inside the lobe.
- `region` (lobe) is derived by `regionOf()`: research → Research, idea → Ideas, otherwise the first non-career domain. Career folds into Design.
- `createdAt`/`updatedAt` are derived from conversation dates when absent. `approx` conversations render as "By 15 Sep 2026".
- `normalize()` accepts loose input (`category` strings, plural types, unknown statuses) and builds an undirected edge list, `adj`, `degree`, `activity` (recency) and `size`.
- `density` scales brightness and size down past 250 neurons so large brains don't blow out.

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

## Deviations from the reference
- Real counts, not the board's numbers.
- The board's "Zoom levels" and "Import thumbnail" tiles are presentation panels, so they're built as behaviour instead: zoom level drives the Explore/Zoom/Discover labels on the orb, and import is a dialog.
- There's no depth-layer legend any more. Layers still set how deep a neuron sits and show as the type in the detail card.

## Roadmap

**Next: Claude history importer.** Take the claude.ai data export (`conversations.json`), then cluster conversations into topics and knowledge with an LLM pass, then emit `brain.json` in the schema above. Merge by id with the seed, so curated fields (visibility, weight, insights) survive re-imports. The page currently rejects raw exports with a clear message; keep that until the importer exists.

**Later**
- AI insight layer as meta-neurons (what I keep learning, building, abandoning; unexpected connections), written by Claude and not just computed.
- Public view published on neelesh.one.
- Real bloom and depth of field (would justify moving to three.js with post-processing).
- LOD / progressive loading beyond ~5k neurons (hover picking is O(n) per pointer move today).
- Split `src/main.js` into modules (model, geometry, renderer, ui). It's one file only because it was one artifact.

## Known gaps
- Not yet checked on a real GPU or phone. Glow and point sizes may differ from the SwiftShader screenshots.
- Fonts (Geist, Geist Mono via Google Fonts) weren't visible in headless tests. Fallbacks are system sans and mono.
- Canvas neurons aren't keyboard-reachable. Search is the keyboard path, and labels are focusable buttons.
