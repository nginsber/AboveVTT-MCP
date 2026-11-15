// Scene tools, running in the page's main world next to AboveVTT.
// Step 2: list_scenes (read-only).
/* global ItemType, RootFolder */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const sceneRootId = () => (typeof RootFolder !== "undefined" ? RootFolder.Scenes.id : "scenesFolder");
  // Same comparison as AboveVTT's SidebarListItem.sortComparator, so the order matches the panel.
  const byTitle = (a, b) => {
    const l = String(a.title).toLowerCase(), r = String(b.title).toLowerCase();
    return l < r ? -1 : l > r ? 1 : 0;
  };

  /** Build the folder tree the way the Scenes panel shows it: folders first, then A–Z. */
  function buildTree({ includeMaps = false } = {}) {
    const all = Array.isArray(window.ScenesHandler?.scenes) ? window.ScenesHandler.scenes : [];
    const rootId = sceneRootId();
    const folderType = M.folderType();
    const dmSceneId = window.CURRENT_SCENE_DATA?.id ?? null;
    const playerSceneId = window.PLAYER_SCENE_ID ?? null;

    const nodes = new Map();
    for (const s of all) {
      const isFolder = s.itemType === folderType;
      const node = isFolder
        ? { type: "folder", id: s.id, title: s.title || "Untitled Folder", color: s.color || undefined, children: [] }
        : {
            type: "scene",
            id: s.id,
            title: s.title || "Untitled Scene",
            dmIsHere: s.id === dmSceneId || undefined,
            playersAreHere: s.id === playerSceneId || undefined,
            video: s.player_map_is_video == "1" || undefined,
            hasDmMap: s.dm_map ? true : undefined,
            playerMap: includeMaps ? (s.player_map || "") : undefined,
            dmMap: includeMaps && s.dm_map ? s.dm_map : undefined,
          };
      nodes.set(s.id, { node, parentId: s.parentId || rootId });
    }

    const root = { type: "folder", id: rootId, title: "Scenes", children: [] };
    for (const { node, parentId } of nodes.values()) {
      const parent = nodes.get(parentId)?.node;
      // A missing or non-folder parent shows at the top level, as the panel does.
      (parent && parent.type === "folder" ? parent : root).children.push(node);
    }
    const sortChildren = (folder) => {
      folder.children.sort((a, b) => (a.type === b.type ? byTitle(a, b) : a.type === "folder" ? -1 : 1));
      folder.children.forEach((c) => c.type === "folder" && sortChildren(c));
    };
    sortChildren(root);
    return { root, nodes, dmSceneId, playerSceneId };
  }

  function findFolder(folder, id) {
    if (folder.id === id) return folder;
    for (const c of folder.children) {
      if (c.type === "folder") {
        const hit = findFolder(c, id);
        if (hit) return hit;
      }
    }
    return null;
  }

  /** Plain-text outline, so the agent and the user can read the tree at a glance. */
  function outline(folder, depth = 0, lines = []) {
    for (const c of folder.children) {
      const pad = "  ".repeat(depth);
      if (c.type === "folder") {
        lines.push(`${pad}📁 ${c.title}  [${c.id}]`);
        outline(c, depth + 1, lines);
      } else {
        const tags = [c.dmIsHere && "DM here", c.playersAreHere && "players here"].filter(Boolean).join(", ");
        lines.push(`${pad}🗺 ${c.title}${tags ? ` (${tags})` : ""}  [${c.id}]`);
      }
    }
    return lines;
  }

  M.register("list_scenes", async ({ folderId, search, includeMaps } = {}) => {
    M.requireDM();
    const { root, dmSceneId, playerSceneId } = buildTree({ includeMaps });

    let top = root;
    if (folderId) {
      top = findFolder(root, folderId);
      if (!top) throw new Error(`No scene folder with id '${folderId}'. Call list_scenes without folderId to see all ids.`);
    }

    let matches;
    if (search) {
      const q = String(search).toLowerCase();
      matches = [];
      const walk = (f, path) => {
        for (const c of f.children) {
          const p = [...path, c.title];
          if (c.title.toLowerCase().includes(q)) matches.push({ type: c.type, id: c.id, title: c.title, path: p.join(" / ") });
          if (c.type === "folder") walk(c, p);
        }
      };
      walk(top, []);
    }

    let sceneCount = 0, folderCount = 0;
    const count = (f) => f.children.forEach((c) => (c.type === "folder" ? (folderCount++, count(c)) : sceneCount++));
    count(top);

    return {
      folder: { id: top.id, title: top.title },
      sceneCount,
      folderCount,
      dmSceneId,
      playerSceneId,
      matches,
      outline: outline(top).join("\n") || "(no scenes)",
      tree: top.children,
    };
  });
})();
