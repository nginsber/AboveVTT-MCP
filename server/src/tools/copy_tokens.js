// Copy tokens into My Tokens: from a token on any scene, or from the Tokens tab's Monsters, Open5e Monsters,
// AboveVTT Tokens and D&D Beyond Tokens folders.
import { z } from "zod";
import { errorResult } from "../util.js";
import { logChange } from "../changelog.js";

const tab = { tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open.") };
const ok = (text) => ({ content: [{ type: "text", text }] });
const SOURCE = z.enum(["scene", "monster", "open5e", "aboveVTT", "ddbToken"]);

function hitLine(h) {
  const bits = [];
  if (h.cr) bits.push(`CR ${h.cr}`);
  if (h.books?.length) bits.push(h.books.join(", "));
  if (h.legacy) bits.push("legacy");
  if (h.owned === false) bits.push("not owned on D&D Beyond");
  if (h.folder) bits.push(h.folder);
  return `• ${h.name} [${h.id}]${bits.length ? ` — ${bits.join("; ")}` : ""}`;
}

export function register(server, bridge) {
  server.registerTool("find_tokens_to_copy", {
    title: "Find tokens to copy into My Tokens",
    description:
      "Search the Tokens tab's sources by name: Monsters (D&D Beyond monster search, using the Tokens tab's monster filters), " +
      "Open5e Monsters, AboveVTT Tokens and D&D Beyond Tokens. Returns names and ids for copy_to_my_tokens. " +
      "For tokens already on a scene use list_scene_tokens instead. Area of Effect templates can't be copied.",
    inputSchema: {
      query: z.string().describe("Name or part of a name."),
      source: z.enum(["monster", "open5e", "aboveVTT", "ddbToken"]).optional().describe("Only search this source (default: all four)."),
      ...tab,
    },
    annotations: { readOnlyHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await bridge.call("find_tokens_to_copy", p, { tabId, timeoutMs: 45000 });
      const titles = { monster: "Monsters (D&D Beyond)", open5e: "Open5e Monsters", aboveVTT: "AboveVTT Tokens", ddbToken: "D&D Beyond Tokens" };
      const lines = [`Matches for '${r.query}':`];
      for (const [s, list] of Object.entries(r.results)) {
        lines.push("", `${titles[s]} (source "${s}"): ${list.length ? "" : "none"}`);
        list.forEach((h) => lines.push(hitLine(h)));
      }
      for (const [s, e] of Object.entries(r.errors || {})) lines.push("", `${titles[s]}: couldn't search (${e})`);
      return ok(lines.join("\n"));
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("copy_to_my_tokens", {
    title: "Copy tokens into My Tokens",
    description:
      "Copy up to 25 tokens into My Tokens as custom creatures, like AboveVTT's \"Copy to My Tokens\" / \"Duplicate\", " +
      "into any My Tokens folder and under any name. Each item has a source:\n" +
      "• scene: a token already placed (name or tokenId; sceneId/sceneName, default the DM's current scene). Copies its " +
      "image(s), size, auras, vision/light and token settings — not its position, current HP, conditions or note. Its stat " +
      "block is copied (custom creature), fetched (D&D Beyond / Open5e monster), or made from its AC and max HP (plain token). " +
      "By default the copy uses the token's AC and max HP if they differ from the stat block; keepOriginalStats: true keeps the stat block's.\n" +
      "• monster (D&D Beyond) or open5e: by exact name or id (from find_tokens_to_copy). Gets an editable custom stat block " +
      "built from the monster, its image, size and senses. Monsters the user doesn't own on D&D Beyond are copied without stats.\n" +
      "• aboveVTT / ddbToken: AboveVTT Tokens / D&D Beyond Tokens by name or id (images and settings, no stats).\n" +
      "Player characters, doors/walls and Area of Effect templates can't be copied. A name already used in the folder gets a number.",
    inputSchema: {
      items: z.array(z.object({
        source: SOURCE,
        name: z.string().optional().describe("Exact name (token name on the scene, monster name, or token name in the Tokens tab)."),
        id: z.string().optional().describe("monster / open5e / aboveVTT / ddbToken: id from find_tokens_to_copy."),
        tokenId: z.string().optional().describe("scene: token id from list_scene_tokens."),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        newName: z.string().optional().describe("Name for the copy (default: the original's name)."),
        keepOriginalStats: z.boolean().optional().describe("scene: keep the stat block's AC / max HP instead of the token's."),
      })).min(1).max(25),
      folderId: z.string().optional().describe("My Tokens folder id (default: top level)."),
      folderName: z.string().optional().describe("Or: the My Tokens folder's exact name."),
      ...tab,
    },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await bridge.call("copy_to_my_tokens", p, { tabId, timeoutMs: 60000 + 30000 * p.items.length });
      const lines = [`Copied ${r.copied.length} of ${p.items.length} into ${r.folder}:`];
      for (const c of r.copied) {
        const stats = [c.ac !== undefined ? `AC ${c.ac}` : null, c.hp !== undefined ? `HP ${c.hp}${c.hitDice ? ` (${c.hitDice})` : ""}` : null, c.cr ? `CR ${c.cr}` : null, c.size].filter(Boolean).join(", ");
        lines.push(`• ${c.name} [${c.id}] ← ${c.from}${stats ? ` — ${stats}` : ""}; stat block: ${c.statBlock}${c.renamed ? ` (${c.renamed})` : ""}`);
        for (const n of c.notes || []) lines.push(`    ${n}`);
      }
      for (const f of r.failed) lines.push(`✗ ${f.item}${f.source ? ` (${f.source})` : ""}: ${f.error}`);
      if (r.copied.length) logChange(bridge, { tool: "copy_to_my_tokens", params: { ...p, tabId }, summary: lines.join("\n") });
      return r.copied.length ? ok(lines.join("\n")) : errorResult(lines.join("\n"));
    } catch (e) { return errorResult(e.message); }
  });
}
