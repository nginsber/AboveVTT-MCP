// Run from the AboveVTT-MCP folder: node test/settings-actions.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grab = (src, name) => { const i = src.indexOf("function " + name + "("); if (i < 0) throw new Error("missing " + name); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const ST = fs.readFileSync(A + "Settings.js", "utf8");
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/8258198?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(fs.readFileSync(A + "jquery-3.6.0.min.js", "utf8"));
w.eval(`var ItemType={Folder:'folder',MyToken:'myToken',Monster:'monster',PC:'pc',BuiltinToken:'builtinToken',DDBToken:'ddbToken',Encounter:'encounter',Scene:'scene'};
  var RootFolder={Root:{id:'root',path:'/'},MyTokens:{id:'myTokensFolder',path:'/My Tokens'},Scenes:{id:'scenesFolder',path:'/Scenes'},findById(){return undefined},allValues(){return []}};
  window.MB={sendMessage(){}}; window.DM=true; window.gameId='8258198'; window.CAMPAIGN_INFO={id:'8258198',name:'Frozen Sick'};
  window.AVTT_CAMPAIGN_INFO={campaignSettings:{iconUi:false, colorBlindText:true}}; window.EXPERIMENTAL_SETTINGS={exportRemind:7, iconUi:true};
  window.ScenesHandler={scenes:[{id:'s1',title:'The Tavern'}]}; window.CURRENT_SCENE_DATA={id:'s1',title:'The Tavern',tokens:{},scale_factor:1,conversion:1,hpps:72,vpps:72,offsetx:0,offsety:0}; window.ZOOM=1.5;
  window.DRAWINGS=[]; window.REVEALED=[]; window.TOKEN_OBJECTS={};
  window.JOURNAL={notes:{n1:{title:'Note 1'}, sb1:{title:'Goblin',statBlock:true}},chapters:[{id:'c1',title:'Ch',notes:['n1']}],persist(){window.journalSaved=(window.journalSaved||0)+1},build_journal(){}};
  window.SOUNDPADS={pad:{}}; window.MIXER={state(){return {vol:1}}, _write(){window.mixerWritten=true}}; window.TRACK_LIBRARY={map(){return new Map([[1,{name:'Song'}]])}, _write(){window.libWritten=true}};
  window.downloads=[]; function download(data,filename){ window.downloads.push({filename,data}) }
  function find_game_id(){return '8258198'} function noisy_log(){} function get_avtt_setting_is_global(){return false}
  window.savedTC=0; function persist_all_token_customizations(list, cb){ window.savedTC++; cb && cb() }
  function showError(e){ throw e } function migrate_convert_mytokens_to_customizations(){return []} function migrate_tokendata(){return []}
  window.migrated=[]; var AboveApi={ async migrateScenes(g,s){ window.migrated.push(...s.map(x=>x.title)) }, async exportScenes(secret){ if(secret==='8258198-leakysecret9') throw new Error('bad request for '+secret); return secret==='8258198-old' ? [{id:'r1',title:'Old Cave'},{id:'r2',title:'Old Keep'}] : [] } };`);
// real TokenCustomization class
const TC = fs.readFileSync(A + "TokenCustomization.js", "utf8");
const ci = TC.indexOf("class TokenCustomization"); let d = 0, cj = TC.indexOf("{", ci); for (let k = cj; k < TC.length; k++) { if (TC[k] == "{") d++; else if (TC[k] == "}") { d--; if (!d) { cj = k + 1; break; } } }
w.eval("var TokenCustomization = " + TC.slice(ci, cj) + ";");
w.eval(`window.TOKEN_CUSTOMIZATIONS=[ TokenCustomization.fromJson({id:'g1',tokenType:'myToken',parentId:'myTokensFolder',rootId:'myTokensFolder',tokenOptions:{name:'Goblin Boss',hp:30,armorClass:15,statBlock:'sb1',alternativeImages:['https://x/g.png']}}),
  TokenCustomization.fromJson({id:'f1',tokenType:'folder',parentId:'myTokensFolder',rootId:'myTokensFolder',tokenOptions:{}}) ];`);
