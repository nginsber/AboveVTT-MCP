import { z } from "zod";
import { errorResult } from "../util.js";
import { logChange } from "../changelog.js";
import { guardedCall, previewFooter, confirmTokenField, CONFIRM_STEP } from "../confirm.js";

const tab = { tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open.") };
const trackWhich = {
  trackId: z.string().optional().describe("Track id from list_tracks."),
  trackName: z.string().optional().describe("Or: the track's exact name."),
};
const plWhich = {
  playlistId: z.string().optional().describe("Playlist id from list_playlists."),
  playlistName: z.string().optional().describe("Or: the playlist's exact name."),
};
const tags = z.union([z.array(z.string()), z.string()]);
const ASK_FIRST = "PERMANENT. Call it with dryRun: true first, tell the user exactly what will be deleted, and wait for their explicit yes in chat. " + CONFIRM_STEP + "Never delete on your own initiative. ";
const ok = (text) => ({ content: [{ type: "text", text }] });
const trackLine = (t) => `• ${t.name} [${t.id}]${t.tags?.length ? ` — tags: ${t.tags.join(", ")}` : ""}\n    ${t.src}`;
function playlistText(p) {
  const head = `🎵 ${p.name} [${p.id}]${p.loadedInMixer ? " (loaded in the mixer)" : ""} — ${p.tracks.length} track(s)`;
  return [head, ...p.tracks.map((t, i) => `    ${i + 1}. ${t.name}${t.loop ? " (loop)" : ""}${t.tokenAudio ? " (token sound)" : ""}`)].join("\n");
}

export function register(server, bridge) {
  const call = (m, p, tabId) => bridge.call(m, p, { tabId });
  const log = (tool, params, text) => logChange(bridge, { tool, params, summary: text });

  server.registerTool("list_tracks", {
    title: "List the music library",
    description: "List AboveVTT's track library (Sounds tab): name, link and tags, plus how many tracks each tag has. Tags are how AboveVTT now groups soundpads. The library is kept in this Chrome and shared by all campaigns.",
    inputSchema: { search: z.string().optional(), tag: z.string().optional(), ...tab },
    annotations: { readOnlyHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("list_tracks", p, tabId);
      const tagList = Object.entries(r.tags).sort((a, b) => a[0].localeCompare(b[0])).map(([t, n]) => `${t} (${n})`).join(", ");
      const lines = [`Track library: ${r.total} track(s)${r.shown !== r.total ? `, ${r.shown} shown` : ""}`, `Tags: ${tagList || "(none)"}`, ""];
      r.tracks.forEach((t) => lines.push(trackLine(t)));
      if (!r.tracks.length) lines.push("(no tracks)");
      return ok(lines.join("\n"));
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("add_tracks", {
    title: "Add tracks to the music library",
    description: "Add up to 50 tracks to AboveVTT's track library by public link (mp3, ogg, wav… on a web host, Dropbox, etc.), with optional tags. A link already in the library is skipped; a name already used gets a number added. Nothing is played.",
    inputSchema: {
      tracks: z.array(z.object({ name: z.string(), src: z.string().describe("Public http(s) link to the audio file."), tags: tags.optional() })).min(1).max(50),
      ...tab,
    },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("add_tracks", p, tabId);
      const lines = [`Added ${r.added.length} track(s)${r.skipped.length ? `, skipped ${r.skipped.length}` : ""}:`];
      r.added.forEach((t) => lines.push(trackLine(t) + (t.renamedFrom ? `\n    (named '${t.name}' because another track is already called '${t.renamedFrom}')` : "")));
      r.skipped.forEach((s) => lines.push(`• skipped ${s.name}: ${s.reason}`));
      const text = lines.join("\n");
      if (r.added.length) await log("add_tracks", p, text.split("\n")[0]);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("update_track", {
    title: "Edit a track in the music library",
    description: "Rename a track, change its link, or set / add / remove tags.",
    inputSchema: { ...trackWhich, newName: z.string().optional(), src: z.string().optional(), tags: tags.optional().describe("Replace all tags."), addTags: tags.optional(), removeTags: tags.optional(), ...tab },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("update_track", p, tabId);
      if (!r.changed.length) return ok(`No change to '${r.before.name}'.`);
      const text = [`Updated '${r.after.name}' (${r.changed.join(", ")}):`, `Before: ${trackLine(r.before)}`, `After:  ${trackLine(r.after)}`, ...(r.note ? [`Note: ${r.note}`] : [])].join("\n");
      await log("update_track", p, text.split("\n")[0]);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("delete_tracks", {
    title: "Delete tracks from the music library",
    description: ASK_FIRST + "Deletes tracks from the track library by id, name, or every track with a tag. Copies already in playlists stay there.",
    inputSchema: { trackIds: z.array(z.string()).optional(), trackNames: z.array(z.string()).optional(), tag: z.string().optional(), dryRun: z.boolean().optional(), confirmToken: confirmTokenField, ...tab },
    annotations: { destructiveHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await guardedCall(bridge, "delete_tracks", p, { tabId });
      const list = r.dryRun ? r.wouldDelete : r.deleted;
      const text = [`${r.dryRun ? "Would delete (nothing changed yet)" : "Deleted"} ${list.length} track(s):`, ...list.map(trackLine)].join("\n");
      if (!r.dryRun) await log("delete_tracks", p, text.split("\n")[0] + " " + list.map((t) => t.name).join(", "));
      return ok(text + previewFooter(r));
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("list_playlists", {
    title: "List mixer playlists",
    description: "List the mixer's playlists in this campaign and their tracks, and which one is loaded in the mixer.",
    inputSchema: { ...tab },
    annotations: { readOnlyHint: true },
  }, async ({ tabId }) => {
    try {
      const r = await call("list_playlists", {}, tabId);
      return ok([`Mixer: ${r.mixerPaused ? "paused" : "playing"}; ${r.playlists.length} playlist(s)`, ...r.playlists.map(playlistText)].join("\n"));
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("create_playlist", {
    title: "Create a mixer playlist",
    description: "Create a playlist from tracks in the library (by name, id, or everything with a tag). It isn't loaded into the mixer and nothing plays; the DM loads it in the Sounds tab when wanted.",
    inputSchema: { name: z.string(), tracks: z.array(z.string()).optional().describe("Track names."), trackIds: z.array(z.string()).optional(), tag: z.string().optional(), loop: z.boolean().optional().describe("Loop each track."), ...tab },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("create_playlist", p, tabId);
      const text = `Created playlist:\n${playlistText(r.created)}`;
      await log("create_playlist", p, text.split("\n")[1]);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("update_playlist", {
    title: "Edit a mixer playlist",
    description: "Rename a playlist, add library tracks (by name, id or tag; added paused) or remove tracks. The playlist loaded in the mixer can only have its tracks changed while the mixer is paused.",
    inputSchema: { ...plWhich, newName: z.string().optional(), addTracks: z.array(z.string()).optional(), addTrackIds: z.array(z.string()).optional(), addTag: z.string().optional(), removeTracks: z.array(z.string()).optional().describe("Track names (or channel ids) to take out."), loop: z.boolean().optional().describe("Loop the added tracks."), ...tab },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await call("update_playlist", p, tabId);
      const lines = r.changed.length ? [`Updated playlist (${r.changed.join("; ")}):`, playlistText(r.after)] : [`No change to '${r.before.name}'.`];
      for (const n of r.notes || []) lines.push(`Note: ${n}`);
      const text = lines.join("\n");
      if (r.changed.length) await log("update_playlist", p, text.split("\n")[0]);
      return ok(text);
    } catch (e) { return errorResult(e.message); }
  });

  server.registerTool("delete_playlist", {
    title: "Delete a mixer playlist",
    description: ASK_FIRST + "Deletes a playlist (not the tracks in the library). The playlist loaded in the mixer can't be deleted here.",
    inputSchema: { ...plWhich, dryRun: z.boolean().optional(), confirmToken: confirmTokenField, ...tab },
    annotations: { destructiveHint: true },
  }, async ({ tabId, ...p }) => {
    try {
      const r = await guardedCall(bridge, "delete_playlist", p, { tabId });
      const text = `${r.dryRun ? "Would delete (nothing changed yet)" : "Deleted"} playlist:\n${playlistText(r.dryRun ? r.wouldDelete : r.deleted)}`;
      if (!r.dryRun) await log("delete_playlist", p, text.split("\n")[1]);
      return ok(text + previewFooter(r));
    } catch (e) { return errorResult(e.message); }
  });
}
