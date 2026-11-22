// Run from the AboveVTT-MCP folder: node test/names.test.mjs  (needs server/node_modules and jsdom)
// Security review item 1: names the MCP writes can't carry HTML into AboveVTT's pages (AboveVTT shows many names as
// raw HTML), straight quotes become typographic ones, and lookups still find names whichever quotes are typed.
import os from "node:os"; import fs from "node:fs"; import path from "node:path";
import { JSDOM } from "jsdom";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "names-"));
process.env.HOME = tmp; process.env.USERPROFILE = tmp;
const { z } = await import("../server/node_modules/zod/index.js");

let fails = 0;
const check = (label, cond, text = "") => { console.log((cond ? "ok   " : "FAIL ") + label); if (!cond) { fails++; console.log("     " + text); } };

// ---- every name field, through each tool's schema (as the MCP SDK applies it) -----------------------------
const sent = [];
const bridge = { tabs: [], connected: true, call: async (method, p) => { sent.push({ method, p: JSON.parse(JSON.stringify(p)) }); throw new Error("stop"); } };
const defs = {}, tools = {};
const server = { registerTool: (n, d, f) => { defs[n] = d; tools[n] = f; } };
for (const m of ["scene_folders", "scene_create", "scene_config", "creatures", "copy_tokens", "notes", "music", "tokens"]) (await import(`../server/src/tools/${m}.js`)).register(server, bridge);

const EVIL = '<img src=x onerror="alert(1)">';
const cases = [ // tool, args with the name at `set(v)`, path to read it back
  ["create_folder", (v) => ({ title: v }), (d) => d.title],
  ["rename_folder", (v) => ({ folderTitle: "Old", newTitle: v }), (d) => d.newTitle],
  ["create_scene", (v) => ({ scenes: [{ title: v }] }), (d) => d.scenes[0].title],
  ["create_creature", (v) => ({ creatures: [{ name: v }] }), (d) => d.creatures[0].name],
  ["update_creature", (v) => ({ creatureName: "Goblin", newName: v }), (d) => d.newName],
  ["create_creature_folder", (v) => ({ name: v }), (d) => d.name],
  ["copy_to_my_tokens", (v) => ({ items: [{ source: "aboveVTT", name: "Fire", newName: v }] }), (d) => d.items[0].newName],
  ["create_note", (v) => ({ title: v, folderTitle: "F" }), (d) => d.title],
  ["update_note", (v) => ({ noteTitle: "N", newTitle: v }), (d) => d.newTitle],
  ["create_note_folder", (v) => ({ title: v }), (d) => d.title],
  ["update_note_folder", (v) => ({ folderTitle: "F", newTitle: v }), (d) => d.newTitle],
  ["add_tracks", (v) => ({ tracks: [{ name: v, src: "https://x/a.mp3" }] }), (d) => d.tracks[0].name],
  ["update_track", (v) => ({ trackName: "T", newName: v }), (d) => d.newName],
  ["create_playlist", (v) => ({ name: v }), (d) => d.name],
  ["update_playlist", (v) => ({ playlistName: "P", newName: v }), (d) => d.newName],
  ["update_token", (v) => ({ tokenName: "Goblin", name: v }), (d) => d.name],
  ["update_token", (v) => ({ tokenName: "Goblin", addConditions: [{ name: "red", text: v }] }), (d) => d.addConditions[0].text],
  ["set_token_note", (v) => ({ tokenName: "Goblin", title: v, content: "x" }), (d) => d.title],
];
let refused = 0, curled = 0;
for (const [tool, set, get] of cases) {
  if (!defs[tool]) { check(`${tool} exists`, false); continue; }
  const schema = z.object(defs[tool].inputSchema);
  const bad = schema.safeParse(set(EVIL));
  if (!bad.success && /can't contain < or >/.test(JSON.stringify(bad.error.issues))) refused++;
  else check(`${tool}: HTML in a name is refused`, false, JSON.stringify(bad.success ? get(bad.data) : bad.error.issues).slice(0, 300));
  const good = schema.safeParse(set(`Bob's "Rusty" Anchor`));
  if (good.success && get(good.data) === "Bob’s “Rusty” Anchor") curled++;
  else check(`${tool}: quotes become typographic`, false, JSON.stringify(good.success ? get(good.data) : good.error.issues));
}
check(`all ${cases.length} name fields refuse HTML`, refused === cases.length, `${refused}/${cases.length}`);
check(`all ${cases.length} name fields get typographic quotes`, curled === cases.length, `${curled}/${cases.length}`);
const lookup = z.object(defs.update_note.inputSchema).safeParse({ noteTitle: `Bob's <old> note`, content: "x" });
check("lookup fields (noteTitle) are left alone, so existing items can still be found", lookup.success && lookup.data.noteTitle === "Bob's <old> note", JSON.stringify(lookup));

// titles inside free-form config
let t = (await tools.update_scene_config({ sceneTitle: "Cave", changes: { title: EVIL, grid: true } })).content[0].text;
check("update_scene_config: an HTML title is refused before anything is sent", /can't contain < or >/.test(t) && !sent.some((s) => s.method === "update_scene_config"), t);
await tools.update_scene_config({ sceneTitle: "Cave", changes: { title: `The "Ice" Cave`, grid: true } });
check("update_scene_config: title gets typographic quotes, other changes untouched", sent.at(-1)?.p.changes.title === "The “Ice” Cave" && sent.at(-1)?.p.changes.grid === true, JSON.stringify(sent.at(-1)));
t = (await tools.create_scene({ scenes: [{ title: "Ok", config: { title: EVIL } }] })).content[0].text;
check("create_scene: an HTML title hidden in config is refused too", /can't contain < or >/.test(t) && !sent.some((s) => s.method === "create_scene"), t);

// ---- lookups match straight and curly quotes (extension) -------------------------------------------------
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(fs.readFileSync("extension/page.js", "utf8"));
const key = w.AVTT_MCP.nameKey;
check("nameKey: straight and curly quotes, case and spaces all match", key("  Bob’s “Rusty” ANCHOR ") === key(`bob's "rusty" anchor`));
check("nameKey: different names still differ", key("Bob's Tavern") !== key("Bobs Tavern"));
const lookups = fs.readdirSync("extension").filter((f) => f.endsWith(".js")).map((f) => [f, fs.readFileSync("extension/" + f, "utf8")]);
const leftover = lookups.filter(([f, s]) => f !== "page.js" && /\.trim\(\)\.toLowerCase\(\)/.test(s)).map(([f]) => f);
check("every name lookup in the extension uses nameKey (no plain trim/toLowerCase left)", leftover.length === 0, leftover.join(", "));

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
