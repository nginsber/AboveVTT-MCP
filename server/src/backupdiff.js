// Compares two AboveVTT backups (the data inside .abovevtt files) and says what changed, area by area.
// Pure functions: no files, no network. Used by compare_backups.

const SCENE_LABELS = {
  title: "title", player_map: "player map link", player_map_is_video: "player map is a video", dm_map_usable: "use DM map",
  dm_map: "DM map link", dm_map_is_video: "DM map is a video", darkness_filter: "darkness opacity", visionTrail: "explored vision trail",
  disableSceneVision: "token vision/light disabled", snap: "snap to grid", alphaNumGrid: "alphanumeric grid labels", grid: "draw grid",
  grid_color: "grid colour", gridOver: "grid layer", grid_line_width: "grid line width", playlist: "scene playlist", weather: "weather",
  weatherIntensity: "weather intensity", initial_x: "initial position", initial_y: "initial position", initial_zoom: "initial zoom",
  hpps: "grid size", vpps: "grid size", offsetx: "grid offset", offsety: "grid offset", fpsq: "units per square", upsq: "distance unit",
  scale_factor: "scale factor", gridType: "grid type", reveals: "fog of war", drawings: "drawings and walls",
  width: "map size", height: "map size", parentId: "folder", folderPath: "folder", order: "order",
};
// Not settings: ids, timestamps and the configure dialog's helper inputs (they mirror real fields).
const SCENE_IGNORE = new Set(["id", "tokens", "itemType", "map", "uuid", "dm_map_usable_prev", "data_version", "lastModified", "updated", "timestamp",
  "scale_check", "gridStrokeNumberInput", "darkness_filter_number"]);
// What AboveVTT's configure dialog writes into a field that was empty: the same as having no value.
const SCENE_DEFAULTS = { grid_color: "rgba(0, 0, 0, 0.5)", grid_line_width: "0.5", weatherIntensity: "120" };

const TOKEN_LABELS = {
  name: "name", imgsrc: "image", alternativeImages: "images", hitPointInfo: "hit points", armorClass: "AC", ac: "AC", hp: "hit points",
  max_hp: "max hit points", temp_hp: "temp hit points", conditions: "conditions", custom_conditions: "custom conditions",
  aura1: "aura 1", aura2: "aura 2", auraVisible: "aura visibility", size: "size", tokenSize: "size", gridSquares: "size",
  hidden: "hidden", color: "border colour", tokenStyleSelect: "token style", vision: "vision", light1: "light", light2: "light",
  statBlock: "stat block", notes: "note", left: "position", top: "position", rotation: "rotation", locked: "locked", restrictPlayerMove: "player movement",
};
const POSITION = new Set(["left", "top", "zindexdiff", "rotation"]);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const EMPTY = Symbol("empty");
/** One spelling per value: 29 and "29" are the same, as are 1/"1"/true and 0/"0"/false; missing, null, "", [] and {} are empty. */
function norm(v) {
  if (v === undefined || v === null || v === "") return EMPTY;
  if (Array.isArray(v) && !v.length) return EMPTY;
  if (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length) return EMPTY;
  // Vision, light and aura settings are { feet, color }: 0 feet is "off", the same as not set.
  if (typeof v === "object" && !Array.isArray(v) && "feet" in v && (v.feet === undefined || v.feet === null || v.feet === "" || Number(v.feet) === 0)) return EMPTY;
  if (v === true || v === "true") return "1";
  if (v === false || v === "false") return "0";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return /^-?\d+(\.\d+)?$/.test(v.trim()) ? String(Number(v)) : v;
  return JSON.stringify(v);
}
/** True when a saved field didn't really change: same value in another spelling, or empty vs a default/blank value. */
function sameSetting(a, b, def) {
  const x = norm(a), y = norm(b);
  if (x === y) return true;
  const blank = (v) => v === EMPTY || v === "0" || (def !== undefined && v === norm(def));
  return (x === EMPTY && blank(y)) || (y === EMPTY && blank(x));
}
const byId = (list, key = (x) => x?.id) => {
  const m = new Map();
  for (const x of list || []) { const k = key(x); if (k !== undefined && k !== null && k !== "") m.set(String(k), x); }
  return m;
};
/** Keys whose values differ, as labels (several keys can share one label, e.g. grid size). */
function changedLabels(a = {}, b = {}, labels, ignore = new Set(), defaults = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = new Set();
  for (const k of keys) if (!ignore.has(k) && !sameSetting(a?.[k], b?.[k], defaults[k])) out.add(labels[k] || k);
  return [...out];
}

