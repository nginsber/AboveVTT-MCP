// Run from the AboveVTT-MCP folder: node test/confirm.test.mjs  (needs server/node_modules)
// Checks the server-enforced preview-and-confirm (review item 1) for every guarded tool, using the real
// tool code with a stand-in bridge. Change log and import file go to a temporary folder.
import os from "node:os"; import fs from "node:fs"; import path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "confirmtest-"));
process.env.HOME = tmp; process.env.USERPROFILE = tmp;
const { z } = await import("../server/node_modules/zod/index.js");
const { CHANGE_LOG_FILE } = await import("../server/src/changelog.js");

// ---- stand-in bridge: remembers every call and keeps a little state -------------------------
const state = { scenes: ["Cave", "Tavern"], resetDone: 0, overridesCleared: 0, imported: 0 };
const calls = [];
const realCalls = () => calls.filter((c) => !c.p.dryRun);
const bridge = {
  tabs: [{ isDM: true, campaignName: "Test" }],
  async call(method, p, opts = {}) {
    calls.push({ method, p, tabId: opts.tabId });
    const d = !!p.dryRun;
    const flag = d ? { dryRun: true } : {};
    switch (method) {
      case "delete_scene": {
        const hit = state.scenes.filter((s) => p.items.some((i) => (i.title ?? i) === s)).map((s) => ({ path: `/${s}` }));
        if (!d) state.scenes = state.scenes.filter((s) => !hit.some((h) => h.path === `/${s}`));
        return { ...flag, [d ? "wouldDelete" : "deleted"]: hit };
      }
      case "delete_folder": return { ...flag, folder: { path: "/Dungeon" }, mode: "moveContentsUp", moves: [], movesUpTo: "/", warnings: [] };
      case "delete_note": return { ...flag, [d ? "wouldDelete" : "deleted"]: { title: "Old", id: "n1", visibility: "DM only", folder: "Misc", length: 10 } };
      case "delete_note_folder": return { ...flag, folder: "Misc", subfolders: [], notes: [] };
      case "delete_tracks": return { ...flag, [d ? "wouldDelete" : "deleted"]: [{ name: "Rain", id: "t1", tags: [], src: "https://x/rain.mp3" }] };
      case "delete_playlist": return { ...flag, [d ? "wouldDelete" : "deleted"]: { name: "Battle", id: "p1", tracks: [] } };
      case "delete_creature": return { ...flag, [d ? "wouldDelete" : "deleted"]: { type: "creature", name: "Goblin", id: "c1", path: "My Tokens / Goblin" } };
      case "delete_creature_folder": return { ...flag, folder: "Old", mode: "moveContentsUp", moves: [], movesUpTo: "My Tokens" };
      case "import_backup":
        if (!d) state.imported++;
        return { ...flag, preview: { scenes: { total: 1, alreadyInCampaign: 0, titles: ["A"] }, tokenCustomizations: { total: 0 }, notes: { total: 0 }, journalChapters: 0, soundpads: 0, musicTracks: 0 }, reloading: !d };
      case "update_note": {
        if (!d) state.noteSaves = (state.noteSaves || 0) + 1;
        const replaced = (p.replacements || []).map((x) => ({ find: x.find, replace: x.replace, all: !!x.all, count: x.all ? 2 : 1,
          places: Array.from({ length: x.all ? 2 : 1 }, (_, k) => ({ before: `…«${x.find}» ${k}…`, after: `…«${x.replace}» ${k}…` })) }));
        return d ? { dryRun: true, before: { title: "Prep", length: 100 }, afterLength: 100, wouldChange: true, replaced }
          : { before: { title: "Prep", length: 100 }, after: { title: "Prep", id: "n9", length: 100 }, changed: ["content"], replaced };
      }
      case "reset_setting":
        if (!d) state.resetDone++;
        return { ...flag, group: p.group, reset: [{ key: "grid", from: true, to: false }] };
      case "settings_action":
        if (p.action === "clearAllTokenOptionOverrides") { if (!d) state.overridesCleared++; return d ? { dryRun: true, withOptionOverrides: 2, tokenCustomizations: 5, note: "" } : { cleared: 2 }; }
        if (p.action === "matchCampaignSettings") return d ? { dryRun: true, suggestedSettings: {}, yourSettingsThatWouldBeCleared: [], note: "" } : { applied: 1, cleared: [] };
        if (p.action === "recoverScenes") return p.oldInviteId ? (d ? { dryRun: true, found: 1, titles: ["X"] } : { recovered: 1 }) : { needsInviteId: true, note: "Pass oldInviteId.", previousLinks: [] };
        if (p.action === "exportJournal") return { filename: "j.json", savedTo: "Downloads", contains: "notes" };
        return {};
      default: throw new Error("unexpected call " + method);
    }
  },
};

const tools = {};
const defs = {};
const server = { registerTool: (name, def, fn) => { tools[name] = fn; defs[name] = def; } };
for (const m of ["scene_folders", "notes", "music", "creatures", "settings_actions", "settings"]) {
  (await import(`../server/src/tools/${m}.js`)).register(server, bridge);
}
const run = async (name, p) => (await tools[name](p)).content[0].text;
const tokenIn = (t) => t.match(/confirmToken: "([0-9a-f]+)"/)?.[1];

