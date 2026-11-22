// Security review item 6: map-image reading must not reach this computer or the local network.
import fs from "node:fs";
import vm from "node:vm";

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : "  " + extra}`); };

const g = { URL };
vm.createContext(g); g.self = g;
vm.runInContext(fs.readFileSync("extension/netguard.js", "utf8"), g);
const blocked = g.AVTT_blockedImageUrl;

const refuse = [
  "http://localhost/map.png", "http://LOCALHOST.:8080/x", "http://127.0.0.1/x", "http://127.1/x", "http://2130706433/x",
  "http://0x7f000001/x", "http://0.0.0.0/x", "http://10.0.0.5/x", "http://172.16.0.1/x", "http://172.31.255.255/x",
  "http://192.168.1.1/admin", "http://169.254.169.254/latest/meta-data", "http://100.100.1.1/x",
  "http://[::1]/x", "http://[::ffff:127.0.0.1]/x", "http://[::ffff:192.168.0.10]/x", "http://[fd00::1]/x", "http://[fe80::1]/x",
  "http://router/x", "http://nas.local/x", "http://printer.lan/x", "http://app.localhost/x", "http://box.home.arpa/x",
  "https://user:pass@example.com/x.png", "ftp://example.com/x.png", "file:///C:/map.png", "not a url",
];
for (const u of refuse) check(`refuses ${u}`, !!blocked(u), String(blocked(u)));

const allow = [
  "https://i.imgur.com/abc.png", "https://www.dndbeyond.com/avatars/1.jpg", "http://8.8.8.8/x.png",
  "https://172.32.0.1/x", "https://192.169.0.1/x", "https://[2606:4700::1111]/x", "https://cdn.example.co.uk/maps/cave.webp",
];
for (const u of allow) check(`allows ${u}`, blocked(u) === null, String(blocked(u)));

// background.js: blocked before any request, and a redirect into the local network isn't read
const fetched = [];
const ev = () => ({ addListener() {} });
const chrome = {
  runtime: { getManifest: () => ({ version: "test" }), onConnect: ev(), onMessage: ev(), onStartup: ev(), onInstalled: ev() },
  storage: { local: { get: async (d) => ({ ...d, token: "" }), set: async () => {} }, onChanged: ev() },
  action: { setIcon() {}, setBadgeText() {}, setTitle() {}, onClicked: ev() },
  permissions: { contains: async () => true },
  scripting: { executeScript: async () => [{ result: null }] },
};
let cancelled = false;
const fakeFetch = async (u) => {
  fetched.push(u);
  if (u.includes("redirects")) return { ok: true, redirected: true, url: "http://192.168.1.1/secret.png", body: { cancel() { cancelled = true; } }, blob: async () => { throw new Error("read the body!"); } };
  return { ok: false, status: 404, redirected: false, url: u };
};
class FakeWS { constructor() { this.readyState = 0; } send() {} close() {} }
const ctx = { chrome, fetch: fakeFetch, WebSocket: FakeWS, setTimeout, clearTimeout, console, JSON, Date, Map, Math, Number, String, URL, crypto: globalThis.crypto };
ctx.self = ctx;
ctx.importScripts = (...files) => { for (const f of files) vm.runInContext(fs.readFileSync("extension/" + f, "utf8"), ctx); };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("extension/background.js", "utf8"), ctx);
const errOf = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

let e = await errOf(ctx.detectGridFromUrl({ url: "http://192.168.1.1/map.png" }));
check("background refuses a private address", /private address/.test(e || ""), e);
check("…without sending any request", fetched.length === 0, JSON.stringify(fetched));
e = await errOf(ctx.detectGridFromUrl({ url: "https://maps.example.com/redirects.png" }));
check("background refuses what a redirect to the local network returned", /redirected to a blocked address/.test(e || ""), e);
check("…and drops the response body", cancelled);
e = await errOf(ctx.detectGridFromUrl({ url: "https://maps.example.com/missing.png" }));
check("public links still go through (404 reported)", /HTTP 404/.test(e || ""), e);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
