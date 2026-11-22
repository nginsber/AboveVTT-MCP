// Run from the AboveVTT-MCP folder: node test/dm-tabs.test.mjs  (needs server/node_modules)
// Review item 3c, server side: list_dm_tabs, switch_active_dm_tab (preview + yes enforced), status wording.
import os from "node:os"; import fs from "node:fs"; import path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dmtabs-"));
process.env.HOME = tmp; process.env.USERPROFILE = tmp;
const { z } = await import("../server/node_modules/zod/index.js");

let fails = 0;
const check = (label, cond, text = "") => { console.log((cond ? "ok   " : "FAIL ") + label); if (!cond) { fails++; console.log("     " + text); } };

// stand-in bridge: a paused DM tab here; the active one is 'Laptop'
const state = { role: "paused", active: { tabId: "L1", where: "'Laptop'", name: "Laptop", since: 1795300000000, sameBrowser: false }, switches: 0 };
const calls = [];
const bridge = {
  connected: true, tabs: [{ tabId: 5, aboveVttRunning: true, isDM: true, dmRole: "paused" }],
  async call(method, p) {
    calls.push({ method, p });
    if (method === "get_dm_presence") return { tabId: "me", role: state.role, active: state.role === "active" ? "this tab" : state.active, browserName: "Desktop",
      otherDMTabs: [{ ...state.active, role: state.role === "active" ? "paused" : "active", lastSeen: Date.now() - 12000 }] };
    if (method === "take_over_dm") {
      if (state.role === "active") return { ...(p.dryRun ? { dryRun: true } : {}), alreadyActive: true, changed: false };
      const other = { tabId: state.active.tabId, where: state.active.where, name: state.active.name, since: state.active.since, sameBrowser: false };
      if (p.dryRun) return { dryRun: true, alreadyActive: false, wouldPause: other, activeTabGone: false };
      state.role = "active"; state.switches++;
      return { alreadyActive: false, changed: true, paused: other, activeTabGone: false };
    }
    if (method === "status") return { aboveVttRunning: true, isDM: true, campaignName: "Frozen Sick", aboveVttVersion: "1.61", currentScene: "The Tavern",
      dmTabs: { role: state.role, active: state.role === "active" ? "this tab" : state.active, otherDMTabs: [{ where: "'Laptop'", role: state.role === "active" ? "paused" : "active" }] } };
    throw new Error("unexpected " + method);
  },
  describe: () => ({ role: "primary" }),
};
const tools = {}, defs = {};
const server = { registerTool: (n, d, f) => { tools[n] = f; defs[n] = d; } };
(await import("../server/src/tools/dm_tabs.js")).register(server, bridge);
(await import("../server/src/tools/status.js")).register(server, bridge);
const run = async (n, p = {}) => (await tools[n](p)).content[0].text;
const tokenIn = (t) => t.match(/confirmToken: "([0-9a-f]+)"/)?.[1];

let t = await run("list_dm_tabs");
check("list_dm_tabs: says this tab is paused and which is active", /This DM tab is paused: 'Laptop' is the active DM tab/.test(t) && /'Laptop' — active/.test(t) && /last heard 12 s ago/.test(t), t);
const st = JSON.parse(await run("status"));
check("status summary says paused, where the active tab is, and how to switch", /^Paused: AboveVTT is open as DM in "Frozen Sick" here, but 'Laptop' is the active DM tab\. Reading works; changes are refused/.test(st.summary), st.summary);

check("switch tool description: only when asked, preview + yes, never to get around 'paused'", /Only when the user explicitly asks/.test(defs.switch_active_dm_tab.description) && /explicit yes in chat/.test(defs.switch_active_dm_tab.description) && /get around a 'paused' error/.test(defs.switch_active_dm_tab.description));
check("switch tool schema accepts dryRun and confirmToken", z.object(defs.switch_active_dm_tab.inputSchema).safeParse({ dryRun: true, confirmToken: "x" }).success);
t = await run("switch_active_dm_tab");
check("switching without a preview is refused", /needs a preview first/.test(t) && state.switches === 0, t);
t = await run("switch_active_dm_tab", { dryRun: true });
check("preview names the tab that would be paused and warns about unsaved edits", /pause 'Laptop' \(active since/.test(t) && /unsaved edits/.test(t) && !!tokenIn(t) && state.switches === 0, t);
const tok = tokenIn(t);
t = await run("switch_active_dm_tab", { confirmToken: tok, tabId: 9 });
check("the token doesn't work for another tab", /different request/.test(t) && state.switches === 0, t);
t = await run("switch_active_dm_tab", { dryRun: true });
const tok2 = tokenIn(t);
state.active = { ...state.active, tabId: "L2", where: "'Tablet'", name: "Tablet", since: 1795300100000 }; // someone switched elsewhere meanwhile
t = await run("switch_active_dm_tab", { confirmToken: tok2 });
check("if the active tab changed since the preview, nothing switches", /no longer the same as in the preview/.test(t) && state.switches === 0, t);
t = await run("switch_active_dm_tab", { dryRun: true });
t = await run("switch_active_dm_tab", { confirmToken: tokenIn(t) });
check("after a fresh preview and the token, it switches", state.switches === 1 && /This DM tab is now the active one; 'Tablet' \(active since/.test(t), t);
const log = fs.readFileSync(path.join(tmp, ".abovevtt-mcp", "change-log.jsonl"), "utf8");
check("the switch is in the change log", /switch_active_dm_tab/.test(log));
t = await run("switch_active_dm_tab", { dryRun: true });
check("already active: says so, offers no token, and points to the paused tab in this browser", /already the active one/.test(t) && !tokenIn(t) && /tabId 5/.test(t), t);
const st2 = JSON.parse(await run("status"));
check("status when active mentions the paused tab elsewhere", /^Ready: .* Also open as DM elsewhere \(paused\): 'Laptop'\./.test(st2.summary), st2.summary);

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
