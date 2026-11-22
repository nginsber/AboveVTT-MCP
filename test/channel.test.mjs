// Run from the AboveVTT-MCP folder: node test/channel.test.mjs  (needs jsdom)
// Security review item 2 (option C), page side: commands and results no longer travel through window messages,
// and the bridge's entry points can't be replaced or extended by other scripts on the page.
import { JSDOM } from "jsdom"; import fs from "node:fs";
let fails = 0;
const check = (label, cond, text = "") => { console.log((cond ? "ok   " : "FAIL ") + label); if (!cond) { fails++; console.log("     " + text); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1?abovevtt=true&dm=true", runScripts: "outside-only" });
const w = dom.window;
w.DM = true; w.MB = {}; w.ScenesHandler = { scenes: [] };
w.eval(fs.readFileSync("extension/page.js", "utf8"));
w.eval(`window.deleted = 0; AVTT_MCP.register("delete_scene", async () => { window.deleted++; return { deleted: true }; });`);
w.eval(fs.readFileSync("extension/seal.js", "utf8"));
const posted = [];
w.addEventListener("message", (e) => posted.push(e.data));

// commands only through the locked entry point
let r = await w.__avttMcpRun("delete_scene", {});
check("the locked entry point runs a command and returns its result", r.ok && r.result.deleted && w.deleted === 1, JSON.stringify(r));
r = await w.__avttMcpRun("nope", {});
check("unknown methods give a clear error", !r.ok && /Unknown method 'nope'/.test(r.error), JSON.stringify(r));
w.dispatchEvent(new w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "call", id: 1, method: "delete_scene", params: {} } }, source: w }));
await sleep(30);
check("a command sent by window message (the old way) does nothing", w.deleted === 1, w.deleted);
check("…and no result is posted on the page for others to read", !posted.some((d) => d?.payload?.type === "result"), JSON.stringify(posted));

// nothing can be replaced
w.eval(`try { window.__avttMcpRun = async () => ({ ok: true, result: "forged" }); } catch {}`);
r = await w.__avttMcpRun("delete_scene", {});
check("assigning over __avttMcpRun has no effect", r.result?.deleted === true, JSON.stringify(r));
let threw = false; try { w.eval(`Object.defineProperty(window, "__avttMcpRun", { value: () => 1 })`); } catch { threw = true; }
check("…and it can't be redefined", threw);
threw = false; try { w.eval(`Object.defineProperty(window, "__avttMcpInfo", { value: () => ({ isDM: true }) })`); } catch { threw = true; }
check("__avttMcpInfo can't be redefined", threw);
w.eval(`try { window.AVTT_MCP = { fake: true }; } catch {}`);
check("window.AVTT_MCP can't be swapped for another object", w.AVTT_MCP.fake === undefined && typeof w.AVTT_MCP.register === "function");
threw = false; try { w.eval(`AVTT_MCP.register("delete_scene", async () => ({ forged: true }))`); } catch { threw = true; }
r = await w.__avttMcpRun("delete_scene", {});
check("after loading, no method can be added or replaced (sealed)", threw && r.result?.deleted === true, JSON.stringify(r));
w.eval(`try { AVTT_MCP.nameKey = () => "x"; } catch {}`);
check("AVTT_MCP's helpers can't be changed either (frozen)", w.AVTT_MCP.nameKey("A") === "a");

// info and identity
w.__avttMcpSetIdentity({ browserId: "b1", browserName: "Desktop" });
check("identity is set through its locked function", w.AVTT_MCP.identity.browserName === "Desktop" && w.AVTT_MCP.identity.browserId === "b1");
w.dispatchEvent(new w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "identity", browserId: "evil", browserName: "Evil" } }, source: w }));
await sleep(10);
check("an identity sent by window message (the old way) is ignored", w.AVTT_MCP.identity.browserName === "Desktop");
const info = w.__avttMcpInfo();
check("__avttMcpInfo returns the tab info", info.isDM === true && info.url.includes("/campaigns/1"), JSON.stringify(info));
posted.length = 0;
w.ScenesHandler = { scenes: [{ id: "s" }] }; w.AVTT_VERSION = "1.61";
await sleep(3200);
const nudges = posted.filter((d) => d?.channel === "avtt-mcp:page");
check("when info changes, the page sends only a bare nudge (no data)", nudges.length >= 1 && nudges.every((d) => JSON.stringify(d.payload) === '{"type":"infoChanged"}'), JSON.stringify(nudges));

// relay.js (the extension's side of the tab) passes on only the bare nudge
const d2 = new JSDOM(`<!doctype html><body></body>`, { url: "https://www.dndbeyond.com/campaigns/1", runScripts: "outside-only" });
const w2 = d2.window, toBackground = [];
w2.chrome = { runtime: { connect: () => ({ postMessage: (m) => toBackground.push(m), onMessage: { addListener() {} }, onDisconnect: { addListener() {} } }) } };
w2.eval(fs.readFileSync("extension/relay.js", "utf8"));
const fromPage = (payload) => w2.dispatchEvent(new w2.MessageEvent("message", { data: { channel: "avtt-mcp:page", payload }, source: w2 }));
fromPage({ type: "result", id: 3, ok: true, result: { forged: true } });
fromPage({ type: "info", info: { isDM: true } });
fromPage({ type: "infoChanged", extra: "ignored" });
await sleep(10);
check("relay.js passes on only the nudge, without anything else attached", JSON.stringify(toBackground) === '[{"type":"infoChanged"}]', JSON.stringify(toBackground));

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
