// Brain persistence. Every call uses the signed-in user's Supabase client, so row level
// security applies to all of it; brain_id is still passed explicitly so queries stay indexed.
import { brainPayload, PROVIDERS } from "./model.js";

const PAGE = 1000; // PostgREST's default max rows per request on Supabase

async function all(query) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** First visit: make sure the profile and brain exist (the signup trigger normally did this). */
export async function ensureBrain(sb, user) {
  const meta = user.user_metadata || {};
  let { data: profile, error: pe } = await sb.from("profiles").select("*").maybeSingle();
  if (pe) throw pe;
  if (!profile) {
    const ins = await sb.from("profiles").insert({
      user_id: user.id, email: user.email || null,
      display_name: (meta.full_name || meta.name || meta.user_name || "").slice(0, 120) || null,
      avatar_url: typeof meta.avatar_url === "string" ? meta.avatar_url.slice(0, 1000) : null,
    }).select("*").single();
    if (ins.error && ins.error.code !== "23505") throw ins.error;
    profile = ins.data || (await sb.from("profiles").select("*").single()).data;
  }
  let { data: brain, error: be } = await sb.from("brains").select("*").maybeSingle();
  if (be) throw be;
  if (!brain) {
    const ins = await sb.from("brains").insert({ user_id: user.id }).select("*").single();
    if (ins.error && ins.error.code !== "23505") throw ins.error;   // a parallel request won the race
    brain = ins.data || (await sb.from("brains").select("*").single()).data;
  }
  return { brain, profile };
}

export async function loadBrain(sb, user) {
  const { brain, profile } = await ensureBrain(sb, user);
  const [nodes, connections, sources, history] = await Promise.all([
    all(() => sb.from("knowledge_nodes").select("id,node_key,title,category,description,importance,activity,metadata,created_at,updated_at").eq("brain_id", brain.id).order("created_at")),
    all(() => sb.from("connections").select("source_node_id,target_node_id,strength,relationship_type").eq("brain_id", brain.id)),
    sb.from("ai_sources").select("provider,status,last_synced_at,next_sync_at").eq("brain_id", brain.id).then(({ data, error }) => { if (error) throw error; return data; }),
    sb.from("sync_history").select("id,provider,started_at,completed_at,status,items_processed,nodes_created,connections_created").eq("brain_id", brain.id).order("started_at", { ascending: false }).limit(10)
      .then(({ data, error }) => { if (error) throw error; return data; }),
  ]);
  return brainPayload({ brain, profile, nodes, connections, sources, history });
}

/** Incremental write: upserts only the nodes it is given, then their connections. */
export async function upsertNodes(sb, brainId, cleaned) {
  const keys = cleaned.map((c) => c.row.node_key);
  const existing = new Set();
  for (const part of chunks(keys, 100)) {
    const { data, error } = await sb.from("knowledge_nodes").select("node_key").eq("brain_id", brainId).in("node_key", part);
    if (error) throw error;
    data.forEach((r) => existing.add(r.node_key));
  }
  const rows = cleaned.map((c) => ({ ...c.row, brain_id: brainId }));
  const { error } = await sb.from("knowledge_nodes").upsert(rows, { onConflict: "brain_id,node_key" });
  if (error) throw error;
  const created = keys.filter((k) => !existing.has(k)).length;

  // connections: resolve keys to row ids (targets may have arrived in an earlier batch)
  const wanted = new Set(keys);cleaned.forEach((c) => c.connections.forEach((k) => wanted.add(k)));
  const idOf = new Map();
  for (const part of chunks([...wanted], 100)) {
    const { data, error: e } = await sb.from("knowledge_nodes").select("id,node_key,importance").eq("brain_id", brainId).in("node_key", part);
    if (e) throw e;
    data.forEach((r) => idOf.set(r.node_key, r));
  }
  const pairs = new Map();
  for (const c of cleaned) for (const k of c.connections) {
    const a = idOf.get(c.row.node_key), b = idOf.get(k);
    if (!a || !b) continue;   // the other end arrives in a later batch and links back then
    const [s, t] = a.id < b.id ? [a, b] : [b, a];
    pairs.set(s.id + t.id, { brain_id: brainId, source_node_id: s.id, target_node_id: t.id, strength: +((s.importance + t.importance) / 10).toFixed(2), relationship_type: "related" });
  }
  let connectionsCreated = 0;
  for (const part of chunks([...pairs.values()], 500)) {
    const { data, error: e } = await sb.from("connections").upsert(part, { onConflict: "brain_id,source_node_id,target_node_id", ignoreDuplicates: true }).select("id");
    if (e) throw e;
    connectionsCreated += data.length;
  }
  return { created, updated: keys.length - created, connectionsCreated };
}

export async function startSync(sb, brainId, provider) {
  if (!PROVIDERS.includes(provider)) throw Object.assign(new Error("unknown provider"), { status: 400 });
  await sb.from("ai_sources").upsert({ brain_id: brainId, provider, status: "syncing" }, { onConflict: "brain_id,provider" }).throwOnError();
  const { data } = await sb.from("sync_history").insert({ brain_id: brainId, provider }).select("id").single().throwOnError();
  return data.id;
}
export async function addToSync(sb, syncId, { items, nodes, connections }) {
  const { data } = await sb.from("sync_history").select("items_processed,nodes_created,connections_created,status").eq("id", syncId).single().throwOnError();
  if (data.status !== "running") throw Object.assign(new Error("sync already finished"), { status: 409 });
  await sb.from("sync_history").update({ items_processed: data.items_processed + items, nodes_created: data.nodes_created + nodes, connections_created: data.connections_created + connections }).eq("id", syncId).throwOnError();
}
export async function finishSync(sb, brainId, syncId, { ok, error }) {
  const { data } = await sb.from("sync_history").update({ status: ok ? "completed" : "failed", completed_at: new Date().toISOString(), error_message: ok ? null : String(error || "Import failed").slice(0, 500) })
    .eq("id", syncId).eq("status", "running").select("provider").single().throwOnError();
  // Export-based sources have no schedule: next_sync_at stays empty rather than promising a sync that can't happen.
  await sb.from("ai_sources").update({ status: ok ? "connected" : "error", ...(ok ? { last_synced_at: new Date().toISOString() } : {}), next_sync_at: null })
    .eq("brain_id", brainId).eq("provider", data.provider).throwOnError();
}

export async function deleteData(sb, brainId) {
  await sb.from("knowledge_nodes").delete().eq("brain_id", brainId).throwOnError();   // connections cascade
  await sb.from("sync_history").delete().eq("brain_id", brainId).throwOnError();
  await sb.from("ai_sources").delete().eq("brain_id", brainId).throwOnError();
}
export async function deleteBrain(sb, brainId) {
  await sb.from("brains").delete().eq("id", brainId).throwOnError();   // everything cascades; the next visit starts a fresh one
}
