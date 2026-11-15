// Step 11: custom creatures (AboveVTT "My Tokens") and their stat blocks.
// A creature is a TokenCustomization of type MyToken under RootFolder.MyTokens: name, images
// (alternativeImages), size (tokenSize) and token options. HP / AC / initiative come from its
// stat block — a journal note with statBlock: true whose id is the creature's id — which AboveVTT
// reads every time the token is placed (create_and_place_token). We write stat blocks with the
// same "custom-ac / custom-avghp / custom-hp-roll / custom-initiative / custom-challenge-rating"
// markers AboveVTT's stat block editor uses, so that reading is reliable.
/* global $, uuid, default_options, TokenCustomization, RootFolder, ItemType, persist_token_customization,
   persist_all_token_customizations, delete_token_customization_by_type_and_id, did_change_mytokens_items */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const ROOT = () => (typeof RootFolder !== "undefined" ? RootFolder.MyTokens.id : "myTokensFolder");
  const T_MYTOKEN = () => (typeof ItemType !== "undefined" ? ItemType.MyToken : "myToken");
  const T_FOLDER = () => (typeof ItemType !== "undefined" ? ItemType.Folder : "folder");
  const newId = () => (typeof uuid === "function" ? uuid() : crypto.randomUUID());
  const SIZES = { tiny: 0.5, small: 1, medium: 1, "small/medium": 1, large: 2, huge: 3, gargantuan: 4 };
  const SIZE_NAME = { 0.5: "Tiny", 1: "Small/Medium", 2: "Large", 3: "Huge", 4: "Gargantuan" };
  // D&D Beyond size ids, which AboveVTT uses when no tokenSize is set (create_and_place_token).
  const SIZE_ID_NAME = { 2: "Tiny", 3: "Small", 4: "Medium", 5: "Large", 6: "Huge", 7: "Gargantuan" };

  function need() {
    for (const n of ["persist_token_customization", "did_change_mytokens_items"]) {
      if (typeof window[n] !== "function") throw new Error(`AboveVTT function '${n}' was not found. This AboveVTT version may not be supported yet.`);
    }
    if (typeof TokenCustomization === "undefined") throw new Error("AboveVTT's TokenCustomization was not found.");
    if (!Array.isArray(window.TOKEN_CUSTOMIZATIONS)) throw new Error("AboveVTT's token list isn't loaded yet. Open the Tokens tab once, or wait for AboveVTT to finish loading.");
  }
  const all = () => window.TOKEN_CUSTOMIZATIONS;
  const mine = () => all().filter((tc) => tc.rootId === ROOT() && (tc.tokenType === T_MYTOKEN() || tc.tokenType === T_FOLDER()) && tc.id !== ROOT());
  const nameOf = (tc) => (typeof tc.name === "function" ? tc.name() : tc.tokenOptions?.name) || "(unnamed)";
  const isFolder = (tc) => tc.tokenType === T_FOLDER();

  function persist(tc) {
    return new Promise((resolve, reject) => {
      persist_token_customization(tc, (ok, err) => (ok === false ? reject(new Error(`AboveVTT could not save '${nameOf(tc)}': ${err ?? "unknown error"}`)) : resolve()));
    });
  }
  function persistAll() {
    return new Promise((resolve, reject) => {
      persist_all_token_customizations(all(), (ok, err) => (ok === false ? reject(new Error(`AboveVTT could not save My Tokens: ${err ?? "unknown error"}`)) : resolve()));
    });
  }
  function refresh() { try { did_change_mytokens_items(); } catch (e) { console.warn("[AVTT MCP] token list refresh failed", e); } }

  function pathOf(tc) {
    const names = [];
    const seen = new Set();
    let cur = tc;
    while (cur && cur.id !== ROOT() && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(nameOf(cur));
      cur = all().find((x) => x.id === cur.parentId && x.tokenType === T_FOLDER());
    }
    return ["My Tokens", ...names].join(" / ");
  }

  function findFolder({ folderId, folderName }, { allowRoot = true } = {}) {
    if (!folderId && !folderName) {
      if (allowRoot) return null;
      throw new Error("Say which My Tokens folder: folderId or folderName.");
    }
    if (folderId === ROOT() || folderId === "root") return null;
    const pool = mine().filter(isFolder);
    if (folderId) {
      const f = pool.find((x) => x.id === folderId);
      if (!f) throw new Error(`No My Tokens folder with id '${folderId}'. Use list_creatures to see folders.`);
      return f;
    }
    const q = String(folderName).trim().toLowerCase();
    const hits = pool.filter((x) => nameOf(x).trim().toLowerCase() === q);
    if (!hits.length) throw new Error(`No My Tokens folder named '${folderName}'. Create it with create_creature_folder.`);
    if (hits.length > 1) throw new Error(`${hits.length} folders are named '${folderName}': ${hits.map((h) => `${pathOf(h)} [${h.id}]`).join("; ")}. Use folderId.`);
    return hits[0];
  }

  function findCreature({ creatureId, creatureName }) {
    const pool = mine().filter((tc) => !isFolder(tc));
    if (creatureId) {
      const c = pool.find((x) => x.id === creatureId);
      if (!c) throw new Error(`No custom creature with id '${creatureId}'. Use list_creatures to find ids.`);
      return c;
    }
    if (creatureName) {
      const q = String(creatureName).trim().toLowerCase();
      const hits = pool.filter((x) => nameOf(x).trim().toLowerCase() === q);
      if (!hits.length) throw new Error(`No custom creature named '${creatureName}'. Use list_creatures (with search) to find it.`);
      if (hits.length > 1) throw new Error(`${hits.length} creatures are named '${creatureName}': ${hits.map((h) => `${pathOf(h)} [${h.id}]`).join("; ")}. Use creatureId.`);
      return hits[0];
    }
    throw new Error("Say which creature: creatureId or creatureName.");
  }

  // ---------- reading a stat block (same rules AboveVTT uses when placing a token) ------------
  function readStats(html) {
    if (!html) return {};
    const wrap = $(`<div>${html}</div>`);
    wrap.find("style").remove();
    const text = wrap[0].innerHTML.replaceAll("mon-stat-block-2024", "").replace(/&nbsp;/g, " ");
    const $t = $(`<div>${text}</div>`);
    const pick = (cls) => $t.find(`.${cls}.custom-stat`).first().text().trim();
    let ac = pick("custom-ac"), hp = pick("custom-avghp"), hd = pick("custom-hp-roll"), init = pick("custom-initiative"), cr = pick("custom-challenge-rating");
    if (!hp) { const m = text.matchAll(/(Hit Points|hp)[\s\S]*?[\s>]([0-9]+)/gi).next(); if (m.value) hp = m.value[2]; }
    if (!ac) { const m = text.matchAll(/(Armor Class|ac)[\s\S]*?[\s>]([0-9]+)[<.\s]/gi).next(); if (m.value) ac = m.value[2]; }
    if (!hd) {
      const m = text.matchAll(/(Hit Points|hp)[\s\S]+?\((([0-9]+d[0-9]+)\s?([+-]\s?[0-9]+)?)\)/gi).next();
      if (m.value) hd = m.value[2];
    }
    return { ac: ac || undefined, hp: hp || undefined, hitDice: hd || undefined, initiative: init || undefined, cr: cr || undefined };
  }

  // ---------- writing a stat block -----------------------------------------------------------
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const mod = (score) => Math.floor((Number(score) - 10) / 2);
  const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
  function avgFromDice(d) {
    const m = String(d).replace(/\s/g, "").match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!m) return undefined;
    return Math.floor((Number(m[1]) * (Number(m[2]) + 1)) / 2) + Number(m[3] || 0);
  }
  const XP = { "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000 };

  /** Structured stat block → HTML in AboveVTT's custom stat block style. */
  function buildStatBlock(name, sb) {
    const out = [`<div class="stat-block">`, `<h2>${esc(name)}</h2>`];
    const line = [sb.size, sb.type].filter(Boolean).join(" ");
    if (line || sb.alignment) out.push(`<p><em>${esc([line, sb.alignment].filter(Boolean).join(", "))}</em></p>`);
    if (sb.ac !== undefined) out.push(`<p><strong>Armor Class</strong> <span class="custom-ac custom-stat">${esc(sb.ac)}</span>${sb.acNote ? ` (${esc(sb.acNote)})` : ""}</p>`);
    let hp = sb.hp;
    if (hp === undefined && sb.hitDice) hp = avgFromDice(sb.hitDice);
    if (hp !== undefined || sb.hitDice) {
      out.push(`<p><strong>Hit Points</strong> ${hp !== undefined ? `<span class="custom-avghp custom-stat">${esc(hp)}</span>` : ""}${sb.hitDice ? ` (<span class="custom-hp-roll custom-stat">${esc(String(sb.hitDice).replace(/\s/g, ""))}</span>)` : ""}</p>`);
    }
    if (sb.speed) out.push(`<p><strong>Speed</strong> ${esc(sb.speed)}</p>`);
    let init = sb.initiative;
    if (init === undefined && sb.abilities?.dex !== undefined) init = signed(mod(sb.abilities.dex));
    if (init !== undefined) out.push(`<p><strong>Initiative</strong> <span class="custom-initiative custom-stat">${esc(typeof init === "number" ? signed(init) : init)}</span></p>`);
    if (sb.abilities) {
      const keys = ["str", "dex", "con", "int", "wis", "cha"];
      out.push(`<table><thead><tr>${keys.map((k) => `<th>${k.toUpperCase()}</th>`).join("")}</tr></thead><tbody><tr>` +
        keys.map((k) => (sb.abilities[k] === undefined ? "<td>—</td>" : `<td>${esc(sb.abilities[k])} (${signed(mod(sb.abilities[k]))})</td>`)).join("") +
        `</tr></tbody></table>`);
    }
    for (const [label, key] of [["Saving Throws", "savingThrows"], ["Skills", "skills"], ["Damage Vulnerabilities", "damageVulnerabilities"], ["Damage Resistances", "damageResistances"], ["Damage Immunities", "damageImmunities"], ["Condition Immunities", "conditionImmunities"], ["Senses", "senses"], ["Languages", "languages"]]) {
      if (sb[key]) out.push(`<p><strong>${label}</strong> ${esc(sb[key])}</p>`);
    }
    if (sb.cr !== undefined) {
      const xp = XP[String(sb.cr)];
      out.push(`<p><strong>Challenge</strong> <span class="custom-challenge-rating custom-stat">${esc(sb.cr)}</span>${xp ? ` (${xp.toLocaleString()} XP)` : ""}</p>`);
    }
    const section = (title, list) => {
      if (!Array.isArray(list) || !list.length) return;
      if (title) out.push(`<h3>${title}</h3>`);
      for (const f of list) {
        if (typeof f === "string") out.push(`<p>${esc(f)}</p>`);
        else out.push(`<p><strong><em>${esc(f.name)}.</em></strong> ${esc(f.text ?? f.description ?? "")}</p>`);
      }
    };
    section("", sb.traits);
    section("Actions", sb.actions);
    section("Bonus Actions", sb.bonusActions);
    section("Reactions", sb.reactions);
    section("Legendary Actions", sb.legendaryActions);
    if (sb.description) out.push(`<p>${esc(sb.description)}</p>`);
    out.push(`</div>`);
    return out.join("");
  }

  function statBlockHtml(name, { statBlock, statBlockText, statBlockHtml: raw }) {
    const given = [statBlock, statBlockText, raw].filter((x) => x !== undefined && x !== null && x !== "").length;
    if (given > 1) throw new Error("Give the stat block one way only: statBlock (fields), statBlockText or statBlockHtml.");
    let html;
    if (statBlock) html = buildStatBlock(name, statBlock);
    else if (statBlockText) html = `<div class="stat-block">${M.textToHtml ? M.textToHtml(statBlockText) : esc(statBlockText)}</div>`;
    else if (raw) html = String(raw);
    else return undefined;
    html = M.sanitizeHtml ? M.sanitizeHtml(html) : html;
    if (html.length > 100000) throw new Error("That stat block is too long for AboveVTT to send to players (about 100,000 characters).");
    return html;
  }

  function saveStatBlock(tc, html) {
    const J = window.JOURNAL;
    if (!J?.notes || typeof J.persist !== "function") throw new Error("AboveVTT's journal isn't loaded, so the stat block can't be saved.");
    // Same shape AboveVTT uses (create_token_inside / the token modal's stat block button).
    J.notes[tc.id] = { ...(J.notes[tc.id] || {}), id: tc.id, title: nameOf(tc), text: html,
      plain: M.htmlToPlain ? M.htmlToPlain(html) : $(`<div>${html}</div>`).text(), player: true, statBlock: true };
    tc.tokenOptions.statBlock = tc.id;
    J.persist();
  }

  // ---------- token options -------------------------------------------------------------------
  /** Friendly keys → AboveVTT tokenOptions. Returns a patch (null = remove the override). */
  function optionsPatch(input = {}, current = {}) {
    const patch = {};
    // AboveVTT's default colours (default_options() / Token Settings Defaults), used when only feet are given.
    const d0 = typeof default_options === "function" ? default_options() : {};
    const defColor = {
      aura1: d0.aura1?.color ?? "rgba(255, 129, 0, 0.3)", aura2: d0.aura2?.color ?? "rgba(255, 255, 0, 0.1)",
      light1: window.TOKEN_SETTINGS?.light1?.color ?? d0.light1?.color ?? "rgba(255, 255, 255, 1)",
      light2: window.TOKEN_SETTINGS?.light2?.color ?? d0.light2?.color ?? "rgba(142, 142, 142, 1)",
      vision: window.TOKEN_SETTINGS?.vision?.color ?? "rgba(142, 142, 142, 1)",
    };
    if (input.size !== undefined) {
      const v = typeof input.size === "number" ? input.size : SIZES[String(input.size).trim().toLowerCase()];
      if (![0.5, 1, 2, 3, 4].includes(v)) throw new Error("size must be Tiny, Small, Medium, Large, Huge or Gargantuan (or 0.5, 1, 2, 3, 4 squares).");
      patch.tokenSize = v;
    }
    if (input.borderColor !== undefined) patch.color = input.borderColor === null ? null : M.toRgba(input.borderColor, "borderColor");
    for (const [k, store] of [["aura1", "aura1"], ["aura2", "aura2"]]) {
      if (input[k] === undefined) continue;
      if (input[k] === null) { patch[store] = null; continue; }
      const a = { ...(current[store] || {}) };
      if (input[k].feet !== undefined) { const f = Number(input[k].feet); if (!(f >= 0)) throw new Error(`${k}.feet must be 0 or more.`); a.feet = String(f); }
      if (input[k].color !== undefined) a.color = M.toRgba(input[k].color, `${k}.color`);
      a.color ??= defColor[store];
      patch[store] = a;
    }
    if (input.darkvisionFeet !== undefined) {
      const f = Number(input.darkvisionFeet); if (!(f >= 0)) throw new Error("darkvisionFeet must be 0 or more.");
      patch.vision = { color: defColor.vision, ...(current.vision || {}), feet: String(f) };
    }
    for (const [k, store] of [["lightInner", "light1"], ["lightOuter", "light2"]]) {
      if (input[k] === undefined) continue;
      if (input[k] === null) { patch[store] = null; continue; }
      const l = { ...(current[store] || {}) };
      if (input[k].feet !== undefined) { const f = Number(input[k].feet); if (!(f >= 0)) throw new Error(`${k}.feet must be 0 or more.`); l.feet = String(f); }
      if (input[k].color !== undefined) l.color = M.toRgba(input[k].color, `${k}.color`);
      l.color ??= defColor[store];
      patch[store] = l;
    }
    if (input.settings) {
      const defs = new Map((M.tokenOptionDefs ? M.tokenOptionDefs() : []).map((d) => [d.name, d]));
      for (const [k, v] of Object.entries(input.settings)) {
        const def = defs.get(k);
        if (!def) throw new Error(`'${k}' is not a token setting. Valid: ${[...defs.keys()].join(", ")}.`);
        patch[k] = v === null ? null : M.coerceSetting(def, v, k); // null = back to the folder/default value
      }
    }
    return patch;
  }
  function applyPatch(tc, patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete tc.tokenOptions[k];
      else tc.tokenOptions[k] = v;
    }
  }

  function checkImages(list, label = "images") {
    if (list === undefined) return undefined;
    const arr = Array.isArray(list) ? list : [list];
    for (const u of arr) {
      if (!/^https?:\/\//i.test(String(u))) throw new Error(`${label}: '${u}' must be a public http(s) link to an image or video.`);
      if (String(u).startsWith("data:")) throw new Error(`${label}: data: links crash AboveVTT.`);
    }
    return arr.map(String);
  }

  /** Stat blocks pasted from D&D Beyond lay the ability scores out in many tiny boxes; put each ability on one line. */
  function tidyStatText(t) {
    const lines = String(t).split("\n").map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim());
    const out = [];
    let run = [];
    const flush = () => { if (run.length) out.push(run.join(" ")); run = []; };
    for (const l of lines) {
      if (!l) { if (run.length) continue; flush(); if (out.length && out[out.length - 1] !== "") out.push(""); continue; }
      if (/^([+-]?\d+|\([+-]?\d+\)|STR|DEX|CON|INT|WIS|CHA|Mod|Save)$/.test(l)) run.push(l); else { flush(); out.push(l); }
    }
    flush();
    return out.join("\n")
      .replace(/ (?=(STR|DEX|CON|INT|WIS|CHA) [0-9])/g, "\n")
      .replace(/\s*\bMod Save\b/g, "")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  function describe(tc, { full = false } = {}) {
    const o = tc.tokenOptions || {};
    const note = window.JOURNAL?.notes?.[o.statBlock];
    const d = {
      id: tc.id, name: nameOf(tc), type: isFolder(tc) ? "folder" : "creature", path: pathOf(tc),
    };
    if (isFolder(tc)) return d;
    Object.assign(d, {
      images: Array.isArray(o.alternativeImages) ? new Set(o.alternativeImages).size : 0,
      size: o.tokenSize !== undefined ? SIZE_NAME[o.tokenSize] ?? `${o.tokenSize} squares`
        : o.sizeId !== undefined ? SIZE_ID_NAME[o.sizeId] ?? "Small/Medium" : "Small/Medium (default)",
      hasStatBlock: !!note,
      ...(note ? readStats(note.text) : {}),
    });
    if (full) {
      d.imageLinks = o.alternativeImages || [];
      const skip = new Set(["name", "alternativeImages", "statBlock"]);
      d.options = Object.fromEntries(Object.entries(o).filter(([k]) => !skip.has(k)));
      d.statBlockText = note ? tidyStatText(M.htmlToPlain ? M.htmlToPlain(note.text || "") : $(`<div>${note.text}</div>`).text()) : undefined;
    }
    return d;
  }

  // Shared with step 12 (tokens already on a scene).
  M.tokenOptionsPatch = optionsPatch;
  M.checkImages = checkImages;

  // ---------- handlers ----------------------------------------------------------------------
  M.register("list_creatures", async ({ folderId, folderName, search } = {}) => {
    M.requireDM();
    need();
    const top = findFolder({ folderId, folderName });
    const q = search ? String(search).toLowerCase() : null;
    const build = (parentId) => mine()
      .filter((tc) => (tc.parentId || ROOT()) === parentId)
      .sort((a, b) => (isFolder(a) === isFolder(b) ? nameOf(a).toLowerCase().localeCompare(nameOf(b).toLowerCase()) : isFolder(a) ? -1 : 1))
      .map((tc) => (isFolder(tc) ? { ...describe(tc), children: build(tc.id) } : describe(tc)))
      .filter((n) => !q || n.type === "folder" || n.name.toLowerCase().includes(q));
    let tree = build(top ? top.id : ROOT());
    if (q) {
      const prune = (n) => (n.type === "folder" ? ((n.children = n.children.map(prune).filter(Boolean)), n.children.length || n.name.toLowerCase().includes(q) ? n : null) : n);
      tree = tree.map(prune).filter(Boolean);
    }
    let creatures = 0, folders = 0;
    const count = (n) => (n.type === "folder" ? (folders++, n.children.forEach(count)) : creatures++);
    tree.forEach(count);
    return { root: top ? pathOf(top) : "My Tokens", creatures, folders, tree };
  });

  M.register("get_creature", async ({ creatureId, creatureName } = {}) => {
    M.requireDM();
    need();
    return describe(findCreature({ creatureId, creatureName }), { full: true });
  });

  M.register("create_creature", async ({ creatures, folderId, folderName } = {}) => {
    M.requireDM();
    need();
    if (!Array.isArray(creatures) || !creatures.length) throw new Error("Pass creatures: a list of { name, images, size, statBlock | statBlockText | statBlockHtml, … }.");
    if (creatures.length > 25) throw new Error("At most 25 creatures per call.");
    const folder = findFolder({ folderId, folderName });
    const parentId = folder ? folder.id : ROOT();
    // Check everything first.
    const prepared = creatures.map((c, i) => {
      const name = String(c?.name ?? "").trim();
      if (!name) throw new Error(`Creature ${i + 1} needs a name.`);
      try {
        return { name, images: checkImages(c.images) || [], patch: optionsPatch(c), html: statBlockHtml(name, c) };
      } catch (e) { throw new Error(`Creature ${i + 1} ('${name}'): ${e.message}`); }
    });
    const taken = new Set(mine().filter((tc) => (tc.parentId || ROOT()) === parentId).map((tc) => nameOf(tc).toLowerCase()));
    const created = [];
    for (const p of prepared) {
      // Same naming rule as AboveVTT's create_token_inside: a taken name gets a number.
      let name = p.name, n = 2;
      while (taken.has(name.toLowerCase())) name = `${p.name} ${n++}`;
      taken.add(name.toLowerCase());
      const tc = TokenCustomization.MyToken(newId(), parentId, { name, alternativeImages: p.images });
      if (p.images.some((u) => /\.(mp4|webm|m4v)(\?|$)/i.test(u))) tc.tokenOptions.videoToken = true;
      applyPatch(tc, p.patch);
      if (p.html) saveStatBlock(tc, p.html);
      await persist(tc);
      created.push({ ...describe(tc), requestedName: p.name });
    }
    refresh();
    return { folder: folder ? pathOf(folder) : "My Tokens", created };
  });

  M.register("update_creature", async ({ creatureId, creatureName, newName, images, addImages, removeImages, folderId, folderName, toTopLevel, removeStatBlock, ...rest } = {}) => {
    M.requireDM();
    need();
    const tc = findCreature({ creatureId, creatureName });
    const before = describe(tc);
    // Check everything first.
    const repl = checkImages(images, "images");
    const add = checkImages(addImages, "addImages");
    const patch = optionsPatch(rest, tc.tokenOptions || {});
    const finalName = newName !== undefined ? String(newName).trim() : nameOf(tc);
    if (newName !== undefined && !finalName) throw new Error("A creature's name can't be empty.");
    const html = statBlockHtml(finalName, rest);
    if (html && removeStatBlock) throw new Error("Pass a new stat block or removeStatBlock, not both.");
    const dest = toTopLevel ? null : (folderId || folderName ? findFolder({ folderId, folderName }) : undefined);
    if (window.JOURNAL?.notes?.[tc.id] && $(`textarea[data-note-id='${tc.id}']`).length && (html || removeStatBlock)) {
      throw new Error("This creature's stat block is open for editing in AboveVTT. Save and close it first.");
    }

    const changed = [];
    if (newName !== undefined && finalName !== nameOf(tc)) { tc.tokenOptions.name = finalName; changed.push("name"); if (window.JOURNAL?.notes?.[tc.id]) window.JOURNAL.notes[tc.id].title = finalName; }
    if (repl) { tc.tokenOptions.alternativeImages = repl; changed.push("images"); }
    if (add?.length) { tc.tokenOptions.alternativeImages = [...new Set([...(tc.tokenOptions.alternativeImages || []), ...add])]; changed.push("images added"); }
    if (removeImages?.length) {
      const drop = new Set((Array.isArray(removeImages) ? removeImages : [removeImages]).map(String));
      const beforeN = (tc.tokenOptions.alternativeImages || []).length;
      tc.tokenOptions.alternativeImages = (tc.tokenOptions.alternativeImages || []).filter((u) => !drop.has(u));
      if (tc.tokenOptions.alternativeImages.length !== beforeN) changed.push("images removed");
    }
    if (Object.keys(patch).length) { applyPatch(tc, patch); changed.push(...Object.keys(patch)); }
    if (dest !== undefined && (tc.parentId || ROOT()) !== (dest ? dest.id : ROOT())) { tc.parentId = dest ? dest.id : ROOT(); changed.push("folder"); }
    if (html) { saveStatBlock(tc, html); changed.push("stat block"); }
    else if (newName !== undefined && window.JOURNAL?.notes?.[tc.id]) window.JOURNAL.persist();
    if (removeStatBlock && window.JOURNAL?.notes?.[tc.id]) {
      // Same as the token modal's "Delete Custom Statblock".
      delete window.JOURNAL.notes[tc.id];
      window.JOURNAL.persist();
      delete tc.tokenOptions.statBlock;
      changed.push("stat block removed");
    }
    if (!changed.length) return { before, after: before, changed };
    await persist(tc);
    refresh();
    return { before, after: describe(tc), changed };
  });

  M.register("delete_creature", async ({ creatureId, creatureName, dryRun } = {}) => {
    M.requireDM();
    need();
    const tc = findCreature({ creatureId, creatureName });
    const d = describe(tc);
    if (dryRun) return { dryRun: true, wouldDelete: d, alsoDeletesStatBlock: d.hasStatBlock };
    if (typeof delete_token_customization_by_type_and_id !== "function") throw new Error("AboveVTT's delete function was not found.");
    // AboveVTT's own delete (also deletes the creature's stat block note).
    await new Promise((resolve, reject) => delete_token_customization_by_type_and_id(tc.tokenType, tc.id, (ok, err) => (ok === false ? reject(new Error(String(err))) : resolve())));
    refresh();
    return { deleted: d, statBlockDeleted: d.hasStatBlock };
  });

  M.register("create_creature_folder", async ({ name, parentFolderId, parentFolderName } = {}) => {
    M.requireDM();
    need();
    const n = String(name ?? "").trim();
    if (!n) throw new Error("A folder needs a name.");
    const parent = findFolder({ folderId: parentFolderId, folderName: parentFolderName });
    const parentId = parent ? parent.id : ROOT();
    const clash = mine().find((tc) => isFolder(tc) && (tc.parentId || ROOT()) === parentId && nameOf(tc).toLowerCase() === n.toLowerCase());
    if (clash) throw new Error(`A My Tokens folder named '${nameOf(clash)}' already exists there [${clash.id}].`);
    const f = TokenCustomization.Folder(newId(), parentId, ROOT(), { name: n });
    await persist(f);
    refresh();
    return { created: describe(f) };
  });

  M.register("delete_creature_folder", async ({ folderId, folderName, mode = "moveContentsUp", dryRun } = {}) => {
    M.requireDM();
    need();
    if (!["moveContentsUp", "deleteEverything"].includes(mode)) throw new Error("mode must be moveContentsUp (default) or deleteEverything.");
    const f = findFolder({ folderId, folderName }, { allowRoot: false });
    const inside = [];
    const walk = (id) => mine().forEach((tc) => { if (tc.parentId === id) { inside.push(tc); if (isFolder(tc)) walk(tc.id); } });
    walk(f.id);
    const direct = inside.filter((tc) => tc.parentId === f.id);
    const parentPath = f.parentId && f.parentId !== ROOT() ? pathOf(all().find((x) => x.id === f.parentId)) : "My Tokens";
    const plan = mode === "deleteEverything"
      ? { folder: pathOf(f), mode, deletes: inside.map((tc) => describe(tc)) }
      : { folder: pathOf(f), mode, movesUpTo: parentPath, moves: direct.map((tc) => describe(tc)) };
    if (dryRun) return { dryRun: true, ...plan };
    if (mode === "moveContentsUp") {
      // Same as AboveVTT's move_mytokens_to_parent_folder_and_delete_folder.
      all().forEach((tc) => { if (tc.parentId === f.id) tc.parentId = f.parentId; });
      window.TOKEN_CUSTOMIZATIONS.splice(window.TOKEN_CUSTOMIZATIONS.indexOf(f), 1);
      await persistAll();
    } else {
      // Same result as AboveVTT's delete_mytokens_folder_and_everything_in_it, plus the creatures' stat blocks.
      const ids = new Set([f.id, ...inside.map((tc) => tc.id)]);
      for (const tc of inside) if (!isFolder(tc) && window.JOURNAL?.notes?.[tc.id]?.statBlock) delete window.JOURNAL.notes[tc.id];
      window.TOKEN_CUSTOMIZATIONS = all().filter((tc) => !ids.has(tc.id));
      window.JOURNAL?.persist?.();
      await persistAll();
    }
    refresh();
    return plan;
  });
})();
