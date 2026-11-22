import { z } from "zod";
import { cleanName } from "../names.js";
import { errorResult } from "../util.js";
import { logChange } from "../changelog.js";

const which = {
  sceneId: z.string().optional().describe("Scene id from list_scenes."),
  sceneTitle: z.string().optional().describe("Exact scene title (used if sceneId is not given)."),
  tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open."),
};

function fmt(v) {
  if (v === true) return "on";
  if (v === false) return "off";
  if (v === null || v === undefined || v === "") return "(empty)";
  return String(v);
}

function renderConfig(r) {
  const lines = [`Scene "${r.scene.title}" [${r.scene.id}]${r.scene.dmIsHere ? " — DM is here" : ""}${r.scene.playersAreHere ? " — players are here" : ""}`, ""];
  for (const f of r.fields) {
    let line = `• ${f.label} (${f.key}): ${fmt(f.valueLabel ?? f.value)}`;
    if (f.type === "number" && (f.min !== undefined || f.max !== undefined)) line += `  [range ${f.min ?? "…"}–${f.max ?? "…"}]`;
    if (f.choices) line += `  [choices: ${f.choices.map((c) => c.label).join(" | ")}]`;
    if (f.note) line += `  — ${f.note}`;
    lines.push(line);
  }
  if (r.extras?.length) {
    lines.push("", "Other fields in this AboveVTT version (read-only for now):");
    for (const f of r.extras) lines.push(`• ${f.key}: ${fmt(f.value)}`);
  }
  return lines.join("\n");
}

export function register(server, bridge) {
  server.registerTool(
    "get_scene_config",
    {
      title: "Get a scene's configuration",
      description:
        "Read everything in a scene's configure dialog (the cog on the scene in AboveVTT): title, map links, DM map, " +
        "darkness, vision trail, vision/light, snap, grid labels, grid on/off, colour, layer and line width, playlist, " +
        "weather and intensity, initial position and zoom, grid size, offset, units and scale. Returns each field's key, " +
        "current value, and allowed range or choices. Defaults to the scene the DM is on.",
      inputSchema: which,
      annotations: { readOnlyHint: true },
    },
    async ({ tabId, ...params }) => {
      try {
        const r = await bridge.call("get_scene_config", params, { tabId });
        return { content: [{ type: "text", text: renderConfig(r) }, { type: "text", text: JSON.stringify(r) }] };
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );

  server.registerTool(
    "update_scene_config",
    {
      title: "Change a scene's configuration",
      description:
        "Change one or more fields in a scene's configure dialog and save, exactly as AboveVTT's dialog does (it does " +
        "not move the DM or the players to the scene). Use the field keys from get_scene_config. On/off fields take " +
        "true/false; choice fields take the choice's label or value (e.g. weather \"Snow\", gridOver \"Over Darkness/Fog\"); " +
        "grid_color takes a colour such as \"rgba(0,0,0,0.5)\" or \"#ff0000\". Returns what changed.",
      inputSchema: {
        ...which,
        changes: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .describe("Field key → new value, e.g. { \"title\": \"Ice Cave\", \"grid\": true, \"darkness_filter\": 60 }."),
      },
    },
    async ({ tabId, ...params }) => {
      try {
        // the scene title is shown by AboveVTT as HTML: same rules as other names (see names.js)
        if (typeof params.changes?.title === "string") params.changes = { ...params.changes, title: cleanName(params.changes.title, "Scene title") };
        const r = await bridge.call("update_scene_config", params, { tabId, timeoutMs: 30000 });
        const lines = [`Scene "${r.scene.title}" [${r.scene.id}]`];
        if (!r.saved) lines.push(r.message);
        else {
          lines.push("Saved. Changed:");
          for (const [k, d] of Object.entries(r.changed)) lines.push(`• ${d.label} (${k}): ${fmt(d.from)} → ${fmt(d.to)}`);
        }
        if (r.saved) logChange(bridge, { tool: "update_scene_config", params, summary: lines.join("\n") });
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );
}