export function plainText(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/**
 * HTML in one canonical form: attributes in each tag sorted, whitespace between tags collapsed.
 * AboveVTT re-saves stat-block notes with their attributes in a different order (`id class style` ↔ `style class id`).
 */
export function canonicalHtml(html) {
  return String(html || "")
    .replace(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g, (m, tag, attrs, self) => {
      const list = [...attrs.matchAll(/([^\s=>\/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)].map((x) => {
        const v = x[2] === undefined ? "" : x[2].replace(/^['"]|['"]$/g, "");
        return `${x[1].toLowerCase()}="${v}"`;
      }).sort();
      return `<${tag.toLowerCase()}${list.length ? " " + list.join(" ") : ""}${self ? " /" : ""}>`;
    })
    .replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

/** The part of the text that changed: «before» → «after», trimmed to `max` characters each. */
export function textChange(before, after, max = 80) {
  const a = plainText(before), b = plainText(after);
  if (a === b) return null;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const cut = (s) => {
    const t = s.replace(/\n/g, " ⏎ ");
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };
  const lead = i > 0 ? "…" : "", tail = j > 0 ? "…" : "";
  const removed = a.slice(i, a.length - j), added = b.slice(i, b.length - j);
  return {
    before: `${lead}${cut(removed)}${tail}`,
    after: `${lead}${cut(added)}${tail}`,
    removed: removed.trim() ? cut(removed.trim()) : "", added: added.trim() ? cut(added.trim()) : "",
    sizeBefore: a.length, sizeAfter: b.length,
  };
}

// ---------- scenes and scene folders ----------
function scenePaths(scenes) {
  const m = byId(scenes);
  return (s) => {
    const names = []; const seen = new Set(); let cur = s;
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); names.unshift(cur.title || "(untitled)"); cur = m.get(String(cur.parentId)); }
    return names.join(" / ");
  };
}

function tokenName(t) { return t?.name || "(unnamed token)"; }

function diffSceneTokens(a = {}, b = {}) {
  const A = byId(Object.entries(a || {}).map(([k, t]) => ({ ...t, id: t?.id ?? k })));
  const B = byId(Object.entries(b || {}).map(([k, t]) => ({ ...t, id: t?.id ?? k })));
  const added = [...B.keys()].filter((k) => !A.has(k)).map((k) => tokenName(B.get(k)));
  const removed = [...A.keys()].filter((k) => !B.has(k)).map((k) => tokenName(A.get(k)));
  const changed = []; let moved = 0;
  for (const [k, ta] of A) {
    const tb = B.get(k);
    if (!tb || same(ta, tb)) continue;
    const keys = changedLabels(ta, tb, TOKEN_LABELS, POSITION);
    if (keys.length) { changed.push({ name: tokenName(tb), what: keys }); continue; }
    if ([...POSITION].some((k) => !sameSetting(ta[k], tb[k]))) moved++;
  }
  return { added, removed, changed, moved };
}

function diffScenes(A, B) {
  const folderOf = (s) => s?.itemType === "folder";
  const pa = scenePaths(A), pb = scenePaths(B);
  const mA = byId(A), mB = byId(B);
  const out = { scenesAdded: [], scenesRemoved: [], scenesChanged: [], foldersAdded: [], foldersRemoved: [], foldersChanged: [] };
  for (const [id, b] of mB) {
    const a = mA.get(id);
    const isF = folderOf(b);
    if (!a) { (isF ? out.foldersAdded : out.scenesAdded).push(pb(b)); continue; }
    const notes = [];
    if ((a.title || "") !== (b.title || "")) notes.push(`renamed from '${a.title || "(untitled)"}'`);
    if (String(a.parentId || "") !== String(b.parentId || "")) {
      const from = pa(a).split(" / ").slice(0, -1).join(" / ") || "(top level)";
      notes.push(`moved from '${from}'`);
    }
    if (isF) {
      const other = changedLabels(a, b, { color: "colour" }, new Set([...SCENE_IGNORE, "title", "parentId"]));
      if (other.length) notes.push(`changed: ${other.join(", ")}`);
      if (notes.length) out.foldersChanged.push({ path: pb(b), notes });
      continue;
    }
    const fields = changedLabels(a, b, SCENE_LABELS, new Set([...SCENE_IGNORE, "title", "parentId"]), SCENE_DEFAULTS);
    if (fields.length) notes.push(`changed: ${fields.join(", ")}`);
    const t = diffSceneTokens(a.tokens, b.tokens);
    const tl = [];
    if (t.added.length) tl.push(`${t.added.length} added (${list(t.added)})`);
    if (t.removed.length) tl.push(`${t.removed.length} removed (${list(t.removed)})`);
    if (t.changed.length) tl.push(`${t.changed.length} changed (${t.changed.slice(0, 6).map((c) => `${c.name}: ${c.what.join(", ")}`).join("; ")}${t.changed.length > 6 ? "; …" : ""})`);
    if (t.moved) tl.push(`${t.moved} only moved on the map`);
    if (tl.length) notes.push(`tokens: ${tl.join("; ")}`);
    if (notes.length) out.scenesChanged.push({ path: pb(b), notes });
  }
  for (const [id, a] of mA) if (!mB.has(id)) (folderOf(a) ? out.foldersRemoved : out.scenesRemoved).push(pa(a));
  return out;
}

// ---------- token customizations (My Tokens and token settings) ----------
function diffTokens(A = [], B = []) {
  const key = (t) => (t ? `${t.tokenType}|${t.id}` : undefined);
  const mA = byId(A, key), mB = byId(B, key);
  const nameOf = (t) => t?.tokenOptions?.name || t?.name || "(unnamed)";
  const pathIn = (m) => (t) => {
    if (t.rootId && t.rootId !== "myTokensFolder") return `${nameOf(t)} (${t.tokenType} settings)`;
    const names = []; const seen = new Set(); let cur = t;
    while (cur && cur.id !== "myTokensFolder" && !seen.has(cur.id)) {
      seen.add(cur.id); names.unshift(nameOf(cur));
      cur = [...m.values()].find((x) => x.id === cur.parentId && x.tokenType === "folder");
    }
    return ["My Tokens", ...names].join(" / ");
  };
  const pa = pathIn(mA), pb = pathIn(mB);
  const out = { added: [], removed: [], changed: [] };
  for (const [k, b] of mB) {
    if (b.id === "myTokensFolder") continue;
    const a = mA.get(k);
    const label = `${pb(b)}${b.tokenType === "folder" ? " (folder)" : ""}`;
    if (!a) { out.added.push(label); continue; }
    if (same(a, b)) continue;
    const notes = [];
    if (nameOf(a) !== nameOf(b)) notes.push(`renamed from '${nameOf(a)}'`);
    if (String(a.parentId || "") !== String(b.parentId || "")) notes.push(`moved from '${pa(a).split(" / ").slice(0, -1).join(" / ") || "(top level)"}'`);
    const fields = changedLabels(a.tokenOptions, b.tokenOptions, TOKEN_LABELS, new Set(["name"]));
    if (fields.length) notes.push(`changed: ${fields.join(", ")}`);
    if (notes.length) out.changed.push({ path: label, notes });
  }
  for (const [k, a] of mA) if (!mB.has(k) && a.id !== "myTokensFolder") out.removed.push(`${pa(a)}${a.tokenType === "folder" ? " (folder)" : ""}`);
  return out;
}

// ---------- journal ----------
function diffJournal(nA = {}, nB = {}, cA = [], cB = [], tokensA = [], tokensB = []) {
  // Stat-block notes have no title: name them after the token whose statBlock points at them.
  const owner = new Map();
  for (const t of [...(tokensA || []), ...(tokensB || [])]) {
    const sb = t?.tokenOptions?.statBlock;
    if (typeof sb === "string" && sb) owner.set(sb, t.tokenOptions?.name || t.id);
  }
  const out = { notesAdded: [], notesRemoved: [], notesChanged: [], foldersAdded: [], foldersRemoved: [], foldersChanged: [] };
  // note id → its folder, compared by folder id (so renaming a folder doesn't "move" its notes)
  const folderOfNote = (chapters) => {
    const m = new Map();
    for (const c of chapters || []) for (const n of c.notes || []) m.set(String(n), { id: c.id || c.title, title: c.title || "Untitled Folder" });
    return m;
  };
  const fa = folderOfNote(cA), fb = folderOfNote(cB);
  const titled = (n, id, f) => {
    const name = n?.title ? `'${n.title}'` : owner.has(id) ? `stat block of '${owner.get(id)}'` : "'(untitled)'";
    return `${name}${f.get(id) ? ` in '${f.get(id).title}'` : ""}`;
  };
  const folderId = (f, id) => f.get(id)?.id;
  const A = nA || {}, B = nB || {};
  for (const [id, b] of Object.entries(B)) {
    const a = A[id];
    if (!a) { out.notesAdded.push(titled(b, id, fb)); continue; }
    if (same(a, b) && folderId(fa, id) === folderId(fb, id)) continue;
    const notes = [];
    if ((a.title || "") !== (b.title || "")) notes.push(`renamed from '${a.title || "(untitled)"}'`);
    if (folderId(fa, id) !== folderId(fb, id)) notes.push(`moved from '${fa.get(id)?.title || "(no folder)"}'`);
    const tc = textChange(a.text, b.text);
    if (tc) {
      const size = `${tc.sizeBefore} → ${tc.sizeAfter} characters`;
      if (!tc.removed && tc.added) notes.push(`text added (${size}): «${tc.added}»`);
      else if (tc.removed && !tc.added) notes.push(`text removed (${size}): «${tc.removed}»`);
      else notes.push(`text edited (${size}): «${tc.before}» → «${tc.after}»`);
    }
    else if (canonicalHtml(a.text) !== canonicalHtml(b.text)) notes.push("formatting changed");
    if (!same(a.player, b.player)) notes.push(`sharing changed (${share(a.player)} → ${share(b.player)})`);
    const other = changedLabels(a, b, { statBlock: "stat block flag", ddbsource: "source" }, new Set(["title", "text", "player", "plain", "id"]));
    if (other.length) notes.push(`changed: ${other.join(", ")}`);
    if (notes.length) out.notesChanged.push({ title: titled(b, id, fb), notes });
  }
  for (const [id, a] of Object.entries(A)) if (!B[id]) out.notesRemoved.push(titled(a, id, fa));

  const key = (c) => c?.id || c?.title;
  const mA = byId(cA, key), mB = byId(cB, key);
  for (const [k, b] of mB) {
    const a = mA.get(k);
    if (!a) { out.foldersAdded.push(b.title || "Untitled Folder"); continue; }
    const notes = [];
    if ((a.title || "") !== (b.title || "")) notes.push(`renamed from '${a.title || "Untitled Folder"}'`);
    if (String(a.parentID || "") !== String(b.parentID || "")) notes.push("moved to another folder");
    if (!same(a.player, b.player) || !same(a.share, b.share)) notes.push("sharing changed");
    if (notes.length) out.foldersChanged.push({ title: b.title || "Untitled Folder", notes });
  }
  for (const [k, a] of mA) if (!mB.has(k)) out.foldersRemoved.push(a.title || "Untitled Folder");
  return out;
}
const share = (p) => (p === true ? "all players" : Array.isArray(p) ? (p.length ? p.join(", ") : "DM only") : p ? String(p) : "DM only");

// ---------- audio ----------
function diffAudio(a, b) {
  const lib = (d) => new Map((Array.isArray(d?.tracklibrary) ? d.tracklibrary : []).filter((e) => Array.isArray(e)).map(([id, t]) => [String(id), t || {}]));
  const A = lib(a), B = lib(b);
  const out = { tracksAdded: [], tracksRemoved: [], tracksChanged: [], playlistsAdded: [], playlistsRemoved: [], playlistsChanged: [] };
  for (const [id, t] of B) {
    const o = A.get(id);
    if (!o) { out.tracksAdded.push(t.name || "(unnamed)"); continue; }
    const notes = [];
    if ((o.name || "") !== (t.name || "")) notes.push(`renamed from '${o.name || "(unnamed)"}'`);
    if ((o.src || "") !== (t.src || "")) notes.push("link changed");
    if (!same([...(o.tags || [])].sort(), [...(t.tags || [])].sort())) notes.push(`tags ${(o.tags || []).join(", ") || "none"} → ${(t.tags || []).join(", ") || "none"}`);
    if (notes.length) out.tracksChanged.push({ name: t.name || "(unnamed)", notes });
  }
  for (const [id, t] of A) if (!B.has(id)) out.tracksRemoved.push(t.name || "(unnamed)");

  const pls = (d) => Object.entries(d?.mixerstate?.playlists || {}).filter(([id, p]) => id !== "selected" && p && typeof p === "object");
  const pA = new Map(pls(a)), pB = new Map(pls(b));
  // AboveVTT sometimes recreates a playlist (often "Default") with a new id: pair unmatched ones by name.
  for (const [idA, p] of [...pA]) {
    if (pB.has(idA)) continue;
    const match = [...pB].find(([idB, q]) => !pA.has(idB) && (q.name || "") === (p.name || ""));
    if (match) { pA.delete(idA); pA.set(match[0], p); }
  }
  const trackNames = (p) => Object.values(p?.channels || {}).filter((c) => c?.src).map((c) => c.name || "(unnamed)");
  for (const [id, p] of pB) {
    const o = pA.get(id);
    if (!o) { out.playlistsAdded.push(p.name || "(unnamed)"); continue; }
    const notes = [];
    if ((o.name || "") !== (p.name || "")) notes.push(`renamed from '${o.name || "(unnamed)"}'`);
    const ta = trackNames(o), tb = trackNames(p);
    const plus = tb.filter((n) => !ta.includes(n)), minus = ta.filter((n) => !tb.includes(n));
    if (plus.length) notes.push(`tracks added: ${list(plus)}`);
    if (minus.length) notes.push(`tracks removed: ${list(minus)}`);
    if (!plus.length && !minus.length && !same(o.channels, p.channels)) notes.push("track settings changed (volume, loop…)");
    if (notes.length) out.playlistsChanged.push({ name: p.name || "(unnamed)", notes });
  }
  for (const [id, p] of pA) if (!pB.has(id)) out.playlistsRemoved.push(p.name || "(unnamed)");
  return out;
}

const list = (names, n = 6) => `${names.slice(0, n).join(", ")}${names.length > n ? `, +${names.length - n} more` : ""}`;

export function counts(d) {
  const scenes = Array.isArray(d?.scenes) ? d.scenes.filter((s) => s && s.id) : [];
  return {
    scenes: scenes.filter((s) => s.itemType !== "folder").length,
    sceneFolders: scenes.filter((s) => s.itemType === "folder").length,
    tokenCustomizations: (d?.tokencustomizations || []).filter(Boolean).length,
    notes: Object.keys(d?.notes || {}).length,
    journalFolders: (d?.journalchapters || []).length,
    tracks: (d?.tracklibrary || []).length,
    playlists: Object.keys(d?.mixerstate?.playlists || {}).filter((k) => k !== "selected").length,
  };
}

/** Everything that changed going from backup `a` (older) to backup `b` (newer). */
export function diffBackups(a, b) {
  return {
    counts: { before: counts(a), after: counts(b) },
    scenes: diffScenes((a.scenes || []).filter((s) => s && s.id), (b.scenes || []).filter((s) => s && s.id)),
    tokens: diffTokens((a.tokencustomizations || []).filter(Boolean), (b.tokencustomizations || []).filter(Boolean)),
    journal: diffJournal(a.notes, b.notes, a.journalchapters, b.journalchapters, a.tokencustomizations, b.tokencustomizations),
    audio: diffAudio(a, b),
  };
}
