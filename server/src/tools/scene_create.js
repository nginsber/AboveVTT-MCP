import { z } from "zod";
import { errorResult } from "../util.js";
import { logChange } from "../changelog.js";

const value = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export function register(server, bridge) {
  server.registerTool(
    "create_scene",
    {
      title: "Create scenes",
      description:
        "Create one or more new scenes in AboveVTT, at the top level or in a scene folder, the same way AboveVTT's " +
        "Dropbox import does (your default scene settings apply; video maps and UVTT files are detected automatically; " +
        "a duplicate name in the same folder gets a number added). Does not switch the DM or players to the new scene. " +
        "Each scene can also get configuration in the same call, using the field keys from get_scene_config " +
        "(e.g. { \"grid\": true, \"hpps\": 70, \"vpps\": 70, \"darkness_filter\": 30 }). The map link must be a public " +
        "http(s) image or video link.",
      inputSchema: {
        scenes: z
          .array(
            z.object({
              title: z.string().describe("Scene title."),
              mapUrl: z.string().optional().describe("Public link to the map image or video (can be added later)."),
              config: z.record(z.string(), value).optional().describe("Optional configuration, keys as in get_scene_config."),
            })
          )
          .min(1)
          .max(25),
        folderId: z.string().optional().describe("Create inside this scene folder (id from list_scenes)."),
        folderTitle: z.string().optional().describe("Or: the folder's exact title. Omit both for the top level."),
        tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open."),
      },
    },
    async ({ tabId, ...params }) => {
      try {
        const r = await bridge.call("create_scene", params, { tabId, timeoutMs: 60000 });
        const lines = [`Created in ${r.folder}:`];
        for (const c of r.created) {
          let line = `• ${c.title} [${c.id}]`;
          if (c.title !== c.requestedTitle) line += `  (renamed from '${c.requestedTitle}' — that name was taken in this folder)`;
          if (!c.mapUrl) line += "  — no map yet";
          else if (c.video) line += "  — video map";
          else if (c.uvtt) line += "  — built from UVTT file";
          lines.push(line);
          if (c.configChanged) {
            for (const [k, d] of Object.entries(c.configChanged)) lines.push(`    ${d.label} (${k}): ${fmt(d.from)} → ${fmt(d.to)}`);
          }
          if (c.configError) lines.push(`    ⚠ Configuration not applied: ${c.configError}`);
        }
        logChange(bridge, { tool: "create_scene", params, summary: lines.join("\n") });
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );
}

function fmt(v) {
  if (v === true) return "on";
  if (v === false) return "off";
  if (v === null || v === undefined || v === "") return "(empty)";
  return String(v);
}
