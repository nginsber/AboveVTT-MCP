// Run from the AboveVTT-MCP folder: node test/delete.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grab = (src, name, prefix = "function ") => { const i = src.indexOf(prefix + name + "("); if (i < 0) throw new Error("missing " + name); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const SH = fs.readFileSync(A + "ScenesHandler.js", "utf8"), SP = fs.readFileSync(A + "ScenesPanel.js", "utf8");
function page() {
  const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
  const w = dom.window;
  w.eval(fs.readFileSync(A + "jquery-3.6.0.min.js", "utf8"));
  w.eval(`var ItemType={Folder:'folder',Scene:'scene'}; var RootFolder={Scenes:{id:'scenesFolder',path:'/Scenes'}};
   function noisy_log(){} function remove_zoom_from_storage(){} window.refreshes=0; window.sent=[];
   window.MB={sendMessage(t,d){ window.sent.push(t+':'+(d.id||'')) }}; window.DM=true;
   window.CURRENT_SCENE_DATA={id:'s1'}; window.PLAYER_SCENE_ID='s1';
   window.JOURNAL={notes:{s2:{title:'note'}}, persist(){ window.journalSaved=true }};
   window.ScenesHandler={scenes:[
     {id:'s1',title:'The Tavern'}, {id:'s2',title:'Ice Cave',parentId:'f2'},
     {id:'f1',title:'Test Chapter',itemType:'folder',parentId:'scenesFolder'},
     {id:'f2',title:'Phandalin',itemType:'folder',parentId:'f1'}, {id:'s3',title:'Mill',parentId:'f1'},
     {id:'f3',title:'Log Test',itemType:'folder',parentId:'scenesFolder'},
     {id:'f4',title:'Holds Tavern',itemType:'folder'}, {id:'s4',title:'Spare',parentId:'scenesFolder'}],
     async persist_scene(i){ } };
   window.ScenesHandler.delete_scene = function ${grab(SH, "delete_scene", "")};
   async function did_update_scenes(){ window.refreshes++ }`);
  for (const fn of ["find_descendants_of_scene_id", "find_descendants_of_scene"]) w.eval(grab(SH, fn));
  for (const fn of ["delete_folder_and_all_scenes_within_it", "move_scenes_to_parent_folder", "delete_scenes_folder", "move_scene_to_folder", "rename_scene_folder"]) w.eval(grab(SP, fn));
  for (const f of ["page.js", "scenes.js", "scene_folders.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
  const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
  let id = 0;
  const call = (method, params) => w.__avttMcpRun(method, params); // the locked entry point background.js uses
  return { w, call };
}
const show = (label, r) => console.log(label.padEnd(30), r.ok ? JSON.stringify(r.result) : "ERROR: " + r.error);
let { w, call } = page();
show("dry run scene", await call("delete_scene", { items: [{ title: "Ice Cave" }], dryRun: true }));
console.log("  still there after dry run:", w.ScenesHandler.scenes.some((s) => s.id === "s2"));
show("delete current scene", await call("delete_scene", { items: ["s1"] }));
show("delete a folder as scene", await call("delete_scene", { items: [{ title: "Log Test" }] }));
show("delete scene", await call("delete_scene", { items: [{ title: "Ice Cave" }, "s4"] }));
console.log("  note removed:", !w.JOURNAL.notes.s2, " journal saved:", !!w.journalSaved, " msgs:", w.sent.join(","));
show("dry run folder move-up", await call("delete_folder", { folderTitle: "Test Chapter", dryRun: true }));
show("delete folder move-up", await call("delete_folder", { folderTitle: "Test Chapter" }));
show("delete empty folder", await call("delete_folder", { folderTitle: "Log Test", mode: "deleteEverything" }));
w.eval("window.ScenesHandler.scenes.find(s=>s.id==='s1').parentId='f4'");
show("deleteEverything w/ DM scene", await call("delete_folder", { folderTitle: "Holds Tavern", mode: "deleteEverything" }));
console.log("\n" + (await call("list_scenes", {})).result.outline);
// fresh page: deleteEverything on a nested folder
({ w, call } = page());
show("\ndeleteEverything nested", await call("delete_folder", { folderTitle: "Test Chapter", mode: "deleteEverything" }));
console.log((await call("list_scenes", {})).result.outline);
process.exit(0);
