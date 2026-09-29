# My AI Brain

A living spatial network of everything you’ve explored, learned and built with AI. Five views of one mind: Flow, Orb, Layers, Galaxy, Engine. Sign in, bring in your Claude or ChatGPT history, and your conversations become knowledge nodes, clusters and connections.

```bash
npm install
npm run dev      # http://localhost:5173 — source + /api functions (reads .env.local)
npm run build    # dist/ (the hosted app) + dist-artifact/artifact.html (personal claude.ai artifact)
npm run start    # serves dist/ + /api with vercel.json's headers, like production
npm test         # importer, row-level-security and browser smoke tests
npm run test:integration   # real Postgres + PostgREST end to end (needs Docker)
```

Without Supabase variables the app runs entirely in the browser (demo brain, local imports), so `npm run dev` works with zero setup.

## Architecture

```
Browser (vanilla JS + raw WebGL, no framework, no Supabase client, no tokens)
  │  fetch /api/*  (same-site, httpOnly session cookies)
  ▼
Vercel Functions  api/*.js
  │  @supabase/ssr server client, runs as the signed-in user
  ▼
Supabase  Auth (Google, GitHub, email link) · Postgres with row level security
```

- **Visualization is independent of the database.** `/api/brain` returns the Brain data model `{ brain, nodes, connections, clusters, metadata, sources, history }`. `src/cloud.js → toVisual()` turns that into the renderer’s input. The WebGL code never sees a row or a query.
- **Imports are grouped in the browser.** Full conversation text never leaves the device. Only the derived knowledge (topic titles, conversation titles, dates, short summaries) is sent, and only the nodes that changed (`Cloud.changedNeurons`). This keeps uploads small, well below Vercel’s 4.5 MB request limit.
- **No service-role key anywhere.** Every query runs with the user’s own session, so RLS decides. Deleting data or a brain is done by the owner under RLS.
- **Security headers** (CSP with no inline script, frame-ancestors none, nosniff, HSTS) live in `vercel.json`. `npm run start` applies them locally, so the smoke tests run under the real CSP.

| Path | What |
|---|---|
| `index.html`, `src/` | the experience (see `CLAUDE.md`) |
| `src/cloud.js` | API client + Brain-model ↔ renderer adapter |
| `api/_lib/` | shared server code: `supabase.js` (cookie client), `model.js` (validation + data model), `store.js` (queries), `providers.js` (AI provider abstraction), `route.js`, `http.js` |
| `api/auth/*` | `signin` (OAuth start), `callback` (PKCE exchange), `confirm` (magic link token hash), `email`, `signout` |
| `api/session.js`, `api/config.js` | who is signed in; whether accounts are configured |
| `api/brain/index.js` | GET load (creates profile + brain on first visit), PATCH rename, DELETE brain |
| `api/brain/import.js` | incremental sync: `start` → `batch` (≤300 nodes) → `finish` |
| `api/brain/data.js` | DELETE imported data |
| `api/sources.js` | connected AI: list, connect, disconnect, sync |
| `supabase/migrations/` | schema, indexes, RLS, signup trigger |
| `supabase/config.toml`, `supabase/templates/` | local Supabase CLI config and the magic-link email |

### Database

`profiles`, `brains` (one per user for now), `ai_sources`, `knowledge_nodes`, `connections`, `sync_history`, all with UUID keys, `created_at`/`updated_at`, and indexes on every foreign key and common filter. Two additions to the brief’s field list, both needed:

- `knowledge_nodes.node_key` is the stable key (`s-ds`, `imp-auto-layout-figma`) that re-imports merge on. Unique per brain.
- `knowledge_nodes.metadata` (jsonb) holds type, status, visibility, domains, learned, created, insights, skills, conversations, and the first/last-seen dates of the knowledge.

`category` is the cluster (design, ai, product, dev, research, ideas), `importance` is 1–5 and `activity` is a 0–1 recency snapshot. The renderer recomputes activity from dates.

### Row level security

Every table has RLS enabled and no access for `anon`. `profiles` and `brains` match `user_id = auth.uid()`. Child tables use `public.owns_brain(brain_id)`, a `security definer` function that answers only for the caller’s own uid. Connections reference nodes through composite `(node_id, brain_id)` foreign keys, so a connection can’t join two brains, not even two brains owned by the same user. `tests/rls.mjs` attacks all of this as a second user and as anon (20 checks). `tests/integration.mjs` repeats the isolation checks through the real API and PostgREST.

### AI providers: what’s real

| Provider | How data gets in | Why |
|---|---|---|
| Claude | Export → import (`conversations-000.zip` from the export email, or the manifest `.json`, which shows its download links; no unzipping) | Anthropic has no API that lets third-party apps read a person’s claude.ai conversation history. No passwords are asked for or stored. |
| ChatGPT | Export → import (the export zip or its `conversations.json`) | Same: OpenAI has no official history API for consumer accounts. The ChatGPT export format is parsed. |
| Import | `brain.json` or either export | — |

