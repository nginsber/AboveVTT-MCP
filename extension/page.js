// Runs in the page's main world, next to AboveVTT's own code, so it can call
// AboveVTT functions such as window.ScenesHandler, window.JOURNAL, etc.
// Each build step adds handlers with AVTT_MCP.register(name, fn).
(() => {
  if (window.top !== window) return; // only the top-level campaign page
  if (window.AVTT_MCP) return;       // already loaded

  const FROM_PAGE = "avtt-mcp:page"; // only a bare "infoChanged" nudge goes to relay.js this way
  const handlers = {};


  function aboveVttRunning() {
    return typeof window.MB === "object" && window.MB !== null && typeof window.ScenesHandler === "object";
  }

  function info() {
    const running = aboveVttRunning();
    return {
      url: location.href,
      title: document.title,
      gameId: window.gameId ?? location.pathname.split("/")[2] ?? null,
      aboveVttRunning: running,
      isDM: running ? window.DM === true : false,
      aboveVttVersion: window.AVTT_VERSION ?? null,
      campaignName: window.CAMPAIGN_INFO?.name ?? null,
      // review item 3b: "active" / "paused" when presence is running in a DM tab (presence.js), else null
      dmRole: running && window.DM === true ? (window.AVTT_MCP?.presence?.role ?? null) : null,
      // review item 3c: where the active DM tab is when this one is paused, and how many other DM tabs there are
      ...(running && window.DM === true && window.AVTT_MCP?.presence ? window.AVTT_MCP.presence.summary() : {}),
    };
  }

  // Methods that only read (plus any call with dryRun: true) still work in a paused DM tab.
  const READ_ONLY = /^(status|list_.*|get_.*|find_tokens_to_copy|export_backup)$/;
  const changesData = (method, params) => {
    if (params?.dryRun === true || READ_ONLY.test(method)) return false;
    if (method === "settings_action" && /^export/.test(String(params?.action || ""))) return false;
    return true;
  };

  /** Throws a clear error unless AboveVTT is running and the user is the DM. */
  function requireDM() {
    if (!aboveVttRunning()) throw new Error("AboveVTT is not running in this tab yet. Open the campaign with AboveVTT.");
    if (window.DM !== true) throw new Error("AboveVTT is running as a player. These tools need the DM view.");
  }

  // AboveVTT's ItemType constant is a top-level `const`, visible by name from main-world scripts.
  // eslint-disable-next-line no-undef
  const folderType = () => (typeof ItemType !== "undefined" ? ItemType.Folder : "folder");

  // ---- date and time in export file names ----
  const pad = (n) => String(n).padStart(2, "0");
  /** "2026-11-23 18-45-07": sorts correctly, and has no ':' (not allowed in Windows file names). */
  const timestamp = (d = new Date()) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  /** AboveVTT's "Name-2026-11-23.abovevtt" / "Name-2026-11-23-journal.abovevtt" → the same with date and time. */
  function stampFileName(filename, stamp = timestamp()) {
    const f = String(filename ?? "");
    const re = /-\d{4}-\d{1,2}-\d{1,2}(?=(-[A-Za-z]+)?\.abovevtt$)/;
    if (re.test(f)) return f.replace(re, `-${stamp}`);
    return /\.abovevtt$/i.test(f) ? f.replace(/\.abovevtt$/i, ` ${stamp}.abovevtt`) : f;
  }
  /**
   * Runs `run` with AboveVTT's download() giving its .abovevtt files a date-and-time name instead of date only,
   * then puts download() back. AboveVTT itself is unchanged; only exports started by the connector are renamed.
   * Returns { result, names } (the file names actually used).
   */
  async function withTimestampedDownloads(run) {
    const original = window.download;
    const names = [];
    if (typeof original !== "function") return { result: await run(), names };
    const stamp = timestamp();
    window.download = function (data, filename, ...rest) {
      const name = stampFileName(filename, stamp);
      names.push(name);
      return original.call(this, data, name, ...rest);
    };
    try { return { result: await run(), names }; }
    finally { if (window.download !== original) window.download = original; }
  }

  let identity = { browserId: "", browserName: "" }; // set by background.js through __avttMcpSetIdentity
  let sealed = false;

  const AVTT_MCP = {
    version: "0.27.0",
    get identity() { return identity; },
    register(name, fn) {
      if (sealed) throw new Error("The AboveVTT MCP Bridge is already loaded; no more methods can be added.");
      handlers[name] = fn;
    },
    /** Called by seal.js after every feature file has registered its methods (security review item 2). */
    seal() { sealed = true; Object.freeze(AVTT_MCP); },
    /** Tell background.js that this tab's info changed; it then fetches the info itself (see __avttMcpInfo). */
    nudge() { window.postMessage({ channel: FROM_PAGE, payload: { type: "infoChanged" } }, location.origin); },
    /** Lets one handler reuse another (e.g. create_scene applying update_scene_config). */
    invoke(name, params) {
      const fn = handlers[name];
      if (!fn) throw new Error(`Unknown method '${name}'.`);
      return fn(params || {});
    },
    requireDM,
    info,
    folderType,
    timestamp,
    stampFileName,
    withTimestampedDownloads,
    /** How names are compared in lookups: trimmed, any case, and straight / curly quotes treated the same
     *  (names the MCP writes get curly quotes; see server/src/names.js). */
    nameKey: (s) => String(s ?? "").normalize("NFC").trim().toLowerCase()
      .replace(/[\u2018\u2019\u201B\u2032`]/g, "'").replace(/[\u201C\u201D\u201F\u2033]/g, '"'),
  };
  // Fixed in place so no other script on the page can swap it for its own (security review item 2).
  Object.defineProperty(window, "AVTT_MCP", { value: AVTT_MCP, writable: false, configurable: false, enumerable: false });

  // ---- step 1: status ------------------------------------------------------
  AVTT_MCP.register("status", async () => {
    const base = info();
    if (!base.aboveVttRunning) return base;
    return {
      ...base,
      currentScene: window.CURRENT_SCENE_DATA?.title ?? null,
      currentSceneId: window.CURRENT_SCENE_DATA?.id ?? null,
      sceneCount: Array.isArray(window.ScenesHandler?.scenes)
        ? window.ScenesHandler.scenes.filter((s) => s.itemType !== folderType()).length
        : null,
      dmTabs: AVTT_MCP.presence && window.DM === true ? AVTT_MCP.presence.state() : null,
      bridgeScriptVersion: AVTT_MCP.version,
    };
  });

  // ---- how background.js reaches this tab (security review item 2) ----------------------------
  // Commands, results, tab info and the browser identity no longer travel through window.postMessage, where
  // any script on the page could send fake commands or fake results. background.js calls these functions
  // with chrome.scripting.executeScript, so the command goes in and the result comes back through Chrome
  // itself. They're fixed in place (not writable, not configurable), so no other script can replace them.
  async function run(method, params) {
    const fn = handlers[method];
    try {
      if (!fn) throw new Error(`Unknown method '${method}'. Update the AboveVTT MCP Bridge extension.`);
      const presence = AVTT_MCP.presence;
      if (presence?.role === "paused" && method !== "take_over_dm" && changesData(method, params)) {
        throw new Error(presence.pausedMessage() + " Reading and previews still work here. To make changes, ask to make this tab the " +
          "active DM tab (or click Use here in it), or make them in the active tab.");
      }
      const result = await fn(params || {});
      return { ok: true, result: result ?? null };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }
  const lock = (name, fn) => Object.defineProperty(window, name, { value: Object.freeze(fn), writable: false, configurable: false, enumerable: false });
  lock("__avttMcpRun", run);
  lock("__avttMcpInfo", () => info());
  lock("__avttMcpSetIdentity", (id) => {
    identity = { browserId: String(id?.browserId || "").slice(0, 64), browserName: String(id?.browserName || "").slice(0, 40) };
  });

  // AboveVTT loads after the page: check every 3 s and nudge background.js when something changed.
  // A nudge carries no data, so a fake one only makes background.js fetch the real info again.
  let last = "";
  const report = () => {
    const key = JSON.stringify(info());
    if (key !== last) { last = key; AVTT_MCP.nudge(); }
  };
  report();
  setInterval(report, 3000);
})();
