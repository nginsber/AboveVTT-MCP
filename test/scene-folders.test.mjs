// Run from the AboveVTT-MCP folder: node test/scene-folders.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(fs.readFileSync(A + "jquery-3.6.0.min.js", "utf8"));
w.eval(`var ItemType={Folder:'folder',Scene:'scene'}; var RootFolder={Scenes:{id:'scenesFolder',path:'/Scenes'}};
 function noisy_log(){} function showError(e){ throw e } function sanitize_folder_path(p){return p.replace(/\\/+/g,'/')}
 let n=0; function uuid(){ return 'new'+(++n) }
 window.MB={}; window.DM=true; window.CURRENT_SCENE_DATA={id:'s1'}; window.saved=[]; window.refreshes=0;
 window.ScenesHandler={scenes:[
   {id:'s1',title:'The Tavern'}, {id:'f1',title:'Chapter 2',itemType:'folder',parentId:'scenesFolder'},
   {id:'f2',title:'Caves',itemType:'folder',parentId:'f1'}, {id:'s2',title:'Ice Cave',parentId:'f2'},
   {id:'s3',title:'Map 2.1: The Sanctum',parentId:'f1'}],
   async persist_scene(i){ window.saved.push(this.scenes[i].id) } };`);
for (const f of ["ScenesHandler.js"]) { const src = fs.readFileSync(A + f, "utf8"); for (const fn of ["folder_path_of_scene","find_parent_of_scene","find_ancestors_of_scene"]) { const i=src.indexOf("function "+fn+"("); let d=0,j=src.indexOf("{",i); for(let k=j;k<src.length;k++){ if(src[k]=="{")d++; else if(src[k]=="}"){d--; if(!d){j=k+1;break;}} } w.eval(src.slice(i,j)); } }
const sp = fs.readFileSync(A + "ScenesPanel.js", "utf8"); for (const fn of ["rename_scene_folder","move_scene_to_folder"]) { const i=sp.indexOf("function "+fn+"("); let d=0,j=sp.indexOf("{",i); for(let k=j;k<sp.length;k++){ if(sp[k]=="{")d++; else if(sp[k]=="}"){d--; if(!d){j=k+1;break;}} } w.eval(sp.slice(i,j)); }
w.eval("async function did_update_scenes(){ window.refreshes++ }");
for (const f of ["page.js", "scenes.js", "scene_folders.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
let id = 0; const call = (method, params) => w.__avttMcpRun(method, params); // the locked entry point background.js uses
const show = (label, r) => console.log(label.padEnd(26), r.ok ? JSON.stringify(r.result) : "ERROR: " + r.error);
show("create top-level", await call("create_folder", { title: "Chapter 1", color: "#4a90e2" }));
show("create nested", await call("create_folder", { title: "Town", parentFolderTitle: "Chapter 1" }));
show("create duplicate", await call("create_folder", { title: "chapter 1" }));
show("create with slash", await call("create_folder", { title: "A/B" }));
show("move scene by title", await call("move_scene", { items: [{ title: "The Tavern" }], folderTitle: "Town" }));
show("move folder+scene", await call("move_scene", { items: ["f2", { title: "Map 2.1: The Sanctum" }], folderTitle: "Chapter 1" }));
show("move into own child", await call("move_scene", { items: [{ title: "Chapter 1" }], folderTitle: "Town" }));
show("move already there", await call("move_scene", { items: ["s1"], folderTitle: "Town" }));
show("move to top level", await call("move_scene", { items: ["s3"], toTopLevel: true }));
show("rename + colour", await call("rename_folder", { folderTitle: "Town", newTitle: "Phandalin", color: "red" }));
show("rename to sibling name", await call("rename_folder", { folderTitle: "Caves", newTitle: "Phandalin" }));
show("bad colour", await call("rename_folder", { folderTitle: "Caves", color: "blurple" }));
const ls = await call("list_scenes", {}); console.log("\n" + ls.result.outline);
console.log("\nsaved:", w.saved.join(","), " refreshes:", w.refreshes);
w.close();
