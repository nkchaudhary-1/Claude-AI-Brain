-- MY AI BRAIN: schema, row level security and first-login setup.
-- Run once per Supabase project (SQL editor, or `supabase db push`). Safe to re-run: every
-- statement is idempotent.
--
-- Ownership chain enforced in the database, never in the client:
--   auth.users.id → brains.user_id → {knowledge_nodes, connections, ai_sources, sync_history}.brain_id
-- Connections also carry brain_id on both endpoints through composite foreign keys, so a
-- connection can never join nodes from two different brains, even ones the same user owns.


-- ─── tables ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  email        text,
  display_name text check (char_length(display_name) <= 120),
  avatar_url   text check (char_length(avatar_url) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.brains (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null default 'My AI Brain' check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One brain per account for now. Drop this index to allow several.
create unique index if not exists brains_one_per_user on public.brains (user_id);

create table if not exists public.ai_sources (
  id             uuid primary key default gen_random_uuid(),
  brain_id       uuid not null references public.brains (id) on delete cascade,
  provider       text not null check (provider in ('claude', 'chatgpt', 'import')),
  status         text not null default 'not_connected' check (status in ('not_connected', 'connected', 'syncing', 'error')),
  last_synced_at timestamptz,
  next_sync_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (brain_id, provider)
);

create table if not exists public.knowledge_nodes (
  id          uuid primary key default gen_random_uuid(),
  brain_id    uuid not null references public.brains (id) on delete cascade,
  -- stable key from the importer or brain.json ("s-ds", "imp-auto-layout-figma"); re-imports merge on it
  node_key    text not null check (node_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$'),
  title       text not null check (char_length(title) between 1 and 200),
  category    text not null check (category in ('design', 'ai', 'product', 'dev', 'research', 'ideas')),
  description text not null default '' check (char_length(description) <= 4000),
  importance  smallint not null default 2 check (importance between 1 and 5),
  activity    real not null default 0 check (activity between 0 and 1),
  -- type, status, visibility, domains, learned, created, insights, skills, conversations, first_seen, last_seen
  metadata    jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 262144),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (brain_id, node_key),
  unique (id, brain_id)
);

create table if not exists public.connections (
  id                uuid primary key default gen_random_uuid(),
  brain_id          uuid not null references public.brains (id) on delete cascade,
  source_node_id    uuid not null,
  target_node_id    uuid not null,
  strength          real not null default 0.5 check (strength between 0 and 1),
  relationship_type text not null default 'related' check (char_length(relationship_type) <= 40),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (source_node_id <> target_node_id),
  unique (brain_id, source_node_id, target_node_id),
  foreign key (source_node_id, brain_id) references public.knowledge_nodes (id, brain_id) on delete cascade,
  foreign key (target_node_id, brain_id) references public.knowledge_nodes (id, brain_id) on delete cascade
);

create table if not exists public.sync_history (
  id                  uuid primary key default gen_random_uuid(),
  brain_id            uuid not null references public.brains (id) on delete cascade,
  provider            text not null check (provider in ('claude', 'chatgpt', 'import')),
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  status              text not null default 'running' check (status in ('running', 'completed', 'failed')),
  items_processed     integer not null default 0 check (items_processed >= 0),
  nodes_created       integer not null default 0 check (nodes_created >= 0),
  connections_created integer not null default 0 check (connections_created >= 0),
  error_message       text check (char_length(error_message) <= 500)
);

-- ─── indexes for the queries the app makes ────────────────────────────────

create index if not exists knowledge_nodes_brain_idx       on public.knowledge_nodes (brain_id);
create index if not exists knowledge_nodes_brain_category  on public.knowledge_nodes (brain_id, category);
create index if not exists knowledge_nodes_brain_updated   on public.knowledge_nodes (brain_id, updated_at desc);
create index if not exists connections_brain_idx           on public.connections (brain_id);
create index if not exists connections_source_idx          on public.connections (source_node_id);
create index if not exists connections_target_idx          on public.connections (target_node_id);
create index if not exists ai_sources_brain_idx            on public.ai_sources (brain_id);
create index if not exists sync_history_brain_started      on public.sync_history (brain_id, started_at desc);

-- ─── updated_at ───────────────────────────────────────────────────────────

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['profiles', 'brains', 'ai_sources', 'knowledge_nodes', 'connections'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ─── row level security ───────────────────────────────────────────────────
-- Every table: RLS on, no access for anon, and authenticated users only reach rows
-- whose brain they own. (select auth.uid()) is evaluated once per statement.

alter table public.profiles        enable row level security;
alter table public.brains          enable row level security;
alter table public.ai_sources      enable row level security;
alter table public.knowledge_nodes enable row level security;
alter table public.connections     enable row level security;
alter table public.sync_history    enable row level security;

revoke all on public.profiles, public.brains, public.ai_sources, public.knowledge_nodes, public.connections, public.sync_history from anon;

-- True when the signed-in user owns the brain. security definer so policies on child tables
-- don't recurse through brains' own policy; it only ever answers for the caller's own uid.
create or replace function public.owns_brain(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.brains b where b.id = bid and b.user_id = (select auth.uid()))
$$;
revoke all on function public.owns_brain(uuid) from public, anon;
grant execute on function public.owns_brain(uuid) to authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own brain" on public.brains;
create policy "own brain" on public.brains for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own sources" on public.ai_sources;
create policy "own sources" on public.ai_sources for all to authenticated
  using (public.owns_brain(brain_id)) with check (public.owns_brain(brain_id));

drop policy if exists "own nodes" on public.knowledge_nodes;
create policy "own nodes" on public.knowledge_nodes for all to authenticated
  using (public.owns_brain(brain_id)) with check (public.owns_brain(brain_id));

drop policy if exists "own connections" on public.connections;
create policy "own connections" on public.connections for all to authenticated
  using (public.owns_brain(brain_id)) with check (public.owns_brain(brain_id));

drop policy if exists "own sync history" on public.sync_history;
create policy "own sync history" on public.sync_history for all to authenticated
  using (public.owns_brain(brain_id)) with check (public.owns_brain(brain_id));

-- ─── first login: profile + empty brain ───────────────────────────────────
-- Runs inside Supabase Auth's insert. The API also calls ensure logic, so accounts created
-- before this trigger existed still get a brain.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'user_name'), 120),
    left(new.raw_user_meta_data ->> 'avatar_url', 1000)
  )
  on conflict (user_id) do nothing;
  insert into public.brains (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
