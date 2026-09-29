# My AI Brain

A living spatial knowledge network of everything Neelesh has explored, learned and built with Claude. Knowledge items are neurons, relationships are connections, areas of work are clusters. Not an anatomical brain: the brain is implied by flow and structure. Private first, with a curated public view later.

- Original brief: `docs/brief.md` (17 sections)
- Visual reference: `docs/ui-reference.png` (the v0.2 concept board; superseded by the v0.4 art direction below)
- Live prototype: https://claude.ai/artifact/71NzTJtAW4DnjrNs74uhR4 (private artifact, local mode, republish from `dist-artifact/artifact.html`)
- Hosted app: Vercel + Supabase. Setup, deploy guide, schema, RLS and provider notes are in `README.md`.

## Commands

```bash
npm run dev          # http://localhost:5173: source + /api functions (reads .env.local; no env = local mode)
npm run build        # → dist/ (hosted app, public seed, hashed assets) + dist-artifact/artifact.html (claude.ai, full seed)
npm run start        # serves dist/ + /api with vercel.json's headers and CSP
npm run import -- <conversations-000.zip | conversations.json | folder> [--llm]   # → data/brain.json (see Importer)
npm test             # importer unit tests, RLS tests (PGlite), headless Chromium smoke test → tests/output/*.png
npm run test:rls     # row level security against the real migration
npm run test:integration  # Docker: supabase/postgres + postgrest + GoTrue stand-in, full API end to end
npm run test:importer  # importer unit tests only (no browser, no network)
npm run test:dist    # build, then test the bundled file
```

`npm test` needs `npm i && npx playwright install chromium` once. Set `CHROMIUM_PATH` to use an existing Chromium. WebGL runs on SwiftShader, so no GPU is needed. Labels drift with the idle sway, so test clicks on them use `{ force: true }`.

## Architecture

