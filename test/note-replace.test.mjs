// Run from the AboveVTT-MCP folder: node test/note-replace.test.mjs  (needs jsdom; AboveVTT folder next to this one)
// Checks find-and-replace in update_note (review item 6) against AboveVTT's real sanitizer and journal code.
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

let fails = 0;
const check = (label, cond, text = "") => { console.log((cond ? "ok   " : "FAIL ") + label); if (!cond) { fails++; console.log("     " + text); } };
const N = () => w.JOURNAL.notes;
// A note as AboveVTT's editor (TinyMCE) stores it: entities, a non-breaking space, bold, a link, a list.
const original = '<h2>Session 3 &amp; 4</h2><p>We meet on Nov&nbsp;3 at the "Rusty Anchor".</p>' +
  '<p>The <strong>Cult Leader</strong> has 45 HP. Bob&#39;s rate: 5 gp &lt; 10 gp.</p>' +
  '<p>See <a href="https://example.com/nov-3">the Nov 3 map</a>.</p><ul><li>Goblin x3</li><li>Goblin boss</li></ul>';
N().n1.text = original; N().n1.plain = "x";
const saves0 = w.JOURNAL.saves;

let r = await call("update_note", { noteId: "n1", replacements: [{ find: "Nov 3 at", replace: "Nov 10 at" }, { find: "45 HP", replace: "52 HP" }] });
check("two plain-text fixes applied", r.ok && N().n1.text.includes("Nov 10 at the") && N().n1.text.includes("52 HP"), JSON.stringify(r));
check("plain-text find matches a non-breaking space", r.ok && !N().n1.text.includes("Nov&nbsp;3 at"));
check("the rest of the note is untouched", N().n1.text.includes("<strong>Cult Leader</strong>") && N().n1.text.includes('href="https://example.com/nov-3"'), N().n1.text);
check("saved once, search copy updated", w.JOURNAL.saves === saves0 + 1 && /52 HP/.test(N().n1.plain), N().n1.plain);
check("reply has before/after excerpts with the change marked", r.result?.replaced?.length === 2 && /has «45 HP»\. Bob/.test(r.result.replaced[1].before) && /has «52 HP»\. Bob/.test(r.result.replaced[1].after), JSON.stringify(r.result?.replaced));
check("changed reads 'content (2 places replaced)'", r.result?.changed?.includes("content (2 places replaced)"), JSON.stringify(r.result?.changed));

r = await call("update_note", { noteId: "n1", replacements: [{ find: "Session 3 & 4", replace: "Sessions 3 & 4" }, { find: "Bob's rate: 5 gp < 10 gp", replace: "Bob's rate: 6 gp" }] });
check("& < ' in finds match their stored &amp; &lt; &#39; forms", r.ok && N().n1.text.includes("Sessions 3 &amp; 4") && N().n1.text.includes("Bob's rate: 6 gp"), r.error || N().n1.text);
check("replacement text is escaped, not turned into HTML", r.ok && N().n1.text.includes("&amp; 4") && !/<\/?6/.test(N().n1.text));

let before = N().n1.text, savesB = w.JOURNAL.saves;
r = await call("update_note", { noteId: "n1", replacements: [{ find: "Goblin", replace: "Kobold" }] });
check("a find that appears twice is refused", !r.ok && /appears 2 times/.test(r.error) && N().n1.text === before, r.error);
check("…and the error mentions replace all", /replace all/.test(r.error), r.error);