let fails = 0;
const check = (label, cond, text = "") => { console.log((cond ? "ok   " : "FAIL ") + label); if (!cond) { fails++; console.log("     " + text); } };

// ---- every guarded tool: refused without a token, preview gives one, token makes the change ----
const guarded = {
  delete_scene: { items: ["Cave"] },
  delete_folder: { folderTitle: "Dungeon" },
  delete_note: { noteTitle: "Old" },
  delete_note_folder: { folderTitle: "Misc" },
  delete_tracks: { trackNames: ["Rain"] },
  delete_playlist: { playlistName: "Battle" },
  delete_creature: { creatureName: "Goblin" },
  delete_creature_folder: { folderName: "Old" },
  reset_setting: { group: "sceneDefaults", all: true },
};
for (const [name, p] of Object.entries(guarded)) {
  const schema = z.object(defs[name].inputSchema);
  check(`${name}: schema accepts confirmToken`, schema.safeParse({ ...p, confirmToken: "abc" }).success);
  check(`${name}: description still says to ask the user in chat`, /explicit yes in chat/.test(defs[name].description) && /confirmToken/.test(defs[name].description));
  const before = realCalls().length;
  let t = await run(name, p);
  check(`${name}: refused without a preview`, /needs a preview first/.test(t) && realCalls().length === before, t);
  t = await run(name, { ...p, dryRun: true });
  const tok = tokenIn(t);
  check(`${name}: preview gives a token`, !!tok, t);
  t = await run(name, { ...p, confirmToken: tok });
  check(`${name}: change made with the token`, realCalls().length === before + 1 && !/needs a preview|confirmToken was/.test(t), t);
  t = await run(name, { ...p, confirmToken: tok });
  check(`${name}: token works only once`, /unknown, already used or expired/.test(t) && realCalls().length === before + 1, t);
}

// ---- token is tied to the exact request -------------------------------------------------------
state.scenes = ["Cave", "Tavern", "Crypt"];
let t = await run("delete_scene", { items: ["Cave"], dryRun: true });
let tok = tokenIn(t);
t = await run("delete_scene", { items: ["Tavern"], confirmToken: tok });
check("token for 'Cave' can't delete 'Tavern'", /different request/.test(t) && state.scenes.includes("Tavern"), t);
t = await run("delete_scene", { items: ["Cave"], confirmToken: tok });
check("…and that token is now used up", /unknown, already used/.test(t) && state.scenes.includes("Cave"), t);

t = await run("delete_scene", { items: ["Cave"], dryRun: true });
tok = tokenIn(t);
t = await run("delete_note", { noteTitle: "Old", confirmToken: tok });
check("token from delete_scene can't be used by delete_note", /different request/.test(t), t);

t = await run("delete_scene", { items: ["Cave"], dryRun: true, tabId: 1 });
tok = tokenIn(t);
t = await run("delete_scene", { items: ["Cave"], confirmToken: tok, tabId: 2 });
check("token from one tab can't be used on another", /different request/.test(t) && state.scenes.includes("Cave"), t);

// ---- what would change must still be the same -----------------------------------------------
t = await run("delete_scene", { items: ["Cave", "Crypt"], dryRun: true });
tok = tokenIn(t);
state.scenes = state.scenes.filter((s) => s !== "Crypt"); // someone deletes Crypt in AboveVTT meanwhile
t = await run("delete_scene", { items: ["Cave", "Crypt"], confirmToken: tok });
check("refused when the preview no longer matches", /no longer the same as in the preview/.test(t) && state.scenes.includes("Cave"), t);

// ---- expiry ---------------------------------------------------------------------------------
t = await run("delete_scene", { items: ["Cave"], dryRun: true });
tok = tokenIn(t);
const realNow = Date.now;
Date.now = () => realNow() + 11 * 60 * 1000;
t = await run("delete_scene", { items: ["Cave"], confirmToken: tok });
Date.now = realNow;
check("token expires after 10 minutes", /expired/.test(t) && state.scenes.includes("Cave"), t);

// ---- made-up token --------------------------------------------------------------------------
t = await run("delete_scene", { items: ["Cave"], confirmToken: "deadbeef0000" });
check("made-up token refused", /unknown/.test(t) && state.scenes.includes("Cave"), t);

// ---- change log never records the token -----------------------------------------------------
t = await run("delete_scene", { items: ["Cave"], dryRun: true });
await run("delete_scene", { items: ["Cave"], confirmToken: tokenIn(t) });
const log = fs.readFileSync(CHANGE_LOG_FILE, "utf8");
check("scene deleted after a proper preview", !state.scenes.includes("Cave"));
check("change log has no confirmToken or dryRun", !/confirmToken|dryRun/.test(log), log.slice(0, 300));