Zero runtime dependencies in the page (the browser never loads a Supabase client). Raw WebGL, no three.js.
Two modes, chosen by `<meta name="brain-mode">`: **app** (hosted: accounts via `/api`, falls back to local when Supabase isn't configured) and **local** (the claude.ai artifact: seed + localStorage, no network). It started that way because the first build environment couldn't reach a CDN, and it stayed because it's small, fast and fully under our control.

```
index.html          markup only; loads src/styles.css and src/main.js as an ES module
src/styles.css      all styles; tokens on :root; single dark world (no light theme by design)
src/data/seed.js    CONV (conversation table), SEED (neurons), EDGES (connection list)
src/cloud.js        Cloud: fetch wrappers for /api + toVisual() (Brain model → renderer) + changedNeurons() + sync()
src/importer/core.js  Importer: parse export → vocabulary vectors → clusters → neurons → merge. Pure JS,
                    shared by the page and the CLI; one top-level name because the build concatenates
src/main.js         everything else, in this order:
  MODEL             DOMAINS, REGIONS (clusters), LAYERS (7, incl. Emerging), STATES (5 views), normalize(), exportData()
  STATES            anchors(), genLines()/genPoints() structure per state, buildScaffold(), neuronLayout(), relax()
  WEBGL             4 programs: structure lines, structure points, links, neurons (motes, signals, seed point reuse it)
                    startMorph() blends from wherever things are, even mid-morph
  FRAME             intro, camera + parallax + idle sway, per-frame neuron/link positions, emphasis, motes, signals, propagate()
  INTRO / LABELS    intro caption, region labels, pooled neuron labels, contextual controls near the selection
  FX OVERLAY        2D canvas: readout leader lines, reticles, panel thread, collapse particles, engine + layer marks
  INTERACTION       pick(), hover, select() = entering a memory, openPanel()/closePanel(), travel() between neurons
  search wave / filters / states / time slider / view / zoom / metadata readouts / insights
  IMPORT / EMPTY / STRESS importExport(), commitBrain() (account sync or localStorage), load(data, how)
  APP               bootApp() → loading steps → landing (guest) | openBrain() (user) → welcome / empty / error stages,
                    auth card, connect card, account sheet. bootLocal() for local mode.
api/                Vercel functions; api/_lib is shared (never routed). See README → Architecture.
supabase/           migrations (schema + RLS + signup trigger), config.toml, magic-link template
scripts/serve.mjs   dev/start server: static + /api handlers, .env.local, vercel.json headers in --dist
scripts/build.mjs   dist/ (public seed only; fails if private seed text leaks) + dist-artifact/artifact.html
scripts/import.mjs  CLI: export → data/brain.json, offline or with the Claude pass
scripts/importer/llm.mjs  the Claude pass (@anthropic-ai/sdk, dev dependency, loaded only with --llm)
tests/importer.mjs  importer unit tests (grouping, privacy, merge, idempotency, Claude-pass validation, 3k perf)
tests/rls.mjs       RLS: a second user and anon try to read/write/link into someone else's brain
tests/integration.mjs  real API end to end (auth cookies, PKCE, refresh, import, isolation, deletion)
tests/smoke.mjs     11 scenarios: local flows + hosted-app landing/auth/welcome/account/error with /api mocked
tests/fixtures/claude-export.mjs  synthetic export in the real conversations.json shape (tests only)
```

Draw order each frame: structure lines → structure points → knowledge links → neurons → motes → signals (→ seed point during the intro). All additive blending, no depth test. A 2D `#fx` canvas sits above for leader lines, reticles and the panel's collapse particles.

### Five states, one dataset
`flow` (Quantum Flow), `orb` (Knowledge Orb), `layers` (Layered Intelligence), `galaxy` (Knowledge Galaxy) and `engine` (Intelligence Engine). Keys 1–5 or the bottom switcher. Each state has region anchors, a camera home (`HOMES`, fitted to the aspect ratio by `HALFW`), structure geometry and a neuron layout. Switching morphs everything with a per-item stagger (`stag()`, same formula in JS and GLSL). Engine centres on the filtered region, or the most active one.

### Two layers of "neurons"
1. **Structure** (`buildScaffold`: 320–780 lines × 28 vertices, 3.4k–10.8k points, by screen size). Flow lines are traced through an ABC (divergence-free) field inside an ellipsoid with two slow circulations, so a brain is implied without anatomy. Every line belongs to a region, or to none, and keeps that region across states. The number of lines per region follows the data (weight × activity), so dense areas are active knowledge. It is decoration: never counted, never picked.
2. **Knowledge neurons** (`G.neurons`). The real data, laid out per state by `neuronLayout()` (importance pulls inward in the orb, layer sets height in layers, rank sets the spiral in the galaxy, age pushes older knowledge deeper in flow). Positions are computed on the CPU every frame so links, labels, signals and picking agree.

Never present structure lines or particles as knowledge, and never count them in metrics.

### Motion language
- Depth of field is in the shaders: `coc()` swells and fades points and lines by distance from the focal plane. `uDof` rises on selection.
- Signals: normal = slow particle, important (avg importance > .72) = bright pulse, recent = faster, strong (both weight ≥ 4) = three particles. `propagate()` sends light outward from a neuron (select, close, insights, readouts). Search runs the same wave from the top match and gates each match until the wave arrives.
- Entering a memory: camera dolly and DOF, a propagation wave, then the panel opens with a clip-path circle from the neuron's screen position and staggered `.rv` content. A thread links neuron and panel. Closing folds the panel back into the neuron and sends particles on the fx canvas.
- Intro (5.2s, boot only): a seed point, particles emitted outward (`aBorn`), lines drawing on, neurons, links growing, then the UI arriving. Captions: One idea → Many ideas → Complete intelligence. Any input speeds it up.

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

Conversations → Topics → Knowledge → Neurons → Connections. Input comes from claude.ai → Settings → Privacy → Export data. The email now sends a **manifest** `.json` of one-time links to several zips (`conversations-000.zip`, `projects-000.zip`, `memories-000.zip`, …); older exports were one zip with `conversations.json`. `Importer.readExport(files)` takes any of it without unzipping: zips (a small reader on `DecompressionStream`, stored + deflate, no zip64), several parts at once (deduped by uuid, fuller copy wins), JSON or JSON Lines, and the manifest itself, which answers with its `conversations` download links (claude.ai `/export/` URLs only). ChatGPT exports are parsed too. The wrong file gets a message naming it (`Importer.describe`).

**Two passes, one merge.**
1. **Offline** (`Importer.fromExport`, in the page and the CLI). TF-IDF over titles (×3) and the person's own messages (code blocks stripped, first 4k chars), unigrams + bigrams. Greedy time-ordered clustering at cosine ≥ `threshold` (default 0.16), two refine passes, a union-find merge of near-identical topics, and one-offs folded in only when close. Labels are the terms most of a cluster's chats share and the rest of the history doesn't (`Auto Layout · Figma`). Type, domains and status come from keyword rules and recency; weight from chat count and turns. It never writes `learned`, `created` or `insights`. Those stay empty rather than guessed. About 2s for 3,000 varied conversations on the main thread.
2. **Claude pass** (`--llm`, CLI only, `claude-opus-5-5`). Step 1 digests batches of ~80k chars (the user's first 3 + last message, the last reply) into summary, topics, kind, learned and created, with structured JSON output at effort medium. Digests are cached in `.brain-cache/digests.json` by conversation id + `updated_at`, so re-imports only pay for new chats. Step 2 sends every digest plus the existing brain's ids and titles and asks for neurons at effort high, reusing existing ids where it's the same knowledge. Conversation ids go out as `c1, c2…` aliases and come back validated through `toBrainNeurons()`. It shows an estimate and asks before spending (`--yes` skips the prompt). Server-side `fallbacks: "default"` handles refusals.
3. **Merge** (`Importer.merge`, both passes). New neurons match existing ones by id, then by title, then by ≥50% conversation overlap. Seed and hand-written neurons keep every field and only gain conversations, learned, created and skills. Previously imported neurons refresh type, domains, status and description. Title, visibility, weight and insights are curated and always survive. New neurons are always `private`. Re-importing the same export changes nothing.

**Where data lives.** Signed in: Supabase (`knowledge_nodes`, `connections`); only changed nodes are sent, links listed on both ends. Signed out or local mode: localStorage (base = the stored import if any, else the seed). The CLI writes `data/brain.json` and merges into it on the next run. `data/`, `.brain-cache/` and `conversations.json` are gitignored. Never commit personal history.

## Product rules (don't break these)

- **Never invent data.** No made-up metrics, projects, clients or conversations. Counts on screen are computed from the data. The reference board's "1,284 nodes" is decoration. The same rule applies to the portfolio at neelesh.one.
- **Client confidentiality.** The Gold Investment app is client work. It and anything derived from it (SIP autonomy dial, the component library) stay `visibility:"private"`. Public view must never show them.
- **Private first.** The Private view is the default. Public is a curated subset. Anything imported without an explicit visibility is stored private.
- **The public bundle never contains private seed data.** `scripts/build.mjs` strips it and fails the build on a leak. Keep it that way.
- **Honest providers.** Don't add fake "connect" or "sync" for Claude/ChatGPT. Export → import until an official mechanism exists.
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
| 13 | v0.4: no anatomical brain; five morphing states of one dataset | The art direction asks for intelligence implied by flow, not anatomy; states share data so switching feels like the same mind rearranging | — |
| 14 | Depth of field and glow in the shaders, not post-processing | Keeps raw WebGL and zero deps; good enough at this density | Real bloom/DOF is wanted (three.js + postprocessing) |
| 15 | Metadata uses real counts even though the brief's mock shows 1,284 / 326 / 2,941 | "Never invent data" | — |
| 17 | v0.5: static front end + Vercel functions, not a Next.js port | Keeps the renderer untouched and the page dependency-free; `/api` is Vercel's native model | Need SSR or React |
| 18 | Auth sessions in httpOnly cookies via @supabase/ssr on the server; no Supabase client in the browser | No tokens reachable from page JS; every query runs as the user under RLS | Realtime needed in the browser |
| 19 | No service-role key | Nothing needs to bypass RLS; one less secret | Account deletion or scheduled sync |
| 20 | Grouping runs in the browser; only derived knowledge is uploaded | Privacy, and exports can exceed Vercel's 4.5 MB body limit | — |
| 16 | Emerging layer = exploring / experimenting / in-progress and updated in the last 30 days | Honest, data-derived stand-in for "emerging intelligence" | The Claude insight pass lands |

## Deviations from the art direction
- Real counts, not the brief's numbers. "Hundreds of nodes per cluster" comes from structure particles; only the bright nodes are knowledge.
- Zoom levels (Universe → Cluster → Knowledge → Detail) are driven by camera distance and shown bottom right, not as separate screens.
- Radial menus aren't built. Controls are compact floating pills with magnetic hover.
- The panel stays a right-side card on desktop (bottom sheet on phones). It grows out of the neuron rather than slides in.

## Roadmap

**Next**
- Run the importer on the real export, then tune `--threshold` and the keyword rules against it.
- Curation UI in the detail panel (visibility, title, weight) so the curated fields that survive a merge can be set without editing JSON.

**Later**
- Move offline grouping to a Web Worker past ~5k conversations (it's ~2s on the main thread at 3k today).
- Real bloom and depth of field, radial control, and a cursor light that brushes nearby structure.
- Time scrubbing that also re-lays out by age, not only fades.
- AI insight layer as meta-neurons (what I keep learning, building, abandoning; unexpected connections), written by Claude and not just computed.
- Public view published on neelesh.one.
- LOD / progressive loading beyond ~5k neurons (hover picking is O(n) per pointer move today).
- Split `src/main.js` into modules (model, geometry, renderer, ui). It's one file only because it was one artifact.

## Known gaps
- Not yet checked on a real GPU or phone. Glow, line alpha (tuned on SwiftShader at 1×, boosted ×1.3 on retina) and point sizes may differ.
- The intro is time-based; on a slow machine the first frames are skipped rather than slowed.
- Fonts (Geist, Geist Mono via Google Fonts) weren't visible in headless tests. Fallbacks are system sans and mono.
- Canvas neurons aren't keyboard-reachable. Search is the keyboard path, and labels are focusable buttons.
- The Claude pass has only run against a mocked API (the wire format and output validation are tested). Its first real run is on the user's export.
- Offline labels are vocabulary, not names ("Agent · Prompt"). Rename them in brain.json; titles survive re-imports.
