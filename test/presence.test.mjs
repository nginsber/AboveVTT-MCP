// Run from the AboveVTT-MCP folder: node test/presence.test.mjs  (needs jsdom)
// Review item 3b: DM tabs find each other over AboveVTT's message channel; only one is active, later ones are
// paused behind an overlay, switching needs Use here + a delayed Yes (never automatic), and a paused tab refuses
// changes through the MCP. Each "tab" is its own jsdom window running page.js + presence.js; a stand-in hub plays
// AboveVTT's server (delivering every message to every connected tab, the sender included). Timings shrunk.
import { JSDOM } from "jsdom"; import fs from "node:fs";
const X = "extension/";
const PAGE = fs.readFileSync(X + "page.js", "utf8"), PRESENCE = fs.readFileSync(X + "presence.js", "utf8");
const TIMING = { HEARTBEAT_MS: 300, EXPIRE_MS: 750, JOIN_WAIT_MS: 120, REPLY_GAP_MS: 30, CONFIRM_DELAY_MS: 250, TICK_MS: 20 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (label, cond, text = "") => { console.log((cond ? "ok   " : "FAIL ") + label); if (!cond) { fails++; console.log("     " + text); } };

const hub = { tabs: [], sent: [] };
class FakeSocket {
  constructor() { this.readyState = 1; this.listeners = []; }
  addEventListener(type, fn) { if (type === "message") this.listeners.push(fn); }
  deliver(raw) { if (this.readyState === 1) for (const fn of this.listeners) fn({ data: raw }); }
}
let senderN = 0;
/** One AboveVTT DM tab with the bridge, in browser `browserId` named `name`. */
function openTab(label, browserId, name, { dm = true } = {}) {
  const dom = new JSDOM(`<!doctype html><body><div id="map">map</div></body>`, { url: "https://www.dndbeyond.com/campaigns/8275104?abovevtt=true&dm=true", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  if (!w.crypto?.randomUUID) Object.defineProperty(w, "crypto", { value: globalThis.crypto });
  const tab = { label, w, socket: new FakeSocket(), sender: "s" + (++senderN), keysSeen: 0, results: {} };
  w.__AVTT_MCP_PRESENCE_TIMING__ = TIMING;
  w.DM = dm; w.gameId = "8275104"; w.AVTT_VERSION = "1.61"; w.CAMPAIGN_INFO = { name: "Frozen Sick" };
  w.ScenesHandler = { scenes: [] };
  w.MB = {
    abovews: tab.socket, mysenderid: tab.sender,
    sendMessage(eventType, data, skipSceneId) {
      if (tab.socket.readyState !== 1) return;
      const raw = JSON.stringify({ action: "sendmessage", eventType, sender: tab.sender, data, cloud: 1, ...(skipSceneId ? {} : { sceneId: "x" }) });
      hub.sent.push({ from: label, eventType, data, skipSceneId });
      for (const t of hub.tabs) t.socket.deliver(raw); // the sender gets its own message back too
    },
  };
  w.eval(PAGE);
  w.eval(PRESENCE);
  // a few stand-in methods: one that changes data, one that reads, one settings export
  w.eval(`AVTT_MCP.register("update_note", async (p) => ({ changed: true, p }));
          AVTT_MCP.register("get_note", async () => ({ title: "x" }));
          AVTT_MCP.register("settings_action", async (p) => ({ action: p.action }));`);
  w.dispatchEvent(new w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "identity", browserId, browserName: name } }, source: w }));
  w.document.getElementById("map").addEventListener("keydown", () => { tab.keysSeen++; });
  w.addEventListener("message", (e) => { const p = e.data?.payload; if (p?.type === "result") tab.results[p.id] = p; });
  hub.tabs.push(tab);
  return tab;
}
let callId = 0;
async function call(tab, method, params = {}) {
  const id = ++callId;
  tab.w.dispatchEvent(new tab.w.MessageEvent("message", { data: { channel: "avtt-mcp:ext", payload: { type: "call", id, method, params } }, source: tab.w }));
  for (let i = 0; i < 50 && !tab.results[id]; i++) await sleep(5);
  return tab.results[id];
}
const role = (t) => t.w.AVTT_MCP.presence.role;
const overlay = (t) => t.w.document.getElementById("avtt-mcp-pause");
const overlayText = (t) => overlay(t)?.querySelector(".card")?.textContent || "";
const button = (t, text) => [...(overlay(t)?.querySelectorAll("button") || [])].find((b) => b.textContent === text);
const press = (t) => t.w.document.getElementById("map").dispatchEvent(new t.w.KeyboardEvent("keydown", { key: "Delete", bubbles: true }));

