import { z } from "zod";
import { errorResult } from "../util.js";
import { logChange, readChanges, CHANGE_LOG_FILE } from "../changelog.js";

const tab = { tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open.") };

export function register(server, bridge) {
  server.registerTool(
    "export_backup",
    {
      title: "Back up the campaign (AboveVTT Export)",
      description:
        "Run AboveVTT's built-in Export (the EXPORT button on the Settings tab). Chrome downloads a .abovevtt file, named with the campaign, date and time (e.g. 'Frozen Sick-2026-11-23 18-45-07.abovevtt'), " +
        "with all scenes, custom tokens, notes, journal chapters, soundpads, mixer state and music library into the " +
        "Downloads folder. It can be restored with AboveVTT's Import. Explored fog is not included.",
      inputSchema: {
        timeoutSeconds: z.number().int().min(10).max(900).optional().describe("How long to wait for a big campaign (default 180)."),
        ...tab,
      },
    },
    async ({ tabId, timeoutSeconds }) => {
      try {
        const wait = timeoutSeconds ?? 180;
        const r = await bridge.call("export_backup", { timeoutSeconds: wait }, { tabId, timeoutMs: (wait + 15) * 1000 });
        const c = r.contents;
        const text = [
          `Backup downloaded: ${r.filename}`,
          `Saved to: ${r.savedTo}  (took ${r.seconds}s)`,
          `Contains: ${c.scenes} scenes in ${c.sceneFolders} folders, ${c.tokenCustomizations ?? "?"} token customizations, ` +
            `${c.notes ?? "?"} notes, ${c.journalChapters ?? "?"} journal chapters, ${c.soundpads ?? "?"} soundpads, ${c.musicTracks ?? "?"} music tracks.`,
          "The file name has the date and time, so backups made the same day don't replace or rename each other.",
        ].join("\n");
        logChange(bridge, { tool: "export_backup", params: {}, summary: `Downloaded ${r.filename}` });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "get_change_log",
    {
      title: "Show changes made through this connector",
      description:
        "List changes the AboveVTT connector has made (newest first): what tool, when, which campaign, what it did. " +
        "Only changes made through the connector are logged, not changes made by hand in AboveVTT.",
      inputSchema: {
        limit: z.number().int().min(1).max(500).optional().describe("How many entries (default 20)."),
        tool: z.string().optional().describe("Only this tool, e.g. move_scene."),
        search: z.string().optional().describe("Only entries containing this text (scene or folder name, etc.)."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, tool, search }) => {
      const { total, entries } = readChanges({ limit: limit ?? 20, tool, search });
      if (!entries.length) {
        return { content: [{ type: "text", text: total ? "No matching changes." : `No changes logged yet (${CHANGE_LOG_FILE}).` }] };
      }
      const lines = [`${entries.length} of ${total} change(s), newest first — log file: ${CHANGE_LOG_FILE}`, ""];
      for (const e of entries) {
        const when = new Date(e.time).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
        lines.push(`• ${when} — ${e.tool}${e.campaign ? ` (${e.campaign})` : ""}`);
        for (const l of String(e.summary || "").split("\n")) if (l.trim()) lines.push(`    ${l}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
