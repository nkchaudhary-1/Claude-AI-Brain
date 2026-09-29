// Synthetic claude.ai export in the real conversations.json shape, for tests only.
// None of this is Neelesh's data; it never loads in the app outside tests.
const topics = {
  figma: [
    ["Figma auto layout for cards", "How do I make a card in Figma with auto layout so padding stays fixed when the text grows?"],
    ["Figma auto layout nesting", "My nested auto layout frames in Figma collapse when I hide a layer. How should I structure the auto layout?"],
    ["Figma variables for spacing", "Can Figma variables drive auto layout spacing and padding across modes?"],
    ["Figma component properties", "What is the difference between Figma component properties and variants for a button component?"],
    ["Figma auto layout wrap", "How does wrap work in Figma auto layout for a chip group component?"],
    ["Figma variants cleanup", "I have 200 Figma variants for one component. How do I reduce them with component properties and auto layout?"],
  ],
  tokens: [
    ["Design tokens naming", "How should I name design tokens for colour and spacing in a design system, primitive vs semantic tokens?"],
    ["Semantic colour tokens", "Help me map primitive colour tokens to semantic tokens for dark mode in our design system."],
    ["Token pipeline to code", "What's a good pipeline to export design tokens from the design system to CSS variables?"],
    ["Spacing scale tokens", "Should the design system spacing tokens be a 4pt or 8pt scale? Semantic spacing tokens too?"],
    ["Typography tokens", "How do I structure typography tokens in a design system so the type scale stays consistent?"],
  ],
  agents: [
    ["Prompt for research agent", "Write a system prompt for a Claude research agent that uses tools and cites sources."],
    ["Agent tool design", "How should I design tools for a Claude agent so the agent picks the right tool? Prompt tips?"],
    ["MCP server for Notion", "Can a Claude agent use an MCP server to read my Notion database? How do agents call MCP tools?"],
    ["Agent memory patterns", "What memory patterns work for long running Claude agents? Prompt caching for the agent?"],
    ["Prompt evaluation", "How do I evaluate prompt changes for my Claude agent with a small eval set?"],
    ["n8n automation with Claude", "Build an n8n automation where a Claude agent triages my email with a prompt."],
  ],
  webgl: [
    ["WebGL points blending", "My WebGL points look washed out with additive blending. How do I fix the shader?"],
    ["WebGL shader precision bug", "Fragment shader compile error in WebGL on iOS, precision mediump issue. Fix the shader?"],
    ["WebGL picking performance", "Picking thousands of WebGL points on pointer move is slow. Faster picking than O(n)?"],
    ["WebGL camera tween", "Smooth camera tween in raw WebGL without three.js, easing and orbit controls."],
  ],
  career: [
    ["Resume for lead designer", "Rewrite my resume summary for a lead product designer role, portfolio link at top."],
    ["Portfolio case study structure", "How should I structure a portfolio case study for a lead designer interview?"],
    ["Interview prep lead designer", "Prep me for a lead product designer interview, portfolio walkthrough and design critique."],
  ],
};
const loner = [["Recipe scaling", "Scale a banana bread recipe from one loaf to three loaves."]];

let n = 0;
const day = (d) => new Date(Date.UTC(2026, 2, 1) + d * 864e5).toISOString();
function conv([name, ask], d) {
  const i = ++n, id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  return {
    uuid: id, name, created_at: day(d), updated_at: day(d + 1),
    account: { uuid: "fixture-account" },
    chat_messages: [
      { uuid: id + "-h", text: ask, content: [{ type: "text", text: ask }], sender: "human", created_at: day(d) },
      { uuid: id + "-a", text: "", content: [{ type: "text", text: "Fixture reply." }], sender: "assistant", created_at: day(d) },
      { uuid: id + "-h2", text: "Thanks, one more follow-up on that.", content: [], sender: "human", created_at: day(d) },
    ],
  };
}
export const TOPIC_TITLES = Object.fromEntries(Object.entries(topics).map(([k, list]) => [k, list.map(([t]) => t)]));
export function makeExport() {
  n = 0;
  const out = [];
  let d = 0;
  // Interleave topics over time the way real history is.
  const lists = Object.values(topics).map((l) => [...l]);
  while (lists.some((l) => l.length)) for (const l of lists) if (l.length) out.push(conv(l.shift(), (d += 5)));
  loner.forEach((c) => out.push(conv(c, (d += 3))));
  out.push({ uuid: "empty-conversation", name: "", created_at: day(1), updated_at: day(1), chat_messages: [] });
  return out;
}
