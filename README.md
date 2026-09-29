# My AI Brain

A living 3D map of everything I've explored, learned and built with Claude.

```bash
npm run dev     # http://localhost:5173
npm run build   # dist/index.html + dist/artifact.html
npm run import -- ~/Downloads/claude-export/conversations.json          # → data/brain.json
npm run import -- ~/Downloads/claude-export/conversations.json --llm    # + the Claude pass
npm test        # importer tests + headless smoke test (needs: npm i && npx playwright install chromium)
```

Or drop `conversations.json` straight onto the page: it's grouped into knowledge in the browser and never leaves it.

No runtime dependencies. See `CLAUDE.md` for architecture, the data model, product rules and the roadmap.
