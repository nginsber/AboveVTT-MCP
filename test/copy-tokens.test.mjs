// Run from the AboveVTT-MCP folder: node test/copy-tokens.test.mjs  (needs jsdom; AboveVTT folder next to this one)
// Uses AboveVTT 1.61's real ItemType, RootFolder, TokenCustomization, SidebarListItem, find_token_options_for_list_item,
// random_image_for_item, get_monster_senses, the monster caches and its own stat-block reading at placement.
// D&D Beyond / Open5e network calls and the D&D Beyond stat block renderer are stand-ins.
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grabBlock = (src, start) => { const i = src.indexOf(start); if (i < 0) throw new Error("missing " + start); let d = 0, j = start.startsWith("function") ? i + src.slice(i).search(/\)\s*\{\s*\n/) + src.slice(i).match(/\)\s*\{/)[0].length - 1 : src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const TC = fs.readFileSync(A + "TokenCustomization.js", "utf8"), TP = fs.readFileSync(A + "TokensPanel.js", "utf8"), ST = fs.readFileSync(A + "Settings.js", "utf8"),
  CF = fs.readFileSync(A + "CoreFunctions.js", "utf8"), SP = fs.readFileSync(A + "SidebarPanel.js", "utf8"), MS = fs.readFileSync(A + "MonsterStatBlock.js", "utf8"), MN = fs.readFileSync(A + "Main.js", "utf8");
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(fs.readFileSync(A + "jquery-3.6.0.min.js", "utf8")); w.eval(fs.readFileSync(A + "purify.min.js", "utf8"));
w.eval(grabBlock(CF, "function basic_sanitize_html("));
w.eval("var ItemType = " + grabBlock(TC, "class ItemType") + ";");
w.eval("var RootFolder = " + grabBlock(TC, "class RootFolder") + ";");
w.eval("var TokenCustomization = " + grabBlock(TC, "class TokenCustomization") + ";");
w.eval("var SidebarListItem = " + grabBlock(SP, "class SidebarListItem") + ";");
for (const fn of ["find_token_customization(", "find_or_create_token_customization(", "persist_all_token_customizations("]) w.eval(grabBlock(TC, "function " + fn));
for (const fn of ["find_token_options_for_list_item(", "random_image_for_item(", "alternative_images_for_item(", "includeDDBImages(", "update_monster_item_cache(", "update_open5e_item_cache("]) w.eval(grabBlock(TP, "function " + fn));
w.eval(grabBlock(MS, "function get_monster_senses("));
w.eval(grabBlock(MN, "function getRandomInt("));
w.eval(`var cached_monster_items={}, cached_open5e_items={};
  function path_to_html_id(p, n){ return (n ? p + '/' + n : p).replace(/[^A-Za-z0-9]/g,'-') } function sanitize_folder_path(p){ return p.replace(/\\/+/g,'/') }
  function noisy_log(){} function parse_img(u){ return u } let n=0; function uuid(){ return 'c'+(++n) }
  window.DM=true; window.MB={sendMessage(){}}; window.saves=0; window.refreshes=0; window.fetches=0;
  window.JOURNAL={notes:{}, chapters:[], persist(){ window.jsaves=(window.jsaves||0)+1 }};
  var globalIndexedDB={transaction(){return {objectStore(){return {}}}}}; async function avttTokenSaveChunkedCustomizations(){ window.saves++ }
  function did_change_mytokens_items(){ window.refreshes++ } function find_game_id(){return '1'} function is_spectator_page(){return false} function is_release_build(){return true} var AVTT_ENVIRONMENT={};
  function is_player_id(id){ return typeof id === "string" && id.includes("characters/") }
  function convert_challenge_rating_id(id){ return {1:'0',2:'1/8',3:'1/4',4:'1/2',5:'1'}[id] ?? String(id-4) }
  window.ddbConfigJson={ sources:[{id:1,name:'MM',description:'Monster Manual (2014)'},{id:148,name:'MM24',description:'Monster Manual (2025)'}] };
  window.TOKEN_SETTINGS={};
  window.persist_token_customization=function(customization, callback){
    if (customization === undefined || typeof customization.id !== "string" || !TokenCustomization.validTypes.includes(customization.tokenType) || !customization.tokenOptions) { callback(false, "Invalid Customization"); return; }
    let i = window.TOKEN_CUSTOMIZATIONS.findIndex(c => c.tokenType === customization.tokenType && c.id === customization.id);
    if (i >= 0) window.TOKEN_CUSTOMIZATIONS[i] = customization; else window.TOKEN_CUSTOMIZATIONS.push(customization);
    persist_all_token_customizations(window.TOKEN_CUSTOMIZATIONS, callback); };
  window.TOKEN_CUSTOMIZATIONS=[ TokenCustomization.Folder('f1', RootFolder.MyTokens.id, RootFolder.MyTokens.id, {name:'Frozen Sick'}),
    TokenCustomization.MyToken('old', 'f1', {name:'Goblin', alternativeImages:[]}) ];
  // ---- D&D Beyond / Open5e stand-ins ----
  const goblin14={id:16907,name:'Goblin',avatarUrl:'https://x/goblin.png',sizeId:3,challengeRatingId:3,sources:[{sourceId:1}],isLegacy:true,isReleased:true,armorClass:15,averageHitPoints:7,hitPointDice:{diceString:'2d6'},senses:[{senseId:2,notes:'60 ft.'}]};
  const goblin24={...goblin14,id:5195300,isLegacy:false,sources:[{sourceId:148}],avatarUrl:'https://x/goblin24.png'};
  const boss={...goblin14,id:16908,name:'Goblin Boss',challengeRatingId:5,armorClass:17,averageHitPoints:21,hitPointDice:{diceString:'6d6'}};
  const lich={...goblin14,id:17000,name:'Lich',isReleased:false,isHomebrew:false};
  const DDB=[goblin14,goblin24,boss,lich];
  window.search_monsters=function(term,skip,cb){ setTimeout(()=>cb({data:DDB.filter(m=>m.name.toLowerCase().includes(term.toLowerCase())),pagination:{total:4,skip:0}}),1) };
  window.fetch_monsters=async function(ids,cb,open5e){ window.fetches++; if(open5e){ cb(O5E.filter(m=>ids.includes(m.key))); } else cb(DDB.filter(m=>ids.map(Number).includes(m.id))) };
  const O5E=[{key:'srd_owlbear',name:'Owlbear',img_main:null,sizeId:5,senses:[],document:{name:'5e SRD'},challenge_rating_text:'3'},{key:'tob_owlbear',name:'Owlbear',img_main:null,sizeId:5,senses:[],document:{name:'Tome of Beasts'}}];
  $.getJSON=function(url){ const q=decodeURIComponent(url.match(/icontains=([^&]*)/)[1]).toLowerCase(); return Promise.resolve({results:O5E.filter(m=>m.name.toLowerCase().includes(q))}) };
  // D&D Beyond copy stat block: same element layout as AboveVTT's build_monster_copy_stat_block
  function MonsterStatBlock(d){ this.data=d; this.userHasAccess = d.isReleased!==false || d.open5e }
  window.build_monster_copy_stat_block=function(sb){ if(!sb.userHasAccess) return "<div id='noAccessToContent'>You do not have access</div>";
    return '<div class="stat-block"><div class="mon-stat-block-2024__name">'+sb.data.name+'</div><div class="mon-stat-block__attributes"><div class="mon-stat-block__attribute">'+
    '<span class="mon-stat-block__attribute-label">Armor Class</span><span class="mon-stat-block__attribute-value"><span class="mon-stat-block__attribute-data-value">'+(sb.data.armorClass??12)+'</span><span class="mon-stat-block__attribute-data-extra">(leather)</span></span></div>'+
    '<div class="mon-stat-block__attribute"><span class="mon-stat-block__attribute-label">Hit Points</span><span class="mon-stat-block__attribute-data"><span class="mon-stat-block__attribute-data-value">'+(sb.data.averageHitPoints??30)+'</span><span class="mon-stat-block__attribute-data-extra">('+(sb.data.hitPointDice?.diceString??'4d10')+')</span></span></div></div></div>' };
  // ---- Tokens tab lists ----
  window.tokenListItems=[ SidebarListItem.BuiltinToken({name:'Barrel', folderPath:'/Objects', image:'https://x/barrel.png'}),
    SidebarListItem.DDBToken({name:'Human', folderPath:'/Humanoids', alternativeImages:['https://x/h1.png','https://x/h2.png']}),
    SidebarListItem.DDBToken({name:'Human', folderPath:'/Legacy', alternativeImages:['https://x/h3.png']}) ];
  // ---- scenes ----
  window.ScenesHandler={scenes:[{id:'s1',title:'The Tavern'},{id:'s2',title:'Ice Cave'}]};
  window.CURRENT_SCENE_DATA={id:'s1', title:'The Tavern', hpps:50};
  window.JOURNAL.notes.sb9={id:'sb9',title:'Grak',text:'<div class="stat-block"><p><strong>Armor Class</strong> <span class="custom-ac custom-stat">15</span></p><p><strong>Hit Points</strong> <span class="custom-avghp custom-stat">21</span> (<span class="custom-hp-roll custom-stat">6d6</span>)</p></div>',statBlock:true,player:true};
  window.TOKEN_OBJECTS={
    t1:{options:{id:'t1',name:'Grak',monster:'customStat',statBlock:'sb9',imgsrc:'https://x/grak.png',alternativeImages:['https://x/grak2.png'],gridSquares:2,size:100,left:'300px',top:'200px',hitPointInfo:{current:3,maximum:30,temp:5},armorClass:15,conditions:['Prone'],aura1:{feet:'10',color:'red'},revealname:true,hidden:true}},
    t2:{options:{id:'t2',name:'Goblin 2',monster:16907,imgsrc:'https://x/goblin.png',size:50,hitPointInfo:{current:7,maximum:7,temp:0},armorClass:15}},
    t3:{options:{id:'t3',name:'Owlbear',monster:'open5e',stat:'srd_owlbear',imgsrc:'https://x/o.png',size:100,hitPointInfo:{current:59,maximum:59},armorClass:13}},
    t4:{options:{id:'t4',name:'Statue',imgsrc:'https://x/statue.png',size:50,armorClass:17,hitPointInfo:{current:40,maximum:40}}},
    p1:{options:{id:'/profile/a/characters/1',name:'Thorin',imgsrc:'https://x/t.png'}},
    d1:{options:{id:'d1',name:'Door',type:'door',imgsrc:'https://x/d.png'}},
    a1:{options:{id:'a1',name:'Fireball',imgsrc:'class-circle-fire'}} };
  var AboveApi={ async getScene(id){ if(id!=='s2') throw new Error('no'); return {data:{id:'s2',hpps:70,tokens:{r1:{id:'r1',name:'Frost Wolf',imgsrc:'https://x/wolf.png',size:140,hitPointInfo:{current:11,maximum:11},armorClass:13}}}} } };`);
for (const fn of ["token_setting_options", "avtt_settings", "scene_setting_options"]) w.eval(grabBlock(ST, "function " + fn + "("));
w.eval(`function default_options(){ return { aura1:{color:'rgba(255, 129, 0, 0.3)'}, aura2:{color:'rgba(255, 255, 0, 0.1)'} } }`);
// AboveVTT's own reading of a My Token's stat block when it's placed (create_and_place_token)
const place = TP.slice(TP.indexOf("    if(options.statBlock && window.JOURNAL.notes[options.statBlock] != undefined){"), TP.indexOf("        let newAC = $(searchText).find('.custom-ac.custom-stat').text();"));
const acStart = TP.indexOf("        let newAC = $(searchText).find('.custom-ac.custom-stat').text();");
const acPart = TP.slice(acStart, acStart + TP.slice(acStart).indexOf("if(newAC == ''){")) + grabBlock(TP.slice(acStart), "if(newAC == ''){");
w.eval(`function aboveVttReads(options){ let hpVal; ${place} ${acPart} options.armorClass=newAC; } return options; }`);
for (const f of ["page.js", "settings.js", "notes.js", "creatures.js", "copy_tokens.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
let id = 0; const call = async (method, params) => { const my = ++id; w.dispatchEvent(new w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "call", id: my, method, params } }, source: w })); for (let t = 0; t < 500 && !out[my]; t++) await new Promise((r) => setTimeout(r, 10)); return out[my]; };
let fails = 0;
const check = (label, cond, extra = "") => { console.log((cond ? "ok   " : "FAIL ") + label, cond ? "" : extra); if (!cond) fails++; };
const R = (r) => (r?.ok ? r.result : { error: r?.error ?? "TIMEOUT" });
const TCs = () => w.TOKEN_CUSTOMIZATIONS;
const byName = (n) => TCs().find((t) => t.tokenType === "myToken" && t.tokenOptions.name === n);
const reads = (tc) => w.aboveVttReads({ statBlock: tc.tokenOptions.statBlock });

