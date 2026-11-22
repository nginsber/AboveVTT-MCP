// Run from the AboveVTT-MCP folder: node test/music.test.mjs  (needs jsdom; AboveVTT folder next to this one)
// Loads AboveVTT's real audio Library / TrackLibrary / Mixer classes (ES modules, stitched together here).
import { JSDOM } from "jsdom"; import fs from "node:fs";
const A = (process.env.AVTT_DIR || "../AboveVTT") + "/audio/", X = "extension/";
const strip = (src) => src.replace(/^import .*$/gm, "").replace(/^export .*$/gm, "");
const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true", runScripts: "outside-only" });
const w = dom.window;
w.eval(fs.readFileSync("../AboveVTT/jquery-3.6.0.min.js", "utf8"));
w.eval(`var n=0; function uuid(){ return 'u'+(++n) } function noisy_log(){} function is_abovevtt_page(){ return true } function setTokenAudio(){}
  window.gameId='1'; window.DM=true; window.ScenesHandler={scenes:[]}; window.MB={sendMessage(){ window.mbs=(window.mbs||0)+1 }};
  window.syncs=0; window.redraws=0;`);
w.eval(strip(fs.readFileSync(A + "helpers.js", "utf8")) + strip(fs.readFileSync(A + "library.js", "utf8")) + strip(fs.readFileSync(A + "track.js", "utf8")) + strip(fs.readFileSync(A + "mixer.js", "utf8"))
  + `; window.TRACK_LIBRARY = trackLibrary; Mixer.prototype.syncPlayers = function(){ window.syncs++ }; window.MIXER = mixer();
  trackLibrary.onchange(() => window.redraws++);
  trackLibrary.addTrack('Tavern Ambience','https://x/tavern.mp3',['Town','Ambience']); trackLibrary.addTrack('Battle Drums','https://x/drums.mp3',['Combat']);
  window.MIXER.addPlaylist('Default', true); window.MIXER.addChannel(Object.assign(new Channel('Battle Drums','https://x/drums.mp3'),{paused:false}));`);
for (const f of ["page.js", "music.js"]) w.eval(fs.readFileSync(X + f, "utf8"));
const out = {}; w.addEventListener("message", (e) => { if (e.data?.payload?.type === "result") out[e.data.payload.id] = e.data.payload; });
let id = 0; const call = (method, params) => w.__avttMcpRun(method, params); // the locked entry point background.js uses
const show = (label, r) => console.log(label.padEnd(22), r ? (r.ok ? JSON.stringify(r.result).slice(0, 380) : "ERROR: " + r.error) : "TIMEOUT");
show("list", await call("list_tracks", {}));
show("add", await call("add_tracks", { tracks: [{ name: "Cave Drips", src: "https://x/cave.ogg", tags: "Dungeon, Ambience" }, { name: "Tavern Ambience", src: "https://x/tavern2.mp3" }, { name: "Dup link", src: "https://x/drums.mp3" }] }));
show("bad link", await call("add_tracks", { tracks: [{ name: "X", src: "C:/music/x.mp3" }] }));
console.log("  AboveVTT's own find('Cave Drips'):", JSON.stringify(w.TRACK_LIBRARY.find("Cave Drips", "")), "redraws:", w.redraws);
show("by tag", await call("list_tracks", { tag: "ambience" }));
show("update", await call("update_track", { trackName: "Cave Drips", newName: "Cave Water", addTags: ["Underdark"], removeTags: ["Dungeon"] }));
show("rename clash", await call("update_track", { trackName: "Cave Water", newName: "battle drums" }));
show("playlists", await call("list_playlists", {}));
const syncsBefore = w.syncs;
show("create pl", await call("create_playlist", { name: "Dungeon", tag: "Ambience", loop: true }));
console.log("  audio syncs during create:", w.syncs - syncsBefore, "| loaded playlist still:", w.MIXER.readPlaylist(w.MIXER.selectedPlaylist()).name, "| mixer channels:", Object.keys(w.MIXER.channels()).length);
show("update pl", await call("update_playlist", { playlistName: "Dungeon", addTracks: ["Battle Drums"], removeTracks: ["Tavern Ambience"], newName: "Dungeon Crawl" }));
show("live pl refused", await call("update_playlist", { playlistName: "Default", addTracks: ["Cave Water"] }));
w.MIXER.pause();
show("paused pl ok", await call("update_playlist", { playlistName: "Default", addTracks: ["Cave Water"] }));
console.log("  mixer channels now:", JSON.stringify(Object.values(w.MIXER.channels()).map((c) => [c.name, c.paused])));
show("del loaded refused", await call("delete_playlist", { playlistName: "Default" }));
show("del pl dry", await call("delete_playlist", { playlistName: "Dungeon Crawl", dryRun: true }));
show("del pl", await call("delete_playlist", { playlistName: "Dungeon Crawl" }));
show("del tracks dry", await call("delete_tracks", { tag: "Ambience", dryRun: true }));
show("del tracks", await call("delete_tracks", { tag: "Ambience" }));
show("list after", await call("list_tracks", {}));
console.log("localStorage keys:", Object.keys(w.localStorage).join(", "));
process.exit(0);
