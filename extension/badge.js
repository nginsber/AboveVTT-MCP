// What the toolbar icon and its tooltip show (review item 4). Kept free of chrome.* calls so it can be
// tested on its own; background.js applies the result.
// The toolbar icon is AboveVTT's red "A" with "MCP" drawn underneath; the colour of "MCP" gives the state
// (images in icons/status/, made by tools/make_status_icons.py). Chrome's badge isn't used: it covered the icon.
//   green   ready       connected to the MCP server and an AboveVTT tab is running as DM
//   orange  nodm        connected to the server, but no AboveVTT DM tab (none open, not started, or as a player)
//   yellow  connecting  connecting to the server
//   red     badtoken    the server rejected the token
//   grey    off         server not running / not reachable
(function (root) {
  const COLORS = { ready: "#4caf50", nodm: "#ff9800", connecting: "#ffeb3b", badtoken: "#f44336", off: "#9e9e9e" };
  const iconPaths = (state) => ({ 16: `icons/status/${state}16.png`, 32: `icons/status/${state}32.png` });
  const name = (t) => (t.campaignName ? `“${t.campaignName}”` : t.gameId ? `campaign ${t.gameId}` : "the campaign");

  /** The open campaign tabs, in words. */
  function tabsLine(tabs) {
    const dm = tabs.filter((t) => t.aboveVttRunning && t.isDM);
    if (dm.length) return `AboveVTT is running as DM in ${dm.map(name).join(", ")}${dm[0].aboveVttVersion ? ` (AboveVTT ${dm[0].aboveVttVersion})` : ""}.`;
    const player = tabs.find((t) => t.aboveVttRunning && !t.isDM);
    if (player) return `AboveVTT is running as a player in ${name(player)}. The tools need the DM view.`;
    if (tabs.length) return `A D&D Beyond campaign page is open (${name(tabs[0])}), but AboveVTT isn't running there. Start AboveVTT as DM.`;
    return "No D&D Beyond campaign is open. Open your campaign with AboveVTT as DM.";
  }

  /**
   * @param state "connected" | "connecting" | "disconnected" | "bad-token"
   * @param tabs the tab list kept by background.js (each with aboveVttRunning, isDM, campaignName…)
   * @param error the last connection error, if any
   * @returns {{ state: string, color: string, icon: { 16: string, 32: string }, title: string }}
   */
  function badgeFor(state, tabs = [], error = "") {
    const b = (state, title) => ({ state, color: COLORS[state], icon: iconPaths(state), title });
    const head = "AboveVTT MCP Bridge";
    const tail = "\nClick for settings.";
    const ready = tabs.some((t) => t.aboveVttRunning && t.isDM);
    if (state === "connected") {
      return ready
        ? b("ready", `${head}: ready.\nConnected to Claude. ${tabsLine(tabs)}${tail}`)
        : b("nodm", `${head}: connected to Claude, not ready.\n${tabsLine(tabs)}${tail}`);
    }
    if (state === "connecting") {
      return b("connecting", `${head}: connecting to the AboveVTT MCP server…\n${tabsLine(tabs)}${tail}`);
    }
    if (state === "bad-token") {
      return b("badtoken", `${head}: the server rejected the token.\n${error || "Copy it again from bridge-token.txt into the options page."}${tail}`);
    }
    return b("off", `${head}: not connected to the AboveVTT MCP server.\n${error || "Is Claude desktop open?"}\n${tabsLine(tabs)}${tail}`);
  }

  root.AVTT_badgeFor = badgeFor;
  if (typeof module !== "undefined") module.exports = { badgeFor, COLORS };
})(typeof self !== "undefined" ? self : globalThis);