// ---- search
let r = R(await call("find_tokens_to_copy", { query: "goblin" }));
check("search: monsters", r.results.monster.length === 3 && r.results.monster[0].books[0] === "Monster Manual (2014)" && r.results.monster[0].legacy && r.results.monster[0].cr === "1/4", JSON.stringify(r));
check("search: open5e / lists", Array.isArray(r.results.open5e) && r.results.aboveVTT.length === 0 && r.results.ddbToken.length === 0);
r = R(await call("find_tokens_to_copy", { query: "hum", source: "ddbToken" }));
check("search: D&D Beyond Tokens with folders", r.results.ddbToken.length === 2 && /D&D Beyond Tokens \/ Humanoids/.test(r.results.ddbToken[0].folder), JSON.stringify(r));

// ---- monsters
r = R(await call("copy_to_my_tokens", { items: [{ source: "monster", name: "Goblin" }] }));
check("ambiguous monster name lists both books", r.failed?.[0]?.error.includes("2 Monsters (D&D Beyond) are named 'Goblin'") && r.failed[0].error.includes("[5195300]"), JSON.stringify(r));
r = R(await call("copy_to_my_tokens", { items: [{ source: "monster", id: "5195300" }, { source: "monster", name: "Goblin Boss", newName: "Boss Grik" }], folderName: "Frozen Sick" }));
const g = byName("Goblin 2"), bg = byName("Boss Grik");
check("monster copy: numbered name in folder", r.copied.length === 2 && g && g.parentId === "f1", JSON.stringify(r));
check("monster copy: image, size, darkvision, customStat", g.tokenOptions.imgsrc === "https://x/goblin24.png" && g.tokenOptions.alternativeImages[0] === "https://x/goblin24.png" && g.tokenOptions.sizeId === 3 && g.tokenOptions.tokenSize === 1 && g.tokenOptions.vision.feet === "60" && g.tokenOptions.monster === "customStat", JSON.stringify(g.tokenOptions));
check("monster copy: stat block AboveVTT reads", reads(g).armorClass == 15 && reads(g).hitPointInfo.maximum == 7 && reads(bg).armorClass == 17, JSON.stringify(reads(g)));
check("monster copy: result reports stats", r.copied[1].ac === "17" && r.copied[1].statBlock === "from D&D Beyond", JSON.stringify(r.copied[1]));
r = R(await call("copy_to_my_tokens", { items: [{ source: "monster", name: "Lich" }] }));
check("not-owned monster: copied without stats", r.copied[0].statBlock === "none" && /don't have access/.test(r.copied[0].notes[0]) && !w.JOURNAL.notes[r.copied[0].id], JSON.stringify(r));
r = R(await call("copy_to_my_tokens", { items: [{ source: "monster", name: "Gobbo" }] }));
check("unknown monster", /No Monsters \(D&D Beyond\) match 'Gobbo'/.test(r.failed[0].error));

// ---- Open5e
r = R(await call("copy_to_my_tokens", { items: [{ source: "open5e", name: "Owlbear" }] }));
check("ambiguous Open5e lists documents", /Tome of Beasts/.test(r.failed?.[0]?.error), JSON.stringify(r));
r = R(await call("copy_to_my_tokens", { items: [{ source: "open5e", id: "srd_owlbear" }] }));
check("Open5e copy (Large → tokenSize 2)", byName("Owlbear")?.tokenOptions.tokenSize === 2 && r.copied[0].size === "Large" && r.copied[0].name === "Owlbear" && r.copied[0].statBlock === "from Open5e" && reads(byName("Owlbear")).hitPointInfo.maximum == 30, JSON.stringify(r));

// ---- AboveVTT / D&D Beyond Tokens
r = R(await call("copy_to_my_tokens", { items: [{ source: "aboveVTT", name: "barrel" }] }));
const bar = byName("Barrel");
check("AboveVTT token copy", bar && bar.tokenOptions.alternativeImages[0] === "https://x/barrel.png" && !bar.tokenOptions.statBlock && r.copied[0].from.startsWith("AboveVTT Tokens / Objects"), JSON.stringify(r));
r = R(await call("copy_to_my_tokens", { items: [{ source: "ddbToken", name: "Human" }] }));
check("ambiguous D&D Beyond token", /2 D&D Beyond Tokens are named 'Human'/.test(r.failed?.[0]?.error), JSON.stringify(r));
const humanId = w.tokenListItems[1].id;
r = R(await call("copy_to_my_tokens", { items: [{ source: "ddbToken", id: humanId }] }));
check("D&D Beyond token copy keeps all images", JSON.stringify(byName("Human").tokenOptions.alternativeImages) === '["https://x/h1.png","https://x/h2.png"]', JSON.stringify(byName("Human")?.tokenOptions));

// ---- tokens on scenes
r = R(await call("copy_to_my_tokens", { items: [{ source: "scene", name: "Grak" }] }));
const gk = byName("Grak");
check("placed custom creature: looks and settings", gk && gk.tokenOptions.tokenSize === 2 && gk.tokenOptions.aura1.feet === "10" && gk.tokenOptions.revealname === true && JSON.stringify(gk.tokenOptions.alternativeImages) === '["https://x/grak.png","https://x/grak2.png"]', JSON.stringify(gk?.tokenOptions));
check("  not placement state", !("left" in gk.tokenOptions) && !("hitPointInfo" in gk.tokenOptions) && !("conditions" in gk.tokenOptions) && !("hidden" in gk.tokenOptions));
check("  own stat block copy, token's max HP 30 used", gk.tokenOptions.statBlock === gk.id && gk.id !== "sb9" && reads(gk).hitPointInfo.maximum == 30 && reads(gk).armorClass == 15 && /Max HP set to the token's 30/.test(r.copied[0].notes?.[0]), JSON.stringify(r));
check("  original stat block untouched", /custom-avghp custom-stat">21</.test(w.JOURNAL.notes.sb9.text));
r = R(await call("copy_to_my_tokens", { items: [{ source: "scene", name: "Grak", newName: "Grak (book)", keepOriginalStats: true }] }));
check("keepOriginalStats", reads(byName("Grak (book)")).hitPointInfo.maximum == 21 && !r.copied[0].notes, JSON.stringify(r));
w.eval("window.TOKEN_OBJECTS.t2.options.armorClass=18; window.TOKEN_OBJECTS.t2.options.hitPointInfo.maximum=40;");
r = R(await call("copy_to_my_tokens", { items: [{ source: "scene", name: "Goblin 2", newName: "Buff Goblin" }] }));
const bgb = byName("Buff Goblin");
check("placed D&D Beyond monster: fetched stat block with token's AC 18 / HP 40", r.copied[0].statBlock.startsWith("from D&D Beyond") && reads(bgb).armorClass == 18 && reads(bgb).hitPointInfo.maximum == 40 && !/\(2d6\)/.test(w.JOURNAL.notes[bgb.id].text), JSON.stringify(r) + w.JOURNAL.notes[bgb?.id]?.text);
r = R(await call("copy_to_my_tokens", { items: [{ source: "scene", name: "Owlbear", newName: "Owlbear (scene)" }] }));
check("placed Open5e monster", r.copied[0].statBlock.startsWith("from Open5e") && reads(byName("Owlbear (scene)")).hitPointInfo.maximum == 59, JSON.stringify(r));
r = R(await call("copy_to_my_tokens", { items: [{ source: "scene", name: "Statue" }] }));
check("plain token: stat block made from AC/HP", r.copied[0].statBlock === "made from the token's AC and max HP" && reads(byName("Statue")).armorClass == 17 && reads(byName("Statue")).hitPointInfo.maximum == 40, JSON.stringify(r));
r = R(await call("copy_to_my_tokens", { items: [{ source: "scene", sceneName: "Ice Cave", name: "Frost Wolf" }] }));
check("token on another scene (size from that scene's grid)", byName("Frost Wolf")?.tokenOptions.tokenSize === 2 && r.copied[0].from === "'Frost Wolf' on Ice Cave", JSON.stringify(r));
r = R(await call("copy_to_my_tokens", { items: [{ source: "scene", name: "Thorin" }, { source: "scene", name: "Door" }, { source: "scene", name: "Fireball" }, { source: "scene", name: "Nobody" }] }));
check("refused: player, door, AoE, missing", r.copied.length === 0 && /player character/.test(r.failed[0].error) && /door/.test(r.failed[1].error) && /area-of-effect/.test(r.failed[2].error) && /No token named 'Nobody'/.test(r.failed[3].error), JSON.stringify(r.failed));
check("bad folder refused before anything", !(await call("copy_to_my_tokens", { items: [{ source: "aboveVTT", name: "Barrel" }], folderName: "Nope" })).ok);
check("list refreshed once per call; one D&D Beyond fetch per monster", w.refreshes === 11 && w.fetches === 5, `refreshes ${w.refreshes} fetches ${w.fetches}`);
const lc = R(await call("list_creatures", { folderName: "Frozen Sick" }));
check("list_creatures sees the copies", lc.creatures === 3, JSON.stringify(lc));

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
