// Run from the AboveVTT-MCP folder: node test/backup.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grab = (src, name) => { const i = src.indexOf("function " + name + "("); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : "  " + extra}`); };
const STAMPED = /^Frozen Sick-\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.abovevtt$/;
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
  const originalDownload = w.download;
  out[1] = await w.__avttMcpRun("export_backup", { timeoutSeconds: 10 }); // the locked entry point background.js uses
  console.log(mode.padEnd(9), out[1]?.ok ? JSON.stringify(out[1].result) : "ERROR: " + out[1]?.error, "| downloads:", JSON.stringify(w.downloads));
  if (mode !== "fail") {
    check(`${mode}: file named with date and time`, STAMPED.test(w.downloads[0] || ""), JSON.stringify(w.downloads));
    check(`${mode}: reported name is the name Chrome got`, out[1]?.result?.filename === w.downloads[0], out[1]?.result?.filename);
  } else check("fail: error reported, nothing downloaded", !out[1]?.ok && !w.downloads.length);
  check(`${mode}: AboveVTT's own download() put back afterwards`, w.download === originalDownload);
  w.download("x", "Frozen Sick-2026-11-23.abovevtt");
  check(`${mode}: AboveVTT's EXPORT button still names by date only`, w.downloads[w.downloads.length - 1] === "Frozen Sick-2026-11-23.abovevtt");
  w.close();
}
for (const m of ["fast", "fallback", "fail"]) await run(m);

// The renaming rule itself
{
  const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
  dom.window.eval(fs.readFileSync(X + "page.js", "utf8"));
  const M = dom.window.AVTT_MCP, st = "2026-11-23 18-45-07";
  check("date → date and time", M.stampFileName("Frozen Sick-2026-11-23.abovevtt", st) === "Frozen Sick-2026-11-23 18-45-07.abovevtt");
  check("AboveVTT's unpadded dates", M.stampFileName("Frozen Sick-2026-4-2.abovevtt", st) === "Frozen Sick-2026-11-23 18-45-07.abovevtt");
  check("kind suffix kept (-journal, -token, -audio)", M.stampFileName("Frozen Sick-2026-11-23-journal.abovevtt", st) === "Frozen Sick-2026-11-23 18-45-07-journal.abovevtt");
  check("a name with a date in it keeps it", M.stampFileName("Map 2026-1-1 copy-2026-11-23.abovevtt", st) === "Map 2026-1-1 copy-2026-11-23 18-45-07.abovevtt");
  check("unexpected name: stamp added before .abovevtt", M.stampFileName("Odd.abovevtt", st) === "Odd 2026-11-23 18-45-07.abovevtt");
  check("timestamp has no ':' and is zero-padded", /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}$/.test(M.timestamp(new Date(2026, 0, 5, 7, 3, 9))) && M.timestamp(new Date(2026, 0, 5, 7, 3, 9)) === "2026-01-05 07-03-09");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