`api/_lib/providers.js` defines `connect / disconnect / getStatus / sync / normalize / process` and declares each provider’s capabilities. The UI only offers what a provider can really do. Claude’s `connect()` returns `not_available` with an explanation, and nothing pretends to sync. `next_sync_at` stays empty for export-based sources.

---

## DEPLOY TO VERCEL

You need a GitHub, a Supabase and a Vercel account, plus Google Cloud and GitHub for the OAuth apps. All of it works on free tiers.

**STEP 1 — Create a Supabase project.** supabase.com → New project. Pick a region near your users, and save the database password somewhere safe (the app never needs it).

**STEP 2 — Create the tables.** Supabase → SQL Editor → New query → paste all of `supabase/migrations/20260929000000_brain_schema.sql` → Run. It’s idempotent, so running it again is safe. (With the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)

**STEP 3 — Confirm row level security.** Table Editor → each of `profiles, brains, ai_sources, knowledge_nodes, connections, sync_history` shows **RLS enabled** with one policy. Database → Triggers should list `on_auth_user_created` on `auth.users`.

**STEP 4 — Google OAuth credentials.** console.cloud.google.com → APIs & Services → OAuth consent screen (External, app name “My AI Brain”, your email; scopes `email`, `profile`, `openid`) → Credentials → Create credentials → OAuth client ID → Web application.
- Authorized JavaScript origins: `https://<your-project>.vercel.app` (and `http://localhost:5173` for local testing)
- Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (copy it from Supabase → Authentication → Providers → Google)
Copy the Client ID and Client secret.

**STEP 5 — GitHub OAuth credentials.** github.com → Settings → Developer settings → OAuth Apps → New OAuth App.
- Homepage URL: `https://<your-project>.vercel.app`
- Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
Generate a client secret and copy the ID and secret.

**STEP 6 — Configure providers in Supabase.** Authentication → Sign In / Providers:
- Google: enable, paste the Client ID and secret.
- GitHub: enable, paste the Client ID and secret.
- Email: enabled, “Confirm email” on.
The OAuth secrets live only in Supabase, never in this repo or in Vercel.

**STEP 7 — Redirect URLs and the email template.** Authentication → URL Configuration:
- Site URL: `https://<your-project>.vercel.app`
- Redirect URLs: `https://<your-project>.vercel.app/api/auth/callback`, `https://<your-project>.vercel.app/api/auth/confirm`, `http://localhost:5173/api/auth/callback`, `http://localhost:5173/api/auth/confirm`

Authentication → Emails → **Magic Link**: set the subject to “Your MY AI BRAIN sign-in link” and paste the body of `supabase/templates/magic_link.html`. Its link goes to `/api/auth/confirm?token_hash=…`, so a link opened on another device still works. For real traffic, add your own SMTP under Authentication → Emails → SMTP Settings, because the built-in sender is rate-limited to a few emails an hour.

**STEP 8 — Local environment variables.** `cp .env.example .env.local`, then fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Project Settings → API). Leave `SITE_URL` empty locally.

**STEP 9 — Test locally.** `npm install && npm run dev` → http://localhost:5173 → Build My AI Brain → sign in with each method → Connect Claude → choose `conversations-000.zip` from your export email. Then `npm run build && npm run start` to try the production build.

**STEP 10 — Push to GitHub.** `git status` must not list `.env.local`, since it’s gitignored. Then `git push`.

**STEP 11 — Create a Vercel project.** vercel.com → Add New → Project.

**STEP 12 — Import the GitHub repository.** Framework preset: **Other**. `vercel.json` already sets build command `npm run build` and output directory `dist`, and the `api/` folder becomes functions automatically. Leave the root directory as `/`.

**STEP 13 — Environment variables in Vercel.** Settings → Environment Variables, for Production (and Preview if you want previews to sign in):
| Name | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | server-only |
| `SUPABASE_ANON_KEY` | anon / publishable key | server-only here |
| `SITE_URL` | `https://<your-project>.vercel.app` | used for OAuth and email redirects |
Don’t add a service-role key. Nothing here needs one.

**STEP 14 — Deploy.** Deploy, and wait for the build log to print `Built dist/ (… public seed …)`.

**STEP 15 — Production URLs.** If the final domain differs from the one used above, update Supabase Site URL and Redirect URLs, the Google and GitHub OAuth app URLs, and `SITE_URL` in Vercel. Then redeploy.

