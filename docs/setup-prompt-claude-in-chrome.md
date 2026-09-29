Paste everything below the line into the Claude in Chrome side panel.

---

Set up and deploy my app "My AI Brain" to production. I'm already signed in to GitHub, Supabase, Vercel and Google Cloud in this browser. Work through the phases in order. Stop and ask me before anything that costs money, anything that needs a decision I haven't given you, or if a page looks different from what's described.

Security rules. Follow them throughout:
- Never use or copy a Supabase `service_role` key or a `sb_secret_…` key. The app doesn't need one.
- Paste OAuth client secrets only into the matching Supabase provider field. Don't put them anywhere else: not in Vercel, GitHub, notes, or your replies to me.
- Don't commit anything to the repository.

Names used below:
- REPO = github.com/nkchaudhary-1/Claude-AI-Brain
- BRANCH = claude/serene-knuth-myozhz
- APP = the production URL Vercel gives the project, e.g. https://my-ai-brain.vercel.app. You find it out in phase 3.
- REF = the Supabase project ref, i.e. the `xxxx` in https://xxxx.supabase.co

## Phase 0 — Get the code onto the default branch
1. Open REPO. If BRANCH isn't already merged into the default branch, open a pull request from BRANCH into the default branch and merge it with a merge commit. Ask me first if GitHub shows conflicts.

## Phase 1 — Supabase project
2. Go to supabase.com/dashboard. Create a new project named "my-ai-brain" on the Free plan, in the region closest to India (Mumbai / ap-south-1 if available). Generate a strong database password and tell me to save it. The app never uses it. Wait until the project is ready.
3. Write down REF and the Project URL (https://REF.supabase.co).
4. Open REPO → supabase/migrations/20260929000000_brain_schema.sql → copy the raw file. In Supabase, go to SQL Editor → New query, paste the file and click Run. It must succeed with no errors. If Supabase warns about destructive operations, it's safe to confirm: the script is idempotent.
5. Check the result:
   - Table Editor lists profiles, brains, ai_sources, knowledge_nodes, connections and sync_history, each with RLS enabled.
   - Database → Triggers (schema: auth) lists on_auth_user_created.
6. Go to Project Settings → API Keys and copy the publishable key (sb_publishable_…). If only legacy keys exist, copy the `anon` `public` key instead. This is the only key you'll use.

## Phase 2 — Vercel project
7. Go to vercel.com/new and import REPO. If Vercel can't see the repo, grant the Vercel GitHub app access to it.
8. Configure the project:
   - Project name: my-ai-brain
   - Framework Preset: Other
   - Root directory: ./
   - Leave the build and output settings alone (vercel.json sets them).
9. Add these environment variables before deploying:
   - SUPABASE_URL = https://REF.supabase.co
   - SUPABASE_ANON_KEY = the publishable/anon key from step 6
   - SITE_URL = https://my-ai-brain.vercel.app (your best guess for now; it gets corrected in step 11)
10. Click Deploy and wait. The build log should include a line starting "Built dist/ (" that mentions "public seed". If the build fails, copy the error and stop.

## Phase 3 — Confirm the production URL
11. Open the project's Domains page. Take the production domain as APP; it may have a suffix if the name was taken. If APP differs from SITE_URL:
    1. Update SITE_URL to APP (Settings → Environment Variables).
    2. Redeploy the latest production deployment.

## Phase 4 — Google sign-in
12. Go to console.cloud.google.com. Create or select a project named "My AI Brain".
13. Open Google Auth Platform (APIs & Services → OAuth consent screen) and configure:
    - Branding: app name "My AI Brain", support email = my email, developer contact = my email. Authorized domain: vercel.app is fine for now, or skip it if not required.
    - Audience: External. Publish the app ("In production"). It only uses email, profile and openid, so no verification is needed.
    - Data access: scopes email, profile, openid.
14. Go to Clients → Create client → Web application, named "My AI Brain web":
    - Authorized JavaScript origins: APP and http://localhost:5173
    - Authorized redirect URIs: https://REF.supabase.co/auth/v1/callback
    Create it, then keep the Client ID and Client secret on screen for step 17.

## Phase 5 — GitHub sign-in
15. Go to github.com/settings/applications/new and register the app:
    - Application name: My AI Brain
    - Homepage URL: APP
    - Authorization callback URL: https://REF.supabase.co/auth/v1/callback
    - Device flow: off
16. Generate a new client secret. Keep the Client ID and secret on screen for step 17.

## Phase 6 — Supabase auth settings
17. Go to Supabase → Authentication → Sign In / Providers:
    - Google: enable, then paste the Client ID and Client secret from step 14. Save.
    - GitHub: enable, then paste the Client ID and secret from step 16. Save.
    - Email: enabled, with "Confirm email" on.
18. Go to Authentication → URL Configuration:
    - Site URL: APP
    - Redirect URLs: add all four:
      - APP/api/auth/callback
      - APP/api/auth/confirm
      - http://localhost:5173/api/auth/callback
      - http://localhost:5173/api/auth/confirm
19. Go to Authentication → Emails → Templates → Magic Link:
    - Subject: Your MY AI BRAIN sign-in link
    - Body: replace it entirely with this, then save:

```html
<div style="background:#000;color:#eef3fb;font-family:-apple-system,Segoe UI,sans-serif;padding:40px 28px">
  <p style="font:12px ui-monospace,Menlo,monospace;letter-spacing:.3em;text-transform:uppercase;color:#9fd4ff;margin:0 0 28px">My AI Brain</p>
  <p style="font-size:20px;font-weight:300;margin:0 0 12px">Your brain starts here.</p>
  <p style="color:#8a93a6;font-size:14px;line-height:1.6;margin:0 0 28px">Open this link to sign in. It works once and expires soon.</p>
  <p><a href="{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email" style="display:inline-block;background:#eef3fb;color:#000;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px">Open my Brain</a></p>
  <p style="color:#566074;font-size:12px;margin-top:28px">If you didn’t ask for this, you can ignore it.</p>
</div>
```

## Phase 7 — Verify
20. Open APP. The landing page should say "A visual map of everything you discover with AI."
21. Build My AI Brain → Continue with Google. You should land on "Welcome to your Brain." In Supabase Table Editor, profiles and brains should each now have 1 row.
22. Open the account menu (top-right avatar) → Sign out. Then Continue with GitHub. You should be signed in and your avatar should show.
23. Sign out. Then Continue with Email using my email address. Open the email in my inbox and click "Open my Brain". I should be signed in.
24. Open DevTools → Console on APP. Report any red errors or CSP violations.

## Report back
Report in this format:
- APP (production URL)
- REF (project ref)
- Result of each phase (done / failed + the exact error text)
- Anything you skipped or had to change

Don't include any keys or secrets in the report.