// ---- one tab --------------------------------------------------------------------------------------
const A = openTab("A", "browser-desktop", "Desktop");
await sleep(250);
check("a DM tab on its own becomes active, no overlay", role(A) === "active" && !overlay(A), role(A));
check("tab info reports dmRole active", A.w.AVTT_MCP.info().dmRole === "active");
const hello = hub.sent.find((m) => m.from === "A");
check("presence goes through AboveVTT's own sendMessage, with the presence type, not tied to a scene",
  hello?.eventType === "custom/myVTT/avttMcpPresence" && hello.skipSceneId === true && hello.data.name === "Desktop" && hello.data.v === 1, JSON.stringify(hello));
check("its message holds only IDs, name, version, role and claim", Object.keys(hello.data).sort().join() === "browserId,epoch,event,name,role,since,tabId,v,version", Object.keys(hello.data).join());
check("its own messages coming back are ignored (still active, no 'other' tabs)", A.w.AVTT_MCP.presence.state().otherDMTabs.length === 0);

// ---- a second DM tab in another browser -----------------------------------------------------------------
const B = openTab("B", "browser-laptop", "Laptop");
await sleep(300);
check("a later DM tab is paused", role(B) === "paused" && role(A) === "active", `${role(A)} / ${role(B)}`);
check("…with an overlay naming the active one", /already open as DM in 'Desktop'/.test(overlayText(B)) && !!button(B, "Use here") && !!button(B, "Leave AboveVTT in this tab"), overlayText(B));
check("…and dmRole paused in its tab info", B.w.AVTT_MCP.info().dmRole === "paused");
check("the active tab knows about the paused one", A.w.AVTT_MCP.presence.state().otherDMTabs.some((p) => p.name === "Laptop" && p.role === "paused"), JSON.stringify(A.w.AVTT_MCP.presence.state()));

press(B);
check("keys don't reach a paused tab's page", B.keysSeen === 0, B.keysSeen);
press(A);
check("…but do in the active tab", A.keysSeen === 1, A.keysSeen);

let r = await call(B, "update_note", { noteTitle: "x", content: "y" });
check("MCP changes are refused in a paused tab, saying which tab is active", r && !r.ok && /paused because 'Desktop' is the active DM tab/.test(r.error), JSON.stringify(r));
r = await call(B, "get_note", { noteTitle: "x" });
check("…reading still works", r?.ok, JSON.stringify(r));
r = await call(B, "update_note", { noteTitle: "x", dryRun: true, replacements: [] });
check("…previews still work", r?.ok, JSON.stringify(r));
r = await call(B, "settings_action", { action: "exportJournal" });
check("…exports still work", r?.ok, JSON.stringify(r));
r = await call(B, "settings_action", { action: "clearAllTokenOptionOverrides" });
check("…but data-changing Settings buttons don't", r && !r.ok, JSON.stringify(r));
r = await call(A, "update_note", { noteTitle: "x", content: "y" });
check("changes still work in the active tab", r?.ok, JSON.stringify(r));

// ---- switching: Use here, then a delayed Yes ------------------------------------------------------------
button(B, "Use here").click();
check("Use here only opens the confirm step", /Make this the active DM tab\?/.test(overlayText(B)) && role(B) === "paused", overlayText(B));
check("…which warns that the other tab will be paused", /'Desktop' will be paused/.test(overlayText(B)) && /unsaved edits/.test(overlayText(B)), overlayText(B));
check("…and the Yes button starts disabled", button(B, "Yes, use this tab")?.disabled === true);
button(B, "Yes, use this tab").click();
await sleep(30);
check("an immediate (accidental) Yes does nothing", role(B) === "paused" && role(A) === "active");
button(B, "Cancel").click();
check("Cancel goes back to the paused card", /already open as DM/.test(overlayText(B)) && role(B) === "paused", overlayText(B));
button(B, "Use here").click();
await sleep(320);
check("after the delay, Yes can be clicked", button(B, "Yes, use this tab")?.disabled === false);
button(B, "Yes, use this tab").click();
await sleep(120);
check("B is now active and its overlay is gone", role(B) === "active" && !overlay(B), role(B));
check("A was paused, and says B was made the active tab", role(A) === "paused" && /'Laptop' was made the active DM tab/.test(overlayText(A)), overlayText(A));
r = await call(A, "update_note", { noteTitle: "x", content: "y" });
check("A now refuses MCP changes", r && !r.ok && /'Laptop' is the active DM tab/.test(r.error), JSON.stringify(r));

