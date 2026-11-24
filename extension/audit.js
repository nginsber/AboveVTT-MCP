// Campaign audit, page side: collects every link AboveVTT would load (scene maps, token images,
// audio, images and links in journal notes) and lists empty folders. Read-only: it changes nothing.
// The server checks the links (it can look up DNS and refuses local-network addresses).
// Each link is sent as AboveVTT would load it: images go through AboveVTT's parse_img (Google Drive,
// Dropbox and OneDrive share links become direct links), audio through the mixer's own rules.
/* global ItemType, RootFolder, AboveApi, parse_img */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const folderType = () => M.folderType();
  const sceneRoot = () => (typeof RootFolder !== "undefined" ? RootFolder.Scenes.id : "scenesFolder");
  const tokenRoot = () => (typeof RootFolder !== "undefined" ? RootFolder.MyTokens.id : "myTokensFolder");
  const T_MYTOKEN = () => (typeof ItemType !== "undefined" ? ItemType.MyToken : "myToken");
  const T_FOLDER = () => (typeof ItemType !== "undefined" ? ItemType.Folder : "folder");

  const isWeb = (u) => /^https?:\/\//i.test(String(u || "").trim());
  const asImage = (u) => {
    const s = String(u || "").trim();
    try { return typeof parse_img === "function" ? String(parse_img(s) || s) : s; } catch { return s; }
  };
  // Same rewriting as AboveVTT's mixer (audio/mixer.js) for Dropbox and OneDrive. Google Drive audio
  // goes through Google's API there, so the Drive link itself is checked (it still shows a deleted file).
  const asAudio = (u) => {
    const s = String(u || "").trim();
    if (s.includes("dropbox.com")) { const p = s.split("dropbox.com"); return `https://dl.dropboxusercontent.com${p[p.length - 1]}`; }
    if (s.startsWith("https://onedrive.live.com/embed?")) return s.replace("embed?", "download?");
    return s;
  };
  const isYouTube = (u) => /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(String(u || ""));

  function scenePath(item, all) {
    const names = [];
    const seen = new Set();
    let cur = item;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.title || (cur.itemType === folderType() ? "Untitled Folder" : "Untitled Scene"));
      cur = all.find((s) => s.id === cur.parentId);
    }
    return ["Scenes", ...names].join(" / ");
  }

  M.register("get_audit_data", async ({ checks, includeSceneTokens = true } = {}) => {
    const want = new Set(checks && checks.length ? checks : ["scenes", "tokens", "audio", "journal", "folders"]);
    const links = [];
    const notes = [];   // things that are wrong without checking a link
    const skipped = [];
    const add = (category, where, raw, kind, extra = {}) => {
      const original = String(raw || "").trim();
      if (!original) return;
      if (original.includes("above-bucket-not-a-url")) { skipped.push({ category, where, reason: "AboveVTT cloud storage (not checked)" }); return; }
      if (original.startsWith("data:")) { notes.push({ category, where, problem: "embedded data image, which AboveVTT removes when it loads" }); return; }
      if (!isWeb(original) && !isYouTube(original)) { notes.push({ category, where, problem: `not a web link: ${original.slice(0, 80)}` }); return; }
      let url = original;
      if (kind === "image" || kind === "map" || kind === "token") url = asImage(original);
      else if (kind === "audio") url = asAudio(original);
      links.push({ category, where, url, original: url === original ? undefined : original, kind, ...extra });
    };

    const scenes = window.ScenesHandler?.scenes || [];
    const realScenes = scenes.filter((s) => s.itemType !== folderType());

    // ---- scene maps ----
    if (want.has("scenes")) {
      for (const s of realScenes) {
        const where = scenePath(s, scenes);
        if (!String(s.player_map || "").trim()) notes.push({ category: "scenes", where, problem: "no player map set" });
        else add("scenes", `${where} (player map)`, s.player_map, isYouTube(s.player_map) || s.player_map_is_video == "1" ? "video" : "map");
        if (String(s.dm_map || "").trim() && s.dm_map !== s.player_map) {
          add("scenes", `${where} (DM map)`, s.dm_map, isYouTube(s.dm_map) || s.dm_map_is_video == "1" ? "video" : "map");
        }
      }
    }

    // ---- token images: My Tokens, then tokens placed on scenes ----
    let tokenScan;
    if (want.has("tokens")) {
      const tcs = Array.isArray(window.TOKEN_CUSTOMIZATIONS) ? window.TOKEN_CUSTOMIZATIONS : [];
      const byId = new Map(tcs.map((t) => [t.id, t]));
      const nameOf = (tc) => (typeof tc.name === "function" ? tc.name() : tc.tokenOptions?.name) || "(unnamed)";
      const mtPath = (tc) => {
        const names = []; const seen = new Set(); let cur = tc;
        while (cur && cur.id !== tokenRoot() && !seen.has(cur.id)) { seen.add(cur.id); names.unshift(nameOf(cur)); cur = byId.get(cur.parentId); }
        return ["My Tokens", ...names].join(" / ");
      };
      for (const tc of tcs) {
        if (tc.tokenType === T_FOLDER()) continue;
        const o = tc.tokenOptions || {};
        const imgs = [...new Set([o.imgsrc, ...(Array.isArray(o.alternativeImages) ? o.alternativeImages : [])].filter(Boolean))];
        const where = tc.rootId === tokenRoot() && tc.tokenType === T_MYTOKEN() ? mtPath(tc) : `Token settings for '${nameOf(tc)}' (${tc.tokenType})`;
        imgs.forEach((u, i) => add("tokens", imgs.length > 1 ? `${where} (image ${i + 1})` : where, u, "token"));
      }

      if (includeSceneTokens) {
        tokenScan = { scenes: 0, failed: [] };
        const currentId = window.CURRENT_SCENE_DATA?.id;
        const addTokens = (sceneTitle, tokens) => {
          for (const t of Object.values(tokens || {})) {
            if (!t) continue;
            if (String(t.imgsrc || "").startsWith("class")) continue; // Area of Effect shapes are drawn, not images
            const name = t.name || "(unnamed token)";
            const imgs = [...new Set([t.imgsrc, ...(Array.isArray(t.alternativeImages) ? t.alternativeImages : [])].filter(Boolean))];
            imgs.forEach((u, i) => add("tokens", `${sceneTitle} → token '${name}'${imgs.length > 1 ? ` (image ${i + 1})` : ""}`, u, "token"));
          }
        };
        const queue = [...realScenes];
        const worker = async () => { for (let s = queue.shift(); s; s = queue.shift()) await readScene(s); };
        // eslint-disable-next-line no-inner-declarations
        async function readScene(s) {
          const where = scenePath(s, scenes);
          try {
            if (s.id === currentId && window.TOKEN_OBJECTS) {
              addTokens(where, Object.fromEntries(Object.entries(window.TOKEN_OBJECTS).map(([k, t]) => [k, t.options])));
            } else {
              if (typeof AboveApi?.getScene !== "function") throw new Error("AboveApi.getScene not found");
              const r = await AboveApi.getScene(s.id);
              addTokens(where, r?.data?.tokens);
            }
            tokenScan.scenes++;
          } catch (err) {
            tokenScan.failed.push({ scene: where, error: String(err?.message || err).slice(0, 120) });
          }
        }
        await Promise.all([1, 2, 3, 4].map(worker)); // four scenes at a time from AboveVTT's server
      }
    }

    // ---- audio: the Sounds tab's track library and every playlist ----
    if (want.has("audio")) {
      const lib = window.TRACK_LIBRARY;
      if (lib && typeof lib.map === "function") {
        for (const [, t] of lib.map()) add("audio", `Track '${t?.name || "(unnamed)"}'`, t?.src, "audio");
      }
      const state = typeof window.MIXER?.state === "function" ? window.MIXER.state() : null;
      for (const [id, p] of Object.entries(state?.playlists || {})) {
        if (id === "selected" || !p || typeof p !== "object") continue;
        for (const ch of Object.values(p.channels || {})) {
          if (ch?.src) add("audio", `Playlist '${p.name || "(unnamed)"}' → '${ch.name || "(unnamed)"}'`, ch.src, "audio");
        }
      }
    }

    // ---- journal: images and links inside notes ----
    const J = window.JOURNAL;
    if (want.has("journal") && J?.notes) {
      const chapters = Array.isArray(J.chapters) ? J.chapters : [];
      const folderOf = (noteId) => chapters.find((c) => Array.isArray(c.notes) && c.notes.includes(noteId));
      for (const [id, n] of Object.entries(J.notes)) {
        if (!n || typeof n.text !== "string" || !n.text) continue;
        const where = `Note '${n.title || "(untitled)"}'${folderOf(id) ? ` in '${folderOf(id).title || "Untitled Folder"}'` : ""}`;
        let doc;
        try { doc = new DOMParser().parseFromString(n.text, "text/html"); } catch { continue; }
        doc.querySelectorAll("img[src]").forEach((img) => add("journal", `${where} (image)`, img.getAttribute("src"), "image"));
        doc.querySelectorAll("a[href]").forEach((a) => {
          const href = a.getAttribute("href");
          if (isWeb(href)) add("journal", `${where} (link '${(a.textContent || "").trim().slice(0, 40) || href.slice(0, 40)}')`, href, "page");
        });
      }
    }

    // ---- empty folders ----
    const emptyFolders = [];
    if (want.has("folders")) {
      for (const f of scenes.filter((s) => s.itemType === folderType())) {
        if (!scenes.some((s) => s.parentId === f.id)) emptyFolders.push({ area: "Scenes", path: scenePath(f, scenes), id: f.id });
      }
      const tcs = Array.isArray(window.TOKEN_CUSTOMIZATIONS) ? window.TOKEN_CUSTOMIZATIONS : [];
      const byId = new Map(tcs.map((t) => [t.id, t]));
      const nameOf = (tc) => (typeof tc.name === "function" ? tc.name() : tc.tokenOptions?.name) || "(unnamed)";
      for (const f of tcs.filter((t) => t.tokenType === T_FOLDER() && t.rootId === tokenRoot() && t.id !== tokenRoot())) {
        if (tcs.some((t) => t.parentId === f.id)) continue;
        const names = []; const seen = new Set(); let cur = f;
        while (cur && cur.id !== tokenRoot() && !seen.has(cur.id)) { seen.add(cur.id); names.unshift(nameOf(cur)); cur = byId.get(cur.parentId); }
        emptyFolders.push({ area: "My Tokens", path: ["My Tokens", ...names].join(" / "), id: f.id });
      }
      const chapters = Array.isArray(J?.chapters) ? J.chapters : [];
      for (const c of chapters) {
        const hasNotes = Array.isArray(c.notes) && c.notes.some((nid) => J.notes?.[nid]);
        const hasChild = chapters.some((x) => x.parentID && x.parentID === c.id);
        if (!hasNotes && !hasChild) emptyFolders.push({ area: "Journal", path: c.title || "Untitled Folder", id: c.id });
      }
    }

    return {
      campaign: window.CAMPAIGN_INFO?.name,
      counts: { scenes: realScenes.length },
      links, notes, skipped, emptyFolders, tokenScan,
    };
  });
})();
