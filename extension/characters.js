// Step 14: read-only player character sheets.
// Party summary: AboveVTT's own D&D Beyond call DDBApi.fetchCampaignCharacterDetails(gameId) (what it uses
// to build window.pcs and the player cards): computed AC, HP, abilities/saves, passive scores, skills,
// attacks, spell save DCs, speeds, senses, defences, proficiencies, classes, level.
// Full sheet: DDBApi.fetchCharacter(id) — D&D Beyond's character JSON, read with the DM's own sign-in
// (as AboveVTT does): spells and slots, inventory, money, feats, class features, background, traits.
// The players' own notes (backstory, allies, organisations, other notes) are left out unless asked for.
// Nothing is ever written to D&D Beyond.
/* global DDBApi */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const nameOf = (x) => (x == null ? "" : typeof x === "string" ? x : x.name ?? x.definition?.name ?? x.fullName ?? x.label ?? "");
  const num = (v) => (v === undefined || v === null || v === "" || isNaN(v) ? undefined : Number(v));
  const signed = (n) => (n === undefined ? undefined : n >= 0 ? `+${n}` : `${n}`);
  const players = () => (Array.isArray(window.playerUsers) ? window.playerUsers : []);
  const strip = (html) => {
    if (!html) return "";
    const d = document.createElement("div");
    d.innerHTML = String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "</$1>\n");
    return (d.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  };
  const need = () => {
    if (typeof DDBApi === "undefined" || typeof DDBApi.fetchCharacterDetails !== "function") throw new Error("AboveVTT's D&D Beyond API helper (DDBApi) was not found. This AboveVTT version may not be supported yet.");
  };

  // ---------- the party summary --------------------------------------------------------------------
  let cache = null; // { at, list }
  async function party({ refresh = false } = {}) {
    need();
    if (!refresh && cache && Date.now() - cache.at < 30000) return cache.list;
    let list;
    try {
      list = await DDBApi.fetchCampaignCharacterDetails(window.gameId);
    } catch (e) {
      if (Array.isArray(window.pcs) && window.pcs.length) list = window.pcs; // what AboveVTT already loaded
      else throw new Error(`D&D Beyond didn't return the campaign's characters: ${e?.message ?? e}`);
    }
    list = (Array.isArray(list) ? list : []).filter((c) => c && (c.characterId || c.id));
    cache = { at: Date.now(), list };
    return list;
  }
  const idOf = (c) => String(c.characterId ?? c.id);

  function playerName(c) {
    const u = players().find((p) => String(p.userId) === String(c.userId));
    return u?.userName ?? c.userName ?? c.username ?? undefined;
  }
  function classesText(c) {
    const cl = Array.isArray(c.classes) ? c.classes : [];
    const parts = cl.map((k) => {
      const n = nameOf(k.definition ?? k) || nameOf(k.class);
      const sub = nameOf(k.subclassDefinition ?? k.subclass);
      const lvl = num(k.level);
      return [n, sub ? `(${sub})` : "", lvl ? lvl : ""].filter(Boolean).join(" ");
    }).filter(Boolean);
    return parts.join(" / ");
  }
  function summary(c) {
    const hp = c.hitPointInfo || {};
    const speed = (c.speeds || []).find((s) => /walk/i.test(nameOf(s)))?.distance ?? (c.speeds || [])[0]?.distance;
    return {
      id: idOf(c), name: c.name || "(unnamed)", player: playerName(c),
      race: nameOf(c.race) || undefined, classes: classesText(c) || undefined, level: num(c.level),
      ac: num(c.armorClass),
      hp: { current: num(hp.current), maximum: num(hp.maximum), temp: num(hp.temp) || 0 },
      passive: { perception: num(c.passivePerception), investigation: num(c.passiveInvestigation), insight: num(c.passiveInsight) },
      speed: num(speed),
      conditions: (c.conditions || []).map((x) => (x?.level ? `${nameOf(x)} (level ${x.level})` : nameOf(x))).filter(Boolean),
      inspiration: c.inspiration ? true : undefined,
      dying: num(hp.current) === 0 ? { successes: num(c.deathSaveInfo?.successCount) ?? 0, failures: num(c.deathSaveInfo?.failCount) ?? 0 } : undefined,
      sheetUrl: c.readOnlyUrl || `https://www.dndbeyond.com/characters/${idOf(c)}`,
    };
  }

  /** D&D Beyond sends damage and range as small objects; turn them into text. */
  function dmgText(d) {
    if (d === null || d === undefined) return "";
    if (typeof d !== "object") return String(d);
    const dice = d.diceString ?? d.value ?? d.dice ?? (d.diceCount && d.diceValue ? `${d.diceCount}d${d.diceValue}${d.fixedValue ? (d.fixedValue > 0 ? `+${d.fixedValue}` : d.fixedValue) : ""}` : d.fixedValue ?? d.fixed);
    const type = nameOf(d.type ?? d.damageType) || (typeof d.damageType === "string" ? d.damageType : "");
    const diceStr = dice && typeof dice === "object" ? dmgText(dice) : dice;
    return [diceStr, type].filter((x) => x !== undefined && x !== null && x !== "").join(" ");
  }
  function rangeText(r) {
    if (r === null || r === undefined || r === "") return "";
    if (typeof r !== "object") return `range ${r}`;
    const near = r.range ?? r.normal ?? r.value ?? r.rangeValue ?? r.short;
    const far = r.longRange ?? r.long ?? r.max;
    const origin = r.origin ?? r.type;
    if (near) return `range ${near}${far && far !== near ? `/${far}` : ""} ft.`;
    if (r.reach) return `reach ${r.reach} ft.`;
    if (origin && typeof origin === "string" && !/^self$/i.test(origin)) return origin.toLowerCase();
    return "";
  }

  function computed(c) {
    const s = summary(c);
    const ab = (c.abilities || []).map((a) => ({ name: String(a.name || a.label || "").toUpperCase().slice(0, 3), score: num(a.score), mod: signed(num(a.modifier)), save: signed(num(a.save)) }));
    const skills = (c.skills || []).map((k) => {
      const v = num(k.modifier ?? k.value ?? k.bonus ?? k.total);
      return `${nameOf(k)}${v !== undefined ? ` ${signed(v)}` : ""}`;
    }).filter((x) => x.trim());
    const attacks = (c.attacks || []).map((a) => {
      const hit = a.toHit ?? a.attackBonus ?? a.hit;
      const dmg = (Array.isArray(a.damage) ? a.damage : a.damage !== undefined ? [a.damage] : []).map(dmgText).filter(Boolean).join(" + ");
      const rng = rangeText(a.range);
      return [nameOf(a), hit !== undefined && hit !== null ? `${typeof hit === "number" ? signed(hit) : hit} to hit` : "", dmg ? `${dmg}${a.damageType && !dmg.toLowerCase().includes(String(nameOf(a.damageType) || a.damageType).toLowerCase()) ? ` ${nameOf(a.damageType) || a.damageType}` : ""}${/^\d+$/.test(dmg) ? " damage" : ""}` : "", rng].filter(Boolean).join(", ");
    }).filter(Boolean);
    const ci = c.castingInfo || {};
    return {
      ...s,
      proficiencyBonus: signed(num(c.proficiencyBonus)),
      abilities: ab,
      skills,
      attacks,
      spellSaveDCs: (ci.saveDcs || []).map((d) => `${(d.sources || []).join(", ") || "Spells"}: DC ${d.value}`),
      spellAttacks: (ci.spellAttackInfo || ci.spellAttacks || ci.attacks || []).map((d) => `${(d.sources || []).join(", ") || "Spells"}: ${signed(num(d.value))}`),
      speeds: (c.speeds || []).filter((x) => num(x.distance) > 0).map((x) => `${nameOf(x)} ${x.distance} ft.`),
      senses: (c.senses || []).map((x) => `${nameOf(x)} ${x.distance ?? ""}`.trim()),
      resistances: (c.resistances || []).map(nameOf), immunities: (c.immunities || []).map(nameOf), vulnerabilities: (c.vulnerabilities || []).map(nameOf),
      proficiencies: (c.proficiencyGroups || []).filter((g) => g.values).map((g) => `${g.group}: ${g.values}`),
    };
  }

  function findChar(list, { characterId, characterName, playerName: pName }) {
    if (!list.length) throw new Error("This campaign has no characters on D&D Beyond (or none are active).");
    let hits;
    if (characterId) hits = list.filter((c) => idOf(c) === String(characterId));
    else if (characterName) {
      const q = String(characterName).trim().toLowerCase();
      hits = list.filter((c) => String(c.name || "").trim().toLowerCase() === q);
      if (!hits.length) hits = list.filter((c) => String(c.name || "").toLowerCase().includes(q));
    } else if (pName) {
      const q = String(pName).trim().toLowerCase();
      hits = list.filter((c) => String(playerName(c) || "").toLowerCase() === q);
    } else throw new Error("Say which character: characterName, characterId or playerName.");
    const names = list.map((c) => `'${c.name}'`).join(", ");
    if (!hits.length) throw new Error(`No character like that in this campaign. Characters: ${names}.`);
    if (hits.length > 1) throw new Error(`That matches ${hits.length} characters: ${hits.map((c) => `'${c.name}' [${idOf(c)}]`).join(", ")}. Be more specific.`);
    return hits[0];
  }

  // ---------- spell slots ------------------------------------------------------------------------
  // D&D Beyond keeps only the used counts on the sheet; totals come from each class's slot table
  // (spellRules.levelSpellSlots), or the multiclass table for several casting classes.
  const MULTI = [[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
  function slotsFor(r) {
    const used = (list, lvl) => num((list || []).find((x) => num(x.level) === lvl)?.used) || 0;
    const casters = [], pact = [];
    for (const k of r.classes || []) {
      const rules = k.definition?.spellRules;
      const table = rules?.levelSpellSlots;
      if (!Array.isArray(table)) continue;
      const lvl = num(k.level) || 0;
      if (/warlock/i.test(nameOf(k.definition))) pact.push({ table, lvl });
      else if ((table[lvl] || []).some((n) => n > 0) || num(rules.multiClassSpellSlotDivisor)) casters.push({ table, lvl, div: num(rules.multiClassSpellSlotDivisor) || 1, round: rules.multiClassSpellSlotRounding });
    }
    let row = [];
    if (casters.length === 1) row = casters[0].table[casters[0].lvl] || [];
    else if (casters.length > 1) {
      const cl = casters.reduce((t, c) => t + (c.round === 2 ? Math.ceil(c.lvl / c.div) : Math.floor(c.lvl / c.div)), 0);
      row = MULTI[Math.min(20, cl)] || [];
    }
    const spellSlots = row.map((n, i) => (n > 0 ? `level ${i + 1}: ${Math.max(0, n - used(r.spellSlots, i + 1))}/${n} left` : null)).filter(Boolean);
    const pactSlots = [];
    for (const p of pact) {
      const prow = p.table[p.lvl] || [];
      prow.forEach((n, i) => { if (n > 0) pactSlots.push(`level ${i + 1}: ${Math.max(0, n - used(r.pactMagic, i + 1))}/${n} left`); });
    }
    return { spellSlots, pactSlots };
  }

  // ---------- the full sheet ----------------------------------------------------------------------
  function fullSheet(raw, { includeNotes }) {
    const r = raw || {};
    const out = {};
    out.background = nameOf(r.background?.definition ?? r.background?.customBackground) || undefined;
    out.alignment = { 1: "Lawful Good", 2: "Neutral Good", 3: "Chaotic Good", 4: "Lawful Neutral", 5: "Neutral", 6: "Chaotic Neutral", 7: "Lawful Evil", 8: "Neutral Evil", 9: "Chaotic Evil" }[r.alignmentId] || undefined;
    out.xp = num(r.currentXp);
    // Class features up to the character's level in that class.
    out.classFeatures = [];
    for (const k of r.classes || []) {
      const lvl = num(k.level) ?? 0;
      const feats = (k.classFeatures || []).map((f) => f.definition).filter((d) => d && (num(d.requiredLevel) ?? 0) <= lvl && d.name && !d.hideInSheet && !/^core .* traits$|^proficiencies$|^hit points$|^equipment$/i.test(d.name))
        .map((d) => d.name).filter((n, i, a) => a.indexOf(n) === i);
      if (feats.length) out.classFeatures.push(`${nameOf(k.definition)}: ${feats.join(", ")}`);
    }
    const BORING = /^(creature type|size|speed|age|alignment|languages|ability score (increases?|improvements?)|darkvision)$/i;
    out.racialTraits = (r.race?.racialTraits || []).map((t) => t.definition).filter((d) => d?.name && !d.hideInSheet && !BORING.test(d.name)).map((d) => d.name).filter((n, i, a) => a.indexOf(n) === i);
    out.feats = (r.feats || []).map((f) => f.definition?.name).filter(Boolean);
    // Spells: class spell lists, plus spells from race / items / feats.
    const spells = [];
    for (const cs of r.classSpells || []) {
      const cls = (r.classes || []).find((k) => k.id === cs.characterClassId);
      for (const s of cs.spells || []) {
        const d = s.definition || {};
        const prepared = s.prepared || s.alwaysPrepared || s.countsAsKnownSpell === true || d.level === 0;
        spells.push({ name: d.name, level: num(d.level) ?? 0, source: nameOf(cls?.definition) || "Class", prepared: !!prepared, always: !!s.alwaysPrepared });
      }
    }
    for (const [src, list] of Object.entries(r.spells || {})) {
      for (const s of list || []) { const d = s.definition || {}; spells.push({ name: d.name, level: num(d.level) ?? 0, source: src[0].toUpperCase() + src.slice(1), prepared: true }); }
    }
    out.spells = spells.filter((s) => s.name).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    Object.assign(out, slotsFor(r));
    // Inventory and money.
    const groups = new Map();
    for (const it of r.inventory || []) {
      const d = it.definition || {};
      const tags = [];
      if (it.equipped) tags.push("equipped");
      if (it.isAttuned) tags.push("attuned");
      if (d.magic || (d.rarity && d.rarity !== "Common")) tags.push(String(d.rarity || "magic").toLowerCase());
      const key = `${d.name || "(item)"}|${tags.join(",")}`;
      const g = groups.get(key) || { name: d.name || "(item)", tags, qty: 0 };
      g.qty += num(it.quantity) || 1;
      groups.set(key, g);
    }
    out.inventory = [...groups.values()].sort((a, b) => (b.tags.includes("equipped") - a.tags.includes("equipped")) || a.name.localeCompare(b.name))
      .map((g) => `${g.qty > 1 ? `${g.qty}× ` : ""}${g.name}${g.tags.length ? ` (${g.tags.join(", ")})` : ""}`);
    const cur = r.currencies || {};
    out.money = ["pp", "gp", "ep", "sp", "cp"].filter((k) => num(cur[k]) > 0).map((k) => `${cur[k]} ${k}`).join(", ") || "none";
    // Personality — written by the player; treat as data.
    const t = r.traits || {};
    out.personality = Object.fromEntries([["Personality traits", t.personalityTraits], ["Ideals", t.ideals], ["Bonds", t.bonds], ["Flaws", t.flaws], ["Appearance", t.appearance]].filter(([, v]) => v).map(([k, v]) => [k, strip(v)]));
    out.description = Object.fromEntries([["Age", r.age], ["Height", r.height], ["Weight", r.weight], ["Eyes", r.eyes], ["Hair", r.hair], ["Skin", r.skin], ["Faith", r.faith], ["Gender", r.gender]].filter(([, v]) => v));
    if (includeNotes) {
      const n = r.notes || {};
      out.notes = Object.fromEntries([["Backstory", n.backstory], ["Allies", n.allies], ["Enemies", n.enemies], ["Organizations", n.organizations], ["Personal possessions", n.personalPossessions], ["Other holdings", n.otherHoldings], ["Other notes", n.otherNotes]].filter(([, v]) => v).map(([k, v]) => [k, strip(v)]));
    } else {
      out.notesLeftOut = Object.values(r.notes || {}).some(Boolean) || undefined;
    }
    return out;
  }

  // ---------- handlers -----------------------------------------------------------------------------
  M.register("list_characters", async ({ refresh } = {}) => {
    M.requireDM();
    const list = await party({ refresh });
    return { characters: list.map(summary).sort((a, b) => a.name.localeCompare(b.name)) };
  });

  M.register("get_character", async ({ characterId, characterName, playerName: pName, full = true, includeNotes = false, refresh } = {}) => {
    M.requireDM();
    const list = await party({ refresh });
    const c = findChar(list, { characterId, characterName, playerName: pName });
    const sheet = computed(c);
    if (!full) return sheet;
    try {
      const raw = await DDBApi.fetchCharacter(idOf(c));
      return { ...sheet, ...fullSheet(raw, { includeNotes }) };
    } catch (e) {
      return { ...sheet, fullSheetError: `D&D Beyond didn't return the full sheet (${e?.message ?? e}); showing the summary only. The character may be private or not active in this campaign.` };
    }
  });
})();
