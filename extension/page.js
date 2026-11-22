// Runs in the page's main world, next to AboveVTT's own code, so it can call
// AboveVTT functions such as window.ScenesHandler, window.JOURNAL, etc.
// Each build step adds handlers with AVTT_MCP.register(name, fn).
(() => {
  if (window.top !== window) return; // only the top-level campaign page
  if (window.AVTT_MCP) return;       // already loaded

  const FROM_PAGE = "avtt-mcp:page";
  const TO_PAGE = "avtt-mcp:ext";
  const handlers = {};

  const send = (payload) => window.postMessage({ channel: FROM_PAGE, payload }, location.origin);

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

  const AVTT_MCP = {
    version: "0.22.0",
    identity: null, // { browserId, browserName } from background.js
    register(name, fn) { handlers[name] = fn; },
    /** Lets one handler reuse another (e.g. create_scene applying update_scene_config). */
    invoke(name, params) {
      const fn = handlers[name];
      if (!fn) throw new Error(`Unknown method '${name}'.`);
      return fn(params || {});
    },
    requireDM,
    info,
    folderType,
  };
  window.AVTT_MCP = AVTT_MCP;

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

  // ---- message handling ----------------------------------------------------
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.channel !== TO_PAGE) return;
    const msg = event.data.payload;
    if (msg?.type === "requestInfo") {
      send({ type: "info", info: info() });
      return;
    }
    if (msg?.type === "identity") {
      AVTT_MCP.identity = { browserId: String(msg.browserId || ""), browserName: String(msg.browserName || "") };
      return;
    }
    if (msg?.type !== "call") return;
    const fn = handlers[msg.method];
    try {
      if (!fn) throw new Error(`Unknown method '${msg.method}'. Update the AboveVTT MCP Bridge extension.`);
      const presence = AVTT_MCP.presence;
      if (presence?.role === "paused" && msg.method !== "take_over_dm" && changesData(msg.method, msg.params)) {
        throw new Error(presence.pausedMessage() + " Reading and previews still work here. To make changes, ask to make this tab the " +
          "active DM tab (or click Use here in it), or make them in the active tab.");
      }
      const result = await fn(msg.params || {});
      send({ type: "result", id: msg.id, ok: true, result: result ?? null });
    } catch (err) {
      send({ type: "result", id: msg.id, ok: false, error: err?.message || String(err) });
    }
  });

  // AboveVTT loads after the page; keep reporting until it is up, then less often.
  let last = "";
  const report = () => {
    const i = info();
    const key = JSON.stringify(i);
    if (key !== last) { last = key; send({ type: "info", info: i }); }
  };
  report();
  setInterval(report, 3000);
})();
