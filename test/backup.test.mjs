// Run from the AboveVTT-MCP folder: node test/backup.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grab = (src, name) => { const i = src.indexOf("function " + name + "("); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
async function run(mode) {
  const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
  const w = dom.window;
  w.eval(fs.readFileSync(A + "jquery-3.6.0.min.js", "utf8"));
  w.eval(`var ItemType={Folder:'folder'}; window.MB={}; window.DM=true; window.downloads=[];
    window.CAMPAIGN_INFO={id:'8258198',name:'Frozen Sick'};
    window.ScenesHandler={scenes:[{id:'s1',title:'A'},{id:'f1',title:'F',itemType:'folder'}]};
    window.TOKEN_CUSTOMIZATIONS=[{},{}]; window.JOURNAL={notes:{a:{},b:{},c:{}},chapters:[{}]}; window.SOUNDPADS={x:{}};
    window.MIXER={state(){return {}}}; window.TRACK_LIBRARY={map(){return new Map([[1,{}],[2,{}]])}};
    function download(data,filename){ window.downloads.push(filename) } function b64EncodeUnicode(s){return s}
    function showError(e,m){ window.shownErrors=(window.shownErrors||0)+1 } 
    var AboveApi={ exportScenes(){ return '${mode}'==='fast' ? Promise.resolve([{}]) : Promise.reject(new Error('too big')) } };
    function export_main_scenes_folder_backup(){ return new Promise((res,rej)=>setTimeout(()=> '${mode}'==='fallback' ? res([{}]) : rej(new Error('nope')), 1500)) }`);
  const st = fs.readFileSync(A + "Settings.js", "utf8");
  w.eval(grab(st, "build_import_loading_indicator")); w.eval(grab(st, "export_file"));
  for (const f of ["page.js", "backup.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
  const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
  w.dispatchEvent(new w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "call", id: 1, method: "export_backup", params: { timeoutSeconds: 10 } } }, source: w }));
  for (let t = 0; t < 600 && !out[1]; t++) await new Promise((r) => setTimeout(r, 25));
  console.log(mode.padEnd(9), out[1]?.ok ? JSON.stringify(out[1].result) : "ERROR: " + out[1]?.error, "| downloads:", JSON.stringify(w.downloads));
  w.close();
}
for (const m of ["fast", "fallback", "fail"]) await run(m);