for (const fn of ["b64EncodeUnicode", "b64DecodeUnicode", "build_import_loading_indicator", "export_current_scene", "export_token_customization", "export_journal", "export_audio", "import_process_datafile_text", "persist_experimental_settings", "set_avtt_setting_value", "clear_avtt_setting"]) w.eval(grab(ST, fn));
w.eval("function set_avtt_setting_value(n,v){ window.EXPERIMENTAL_SETTINGS[n]=v }");
for (const f of ["page.js", "settings_actions.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
let id = 0; const call = (method, params) => w.__avttMcpRun(method, params); // the locked entry point background.js uses
const show = (label, r) => console.log(label.padEnd(26), r.ok ? JSON.stringify(r.result).slice(0, 330) : "ERROR: " + r.error);
for (const a of ["exportCurrentScene", "exportTokenCustomizations", "exportJournal", "exportAudio"]) show(a, await call("settings_action", { action: a }));
console.log("  downloads:", w.downloads.map((x) => x.filename).join(", "));
show("storeGridVisualSize", await call("settings_action", { action: "storeGridVisualSize" }));
show("clearGridVisualSize", await call("settings_action", { action: "clearGridVisualSize" }));
show("match (dry)", await call("settings_action", { action: "matchCampaignSettings", dryRun: true }));
show("match", await call("settings_action", { action: "matchCampaignSettings" }));
console.log("  stored settings:", w.localStorage.getItem("ExperimentalSettings8258198"));
show("recover (no id)", await call("settings_action", { action: "recoverScenes" }));
show("recover wrong campaign", await call("settings_action", { action: "recoverScenes", oldInviteId: "999-abc" }));
show("recover (dry)", await call("settings_action", { action: "recoverScenes", oldInviteId: "https://www.dndbeyond.com/campaigns/join/8258198-old", dryRun: true }));
{ const r = await call("settings_action", { action: "recoverScenes", oldInviteId: "8258198-leakysecret9", dryRun: true });
  show("recover error scrubbed", r);
  if (r.ok || /leakysecret/.test(r.error)) { console.log("FAIL: invite secret leaked in error"); process.exit(1); } }
// import round trip using the token export produced above
const tokenFile = w.downloads.find((x) => x.filename.endsWith("-token.abovevtt")).data;
const full = w.b64EncodeUnicode(JSON.stringify({ version: 2, scenes: [{ id: "s1", title: "The Tavern" }, { id: "s9", title: "New Import" }], tokencustomizations: [{ id: "g2", tokenType: "myToken", parentId: "myTokensFolder", rootId: "myTokensFolder", tokenOptions: { name: "Orc" } }], notes: { n1: { title: "Note 1 v2" }, n7: { title: "Fresh" } }, journalchapters: [{ id: "c2", title: "Ch2", notes: ["n7"] }], soundpads: { pad2: {} }, tracklibrary: [[5, { name: "x" }]], mixerstate: { vol: 0.5 } }));
show("import tokens (dry)", await call("import_backup", { fileText: tokenFile, fileName: "Frozen Sick-token.abovevtt", dryRun: true }));
show("import full (dry)", await call("import_backup", { fileText: full, fileName: "full.abovevtt", dryRun: true }));
show("import garbage", await call("import_backup", { fileText: "not a file", fileName: "x.abovevtt", dryRun: true }));
show("import full", await call("import_backup", { fileText: full, fileName: "full.abovevtt", reloadAfter: false }));
console.log("  migrated:", JSON.stringify(w.migrated), "notes:", Object.keys(w.JOURNAL.notes).join(","), "n1:", w.JOURNAL.notes.n1.title, "TCs:", w.TOKEN_CUSTOMIZATIONS.map((t) => t.id).join(","), "mixer/lib written:", !!w.mixerWritten, !!w.libWritten);
show("clear overrides (dry)", await call("settings_action", { action: "clearAllTokenOptionOverrides", dryRun: true }));
show("clear overrides", await call("settings_action", { action: "clearAllTokenOptionOverrides" }));
console.log("  goblin options now:", JSON.stringify(w.TOKEN_CUSTOMIZATIONS.find((t) => t.id === "g1").tokenOptions));
process.exit(0);
