// Step 13: the music library and the mixer's playlists — managing only, never playing.
// Track library: AboveVTT's window.TRACK_LIBRARY (audio/track.js), a Map of id → { name, src, tags }
// kept in this browser's localStorage ('audio.library.track', shared by every campaign). Writing it with
// TRACK_LIBRARY._write() also redraws the Sounds panel, exactly as adding a track there does.
// Soundpads from older AboveVTT versions were converted into tags by AboveVTT itself.
// Playlists: window.MIXER state (audio/mixer.js), per campaign. A playlist that isn't the one loaded in the
// mixer is plain data and is edited without touching audio (_write(state, true, true): no sync, no play).
// The loaded playlist is only changed while the mixer is paused; new tracks always go in paused.
/* global uuid */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const newId = () => (typeof uuid === "function" ? uuid() : crypto.randomUUID());
  const LIB = () => {
    const l = window.TRACK_LIBRARY;
    if (!l || typeof l.map !== "function" || typeof l._write !== "function") throw new Error("AboveVTT's track library isn't loaded yet. Open the Sounds tab once, or wait for AboveVTT to finish loading.");
    return l;
  };
  const MIX = () => {
    const m = window.MIXER;
    if (!m || typeof m.state !== "function" || typeof m._write !== "function") throw new Error("AboveVTT's mixer isn't loaded yet. Open the Sounds tab once.");
    return m;
  };
  const tracks = () => [...LIB().map()].map(([id, t]) => ({ id, name: String(t.name ?? ""), src: String(t.src ?? ""), tags: (Array.isArray(t.tags) ? t.tags : []).map((x) => String(x).trim()).filter(Boolean) }));
  const writeLib = (entries) => {
    const map = new Map(entries.map((t) => [t.id, { name: t.name, src: t.src, tags: t.tags }]));
    LIB()._write(map); // saves and redraws the Sounds panel
  };

  function cleanTags(list, label = "tags") {
    if (list === undefined) return undefined;
    const arr = Array.isArray(list) ? list : String(list).split(",");
    const out = [];
    for (const raw of arr) {
      const t = String(raw).trim();
      if (!t) continue;
      if (t.includes(",")) throw new Error(`${label}: '${t}' can't contain a comma (AboveVTT separates tags with commas).`);
      if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    }
    return out;
  }
  function checkSrc(src, label) {
    const s = String(src ?? "").trim();
    if (!/^https?:\/\//i.test(s)) throw new Error(`${label}: '${s || "(empty)"}' must be a public http(s) link to an audio file. (Uploading files needs AboveVTT's Patreon storage.)`);
    return s;
  }

  function findTrack(all, { trackId, trackName }) {
    if (trackId) {
      const t = all.find((x) => x.id === trackId);
      if (!t) throw new Error(`No track with id '${trackId}'. Use list_tracks.`);
      return t;
    }
    if (!trackName) throw new Error("Say which track: trackId or trackName.");
    const q = String(trackName).trim().toLowerCase();
    const hits = all.filter((x) => x.name.trim().toLowerCase() === q);
    if (!hits.length) {
      const near = all.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 8).map((x) => `'${x.name}'`);
      throw new Error(`No track named '${trackName}'.${near.length ? ` Close: ${near.join(", ")}.` : " Use list_tracks."}`);
    }
    if (hits.length > 1) throw new Error(`${hits.length} tracks are named '${trackName}'. Use trackId: ${hits.map((h) => h.id).join(", ")}.`);
    return hits[0];
  }

  // ---------- playlists -----------------------------------------------------------------------
  function playlistInfo(id, p, state) {
    const order = Array.isArray(p.orderedChannels) && p.orderedChannels.length ? p.orderedChannels : Object.keys(p.channels || {});
    const ids = [...new Set([...order, ...Object.keys(p.channels || {})])].filter((c) => p.channels?.[c]?.src);
    return {
      id, name: p.name || "(unnamed)", loadedInMixer: state.selected === id,
      tracks: ids.map((c) => ({ channelId: c, name: p.channels[c].name, src: p.channels[c].src, loop: !!p.channels[c].loop, tokenAudio: p.channels[c].token ? true : undefined })),
    };
  }
  function findPlaylist(state, { playlistId, playlistName }) {
    const pls = state.playlists || {};
    if (playlistId) {
      if (!pls[playlistId] || playlistId === "selected") throw new Error(`No playlist with id '${playlistId}'. Use list_playlists.`);
      return playlistId;
    }
    if (!playlistName) throw new Error("Say which playlist: playlistId or playlistName.");
    const q = String(playlistName).trim().toLowerCase();
    const hits = Object.entries(pls).filter(([id, p]) => id !== "selected" && String(p?.name || "").trim().toLowerCase() === q);
    if (!hits.length) throw new Error(`No playlist named '${playlistName}'. Playlists: ${Object.entries(pls).filter(([id]) => id !== "selected").map(([, p]) => `'${p.name}'`).join(", ") || "none"}.`);
    if (hits.length > 1) throw new Error(`${hits.length} playlists are named '${playlistName}'. Use playlistId.`);
    return hits[0][0];
  }
  /** Saves playlist data. The loaded playlist also updates the mixer (only allowed while paused). */
  function savePlaylist(state, id) {
    const m = MIX();
    if (state.selected === id) {
      const p = state.playlists[id];
      state.channels = p.channels;
      state.orderedChannels = p.orderedChannels;
      m._write(state, true); // mixer is paused: updates the list (and players' mixers) without playing
    } else {
      m._write(state, true, true); // plain data: no sync, no sound
    }
    try { m.dispatchEvent(new Event("onChannelListChange")); } catch { /* panel not open */ }
  }
  function refuseIfLive(state, id, what) {
    if (state.selected === id && !state.paused) {
      throw new Error(`'${state.playlists[id].name}' is the playlist loaded in the mixer and the mixer is playing. Pause the mixer (or load another playlist) before ${what}, so nothing changes mid-session.`);
    }
  }
  function ensurePlaylists(state) {
    if (!state.playlists || !Object.keys(state.playlists).filter((k) => k !== "selected").length) {
      throw new Error("The mixer has no playlists yet. Open the Sounds tab once so AboveVTT creates its Default playlist.");
    }
  }

  // ---------- handlers: tracks ------------------------------------------------------------------
  M.register("list_tracks", async ({ search, tag } = {}) => {
    M.requireDM();
    let all = tracks();
    const tagCounts = {};
    for (const t of all) for (const g of t.tags) tagCounts[g] = (tagCounts[g] || 0) + 1;
    if (tag) { const q = String(tag).trim().toLowerCase(); all = all.filter((t) => t.tags.some((g) => g.toLowerCase() === q)); }
    if (search) { const q = String(search).toLowerCase(); all = all.filter((t) => t.name.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q))); }
    all.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return { total: tracks().length, shown: all.length, tags: tagCounts, tracks: all };
  });

  M.register("add_tracks", async ({ tracks: input } = {}) => {
    M.requireDM();
    if (!Array.isArray(input) || !input.length) throw new Error("Pass tracks: a list of { name, src, tags }.");
    if (input.length > 50) throw new Error("At most 50 tracks per call.");
    const all = tracks();
    // Check everything first.
    const prepared = input.map((t, i) => {
      const name = String(t?.name ?? "").trim();
      if (!name) throw new Error(`Track ${i + 1} needs a name.`);
      return { name, src: checkSrc(t.src, `Track ${i + 1} ('${name}')`), tags: cleanTags(t.tags, `Track ${i + 1} tags`) || [] };
    });
    const added = [], skipped = [];
    const names = new Set(all.map((t) => t.name.toLowerCase()));
    for (const p of prepared) {
      const same = all.find((t) => t.src === p.src);
      if (same) { skipped.push({ name: p.name, reason: `that link is already in the library as '${same.name}'` }); continue; }
      // AboveVTT finds tracks by name or link, so keep names unique (same rule as elsewhere: add a number).
      let name = p.name, n = 2;
      while (names.has(name.toLowerCase())) name = `${p.name} ${n++}`;
      names.add(name.toLowerCase());
      const t = { id: newId(), name, src: p.src, tags: p.tags };
      all.push(t); added.push(name !== p.name ? { ...t, renamedFrom: p.name } : t);
    }
    if (added.length) writeLib(all.map(({ renamedFrom, ...t }) => t));
    return { added, skipped };
  });

  M.register("update_track", async ({ trackId, trackName, newName, src, tags, addTags, removeTags } = {}) => {
    M.requireDM();
    const all = tracks();
    const t = findTrack(all, { trackId, trackName });
    if ([newName, src, tags, addTags, removeTags].every((x) => x === undefined)) throw new Error("Nothing to change: pass newName, src, tags, addTags and/or removeTags.");
    const before = { ...t, tags: [...t.tags] };
    const changed = [];
    if (newName !== undefined) {
      const n = String(newName).trim();
      if (!n) throw new Error("A track's name can't be empty.");
      if (all.some((x) => x.id !== t.id && x.name.toLowerCase() === n.toLowerCase())) throw new Error(`Another track is already named '${n}'.`);
      if (n !== t.name) { t.name = n; changed.push("name"); }
    }
    if (src !== undefined) {
      const s = checkSrc(src, "src");
      const other = all.find((x) => x.id !== t.id && x.src === s);
      if (other) throw new Error(`That link is already in the library as '${other.name}'.`);
      if (s !== t.src) { t.src = s; changed.push("link"); }
    }
    let nt = [...t.tags];
    if (tags !== undefined) nt = cleanTags(tags);
    for (const g of cleanTags(addTags, "addTags") || []) if (!nt.some((x) => x.toLowerCase() === g.toLowerCase())) nt.push(g);
    const rm = (cleanTags(removeTags, "removeTags") || []).map((g) => g.toLowerCase());
    nt = nt.filter((g) => !rm.includes(g.toLowerCase()));
    if (JSON.stringify(nt) !== JSON.stringify(t.tags)) { t.tags = nt; changed.push("tags"); }
    if (changed.length) writeLib(all);
    return { before, after: t, changed, note: changed.length && (changed.includes("name") || changed.includes("link")) ? "Copies of this track already in playlists keep the old name/link." : undefined };
  });

  M.register("delete_tracks", async ({ trackIds, trackNames, tag, dryRun } = {}) => {
    M.requireDM();
    const all = tracks();
    const pick = new Map();
    for (const id of trackIds || []) { const t = findTrack(all, { trackId: id }); pick.set(t.id, t); }
    for (const n of trackNames || []) { const t = findTrack(all, { trackName: n }); pick.set(t.id, t); }
    if (tag) {
      const q = String(tag).trim().toLowerCase();
      const hits = all.filter((t) => t.tags.some((g) => g.toLowerCase() === q));
      if (!hits.length) throw new Error(`No tracks are tagged '${tag}'.`);
      for (const t of hits) pick.set(t.id, t);
    }
    if (!pick.size) throw new Error("Say which tracks: trackIds, trackNames and/or tag.");
    const list = [...pick.values()];
    if (dryRun) return { dryRun: true, wouldDelete: list };
    writeLib(all.filter((t) => !pick.has(t.id)));
    return { deleted: list };
  });

  // ---------- handlers: playlists ------------------------------------------------------------------
  M.register("list_playlists", async () => {
    M.requireDM();
    const state = MIX().state();
    const pls = Object.entries(state.playlists || {}).filter(([id, p]) => id !== "selected" && p);
    return { mixerPaused: !!state.paused, playlists: pls.map(([id, p]) => playlistInfo(id, p, state)) };
  });

  M.register("create_playlist", async ({ name, tracks: names = [], trackIds = [], tag, loop } = {}) => {
    M.requireDM();
    const n = String(name ?? "").trim();
    if (!n) throw new Error("A playlist needs a name.");
    const state = MIX().state();
    ensurePlaylists(state);
    if (Object.entries(state.playlists).some(([id, p]) => id !== "selected" && String(p?.name || "").toLowerCase() === n.toLowerCase())) throw new Error(`A playlist named '${n}' already exists.`);
    const chosen = pickTracks({ names, trackIds, tag });
    const id = newId();
    const channels = {}, order = [];
    for (const t of chosen) { const c = newId(); channels[c] = { name: t.name, src: t.src, volume: 0.5, loop: !!loop, paused: true }; order.push(c); }
    state.playlists[id] = { name: n, channels, volume: 0.5, paused: true, orderedChannels: order };
    savePlaylist(state, id); // not loaded: plain data
    return { created: playlistInfo(id, state.playlists[id], state) };
  });

  function pickTracks({ names = [], trackIds = [], tag }) {
    const all = tracks();
    const out = [];
    for (const id of trackIds) out.push(findTrack(all, { trackId: id }));
    for (const n of names) out.push(findTrack(all, { trackName: n }));
    if (tag) {
      const q = String(tag).trim().toLowerCase();
      const hits = all.filter((t) => t.tags.some((g) => g.toLowerCase() === q)).sort((a, b) => a.name.localeCompare(b.name));
      if (!hits.length) throw new Error(`No tracks are tagged '${tag}'.`);
      out.push(...hits);
    }
    return out.filter((t, i) => out.findIndex((x) => x.id === t.id) === i);
  }

  M.register("update_playlist", async ({ playlistId, playlistName, newName, addTracks = [], addTrackIds = [], addTag, removeTracks = [], loop } = {}) => {
    M.requireDM();
    const state = MIX().state();
    ensurePlaylists(state);
    const id = findPlaylist(state, { playlistId, playlistName });
    const p = state.playlists[id];
    p.channels = p.channels || {};
    p.orderedChannels = Array.isArray(p.orderedChannels) ? p.orderedChannels : Object.keys(p.channels);
    const changingTracks = addTracks.length || addTrackIds.length || addTag || removeTracks.length;
    if (changingTracks) refuseIfLive(state, id, "changing its tracks");
    const before = playlistInfo(id, p, state);
    const changed = [], notes = [];
    if (newName !== undefined) {
      const n = String(newName).trim();
      if (!n) throw new Error("A playlist's name can't be empty.");
      if (Object.entries(state.playlists).some(([k, x]) => k !== id && k !== "selected" && String(x?.name || "").toLowerCase() === n.toLowerCase())) throw new Error(`A playlist named '${n}' already exists.`);
      if (n !== p.name) { p.name = n; changed.push("name"); }
    }
    // Removing: by track name (or channelId from list_playlists).
    for (const r of removeTracks) {
      const q = String(r).trim().toLowerCase();
      const hits = Object.entries(p.channels).filter(([c, ch]) => c === r || String(ch?.name || "").toLowerCase() === q);
      if (!hits.length) { notes.push(`'${r}' isn't in this playlist.`); continue; }
      if (hits.some(([, ch]) => ch.token)) throw new Error(`'${r}' is a token's sound (placed on a map); remove it from the token instead.`);
      for (const [c] of hits) { delete p.channels[c]; p.orderedChannels = p.orderedChannels.filter((x) => x !== c); }
      changed.push(`removed ${r}`);
    }
    const adding = pickTracks({ names: addTracks, trackIds: addTrackIds, tag: addTag });
    for (const t of adding) {
      if (Object.values(p.channels).some((ch) => ch?.src === t.src)) { notes.push(`'${t.name}' is already in this playlist.`); continue; }
      const c = newId();
      p.channels[c] = { name: t.name, src: t.src, volume: 0.5, loop: !!loop, paused: true }; // paused: nothing starts playing
      p.orderedChannels.push(c);
      changed.push(`added ${t.name}`);
    }
    if (changed.length) savePlaylist(state, id);
    return { before, after: playlistInfo(id, p, state), changed, notes };
  });

  M.register("delete_playlist", async ({ playlistId, playlistName, dryRun } = {}) => {
    M.requireDM();
    const state = MIX().state();
    ensurePlaylists(state);
    const id = findPlaylist(state, { playlistId, playlistName });
    const info = playlistInfo(id, state.playlists[id], state);
    if (state.selected === id) throw new Error(`'${info.name}' is the playlist loaded in the mixer. Load another playlist in the Sounds tab first (switching playlists is a live change, so the connector leaves it to you).`);
    if (Object.keys(state.playlists).filter((k) => k !== "selected").length <= 1) throw new Error("That's the only playlist; AboveVTT needs at least one.");
    if (dryRun) return { dryRun: true, wouldDelete: info };
    delete state.playlists[id];
    MIX()._write(state, true, true);
    try { MIX().dispatchEvent(new Event("onChannelListChange")); } catch { /* ignore */ }
    return { deleted: info };
  });
})();