r = await call("update_note", { noteId: "n1", replacements: [{ find: "52 HP", replace: "60 HP" }, { find: "Dragon", replace: "Wyrm" }] });
check("one missing find → nothing changes at all", !r.ok && /Nothing was changed/.test(r.error) && /'Dragon' isn't in the note/.test(r.error) && N().n1.text === before && w.JOURNAL.saves === savesB, r.error);
r = await call("update_note", { noteId: "n1", replacements: [{ find: "The Cult Leader has", replace: "x" }] });
check("text split by bold is explained, not just 'not found'", !r.ok && /split by formatting/.test(r.error), r.error);
r = await call("update_note", { noteId: "n1", replacements: [{ find: "strong", replace: "em" }] });
check("plain-text finds never match tag names", !r.ok && /isn't in the note/.test(r.error) && N().n1.text === before, r.error);
r = await call("update_note", { noteId: "n1", replacements: [{ find: "nov-3", replace: "nov-10" }] });
check("…or link addresses", !r.ok && N().n1.text === before, r.error);
r = await call("update_note", { noteId: "n1", replacements: [{ find: "Goblin x3", replace: "Goblin x4" }, { find: "x3", replace: "x5" }] });
check("overlapping finds are refused", !r.ok && /overlap/.test(r.error) && N().n1.text === before, r.error);
r = await call("update_note", { noteId: "n1", content: "x", replacements: [{ find: "52 HP", replace: "1 HP" }] });
check("content and replacements together are refused", !r.ok && /either content or replacements/.test(r.error), r.error);
r = await call("update_note", { noteId: "n1", replacements: [{ find: "52 HP", replace: "" }] });
check("replace with \"\" removes the text", r.ok && !N().n1.text.includes("52 HP"), r.error);

r = await call("update_note", { noteId: "n1", format: "html", replacements: [{ find: "<strong>Cult Leader</strong>", replace: "<em>Cult Leader</em>" }] });
check("format html can change formatting", r.ok && N().n1.text.includes("<em>Cult Leader</em>"), r.error || N().n1.text);
r = await call("update_note", { noteId: "n1", format: "html", replacements: [{ find: "<em>Cult Leader</em>", replace: '<em onclick="x()">Cult Leader</em><script>alert(1)</script>' }] });
check("html replacements go through AboveVTT's sanitizer", r.ok && !/onclick|<script/.test(N().n1.text), N().n1.text);

r = await call("update_note", { noteId: "n1", replacements: [{ find: "Goblin boss", replace: "Goblin chief\nwith a hat" }] });
check("a newline in the replacement becomes a line break", r.ok && N().n1.text.includes("Goblin chief<br>with a hat"), N().n1.text);

// ---- replace all ----------------------------------------------------------------------------
before = N().n1.text;
const savesP = w.JOURNAL.saves;
r = await call("update_note", { noteId: "n1", dryRun: true, replacements: [{ find: "Goblin", replace: "Kobold", all: true }] });
check("replace-all preview lists every place, changes nothing", r.ok && r.result.dryRun === true && r.result.replaced[0].count === 2 &&
  r.result.replaced[0].places.every((pl) => /Goblin/.test(pl.before) && /Kobold/.test(pl.after)) && N().n1.text === before && w.JOURNAL.saves === savesP, JSON.stringify(r));
check("preview snippets mark each place's own text in «»", /«Goblin» x3/.test(r.result?.replaced[0].places[0].before) && /«Goblin» chief/.test(r.result?.replaced[0].places[1].before) && /«Kobold» chief/.test(r.result?.replaced[0].places[1].after), JSON.stringify(r.result?.replaced[0].places));
r = await call("update_note", { noteId: "n1", replacements: [{ find: "Goblin", replace: "Kobold", all: true }] });
check("replace all changes both places", r.ok && !N().n1.text.includes("Goblin") && (N().n1.text.match(/Kobold/g) || []).length === 2 && w.JOURNAL.saves === savesP + 1, r.error || N().n1.text);
check("changed reads 'content (2 places replaced)'", r.result?.changed?.includes("content (2 places replaced)"), JSON.stringify(r.result?.changed));
before = N().n1.text;
r = await call("update_note", { noteId: "n1", replacements: [{ find: "Kobold", replace: "Gnoll", all: true }, { find: "Dragon", replace: "x", all: true }] });
check("replace all still needs the text to be there; nothing changes otherwise", !r.ok && /'Dragon' isn't in the note/.test(r.error) && N().n1.text === before, r.error);
r = await call("update_note", { noteId: "n1", replacements: [{ find: "Kobold", replace: "Gnoll", all: true }, { find: "Kobold x3", replace: "Gnoll x3" }] });
check("replace all overlapping another pair is refused", !r.ok && /overlap/.test(r.error) && N().n1.text === before, r.error);
r = await call("update_note", { noteId: "n1", dryRun: true, content: "x" });
check("dryRun only previews replacements", !r.ok && /previews find-and-replace only/.test(r.error), r.error);
r = await call("update_note", { noteId: "n1", dryRun: true, replacements: [{ find: "Kobold x3", replace: "Kobold x4" }] });
check("preview's text length is the visible text, like the note's own length", r.ok && r.result.afterLength === r.result.before.length, `${r.result?.before?.length} → ${r.result?.afterLength}`);
check("ordinary replacements can be previewed too", r.ok && r.result.dryRun && r.result.replaced[0].count === 1 && N().n1.text === before, JSON.stringify(r));
r = await call("update_note", { noteId: "tok1", replacements: [{ find: "things", replace: "about the cult" }] });
check("works on token notes (token redrawn)", r.ok && N().tok1.text.includes("Knows about the cult") && w.placed >= 1, r.error || N().tok1.text);
r = await call("update_note", { noteId: "ddb1", replacements: [{ find: "x", replace: "y" }] });
check("D&D Beyond book pages refused", !r.ok && /source book/.test(r.error), r.error);
w.eval(`$('body').append('<textarea data-note-id="n1"></textarea>')`);
r = await call("update_note", { noteId: "n1", replacements: [{ find: "Goblin x3", replace: "Goblin x4" }] });
check("refused while the note is open for editing", !r.ok && /open for editing/.test(r.error), r.error);

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
