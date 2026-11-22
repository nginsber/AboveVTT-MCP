// Run from the AboveVTT-MCP folder: node test/badge.test.mjs
// Checks the toolbar icon and tooltip (review item 4): the rules in extension/badge.js, the real
// extension/background.js driving them (stand-in Chrome API and WebSocket), and the status icon images.
import fs from "node:fs"; import vm from "node:vm"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { badgeFor, COLORS } = require("../extension/badge.js");
const G = "ready", O = "nodm", Y = "connecting", R = "badtoken", GREY = "off";
const stateOf = (path) => path?.[16]?.match(/status\/([a-z]+)16\.png$/)?.[1];

let fails = 0;
const check = (label, cond, text = "") => { console.log((cond ? "ok   " : "FAIL ") + label); if (!cond) { fails++; console.log("     " + text); } };

// ---- the rules ------------------------------------------------------------------------------
const dmTab = { tabId: 1, campaignName: "Frozen Sick", gameId: "8275104", aboveVttRunning: true, isDM: true, aboveVttVersion: "1.61" };
const plainTab = { tabId: 2, campaignName: "Frozen Sick", gameId: "8275104", aboveVttRunning: false, isDM: false };
const playerTab = { tabId: 3, campaignName: "Frozen Sick", aboveVttRunning: true, isDM: false };
let b = badgeFor("connected", [plainTab, dmTab]);
check("connected + DM tab → green MCP, says ready", b.state === G && b.icon[16] === "icons/status/ready16.png" && b.icon[32] === "icons/status/ready32.png" && /ready/.test(b.title) && /“Frozen Sick”/.test(b.title), JSON.stringify(b));
b = badgeFor("connected", []);
check("connected, no campaign open → orange MCP, says to open it", b.state === O && /No D&D Beyond campaign is open/.test(b.title), JSON.stringify(b));
b = badgeFor("connected", [plainTab]);
check("connected, campaign page without AboveVTT → orange, says start AboveVTT", b.state === O && /isn't running there/.test(b.title), JSON.stringify(b));
b = badgeFor("connected", [playerTab]);
check("connected, AboveVTT as player → orange, says DM view needed", b.state === O && /as a player/.test(b.title), JSON.stringify(b));
b = badgeFor("connected", [{ ...dmTab, dmRole: "paused", dmActiveWhere: "'Laptop'" }]);
check("connected, DM tab paused (another is active) → orange, says paused and where", b.state === O && /connected to Claude, paused/.test(b.title) && /active as DM in 'Laptop'/.test(b.title) && /Use here/.test(b.title), b.title);
b = badgeFor("connected", [{ ...dmTab, dmRole: "active", dmOtherTabs: 1 }]);
check("connected, active DM tab with one paused elsewhere → green, mentions it", b.state === G && /Also open as DM elsewhere: 1 tab, paused/.test(b.title), b.title);
b = badgeFor("connected", [{ ...dmTab, dmRole: "paused", dmActiveWhere: "another tab in this browser" }, { ...dmTab, tabId: 9, dmRole: "active" }]);
check("one tab active and one paused in this browser → green", b.state === G, b.title);
b = badgeFor("connecting", [dmTab]);
check("connecting → yellow MCP", b.state === Y && /connecting/.test(b.title), JSON.stringify(b));
b = badgeFor("bad-token", [dmTab], "The server rejected the token. Copy it again from bridge-token.txt.");
check("bad token → red MCP, with the error", b.state === R && /bridge-token\.txt/.test(b.title), JSON.stringify(b));
b = badgeFor("disconnected", [dmTab], "Server not running (is Claude desktop open?)");
check("server not running → grey MCP even with a DM tab open, tooltip says both", b.state === GREY && /not connected/.test(b.title) && /running as DM/.test(b.title), JSON.stringify(b));
b = badgeFor("other-browser", [dmTab], "", { other: "Laptop", otherHasDMTab: true });
check("another browser connected → grey, names it, says it stays while it has the DM tab", b.state === GREY && /using another browser \('Laptop'\)/.test(b.title) && /stays connected/.test(b.title), JSON.stringify(b));
b = badgeFor("other-browser", [], "", { other: "", otherHasDMTab: false });
check("…without a DM tab there: says this one takes over when it has one", /takes over when it has an AboveVTT DM tab/.test(b.title), b.title);
check("every tooltip ends with 'Click for settings.'", ["connected", "connecting", "bad-token", "disconnected", "other-browser"].every((s) => /Click for settings\.$/.test(badgeFor(s, []).title)));

// ---- background.js driving the icon ------------------------------------------------------------
const badge = { text: null, color: null, title: null, iconCalls: 0 };
let connectListener = null;
const stored = {};
const sockets = [];
class FakeWS {
  static OPEN = 1; static CONNECTING = 0;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; }
}
const ev = () => ({ addListener() {} });
const chrome = {
  runtime: { getManifest: () => ({ version: "test" }), onConnect: { addListener: (f) => { connectListener = f; } }, onMessage: ev(), onStartup: ev(), onInstalled: ev(), openOptionsPage() {} },
  storage: { local: { get: async (defaults) => ({ ...defaults, port: 47321, token: "x".repeat(24), browserName: "Desktop", ...stored }), set: async (o) => Object.assign(stored, o) }, onChanged: ev() },
  action: {
    setIcon: ({ path }) => { badge.color = stateOf(path); badge.path = path; badge.iconCalls++; },
    setBadgeText: ({ text }) => { badge.text = text; },
    setTitle: ({ title }) => { badge.title = title; },
    onClicked: ev(),
  },
  permissions: { contains: async () => false },
};
const ctx = { chrome, WebSocket: FakeWS, setTimeout, clearTimeout, console, JSON, Date, Map, Math, Number, String, crypto: globalThis.crypto };
ctx.self = ctx;
ctx.importScripts = (...files) => { for (const f of files) vm.runInContext(fs.readFileSync("extension/" + f, "utf8"), ctx); };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("extension/background.js", "utf8"), ctx);
const tick = () => new Promise((r) => setTimeout(r, 5));
await tick(); await tick();