**STEP 16 — Test Google login.** A new account lands on “Welcome to your Brain.” Sign out and in again, and you should go straight to your Brain.
**STEP 17 — Test GitHub login.** Same flow. Your avatar appears in the account button.
**STEP 18 — Test email login.** Request a link, open it on a different device, and it should sign you in there.
**STEP 19 — Test Brain creation.** Supabase → Table Editor → `profiles` and `brains` each have a row for the new user.
**STEP 20 — Test persistence.** Connect Claude → import an export → reload → the same nodes load from the database. `sync_history` has a completed row.
**STEP 21 — Test user isolation.** Sign in as a second user in a private window: an empty brain. In SQL Editor, run `select count(*) from knowledge_nodes` as `authenticated` with the second user’s id in `request.jwt.claims`: 0. Or run `npm test`, which does exactly this.
**STEP 22 — Test logout/login persistence.** Sign out → landing. Sign in → the same brain. Leave a tab idle for over an hour and reload: still signed in, because the session refreshes silently.
**STEP 23 — Test the production WebGL experience.** Intro plays, all five views morph (keys 1–5), search, filters, time slider, opening and closing a neuron. DevTools console: no errors, no CSP violations.
**STEP 24 — Test mobile.** Phone: bottom chips and view switcher, bottom-sheet panels, pinch to zoom, the auth card as a bottom sheet.

## Custom domain

Not needed for the first deploy: `your-project.vercel.app` works as is. Later: Vercel → Project → Settings → Domains → Add domain → follow the DNS instructions. Then update `SITE_URL`, Supabase Site URL and Redirect URLs, and the Google and GitHub OAuth app URLs to the new domain, and redeploy.

## Production checklist

- **Auth:** new and returning Google user, GitHub user, email user, logout, login again, expired session (silent refresh; after refresh-token expiry you land on sign-in with “Your session has ended”), invalid link (“We couldn’t authenticate your account.”).
- **Database:** brain created on first visit, loaded on return, nodes and connections created by import, persisted across devices, “Delete imported data” and “Delete brain” work (two-step confirm).
- **Security:** RLS tests pass; network tab shows no Supabase keys or tokens, and cookies are `HttpOnly; SameSite=Lax; Secure`; `/api` errors show plain sentences only.
- **Visualization:** no console errors under CSP; all views, labels, panel, search.
- **Responsive:** 390px phone, tablet, laptop, 1440px and up to 32″ displays.

## Next: Claude through MCP

Today there’s no official way for an app to read someone’s past claude.ai conversations, so history comes in by export. What an official integration can do is add knowledge going forward. The plan:

1. **A remote MCP server for MY AI BRAIN** (a Vercel function at `/api/mcp`, streamable HTTP) with tools such as `remember(title, summary, topics, learned, created)`, `link(a, b)` and `search_brain(query)`. When the person uses Claude with the connector enabled, Claude can save what a conversation produced and look up what the Brain already knows.
2. **Authorization per the MCP spec** (OAuth 2.1). Supabase Auth becomes the authorization server, so the MCP server acts as the signed-in user and RLS keeps applying. No new trust model.
3. **The same path as imports.** The tools call `store.upsertNodes` through a new `mcp` provider in `providers.js` (`capabilities.connect: true`), write `sync_history`, and set `ai_sources.status = 'connected'`. The Brain, the schema and the renderer don’t change.

MCP gives Claude access to the Brain during new conversations. It does not give the Brain access to Claude’s history.

## Next: 24-hour sync

The pieces are in place: `ai_sources.next_sync_at`, `sync_history`, incremental upserts, and `provider.sync()`. What’s missing is a provider that can pull. When one exists (an MCP connector’s queued events, or an official history API):

1. Implement `sync(ctx)` for it: fetch items changed since `last_synced_at` → `normalize()` → group → `Importer.merge` against the stored graph → `upsertNodes` for changed nodes only.
2. Add a Vercel Cron (`vercel.json → crons`, daily) hitting `/api/cron/sync`, protected by `CRON_SECRET`, that processes sources whose `next_sync_at` has passed. Running without a user session, it needs per-user delegated tokens (from the provider’s OAuth), not the service-role key.
3. Set `next_sync_at = now() + 1 day` only for sources that can actually pull. Export-based sources stay manual, and the UI says so.

## Known limitations

- Claude and ChatGPT history comes in by export only (see above). Nothing is scraped, and no passwords are collected.
- The magic link uses Supabase’s built-in email until you configure SMTP (low hourly limit).
- Offline grouping labels are vocabulary (“Agent · Prompt”); the Claude pass (`npm run import -- --llm`, local CLI) gives better names and learnings.
- The anonymous brain lives in localStorage. Signing in offers to bring it into the account. Supabase anonymous sign-ins can later make it server-side (`auth.jwt()->>'is_anonymous'`); the schema needs no change.
- Tested here against Supabase’s real Postgres and PostgREST images with a GoTrue stand-in, because Docker Hub rate limits blocked pulling GoTrue. Google and GitHub OAuth are untested until they run against your OAuth apps.
