// Run from the AboveVTT-MCP folder: node test/notes.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grabBlock = (src, start) => { const i = src.indexOf(start); if (i < 0) throw new Error("missing " + start); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const JS = fs.readFileSync(A + "Journal.js", "utf8"), CF = fs.readFileSync(A + "CoreFunctions.js", "utf8");
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(fs.readFileSync(A + "jquery-3.6.0.min.js", "utf8")); w.eval(fs.readFileSync(A + "purify.min.js", "utf8"));
w.eval(grabBlock(CF, "function basic_sanitize_html("));
w.eval(`var ItemType={Folder:'folder'}; let n=0; function uuid(){ return 'id'+(++n) }
  window.sent=[]; window.MB={sendMessage(t,d){ window.sent.push(t + (d.id ? ':'+d.id : '')) }}; window.DM=true;
  window.ScenesHandler={scenes:[{id:'s1',title:'The Tavern'}]}; window.TOKEN_OBJECTS={tok1:{place(){window.placed=(window.placed||0)+1}}};
  window.playerUsers=[{userId:'111',userName:'Aria'},{userId:'222',userName:'Bram'}];
  class FakeJournal {
    constructor(){ this.notes={ n1:{title:'Session 1',text:'<p>Met the innkeeper.</p>',plain:'Met the innkeeper.',player:false},
       s1:{title:'Tavern scene note',text:'<p>Secret door</p>',player:false}, tok1:{title:'Barkeep',text:'<p>Knows things</p>',player:false},
       sb1:{title:'Goblin Boss',text:'<p>AC 17</p>',statBlock:true}, ddb1:{title:'Book page',text:'x',ddbsource:'phb',player:false} };
      this.chapters=[{title:'Old folder without id',collapsed:false,notes:['n1','ddb1']},{id:'c2',title:'Player Handouts',notes:[],shareWithPlayer:true}]; this.saves=0; this.builds=0; }
    persist(){ this.saves++ } build_journal(){ this.builds++ }
    ${grabBlock(JS, "\tnote_visibility(id,visibility){").trim()}
    ${grabBlock(JS, "\tshare_chapter(chapterIndex, shareWithPlayer){").trim()}
    ${grabBlock(JS, "\tisInvalidChapterParent(chapterId, targetId) {").trim()}
    sendNotes(notes){ window.MB.sendMessage('custom/myVTT/notesSync',{notes}) }
  }
  window.JOURNAL = new FakeJournal();`);
for (const f of ["page.js", "notes.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
let id = 0; const call = (method, params) => w.__avttMcpRun(method, params); // the locked entry point background.js uses
const show = (label, r) => console.log(label.padEnd(24), r.ok ? JSON.stringify(r.result).slice(0, 300) : "ERROR: " + r.error);
show("list journal", await call("list_notes", {}));
show("list all", await call("list_notes", { kind: "all" }));
show("search", await call("list_notes", { search: "innkeeper" }));
show("create folder", await call("create_note_folder", { title: "NPCs", parentFolderTitle: "Old folder without id" }));
show("dup folder", await call("create_note_folder", { title: "npcs", parentFolderTitle: "Old folder without id" }));
show("create note text", await call("create_note", { title: "Barkeep Bob", folderTitle: "NPCs", content: "# Bob\nRuns the bar.\n\n- **Friendly**\n- Knows *rumours*\n\n<script>alert(1)</script>", visibility: "dm" }));
const bob = Object.keys(w.JOURNAL.notes).find((k) => w.JOURNAL.notes[k].title === "Barkeep Bob");
console.log("  stored html:", w.JOURNAL.notes[bob].text, "| plain:", JSON.stringify(w.JOURNAL.notes[bob].plain));
show("create shared to Aria", await call("create_note", { title: "Letter", folderTitle: "NPCs", content: "Dear Aria", visibility: ["Aria"] }));
show("create in shared folder", await call("create_note", { title: "Map handout", folderTitle: "Player Handouts", content: "See map" }));
show("create no folder", await call("create_note", { title: "X" }));
show("bad player", await call("create_note", { title: "X", folderTitle: "NPCs", visibility: ["Zed"] }));
show("get note", await call("get_note", { noteTitle: "Barkeep Bob" }));
show("append + share all", await call("update_note", { noteTitle: "Barkeep Bob", content: "Owes the party 5 gp.", mode: "append", visibility: "all" }));
show("rename + move", await call("update_note", { noteTitle: "Barkeep Bob", newTitle: "Bob the Barkeep", folderTitle: "Player Handouts" }));
show("edit ddb note", await call("update_note", { noteTitle: "Book page", content: "x" }));
show("token note edit", await call("update_note", { noteId: "tok1", content: "Knows about the cult." }));
console.log("  token re-placed:", w.placed);
w.eval(`$('body').append('<textarea data-note-id="n1"></textarea>')`);
show("open in editor", await call("update_note", { noteId: "n1", content: "x" }));
show("delete note dry", await call("delete_note", { noteTitle: "Letter", dryRun: true }));
show("delete note", await call("delete_note", { noteTitle: "Letter" }));
show("delete statblock", await call("delete_note", { noteId: "sb1" }));
show("share folder w/ Bram", await call("update_note_folder", { folderTitle: "NPCs", shareWithPlayers: ["Bram"] }));
show("move folder into self", await call("update_note_folder", { folderTitle: "Old folder without id", parentFolderTitle: "NPCs" }));
show("move folder top", await call("update_note_folder", { folderTitle: "NPCs", toTopLevel: true, newTitle: "People" }));
show("delete folder dry", await call("delete_note_folder", { folderTitle: "Player Handouts", dryRun: true }));
show("delete folder", await call("delete_note_folder", { folderTitle: "Player Handouts" }));
show("list after", await call("list_notes", {}));
console.log("messages:", w.sent.join(" | "));
process.exit(0);
