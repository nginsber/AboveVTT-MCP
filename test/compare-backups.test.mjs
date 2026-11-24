// compare_backups: two backup files written with AboveVTT's own b64EncodeUnicode, compared by the real tool.
// Run from the AboveVTT-MCP folder: node test/compare-backups.test.mjs  (AboveVTT folder next to this one)
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import vm from "node:vm";
import { register } from "../server/src/tools/compare_backups.js";
import { textChange, plainText } from "../server/src/backupdiff.js";
import { parseBackupText } from "../server/src/backupfile.js";

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : "  " + extra}`); };

// AboveVTT's real encoder (Settings.js), as its Export writes the file.
const ST = fs.readFileSync((process.env.AVTT_DIR || "../AboveVTT") + "/Settings.js", "utf8");
const grab = (src, start) => { const i = src.indexOf(start); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const ctx = { btoa, atob, encodeURIComponent, decodeURIComponent, String }; vm.createContext(ctx);
vm.runInContext(grab(ST, "function b64EncodeUnicode(") + grab(ST, "function b64DecodeUnicode("), ctx);
const writeBackup = (file, data) => fs.writeFileSync(file, ctx.b64EncodeUnicode(JSON.stringify(data, null, "\t")));

const before = {
  version: 2,
  scenes: [
    { id: "f1", title: "Act 1", itemType: "folder", parentId: "scenesFolder" },
    { id: "f2", title: "Old stuff", itemType: "folder", parentId: "scenesFolder" },
    { id: "s1", title: "Cave", parentId: "f1", player_map: "https://x/cave.png", grid: "0", hpps: 60, vpps: 60, reveals: [],
      tokens: { t1: { id: "t1", name: "Goblin", left: "100px", top: "100px", hitPointInfo: { current: 7, maximum: 7 } },
        t2: { id: "t2", name: "Orc", left: "200px", top: "200px" }, t3: { id: "t3", name: "Bat", left: "0px", top: "0px" } } },
    { id: "s2", title: "Tavern", parentId: "scenesFolder", player_map: "https://x/tavern.png", tokens: {} },
    { id: "s3", title: "Doomed", parentId: "f2", player_map: "https://x/d.png", tokens: {} },
  ],
  tokencustomizations: [
    { id: "myTokensFolder", tokenType: "folder", parentId: "root", rootId: "root", tokenOptions: { name: "My Tokens" } },
    { id: "mf1", tokenType: "folder", parentId: "myTokensFolder", rootId: "myTokensFolder", tokenOptions: { name: "Undead" } },
    { id: "m1", tokenType: "myToken", parentId: "mf1", rootId: "myTokensFolder", tokenOptions: { name: "Zombie", alternativeImages: ["https://x/z.png"], armorClass: 8 } },
    { id: "m2", tokenType: "myToken", parentId: "mf1", rootId: "myTokensFolder", tokenOptions: { name: "Ghoul" } },
  ],
  notes: {
    n1: { title: "Session prep", text: "<p>The party meets Bob at the Nov 3 market.</p>", player: false },
    n2: { title: "Rumours", text: "<p>Dragons.</p>", player: false },
    n3: { title: "Old note", text: "<p>bye</p>" },
  },
  journalchapters: [{ id: "c1", title: "Act 1", notes: ["n1", "n2", "n3"] }, { id: "c2", title: "Lore", notes: [] }],
  soundpads: {},
  mixerstate: { playlists: { p1: { name: "Combat", channels: { a: { name: "Drums", src: "https://x/drums.mp3" } } } } },
  tracklibrary: [["tr1", { name: "Drums", src: "https://x/drums.mp3", tags: ["Combat"] }], ["tr2", { name: "Rain", src: "https://x/rain.mp3", tags: [] }]],
};
const after = JSON.parse(JSON.stringify(before));
after.scenes = after.scenes.filter((s) => s.id !== "s3");                       // scene removed
after.scenes.push({ id: "s4", title: "Crypt", parentId: "f1", player_map: "https://x/crypt.png", tokens: {} }); // added
after.scenes.push({ id: "f3", title: "Act 2", itemType: "folder", parentId: "scenesFolder" });                  // folder added
const cave = after.scenes.find((s) => s.id === "s1");
cave.grid = "1"; cave.hpps = 70; cave.vpps = 70; cave.reveals = [[0, 0, 10, 10]];
cave.tokens.t1.hitPointInfo = { current: 3, maximum: 7 };                       // token changed
cave.tokens.t2.left = "260px";                                                  // token only moved
delete cave.tokens.t3;                                                          // token removed
cave.tokens.t4 = { id: "t4", name: "Ogre" };                                    // token added
const tav = after.scenes.find((s) => s.id === "s2"); tav.title = "The Prancing Pony"; tav.parentId = "f1"; // renamed + moved
after.tokencustomizations.find((t) => t.id === "m1").tokenOptions.armorClass = 9;
after.tokencustomizations.find((t) => t.id === "m2").tokenOptions.name = "Ghast";
after.tokencustomizations.push({ id: "m3", tokenType: "myToken", parentId: "myTokensFolder", rootId: "myTokensFolder", tokenOptions: { name: "Wolf" } });
after.notes.n1.text = "<p>The party meets Bob at the Nov 10 market.</p>";
after.notes.n2.player = true;
delete after.notes.n3;
after.notes.n4 = { title: "Session 2", text: "<p>new</p>" };
after.journalchapters = [{ id: "c1", title: "Act One", notes: ["n1", "n2", "n4"] }];
after.tracklibrary = [["tr1", { name: "War Drums", src: "https://x/drums.mp3", tags: ["Combat", "Loud"] }], ["tr3", { name: "Wind", src: "https://x/wind.mp3" }]];
after.mixerstate.playlists.p1.channels.b = { name: "Wind", src: "https://x/wind.mp3" };
after.mixerstate.playlists.p2 = { name: "Calm", channels: {} };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avtt-cmp-"));
const fa = path.join(dir, "Frozen Sick-2026-11-14.abovevtt"), fb = path.join(dir, "Frozen Sick-2026-11-21.abovevtt");
writeBackup(fa, before); writeBackup(fb, after);
fs.utimesSync(fa, new Date("2026-11-14T10:00:00Z"), new Date("2026-11-14T10:00:00Z"));
fs.utimesSync(fb, new Date("2026-11-21T10:00:00Z"), new Date("2026-11-21T10:00:00Z"));

check("reads AboveVTT's base64 format", parseBackupText(fs.readFileSync(fa, "utf8")).notes.n1.title === "Session prep");
check("reads plain JSON too", parseBackupText(JSON.stringify({ scenes: [] })).scenes.length === 0);

let handler; register({ registerTool: (n, d, h) => { handler = h; } });
const r = await handler({ before: fa, after: fb });
const t = r.content[0].text;
console.log("\n" + t + "\n");
const has = (s, label = s) => check(label, t.includes(s), "missing: " + s);

has("Contents: 3 scenes, scene folders 2 → 3, token customizations 4 → 5, 3 notes, journal folders 2 → 1", "counts before → after");
has("Scenes added (1):\n  • Act 1 / Crypt", "scene added with folder path");
has("Scenes removed (1):\n  • Old stuff / Doomed", "scene removed");
has("• Act 1 / The Prancing Pony\n      – renamed from 'Tavern'\n      – moved from '(top level)'", "scene renamed and moved");
has("changed: draw grid, grid size, fog of war", "scene settings by label, grid width/height counted once");
has("tokens: 1 added (Ogre); 1 removed (Bat); 1 changed (Goblin: hit points); 1 only moved on the map", "tokens on a scene");
has("Scene folders added (1):\n  • Act 2", "folder added");
has("• My Tokens / Undead / Zombie\n      – changed: AC", "My Tokens field change");
has("• My Tokens / Undead / Ghast\n      – renamed from 'Ghoul'", "My Tokens rename");
has("Added (1):\n  • My Tokens / Wolf", "My Tokens added");
has("text edited (40 → 41 characters): «…3…» → «…10…»", "note text change shows just the changed part");
has("sharing changed (DM only → all players)", "note sharing");
has("Notes removed (1):\n  • 'Old note' in 'Act 1'", "note removed with its folder");
has("Notes added (1):\n  • 'Session 2' in 'Act One'", "note added");
has("• Act One\n      – renamed from 'Act 1'", "journal folder renamed");
has("Folders removed (1):\n  • Lore", "journal folder removed");
has("• War Drums\n      – renamed from 'Drums'\n      – tags Combat → Combat, Loud", "track renamed and retagged");
has("Tracks removed (1):\n  • Rain", "track removed");
has("Tracks added (1):\n  • Wind", "track added");
has("• Combat\n      – tracks added: Wind", "playlist tracks added");
has("Playlists added (1):\n  • Calm", "playlist added");
check("token that only moved isn't listed as changed", !/Orc/.test(t));
check("renaming a journal folder doesn't make its notes look moved", !/moved from 'Act 1'/.test(t));
// a note really moved between folders
const moved = JSON.parse(JSON.stringify(after)); moved.journalchapters.push({ id: "c9", title: "Act 2", notes: ["n4"] }); moved.journalchapters[0].notes = ["n1", "n2"];
const fm = path.join(dir, "moved.abovevtt"); writeBackup(fm, moved);
const mv = (await handler({ before: fb, after: fm })).content[0].text;
check("a note moved to another folder is reported", /'Session 2' in 'Act 2'\n      – moved from 'Act One'/.test(mv), mv);

const sameR = await handler({ before: fa, after: fa });
check("same file twice refused", sameR.isError && /same file/.test(sameR.content[0].text));
const swapped = await handler({ before: fb, after: fa });
check("warns when 'before' is the newer file", /the 'before' file is the newer/.test(swapped.content[0].text));
const only = await handler({ before: fa, after: fb, areas: ["audio"] });
check("areas limits the report", !/== Scenes ==/.test(only.content[0].text) && /== Audio ==/.test(only.content[0].text));
const noChange = await handler({ before: fa, after: (() => { const f = path.join(dir, "copy.abovevtt"); fs.copyFileSync(fa, f); return f; })() });
check("identical contents → no differences", /No differences found/.test(noChange.content[0].text));
const bad = await handler({ before: fa, after: path.join(dir, "notes.txt") });
check("only .abovevtt files", bad.isError && /Only \.abovevtt/.test(bad.content[0].text));
fs.writeFileSync(path.join(dir, "junk.abovevtt"), "not a backup");
const junk = await handler({ before: fa, after: path.join(dir, "junk.abovevtt") });
check("a file that isn't a backup is refused", junk.isError && /doesn't look like/.test(junk.content[0].text), junk.content[0].text);

// Real case (Frozen Sick, 23 Nov): renaming a scene in AboveVTT's configure dialog re-saves every field in another
// spelling or fills in defaults. Only the rename may be reported.
const { diffBackups } = await import("../server/src/backupdiff.js");
const sceneA = { id: "s9", title: "The Tavern", offsetx: 29, offsety: 54, scale_check: 1, tokens: { k: { id: "k", name: "Bob", left: "10px", hidden: false } } };
const sceneB = { id: "s9", title: "The Tavern Test", offsetx: "29", offsety: "54", scale_check: true, alphaNumGrid: "0", darkness_filter_number: "0",
  disableSceneVision: "0", gridStrokeNumberInput: "0.5", grid_color: "rgba(0, 0, 0, 0.5)", grid_line_width: "0.5", initial_x: "", initial_y: "",
  initial_zoom: "", playlist: "0", scale_factor: "", uuid: "", visionTrail: "0", weather: "0", weatherIntensity: "120",
  tokens: { k: { id: "k", name: "Bob", left: "10px", hidden: "false", conditions: [] , aura1: undefined } } };
const dd = diffBackups({ scenes: [sceneA], notes: { n: { title: "N", text: "<p>a</p>" } } },
  { scenes: [sceneB], notes: { n: { title: "N", text: "<p>a</p>", statBlock: false } } });
const ch = dd.scenes.scenesChanged[0];
check("dialog re-save: only the rename is reported", ch && ch.notes.length === 1 && /renamed from 'The Tavern'/.test(ch.notes[0]), JSON.stringify(ch));
check("…a token re-saved in another spelling isn't changed or moved", !dd.scenes.scenesChanged.some((c) => c.notes.some((n) => /tokens:/.test(n))), JSON.stringify(dd.scenes));
check("…note statBlock missing → false isn't a change", dd.journal.notesChanged.length === 0, JSON.stringify(dd.journal.notesChanged));
const real = diffBackups({ scenes: [{ ...sceneA, grid_color: "red", weather: "0" }] }, { scenes: [{ ...sceneB, grid_color: "blue", weather: "2" }] });
check("…but a real setting change still shows", /grid colour/.test(real.scenes.scenesChanged[0].notes.join()) && /weather/.test(real.scenes.scenesChanged[0].notes.join()), JSON.stringify(real.scenes.scenesChanged));
const mv2 = diffBackups({ scenes: [sceneA] }, { scenes: [{ ...sceneA, tokens: { k: { ...sceneA.tokens.k, left: "50px" } } }] });
check("…a token that really moved is counted as moved", /1 only moved on the map/.test(mv2.scenes.scenesChanged[0]?.notes.join()), JSON.stringify(mv2.scenes));
const txt = diffBackups({ scenes: [], notes: { n: { title: "N", text: "<h2>Prep</h2><p>Meet Nov 10.</p>" }, m: { title: "M", text: "<p>Keep this. Drop this.</p>" } } },
  { scenes: [], notes: { n: { title: "N", text: "<h2>Prep</h2>\n<p>Meet Nov 10.</p><p>changing this note</p>" }, m: { title: "M", text: "<p>Keep this.</p>" } } });
const tn = Object.fromEntries(txt.journal.notesChanged.map((c) => [c.title, c.notes.join(" | ")]));
check("text only appended → 'text added'", /^text added \(\d+ → \d+ characters\): «changing this note»$/.test(tn["'N'"]), tn["'N'"]);
check("text only deleted → 'text removed'", /^text removed .*«Drop this\.»$/.test(tn["'M'"]), tn["'M'"]);

// Real case (14 → 23 Nov): AboveVTT added devilsight/truesight at 0 feet, and recreated the empty Default playlist.
const off = { feet: "0", color: "rgba(142, 142, 142, 1)" };
const vis = diffBackups({ scenes: [], tokencustomizations: [{ id: "m", tokenType: "myToken", parentId: "myTokensFolder", rootId: "myTokensFolder", tokenOptions: { name: "Fire Mage", light1: { feet: "20", color: "x" } } }],
    mixerstate: { playlists: { old: { name: "Default", channels: {} } } } },
  { scenes: [], tokencustomizations: [{ id: "m", tokenType: "myToken", parentId: "myTokensFolder", rootId: "myTokensFolder", tokenOptions: { name: "Fire Mage", light1: { feet: "20", color: "x" }, devilsight: off, truesight: off } }],
    mixerstate: { playlists: { neu: { name: "Default", channels: {} } } } });
check("vision settings added at 0 feet aren't a change", vis.tokens.changed.length === 0, JSON.stringify(vis.tokens.changed));
check("a recreated playlist with the same name isn't added + removed", !vis.audio.playlistsAdded.length && !vis.audio.playlistsRemoved.length && !vis.audio.playlistsChanged.length, JSON.stringify(vis.audio));
const vis2 = diffBackups({ scenes: [], tokencustomizations: [{ id: "m", tokenType: "myToken", tokenOptions: { name: "F", light1: { feet: "20" } } }] },
  { scenes: [], tokencustomizations: [{ id: "m", tokenType: "myToken", tokenOptions: { name: "F", light1: { feet: "0" }, devilsight: { feet: "60" } } }] });
check("…but turning vision on or a light off still shows", /light, devilsight/.test(vis2.tokens.changed[0]?.notes.join()), JSON.stringify(vis2.tokens.changed));

// Real case (23 Nov, 18:39 → 18:53): AboveVTT re-saved five stat-block notes with their attributes in another order.
const { canonicalHtml } = await import("../server/src/backupdiff.js");
const sbA = '<div id="content" class="main content-container" style="padding: 0!important;"><div class="x">Ghast</div></div>';
const sbB = '<div style="padding: 0!important;" class="main content-container" id="content"><div class="x">Ghast</div></div>';
check("attribute order doesn't matter", canonicalHtml(sbA) === canonicalHtml(sbB));
check("…but a changed attribute value does", canonicalHtml(sbA) !== canonicalHtml(sbA.replace('class="x"', 'class="y"')));
const sbd = diffBackups(
  { scenes: [], notes: { g: { text: sbA, statBlock: true }, h: { title: "H", text: "<p>x</p>" } }, tokencustomizations: [{ id: "m", tokenType: "myToken", tokenOptions: { name: "Ghast", statBlock: "g" } }] },
  { scenes: [], notes: { g: { text: sbB, statBlock: true }, h: { title: "H", text: '<p class="new">x</p>' } }, tokencustomizations: [{ id: "m", tokenType: "myToken", tokenOptions: { name: "Ghast", statBlock: "g" } }] });
check("re-ordered stat block isn't reported", !sbd.journal.notesChanged.some((c) => /Ghast/.test(c.title)), JSON.stringify(sbd.journal.notesChanged));
check("a real formatting change still is", sbd.journal.notesChanged.some((c) => c.title === "'H'" && /formatting changed/.test(c.notes.join())), JSON.stringify(sbd.journal.notesChanged));
const sbAdd = diffBackups({ scenes: [], notes: {} }, { scenes: [], notes: { g: { text: sbA } }, tokencustomizations: [{ id: "m", tokenType: "myToken", tokenOptions: { name: "Ghast", statBlock: "g" } }] });
check("untitled stat-block note named after its token", sbAdd.journal.notesAdded[0] === "stat block of 'Ghast'", JSON.stringify(sbAdd.journal.notesAdded));
check("times shown in local time like list_backup_files", /saved Nov 14, 2026, \d{1,2}:\d{2}\s?[AP]M/.test(t), t.split("\n").slice(0, 3).join(" | "));

check("plainText strips tags and entities", plainText("<p>a&nbsp;&amp;<b>b</b></p><p>c</p>") === "a &b\nc");
check("textChange on identical text is null", textChange("<p>x</p>", "<b>x</b>") === null);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
