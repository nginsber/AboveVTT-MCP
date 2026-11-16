// Copy tokens into My Tokens (custom creatures): from a token placed on any scene, or from the Tokens tab's
// Monsters (D&D Beyond), Open5e Monsters, AboveVTT Tokens and D&D Beyond Tokens folders.
// Follows AboveVTT's own "Copy to My Tokens" / "Duplicate" code (TokensPanel.js create_token_copy_inside,
// duplicate_my_token, create_token_inside; MonsterStatBlock.js build_stat_block_for_copy), with three changes:
// it can put the copy in any My Tokens folder under any name, it doesn't open the token configuration panel,
// and it waits for the monster's stat block so it can report what was copied.
// Monster details come from fetch_monsters() directly (fetch_and_cache_monsters is debounced and would drop
// all but the last of several quick calls).
/* global $, uuid, TokenCustomization, RootFolder, ItemType, SidebarListItem, persist_token_customization,
   did_change_mytokens_items, search_monsters, fetch_monsters, update_monster_item_cache, update_open5e_item_cache,
   cached_monster_items, cached_open5e_items, convert_open5e_monsterData, build_monster_copy_stat_block, MonsterStatBlock,
   find_token_options_for_list_item, get_monster_senses, random_image_for_item, convert_challenge_rating_id,
   is_player_id, AboveApi */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const ROOT = () => (typeof RootFolder !== "undefined" ? RootFolder.MyTokens.id : "myTokensFolder");
  const T_MYTOKEN = () => (typeof ItemType !== "undefined" ? ItemType.MyToken : "myToken");
  const T_FOLDER = () => (typeof ItemType !== "undefined" ? ItemType.Folder : "folder");
  const newId = () => (typeof uuid === "function" ? uuid() : crypto.randomUUID());
  const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
  const nameOf = (tc) => (typeof tc.name === "function" ? tc.name() : tc.tokenOptions?.name) || "(unnamed)";
  const lc = (s) => String(s ?? "").trim().toLowerCase();
  const SOURCES = ["scene", "monster", "open5e", "aboveVTT", "ddbToken"];
  const SOURCE_LABEL = { scene: "token on a scene", monster: "Monsters (D&D Beyond)", open5e: "Open5e Monsters", aboveVTT: "AboveVTT Tokens", ddbToken: "D&D Beyond Tokens" };

  function need(names) {
    for (const n of names) if (typeof window[n] !== "function") throw new Error(`AboveVTT function '${n}' was not found. This AboveVTT version may not be supported yet.`);
    if (typeof TokenCustomization === "undefined") throw new Error("AboveVTT's TokenCustomization was not found.");
    if (!Array.isArray(window.TOKEN_CUSTOMIZATIONS)) throw new Error("AboveVTT's token list isn't loaded yet. Open the Tokens tab once, or wait for AboveVTT to finish loading.");
  }
  const cbPromise = (fn) => new Promise((resolve) => fn(resolve));
  function withTimeout(p, ms, what) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} took too long (over ${Math.round(ms / 1000)} s).`)), ms))]);
  }

  // ---------- sources: monsters (D&D Beyond) --------------------------------------------------
  const sourceNames = (m) => {
    const all = window.ddbConfigJson?.sources || [];
    return (m.sources || []).map((s) => all.find((x) => x.id === s.sourceId)?.description || all.find((x) => x.id === s.sourceId)?.name).filter(Boolean);
  };
  const crOf = (m) => { try { return typeof convert_challenge_rating_id === "function" ? String(convert_challenge_rating_id(m.challengeRatingId)) : undefined; } catch { return undefined; } };
  function monsterSummary(m) {
    return { source: "monster", id: String(m.id), name: m.name, cr: crOf(m), books: sourceNames(m), legacy: m.isLegacy ? true : undefined,
      owned: m.isReleased || m.isHomebrew ? undefined : false };
  }
  async function searchMonsters(term) {
    need(["search_monsters"]);
    const r = await withTimeout(cbPromise((done) => search_monsters(term, 0, done)), 30000, "Searching D&D Beyond monsters");
    if (!r || !Array.isArray(r.data)) throw new Error("D&D Beyond's monster search didn't answer. Try again in a moment.");
    return r.data;
  }
  async function monsterItem(id) {
    need(["fetch_monsters", "update_monster_item_cache"]);
    if (!cached_monster_items[id]) {
      const data = await withTimeout(cbPromise((done) => fetch_monsters([Number(id) || id], done)), 60000, "Fetching the monster from D&D Beyond");
      if (!Array.isArray(data) || !data.length) throw new Error(`D&D Beyond returned no monster with id ${id}.`);
      await cbPromise((done) => update_monster_item_cache(data.map((m) => SidebarListItem.Monster(m)), done));
    }
    const item = cached_monster_items[id] || cached_monster_items[Number(id)];
    if (!item) throw new Error(`Couldn't load monster ${id} from D&D Beyond.`);
    return item;
  }

  // ---------- sources: Open5e ------------------------------------------------------------------
  async function searchOpen5e(term) {
    const url = `https://api.open5e.com/v2/creatures/?name__icontains=${encodeURIComponent(term)}&limit=25`;
    const json = await withTimeout(Promise.resolve($.getJSON(url)), 30000, "Searching Open5e");
    return (json?.results || []).map((m) => ({ source: "open5e", id: m.key, name: m.name,
      cr: m.challenge_rating_text ?? (m.challenge_rating_decimal !== undefined ? String(m.challenge_rating_decimal) : undefined),
      books: [m.document?.name || m.document?.display_name || m.document?.key].filter(Boolean) }));
  }
  async function open5eItem(key) {
    need(["fetch_monsters", "update_open5e_item_cache"]);
    if (!cached_open5e_items[key]) {
      const data = await withTimeout(cbPromise((done) => fetch_monsters([key], done, true)), 60000, "Fetching the monster from Open5e");
      if (!Array.isArray(data) || !data.length) throw new Error(`Open5e returned no creature with key '${key}'.`);
      await cbPromise((done) => update_open5e_item_cache(data.map((m) => SidebarListItem.open5eMonster(m)), done));
    }
    const item = cached_open5e_items[key];
    if (!item) throw new Error(`Couldn't load '${key}' from Open5e.`);
    return item;
  }

  // ---------- sources: AboveVTT Tokens / D&D Beyond Tokens -------------------------------------
  function listTokens(kind) {
    const items = window.tokenListItems || [];
    return items.filter((li) => (kind === "aboveVTT" ? li.isTypeBuiltinToken?.() : li.isTypeDDBToken?.()));
  }
  const folderLabel = (li, kind) => {
    const root = kind === "aboveVTT" ? RootFolder?.AboveVTT?.path : RootFolder?.DDB?.path;
    const rest = String(li.folderPath || "").replace(root || "", "").replace(/^\/+/, "");
    return [kind === "aboveVTT" ? "AboveVTT Tokens" : "D&D Beyond Tokens", ...rest.split("/").filter(Boolean)].join(" / ");
  };
  const listSummary = (li, kind) => ({ source: kind, id: li.id, name: li.name, folder: folderLabel(li, kind) });

  // ---------- sources: tokens on a scene --------------------------------------------------------
  const scenes = () => (window.ScenesHandler?.scenes || []).filter((s) => s.itemType !== M.folderType());
  function resolveScene({ sceneId, sceneName } = {}) {
    const cur = window.CURRENT_SCENE_DATA?.id;
    if (!sceneId && !sceneName) {
      if (!cur) throw new Error("No scene is open on the DM's map yet.");
      return { id: cur, title: window.CURRENT_SCENE_DATA.title, current: true };
    }
    let hit;
    if (sceneId) {
      hit = scenes().find((s) => s.id === sceneId);
      if (!hit) throw new Error(`No scene with id '${sceneId}'. Use list_scenes.`);
    } else {
      const hits = scenes().filter((s) => lc(s.title) === lc(sceneName));
      if (!hits.length) throw new Error(`No scene named '${sceneName}'. Use list_scenes.`);
      if (hits.length > 1) throw new Error(`${hits.length} scenes are named '${sceneName}'. Use sceneId.`);
      hit = hits[0];
    }
    return { id: hit.id, title: hit.title, current: hit.id === cur };
  }
  async function sceneTokens(scene) {
    if (scene.current) {
      const out = {};
      for (const [id, t] of Object.entries(window.TOKEN_OBJECTS || {})) out[id] = clone(t.options);
      return { tokens: out, data: window.CURRENT_SCENE_DATA };
    }
    if (typeof AboveApi?.getScene !== "function") throw new Error("AboveVTT's AboveApi.getScene was not found.");
    const data = (await AboveApi.getScene(scene.id))?.data;
    if (!data) throw new Error(`AboveVTT couldn't load scene '${scene.title}'.`);
    const out = {};
    for (const [k, t] of Object.entries(data.tokens || {})) out[t?.id ?? k] = clone(t);
    return { tokens: out, data };
  }
  const isPlayer = (o) => (typeof is_player_id === "function" ? is_player_id(o.id) : /characters\//.test(String(o.id)));
  function refuseKind(o) {
    if (isPlayer(o)) return "it's a player character (their stats live on D&D Beyond)";
    if (String(o.imgsrc || "").startsWith("class")) return "it's an area-of-effect template";
    if (o.type === "door" || o.isDoor || o.tokenWall || o.darkness || o.notatoken) return "it's a door, wall or other map object";
    return null;
  }
  function pickToken(tokens, { tokenId, name }, sceneTitle) {
    if (tokenId) {
      const o = tokens[tokenId];
      if (!o) throw new Error(`No token with id '${tokenId}' on ${sceneTitle}. Use list_scene_tokens.`);
      return o;
    }
    const hits = Object.values(tokens).filter((o) => lc(o.name) === lc(name));
    if (!hits.length) throw new Error(`No token named '${name}' on ${sceneTitle}. Use list_scene_tokens.`);
    if (hits.length > 1) {
      // Several copies of the same creature (e.g. "Goblin" placed twice with numbering off) are fine to copy from.
      const same = (o) => JSON.stringify([o.imgsrc, o.monster, o.stat, o.statBlock, o.itemId]);
      if (hits.every((o) => same(o) === same(hits[0]))) return hits[0];
      throw new Error(`${hits.length} different tokens are named '${name}' on ${sceneTitle}. Use tokenId: ${hits.map((h) => h.id).join(", ")}.`);
    }
    return hits[0];
  }
  // What a My Token keeps from a placed token: looks and settings, not this placement's state.
  const VISUAL_KEYS = ["aura1", "aura2", "auraVisible", "vision", "light1", "light2", "truesight", "devilsight", "videoToken", "sizeId"];
  function optionsFromPlaced(o, sceneData) {
    const opts = {};
    const defs = M.tokenOptionDefs ? M.tokenOptionDefs() : [];
    for (const def of defs) if (o[def.name] !== undefined) opts[def.name] = clone(o[def.name]);
    for (const k of VISUAL_KEYS) if (o[k] !== undefined) opts[k] = clone(o[k]);
    delete opts.hidden; // hidden is this placement's state
    const sq = parseFloat(o.gridSquares);
    const hpps = parseFloat(sceneData?.hpps);
    const squares = !isNaN(sq) ? sq : hpps && parseFloat(o.size) ? +(parseFloat(o.size) / hpps).toFixed(2) : undefined;
    if (squares) opts.tokenSize = squares <= 0.5 ? 0.5 : squares;
    const imgs = [o.imgsrc, ...(o.alternativeImages || [])].filter((u) => typeof u === "string" && u && !u.startsWith("data:"));
    opts.alternativeImages = [...new Set(imgs)];
    if (o.imgsrc) opts.imgsrc = o.imgsrc;
    return opts;
  }

  // ---------- stat blocks ------------------------------------------------------------------------
  function monsterStatBlockHtml(item) {
    if (typeof build_monster_copy_stat_block !== "function" || typeof MonsterStatBlock === "undefined") throw new Error("AboveVTT's build_monster_copy_stat_block was not found.");
    const html = build_monster_copy_stat_block(new MonsterStatBlock(item.monsterData));
    if (/noAccessToContent/.test(html)) return { html: undefined, warning: "You don't have access to this monster on D&D Beyond, so it was copied without a stat block." };
    return { html };
  }
  /** Use the placed token's AC / max HP in the copy's stat block (AboveVTT reads these when the token is placed). */
  function setStat(html, which, value) {
    const cls = which === "ac" ? "custom-ac" : "custom-avghp";
    const label = which === "ac" ? "Armor Class" : "Hit Points";
    const $w = $(`<div>${html}</div>`);
    const marked = $w.find(`.${cls}.custom-stat`);
    if (marked.length) {
      marked.first().text(String(value));
      if (which === "hp") $w.find(".custom-hp-roll.custom-stat").remove();
      return $w.html();
    }
    // D&D Beyond copy layout: <span class="…attribute-label">Armor Class</span><span class="…attribute-value"><span class="…data-value">13</span><span class="…data-extra">…</span>
    const lab = $w.find("span, strong, b, th, dt").filter((_, el) => $(el).text().trim() === label).first();
    if (lab.length) {
      const val = lab.nextAll().find(".mon-stat-block__attribute-data-value, .mon-stat-block-2024__attribute-data-value").first();
      if (val.length) {
        val.text(String(value)).addClass(`${cls} custom-stat`);
        if (which === "hp") lab.nextAll().find(".mon-stat-block__attribute-data-extra, .mon-stat-block-2024__attribute-data-extra").first().remove();
        return $w.html();
      }
    }
    // Unknown layout: add a marked line at the top.
    $w.prepend(`<p><strong>${label}</strong> <span class="${cls} custom-stat">${String(value).replace(/[<>&]/g, "")}</span> (from the copied token)</p>`);
    return $w.html();
  }

  // ---------- writing the My Token ---------------------------------------------------------------
  function uniqueName(base, parentId) {
    const taken = new Set(window.TOKEN_CUSTOMIZATIONS.filter((tc) => (tc.parentId || ROOT()) === parentId && (tc.tokenType === T_MYTOKEN() || tc.tokenType === T_FOLDER())).map((tc) => lc(nameOf(tc))));
    let name = base, n = 2;
    while (taken.has(lc(name))) name = `${base} ${n++}`;
    return name;
  }
  function persist(tc) {
    return new Promise((resolve, reject) => {
      persist_token_customization(tc, (ok, err) => (ok === false ? reject(new Error(`AboveVTT could not save '${nameOf(tc)}': ${err ?? "unknown error"}`)) : resolve()));
    });
  }
  /** Same shape as AboveVTT's create_token_inside(folder, name, image, type, options, statBlock). */
  async function createMyToken({ name, parentId, options, statBlockHtml }) {
    const tc = TokenCustomization.MyToken(newId(), parentId, { name, alternativeImages: [] });
    const o = clone(options) || {};
    delete o.id; delete o.name;
    tc.tokenOptions = $.extend(true, {}, tc.tokenOptions, o,
      { name, alternativeImages: o.alternativeImages?.length > 0 ? o.alternativeImages : o.imgsrc ? [o.imgsrc] : [] });
    if ((tc.tokenOptions.alternativeImages || []).some((u) => /\.(mp4|webm|m4v)(\?|$)/i.test(u))) tc.tokenOptions.videoToken = true;
    if (statBlockHtml) {
      const J = window.JOURNAL;
      if (!J?.notes || typeof J.persist !== "function") throw new Error("AboveVTT's journal isn't loaded, so the stat block can't be saved.");
      J.notes[tc.id] = { id: tc.id, title: name, text: statBlockHtml, plain: M.htmlToPlain ? M.htmlToPlain(statBlockHtml) : $(`<div>${statBlockHtml}</div>`).text(), player: true, statBlock: true };
      tc.tokenOptions.statBlock = tc.id;
      tc.tokenOptions.monster = "customStat";
      J.persist();
    }
    await persist(tc);
    return tc;
  }

  // ---------- one item → { name, options, statBlockHtml, notes } --------------------------------
  async function resolveExact(source, name) {
    const hits = (source === "monster" ? (await searchMonsters(name)).map(monsterSummary) : await searchOpen5e(name));
    const exact = hits.filter((h) => lc(h.name) === lc(name));
    if (exact.length === 1) return exact[0].id;
    const show = (list) => list.slice(0, 10).map((h) => `${h.name} [${h.id}]${h.cr ? ` CR ${h.cr}` : ""}${h.books?.length ? ` — ${h.books.join(", ")}` : ""}${h.legacy ? " (legacy)" : ""}`).join("; ");
    if (exact.length > 1) throw new Error(`${exact.length} ${SOURCE_LABEL[source]} are named '${name}': ${show(exact)}. Pass the id of the one you want.`);
    if (!hits.length) throw new Error(`No ${SOURCE_LABEL[source]} match '${name}'.`);
    throw new Error(`No ${SOURCE_LABEL[source]} is named exactly '${name}'. Close matches: ${show(hits)}.`);
  }

  async function prepare(item) {
    const source = item.source;
    if (!SOURCES.includes(source)) throw new Error(`source must be one of ${SOURCES.join(", ")}.`);
    const notes = [];

    if (source === "monster" || source === "open5e") {
      const open5e = source === "open5e";
      const id = item.id ?? (item.name ? await resolveExact(source, item.name) : undefined);
      if (!id) throw new Error("Give the monster's name or id.");
      const li = open5e ? await open5eItem(String(id)) : await monsterItem(String(id));
      // As create_token_copy_inside: the list item's options, its size, its senses, an image, monster = customStat.
      need(["find_token_options_for_list_item", "random_image_for_item"]);
      const found = find_token_options_for_list_item(li) || {};
      const options = { ...clone(found) };
      if (typeof options.tokenSize !== "number") options.sizeId = li.monsterData.sizeId;
      let vision = { darkvision: 0, devilsight: 0, truesight: 0 };
      if (li.monsterData?.senses?.length && typeof get_monster_senses === "function") vision = get_monster_senses(li.monsterData.senses, vision);
      const col = (k) => window.TOKEN_SETTINGS?.[k]?.color || "rgba(142, 142, 142, 1)";
      options.vision = { feet: found.vision?.feet ?? String(vision.darkvision), color: col("vision") };
      options.truesight = { feet: found.truesight?.feet ?? String(vision.truesight), color: col("truesight") };
      options.devilsight = { feet: found.devilsight?.feet ?? String(vision.devilsight), color: col("devilsight") };
      options.monster = "customStat";
      options.imgsrc = random_image_for_item(li);
      delete options.undefined; delete options[""];
      const sb = monsterStatBlockHtml(li);
      if (sb.warning) notes.push(sb.warning);
      return { baseName: li.name, options, statBlockHtml: sb.html, from: `${SOURCE_LABEL[source]}: ${li.name} [${id}]`, statBlock: sb.html ? `from ${open5e ? "Open5e" : "D&D Beyond"}` : "none", notes };
    }

    if (source === "aboveVTT" || source === "ddbToken") {
      const pool = listTokens(source);
      if (!pool.length) throw new Error(`The ${SOURCE_LABEL[source]} list isn't loaded yet. Open the Tokens tab once.`);
      let li;
      if (item.id) li = pool.find((x) => x.id === item.id);
      else {
        const hits = pool.filter((x) => lc(x.name) === lc(item.name));
        if (hits.length > 1) throw new Error(`${hits.length} ${SOURCE_LABEL[source]} are named '${item.name}': ${hits.map((h) => `${folderLabel(h, source)} / ${h.name} [${h.id}]`).join("; ")}. Pass the id.`);
        li = hits[0];
      }
      if (!li) throw new Error(`No ${SOURCE_LABEL[source]} ${item.id ? `with id '${item.id}'` : `named '${item.name}'`}. Use find_tokens_to_copy.`);
      // As duplicate_my_token.
      need(["find_token_options_for_list_item"]);
      const options = clone(find_token_options_for_list_item(li)) || {};
      if (options.image) { options.imgsrc = options.image; delete options.image; }
      delete options.id;
      if (!options.imgsrc && li.image) options.imgsrc = li.image;
      const note = window.JOURNAL?.notes?.[li.id];
      return { baseName: li.name, options, statBlockHtml: note?.text, from: `${folderLabel(li, source)} / ${li.name}`, statBlock: note?.text ? "copied" : "none (these tokens have no stats)", notes };
    }

    // source === "scene": a token already placed
    M.requireDM();
    const scene = resolveScene(item);
    const { tokens, data } = await sceneTokens(scene);
    if (!item.tokenId && !item.name) throw new Error("Give the token's name or tokenId.");
    const o = pickToken(tokens, { tokenId: item.tokenId, name: item.name }, scene.title);
    const why = refuseKind(o);
    if (why) throw new Error(`Can't copy '${o.name}': ${why}.`);
    const options = optionsFromPlaced(o, data);
    let html, statBlock = "none", monsterLi;
    if (o.statBlock && window.JOURNAL?.notes?.[o.statBlock]?.text) { html = window.JOURNAL.notes[o.statBlock].text; statBlock = "copied from its custom stat block"; }
    else if (o.monster === "open5e" && o.stat) monsterLi = await open5eItem(String(o.stat));
    else if (o.monster !== undefined && o.monster !== "" && o.monster !== "customStat" && !isNaN(Number(o.monster)) && Number(o.monster) > 0) monsterLi = await monsterItem(String(o.monster));
    if (monsterLi) {
      const sb = monsterStatBlockHtml(monsterLi);
      if (sb.warning) notes.push(sb.warning);
      html = sb.html; statBlock = html ? `from ${o.monster === "open5e" ? "Open5e" : "D&D Beyond"} (${monsterLi.name})` : "none";
      if (o.sizeId === undefined && options.tokenSize === undefined) options.sizeId = monsterLi.monsterData.sizeId;
    }
    // AC / max HP: the token's own values unless keepOriginalStats.
    const ac = o.armorClass !== undefined && o.armorClass !== "" && !isNaN(Number(o.armorClass)) ? Number(o.armorClass) : undefined;
    const maxHp = o.hitPointInfo?.maximum ?? o.max_hp;
    const hp = maxHp !== undefined && maxHp !== "" && !isNaN(Number(maxHp)) ? Number(maxHp) : undefined;
    if (html) {
      if (!item.keepOriginalStats) {
        const before = M.readStats ? M.readStats(html) : {};
        if (ac !== undefined && String(before.ac ?? "") !== String(ac)) { html = setStat(html, "ac", ac); notes.push(`AC set to the token's ${ac} (stat block had ${before.ac ?? "none"}).`); }
        if (hp !== undefined && String(before.hp ?? "") !== String(hp)) { html = setStat(html, "hp", hp); notes.push(`Max HP set to the token's ${hp} (stat block had ${before.hp ?? "none"}).`); }
      }
    } else if ((ac !== undefined || hp !== undefined) && M.buildStatBlock) {
      html = M.buildStatBlock(o.name, { ac, hp });
      statBlock = "made from the token's AC and max HP";
    }
    if (o.statBlock && !window.JOURNAL?.notes?.[o.statBlock]) notes.push("Its custom stat block wasn't found in the journal.");
    return { baseName: o.name, options, statBlockHtml: html, from: `'${o.name}' on ${scene.title}`, statBlock, notes };
  }

  // ---------- handlers ---------------------------------------------------------------------------
  M.register("find_tokens_to_copy", async ({ query, source } = {}) => {
    M.requireDM();
    const q = String(query ?? "").trim();
    if (!q) throw new Error("Give a name (or part of one) to search for.");
    const wanted = source ? [source] : ["monster", "open5e", "aboveVTT", "ddbToken"];
    for (const s of wanted) if (!SOURCES.includes(s) || s === "scene") throw new Error("source must be monster, open5e, aboveVTT or ddbToken (use list_scene_tokens for tokens on a scene).");
    const out = {}, errors = {};
    await Promise.all(wanted.map(async (s) => {
      try {
        if (s === "monster") out.monster = (await searchMonsters(q)).map(monsterSummary).slice(0, 25);
        else if (s === "open5e") out.open5e = (await searchOpen5e(q)).slice(0, 25);
        else out[s] = listTokens(s).filter((li) => lc(li.name).includes(lc(q))).slice(0, 25).map((li) => listSummary(li, s));
      } catch (e) { errors[s] = e.message; }
    }));
    return { query: q, results: out, errors: Object.keys(errors).length ? errors : undefined };
  });

  M.register("copy_to_my_tokens", async ({ items, folderId, folderName } = {}) => {
    M.requireDM();
    need(["persist_token_customization", "did_change_mytokens_items"]);
    if (!Array.isArray(items) || !items.length) throw new Error("Pass items: a list of { source, name | id | tokenId, … }.");
    if (items.length > 25) throw new Error("At most 25 items per call.");
    const folder = M.myTokensFolder ? M.myTokensFolder({ folderId, folderName }) : null;
    const parentId = folder ? folder.id : ROOT();
    const copied = [], failed = [];
    for (const [i, item] of items.entries()) {
      const label = item?.name ?? item?.id ?? item?.tokenId ?? `item ${i + 1}`;
      try {
        const p = await prepare(item || {});
        const base = String(item.newName ?? p.baseName ?? "").trim() || "New Token";
        const name = uniqueName(base, parentId);
        const tc = await createMyToken({ name, parentId, options: p.options, statBlockHtml: p.statBlockHtml });
        const d = M.myTokensDescribe ? M.myTokensDescribe(tc) : { id: tc.id, name };
        copied.push({ ...d, from: p.from, statBlock: p.statBlock, renamed: name !== base ? `'${base}' was taken` : undefined, notes: p.notes.length ? p.notes : undefined });
      } catch (e) {
        failed.push({ item: label, source: item?.source, error: e.message });
      }
    }
    if (copied.length) { try { did_change_mytokens_items(); } catch (e) { console.warn("[AVTT MCP] token list refresh failed", e); } }
    return { folder: folder ? (M.myTokensPath ? M.myTokensPath(folder) : folder.id) : "My Tokens", copied, failed };
  });
})();
