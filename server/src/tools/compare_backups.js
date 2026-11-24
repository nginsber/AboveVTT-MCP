import { z } from "zod";
import { errorResult } from "../util.js";
import { readBackup } from "../backupfile.js";
import { diffBackups } from "../backupdiff.js";

const AREAS = ["scenes", "tokens", "journal", "audio"];
const PER_SECTION = 40;

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
// Local time on this PC (the server runs next to Chrome), e.g. "Nov 23, 2026, 6:39 PM" — like list_backup_files.
const when = (d) => d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

function section(title, items, render = (x) => [`  • ${x}`]) {
  if (!items.length) return [];
  const out = [`${title} (${items.length}):`];
  for (const it of items.slice(0, PER_SECTION)) out.push(...render(it));
  if (items.length > PER_SECTION) out.push(`  …and ${items.length - PER_SECTION} more. Ask for one area at a time to see the rest.`);
  return out;
}
const withNotes = (label) => (x) => [`  • ${x[label]}`, ...x.notes.map((n) => `      – ${n}`)];

function countLine(c) {
  const parts = [];
  const pair = (name, k) => parts.push(c.before[k] === c.after[k] ? `${c.after[k]} ${name}` : `${name} ${c.before[k]} → ${c.after[k]}`);
  pair("scenes", "scenes"); pair("scene folders", "sceneFolders"); pair("token customizations", "tokenCustomizations");
  pair("notes", "notes"); pair("journal folders", "journalFolders"); pair("tracks", "tracks"); pair("playlists", "playlists");
  return parts.join(", ");
}

export function renderDiff(d, areas = AREAS) {
  const out = [];
  const block = (title, lines) => { if (lines.length) out.push(`== ${title} ==`, ...lines, ""); };
  if (areas.includes("scenes")) {
    const s = d.scenes;
    block("Scenes", [
      ...section("Scenes added", s.scenesAdded), ...section("Scenes removed", s.scenesRemoved),
      ...section("Scenes changed", s.scenesChanged, withNotes("path")),
      ...section("Scene folders added", s.foldersAdded), ...section("Scene folders removed", s.foldersRemoved),
      ...section("Scene folders changed", s.foldersChanged, withNotes("path")),
    ]);
  }
  if (areas.includes("tokens")) {
    const t = d.tokens;
    block("My Tokens and token settings", [
      ...section("Added", t.added), ...section("Removed", t.removed), ...section("Changed", t.changed, withNotes("path")),
    ]);
  }
  if (areas.includes("journal")) {
    const j = d.journal;
    block("Journal", [
      ...section("Notes added", j.notesAdded), ...section("Notes removed", j.notesRemoved),
      ...section("Notes changed", j.notesChanged, withNotes("title")),
      ...section("Folders added", j.foldersAdded), ...section("Folders removed", j.foldersRemoved),
      ...section("Folders changed", j.foldersChanged, withNotes("title")),
    ]);
  }
  if (areas.includes("audio")) {
    const a = d.audio;
    block("Audio", [
      ...section("Tracks added", a.tracksAdded), ...section("Tracks removed", a.tracksRemoved),
      ...section("Tracks changed", a.tracksChanged, withNotes("name")),
      ...section("Playlists added", a.playlistsAdded), ...section("Playlists removed", a.playlistsRemoved),
      ...section("Playlists changed", a.playlistsChanged, withNotes("name")),
    ]);
  }
  return out;
}

export function register(server) {
  server.registerTool(
    "compare_backups",
    {
      title: "Compare two AboveVTT backups",
      description:
        "Read-only: compares two .abovevtt backup files and lists what changed from the first (before) to the second (after): " +
        "scenes and scene folders added, removed, renamed, moved or changed (settings, map links, fog, drawings, and the tokens on " +
        "each scene), My Tokens and token settings, journal notes (with the changed text) and folders, and audio tracks and playlists. " +
        "Files are names from list_backup_files (in Downloads) or full paths. Nothing in the campaign is read or changed, so no AboveVTT " +
        "tab is needed. Explored fog details and soundpads aren't compared.",
      inputSchema: {
        before: z.string().describe("The older backup: a file name from list_backup_files, or a full path."),
        after: z.string().describe("The newer backup: a file name from list_backup_files, or a full path."),
        areas: z.array(z.enum(AREAS)).optional().describe("Only these areas (default all): scenes, tokens, journal, audio."),
      },
    },
    async ({ before, after, areas }) => {
      try {
        const A = readBackup(before), B = readBackup(after);
        if (A.full === B.full) return errorResult("That's the same file twice. Pick two different backups.");
        const d = diffBackups(A.data, B.data);
        const out = [
          `Comparing (read-only):`,
          `  before: ${A.name}  (saved ${when(A.modified)}, ${kb(A.size)})`,
          `  after:  ${B.name}  (saved ${when(B.modified)}, ${kb(B.size)})`,
        ];
        if (A.modified > B.modified) out.push("  Note: the 'before' file is the newer of the two, so additions and removals read the other way round.");
        out.push(`Contents: ${countLine(d.counts)}.`, "");
        const body = renderDiff(d, areas && areas.length ? areas : AREAS);
        out.push(...(body.length ? body : ["No differences found in these areas."]));
        return { content: [{ type: "text", text: out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() }] };
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );
}
