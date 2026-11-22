// Fog of war: read a scene's fog, hide all / reveal all, or put back a saved copy.
// AboveVTT keeps a scene's fog as a list of zones (window.REVEALED for the open scene, `reveals` in
// the saved scene). An empty list = the whole map hidden; [[0,0,0,0,2,0]] = the whole map revealed.
// That is exactly what the FOG menu's two ALL buttons write (Fog.js), minus their confirm() pop-up.
// Current DM scene: set window.REVEALED, redraw_fog(), sync_fog() — like the ALL buttons.
// Other scenes: AboveVTT's own 'custom/myVTT/fogdata' message addressed to that scene (the cloud saves
// it; players on that scene see it at once). Both are read back with AboveApi.getScene() to check.
/* global AboveApi, redraw_fog, sync_fog, check_token_visibility */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const REVEAL_ALL = [[0, 0, 0, 0, 2, 0]];
  const MAX_MESSAGE = 120000; // AboveVTT refuses messages over 128,000 characters
  const clone = (o) => JSON.parse(JSON.stringify(o ?? null));

  // ---------- which scene ---------------------------------------------------------------------
  const scenes = () => (window.ScenesHandler?.scenes || []).filter((s) => s.itemType !== M.folderType());
  const currentId = () => window.CURRENT_SCENE_DATA?.id;
  function resolveScene({ sceneId, sceneName } = {}) {
    let hit;
    if (!sceneId && !sceneName) {
      if (!currentId()) throw new Error("No scene is open on the DM's map yet.");
      hit = { id: currentId(), title: window.CURRENT_SCENE_DATA.title };
    } else if (sceneId) {
      hit = scenes().find((s) => s.id === sceneId);
      if (!hit) throw new Error(`No scene with id '${sceneId}'. Use list_scenes.`);
    } else {
      const q = window.AVTT_MCP.nameKey(sceneName);
      const hits = scenes().filter((s) => window.AVTT_MCP.nameKey(s.title || "") === q);
      if (!hits.length) throw new Error(`No scene named '${sceneName}'. Use list_scenes.`);
      if (hits.length > 1) throw new Error(`${hits.length} scenes are named '${sceneName}'. Use sceneId: ${hits.map((h) => h.id).join(", ")}.`);
      hit = hits[0];
    }
    return {
      id: hit.id,
      title: hit.title,
      current: hit.id === currentId(),
      playersHere: window.PLAYER_SCENE_ID !== undefined && String(window.PLAYER_SCENE_ID) === String(hit.id),
    };
  }

  // ---------- describing fog --------------------------------------------------------------------
  const SHAPES = { 0: "rectangle", 1: "circle", 2: "whole map", 3: "polygon", 4: "line-of-sight fill", 5: "3-point rectangle", 6: "brush", 7: "grid brush" };
  function describe(list) {
    const zones = Array.isArray(list) ? list.filter(Array.isArray) : [];
    let revealed = 0, hidden = 0, revealAll = false;
    for (const d of zones) {
      if (d.length === 4) { revealed++; continue; }      // old-style plain rectangle reveal
      if (d[5] == 1) hidden++;
      else if (d[4] == 2) revealAll = true;
      else revealed++;
    }
    let state;
    if (!zones.length) state = "fully hidden";
    else if (revealAll && !revealed && !hidden) state = "fully revealed";
    else if (revealAll) state = `revealed, with ${hidden} hidden area(s)${revealed ? ` and ${revealed} revealed area(s)` : ""} drawn`;
    else state = `hidden, with ${revealed} revealed area(s)${hidden ? ` and ${hidden} re-hidden area(s)` : ""}`;
    const kinds = {};
    for (const d of zones) if (!(d[4] == 2 && d[5] != 1)) { const k = d.length === 4 ? "rectangle" : SHAPES[d[4]] || "other"; kinds[k] = (kinds[k] || 0) + 1; }
    return { state, zones: zones.length, revealedAreas: revealed, hiddenAreas: hidden, wholeMapRevealed: revealAll, shapes: kinds };
  }

  async function savedScene(scene) {
    if (typeof AboveApi?.getScene !== "function") throw new Error("AboveVTT's AboveApi.getScene was not found.");
    const r = await AboveApi.getScene(scene.id);
    if (!r?.data) throw new Error(`AboveVTT couldn't load scene '${scene.title}'.`);
    return r.data;
  }

  async function readFog(scene) {
    if (scene.current) {
      return { reveals: clone(window.REVEALED || []), fogOn: window.FOG_OF_WAR === true };
    }
    const data = await savedScene(scene);
    return { reveals: clone(data.reveals || []), fogOn: data.fog_of_war == 1 || data.fog_of_war === undefined };
  }

  const same = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

  async function verify(scene, next) {
    // The cloud saves fog messages after a moment; read the scene back until it shows (up to ~12 s).
    const step = M._remoteCheckDelay ?? 2000;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, step));
      try {
        const data = await savedScene(scene);
        if (same(data.reveals, next)) return true;
      } catch { /* try again */ }
    }
    return false;
  }

  // ---------- handlers --------------------------------------------------------------------------
  M.register("get_fog", async (p = {}) => {
    M.requireDM();
    const scene = resolveScene(p);
    const { reveals, fogOn } = await readFog(scene);
    return {
      scene: scene.title, sceneId: scene.id, isCurrentScene: scene.current, playersHere: scene.playersHere,
      fogOn, ...describe(reveals),
      reveals: p.includeZones ? reveals : undefined,
    };
  });

  M.register("set_fog", async (p = {}) => {
    M.requireDM();
    const { action, dryRun } = p;
    let next;
    if (action === "hideAll") next = [];
    else if (action === "revealAll") next = clone(REVEAL_ALL);
    else if (action === "set") {
      if (!Array.isArray(p.reveals) || !p.reveals.every(Array.isArray)) throw new Error("'reveals' must be a list of fog zones.");
      next = clone(p.reveals);
    } else throw new Error("action must be hideAll, revealAll or set.");
    if (JSON.stringify(next).length > MAX_MESSAGE) throw new Error("That fog is too large for AboveVTT to send (over 120,000 characters).");

    const scene = resolveScene(p);
    const { reveals: before, fogOn } = await readFog(scene);
    const base = {
      scene: scene.title, sceneId: scene.id, isCurrentScene: scene.current, playersHere: scene.playersHere, fogOn,
      before: describe(before), after: describe(next),
    };
    if (same(before, next)) return { ...base, changed: false, dryRun: !!dryRun };
    if (dryRun) return { ...base, changed: true, dryRun: true };

    if (!window.MB?.sendMessage) throw new Error("AboveVTT's message broker (window.MB) isn't ready.");
    if (scene.current) {
      if (typeof redraw_fog !== "function" || typeof sync_fog !== "function") throw new Error("AboveVTT's redraw_fog / sync_fog were not found.");
      window.REVEALED = next;
      redraw_fog();
      if (typeof check_token_visibility === "function") { try { check_token_visibility(); } catch { /* ignore */ } }
      sync_fog();
    } else {
      window.MB.sendMessage("custom/myVTT/fogdata", next, false, scene.id);
    }
    const verified = await verify(scene, next);
    return { ...base, changed: true, previous: before, verified };
  });
})();
