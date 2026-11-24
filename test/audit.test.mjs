// audit_campaign, page side (collecting links and empty folders), with AboveVTT's real parse_img.
// Run from the AboveVTT-MCP folder: node test/audit.test.mjs  (needs jsdom; AboveVTT folder next to this one)
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/", X = "extension/";
const grabBlock = (src, start) => { const i = src.indexOf(start); if (i < 0) throw new Error("missing " + start); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] == "{") d++; else if (src[k] == "}") { d--; if (!d) { j = k + 1; break; } } } return src.slice(i, j); };
const CF = fs.readFileSync(A + "CoreFunctions.js", "utf8"), MAIN = fs.readFileSync(A + "Main.js", "utf8");

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : "  " + extra}`); };

const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(MAIN.match(/const GOOGLE_DRIVE_ID_REGEX = .*;/)[0].replace("const ", "var "));
w.eval(grabBlock(MAIN, "function update_old_discord_link("));
w.eval(grabBlock(CF, "function parse_img("));
w.eval(`function noisy_log(){}
var ItemType={Folder:'folder',MyToken:'myToken',Monster:'monster'};
var RootFolder={MyTokens:{id:'myTokensFolder'},Scenes:{id:'scenesFolder'}};
window.DM=true; window.CAMPAIGN_INFO={name:'Frozen Sick', id:'1'};
window.ScenesHandler={scenes:[
  {id:'f1', title:'Chapter 1', itemType:'folder', parentId:'scenesFolder'},
  {id:'f2', title:'Empty Ch', itemType:'folder', parentId:'scenesFolder'},
  {id:'f3', title:'Inner empty', itemType:'folder', parentId:'f1'},
  {id:'s1', title:'Cave', itemType:'scene', parentId:'f1', player_map:'https://drive.google.com/file/d/ABC123/view?usp=sharing', dm_map:'https://img.example.com/cave-dm.png'},
  {id:'s2', title:'Blank', itemType:'scene', parentId:'scenesFolder', player_map:''},
  {id:'s3', title:'River', itemType:'scene', parentId:'scenesFolder', player_map:'https://www.youtube.com/watch?v=abc', player_map_is_video:'1'},
  {id:'s4', title:'Vault', itemType:'scene', parentId:'scenesFolder', player_map:'https://above-bucket-not-a-url/vault.png'},
]};
window.CURRENT_SCENE_DATA={id:'s1'};
window.TOKEN_OBJECTS={t1:{options:{id:'t1', name:'Goblin', imgsrc:'https://img.example.com/goblin.png', alternativeImages:['https://img.example.com/goblin.png','https://img.example.com/goblin2.png']}},
  t2:{options:{id:'t2', name:'Fire cone', imgsrc:'class=aoe-shape-cone'}}};
