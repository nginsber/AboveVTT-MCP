// Run from the AboveVTT-MCP folder: node test/creatures.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grabBlock = (src, start) => { const i = src.indexOf(start); if (i < 0) throw new Error("missing " + start); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const TC = fs.readFileSync(A + "TokenCustomization.js", "utf8"), TP = fs.readFileSync(A + "TokensPanel.js", "utf8"), ST = fs.readFileSync(A + "Settings.js", "utf8"), CF = fs.readFileSync(A + "CoreFunctions.js", "utf8");
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(fs.readFileSync(A + "jquery-3.6.0.min.js", "utf8")); w.eval(fs.readFileSync(A + "purify.min.js", "utf8"));
w.eval(grabBlock(CF, "function basic_sanitize_html("));
w.eval(`var ItemType={Folder:'folder',MyToken:'myToken',Monster:'monster',PC:'pc',BuiltinToken:'builtinToken',DDBToken:'ddbToken',Encounter:'encounter',Scene:'scene',Open5e:'open5e',Aoe:'aoe'};
  var RootFolder={Root:{id:'root',path:'/'},MyTokens:{id:'myTokensFolder',path:'/My Tokens',name:'My Tokens'},Scenes:{id:'scenesFolder'},allIds(){return ['root','myTokensFolder']},allPaths(){return []},allValues(){return []},findById(id){return id==='myTokensFolder'?this.MyTokens:undefined}};
  function path_to_html_id(p){return p} function sanitize_folder_path(p){return p} function noisy_log(){}
  let n=0; function uuid(){ return 'c'+(++n) }
  window.MB={sendMessage(){}}; window.DM=true; window.ScenesHandler={scenes:[]}; window.saves=0; window.refreshes=0;
  window.JOURNAL={notes:{}, chapters:[], persist(){ window.jsaves=(window.jsaves||0)+1 }};
  var globalIndexedDB={transaction(){return {objectStore(){return {}}}}}; async function avttTokenSaveChunkedCustomizations(){ window.saves++ }
  function did_change_mytokens_items(){ window.refreshes++ }
  function find_game_id(){return '1'} function is_spectator_page(){return false} function is_release_build(){return true} var AVTT_ENVIRONMENT={};`);
const ci = TC.indexOf("class TokenCustomization"); w.eval("var TokenCustomization = " + grabBlock(TC, "class TokenCustomization").replace(/^class TokenCustomization/, "class TokenCustomization") + ";");
for (const fn of ["persist_all_token_customizations", "delete_token_customization_by_type_and_id"]) w.eval(grabBlock(TC, "function " + fn + "("));
// persist_token_customization: real validation + list update, then persist_all
// persist_token_customization: AboveVTT's validation + list update (copied from its first half), then save all
w.eval(`function persist_token_customization(customization, callback){
  if (typeof callback !== 'function') callback=function(){};
  if (customization === undefined || typeof customization.id !== "string" || !customization.id.length || !TokenCustomization.validTypes.includes(customization.tokenType) || !customization.tokenOptions) { callback(false, "Invalid Customization"); return; }
  customization.tokenOptions = Object.fromEntries(Object.entries(customization.tokenOptions).filter(([k, v]) => v != 'undefined'));
  let i = window.TOKEN_CUSTOMIZATIONS.findIndex(c => c.tokenType === customization.tokenType && c.id === customization.id);
  if (i >= 0) window.TOKEN_CUSTOMIZATIONS[i] = customization; else window.TOKEN_CUSTOMIZATIONS.push(customization);
  persist_all_token_customizations(window.TOKEN_CUSTOMIZATIONS, callback); }`);
for (const fn of ["token_setting_options", "avtt_settings", "scene_setting_options"]) w.eval(grabBlock(ST, "function " + fn + "("));
w.eval(`window.TOKEN_CUSTOMIZATIONS=[ TokenCustomization.MyToken('g1','myTokensFolder',{name:'Goblin Boss',alternativeImages:['https://x/g.png'],statBlock:'g1'}),
  TokenCustomization.Folder('f1','myTokensFolder','myTokensFolder',{name:'Fire Cult'}),
  TokenCustomization.MyToken('m1','f1',{name:'Fire Mage',alternativeImages:[]}) ];
  window.JOURNAL.notes.g1={title:'',text:'<p><strong>Armor Class</strong> 17 (chain mail)</p><p><strong>Hit Points</strong> 21 (6d6)</p>',statBlock:true,player:true};`);
