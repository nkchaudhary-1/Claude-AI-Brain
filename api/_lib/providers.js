// AI provider abstraction. Each provider declares what it can actually do, so the UI never offers
// a button that can't work and the backend never pretends to sync.
//
//   connect()     start an authorised link (OAuth / MCP) — only where an official mechanism exists
//   disconnect()  forget the link and any stored grant
//   getStatus()   status row for the UI
//   sync()        pull new or changed items since last_synced_at (scheduled jobs call this later)
//   normalize()   provider format → conversations
//   process()     conversations → knowledge nodes (grouping) → Importer.merge → upsert
//
// Today neither Claude nor ChatGPT exposes an official API for reading a person's consumer
// conversation history, so both are export-based: the person downloads their export and imports
// it. normalize() and process() run in the browser (src/importer/core.js), so full conversation
// text never reaches this server; only the derived knowledge is stored.

export class NotAvailable extends Error {
  constructor(provider, message) { super(message); this.provider = provider; this.code = "not_available"; }
}

const exportProvider = (id, label, howTo, format) => ({
  id, label, kind: "export",
  capabilities: { connect: false, sync: false, import: true, schedule: false },
  guidance: {
    why: `${label} doesn’t offer an official way for apps to read your conversation history, so there’s nothing to sign in to here. Your data export is the supported route, and it’s processed in your browser.`,
    steps: howTo, file: "conversations.json", format,
  },
  async connect() { throw new NotAvailable(id, `${label} has no official history API. Import your ${label} export instead.`); },
  async disconnect(ctx) { return ctx.resetSource(id); },
  async getStatus(ctx) { return ctx.sourceRow(id); },
  async sync() { throw new NotAvailable(id, `There’s nothing to pull automatically from ${label}. Import a newer export to add what’s new.`); },
});

export const PROVIDERS = {
  claude: exportProvider("claude", "Claude", ["claude.ai → Settings → Privacy → Export data", "Open the email link and download the zip", "Unzip it and import conversations.json"], "claude"),
  chatgpt: exportProvider("chatgpt", "ChatGPT", ["chatgpt.com → Settings → Data controls → Export data", "Open the email link and download the zip", "Unzip it and import conversations.json"], "chatgpt"),
  import: {
    id: "import", label: "Import", kind: "file",
    capabilities: { connect: false, sync: false, import: true, schedule: false },
    guidance: { why: "Bring in a brain.json or an AI export. Grouping runs in your browser.", steps: [], file: ".json" },
    async connect() { throw new NotAvailable("import", "Imports don’t need connecting."); },
    async disconnect(ctx) { return ctx.resetSource("import"); },
    async getStatus(ctx) { return ctx.sourceRow("import"); },
    async sync() { throw new NotAvailable("import", "Import a file to add knowledge."); },
  },
};

export function describe(provider, row) {
  return {
    provider: provider.id, label: provider.label, kind: provider.kind, capabilities: provider.capabilities, guidance: provider.guidance,
    status: row ? row.status : "not_connected", lastSyncedAt: row ? row.last_synced_at : null, nextSyncAt: row ? row.next_sync_at : null,
  };
}