window.AboveApi={ async getScene(id){ if(id==='s3') return {data:{tokens:{x:{id:'x', name:'Boat', imgsrc:'https://www.dropbox.com/s/abc/boat.png?dl=0'}}}}; if(id==='s4') throw new Error('Forbidden'); return {data:{tokens:{}}}; } };
const tc = (id, type, parentId, opts) => ({ id, tokenType:type, parentId, rootId:'myTokensFolder', tokenOptions:opts||{} });
window.TOKEN_CUSTOMIZATIONS=[
  tc('myTokensFolder','folder','root',{name:'My Tokens'}),
  tc('mf1','folder','myTokensFolder',{name:'Undead'}),
  tc('mf2','folder','myTokensFolder',{name:'Nothing here'}),
  tc('m1','myToken','mf1',{name:'Zombie', alternativeImages:['https://img.example.com/zombie.png','data:image/png;base64,AAAA']}),
  { id:'2001', tokenType:'monster', parentId:'x', rootId:'monsters', tokenOptions:{ name:'Owlbear', imgsrc:'https://img.example.com/owlbear.png' } },
];
window.TRACK_LIBRARY={ map(){ return new Map([['tr1',{name:'Rain', src:'https://www.dropbox.com/s/xyz/rain.mp3?dl=0'}],['tr2',{name:'Local', src:'C:/music/x.mp3'}]]); } };
window.MIXER={ state(){ return { playlists:{ p1:{ name:'Combat', channels:{ c1:{name:'Drums', src:'https://onedrive.live.com/embed?resid=1'} } } } }; } };
window.JOURNAL={ notes:{
  n1:{ title:'Session prep', text:'<p>See <a href="https://img.example.com/wiki">the wiki</a> <img src="https://img.example.com/npc.png"> <a href="#top">top</a></p>' },
  n2:{ title:'Stat block', text:'' } },
  chapters:[ {id:'c1', title:'Act 1', notes:['n1']}, {id:'c2', title:'Empty journal folder', notes:[]}, {id:'c3', title:'Parent', notes:[]}, {id:'c4', title:'Child', parentID:'c3', notes:['n2']},
    {id:'c5', title:'Stale ids', notes:['deleted-note']} ] };`);
for (const f of ["page.js", "audit.js"]) w.eval(fs.readFileSync(X + f, "utf8"));

const r = await w.__avttMcpRun("get_audit_data", {});
check("call works", r.ok, r.error);
const d = r.result;
const find = (where) => d.links.find((l) => l.where.includes(where));
const has = (where) => !!find(where);

check("player map collected, Drive link converted by AboveVTT's parse_img", find("Cave (player map)")?.url === "https://drive.google.com/thumbnail?id=ABC123&sz=w3000", JSON.stringify(find("Cave (player map)")));
check("…original kept for the report", /drive\.google\.com\/file\/d\/ABC123/.test(find("Cave (player map)")?.original || ""));
check("DM map collected", has("Cave (DM map)"));
check("scene with no map reported", d.notes.some((n) => n.where === "Scenes / Blank" && /no player map/.test(n.problem)), JSON.stringify(d.notes));
check("YouTube map kept as a video", find("River (player map)")?.kind === "video");
check("AboveVTT cloud storage map skipped", d.skipped.some((s) => s.where.includes("Vault")));
check("current scene's tokens read live (both images, no duplicate)", d.links.filter((l) => l.where.includes("token 'Goblin'")).length === 2);
check("token images are checked as image-or-video", find("token 'Goblin'")?.kind === "token" && find("My Tokens / Undead / Zombie")?.kind === "token");
check("Area of Effect shapes skipped", !d.links.some((l) => l.where.includes("Fire cone")));
check("other scene's tokens read through AboveApi.getScene", find("token 'Boat'")?.url === "https://dl.dropboxusercontent.com/s/abc/boat.png?dl=0", JSON.stringify(find("token 'Boat'")));
check("a scene that can't be read is reported, not fatal", d.tokenScan.failed.some((f) => f.scene.includes("Vault")) && d.tokenScan.scenes === 3, JSON.stringify(d.tokenScan));
check("My Tokens image with folder path", find("My Tokens / Undead / Zombie")?.url === "https://img.example.com/zombie.png", JSON.stringify(d.links.map((l) => l.where)));
check("embedded data image reported", d.notes.some((n) => n.where.includes("Zombie") && /embedded data/.test(n.problem)));
check("monster token settings image collected", has("Token settings for 'Owlbear'"));
check("audio: Dropbox link converted like the mixer does", find("Track 'Rain'")?.url === "https://dl.dropboxusercontent.com/s/xyz/rain.mp3?dl=0");
check("audio: not a web link reported", d.notes.some((n) => n.where === "Track 'Local'" && /not a web link/.test(n.problem)));
check("audio: playlist channel collected, OneDrive embed → download", find("Playlist 'Combat'")?.url === "https://onedrive.live.com/download?resid=1");
check("journal image collected", find("Note 'Session prep' in 'Act 1' (image)")?.kind === "image");
check("journal web link collected as a page", find("(link 'the wiki')")?.kind === "page");
check("journal anchor link ignored", !d.links.some((l) => l.where.includes("link 'top'")));
const empty = d.emptyFolders.map((f) => `${f.area}:${f.path}`).sort();
check("empty folders: scene, nested scene, My Tokens, journal (incl. one listing only deleted notes)",
  JSON.stringify(empty) === JSON.stringify(["Journal:Empty journal folder", "Journal:Stale ids", "My Tokens:My Tokens / Nothing here", "Scenes:Scenes / Chapter 1 / Inner empty", "Scenes:Scenes / Empty Ch"]), JSON.stringify(empty));
check("folders with a subfolder aren't empty", !empty.some((e) => /Chapter 1$|:Parent$|Undead$/.test(e)));

const only = await w.__avttMcpRun("get_audit_data", { checks: ["audio"] });
check("checks limits the areas", only.ok && only.result.links.every((l) => l.category === "audio") && !only.result.emptyFolders.length, JSON.stringify(only.result?.links?.map((l) => l.category)));
const noTok = await w.__avttMcpRun("get_audit_data", { checks: ["tokens"], includeSceneTokens: false });
check("includeSceneTokens: false skips placed tokens", noTok.ok && !noTok.result.links.some((l) => l.where.includes("→ token")) && !noTok.result.tokenScan);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