// AboveVTT's own placement reader (create_and_place_token), wrapped as a function
const place = TP.slice(TP.indexOf("    if(options.statBlock && window.JOURNAL.notes[options.statBlock] != undefined){"), TP.indexOf("        let newAC = $(searchText).find('.custom-ac.custom-stat').text();"));
const acStart = TP.indexOf("        let newAC = $(searchText).find('.custom-ac.custom-stat').text();");
const acBlock = grabBlock(TP.slice(acStart), "if(newAC == ''){");
const acPart = TP.slice(acStart, acStart + TP.slice(acStart).indexOf("if(newAC == ''){")) + acBlock;
w.eval(`function aboveVttReads(options){ let hpVal; ${place} ${acPart} options.armorClass=newAC; } return options; }`);
for (const f of ["page.js", "settings.js", "notes.js", "creatures.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
let id = 0; const call = async (method, params) => { const my = ++id; w.dispatchEvent(new w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "call", id: my, method, params } }, source: w })); for (let t = 0; t < 100 && !out[my]; t++) await new Promise((r) => setTimeout(r, 10)); return out[my]; };
const show = (label, r) => console.log(label.padEnd(24), r.ok ? JSON.stringify(r.result).slice(0, 360) : "ERROR: " + r.error);
const reads = (cid) => { const o = w.eval(`aboveVttReads({statBlock:'${cid}', defaultmaxhptype:'average'})`); return JSON.stringify({ hp: o.hitPointInfo, ac: o.armorClass, init: o.customInit ?? o.customInitStatic }); };
show("list", await call("list_creatures", {}));
show("create (fields)", await call("create_creature", { folderName: "Fire Cult", creatures: [{ name: "Cultist", images: ["https://x/c.png"], size: "Medium", borderColor: "#aa0000", aura1: { feet: 10, color: "red" }, darkvisionFeet: 60, settings: { revealname: true, tokenStyleSelect: "Square" },
  statBlock: { size: "Medium", type: "humanoid", alignment: "any non-good alignment", ac: 12, acNote: "leather armor", hitDice: "2d8", speed: "30 ft.", abilities: { str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10 }, skills: "Deception +2, Religion +2", senses: "passive Perception 10", languages: "any one language", cr: "1/8",
    traits: [{ name: "Dark Devotion", text: "Advantage on saves against being charmed or frightened." }], actions: [{ name: "Scimitar", text: "Melee Weapon Attack: +3 to hit, reach 5 ft., one creature. Hit: 4 (1d6 + 1) slashing damage." }] } },
  { name: "Fire Mage", size: "Large", statBlockText: "Armor Class 15 (mage armor)\nHit Points 40 (9d8)\nInitiative +3" }] }));
const cult = w.TOKEN_CUSTOMIZATIONS.find((t) => t.tokenOptions.name === "Cultist");
console.log("  cultist options:", JSON.stringify(cult.tokenOptions));
console.log("  AboveVTT reads Cultist:", reads(cult.id));
const fm2 = w.TOKEN_CUSTOMIZATIONS.find((t) => t.tokenOptions.name === "Fire Mage 2");
console.log("  AboveVTT reads Fire Mage 2:", reads(fm2.id), "size:", fm2.tokenOptions.tokenSize);
console.log("  AboveVTT reads Goblin Boss (existing):", reads("g1"));
show("bad size", await call("create_creature", { creatures: [{ name: "X", size: "Colossal" }] }));
show("bad setting", await call("create_creature", { creatures: [{ name: "X", settings: { nope: 1 } }] }));
show("bad image", await call("create_creature", { creatures: [{ name: "X", images: ["c:/x.png"] }] }));
show("two stat blocks", await call("create_creature", { creatures: [{ name: "X", statBlockText: "a", statBlockHtml: "b" }] }));
show("get", await call("get_creature", { creatureName: "Cultist" }));
show("update", await call("update_creature", { creatureName: "Cultist", newName: "Fire Cultist", addImages: ["https://x/c2.png"], aura1: null, settings: { revealname: null }, statBlock: { ac: 13, hp: 11, hitDice: "2d8+2", abilities: { dex: 14 } }, folderName: "Fire Cult" }));
console.log("  AboveVTT reads Fire Cultist:", reads(cult.id), "note title:", w.JOURNAL.notes[cult.id].title, "| options:", JSON.stringify(cult.tokenOptions));
show("move to top", await call("update_creature", { creatureName: "Fire Cultist", toTopLevel: true }));
show("remove stat block", await call("update_creature", { creatureName: "Fire Mage 2", removeStatBlock: true }));
show("create folder", await call("create_creature_folder", { name: "Undead" }));
show("dup folder", await call("create_creature_folder", { name: "undead" }));
show("delete dry", await call("delete_creature", { creatureName: "Fire Cultist", dryRun: true }));
show("delete", await call("delete_creature", { creatureName: "Fire Cultist" }));
console.log("  stat block gone:", !w.JOURNAL.notes[cult.id]);
show("folder up dry", await call("delete_creature_folder", { folderName: "Fire Cult", dryRun: true }));
show("folder everything", await call("delete_creature_folder", { folderName: "Fire Cult", mode: "deleteEverything" }));
show("list after", await call("list_creatures", {}));
console.log("saves:", w.saves, "refreshes:", w.refreshes);
process.exit(0);
