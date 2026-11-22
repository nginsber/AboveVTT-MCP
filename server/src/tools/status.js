import { z } from "zod";
import { TOKEN_FILE } from "../bridge.js";
import { SERVER_VERSION, TESTED_ABOVEVTT_VERSIONS } from "../version.js";
import { jsonResult } from "../util.js";

export function register(server, bridge) {
  server.registerTool(
    "status",
    {
      title: "AboveVTT connection status",
      description:
        "Check whether the AboveVTT bridge is working: Chrome extension connected, which AboveVTT tabs are open, " +
        "whether the user is the DM there, the AboveVTT version and the current scene. Call this first when " +
        "anything else fails.",
      inputSchema: {
        tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ tabId }) => {
      const report = {
        server: {
          version: SERVER_VERSION,
          ...bridge.describe(),
          tokenFile: TOKEN_FILE,
        },
        extension: bridge.connected
          ? { connected: true, ...bridge.extensionInfo }
          : { connected: false },
        tabs: bridge.tabs,
        ...(bridge.turnedAway ? { otherBrowser: bridge.turnedAway } : {}),
        testedAboveVttVersions: TESTED_ABOVEVTT_VERSIONS,
      };

      if (bridge.connected && bridge.tabs.length > 0) {
        try {
          report.activeTab = await bridge.call("status", {}, { tabId, timeoutMs: 5000 });
          const v = report.activeTab?.aboveVttVersion;
          if (v && !TESTED_ABOVEVTT_VERSIONS.some((t) => String(v).startsWith(t))) {
            report.warning = `AboveVTT ${v} has not been tested with this connector; some tools may fail.`;
          }
        } catch (err) {
          report.activeTabError = err.message;
        }
      }

      const primaryVersion = report.server.primary?.version;
      if (primaryVersion && primaryVersion !== SERVER_VERSION) {
        report.serverWarning = `The copy that owns the bridge (pid ${report.server.primary.pid}) is v${primaryVersion}, ` +
          `this copy is v${SERVER_VERSION}. Restart Claude so all copies run the same build.`;
      }

      report.summary = summarize(report);
      return jsonResult(report);
    }
  );
}

function summarize(r) {
  const base = summarizeConnection(r);
  const o = r.otherBrowser;
  // The turned-away browser retries every 30 s, so a recent refusal means it's still open.
  if (o && Date.now() - Date.parse(o.at) < 90000) {
    const other = o.browserName ? `'${o.browserName}'` : "Another browser";
    const here = r.extension?.browserName ? `'${r.extension.browserName}'` : "this browser";
    return `${base} Note: ${other} also has the AboveVTT MCP Bridge${o.hasDMTab ? " and an AboveVTT DM tab" : ""}, but only one browser can be connected; ${here} is the one in use.`;
  }
  return base;
}

function summarizeConnection(r) {
  const s = r.server;
  if (s.role === "starting") return "Bridge is not running: " + (s.listenError || "still starting");
  if (s.role === "peer" && !s.primary) return "Port in use; could not join the copy that holds it: " + s.peerError;
  if (!r.extension.connected) return "Waiting for the Chrome extension to connect.";
  if (r.tabs.length === 0) return "Extension connected, but no D&D Beyond campaign tab is open.";
  const t = r.activeTab;
  if (!t) return "Extension connected; could not read the AboveVTT tab.";
  if (!t.aboveVttRunning) return "Campaign tab is open, but AboveVTT is not running in it yet.";
  if (!t.isDM) return "AboveVTT is running, but not as the DM. Open the campaign as DM.";
  const d = t.dmTabs; // review item 3c
  if (d?.role === "paused") {
    return `Paused: AboveVTT is open as DM in "${t.campaignName ?? t.gameId}" here, but ${d.active ? `${d.active.where} is the active DM tab` : "the active DM tab hasn't been heard from for over a minute"}. ` +
      "Reading works; changes are refused. To use this tab, click Use here in it, or ask to switch the active DM tab.";
  }
  const others = d?.otherDMTabs?.length ? ` Also open as DM elsewhere (paused): ${d.otherDMTabs.map((o) => o.where).join(", ")}.` : "";
  return `Ready: DM in "${t.campaignName ?? t.gameId}", AboveVTT ${t.aboveVttVersion}, scene "${t.currentScene ?? "none"}".${others}`;
}