check("starts as connecting (yellow), Chrome badge left empty", badge.color === Y && badge.text === "", JSON.stringify(badge));
const ws = sockets.at(-1);
ws.onmessage({ data: JSON.stringify({ type: "welcome" }) });
check("server says welcome, no tabs → orange", badge.color === O && /No D&D Beyond campaign is open/.test(badge.title), JSON.stringify(badge));

// a campaign tab connects (relay.js) and reports AboveVTT still loading, then running as DM
let onMsg, onDisc;
const port = { name: "avtt-tab", sender: { tab: { id: 7, url: "https://www.dndbeyond.com/campaigns/8275104" } },
  onMessage: { addListener: (f) => { onMsg = f; } }, onDisconnect: { addListener: (f) => { onDisc = f; } }, postMessage() {} };
connectListener(port);
onMsg({ type: "info", info: { ...plainTab, tabId: undefined } });
check("tab open, AboveVTT not started → orange", badge.color === O && /isn't running there/.test(badge.title), badge.title);
onMsg({ type: "info", info: { ...dmTab, tabId: undefined } });
check("AboveVTT starts as DM → green", badge.color === G && /Frozen Sick/.test(badge.title), JSON.stringify(badge));
const calls = badge.iconCalls;
for (let i = 0; i < 5; i++) onMsg({ type: "info", info: { ...dmTab, tabId: undefined } });
check("repeated identical reports don't touch the icon", badge.iconCalls === calls, `${badge.iconCalls} vs ${calls}`);
onDisc();
check("tab closed → back to orange", badge.color === O, JSON.stringify(badge));
connectListener(port);
onMsg({ type: "info", info: { ...dmTab, tabId: undefined } });
ws.onclose({ code: 1006, reason: "" });
check("server stops → grey, tooltip still mentions the DM tab", badge.color === GREY && /running as DM/.test(badge.title), JSON.stringify(badge));
const ws2 = sockets.at(-1);
if (ws2 === ws) { await new Promise((r) => setTimeout(r, 1100)); }
const ws3 = sockets.at(-1);
ws3.onclose?.({ code: 4001, reason: "" });
check("server rejects the token → red", badge.color === R, JSON.stringify(badge));

// ---- review item 3a: another browser is connected -------------------------------------------
await new Promise((r) => setTimeout(r, 1100));
let ws4 = sockets.at(-1);
await new Promise((r) => setTimeout(r, 10));
const hello = ws4.sent.find((m) => m.type === "hello");
check("hello carries a browser ID (made once and stored) and the name", hello && /^[0-9a-f-]{36}$/.test(hello.browserId) && stored.browserId === hello.browserId && hello.browserName === "Desktop", JSON.stringify(hello));
onDisc(); // no DM tab open in this browser now
ws4.onclose({ code: 4002, reason: JSON.stringify({ other: "Laptop", otherHasDMTab: true }) });
check("turned away → grey, tooltip names the other browser", badge.color === GREY && /'Laptop'/.test(badge.title), badge.title);
const before4 = sockets.length;
await new Promise((r) => setTimeout(r, 1500));
check("…and doesn't hammer the server (waits ~30 s, not 1 s)", sockets.length === before4, `${sockets.length - before4} new connection(s)`);
connectListener(port);
onMsg({ type: "info", info: { ...dmTab, tabId: undefined } });
await new Promise((r) => setTimeout(r, 700));
check("…but asks again at once when this browser gets an AboveVTT DM tab", sockets.length === before4 + 1, `${sockets.length - before4} new connection(s)`);
const hello2 = (await new Promise((r) => setTimeout(() => r(sockets.at(-1)), 10))).sent.find((m) => m.type === "hello");
check("…with the same browser ID", hello2?.browserId === hello.browserId, JSON.stringify(hello2));

// ---- the manifest points at icons that exist ---------------------------------------------------
const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
const iconFiles = [...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {})];
check("manifest has toolbar and extension icons", iconFiles.length >= 6, JSON.stringify(iconFiles));
check("every icon file exists", iconFiles.every((f) => fs.existsSync("extension/" + f)), iconFiles.filter((f) => !fs.existsSync("extension/" + f)).join(", "));
check("icon credit is included", fs.existsSync("extension/icons/NOTICE.md") && /AGPL-3\.0/.test(fs.readFileSync("extension/icons/NOTICE.md", "utf8")));
const colors = Object.values(COLORS);
check("five different colours", new Set(colors).size === 5, colors.join(" "));
const states = ["ready", "nodm", "connecting", "off", "badtoken"];
const statusFiles = states.flatMap((s) => [`extension/icons/status/${s}16.png`, `extension/icons/status/${s}32.png`]);
check("all 10 status icons exist", statusFiles.every((f) => fs.existsSync(f)), statusFiles.filter((f) => !fs.existsSync(f)).join(", "));
// each status icon's "MCP" pixels are mostly its state's colour (read the PNGs with a tiny decoder)
const zlib = await import("node:zlib");
function readPng(file) {
  const b = fs.readFileSync(file); let p = 8, w, h, data = [];
  while (p < b.length) { const len = b.readUInt32BE(p), type = b.toString("ascii", p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[9] !== 6) throw new Error("expected 8-bit RGBA"); }
    if (type === "IDAT") data.push(d); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(data)), px = Buffer.alloc(w * h * 4), bpp = 4, stride = w * 4;
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      const pr = (() => { const q = a + up - c, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); return pa <= pb && pa <= pc ? a : pb <= pc ? up : c; })();
      px[y * stride + x] = (row[x] + [0, a, up, (a + up) >> 1, pr][f]) & 255; } }
  return { w, h, px };
}
for (const s of states) for (const size of [16, 32]) {
  const { w, h, px } = readPng(`extension/icons/status/${s}${size}.png`);
  const [cr, cg, cb] = [1, 3, 5].map((i) => parseInt(COLORS[s].slice(i, i + 2), 16));
  let hits = 0;
  for (let y = Math.floor(h * 0.6); y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4;
    if (Math.abs(px[i] - cr) < 8 && Math.abs(px[i + 1] - cg) < 8 && Math.abs(px[i + 2] - cb) < 8) hits++; }
  if (w !== size || hits < (size === 16 ? 20 : 80)) check(`${s}${size}.png has MCP in its colour`, false, `${w}x${h}, ${hits} pixels`);
}
check("every status icon has 'MCP' in its own colour, at the right size", true);

// ---- review item 3b: calls go to the active DM tab, not a paused one ------------------------------
const wsCall = sockets.at(-1);
wsCall.onmessage({ data: JSON.stringify({ type: "welcome" }) });
const got = [];
const mkPort = (id, info) => {
  let onM;
  const p = { name: "avtt-tab", sender: { tab: { id, url: "https://www.dndbeyond.com/campaigns/8275104" } },
    onMessage: { addListener: (f) => { onM = f; } }, onDisconnect: { addListener() {} }, postMessage: (m) => { if (m.type === "call") got.push(id); } };
  connectListener(p);
  onM({ type: "info", info });
  return p;
};
const { tabId: _omit, ...dmInfo } = dmTab; // real tabs don't report a tabId of their own
mkPort(21, { ...dmInfo, dmRole: "active" });
mkPort(22, { ...dmInfo, dmRole: "paused" }); // reported more recently
wsCall.onmessage({ data: JSON.stringify({ type: "call", id: "c1", method: "status", params: {} }) });
check("a call without a tab goes to the active DM tab, not the more recent paused one", got.at(-1) === 21, JSON.stringify(got));

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
