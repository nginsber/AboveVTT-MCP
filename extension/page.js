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
    };
  }

  /** Throws a clear error unless AboveVTT is running and the user is the DM. */
  function requireDM() {
    if (!aboveVttRunning()) throw new Error("AboveVTT is not running in this tab yet. Open the campaign with AboveVTT.");
    if (window.DM !== true) throw new Error("AboveVTT is running as a player. These tools need the DM view.");
  }

  // AboveVTT's ItemType constant is a top-level `const`, visible by name from main-world scripts.
  // eslint-disable-next-line no-undef
  const folderType = () => (typeof ItemType !== "undefined" ? ItemType.Folder : "folder");

  const AVTT_MCP = {
    version: "0.17.0",
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
    if (msg?.type !== "call") return;
    const fn = handlers[msg.method];
    try {
      if (!fn) throw new Error(`Unknown method '${msg.method}'. Update the AboveVTT MCP Bridge extension.`);
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
