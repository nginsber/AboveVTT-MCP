// Run from the AboveVTT-MCP folder: node test/scene-create.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grab = (src, name) => { const i = src.indexOf("function " + name + "("); if (i < 0) throw new Error("missing " + name); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const SH = fs.readFileSync(A + "ScenesHandler.js", "utf8"), ST = fs.readFileSync(A + "Settings.js", "utf8"), WO = fs.readFileSync(A + "WeatherOverlay.js", "utf8");
async function run(saveFails) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="windowContainment"></div></body></html>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.eval(fs.readFileSync(A + "jquery-3.6.0.min.js", "utf8")); w.eval(fs.readFileSync(A + "spectrum-2.0.8.min.js", "utf8"));
  w.eval(grab(WO, "getWeatherTypes"));
  w.eval(`var ItemType={Folder:'folder',Scene:'scene'}; var RootFolder={Scenes:{id:'scenesFolder',path:'/Scenes'}};
   $.fn.draggable=function(){return this}; $.fn.resizable=function(){return this};
   window.MB={sendMessage(){}}; window.MIXER={playlists(){return {}}}; window.DM=true; window.gameId='8258198';
   window.CURRENT_SCENE_DATA={id:'s1'}; window.PLAYER_SCENE_ID='s1'; window.SCENE_DEFAULT_SETTINGS={snap:true, grid:false};
   let n=0; function uuid(){ return 'new'+(++n) }
   function noisy_log(){} function frame_z_index_when_click(){} function build_combat_tracker_loading_indicator(){return $('<div>')}
   function dropBoxOptions(){return {}} function createCustomDropboxChooser(){return $('<button>')} function createCustomOnedriveChooser(){return $('<button>')} function createCustomAvttChooser(){return $('<button>')}
   function floating_window_title_bar(){return $('<div><div class="title-bar-exit"></div></div>')}
   function set_darkness_background(){} function redraw_grid(){} function clear_grid(){} function redraw_alphanum_grid(){} function set_weather(){} function set_weather_size(){}
   async function parse_img(u){return u} async function normalize_scene_urls(a){return a} function sanitize_folder_path(p){return p.replace(/\\/+/g,'/')}
   window.migrated=[]; var AboveApi={ async migrateScenes(g,arr){ if(${saveFails}) throw new Error('server said no'); window.migrated.push(...arr.map(s=>s.title)) } };
   window.ScenesHandler={scenes:[{id:'s1',title:'The Tavern'},{id:'f1',title:'Chapter 1',itemType:'folder',parentId:'scenesFolder'},{id:'s2',title:'Ruins',parentId:'f1'}],
     async persist_scene(i){ } };`);
  w.eval(fs.readFileSync(A + "ScenesPanel.js", "utf8"));
  for (const fn of ["folder_path_of_scene", "find_parent_of_scene", "find_ancestors_of_scene"]) w.eval(grab(SH, fn));
  w.eval(grab(ST, "get_custom_scene_settings"));
  w.eval("did_update_scenes = async function(){ window.refreshes=(window.refreshes||0)+1 }");
  for (const f of ["page.js", "scenes.js", "scene_config.js", "scene_create.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
  const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
  let id = 0; const call = async (method, params) => { const my = ++id; w.dispatchEvent(new w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "call", id: my, method, params } }, source: w })); for (let t = 0; t < 200 && !out[my]; t++) await new Promise((r) => setTimeout(r, 10)); return out[my]; };
  return { w, call };
}
const show = (label, r) => console.log(label.padEnd(24), r.ok ? JSON.stringify(r.result) : "ERROR: " + r.error);
let { w, call } = await run(false);
show("top level, no map", await call("create_scene", { scenes: [{ title: "Blank Scene" }] }));
show("in folder + config", await call("create_scene", { folderTitle: "Chapter 1", scenes: [
  { title: "Ruins", mapUrl: "https://example.com/ruins2.jpg", config: { grid: true, hpps: 70, vpps: 70, darkness_filter: 30 } },
  { title: "Waterfall", mapUrl: "https://example.com/falls.mp4" }] }));
show("bad config key", await call("create_scene", { scenes: [{ title: "Oops", config: { nope: 1 } }] }));
show("bad map link", await call("create_scene", { scenes: [{ title: "X", mapUrl: "data:image/png;base64,AAA" }] }));
show("no title", await call("create_scene", { scenes: [{ mapUrl: "https://e.com/a.png" }] }));
show("missing folder", await call("create_scene", { folderTitle: "Nowhere", scenes: [{ title: "Y" }] }));
console.log("saved to server:", JSON.stringify(w.migrated));
const ruins = w.ScenesHandler.scenes.find((s) => s.title === "Ruins 1");
console.log("Ruins 1 stored:", JSON.stringify({ parentId: ruins.parentId, grid: ruins.grid, hpps: ruins.hpps, darkness: ruins.darkness_filter, snap: ruins.snap, map: ruins.player_map }));
console.log("DM still on:", w.CURRENT_SCENE_DATA.id, " dialog left open:", w.$("#edit_scene_form").length);
console.log("\n" + (await call("list_scenes", {})).result.outline);
({ w, call } = await run(true));
show("\nsave fails", await call("create_scene", { scenes: [{ title: "Ghost" }] }));
console.log("ghost left behind:", w.ScenesHandler.scenes.some((s) => s.title === "Ghost"));
process.exit(0);
