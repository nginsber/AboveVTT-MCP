// Step 7: create_scene — same route as AboveVTT's Dropbox/OneDrive import:
// create_scene_inside(..., sceneArray) builds each scene (with AboveVTT's defaults, your
// default scene settings, video/UVTT detection and duplicate-name handling), then
// AboveApi.migrateScenes saves them in one go, then did_update_scenes refreshes the panel.
// Unlike the plain "New Scene" button, no configure dialog pops up.
/* global ItemType, RootFolder, create_scene_inside, did_update_scenes, AboveApi, folder_path_of_scene */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const rootId = () => (typeof RootFolder !== "undefined" ? RootFolder.Scenes.id : "scenesFolder");
  const rootPath = () => (typeof RootFolder !== "undefined" ? RootFolder.Scenes.path : "/Scenes");
  const scenes = () => window.ScenesHandler.scenes;
  const isFolder = (s) => s?.itemType === M.folderType();

  function pathOf(item) {
    const names = [];
    let cur = item;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.title || "Untitled");
      cur = scenes().find((s) => s.id === cur.parentId);
    }
    return ["Scenes", ...names].join(" / ");
  }

  function findFolder({ folderId, folderTitle }) {
    if (!folderId && !folderTitle) return null; // top level
    if (folderId === "root" || folderId === rootId()) return null;
    const pool = scenes().filter(isFolder);
    if (folderId) {
      const f = pool.find((s) => s.id === folderId);
      if (!f) throw new Error(`No scene folder with id '${folderId}'. Use list_scenes to find ids.`);
      return f;
    }
    const q = window.AVTT_MCP.nameKey(folderTitle);
    const hits = pool.filter((s) => window.AVTT_MCP.nameKey(s.title || "") === q);
    if (!hits.length) throw new Error(`No scene folder titled '${folderTitle}'. Create it first with create_folder.`);
    if (hits.length > 1) throw new Error(`${hits.length} folders are titled '${folderTitle}': ${hits.map((h) => `${pathOf(h)} [${h.id}]`).join("; ")}. Use folderId.`);
    return hits[0];
  }

  function checkMapUrl(url, i) {
    const u = String(url ?? "").trim();
    if (!u) return "";
    if (u.startsWith("data:")) throw new Error(`Scene ${i + 1}: map links that start with 'data:' crash AboveVTT; use a normal web link.`);
    if (!/^https?:\/\//i.test(u)) throw new Error(`Scene ${i + 1}: the map link must start with http:// or https://.`);
    return u;
  }

  M.register("create_scene", async ({ scenes: wanted, folderId, folderTitle } = {}) => {
    M.requireDM();
    for (const fn of ["create_scene_inside", "did_update_scenes"]) {
      if (typeof window[fn] !== "function") throw new Error(`AboveVTT function '${fn}' was not found. This AboveVTT version may not be supported yet.`);
    }
    if (typeof AboveApi?.migrateScenes !== "function") throw new Error("AboveVTT's scene save function (AboveApi.migrateScenes) was not found.");
    if (!Array.isArray(wanted) || wanted.length === 0) throw new Error("Pass scenes: a list of { title, mapUrl, config }.");
    if (wanted.length > 25) throw new Error("At most 25 scenes per call.");

    // Check everything first.
    const folder = findFolder({ folderId, folderTitle });
    const parentId = folder ? folder.id : rootId();
    const fullPath = folder ? folder_path_of_scene({ parentId: folder.id }) : rootPath();
    const prepared = wanted.map((w, i) => {
      const title = String(w?.title ?? "").trim();
      if (!title) throw new Error(`Scene ${i + 1} needs a title.`);
      if (w.config !== undefined && (typeof w.config !== "object" || w.config === null)) {
        throw new Error(`Scene ${i + 1}: config must be an object of field → value (see get_scene_config).`);
      }
      if (w.config && Array.isArray(M.sceneConfigKeys)) {
        const unknown = Object.keys(w.config).filter((k) => !M.sceneConfigKeys.includes(k));
        if (unknown.length) {
          throw new Error(`Scene ${i + 1} ('${title}'): unknown config field(s) ${unknown.join(", ")}. Valid fields: ${M.sceneConfigKeys.join(", ")}. Nothing was created.`);
        }
      }
      return { title, mapUrl: checkMapUrl(w.mapUrl, i), config: w.config };
    });

    // Build with AboveVTT's own function, then save all in one go (as its Dropbox import does).
    const sceneArray = [];
    for (const p of prepared) {
      await create_scene_inside(parentId, fullPath, p.title, p.mapUrl, sceneArray);
    }
    try {
      await AboveApi.migrateScenes(window.gameId, sceneArray);
    } catch (err) {
      // Undo the local additions so the panel doesn't show scenes that weren't saved.
      const ids = new Set(sceneArray.map((s) => s.id));
      window.ScenesHandler.scenes = scenes().filter((s) => !ids.has(s.id));
      await did_update_scenes();
      throw new Error(`AboveVTT could not save the new scene(s): ${err?.message || err}`);
    }
    await did_update_scenes();

    const created = [];
    for (let i = 0; i < sceneArray.length; i++) {
      const s = sceneArray[i];
      const entry = {
        id: s.id,
        title: s.title,
        requestedTitle: prepared[i].title,
        path: pathOf(scenes().find((x) => x.id === s.id) || s),
        mapUrl: s.player_map || "",
        video: s.player_map_is_video == "1",
        uvtt: s.UVTTFile == 1,
      };
      if (prepared[i].config && Object.keys(prepared[i].config).length) {
        try {
          const r = await M.invoke("update_scene_config", { sceneId: s.id, changes: prepared[i].config });
          entry.configChanged = r.changed;
        } catch (err) {
          entry.configError = err.message;
        }
      }
      created.push(entry);
    }
    return { folder: folder ? pathOf(folder) : "Scenes", created };
  });
})();
