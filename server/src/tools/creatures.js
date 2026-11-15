import { z } from "zod";
import { errorResult } from "../util.js";
import { logChange } from "../changelog.js";

const tab = { tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open.") };
const which = {
  creatureId: z.string().optional().describe("Creature id from list_creatures."),
  creatureName: z.string().optional().describe("Or: the creature's exact name."),
};
const folder = {
  folderId: z.string().optional().describe("My Tokens folder id from list_creatures."),
  folderName: z.string().optional().describe("Or: the folder's exact name."),
};
const feature = z.union([z.string(), z.object({ name: z.string(), text: z.string() })]);
const statBlock = z.object({
  size: z.string().optional().describe("e.g. Medium (text shown in the stat block; token size is the separate 'size' option)."),
  type: z.string().optional().describe("e.g. humanoid (goblinoid)"),
  alignment: z.string().optional(),
  ac: z.union([z.number(), z.string()]).optional(),
  acNote: z.string().optional().describe("e.g. chain shirt, shield"),
  hp: z.union([z.number(), z.string()]).optional().describe("Average hit points. Worked out from hitDice if left out."),
  hitDice: z.string().optional().describe("e.g. 5d8+5 — used when AboveVTT's Max HP Calculation is set to roll/max/adv/dis."),
  speed: z.string().optional().describe("e.g. 30 ft., climb 20 ft."),
  initiative: z.union([z.number(), z.string()]).optional().describe("Defaults to the DEX modifier."),
  abilities: z.object({ str: z.number().optional(), dex: z.number().optional(), con: z.number().optional(), int: z.number().optional(), wis: z.number().optional(), cha: z.number().optional() }).optional(),
  savingThrows: z.string().optional(), skills: z.string().optional(),
  damageVulnerabilities: z.string().optional(), damageResistances: z.string().optional(), damageImmunities: z.string().optional(),
  conditionImmunities: z.string().optional(), senses: z.string().optional(), languages: z.string().optional(),
  cr: z.union([z.number(), z.string()]).optional().describe("Challenge rating, e.g. 1/2 or 3."),
  traits: z.array(feature).optional(), actions: z.array(feature).optional(), bonusActions: z.array(feature).optional(),
  reactions: z.array(feature).optional(), legendaryActions: z.array(feature).optional(),
  description: z.string().optional(),
});
const aura = z.object({ feet: z.number().optional(), color: z.string().optional() }).nullable();
const tokenBits = {
  size: z.union([z.enum(["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]), z.number()]).optional().describe("Token size on the grid."),
  borderColor: z.string().nullable().optional().describe("Token border colour; null removes it."),
  aura1: aura.optional().describe("Inner aura { feet, color }; null removes it."),
  aura2: aura.optional().describe("Outer aura { feet, color }; null removes it."),
  darkvisionFeet: z.number().optional(),
  lightInner: aura.optional().describe("Light the token gives off (inner) { feet, color }."),
  lightOuter: aura.optional().describe("Dim light (outer) { feet, color }."),
  settings: z.record(z.string(), z.any()).optional().describe("Token settings, keys as in list_settings group tokenDefaults (e.g. { \"hidden\": true, \"tokenStyleSelect\": \"Square\" }); null clears one."),
  statBlock: statBlock.optional().describe("Stat block as fields (AC, HP, abilities, actions…). HP/AC/initiative are read by AboveVTT when the token is placed."),
  statBlockText: z.string().optional().describe("Or: a stat block as plain text (e.g. pasted). Must contain 'Armor Class N' and 'Hit Points N (XdY+Z)' for AboveVTT to pick up AC/HP."),
  statBlockHtml: z.string().optional().describe("Or: a stat block as HTML."),
};
const ASK_FIRST = "PERMANENT. Call it with dryRun: true first, tell the user exactly what will be deleted, and wait for their explicit yes in chat. Never delete on your own initiative. ";
const ok = (text) => ({ content: [{ type: "text", text }] });

function stats(c) {
  const bits = [];
  if (c.ac) bits.push(`AC ${c.ac}`);
  if (c.hp) bits.push(`HP ${c.hp}${c.hitDice ? ` (${c.hitDice})` : ""}`);
  if (c.initiative) bits.push(`Init ${c.initiative}`);
  if (c.cr) bits.push(`CR ${c.cr}`);
  return bits.join(", ");
}
function creatureLine(c, indent = "") {
  if (c.type === "folder") return `${indent}📁 ${c.name} [${c.id}]`;
  const s = stats(c);
  return `${indent}🐉 ${c.name} [${c.id}] — ${c.size}${c.images ? `, ${c.images} image(s)` : ", no image"}${c.hasStatBlock ? `, stat block${s ? `: ${s}` : ""}` : ", no stat block"}`;
}

export function register(server, bridge) {
  const call = (m, p, tabId) => bridge.call(m, p, { tabId });
  const log = (tool, params, text) => logChange(bridge, { tool, params, summary: text });

  server.registerTool("list_creatures", {
    title: "List custom creatures (My Tokens)",
    description: "List AboveVTT's My Tokens (custom creatures) and their folders as a tree, with size, images and the AC/HP/initiative/CR AboveVTT reads from each stat block.",
    inputSchema: { ...folder, search: z.string().optional(), ...tab },
    annotations: { readOnlyHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("list_creatures", p, tabId);
      const lines = [`${r.root}: ${r.creatures} creature(s), ${r.folders} folder(s)`];
      const walk = (n, d) => { lines.push(creatureLine(n, "  ".repeat(d))); (n.children || []).forEach((c) => walk(c, d + 1)); };
      r.tree.forEach((n) => walk(n, 0));
      if (!r.tree.length) lines.push(p.search ? `Nothing matches '${p.search}'.` : "(empty)");
      return ok(lines.join("\n"));
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("get_creature", {
    title: "Show a custom creature",
    description: "Show one custom creature: images, size, token options and its stat block text.",
    inputSchema: { ...which, ...tab },
    annotations: { readOnlyHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const c = await call("get_creature", p, tabId);
      const lines = [creatureLine(c).trim(), `Folder: ${c.path.split(" / ").slice(0, -1).join(" / ")}`];
      if (c.imageLinks.length) lines.push(`Images: ${c.imageLinks.join(" , ")}`);
      if (Object.keys(c.options).length) lines.push(`Token options: ${JSON.stringify(c.options)}`);
      lines.push("", c.statBlockText ? `Stat block:\n${c.statBlockText}` : "No stat block.");
      return ok(lines.join("\n"));
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("create_creature", {
    title: "Create custom creatures",
    description:
      "Create one or more custom creatures in AboveVTT's My Tokens (up to 25 per call), at the top level or in a My Tokens folder. " +
      "Each can have images (public links), token size, border colour, auras, darkvision/light, token settings, and a stat block " +
      "(as fields, plain text or HTML). AboveVTT reads HP, AC and initiative from the stat block every time the token is placed, " +
      "honouring the Max HP Calculation token setting (average/roll/max…). A name already used in that folder gets a number added.",
    inputSchema: {
      creatures: z.array(z.object({ name: z.string(), images: z.array(z.string()).optional(), ...tokenBits })).min(1).max(25),
      ...folder,
      ...tab,
    },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("create_creature", p, tabId);
      const lines = [`Created in ${r.folder}:`];
      for (const c of r.created) lines.push(creatureLine(c, "• ") + (c.name !== c.requestedName ? ` (renamed from '${c.requestedName}' — that name was taken)` : ""));
      const text = lines.join("\n");
      log("create_creature", { ...p, creatures: p.creatures.map((c) => c.name) }, text);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("update_creature", {
    title: "Change a custom creature",
    description:
      "Change a custom creature: rename, replace/add/remove images, size, border colour, auras, vision/light, token settings, " +
      "replace or remove its stat block, or move it to another My Tokens folder. Tokens already placed on maps keep their " +
      "current values (that's step 12); new placements use the changes.",
    inputSchema: {
      ...which,
      newName: z.string().optional(),
      images: z.array(z.string()).optional().describe("Replace all images."),
      addImages: z.array(z.string()).optional(),
      removeImages: z.array(z.string()).optional(),
      ...tokenBits,
      removeStatBlock: z.boolean().optional(),
      ...folder,
      toTopLevel: z.boolean().optional().describe("Move to the top of My Tokens."),
      ...tab,
    },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("update_creature", p, tabId);
      if (!r.changed.length) return ok(`Nothing changed — '${r.before.name}' already matches.`);
      const lines = [`Updated '${r.before.name}' (${r.changed.join(", ")}):`, `Before: ${creatureLine(r.before).trim()}`, `After:  ${creatureLine(r.after).trim()}`];
      if (r.before.path !== r.after.path) lines.push(`Moved: ${r.before.path} → ${r.after.path}`);
      const text = lines.join("\n");
      log("update_creature", p, text);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("delete_creature", {
    title: "Delete a custom creature",
    description: ASK_FIRST + "Deletes a custom creature from My Tokens with AboveVTT's own delete, which also deletes its stat block. Tokens already placed on maps stay.",
    inputSchema: { ...which, dryRun: z.boolean().optional(), ...tab },
    annotations: { destructiveHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("delete_creature", p, tabId);
      const c = r.dryRun ? r.wouldDelete : r.deleted;
      const text = `${r.dryRun ? "Would delete (nothing changed yet)" : "Deleted"}: ${creatureLine(c).trim()} from ${c.path.split(" / ").slice(0, -1).join(" / ")}` +
        ((r.dryRun ? r.alsoDeletesStatBlock : r.statBlockDeleted) ? ", including its stat block." : ".") + " Tokens already on maps are not affected.";
      if (!r.dryRun) log("delete_creature", p, text);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("create_creature_folder", {
    title: "Create a My Tokens folder",
    description: "Create a folder in AboveVTT's My Tokens, at the top or inside another My Tokens folder.",
    inputSchema: { name: z.string(), parentFolderId: z.string().optional(), parentFolderName: z.string().optional(), ...tab },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("create_creature_folder", p, tabId);
      const text = `Created ${r.created.path} [${r.created.id}]`;
      log("create_creature_folder", p, text);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("delete_creature_folder", {
    title: "Delete a My Tokens folder",
    description: ASK_FIRST + "Deletes a My Tokens folder. mode 'moveContentsUp' (default) moves its contents up one level first; 'deleteEverything' also deletes every creature (and stat block) and subfolder inside — AboveVTT's two folder delete options.",
    inputSchema: { ...folder, mode: z.enum(["moveContentsUp", "deleteEverything"]).optional(), dryRun: z.boolean().optional(), ...tab },
    annotations: { destructiveHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("delete_creature_folder", p, tabId);
      const lines = [`${r.dryRun ? "Would delete (nothing changed yet)" : "Deleted"} folder ${r.folder}`];
      if (r.mode === "deleteEverything") {
        lines.push(r.deletes.length ? `${r.dryRun ? "Would also delete" : "Also deleted"} (${r.deletes.length}):` : "It was empty.");
        r.deletes.forEach((c) => lines.push(creatureLine(c, "• ")));
      } else {
        lines.push(r.moves.length ? `${r.dryRun ? "Would move" : "Moved"} up to ${r.movesUpTo}:` : "It was empty.");
        r.moves.forEach((c) => lines.push(creatureLine(c, "• ")));
      }
      const text = lines.join("\n");
      if (!r.dryRun) log("delete_creature_folder", p, text);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });
}
