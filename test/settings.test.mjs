// Run from the AboveVTT-MCP folder: node test/settings.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grab = (src, name) => { const i = src.indexOf("function " + name + "("); if (i < 0) throw new Error("missing " + name); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const ST = fs.readFileSync(A + "Settings.js", "utf8"), TK = fs.readFileSync(A + "Token.js", "utf8");
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/8258198?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(fs.readFileSync(A + "jquery-3.6.0.min.js", "utf8"));
w.eval(`var ItemType={Folder:'folder'}; window.MB={sendMessage(){}}; window.ScenesHandler={scenes:[]}; window.DM=true; window.gameId='8258198';
  window.EXPERIMENTAL_SETTINGS={}; window.TOKEN_SETTINGS={vision:{color:'rgba(1,1,1,1)'}}; window.SCENE_DEFAULT_SETTINGS={};
  window.AVTT_CAMPAIGN_INFO={campaignSettings:{}}; var AVTT_ENVIRONMENT={}; window.EXTENSION_PATH='';
  function find_game_id(){return '8258198'} function noisy_log(){} function is_spectator_page(){return false} function is_release_build(){return true}
  function should_use_iframes_for_monsters(){return false} function toggle_peer_settings_visibility(){} function local_peer_setting_changed(){}
  function is_abovevtt_page(){return false} function hide_or_unhide_scrollbar(){} function apply_sidebar_width(w){window.sidebarW=w}
  function use_iframes_for_monsters(){} function stop_using_iframes_for_monsters(){} function uuid(){return 'u'} function random_token_color(){return '#000'}
  window.campaignSaves=0; var debounceCampaignSettings=function(){ window.campaignSaves++ };`);
for (const fn of ["token_setting_options", "avtt_settings", "scene_setting_options", "get_avtt_setting_default_value", "get_avtt_setting_value", "get_avtt_setting_is_global", "set_avtt_setting_value", "persist_experimental_settings", "persist_token_settings", "persist_default_scene_settings"]) w.eval(grab(ST, fn));
w.eval(grab(TK, "default_options"));
for (const f of ["page.js", "settings.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
let id = 0; const call = async (method, params) => { const my = ++id; w.dispatchEvent(new w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "call", id: my, method, params } }, source: w })); for (let t = 0; t < 100 && !out[my]; t++) await new Promise((r) => setTimeout(r, 10)); return out[my]; };
const show = (label, r) => console.log(label.padEnd(28), r.ok ? JSON.stringify(r.result).slice(0, 400) : "ERROR: " + r.error);
const all = await call("list_settings", {}); if (!all.ok) { console.log("LIST ERROR", all.error); process.exit(1); }
console.log("counts:", Object.fromEntries(Object.entries(all.result).map(([g, v]) => [g, v.length])));
console.log("sample:", JSON.stringify(all.result.aboveVTT.find((s) => s.key === "statBlockStyle")));
show("search 'grid'", await call("list_settings", { search: "grid" }));
show("set toggles+dropdown", await call("set_setting", { group: "aboveVTT", changes: { colorBlindText: true, iconUi: "off", statBlockStyle: "1", exportRemind: 7 } }));
console.log("  body classes:", w.document.body.className, "| global store:", w.localStorage.getItem("ExperimentalSettingsGlobal"));
show("set flyout partial", await call("set_setting", { group: "aboveVTT", changes: { quickRoll: { customDieRoll1: "1d3", autoRoll: true } } }));
console.log("  quickRoll now:", JSON.stringify(w.EXPERIMENTAL_SETTINGS.quickRoll));
show("autoReconnect warning", await call("set_setting", { group: "aboveVTT", changes: { autoReconnect: true } }));
show("campaignDefaults", await call("set_setting", { group: "aboveVTT", changes: { campaignDefaults: { iconUi: false } } }));
console.log("  campaign saves:", w.campaignSaves, JSON.stringify(w.AVTT_CAMPAIGN_INFO.campaignSettings));
show("bad key", await call("set_setting", { group: "aboveVTT", changes: { nope: 1 } }));
show("bad choice", await call("set_setting", { group: "aboveVTT", changes: { exportRemind: 3 } }));
show("bad sub-option", await call("set_setting", { group: "aboveVTT", changes: { quickRoll: { nope: 1 } } }));
show("token defaults", await call("set_setting", { group: "tokenDefaults", changes: { tokenStyleSelect: "Square", revealname: true, visionColor: "red" } }));
console.log("  token store:", w.localStorage.getItem("TokenSettings8258198"));
show("scene defaults", await call("set_setting", { group: "sceneDefaults", changes: { grid: true, grid_color: "#ff0000", darkness_filter: 20 } }));
console.log("  scene store:", w.localStorage.getItem("SceneDefaults-8258198"));
show("scene range bad", await call("set_setting", { group: "sceneDefaults", changes: { grid_line_width: 99 } }));
show("no-op", await call("set_setting", { group: "sceneDefaults", changes: { grid: true } }));
show("changedOnly", await call("list_settings", { changedOnly: true }));
show("reset some", await call("reset_setting", { group: "tokenDefaults", keys: ["revealname", "visionColor"] }));
show("reset scene all", await call("reset_setting", { group: "sceneDefaults", all: true }));
show("reset aboveVTT all", await call("reset_setting", { group: "aboveVTT", all: true }));
console.log("  body classes after reset:", w.document.body.className);
process.exit(0);
