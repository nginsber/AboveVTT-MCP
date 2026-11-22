import { JSDOM } from "jsdom"; import fs from "node:fs";
// Run from the AboveVTT-MCP folder: node test/scene-config.test.mjs  (needs: npm i jsdom; AboveVTT folder next to this one)
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="windowContainment"></div></body></html>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
w.eval(fs.readFileSync(A+"jquery-3.6.0.min.js","utf8"));
w.eval(fs.readFileSync(A+"spectrum-2.0.8.min.js","utf8"));
const wo = fs.readFileSync(A+"WeatherOverlay.js","utf8"); const i0 = wo.indexOf("function getWeatherTypes"); 
// pull just getWeatherTypes (balanced braces)
let depth=0,j=wo.indexOf("{",i0); for(let k=j;k<wo.length;k++){ if(wo[k]=="{")depth++; else if(wo[k]=="}"){depth--; if(!depth){j=k+1;break;}} }
w.eval(wo.slice(i0,j));
w.eval(`
 const ItemType={Folder:'folder',Scene:'scene'}; const RootFolder={Scenes:{id:'scenesFolder',path:'/Scenes'}};
 $.fn.draggable=function(){return this}; $.fn.resizable=function(){return this};
 window.MB={sent:[],sendMessage(t,d){this.sent.push([t,JSON.parse(JSON.stringify(d))])}};
 window.MIXER={playlists(){return {"p1":{name:"Tavern Songs"},"p2":{name:"Battle"}}}};
 window.DM=true; window.CURRENT_SCENE_DATA={id:'s1'}; window.PLAYER_SCENE_ID='s1';
 function noisy_log(){}; function frame_z_index_when_click(){}; function build_combat_tracker_loading_indicator(){return $("<div>")}; function dropBoxOptions(){return {}}; function createCustomDropboxChooser(){return $('<button>')}; function createCustomOnedriveChooser(){return $('<button>')}; function createCustomAvttChooser(){return $('<button>')};
 function floating_window_title_bar(){return $('<div><div class="title-bar-exit"></div></div>')}
 function set_darkness_background(){} function redraw_grid(){} function clear_grid(){} function redraw_alphanum_grid(){} function set_weather(){} function set_weather_size(){}
 async function parse_img(u){return u} async function normalize_scene_urls(a){return a}
 function update_token_folders_remembered_state(){} function redraw_scene_list(){} 
 window.didUpdate=0;
 window.ScenesHandler={scenes:[
   {id:'s1',title:'The Tavern',player_map:'https://x/t.png',grid:'1',grid_color:'rgba(0, 0, 0, 0.5)',grid_line_width:1,hpps:50,vpps:50,offsetx:0,offsety:0,fpsq:5,upsq:'ft',scale_factor:1,darkness_filter:0,snap:'1',scale_check:true},
   {id:'f1',title:'Chapter',itemType:'folder'},
   {id:'s2',title:'Ice Cave',player_map:'https://x/c.png',grid:'0',scale_check:true}],
   async persist_scene(i){ const d=Object.assign({},this.scenes[i]); this.scenes[i]=d; window.MB.sendMessage('custom/myVTT/update_scene',d); }};
`);
// Load AboveVTT's real dialog code (whole ScenesPanel.js) — then override did_update_scenes to count.
w.eval(fs.readFileSync(A+"ScenesPanel.js","utf8"));
w.eval("did_update_scenes = async function(){ window.didUpdate++ }");
for (const f of ["page.js","scenes.js","scene_config.js"]) w.eval(fs.readFileSync(X+f,"utf8"));
const out={}; w.addEventListener("message", e => { if (e.data?.payload?.type==="result") out[e.data.payload.id]=e.data.payload; });
let id=0; const call = (method, params) => w.__avttMcpRun(method, params); // the locked entry point background.js uses
const g = await call("get_scene_config",{});
console.log("GET ok:", g.ok, g.error||""); if(g.ok){ for(const f of g.result.fields) console.log("  ",f.key,"=",JSON.stringify(f.valueLabel??f.value), f.choices? "choices:"+f.choices.map(c=>c.label).join("|"):"", f.min!==undefined?`[${f.min}-${f.max}]`:""); console.log("  extras:", JSON.stringify(g.result.extras)); }
console.log("dialog left open?", w.$("#edit_scene_form").length, "hide css left?", w.$("#avtt-mcp-hide-scene-dialog").length);
const u = await call("update_scene_config",{sceneTitle:"ice cave", changes:{title:"Ice Cave (lower)", grid:true, grid_color:"#ff0000", darkness_filter:60, weather:"Snow", weatherIntensity:150, playlist:"Battle", gridOver:"Over Darkness/Fog", snap:false}});
console.log("UPDATE:", u.ok, u.error||JSON.stringify(u.result,null,1));
const s2=w.ScenesHandler.scenes[2]; console.log("stored:", JSON.stringify({title:s2.title,grid:s2.grid,grid_color:s2.grid_color,darkness_filter:s2.darkness_filter,weather:s2.weather,weatherIntensity:s2.weatherIntensity,playlist:s2.playlist,gridOver:s2.gridOver,snap:s2.snap}));
console.log("DM still on:", w.CURRENT_SCENE_DATA.id, "update msgs:", w.MB.sent.filter(m=>m[0]==='custom/myVTT/update_scene').length, "did_update_scenes:", w.didUpdate);
for (const [p,lab] of [[{sceneId:"s2",changes:{nope:1}},"unknown key"],[{sceneId:"s2",changes:{darkness_filter:500}},"out of range"],[{sceneId:"s2",changes:{weather:"Lava"}},"bad choice"],[{sceneId:"zzz",changes:{grid:true}},"bad id"],[{sceneId:"s2",changes:{snap:false}},"no-op"]]) { const r=await call("update_scene_config",p); console.log(lab+":", r.ok? r.result.message : r.error); }
const c=await call("update_scene_config",{changes:{grid_line_width:2.5,darkness_filter:30,dm_map_usable:true,dm_map:"https://x/dm.png",upsq:"m"}}); console.log("CURRENT:",c.ok?JSON.stringify(c.result.changed):c.error); console.log("stored s1:",JSON.stringify((({grid_line_width,darkness_filter,dm_map_usable,dm_map,upsq,snap})=>({grid_line_width,darkness_filter,dm_map_usable,dm_map,upsq,snap}))(w.ScenesHandler.scenes[0])));
w.eval("$('body').append(\"<form id='edit_scene_form'></form>\")"); const busy=await call("get_scene_config",{}); console.log("user dialog open:", busy.error); 
w.close();
