// Step 10: journal notes and note folders ("chapters"), using AboveVTT's own journal (window.JOURNAL):
// notes/chapters data, persist(), note_visibility(), share_chapter(), build_journal(), and the same
// 'custom/myVTT/note' / 'custom/myVTT/JournalChapters' messages the journal sends to players.
/* global $, uuid, basic_sanitize_html */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const J = () => {
    const j = window.JOURNAL;
    if (!j || typeof j.persist !== "function" || !j.notes || !Array.isArray(j.chapters)) {
      throw new Error("AboveVTT's journal isn't loaded yet. Open the Journal tab once, or wait for AboveVTT to finish loading.");
    }
    return j;
  };
  const newId = () => (typeof uuid === "function" ? uuid() : crypto.randomUUID());
  const sanitize = (html) => (typeof basic_sanitize_html === "function" ? basic_sanitize_html(html) : html);
  const MAX_NOTE_CHARS = 100000; // AboveVTT messages are capped at 128,000 characters

  function ensureChapterIds() {
    // Older AboveVTT folders can lack an id; give them one so they can be referred to.
    let changed = false;
    for (const c of J().chapters) if (!c.id) { c.id = newId(); changed = true; }
    if (changed) J().persist();
  }

  // ---------- visibility -----------------------------------------------------------
  const players = () => (Array.isArray(window.playerUsers) ? window.playerUsers : []);
  const playerNames = () => [...new Set(players().map((p) => p.userName))];
  function visibilityLabel(v) {
    if (v === true) return "all players";
    if (Array.isArray(v) && v.length) {
      const names = [...new Set(v.map((id) => players().find((p) => String(p.userId) === String(id))?.userName ?? `player ${id}`))];
      return `only ${names.join(", ")}`;
    }
    return "DM only";
  }
  /** "dm" | "all" | ["Player Name", …] → AboveVTT's false | true | [userId, …] */
  function parseVisibility(v) {
    if (v === undefined) return undefined;
    if (v === true || v === "all" || v === "players" || v === "allPlayers") return true;
    if (v === false || v === "dm" || v === "dmOnly" || v === "private") return false;
    const list = Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.length) return false;
    const ids = [];
    for (const name of list) {
      const hits = players().filter((u) => String(u.userId) === String(name) || String(u.userName).toLowerCase() === String(name).toLowerCase());
      if (!hits.length) {
        const known = playerNames().join(", ") || "none connected to this campaign";
        throw new Error(`No player named '${name}'. Players: ${known}.`);
      }
      for (const h of hits) if (!ids.includes(String(h.userId))) ids.push(String(h.userId));
    }
    return ids;
  }

  // ---------- structure ------------------------------------------------------------
  const chapterOf = (noteId) => J().chapters.find((c) => Array.isArray(c.notes) && c.notes.includes(noteId));
  function chapterPath(c) {
    const names = [];
    const seen = new Set();
    while (c && !seen.has(c.id)) { seen.add(c.id); names.unshift(c.title || "Untitled Folder"); c = J().chapters.find((x) => x.id === c.parentID); }
    return names.join(" / ");
  }
  function sharedByFolder(c) {
    const seen = new Set();
    while (c && !seen.has(c.id)) {
      seen.add(c.id);
      if (c.shareWithPlayer) return c;
      c = J().chapters.find((x) => x.id === c.parentID);
    }
    return null;
  }
  function kindOf(id, note) {
    if (note?.statBlock === true) return "statblock";
    if (chapterOf(id)) return "journal";
    if ((window.ScenesHandler?.scenes || []).some((s) => s.id === id)) return "scene";
    if (window.TOKEN_OBJECTS && id in window.TOKEN_OBJECTS) return "token";
    return "other";
  }
  function plainOf(note) {
    if (note.plain) return String(note.plain);
    const div = document.createElement("div");
    div.innerHTML = note.text || "";
    return div.textContent || "";
  }
  function noteSummary(id) {
    const n = J().notes[id];
    const c = chapterOf(id);
    const shared = sharedByFolder(c);
    return {
      id, title: n.title || "(untitled)", kind: kindOf(id, n),
      folder: c ? chapterPath(c) : null, folderId: c?.id ?? null,
      visibility: n.statBlock === true ? "stat block (used by creature tokens)" : visibilityLabel(n.player),
      sharedThroughFolder: shared ? chapterPath(shared) : undefined,
      fromDDB: n.ddbsource ? true : undefined,
      length: plainOf(n).length,
    };
  }

  function findNote({ noteId, noteTitle }) {
    const notes = J().notes;
    if (noteId) {
      if (!notes[noteId]) throw new Error(`No note with id '${noteId}'. Use list_notes to find ids.`);
      return noteId;
    }
    if (noteTitle) {
      const q = String(noteTitle).trim().toLowerCase();
      const hits = Object.keys(notes).filter((id) => String(notes[id].title || "").trim().toLowerCase() === q);
      if (!hits.length) throw new Error(`No note titled '${noteTitle}'. Use list_notes (with search) to find it.`);
      if (hits.length > 1) throw new Error(`${hits.length} notes are titled '${noteTitle}': ` + hits.map((h) => `${noteSummary(h).folder ?? noteSummary(h).kind} [${h}]`).join("; ") + ". Use noteId.");
      return hits[0];
    }
    throw new Error("Say which note: noteId or noteTitle.");
  }

  function findChapter({ folderId, folderTitle }, { required = true } = {}) {
    ensureChapterIds();
    const chapters = J().chapters;
    if (folderId) {
      const c = chapters.find((x) => x.id === folderId);
      if (!c) throw new Error(`No journal folder with id '${folderId}'. Use list_notes to see folders.`);
      return c;
    }
    if (folderTitle) {
      const q = String(folderTitle).trim().toLowerCase();
      const hits = chapters.filter((x) => String(x.title || "").trim().toLowerCase() === q);
      if (!hits.length) throw new Error(`No journal folder titled '${folderTitle}'. Create it with create_note_folder, or use list_notes to see folders.`);
      if (hits.length > 1) throw new Error(`${hits.length} journal folders are titled '${folderTitle}': ${hits.map((h) => `${chapterPath(h)} [${h.id}]`).join("; ")}. Use folderId.`);
      return hits[0];
    }
    if (required) throw new Error("Say which journal folder (folderId or folderTitle). Notes in AboveVTT's journal live in folders.");
    return null;
  }

  // ---------- content ---------------------------------------------------------------
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  /** Plain text → paragraphs; a few markdown-ish touches (# headings, - bullets, **bold**, *italic*). */
  function textToHtml(text) {
    const blocks = String(text).replace(/\r\n/g, "\n").split(/\n{2,}/);
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
    return blocks.map((b) => {
      const lines = b.split("\n");
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      // A "# Heading" line (at the start of a block) becomes a heading; the rest of the block a paragraph.
      const h = lines[0].match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        const lvl = Math.min(h[1].length + 1, 5);
        const rest = lines.slice(1);
        return `<h${lvl}>${inline(h[2])}</h${lvl}>` + (rest.length ? `<p>${rest.map(inline).join("<br>")}</p>` : "");
      }
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    }).join("");
  }
  function toHtml(content, format = "text") {
    if (content === undefined || content === null) return "";
    const html = format === "html" ? String(content) : textToHtml(content);
    const clean = sanitize(html);
    if (clean.length > MAX_NOTE_CHARS) throw new Error(`That note would be ${clean.length.toLocaleString()} characters; AboveVTT can only send notes up to about ${MAX_NOTE_CHARS.toLocaleString()} to players. Split it into several notes.`);
    return clean;
  }
  /**
   * Find-and-replace inside a note's stored HTML (review item 6). Every pair must match exactly once in the
   * note as it is now, or, with all: true ("replace all"), at least once; nothing changes unless they all do. With format "text" (default), `find` and `replace`
   * are plain text: they only match the note's visible text (never tag names or attributes), allow for how
   * AboveVTT's editor stores &, <, >, quotes and non-breaking spaces, and can't span formatting (e.g. half
   * bold). With format "html" they're matched against the HTML as is.
   * @returns {{ html: string, results: Array<{ find, replace, all, count, places: Array<{ before, after }> }> }}
   */
  function findReplace(html, pairs, format = "text") {
    if (!Array.isArray(pairs) || !pairs.length) throw new Error("replacements must be a list of { find, replace } pairs.");
    const plainNow = htmlToPlain(html);
    const text = format !== "html";
    // HTML positions that are inside a <tag …>, where plain-text matches mustn't land
    const inTag = (pos) => html.lastIndexOf("<", pos) > html.lastIndexOf(">", pos - 1);
    const pattern = (find) => {
      if (!text) return new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const piece = { "&": "(?:&amp;|&#38;)", "<": "(?:&lt;|&#60;)", ">": "(?:&gt;|&#62;)", '"': '(?:"|&quot;|&#34;)', "'": "(?:'|&#39;|&#x27;|&apos;)",
        " ": "(?: |&nbsp;|&#160;|\u00a0)", "\u00a0": "(?: |&nbsp;|&#160;|\u00a0)" };
      return new RegExp([...find].map((ch) => piece[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(""), "g");
    };
    const found = pairs.map((p, i) => {
      const find = String(p?.find ?? "");
      if (!find) throw new Error(`Replacement ${i + 1} has an empty 'find'.`);
      if (p?.replace === undefined || p?.replace === null) throw new Error(`Replacement ${i + 1} ('${find}') needs a 'replace' (use "" to remove the text).`);
      const re = pattern(find);
      const hits = [];
      for (let m; (m = re.exec(html)); ) { if (!text || !inTag(m.index)) hits.push({ start: m.index, end: m.index + m[0].length }); if (!m[0].length) re.lastIndex++; }
      return { i, find, replace: String(p.replace), all: p.all === true, hits };
    });
    const problems = [];
    for (const f of found) {
      if (f.hits.length === 1 || (f.all && f.hits.length > 1)) continue;
      if (f.hits.length > 1) { problems.push(`'${f.find}' appears ${f.hits.length} times; include more of the surrounding text so it matches only once, or use replace all.`); continue; }
      problems.push(text && plainNow.includes(f.find)
        ? `'${f.find}' is in the note, but split by formatting (for example part of it is bold, a link or on another line), so it can't be replaced as plain text. Use a shorter piece, or format "html".`
        : `'${f.find}' isn't in the note.`);
    }
    // every place that will change, in note order
    const places = found.filter((f) => f.hits.length === 1 || (f.all && f.hits.length > 1))
      .flatMap((f) => f.hits.map((h) => ({ f, start: h.start, end: h.end })))
      .sort((x, y) => x.start - y.start);
    for (let k = 1; k < places.length; k++) {
      const p0 = places[k - 1], p1 = places[k];
      if (p1.start < p0.end && !problems.some((m) => m.includes("overlap"))) {
        problems.push(p0.f === p1.f ? `'${p0.f.find}' overlaps itself in the note.` : `'${p0.f.find}' and '${p1.f.find}' overlap in the note; combine them into one replacement.`);
      }
    }
    if (problems.length) throw new Error("Nothing was changed. " + problems.join(" "));
    // apply from the end so earlier positions stay valid; note where each lands in the new HTML
    let out = html;
    const pieceOf = (f) => (text ? esc(f.replace).replace(/\r?\n/g, "<br>") : f.replace);
    for (const pl of [...places].reverse()) out = out.slice(0, pl.start) + pieceOf(pl.f) + out.slice(pl.end);
    let shift = 0;
    for (const pl of places) {
      const len = pieceOf(pl.f).length;
      pl.newStart = pl.start + shift; pl.newEnd = pl.newStart + len;
      shift += len - (pl.end - pl.start);
    }
    // The changed text in «», with ~40 characters either side (widened so no tag is cut in half), as plain text.
    const flat = (h) => {
      const d = document.createElement("div");
      d.innerHTML = h.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|h[1-6]|li|div|tr|ul|ol|table)>/gi, "</$1> ");
      return (d.textContent || "").replace(/\s+/g, " ");
    };
    const ctx = (s, start, end) => {
      let a = Math.max(0, start - 40), b = Math.min(s.length, end + 40);
      const lt = s.lastIndexOf("<", a), gt = s.lastIndexOf(">", a);
      if (lt > gt && lt < start) a = lt;
      const lt2 = s.lastIndexOf("<", b), gt2 = s.lastIndexOf(">", b);
      if (lt2 > gt2 && lt2 >= end) { const close = s.indexOf(">", lt2); b = close < 0 ? lt2 : close + 1; }
      const left = flat(s.slice(a, start)).replace(/^\s+/, ""), right = flat(s.slice(end, b)).replace(/\s+$/, "");
      return (a > 0 ? "…" : "") + left + "«" + flat(s.slice(start, end)) + "»" + right + (b < s.length ? "…" : "");
    };
    const results = found.map((f) => {
      const mine = places.filter((pl) => pl.f === f).map((pl) => ({
        before: ctx(html, pl.start, pl.end), after: ctx(out, pl.newStart, pl.newEnd),
      }));
      return { find: f.find, replace: f.replace, all: f.all, count: mine.length, places: mine, before: mine[0].before, after: mine[0].after };
    });
    return { html: text ? out : sanitize(out), results };
  }

  // Plain-text copy (AboveVTT uses it for search): keep a line break between blocks and list items.
  const htmlToPlain = (html) => {
    const d = document.createElement("div");
    d.innerHTML = String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h[1-6]|li|div|tr|ul|ol|table)>/gi, "</$1>\n");
    return (d.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  };

  // Shared with step 11 (stat blocks).
  M.textToHtml = textToHtml;
  M.sanitizeHtml = sanitize;
  M.htmlToPlain = htmlToPlain;
  // Shared with step 12 (token notes).
  M.noteToHtml = toHtml;
  M.parseVisibility = parseVisibility;
  M.visibilityLabel = visibilityLabel;

  // ---------- saving / syncing like the journal does -------------------------------------
  function sendChapters() { window.MB?.sendMessage?.("custom/myVTT/JournalChapters", { chapters: J().chapters }); }
  function redraw() { try { J().build_journal?.(); } catch (e) { console.warn("[AVTT MCP] journal redraw failed", e); } }
  function sendNoteIfPlayersSee(id) {
    const n = J().notes[id];
    if (n.player || sharedByFolder(chapterOf(id))) window.MB?.sendMessage?.("custom/myVTT/note", { id, note: n });
  }
  function refuseIfOpenForEditing(id) {
    if ($(`textarea[data-note-id='${id}']`).length || $(`[data-note-id='${id}'] .tox-tinymce`).length) {
      throw new Error("That note is open for editing in AboveVTT. Save and close it first, so your edits and these don't overwrite each other.");
    }
  }

  // ---------- handlers ---------------------------------------------------------------
  M.register("list_notes", async ({ kind = "journal", folderId, folderTitle, search, includeText } = {}) => {
    M.requireDM();
    ensureChapterIds();
    const j = J();
    const q = search ? String(search).toLowerCase() : null;
    const matches = (id) => {
      if (!q) return true;
      const n = j.notes[id];
      return String(n.title || "").toLowerCase().includes(q) || (includeText !== false && plainOf(n).toLowerCase().includes(q));
    };

    if (kind === "journal") {
      const root = folderId || folderTitle ? findChapter({ folderId, folderTitle }) : null;
      const build = (c) => ({
        type: "folder", id: c.id, title: c.title || "Untitled Folder",
        sharedWithPlayers: c.shareWithPlayer ? visibilityLabel(c.shareWithPlayer) : undefined,
        notes: (c.notes || []).filter((id) => j.notes[id] && matches(id)).map(noteSummary),
        folders: j.chapters.filter((x) => x.parentID === c.id).map(build),
      });
      let tree = root ? [build(root)] : j.chapters.filter((c) => !c.parentID || !j.chapters.some((x) => x.id === c.parentID)).map(build);
      if (q) {
        const prune = (f) => { f.folders = f.folders.map(prune).filter(Boolean); return f.notes.length || f.folders.length ? f : null; };
        tree = tree.map(prune).filter(Boolean);
      }
      const counts = { folders: 0, notes: 0 };
      const count = (f) => { counts.folders++; counts.notes += f.notes.length; f.folders.forEach(count); };
      tree.forEach(count);
      return { kind, counts, tree, players: playerNames() };
    }

    const ids = Object.keys(j.notes).filter((id) => (kind === "all" || kindOf(id, j.notes[id]) === kind) && matches(id));
    return { kind, counts: { notes: ids.length }, notes: ids.map(noteSummary), players: playerNames() };
  });

  M.register("get_note", async ({ noteId, noteTitle, format = "text" } = {}) => {
    M.requireDM();
    const id = findNote({ noteId, noteTitle });
    const n = J().notes[id];
    return { ...noteSummary(id), content: format === "html" ? (n.text || "") : plainOf(n) };
  });

  M.register("create_note", async ({ title, folderId, folderTitle, content, format, visibility } = {}) => {
    M.requireDM();
    const t = String(title ?? "").trim();
    if (!t) throw new Error("A note needs a title.");
    const chapter = findChapter({ folderId, folderTitle });
    const player = parseVisibility(visibility) ?? false;
    const html = toHtml(content ?? "", format);
    const id = newId();
    J().notes[id] = { title: t, text: html, player, plain: htmlToPlain(html) };
    chapter.notes.push(id);
    J().persist();
    sendChapters();
    sendNoteIfPlayersSee(id);
    redraw();
    return { created: noteSummary(id) };
  });

  M.register("update_note", async ({ noteId, noteTitle, newTitle, content, format, mode = "replace", replacements, visibility, folderId, folderTitle, dryRun } = {}) => {
    M.requireDM();
    const id = findNote({ noteId, noteTitle });
    const n = J().notes[id];
    if (n.ddbsource && content !== undefined) throw new Error("This note comes from a D&D Beyond source book and can't be edited.");
    if (n.ddbsource && replacements !== undefined) throw new Error("This note comes from a D&D Beyond source book and can't be edited.");
    if (newTitle === undefined && content === undefined && replacements === undefined && visibility === undefined && !folderId && !folderTitle) {
      throw new Error("Nothing to change: pass newTitle, content, replacements, visibility and/or a folder to move it to.");
    }
    if (content !== undefined && replacements !== undefined) throw new Error("Pass either content or replacements, not both.");
    if (dryRun && (replacements === undefined || content !== undefined || newTitle !== undefined || visibility !== undefined || folderId || folderTitle)) {
      throw new Error("dryRun previews find-and-replace only: pass replacements and nothing else to change.");
    }
    // Check everything first.
    if (content !== undefined || replacements !== undefined) refuseIfOpenForEditing(id);
    const player = parseVisibility(visibility);
    const dest = folderId || folderTitle ? findChapter({ folderId, folderTitle }) : null;
    if (newTitle !== undefined && !String(newTitle).trim()) throw new Error("A note's title can't be empty.");
    if (!["replace", "append", "prepend"].includes(mode)) throw new Error("mode must be replace, append or prepend.");
    let html;
    if (content !== undefined) {
      const piece = toHtml(content, format);
      html = mode === "append" ? (n.text || "") + piece : mode === "prepend" ? piece + (n.text || "") : piece;
      if (html.length > MAX_NOTE_CHARS) throw new Error(`The note would become ${html.length.toLocaleString()} characters; AboveVTT can only send about ${MAX_NOTE_CHARS.toLocaleString()}. Split it.`);
    }
    let replaced;
    if (replacements !== undefined) {
      const r = findReplace(n.text || "", replacements, format);
      if (r.html.length > MAX_NOTE_CHARS) throw new Error(`The note would become ${r.html.length.toLocaleString()} characters; AboveVTT can only send about ${MAX_NOTE_CHARS.toLocaleString()}. Split it.`);
      replaced = r.results;
      if (dryRun) {
        return { dryRun: true, before: noteSummary(id), afterLength: htmlToPlain(r.html).length, wouldChange: r.html !== (n.text || ""), replaced };
      }
      if (r.html !== (n.text || "")) html = r.html;
    }

    const before = noteSummary(id);
    const changed = [];
    if (newTitle !== undefined && String(newTitle).trim() !== n.title) { n.title = String(newTitle).trim(); changed.push("title"); }
    if (html !== undefined) {
      n.text = html; n.plain = htmlToPlain(html);
      const places = replaced ? replaced.reduce((t, x) => t + x.count, 0) : 0;
      changed.push(replaced ? `content (${places} place${places === 1 ? "" : "s"} replaced)` : mode === "replace" ? "content" : `content (${mode}ed)`);
    }
    let movedChapters = false;
    if (dest) {
      const from = chapterOf(id);
      if (from?.id !== dest.id) {
        if (from) from.notes = from.notes.filter((x) => x !== id);
        dest.notes.push(id);
        movedChapters = true;
        changed.push("folder");
      }
    }
    if (player !== undefined && JSON.stringify(player) !== JSON.stringify(n.player ?? false)) {
      J().note_visibility(id, player); // AboveVTT's own: sets, sends to players, saves
      changed.push("visibility");
    }
    if (!changed.length) return { before, after: before, changed, ...(replaced ? { replaced } : {}) };
    J().persist();
    if (movedChapters) sendChapters();
    sendNoteIfPlayersSee(id);
    if (id in (window.TOKEN_OBJECTS || {})) { try { window.TOKEN_OBJECTS[id].place(); } catch { /* ignore */ } }
    redraw();
    return { before, after: noteSummary(id), changed, ...(replaced ? { replaced } : {}) };
  });

  M.register("delete_note", async ({ noteId, noteTitle, dryRun } = {}) => {
    M.requireDM();
    const id = findNote({ noteId, noteTitle });
    const s = noteSummary(id);
    if (s.kind === "statblock") throw new Error("That's a custom creature's stat block. It's handled with the creature tools (step 11).");
    if (dryRun) return { dryRun: true, wouldDelete: s };
    refuseIfOpenForEditing(id);
    const c = chapterOf(id);
    if (c) c.notes = c.notes.filter((x) => x !== id);
    delete J().notes[id];
    J().persist();
    sendChapters();
    if (id in (window.TOKEN_OBJECTS || {})) { try { window.TOKEN_OBJECTS[id].place(); } catch { /* ignore */ } }
    redraw();
    return { deleted: s };
  });

  M.register("create_note_folder", async ({ title, parentFolderId, parentFolderTitle, shareWithPlayers } = {}) => {
    M.requireDM();
    const t = String(title ?? "").trim();
    if (!t) throw new Error("A folder needs a name.");
    const parent = parentFolderId || parentFolderTitle ? findChapter({ folderId: parentFolderId, folderTitle: parentFolderTitle }) : null;
    const share = parseVisibility(shareWithPlayers) ?? false;
    const clash = J().chapters.find((c) => (c.parentID || null) === (parent?.id || null) && String(c.title || "").trim().toLowerCase() === t.toLowerCase());
    if (clash) throw new Error(`A journal folder named '${clash.title}' already exists there [${clash.id}].`);
    const chapter = { id: newId(), title: t, collapsed: false, notes: [] };
    if (parent) chapter.parentID = parent.id;
    J().chapters.push(chapter);
    J().persist();
    sendChapters();
    if (share) J().share_chapter(J().chapters.indexOf(chapter), share);
    redraw();
    return { created: { id: chapter.id, path: chapterPath(chapter), sharedWithPlayers: visibilityLabel(share) } };
  });

  M.register("update_note_folder", async ({ folderId, folderTitle, newTitle, shareWithPlayers, parentFolderId, parentFolderTitle, toTopLevel } = {}) => {
    M.requireDM();
    const c = findChapter({ folderId, folderTitle });
    const share = parseVisibility(shareWithPlayers);
    let newParent;
    if (toTopLevel) newParent = null;
    else if (parentFolderId || parentFolderTitle) {
      newParent = findChapter({ folderId: parentFolderId, folderTitle: parentFolderTitle });
      if (typeof J().isInvalidChapterParent === "function" ? J().isInvalidChapterParent(c.id, newParent.id) : newParent.id === c.id) {
        throw new Error("Can't move a folder into itself or one of its own subfolders.");
      }
    }
    if (newTitle !== undefined && !String(newTitle).trim()) throw new Error("A folder name can't be empty.");
    const before = { path: chapterPath(c), sharedWithPlayers: visibilityLabel(c.shareWithPlayer) };
    let changed = false;
    if (newTitle !== undefined && String(newTitle).trim() !== c.title) { c.title = String(newTitle).trim(); changed = true; }
    if (newParent !== undefined && (c.parentID || null) !== (newParent?.id || null)) {
      if (newParent) c.parentID = newParent.id; else delete c.parentID;
      changed = true;
    }
    if (changed) { J().persist(); sendChapters(); }
    if (share !== undefined && JSON.stringify(share) !== JSON.stringify(c.shareWithPlayer ?? false)) {
      J().share_chapter(J().chapters.indexOf(c), share); // AboveVTT's own: saves, sends folder and its notes to players
      changed = true;
    }
    redraw();
    return { before, after: { id: c.id, path: chapterPath(c), sharedWithPlayers: visibilityLabel(c.shareWithPlayer) }, changed };
  });

  M.register("delete_note_folder", async ({ folderId, folderTitle, dryRun } = {}) => {
    M.requireDM();
    const c = findChapter({ folderId, folderTitle });
    const all = [c];
    for (let i = 0; i < all.length; i++) for (const x of J().chapters) if (x.parentID === all[i].id && !all.includes(x)) all.push(x);
    const noteIds = all.flatMap((x) => (x.notes || []).filter((id) => J().notes[id]));
    const plan = { folder: chapterPath(c), subfolders: all.slice(1).map(chapterPath), notes: noteIds.map((id) => ({ id, title: J().notes[id].title, folder: chapterPath(chapterOf(id)) })) };
    if (dryRun) return { dryRun: true, ...plan };
    for (const id of noteIds) refuseIfOpenForEditing(id);
    // Same as the journal's folder "Delete": the folder, its subfolders and every note in them.
    for (const id of noteIds) delete J().notes[id];
    const ids = new Set(all.map((x) => x.id));
    J().chapters = J().chapters.filter((x) => !ids.has(x.id));
    J().persist();
    sendChapters();
    redraw();
    return plan;
  });
})();
