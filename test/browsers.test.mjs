// Run from the AboveVTT-MCP folder: node test/browsers.test.mjs  (needs server/node_modules)
// Review item 3a: two browsers with the bridge no longer push each other off the server. Uses the real
// server bridge and stand-in browsers (WebSocket clients that look like the extension).
import os from "node:os"; import fs from "node:fs"; import path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "browsers-"));
process.env.HOME = tmp; process.env.USERPROFILE = tmp; process.env.AVTT_KEEPALIVE_MS = "300";
const { Bridge } = await import("../server/src/bridge.js");
const { default: WebSocket } = await import("../server/node_modules/ws/wrapper.mjs");

let fails = 0;
const check = (label, cond, text = "") => { console.log((cond ? "ok   " : "FAIL ") + label); if (!cond) { fails++; console.log("     " + text); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 47990, TOKEN = "t".repeat(24);
const bridge = new Bridge({ port: PORT, token: TOKEN, version: "test" });
bridge.start();
await sleep(150);

const dmTab = { tabId: 1, aboveVttRunning: true, isDM: true, campaignName: "Frozen Sick" };
const plainTab = { tabId: 2, aboveVttRunning: false, isDM: false };
/** A stand-in browser: connects like background.js does and records how the connection ends. */
function browser(browserId, browserName, tabs, { autoPong = true, answerCalls = true } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: "chrome-extension://abc", autoPong });
    const b = { ws, browserId, closed: null, welcomed: false, calls: 0 };
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", token: TOKEN, extVersion: "x", browserId, browserName, tabs })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.type === "welcome") { b.welcomed = true; resolve(b); }
      if (m.type === "call" && answerCalls) { b.calls++; ws.send(JSON.stringify({ type: "result", id: m.id, ok: true, result: { from: browserName } })); }
    });
    ws.on("close", (code, reason) => { b.closed = { code, reason: String(reason) }; resolve(b); });
  });
}

let A = await browser("A", "Desktop", [plainTab]);
check("first browser connects", A.welcomed && bridge.connected, JSON.stringify(A.closed));
let B = await browser("B", "Laptop", [plainTab]);
check("second browser (no DM tab either) is turned away, not swapped in", B.closed?.code === 4002 && !A.closed && bridge.extensionInfo.browserId === "A", JSON.stringify(B.closed));
check("…and told which browser is connected", /Desktop/.test(B.closed?.reason || ""), B.closed?.reason);
check("server remembers the turned-away browser", bridge.turnedAway?.browserName === "Laptop" && bridge.turnedAway.hasDMTab === false, JSON.stringify(bridge.turnedAway));
let r = await bridge.call("status", {});
check("calls still go to the first browser", r.from === "Desktop", JSON.stringify(r));

B = await browser("B", "Laptop", [dmTab]);
await sleep(50);
check("a browser with the AboveVTT DM tab takes over from one without", B.welcomed && A.closed?.code === 4000 && /DM tab/.test(A.closed.reason) && bridge.extensionInfo.browserId === "B", JSON.stringify({ A: A.closed, B: B.closed }));
check("…and the old one is now the one recorded as turned away", bridge.turnedAway?.browserName === "Desktop", JSON.stringify(bridge.turnedAway));
r = await bridge.call("status", {});
check("calls now go to the browser with the DM tab", r.from === "Laptop", JSON.stringify(r));

A = await browser("A", "Desktop", [plainTab]);
check("the old browser reconnecting (no DM tab) is turned away — no flip-flop", A.closed?.code === 4002 && bridge.extensionInfo.browserId === "B", JSON.stringify(A.closed));
A = await browser("A", "Desktop", [dmTab]);
check("both have a DM tab: the connected one stays", A.closed?.code === 4002 && bridge.extensionInfo.browserId === "B" && /otherHasDMTab":true/.test(A.closed.reason), JSON.stringify(A.closed));

A = await browser("A", "Desktop", [{ ...dmTab, dmRole: "paused" }]);
check("a browser whose DM tab is paused doesn't count as having the DM tab", A.closed?.code === 4002 && bridge.extensionInfo.browserId === "B", JSON.stringify(A.closed));
const oldB = B;
B = await browser("B", "Laptop", [dmTab]);
await sleep(50);
check("the same browser reconnecting replaces its own old connection", B.welcomed && oldB.closed?.code === 4000 && /same browser/.test(oldB.closed.reason), JSON.stringify(oldB.closed));
check("turned-away record clears when that browser connects", bridge.turnedAway?.browserId !== "B");

// B (connected) now reports its DM tab as paused; A with an active DM tab takes over
B.ws.send(JSON.stringify({ type: "tabs", tabs: [{ ...dmTab, dmRole: "paused" }] }));
await sleep(50);
A = await browser("A", "Desktop", [{ ...dmTab, dmRole: "active" }]);
await sleep(50);
check("a browser with the active DM tab takes over from one whose DM tab is paused", A.welcomed && B.closed?.code === 4000 && bridge.extensionInfo.browserId === "A", JSON.stringify({ A: A.closed, B: B.closed }));
A.ws.close(); await sleep(50);
B = await browser("B", "Laptop", [dmTab]);

// A connection that stops answering (e.g. the PC went to sleep) can be replaced by anyone.
B.ws.close(); await sleep(50);
B = await browser("B", "Laptop", [dmTab], { autoPong: false });
check("browser B connected (and won't answer pings)", B.welcomed && bridge.extensionInfo.browserId === "B");
await sleep(1100); // > 2 keepalives + margin at 300 ms
A = await browser("A", "Desktop", [plainTab]);
await sleep(50);
check("an unresponsive connection is replaced even by a browser without a DM tab", A.welcomed && B.closed?.code === 4000 && /stopped answering/.test(B.closed.reason), JSON.stringify({ A: A.closed, B: B.closed }));

// status tool wording
const { register } = await import("../server/src/tools/status.js");
const tools = {};
register({ registerTool: (n, d, f) => { tools[n] = f; } }, bridge);
const C = await browser("C", "Tablet", [dmTab]);
await sleep(50);
const st = JSON.parse((await tools.status({})).content[0].text);
check("a DM-tab browser (Tablet) took over from Desktop, which had none", C.welcomed && A.closed?.code === 4000);
check("status says the other browser has the bridge, and which one is in use", /'Desktop' also has the AboveVTT MCP Bridge, but only one browser can be connected; 'Tablet' is the one in use/.test(st.summary) && st.otherBrowser?.browserName === "Desktop", st.summary);

bridge.stop();
console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
