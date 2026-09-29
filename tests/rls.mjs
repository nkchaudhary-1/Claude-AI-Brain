// Row level security tests: node tests/rls.mjs
// Runs the real migration in PGlite (Postgres compiled to WASM) with Supabase's auth schema,
// roles and default grants stubbed, then tries to reach another user's data every way we can.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const db = new PGlite();
let failures = 0;
const ok = (name) => console.log(`✓ ${name}`);
const bad = (name, why) => { failures++; console.log(`✗ ${name}\n    ${why}`); };
async function expect(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e.message); } }
async function denied(name, sql, params, pattern = /row-level security|permission denied|violates foreign key/) {
  try { await db.query(sql, params); bad(name, "statement succeeded"); }
  catch (e) { pattern.test(e.message) ? ok(name) : bad(name, `unexpected error: ${e.message}`); }
}

// ── Supabase-shaped environment ────────────────────────────────────────────
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase grants table privileges to both API roles by default; RLS is what actually protects rows.
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
for (const f of (await readdir(root + "supabase/migrations")).sort()) await db.exec(await readFile(root + "supabase/migrations/" + f, "utf8"));

const as = async (uid) => { await db.exec("reset role"); if (uid === "anon") { await db.exec("set role anon; set request.jwt.claim.sub = ''"); return; }
  if (uid) await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}'`); };
const one = async (sql, params) => (await db.query(sql, params)).rows;

// ── signup ────────────────────────────────────────────────────────────────
await as(null);
const [A] = await one(`insert into auth.users (email, raw_user_meta_data) values ('a@example.com', '{"full_name":"Ada"}') returning id`);
const [B] = await one(`insert into auth.users (email) values ('b@example.com') returning id`);
await expect("signup creates a profile and one empty brain per user", async () => {
  const p = await one("select user_id, display_name from public.profiles order by email");
  const b = await one("select user_id from public.brains");
  if (p.length !== 2 || b.length !== 2 || p[0].display_name !== "Ada") throw new Error(JSON.stringify({ p, b }));
});
const brainA = (await one("select id from public.brains where user_id = $1", [A.id]))[0].id;
const brainB = (await one("select id from public.brains where user_id = $1", [B.id]))[0].id;

// ── user A builds a little brain ──────────────────────────────────────────
await as(A.id);
const [n1] = await one(`insert into public.knowledge_nodes (brain_id, node_key, title, category) values ($1, 's-ds', 'Design Systems', 'design') returning id`, [brainA]);
const [n2] = await one(`insert into public.knowledge_nodes (brain_id, node_key, title, category) values ($1, 's-tokens', 'Design Tokens', 'design') returning id`, [brainA]);
await one(`insert into public.connections (brain_id, source_node_id, target_node_id) values ($1, $2, $3)`, [brainA, n1.id, n2.id]);
await one(`insert into public.ai_sources (brain_id, provider) values ($1, 'import')`, [brainA]);
await one(`insert into public.sync_history (brain_id, provider) values ($1, 'import')`, [brainA]);
await expect("owner reads their own brain, nodes and connections", async () => {
  const counts = await one(`select (select count(*) from public.brains)::int b, (select count(*) from public.knowledge_nodes)::int n, (select count(*) from public.connections)::int c`);
  if (counts[0].b !== 1 || counts[0].n !== 2 || counts[0].c !== 1) throw new Error(JSON.stringify(counts));
});

// ── user B tries everything ───────────────────────────────────────────────
await as(B.id);
await expect("B sees only B's brain and none of A's rows", async () => {
  const r = await one(`select (select count(*) from public.brains)::int brains, (select count(*) from public.brains where id = $1)::int a_brain,
    (select count(*) from public.knowledge_nodes)::int nodes, (select count(*) from public.connections)::int conns,
    (select count(*) from public.ai_sources)::int sources, (select count(*) from public.sync_history)::int history,
    (select count(*) from public.profiles)::int profiles`, [brainA]);
  const x = r[0]; if (x.brains !== 1 || x.a_brain || x.nodes || x.conns || x.sources || x.history || x.profiles !== 1) throw new Error(JSON.stringify(x));
});
await expect("B cannot update or delete A's nodes (0 rows affected)", async () => {
  const u = await db.query(`update public.knowledge_nodes set title = 'owned' where id = $1`, [n1.id]);
  const d = await db.query(`delete from public.knowledge_nodes where brain_id = $1`, [brainA]);
  const d2 = await db.query(`delete from public.brains where id = $1`, [brainA]);
  if (u.affectedRows || d.affectedRows || d2.affectedRows) throw new Error(`affected ${u.affectedRows}/${d.affectedRows}/${d2.affectedRows}`);
});
await denied("B cannot insert a node into A's brain", `insert into public.knowledge_nodes (brain_id, node_key, title, category) values ($1, 'x', 'x', 'ai')`, [brainA]);
await denied("B cannot add an AI source or sync record to A's brain", `insert into public.ai_sources (brain_id, provider) values ($1, 'claude')`, [brainA]);
await denied("B cannot write sync history into A's brain", `insert into public.sync_history (brain_id, provider) values ($1, 'import')`, [brainA]);
await denied("B cannot connect A's nodes from B's own brain", `insert into public.connections (brain_id, source_node_id, target_node_id) values ($1, $2, $3)`, [brainB, n1.id, n2.id]);
await denied("B cannot hand their brain to A", `update public.brains set user_id = $1 where id = $2`, [A.id, brainB]);
await denied("B cannot create a second brain owned by A", `insert into public.brains (user_id) values ($1)`, [A.id]);
await expect("owns_brain answers false for someone else's brain", async () => {
  const r = await one(`select public.owns_brain($1) a, public.owns_brain($2) b`, [brainA, brainB]);
  if (r[0].a !== false || r[0].b !== true) throw new Error(JSON.stringify(r));
});

// ── anonymous API role ────────────────────────────────────────────────────
await as("anon");
for (const t of ["profiles", "brains", "knowledge_nodes", "connections", "ai_sources", "sync_history"])
  await denied(`anon has no access to ${t}`, `select * from public.${t}`, [], /permission denied/);

// ── deletion ──────────────────────────────────────────────────────────────
await as(A.id);
await expect("deleting a brain removes its nodes, connections, sources and history", async () => {
  await db.query(`delete from public.brains where id = $1`, [brainA]);
  await as(null);
  const r = await one(`select (select count(*) from public.knowledge_nodes where brain_id = $1)::int n, (select count(*) from public.connections where brain_id = $1)::int c,
    (select count(*) from public.ai_sources where brain_id = $1)::int s, (select count(*) from public.sync_history where brain_id = $1)::int h`, [brainA]);
  if (r[0].n || r[0].c || r[0].s || r[0].h) throw new Error(JSON.stringify(r));
});
await expect("deleting a user removes their profile and brain", async () => {
  await db.query(`delete from auth.users where id = $1`, [B.id]);
  const r = await one(`select (select count(*) from public.profiles where user_id = $1)::int p, (select count(*) from public.brains where user_id = $1)::int b`, [B.id]);
  if (r[0].p || r[0].b) throw new Error(JSON.stringify(r));
});
await expect("the migration is safe to run twice", async () => {
  for (const f of (await readdir(root + "supabase/migrations")).sort()) await db.exec(await readFile(root + "supabase/migrations/" + f, "utf8"));
});

console.log(failures ? `\n${failures} RLS test(s) failed.` : "\nRLS tests passed.");
process.exit(failures ? 1 : 0);