// ---- run_settings_action: only the data-changing buttons are guarded -------------------------
let n = realCalls().length;
t = await run("run_settings_action", { action: "exportJournal" });
check("exportJournal runs without a preview", /Downloaded/.test(t) && realCalls().length === n + 1, t);
t = await run("run_settings_action", { action: "recoverScenes" });
check("recoverScenes without an old link just lists links", /Pass oldInviteId/.test(t), t);
for (const action of ["clearAllTokenOptionOverrides", "matchCampaignSettings"]) {
  n = realCalls().length;
  t = await run("run_settings_action", { action });
  check(`${action}: refused without a preview`, /needs a preview first/.test(t) && realCalls().length === n, t);
  t = await run("run_settings_action", { action, dryRun: true });
  const k = tokenIn(t);
  t = await run("run_settings_action", { action, confirmToken: k });
  check(`${action}: runs with the token`, realCalls().length === n + 1 && !/needs a preview/.test(t), t);
}
t = await run("run_settings_action", { action: "recoverScenes", oldInviteId: "abc" });
check("recoverScenes with an old link: refused without a preview", /needs a preview first/.test(t), t);
t = await run("run_settings_action", { action: "clearAllTokenOptionOverrides", dryRun: true });
t = await run("run_settings_action", { action: "matchCampaignSettings", confirmToken: tokenIn(t) });
check("token from one button can't run another", /different request/.test(t), t);

// ---- reset_setting with nothing to reset: no token offered -----------------------------------
const realCall = bridge.call;
bridge.call = async (m, p, o) => (m === "reset_setting" ? { group: p.group, reset: [], ...(p.dryRun ? { dryRun: true } : {}) } : realCall(m, p, o));
t = await run("reset_setting", { group: "aboveVTT", all: true, dryRun: true });
check("nothing to reset: preview says so and offers no token", /already at defaults/.test(t) && !tokenIn(t), t);
bridge.call = realCall;

// ---- update_note: replace all needs a preview, ordinary replacements don't ---------------------
(await import("../server/src/tools/notes.js")).register(server, bridge);
state.noteSaves = 0;
t = await run("update_note", { noteTitle: "Prep", replacements: [{ find: "Nov 3", replace: "Nov 10" }] });
check("ordinary find-and-replace runs without a preview", state.noteSaves === 1 && /Replaced/.test(t), t);
t = await run("update_note", { noteTitle: "Prep", replacements: [{ find: "Goblin", replace: "Kobold", all: true }] });
check("replace all refused without a preview", /needs a preview first/.test(t) && state.noteSaves === 1, t);
t = await run("update_note", { noteTitle: "Prep", dryRun: true, replacements: [{ find: "Goblin", replace: "Kobold", all: true }] });
check("replace-all preview lists every place and gives a token", /in 2 places \(nothing changed yet\)/.test(t) && /a\) before: …«Goblin» 0…/.test(t) && /b\) before: …«Goblin» 1…/.test(t) && !!tokenIn(t), t);
const rk = tokenIn(t);
t = await run("update_note", { noteTitle: "Prep", replacements: [{ find: "Goblin", replace: "Gnoll", all: true }], confirmToken: rk });
check("token for Kobold can't replace with Gnoll", /different request/.test(t) && state.noteSaves === 1, t);
t = await run("update_note", { noteTitle: "Prep", dryRun: true, replacements: [{ find: "Goblin", replace: "Kobold", all: true }] });
t = await run("update_note", { noteTitle: "Prep", replacements: [{ find: "Goblin", replace: "Kobold", all: true }], confirmToken: tokenIn(t) });
check("replace all runs after a preview and the token", state.noteSaves === 2 && /all 2 places/.test(t), t);
t = await run("update_note", { noteTitle: "Prep", dryRun: true, replacements: [{ find: "45 HP", replace: "52 HP" }] });
check("ordinary replacements can be previewed (no token needed)", /nothing changed yet/.test(t) && !tokenIn(t) && state.noteSaves === 2, t);
check("update_note description says to use all only when asked", /explicitly asks to replace ALL/.test(defs.update_note.description));

// ---- import_backup: token tied to the file --------------------------------------------------
const file = path.join(tmp, "campaign.abovevtt");
fs.writeFileSync(file, JSON.stringify({ scenes: [] }));
t = await run("import_backup", { file });
check("import refused without a preview", /needs a preview first/.test(t) && state.imported === 0, t);
t = await run("import_backup", { file, dryRun: true });
tok = tokenIn(t);
fs.writeFileSync(file, JSON.stringify({ scenes: [1, 2, 3] })); // file replaced after the preview
fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
t = await run("import_backup", { file, confirmToken: tok });
check("import refused when the file changed after the preview", /different request/.test(t) && state.imported === 0, t);
t = await run("import_backup", { file, dryRun: true });
t = await run("import_backup", { file, confirmToken: tokenIn(t) });
check("import runs with a fresh preview's token", state.imported === 1, t);
const imp = calls.filter((c) => c.method === "import_backup" && !c.p.dryRun).at(-1);
check("extension gets the file text, not the token", imp.p.fileText.includes("[1,2,3]") && !("confirmToken" in imp.p), JSON.stringify(Object.keys(imp.p)));

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