// ---- step 3c: switching from chat (the page side) ------------------------------------------------------
r = await call(A, "take_over_dm", { dryRun: true });
const r2 = await call(A, "take_over_dm", { dryRun: true });
check("switch preview from the paused tab names the tab that would be paused", r?.ok && r.result.dryRun && r.result.wouldPause?.where === "'Laptop'" && role(A) === "paused", JSON.stringify(r));
check("…and is identical a moment later (the server re-checks it before switching)", JSON.stringify(r.result) === JSON.stringify(r2.result), JSON.stringify([r.result, r2.result]));
r = await call(B, "take_over_dm", { dryRun: true });
check("in the active tab: already active, nothing to do", r?.ok && r.result.alreadyActive === true, JSON.stringify(r));
r = await call(A, "get_dm_presence");
check("get_dm_presence works in a paused tab and lists the active one", r?.ok && r.result.role === "paused" && r.result.active?.where === "'Laptop'" && r.result.browserName === "Desktop", JSON.stringify(r));
check("tab info says where the active tab is and how many others there are", A.w.AVTT_MCP.info().dmActiveWhere === "'Laptop'" && A.w.AVTT_MCP.info().dmOtherTabs === 1, JSON.stringify(A.w.AVTT_MCP.info()));
r = await call(A, "take_over_dm", {});
await sleep(120);
check("switching from chat works in the paused tab (not blocked like other changes)", r?.ok && r.result.changed === true && role(A) === "active" && role(B) === "paused" && !overlay(A) && !!overlay(B), JSON.stringify(r));
check("…and the other tab's overlay says it was switched", /'Desktop' was made the active DM tab/.test(overlayText(B)), overlayText(B));
button(B, "Use here").click(); await sleep(320); button(B, "Yes, use this tab").click(); await sleep(120); // back to B active for the rest
check("(back to B active)", role(B) === "active" && role(A) === "paused");

// ---- nothing switches automatically ----------------------------------------------------------------------
await sleep(700);
check("roles stay put over several announcements", role(B) === "active" && role(A) === "paused");

// ---- the active tab goes quiet (PC asleep) --------------------------------------------------------------
B.socket.readyState = 3;
await sleep(1000);
check("when the active tab goes silent, the paused tab says so…", /hasn't been heard from for over a minute/.test(overlayText(A)), overlayText(A));
check("…but stays paused (no automatic switch)", role(A) === "paused");
button(A, "Use here").click();
check("the confirm step doesn't warn about unsaved edits in a tab that's gone", /'Laptop' will be paused\./.test(overlayText(A)) && !/unsaved/.test(overlayText(A)), overlayText(A));
await sleep(320);
button(A, "Yes, use this tab").click();
await sleep(60);
check("A takes over when the user confirms", role(A) === "active" && !overlay(A));
const epochA = A.w.AVTT_MCP.presence.state();
B.socket.readyState = 1; // B's PC wakes up, still thinking it's active
await sleep(450);
check("B, waking up, sees it was replaced and pauses itself", role(B) === "paused" && role(A) === "active", `${role(A)} / ${role(B)}`);
check("…its overlay says Desktop was made the active tab", /'Desktop' was made the active DM tab/.test(overlayText(B)), overlayText(B));

// ---- same browser, and two tabs starting at the same moment ------------------------------------------------
const C = openTab("C", "browser-desktop", "Desktop");
await sleep(300);
check("a second DM tab in the same browser is paused too, called 'another tab in this browser'", role(C) === "paused" && /another tab in this browser/.test(overlayText(C)), overlayText(C));

for (const t of hub.tabs) { t.socket.readyState = 3; t.w.close(); } // close the earlier tabs
hub.tabs.length = 0; hub.sent.length = 0;
const D = openTab("D", "b-d", "PC1"), E = openTab("E", "b-e", "PC2");
await sleep(400);
check("two DM tabs starting at the same moment: exactly one ends up active", [role(D), role(E)].sort().join() === "active,paused", `${role(D)} / ${role(E)}`);

// ---- closing a tab says goodbye ----------------------------------------------------------------------------
const active = role(D) === "active" ? D : E, other = active === D ? E : D;
active.w.dispatchEvent(new active.w.Event("pagehide"));
active.socket.readyState = 3; active.w.close(); // the page is gone
await sleep(80);
check("closing the active tab (bye) → the paused tab says it's gone, at once, and still waits", /hasn't been heard from/.test(overlayText(other)) && role(other) === "paused", overlayText(other));

// ---- players' tabs don't take part ----------------------------------------------------------------------
const P = openTab("P", "b-player", "Player PC", { dm: false });
await sleep(250);
check("a player tab never announces itself or gets an overlay", !hub.sent.some((m) => m.from === "P") && !overlay(P) && P.w.AVTT_MCP.presence.role === null);

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
