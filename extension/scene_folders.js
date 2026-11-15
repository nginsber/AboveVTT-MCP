// Step 4: scene folders — create, rename (and colour), move scenes/folders between folders.
// Uses AboveVTT's own functions: rename_scene_folder, move_scene_to_folder,
// ScenesHandler.persist_scene and did_update_scenes.
/* global ItemType, RootFolder, uuid, rename_scene_folder, move_scene_to_folder, did_update_scenes, folder_path_of_scene */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const rootId = () => (typeof RootFolder !== "undefined" ? RootFolder.Scenes.id : "scenesFolder");
  const scenes = () => window.ScenesHandler.scenes;
  const isFolder = (s) => s?.itemType === M.folderType();
  const newId = () => (typeof uuid === "function" ? uuid() : crypto.randomUUID());

  function requireFunctions(names) {
    for (const n of names) {
      if (typeof window[n] !== "function") {
        throw new Error(`AboveVTT function '${n}' was not found. This AboveVTT version may not be supported yet.`);
      }
    }
  }

  /** "Scenes / Chapter 2 / Caves" style path for messages. */
  function pathOf(item) {
    const names = [];
    let cur = item;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.title || (isFolder(cur) ? "Untitled Folder" : "Untitled Scene"));
      cur = scenes().find((s) => s.id === cur.parentId);
    }
    return ["Scenes", ...names].join(" / ");
  }

  const describe = (s) => ({ id: s.id, title: s.title, type: isFolder(s) ? "folder" : "scene", path: pathOf(s) });

  /** Find a scene or folder by id, or by exact (case-insensitive) title. */
  function findItem({ id, title, kind }, what = "item") {
    let pool = scenes();
    if (kind === "folder") pool = pool.filter(isFolder);
    if (id) {
      const hit = pool.find((s) => s.id === id);
      if (!hit) throw new Error(`No ${kind || what} with id '${id}'. Use list_scenes to find ids.`);
      return hit;
    }
    if (title) {
      const q = String(title).trim().toLowerCase();
      const hits = pool.filter((s) => String(s.title || "").trim().toLowerCase() === q);
      if (!hits.length) throw new Error(`No ${kind || what} titled '${title}'. Use list_scenes to find it.`);
      if (hits.length > 1) {
        throw new Error(`${hits.length} items are titled '${title}': ` + hits.map((h) => `${pathOf(h)} [${h.id}]`).join("; ") + ". Use the id instead.");
      }
      return hits[0];
    }
    throw new Error(`Say which ${kind || what}: pass its id or exact title.`);
  }

  /** Resolve a destination folder; null/"root" means the top level of the Scenes panel. */
  function findFolderOrRoot({ folderId, folderTitle, toTopLevel }) {
    if (toTopLevel || folderId === "root" || folderId === rootId()) return { id: rootId(), title: "Scenes (top level)", isRoot: true };
    if (!folderId && !folderTitle) throw new Error("Say where: pass a destination folder id or title, or toTopLevel: true.");
    return findItem({ id: folderId, title: folderTitle, kind: "folder" });
  }

  function isInside(candidateParentId, itemId) {
    // true if candidateParentId is itemId or one of its descendants
    let cur = scenes().find((s) => s.id === candidateParentId);
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      if (cur.id === itemId) return true;
      seen.add(cur.id);
      cur = scenes().find((s) => s.id === cur.parentId);
    }
    return false;
  }

  function checkColor(color) {
    const probe = new Option().style;
    probe.color = String(color);
    if (!probe.color) throw new Error(`'${color}' is not a colour. Use a name, #hex or rgba(...).`);
    return String(color);
  }

  function checkTitle(title) {
    const t = String(title ?? "").trim();
    if (!t) throw new Error("A folder name can't be empty.");
    if (t.includes("/")) throw new Error("A folder name can't contain '/', because AboveVTT uses it to separate folder paths.");
    return t;
  }

  function sameNameSibling(parentId, title, exceptId) {
    const q = title.toLowerCase();
    return scenes().find((s) => isFolder(s) && (s.parentId || rootId()) === parentId && s.id !== exceptId &&
      String(s.title || "").trim().toLowerCase() === q);
  }

  // ---------- create_folder ----------------------------------------------------
  M.register("create_folder", async ({ title, parentFolderId, parentFolderTitle, color } = {}) => {
    M.requireDM();
    requireFunctions(["did_update_scenes"]);
    const name = checkTitle(title);
    const parent = (parentFolderId || parentFolderTitle)
      ? findFolderOrRoot({ folderId: parentFolderId, folderTitle: parentFolderTitle })
      : findFolderOrRoot({ toTopLevel: true });
    const clash = sameNameSibling(parent.id, name);
    if (clash) throw new Error(`A folder named '${clash.title}' already exists there [${clash.id}].`);

    const folder = { id: newId(), title: name, itemType: M.folderType(), parentId: parent.id };
    if (color) folder.color = checkColor(color);
    scenes().push(folder);
    const index = scenes().length - 1;
    await window.ScenesHandler.persist_scene(index);
    await did_update_scenes();
    return { created: describe(scenes()[index]) };
  });

  // ---------- rename_folder ----------------------------------------------------
  M.register("rename_folder", async ({ folderId, folderTitle, newTitle, color } = {}) => {
    M.requireDM();
    requireFunctions(["rename_scene_folder", "did_update_scenes"]);
    if (newTitle === undefined && color === undefined) throw new Error("Nothing to change: pass newTitle and/or color.");
    const folder = findItem({ id: folderId, title: folderTitle, kind: "folder" });
    const before = describe(folder);
    const index = scenes().findIndex((s) => s.id === folder.id);

    // Check everything before changing anything.
    const newColor = color !== undefined ? checkColor(color) : undefined;
    let name;
    if (newTitle !== undefined) {
      name = checkTitle(newTitle);
      const clash = sameNameSibling(folder.parentId || rootId(), name, folder.id);
      if (clash) throw new Error(`A folder named '${clash.title}' already exists there [${clash.id}].`);
    }
    if (newColor !== undefined) folder.color = newColor;
    if (name !== undefined) {
      // AboveVTT's own rename (it also saves the folder).
      rename_scene_folder({ id: folder.id, name: before.title }, name, false);
    } else {
      await window.ScenesHandler.persist_scene(index);
    }
    await did_update_scenes();
    return { before, after: describe(scenes()[index]), color: scenes()[index].color };
  });

  // ---------- move_scene -------------------------------------------------------
  M.register("move_scene", async ({ items, folderId, folderTitle, toTopLevel } = {}) => {
    M.requireDM();
    requireFunctions(["move_scene_to_folder", "did_update_scenes"]);
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Say what to move: items is a list of { id } or { title } for scenes or folders.");
    }
    const dest = findFolderOrRoot({ folderId, folderTitle, toTopLevel });
    // Resolve and check everything before moving anything.
    const resolved = items.map((it) => findItem(typeof it === "string" ? { id: it } : it, "scene or folder"));
    const seen = new Set();
    for (const item of resolved) {
      if (seen.has(item.id)) throw new Error(`'${item.title}' is listed twice.`);
      seen.add(item.id);
      if (isFolder(item) && !dest.isRoot && isInside(dest.id, item.id)) {
        throw new Error(`Can't move folder '${item.title}' into itself or one of its own subfolders.`);
      }
      if (isFolder(item)) {
        const clash = sameNameSibling(dest.id, String(item.title || "").trim(), item.id);
        if (clash) throw new Error(`The destination already has a folder named '${clash.title}' [${clash.id}].`);
      }
    }
    const moved = [];
    const unchanged = [];
    for (const item of resolved) {
      const from = pathOf(item);
      if ((item.parentId || rootId()) === dest.id) { unchanged.push(describe(item)); continue; }
      move_scene_to_folder({ id: item.id }, dest.id); // AboveVTT's own move (also saves)
      moved.push({ ...describe(item), from });
    }
    if (moved.length) await did_update_scenes();
    return { destination: dest.isRoot ? { id: dest.id, path: "Scenes" } : describe(dest), moved, unchanged };
  });

  // ---------- step 6: deleting -------------------------------------------------
  // AboveVTT's own delete buttons show a browser confirm() box, which would freeze the bridge,
  // so we call the functions behind those buttons. The confirmation happens in chat instead.

  /** Refuse to delete the scene the DM or the players are on. */
  function inUseReason(scene) {
    if (scene.id === window.CURRENT_SCENE_DATA?.id) return "you (the DM) are on it";
    if (scene.id === window.PLAYER_SCENE_ID) return "the players are on it";
    return null;
  }

  function descendantsOf(folderId) {
    const out = [];
    const walk = (id) => {
      for (const s of scenes()) {
        if (s.parentId === id) { out.push(s); if (isFolder(s)) walk(s.id); }
      }
    };
    walk(folderId);
    return out;
  }

  const hasNote = (id) => !!window.JOURNAL?.notes?.[id];

  M.register("delete_scene", async ({ items, dryRun } = {}) => {
    M.requireDM();
    if (typeof window.ScenesHandler?.delete_scene !== "function") {
      throw new Error("AboveVTT's delete_scene was not found. This AboveVTT version may not be supported yet.");
    }
    if (!Array.isArray(items) || items.length === 0) throw new Error("Say which scenes: items is a list of { id } or { title }.");
    const resolved = items.map((it) => findItem(typeof it === "string" ? { id: it } : it, "scene"));
    const seen = new Set();
    for (const s of resolved) {
      if (isFolder(s)) throw new Error(`'${s.title}' is a folder. Use delete_folder for folders.`);
      if (seen.has(s.id)) throw new Error(`'${s.title}' is listed twice.`);
      seen.add(s.id);
      const why = inUseReason(s);
      if (why) throw new Error(`Won't delete '${s.title}' because ${why}. Switch to another scene first.`);
    }
    const plan = resolved.map((s) => ({ ...describe(s), alsoDeletesSceneNote: hasNote(s.id) }));
    if (dryRun) return { dryRun: true, wouldDelete: plan };
    for (const s of resolved) window.ScenesHandler.delete_scene(s.id, false); // AboveVTT's own delete (also removes the scene's note)
    await did_update_scenes();
    return { deleted: plan };
  });

  M.register("delete_folder", async ({ folderId, folderTitle, mode = "moveContentsUp", dryRun } = {}) => {
    M.requireDM();
    if (!["moveContentsUp", "deleteEverything"].includes(mode)) {
      throw new Error("mode must be 'moveContentsUp' (default) or 'deleteEverything'.");
    }
    const folder = findItem({ id: folderId, title: folderTitle, kind: "folder" });
    const parentId = folder.parentId || rootId();
    const parent = scenes().find((s) => s.id === parentId);
    const parentPath = parent ? pathOf(parent) : "Scenes";
    const inside = descendantsOf(folder.id);
    const directChildren = inside.filter((s) => s.parentId === folder.id);

    if (mode === "deleteEverything") {
      for (const s of inside) {
        if (isFolder(s)) continue;
        const why = inUseReason(s);
        if (why) throw new Error(`Won't delete everything in '${folder.title}': it contains '${s.title}', and ${why}. Switch to another scene first, or use mode 'moveContentsUp'.`);
      }
      const plan = {
        folder: describe(folder),
        mode,
        deletes: inside.map((s) => ({ ...describe(s), alsoDeletesSceneNote: !isFolder(s) && hasNote(s.id) })),
      };
      if (dryRun) return { dryRun: true, ...plan };
      for (const fn of ["delete_folder_and_all_scenes_within_it"]) {
        if (typeof window[fn] !== "function") throw new Error(`AboveVTT function '${fn}' was not found.`);
      }
      window.delete_folder_and_all_scenes_within_it({ id: folder.id, name: folder.title });
      await did_update_scenes();
      return plan;
    }

    // moveContentsUp: same as AboveVTT's "Delete folder and move items up one level".
    const warnings = [];
    for (const c of directChildren) {
      if (!isFolder(c)) continue;
      const clash = sameNameSibling(parentId, String(c.title || "").trim(), c.id);
      if (clash) warnings.push(`After the move, '${parentPath}' will have two folders named '${c.title}'.`);
    }
    const plan = {
      folder: describe(folder),
      mode,
      movesUpTo: parentPath,
      moves: directChildren.map((c) => ({ ...describe(c), to: `${parentPath} / ${c.title}` })),
      warnings,
    };
    if (dryRun) return { dryRun: true, ...plan };
    for (const fn of ["move_scenes_to_parent_folder", "delete_scenes_folder"]) {
      if (typeof window[fn] !== "function") throw new Error(`AboveVTT function '${fn}' was not found.`);
    }
    const listItem = { id: folder.id, name: folder.title, parentId };
    window.move_scenes_to_parent_folder(listItem);
    window.delete_scenes_folder(listItem);
    await did_update_scenes();
    return plan;
  });
})();
