// Step 12: tokens already placed on a scene — name, AC, HP / max HP / temp HP, conditions and
// markers, auras, vision/light, image, size, token settings, and the token's note.
// Current DM scene: edits the live Token objects the same way AboveVTT's token menu does
// (options → place_sync_persist(); conditions via Token.addCondition/removeCondition; size via
// Token.size(); image like the change-image panel; name also retitles the token's note).
// Other scenes: reads the scene with AboveApi.getScene() and sends the token update with AboveVTT's
// own 'custom/myVTT/token' message addressed to that scene (Token.sync(forcedSceneId) does the same),
// then reads the scene again to check the change stuck.
/* global $, AboveApi, STANDARD_CONDITIONS, CUSTOM_CONDITIONS, is_player_id, parse_img, debounceCombatPersist */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const STD = () => (typeof STANDARD_CONDITIONS !== "undefined" ? STANDARD_CONDITIONS : ["Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"]);
  const CUSTOM = () => (typeof CUSTOM_CONDITIONS !== "undefined" ? CUSTOM_CONDITIONS : []);
  const MARKER_COLOURS = { blue: "#1A6AFF", orange: "#FF7433", red: "#FF4D4D", yellow: "#FFD433", purple: "#884DFF", green: "#86FF66", cyan: "#33ffe3", magenta: "#c333ff", navy: "#1e0066", grey: "#656565", gray: "#656565" };
  const COLOUR_NAME = Object.fromEntries(Object.entries(MARKER_COLOURS).filter(([k]) => k !== "gray").map(([k, v]) => [v.toLowerCase(), k]));
  const SIZES = { tiny: 0.5, small: 1, medium: 1, "small/medium": 1, large: 2, huge: 3, gargantuan: 4 };
  const SIZE_NAME = { 0.5: "Tiny", 1: "Small/Medium", 2: "Large", 3: "Huge", 4: "Gargantuan" };
  const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
  const isPlayerId = (id) => (typeof is_player_id === "function" ? is_player_id(id) : /characters\//.test(String(id)));

  // ---------- which scene ---------------------------------------------------------------------
  const scenes = () => (window.ScenesHandler?.scenes || []).filter((s) => s.itemType !== M.folderType());
  const currentId = () => window.CURRENT_SCENE_DATA?.id;
  function resolveScene({ sceneId, sceneName } = {}) {
    if (!sceneId && !sceneName) {
      if (!currentId()) throw new Error("No scene is open on the DM's map yet.");
      return { id: currentId(), title: window.CURRENT_SCENE_DATA.title, current: true };
    }
    let hit;
    if (sceneId) {
      hit = scenes().find((s) => s.id === sceneId);
      if (!hit) throw new Error(`No scene with id '${sceneId}'. Use list_scenes.`);
    } else {
      const q = String(sceneName).trim().toLowerCase();
      const hits = scenes().filter((s) => String(s.title || "").trim().toLowerCase() === q);
      if (!hits.length) throw new Error(`No scene named '${sceneName}'. Use list_scenes.`);
      if (hits.length > 1) throw new Error(`${hits.length} scenes are named '${sceneName}'. Use sceneId: ${hits.map((h) => h.id).join(", ")}.`);
      hit = hits[0];
    }
    return { id: hit.id, title: hit.title, current: hit.id === currentId() };
  }

  /** { id → options } for the scene. Live objects for the current scene, a fresh copy for others. */
  async function sceneTokens(scene) {
    if (scene.current) {
      const out = {};
      for (const [id, t] of Object.entries(window.TOKEN_OBJECTS || {})) out[id] = t.options;
      return { tokens: out, data: window.CURRENT_SCENE_DATA };
    }
    if (typeof AboveApi?.getScene !== "function") throw new Error("AboveVTT's AboveApi.getScene was not found.");
    const r = await AboveApi.getScene(scene.id);
    const data = r?.data;
    if (!data) throw new Error(`AboveVTT couldn't load scene '${scene.title}'.`);
    const out = {};
    for (const [k, t] of Object.entries(data.tokens || {})) out[t?.id ?? k] = t;
    return { tokens: out, data };
  }

  // ---------- describing a token ------------------------------------------------------------
  function kindOf(o) {
    if (isPlayerId(o.id)) return "player";
    if (String(o.imgsrc || "").startsWith("class")) return "aoe";
    if (o.type === "door" || o.isDoor) return "door";
    if (o.tokenWall || o.darkness || o.notatoken) return "map object";
    if (o.monster === "customStat") return "custom creature";
    if (o.monster !== undefined && o.monster !== "" && o.monster !== 0) return "monster";
    return "token";
  }
  const hpOf = (o) => {
    const h = o.hitPointInfo || { current: o.hp, maximum: o.max_hp, temp: o.temp_hp };
    const n = (v) => (v === undefined || v === null || v === "" || isNaN(v) ? undefined : Number(v));
    return { current: n(h.current), maximum: n(h.maximum), temp: n(h.temp) || 0 };
  };
  function conditionsOf(o) {
    const dur = (c) => (c?.duration ? ` (${c.duration} rounds)` : "");
    const std = (o.conditions || []).map((c) => (typeof c === "string" ? c : c?.level ? `${c.name} (level ${c.level})` : c?.name ? c.name + dur(c) : undefined)).filter(Boolean);
    const custom = (o.custom_conditions || []).map((c) => {
      if (typeof c === "string") return c;
      const n = String(c?.name || "");
      if (n.startsWith("#")) return `${COLOUR_NAME[n.toLowerCase()] || n} marker${c.text ? `: ${c.text}` : ""}${dur(c)}`;
      return n + dur(c);
    }).filter(Boolean);
    return [...std, ...custom];
  }
  function squaresOf(o, data) {
    const g = parseFloat(o.gridSquares);
    if (!isNaN(g)) return g;
    const hpps = parseFloat(data?.hpps);
    const size = parseFloat(o.size);
    return hpps && size ? +(size / hpps).toFixed(2) : undefined;
  }
  const feet = (x) => (x && Number(x.feet) > 0 ? `${Number(x.feet)} ft${x.color ? ` ${x.color}` : ""}` : undefined);

  function summary(o, data) {
    const hp = hpOf(o);
    const sq = squaresOf(o, data);
    const note = window.JOURNAL?.notes?.[o.id];
    return {
      id: o.id, name: o.name || "(unnamed)", kind: kindOf(o),
      hp: hp.maximum !== undefined || hp.current !== undefined ? hp : undefined,
      ac: o.armorClass !== undefined && o.armorClass !== "" ? Number(o.armorClass) : undefined,
      conditions: conditionsOf(o),
      size: sq !== undefined ? SIZE_NAME[sq] ?? `${sq} squares` : undefined,
      hidden: o.hidden ? true : undefined,
      hasNote: note ? true : undefined,
    };
  }

  function details(o, data) {
    const d = summary(o, data);
    const defs = M.tokenOptionDefs ? M.tokenOptionDefs() : [];
    const settings = {};
    for (const def of defs) if (o[def.name] !== undefined) settings[def.name] = o[def.name];
    const note = window.JOURNAL?.notes?.[o.id];
    Object.assign(d, {
      image: o.imgsrc,
      otherImages: (o.alternativeImages || []).filter((u) => u !== o.imgsrc),
      aura1: feet(o.aura1), aura2: feet(o.aura2), aurasVisible: o.auraVisible ? true : false,
      darkvision: feet(o.vision), lightInner: feet(o.light1), lightOuter: feet(o.light2),
      borderColor: o.color,
      statBlock: o.statBlock ? (window.JOURNAL?.notes?.[o.statBlock]?.title || o.statBlock) : undefined,
      settings,
      note: note ? { title: note.title, visibility: M.visibilityLabel ? M.visibilityLabel(note.player) : String(note.player), text: M.htmlToPlain ? M.htmlToPlain(note.text || "") : note.plain } : undefined,
    });
    return d;
  }

  function findToken(tokens, { tokenId, tokenName }, sceneTitle) {
    if (tokenId) {
      if (!tokens[tokenId]) throw new Error(`No token with id '${tokenId}' on '${sceneTitle}'. Use list_scene_tokens.`);
      return tokens[tokenId];
    }
    if (!tokenName) throw new Error("Say which token: tokenId or tokenName.");
    const q = String(tokenName).trim().toLowerCase();
    const hits = Object.values(tokens).filter((o) => String(o.name || "").trim().toLowerCase() === q);
    if (!hits.length) {
      const near = Object.values(tokens).filter((o) => String(o.name || "").toLowerCase().includes(q)).map((o) => `'${o.name}'`).slice(0, 10);
      throw new Error(`No token named '${tokenName}' on '${sceneTitle}'.${near.length ? ` Close matches: ${near.join(", ")}.` : " Use list_scene_tokens."}`);
    }
    if (hits.length > 1) throw new Error(`${hits.length} tokens on '${sceneTitle}' are named '${tokenName}'. Use tokenId: ${hits.map((h) => h.id).join(", ")}.`);
    return hits[0];
  }

  // ---------- working out the change ------------------------------------------------------------
  function parseCondition(input) {
    const raw = typeof input === "string" ? { name: input } : { ...(input || {}) };
    let name = String(raw.name ?? raw.color ?? "").trim();
    if (!name) throw new Error("Each condition needs a name.");
    const lower = name.toLowerCase().replace(/\s+marker$/, "");
    const std = STD().find((c) => c.toLowerCase() === lower);
    if (std) return { name: std, standard: true, duration: raw.duration };
    const fixAlias = { concentration: "Concentration(Reminder)", "concentration (reminder)": "Concentration(Reminder)", "concentration(reminder)": "Concentration(Reminder)" };
    const named = CUSTOM().find((c) => !c.startsWith("#") && c.toLowerCase() === (fixAlias[lower]?.toLowerCase() ?? lower));
    if (named) return { name: named, standard: false, text: "", duration: raw.duration };
    const hex = MARKER_COLOURS[lower] || (lower.startsWith("#") ? lower : null);
    const marker = hex && CUSTOM().find((c) => c.toLowerCase() === hex.toLowerCase());
    if (marker) return { name: marker, standard: false, text: raw.text !== undefined ? String(raw.text) : "", duration: raw.duration, marker: true };
    throw new Error(`'${name}' isn't a condition or marker AboveVTT has. Conditions: ${STD().join(", ")}. Markers: ${CUSTOM().filter((c) => !c.startsWith("#")).join(", ")}. Coloured markers (with your own text): ${Object.keys(MARKER_COLOURS).filter((k) => k !== "gray").join(", ")}.`);
  }

  const num = (v, label, { min = 0 } = {}) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min) throw new Error(`${label} must be a number${min === 0 ? " (0 or more)" : ""}.`);
    return Math.round(n);
  };

  /**
   * Validates everything and returns a plan: the new options object plus notes on what changed.
   * Nothing is changed here.
   */
  function plan(o, p, data) {
    const kind = kindOf(o);
    const player = kind === "player";
    const next = clone(o);
    const changed = [];
    const notes = [];

    if (player) {
      const blocked = ["name", "ac", "hp", "maxHp", "tempHp", "damage", "heal"].filter((k) => p[k] !== undefined);
      const stdAdd = (p.addConditions || []).map(parseCondition).filter((c) => c.standard);
      const stdRemove = (p.removeConditions || []).map(parseCondition).filter((c) => c.standard);
      if (blocked.length || stdAdd.length || stdRemove.length) {
        throw new Error(`'${o.name}' is a player character. Name, HP, AC and standard conditions come from the D&D Beyond character sheet, so AboveVTT doesn't let the DM set them on the token (it only whispers the player). Markers, auras, vision, image, size, settings and the note can be changed.`);
      }
    }

    if (p.name !== undefined) {
      const n = String(p.name).trim();
      if (!n) throw new Error("A token's name can't be empty.");
      if (n !== o.name) { next.name = n; changed.push("name"); }
    }
    if (p.ac !== undefined) { const v = num(p.ac, "ac"); if (Number(o.armorClass) !== v) { next.armorClass = v; changed.push("AC"); } }

    // HP: maximum first, then current / temp, then damage / healing (temp HP soaks damage first).
    const hp = hpOf(o);
    const h = { current: hp.current ?? 0, maximum: hp.maximum ?? 0, temp: hp.temp ?? 0 };
    const before = { ...h };
    if (p.maxHp !== undefined) h.maximum = num(p.maxHp, "maxHp");
    if (p.hp !== undefined) h.current = num(p.hp, "hp");
    if (p.tempHp !== undefined) h.temp = num(p.tempHp, "tempHp");
    if (p.damage !== undefined) {
      const dmg = num(p.damage, "damage");
      const soak = Math.min(h.temp, dmg);
      h.temp -= soak;
      h.current = Math.max(0, h.current - (dmg - soak));
      const conc = [...(o.custom_conditions || [])].some((c) => c?.name === "Concentration(Reminder)");
      if (conc && dmg > 0) notes.push(`${o.name} is concentrating: Constitution save DC ${Math.max(10, Math.floor(dmg / 2))}.`);
    }
    if (p.heal !== undefined) h.current += num(p.heal, "heal");
    if (h.maximum > 0 && h.current > h.maximum) {
      if (p.hp !== undefined && Number(p.hp) > h.maximum) notes.push(`HP capped at the maximum of ${h.maximum} (AboveVTT doesn't allow more; use tempHp for extra).`);
      h.current = h.maximum;
    }
    if (h.current !== before.current || h.maximum !== before.maximum || h.temp !== before.temp) {
      next.hitPointInfo = { ...(o.hitPointInfo || {}), current: h.current, maximum: h.maximum, temp: h.temp };
      delete next.hp; delete next.max_hp; delete next.temp_hp;
      changed.push("HP");
      if (h.current === 0 && before.current > 0) notes.push(`${o.name} is now at 0 HP.`);
    }

    // Conditions and markers.
    let condChange = false;
    next.conditions = Array.isArray(next.conditions) ? next.conditions : [];
    next.custom_conditions = Array.isArray(next.custom_conditions) ? next.custom_conditions : [];
    const condName = (c) => (typeof c === "string" ? c : c?.name);
    if (p.clearConditions) {
      if (player) next.custom_conditions = [];
      else { next.conditions = []; next.custom_conditions = []; }
      if (o.conditions?.length || o.custom_conditions?.length) condChange = true;
    }
    for (const c of (p.removeConditions || []).map(parseCondition)) {
      const list = c.standard ? "conditions" : "custom_conditions";
      const len = next[list].length;
      next[list] = next[list].filter((x) => condName(x) !== c.name);
      if (next[list].length !== len) condChange = true;
      else notes.push(`${o.name} didn't have ${COLOUR_NAME[c.name.toLowerCase()] ? `the ${COLOUR_NAME[c.name.toLowerCase()]} marker` : c.name}.`);
    }
    for (const c of (p.addConditions || []).map(parseCondition)) {
      const list = c.standard ? "conditions" : "custom_conditions";
      const existing = next[list].find((x) => condName(x) === c.name);
      let dur;
      if (c.duration !== undefined && c.duration !== null && c.duration !== "") dur = num(c.duration, `${c.name} duration`);
      if (existing && typeof existing === "object") {
        if (c.marker && existing.text !== c.text) { existing.text = c.text; condChange = true; }
        if (dur !== undefined && existing.duration !== dur) { existing.duration = dur; condChange = true; }
        continue;
      }
      const entry = c.standard ? { name: c.name } : { name: c.name, text: c.text ?? "" };
      if (dur !== undefined) entry.duration = dur;
      next[list] = next[list].filter((x) => condName(x) !== c.name).concat([entry]);
      condChange = true;
    }
    if (condChange) changed.push("conditions");

    // Auras, vision, light, border colour, settings — same rules as creatures (step 11).
    const patch = M.tokenOptionsPatch(
      { borderColor: p.borderColor, aura1: p.aura1, aura2: p.aura2, darkvisionFeet: p.darkvisionFeet, lightInner: p.lightInner, lightOuter: p.lightOuter, settings: p.settings },
      o
    );
    // On a placed token a removed aura/light is set to 0 ft (AboveVTT's menus expect the object to exist).
    for (const k of ["aura1", "aura2", "light1", "light2"]) if (patch[k] === null) patch[k] = { ...(o[k] || {}), feet: "0" };
    for (const [k, v] of Object.entries(patch)) {
      if (JSON.stringify(o[k]) === JSON.stringify(v ?? undefined)) continue;
      if (v === null) delete next[k]; else next[k] = v;
      changed.push(k === "aura1" || k === "aura2" ? "auras" : k === "vision" ? "darkvision" : k === "light1" || k === "light2" ? "light" : k === "color" ? "border colour" : `setting ${k}`);
    }
    const auraOn = (a) => a && Number(a.feet) > 0;
    let visible = p.aurasVisible;
    if (visible === undefined && (p.aura1 || p.aura2) && (auraOn(next.aura1) || auraOn(next.aura2)) && !o.auraVisible) visible = true; // asking for an aura means showing it
    if (visible !== undefined && Boolean(o.auraVisible) !== Boolean(visible)) { next.auraVisible = Boolean(visible); changed.push("auras shown"); }

    // Image.
    if (p.image !== undefined || p.useImage !== undefined) {
      if (kind === "aoe") throw new Error("AoE templates don't have an image to change.");
      let url;
      if (p.image !== undefined) url = M.checkImages([p.image], "image")[0];
      else {
        const alts = o.alternativeImages || [];
        const i = Number(p.useImage);
        url = Number.isInteger(i) && i >= 1 && i <= alts.length ? alts[i - 1] : alts.find((u) => u === p.useImage);
        if (!url) throw new Error(`useImage must be one of the token's other images (1–${alts.length}, as listed by get_token) or its exact link.`);
      }
      const src = typeof parse_img === "function" ? parse_img(url) : url;
      if (src !== o.imgsrc) {
        // Same as AboveVTT's change-image panel: keep the old and new images as alternatives.
        const alts = Array.isArray(next.alternativeImages) ? next.alternativeImages : [];
        if (o.imgsrc && !alts.includes(o.imgsrc)) alts.push(o.imgsrc);
        if (!alts.includes(src)) alts.push(src);
        next.alternativeImages = alts;
        next.imgsrc = src;
        changed.push("image");
      }
    }

    // Size.
    let squares;
    if (p.size !== undefined) {
      squares = typeof p.size === "number" ? p.size : SIZES[String(p.size).trim().toLowerCase()];
      if (!(squares > 0 && squares <= 20)) throw new Error("size must be Tiny, Small, Medium, Large, Huge, Gargantuan, or a number of squares (0.5–20).");
      if (squaresOf(o, data) !== squares) changed.push("size");
      else squares = undefined;
    }
    return { next, changed: [...new Set(changed)], notes, squares };
  }

  // ---------- applying it ------------------------------------------------------------------------
  function applyLive(token, next, squares, data) {
    const id = token.options.id;
    try { token.update_from_page?.(); } catch { /* not on screen */ }
    const keepPos = { left: token.options.left, top: token.options.top };
    const hidden = next.hidden;
    const wasHidden = !!token.options.hidden;
    // Replace everything except position, which update_from_page just read from the map.
    for (const k of Object.keys(token.options)) if (!(k in next)) delete token.options[k];
    Object.assign(token.options, clone(next), keepPos);
    const all = window.all_token_objects;
    if (all && all[id] && all[id] !== token) {
      for (const k of Object.keys(all[id].options)) if (!(k in next) && !["left", "top"].includes(k)) delete all[id].options[k];
      Object.assign(all[id].options, clone(next), keepPos);
    }
    if (window.JOURNAL?.notes?.[id] && window.JOURNAL.notes[id].title !== next.name && next.name) {
      window.JOURNAL.notes[id].title = next.name; // AboveVTT's rename does this too
      window.JOURNAL.persist();
    }
    if (squares !== undefined && typeof token.size === "function") {
      token.size(parseFloat(data?.hpps || window.CURRENT_SCENE_DATA.hpps) * squares); // places and syncs
    }
    if (Boolean(hidden) !== wasHidden) {
      if (hidden && typeof token.hide === "function") token.hide();
      else if (!hidden && typeof token.show === "function") token.show();
      else token.place_sync_persist();
    } else token.place_sync_persist();
    try { token.update_combat_tracker?.(); token.update_quick_roll?.(); } catch { /* panel not open */ }
    if (typeof debounceCombatPersist === "function") { try { debounceCombatPersist(); } catch { /* ignore */ } }
  }

  async function applyRemote(scene, next, squares, data) {
    if (squares !== undefined) {
      next.gridSquares = squares;
      const hpps = parseFloat(data?.hpps);
      if (hpps) next.size = hpps * squares;
    }
    window.MB.sendMessage("custom/myVTT/token", next, false, scene.id);
    const all = window.all_token_objects?.[next.id];
    if (all) for (const k of ["name", "armorClass", "hitPointInfo", "conditions", "custom_conditions", "aura1", "aura2", "auraVisible", "imgsrc", "alternativeImages"]) {
      if (k in next) all.options[k] = clone(next[k]);
    }
    if (window.JOURNAL?.notes?.[next.id] && next.name && window.JOURNAL.notes[next.id].title !== next.name) {
      window.JOURNAL.notes[next.id].title = next.name;
      window.JOURNAL.persist();
    }
    // AboveVTT's cloud saves token messages after a few seconds; read the scene back until it shows (up to ~12 s).
    const keys = ["name", "armorClass", "hitPointInfo", "conditions", "custom_conditions", "imgsrc"];
    const step = M._remoteCheckDelay ?? 2000;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, step));
      try {
        const { tokens } = await sceneTokens(scene);
        const saved = tokens[next.id];
        const same = (k) => JSON.stringify(saved?.[k] ?? null) === JSON.stringify(next[k] ?? null);
        if (saved && keys.every(same)) return { verified: true };
      } catch { /* try again */ }
    }
    return { verified: false };
  }

  async function prepare(p) {
    M.requireDM();
    const scene = resolveScene(p);
    const { tokens, data } = await sceneTokens(scene);
    const o = findToken(tokens, p, scene.title);
    return { scene, data, o };
  }

  // ---------- handlers --------------------------------------------------------------------------
  M.register("list_scene_tokens", async ({ sceneId, sceneName, search, includeMapObjects } = {}) => {
    M.requireDM();
    const scene = resolveScene({ sceneId, sceneName });
    const { tokens, data } = await sceneTokens(scene);
    const q = search ? String(search).toLowerCase() : null;
    let list = Object.values(tokens).filter(Boolean).map((o) => summary(o, data));
    const hiddenObjects = includeMapObjects ? 0 : list.filter((t) => ["door", "map object", "aoe"].includes(t.kind)).length;
    if (!includeMapObjects) list = list.filter((t) => !["door", "map object", "aoe"].includes(t.kind));
    if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));
    const order = { player: 0, monster: 1, "custom creature": 1, token: 2, aoe: 3, door: 4, "map object": 5 };
    list.sort((a, b) => (order[a.kind] - order[b.kind]) || a.name.localeCompare(b.name));
    return { scene: scene.title, sceneId: scene.id, isCurrentScene: scene.current, count: list.length, mapObjectsNotShown: hiddenObjects || undefined, tokens: list };
  });

  M.register("get_token", async (p = {}) => {
    const { scene, data, o } = await prepare(p);
    return { scene: scene.title, isCurrentScene: scene.current, ...details(o, data) };
  });

  M.register("update_token", async (p = {}) => {
    const { scene, data, o } = await prepare(p);
    const { next, changed, notes, squares } = plan(o, p, data);
    const before = summary(o, data);
    if (!changed.length) return { scene: scene.title, token: before.name, changed, notes: notes.length ? notes : ["Nothing to change: it already looks like that."], before, after: before };
    if (p.dryRun) return { dryRun: true, scene: scene.title, changed, notes, before, after: summary(next, data) };
    let verified;
    if (scene.current) {
      const token = window.TOKEN_OBJECTS[o.id];
      if (!token) throw new Error("That token disappeared from the map. Try again.");
      if (!window.all_token_objects) window.all_token_objects = {};
      if (!window.all_token_objects[o.id]) window.all_token_objects[o.id] = token;
      applyLive(token, next, squares, data);
    } else {
      ({ verified } = await applyRemote(scene, next, squares, data));
      if (!verified) notes.push(`The change was sent to scene '${scene.title}', but reading the scene back doesn't show it yet. Open that scene to check, or make the change while it's the DM's scene.`);
    }
    const after = scene.current ? summary(window.TOKEN_OBJECTS[o.id].options, data) : summary(next, data);
    return { scene: scene.title, isCurrentScene: scene.current, verified, token: after.name, changed, notes, before, after };
  });

  M.register("set_token_note", async (p = {}) => {
    const { scene, o } = await prepare(p);
    const J = window.JOURNAL;
    if (!J?.notes || typeof J.persist !== "function") throw new Error("AboveVTT's journal isn't loaded yet.");
    const id = o.id;
    const had = J.notes[id];
    if (p.delete) {
      if (!had) throw new Error(`'${o.name}' has no note.`);
      const what = { token: o.name, title: had.title, visibility: M.visibilityLabel(had.player), length: (M.htmlToPlain(had.text || "") || "").length };
      if (p.dryRun) return { dryRun: true, wouldDelete: what };
      delete J.notes[id];
      J.persist();
      window.MB?.sendMessage?.("custom/myVTT/note", { note: undefined, id, delete: true });
      if (scene.current) { try { window.TOKEN_OBJECTS[id]?.place_sync_persist(); } catch { /* ignore */ } }
      return { deleted: what };
    }
    if (p.content === undefined && p.visibility === undefined && p.title === undefined) throw new Error("Pass content (the note text), visibility and/or title — or delete: true.");
    if (!["replace", "append", "prepend"].includes(p.mode || "replace")) throw new Error("mode must be replace, append or prepend.");
    if (p.content !== undefined && ($(`textarea[data-note-id='${id}']`).length || $(`[data-note-id='${id}'] .tox-tinymce`).length)) {
      throw new Error("That note is open for editing in AboveVTT. Save and close it first.");
    }
    const player = M.parseVisibility(p.visibility);
    const piece = p.content !== undefined ? M.noteToHtml(p.content, p.format) : undefined;
    const mode = p.mode || "replace";
    const note = had ? { ...had } : { title: o.name || "Note", text: "", plain: "", player: false }; // like the token menu's Create Note
    if (piece !== undefined) note.text = mode === "append" ? (note.text || "") + piece : mode === "prepend" ? piece + (note.text || "") : piece;
    if (note.text.length > 100000) throw new Error("The note would be too long for AboveVTT to send (about 100,000 characters).");
    note.plain = M.htmlToPlain(note.text);
    if (player !== undefined) note.player = player;
    if (p.title !== undefined && String(p.title).trim()) note.title = String(p.title).trim();
    J.notes[id] = note;
    J.persist();
    window.MB?.sendMessage?.("custom/myVTT/note", { note, id }); // the token menu always sends it
    if (scene.current) { try { window.TOKEN_OBJECTS[id]?.place_sync_persist(); } catch { /* ignore */ } }
    return { token: o.name, created: !had, title: note.title, visibility: M.visibilityLabel(note.player), text: note.plain };
  });
})();
