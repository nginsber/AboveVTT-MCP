import { z } from "zod";
import { errorResult } from "../util.js";
import { logChange } from "../changelog.js";

const tab = { tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open.") };
const scene = {
  sceneId: z.string().optional().describe("Scene id from list_scenes. Leave out for the DM's current scene."),
  sceneName: z.string().optional().describe("Or: the scene's exact name. Leave out for the DM's current scene."),
};
const which = {
  tokenId: z.string().optional().describe("Token id from list_scene_tokens."),
  tokenName: z.string().optional().describe("Or: the token's exact name on that scene."),
};
const aura = z.object({ feet: z.number().optional(), color: z.string().optional() }).nullable();
const condition = z.union([
  z.string(),
  z.object({
    name: z.string().describe("Condition (e.g. Poisoned), marker (e.g. Blessed, Concentration) or marker colour (red, blue…)."),
    text: z.string().optional().describe("Label for a coloured marker."),
    duration: z.number().optional().describe("Rounds."),
  }),
]);
const ok = (text) => ({ content: [{ type: "text", text }] });

function hpText(h) {
  if (!h) return "";
  return `HP ${h.current ?? "?"}/${h.maximum ?? "?"}${h.temp ? ` +${h.temp} temp` : ""}`;
}
function line(t) {
  const bits = [t.kind];
  if (t.hp) bits.push(hpText(t.hp));
  if (t.ac !== undefined) bits.push(`AC ${t.ac}`);
  if (t.size) bits.push(t.size);
  if (t.conditions?.length) bits.push(t.conditions.join(", "));
  if (t.hidden) bits.push("hidden");
  if (t.hasNote) bits.push("📝 note");
  return `• ${t.name} [${t.id}] — ${bits.join("; ")}`;
}

export function register(server, bridge) {
  const call = (m, p, tabId) => bridge.call(m, p, { tabId });
  const log = (tool, params, text) => logChange(bridge, { tool, params, summary: text });

  server.registerTool("list_scene_tokens", {
    title: "List tokens on a scene",
    description: "List the tokens placed on a scene (the DM's current scene unless another is named): name, kind (player / monster / custom creature / token), HP, AC, size, conditions and markers, hidden, whether it has a note. Doors, walls and AoE templates are left out unless includeMapObjects is true.",
    inputSchema: { ...scene, search: z.string().optional(), includeMapObjects: z.boolean().optional(), ...tab },
    annotations: { readOnlyHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("list_scene_tokens", p, tabId);
      const lines = [`${r.scene}${r.isCurrentScene ? " (DM's current scene)" : ""}: ${r.count} token(s)`];
      r.tokens.forEach((t) => lines.push(line(t)));
      if (!r.tokens.length) lines.push(p.search ? `Nothing matches '${p.search}'.` : "(no tokens)");
      if (r.mapObjectsNotShown) lines.push(`(${r.mapObjectsNotShown} doors / walls / AoE templates not shown)`);
      return ok(lines.join("\n"));
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("get_token", {
    title: "Show a token on a scene",
    description: "Show everything about one placed token: HP, AC, conditions, size, image and other images, auras, darkvision/light, border colour, token settings, linked stat block, and its note.",
    inputSchema: { ...scene, ...which, ...tab },
    annotations: { readOnlyHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("get_token", p, tabId);
      const out = [line(r), `Scene: ${r.scene}${r.isCurrentScene ? " (DM's current scene)" : ""}`];
      out.push(`Image: ${r.image || "(none)"}`);
      if (r.otherImages?.length) out.push(`Other images: ${r.otherImages.map((u, i) => `${i + 1}. ${u}`).join("  ")}`);
      out.push(`Auras: inner ${r.aura1 || "off"}, outer ${r.aura2 || "off"} (${r.aurasVisible ? "shown" : "not shown"})`);
      out.push(`Darkvision: ${r.darkvision || "none"}; light: inner ${r.lightInner || "none"}, outer ${r.lightOuter || "none"}`);
      if (r.borderColor) out.push(`Border colour: ${r.borderColor}`);
      if (r.statBlock) out.push(`Stat block: ${r.statBlock}`);
      out.push(`Token settings: ${Object.keys(r.settings || {}).length ? JSON.stringify(r.settings) : "(defaults)"}`);
      if (r.note) out.push("", `Note "${r.note.title}" (${r.note.visibility}):`, r.note.text || "(empty)");
      return ok(out.join("\n"));
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("update_token", {
    title: "Edit a token on a scene",
    description:
      "Edit a token already placed on a scene, the way AboveVTT's token menu does. The DM's current scene updates live for everyone; another scene is updated by message and then read back to check (say so if it isn't verified). " +
      "HP: maxHp first, then hp/tempHp, then damage (temp HP soaks it first) or heal (capped at max). Conditions: the 15 standard ones, AboveVTT's markers (Concentration, Reaction Used, Flying, Burning, Rage, Blessed, Baned, Bloodied, Advantage, Disadvantage, Bardic Inspiration, Hasted) or coloured markers (red, blue, green, yellow, orange, purple, cyan, magenta, navy, grey) with your own text. " +
      "Player characters' name, HP, AC and standard conditions come from their D&D Beyond sheet and can't be set here. Use dryRun to preview.",
    inputSchema: {
      ...scene, ...which,
      name: z.string().optional(),
      ac: z.number().optional(),
      hp: z.number().optional().describe("Current HP (not counting temp HP)."),
      maxHp: z.number().optional(),
      tempHp: z.number().optional(),
      damage: z.number().optional().describe("Take this much damage (temp HP first)."),
      heal: z.number().optional().describe("Heal this much (up to max HP)."),
      addConditions: z.array(condition).optional(),
      removeConditions: z.array(condition).optional(),
      clearConditions: z.boolean().optional().describe("Remove all conditions and markers first."),
      aura1: aura.optional().describe("Inner aura { feet, color }; null turns it off."),
      aura2: aura.optional().describe("Outer aura { feet, color }; null turns it off."),
      aurasVisible: z.boolean().optional().describe("Show/hide the token's auras (turned on automatically when you set an aura)."),
      darkvisionFeet: z.number().optional(),
      lightInner: aura.optional().describe("Bright light { feet, color }; null turns it off."),
      lightOuter: aura.optional().describe("Dim light { feet, color }; null turns it off."),
      borderColor: z.string().nullable().optional(),
      image: z.string().optional().describe("New image link (public http/https). The old one is kept as an alternative."),
      useImage: z.union([z.number(), z.string()]).optional().describe("Or: switch to one of the token's other images (number from get_token, or its link)."),
      size: z.union([z.enum(["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]), z.number()]).optional().describe("Size name or number of squares."),
      settings: z.record(z.string(), z.any()).optional().describe("Token settings, keys as in list_settings group tokenDefaults (e.g. { \"hidden\": true, \"revealname\": true, \"tokenStyleSelect\": \"Square\" }); null turns one off."),
      dryRun: z.boolean().optional(),
      ...tab,
    },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("update_token", p, tabId);
      const head = r.dryRun ? `Would change (nothing changed yet) '${r.before.name}' on ${r.scene}: ${r.changed.join(", ")}` : r.changed.length ? `Updated '${r.token}' on ${r.scene} (${r.changed.join(", ")})${r.isCurrentScene ? "" : r.verified ? " — checked: saved on that scene" : " — NOT verified"}:` : `No change to '${r.token}'.`;
      const out = [head];
      if (r.changed.length) out.push(`Before: ${line(r.before)}`, `After:  ${line(r.after)}`);
      for (const n of r.notes || []) out.push(`Note: ${n}`);
      const text = out.join("\n");
      if (!r.dryRun && r.changed.length) await log("update_token", p, text);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("set_token_note", {
    title: "Write or delete a token's note",
    description:
      "Create or change the note attached to a placed token (the token menu's Create/Edit Note), on any scene. content is plain text (# headings, - bullets, **bold**) or HTML with format 'html'; mode replace/append/prepend. visibility: 'dm' (default for new notes), 'all' players, or a list of player names. " +
      "delete: true removes the note — PERMANENT: call with dryRun: true first, tell the user what will be deleted and wait for their yes.",
    inputSchema: {
      ...scene, ...which,
      content: z.string().optional(),
      format: z.enum(["text", "html"]).optional(),
      mode: z.enum(["replace", "append", "prepend"]).optional(),
      visibility: z.union([z.string(), z.array(z.string())]).optional(),
      title: z.string().optional().describe("Defaults to the token's name."),
      delete: z.boolean().optional(),
      dryRun: z.boolean().optional(),
      ...tab,
    },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("set_token_note", p, tabId);
      let text;
      if (r.dryRun) text = `Would delete (nothing changed yet) the note '${r.wouldDelete.title}' on token '${r.wouldDelete.token}' (${r.wouldDelete.visibility}, ${r.wouldDelete.length} characters).`;
      else if (r.deleted) text = `Deleted the note '${r.deleted.title}' on token '${r.deleted.token}'.`;
      else text = `${r.created ? "Created" : "Updated"} the note on '${r.token}' — "${r.title}" (${r.visibility}):\n${r.text || "(empty)"}`;
      if (!r.dryRun) await log("set_token_note", p, text.split("\n")[0]);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });
}
