// Run from the AboveVTT-MCP folder: node test/fog.test.mjs  (needs jsdom; AboveVTT folder next to this one)
// Uses AboveVTT's real sync_fog() and the FOG menu's ALL-button values from Fog.js; drawing is stubbed.
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grabBlock = (src, start) => { const i = src.indexOf(start); if (i < 0) throw new Error("missing " + start); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const FOG = fs.readFileSync(A + "Fog.js", "utf8");
// The connector must write exactly what AboveVTT's own ALL buttons write.
const revealAllInAvtt = /window\.REVEALED = (\[\[0, 0, 0, 0, 2, 0\]\]);\s*redraw_fog\(\);\s*sync_fog\(\);/.test(FOG);
const hideAllInAvtt = /window\.REVEALED = \[\];\s*redraw_fog\(\);\s*sync_fog\(\);/.test(FOG);
console.log("AboveVTT ALL buttons match:", revealAllInAvtt && hideAllInAvtt);

const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(grabBlock(FOG, "function sync_fog("));
w.eval(`var ItemType={Folder:'folder'};
  window.sent=[]; window.redraws=0; window.vis=0;
  var cloud={ s1:{ id:'s1', fog_of_war:'1', reveals:[[10,10,100,100,0,0],[50,50,20,0,1,0],[5,5,5,5,0,1]] },
              s2:{ id:'s2', fog_of_war:'1', reveals:[[0,0,0,0,2,0,1]] } };
  // Stand-in for AboveVTT's cloud: a fogdata message is saved on the scene it is addressed to.
  window.MB={ sendMessage(type,data,skip,scene){ const sid=scene ?? window.CURRENT_SCENE_DATA.id; window.sent.push({type,scene:sid,data:JSON.parse(JSON.stringify(data))}); if(type==='custom/myVTT/fogdata') cloud[sid].reveals=JSON.parse(JSON.stringify(data)); } };
  var AboveApi={ async getScene(id){ if(!cloud[id]) throw new Error('no'); return { data: JSON.parse(JSON.stringify(cloud[id])) } } };
  function redraw_fog(){ window.redraws++ } function check_token_visibility(){ window.vis++ }
  window.DM=true; window.FOG_OF_WAR=true; window.PLAYER_SCENE_ID='s1';
  window.CURRENT_SCENE_DATA={id:'s1', title:'The Tavern'};
  window.REVEALED=JSON.parse(JSON.stringify(cloud.s1.reveals));
  window.ScenesHandler={scenes:[{id:'s1',title:'The Tavern'},{id:'s2',title:'Ice Cave'},{id:'f1',title:'Folder',itemType:'folder'}]};`);
for (const f of ["page.js", "fog.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
w.AVTT_MCP._remoteCheckDelay = 5;
const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
let id = 0; const call = async (method, params) => { const my = ++id; w.dispatchEvent(new w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "call", id: my, method, params } }, source: w })); for (let t = 0; t < 300 && !out[my]; t++) await new Promise((r) => setTimeout(r, 10)); return out[my]; };
let fails = 0;
const check = (label, cond, extra = "") => { console.log((cond ? "ok   " : "FAIL ") + label, extra); if (!cond) fails++; };
const R = (r) => (r?.ok ? r.result : { error: r?.error ?? "TIMEOUT" });

let r = R(await call("get_fog", {}));
check("get current", r.state === "hidden, with 2 revealed area(s) and 1 re-hidden area(s)" && r.zones === 3 && r.playersHere && r.isCurrentScene, JSON.stringify(r));
r = R(await call("get_fog", { sceneName: "ice cave" }));
check("get other (by name)", r.state === "fully revealed" && !r.playersHere && !r.isCurrentScene, r.state);

r = R(await call("set_fog", { action: "hideAll", dryRun: true }));
check("dry run changes nothing", r.dryRun && r.changed && w.REVEALED.length === 3 && w.sent.length === 0 && w.redraws === 0);

const before = JSON.stringify(w.REVEALED);
r = R(await call("set_fog", { action: "hideAll" }));
check("hide all (current)", r.changed && r.verified && w.REVEALED.length === 0 && w.redraws === 1 && w.vis === 1, r.after?.state);
check("  sent like the ALL button", w.sent.length === 1 && w.sent[0].type === "custom/myVTT/fogdata" && w.sent[0].scene === "s1" && w.sent[0].data.length === 0);
check("  previous returned for backup", JSON.stringify(r.previous) === before);

r = R(await call("set_fog", { action: "hideAll" }));
check("already hidden → no change", r.changed === false && w.sent.length === 1);

r = R(await call("set_fog", { action: "set", reveals: JSON.parse(before) }));
check("restore (current)", r.changed && r.verified && JSON.stringify(w.REVEALED) === before);

r = R(await call("set_fog", { sceneId: "s2", action: "hideAll" }));
check("hide all (other scene)", r.changed && r.verified && w.sent.at(-1).scene === "s2" && JSON.stringify(w.REVEALED) === before && w.redraws === 2, "DM's own map untouched");
r = R(await call("set_fog", { sceneId: "s2", action: "revealAll" }));
check("reveal all (other scene)", r.after.state === "fully revealed" && JSON.stringify(w.sent.at(-1).data) === "[[0,0,0,0,2,0]]");

check("bad scene", !(await call("set_fog", { sceneName: "Nope", action: "hideAll" })).ok);
check("folder isn't a scene", !(await call("set_fog", { sceneId: "f1", action: "hideAll" })).ok);
check("bad action", !(await call("set_fog", { action: "explode" })).ok);
check("too large", /too large/.test((await call("set_fog", { action: "set", reveals: [[ "x".repeat(130000) ]] })).error));
w.eval("window.DM=false");
check("players refused", /DM view/.test((await call("get_fog", {})).error));

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
