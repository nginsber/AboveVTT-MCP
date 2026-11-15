import { z } from "zod";
import { errorResult } from "../util.js";
import { logChange } from "../changelog.js";

const tab = { tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open.") };
const ok = (text) => ({ content: [{ type: "text", text }] });
const round = (v, d = 1) => (v === undefined || v === null ? v : +Number(v).toFixed(d));

function describe(r) {
  const lines = [`Map image: ${r.width} × ${r.height} px${r.analysedAtScale && r.analysedAtScale !== 1 ? ` (analysed at ${Math.round(r.analysedAtScale * 100)}% size)` : ""}`];
  if (r.verdict === "grid") {
    lines.push(`Printed grid found (${r.confidence} confidence): squares ${round(r.x.spacing, 2)} × ${round(r.y.spacing, 2)} px, ` +
      `about ${round(r.width / r.x.spacing)} × ${round(r.height / r.y.spacing)} squares.`);
    lines.push(`Grid lines: ${r.x.lines === r.y.lines ? r.x.lines : `${r.x.lines} (vertical) / ${r.y.lines} (horizontal)`}, about ${Math.max(r.x.lineWidth, r.y.lineWidth)} px wide; ` +
      `first line centres at x ${r.x.offset}, y ${r.y.offset} px (AboveVTT's grid offset).`);
  } else if (r.verdict === "pattern") {
    lines.push(`No clear printed grid. There is a weak regular pattern every ~${round(r.squarePx, 1)} px (often floor tiles), which may or may not be 5 ft.`);
  } else {
    lines.push("No printed grid found on this map. The square size has to be chosen by eye (e.g. a doorway or a Medium creature ≈ one 5 ft square).");
  }
  return lines;
}

export function register(server, bridge) {
  const call = (m, p, tabId, opts = {}) => bridge.call(m, p, { tabId, ...opts });
  const log = (tool, params, text) => logChange(bridge, { tool, params, summary: text });

  server.registerTool("detect_grid", {
    title: "Detect the grid printed on a scene's map",
    description:
      "Reads a scene's map image and looks for a grid printed on it (dark or light lines). Reports the square size in pixels, the offset of the first grid line, " +
      "line colour/width and confidence — or says there is no grid. With apply: true and a grid found, it sets the scene's manual grid data (square width/height and offset, " +
      "the same as AboveVTT's Manual Grid Data / Super Mega Wizard) so AboveVTT's grid lines up with the printed one, plus any drawGrid/color/lineWidth you give. " +
      "Nothing is applied when no clear grid is found; then ask the user for a square size and use update_scene_config. Defaults to the DM's current scene.",
    inputSchema: {
      sceneId: z.string().optional(),
      sceneTitle: z.string().optional(),
      useDmMap: z.boolean().optional().describe("Read the DM-only map instead of the player map."),
      apply: z.boolean().optional().describe("Set the scene's grid size and offset when a grid is found. Default false (report only)."),
      drawGrid: z.boolean().optional().describe("Also turn AboveVTT's grid drawing on (true) or off (false)."),
      color: z.string().optional().describe("Grid colour to set, e.g. \"red\" or \"rgba(255,0,0,1)\"."),
      lineWidth: z.number().optional().describe("Grid line width to set (0.5–10)."),
      feetPerSquare: z.number().optional().describe("Distance per square (default: keep the scene's, normally 5)."),
      minSquare: z.number().optional().describe("Smallest square size to consider, in px (default 20)."),
      maxSquare: z.number().optional().describe("Largest square size to consider, in px (default 400)."),
      ...tab,
    },
  }, async ({ tabId, sceneId, sceneTitle, useDmMap, apply, drawGrid, color, lineWidth, feetPerSquare, minSquare, maxSquare }) => {
    try {
      const cfg = await call("get_scene_config", { sceneId, sceneTitle }, tabId);
      const val = (k) => cfg.fields.find((f) => f.key === k)?.value;
      const url = useDmMap ? val("dm_map") : val("player_map");
      if (!url) return errorResult(`Scene '${cfg.scene.title}' has no ${useDmMap ? "DM" : "player"} map link.`);
      if ((useDmMap ? val("dm_map_is_video") : val("player_map_is_video")) === true) return errorResult("That map is a video; grid detection only works on images.");

      const r = await call("ext_detect_grid", { url, minSquare, maxSquare }, tabId, { timeoutMs: 60000 });
      const out = [`Scene "${cfg.scene.title}"${cfg.scene.dmIsHere ? " (DM's current scene)" : ""}`, ...describe(r)];
      const current = `Current grid settings: ${val("hpps")} × ${val("vpps")} px, offset ${val("offsetx")} / ${val("offsety")}, grid drawing ${val("grid") ? "on" : "off"}.`;
      out.push(current);

      const style = {};
      if (drawGrid !== undefined) style.grid = drawGrid;
      if (color !== undefined) style.grid_color = color;
      if (lineWidth !== undefined) style.grid_line_width = lineWidth;
      if (feetPerSquare !== undefined) style.fpsq = feetPerSquare;

      if (!apply) {
        if (r.verdict === "grid") out.push("Nothing changed (report only). Call again with apply: true to set these values.");
        return ok(out.join("\n"));
      }
      if (r.verdict !== "grid") {
        out.push("Nothing was changed: without a clear printed grid there is nothing to line up with. Ask the user for a square size (pixels per 5 ft) and set hpps/vpps with update_scene_config.");
        if (Object.keys(style).length) out.push("(The grid style you gave was not applied either.)");
        return ok(out.join("\n"));
      }
      const changes = {
        hpps: round(r.x.spacing, 2), vpps: round(r.y.spacing, 2),
        offsetx: round(r.x.offset, 1), offsety: round(r.y.offset, 1),
        ...style,
      };
      const res = await call("update_scene_config", { sceneId: cfg.scene.id, changes }, tabId);
      const fmt = (v) => (v === null || v === undefined || v === "" ? "(empty)" : typeof v === "boolean" ? (v ? "on" : "off") : String(v));
      const changed = Object.entries(res.changed || {}).map(([k, d]) => `• ${d.label} (${k}): ${fmt(d.from)} → ${fmt(d.to)}`);
      out.push(changed.length ? "Applied:" : "Applied: the scene already had these values.", ...changed);
      const text = out.join("\n");
      if (changed.length) await log("detect_grid", { sceneId: cfg.scene.id, ...changes }, `Grid on '${cfg.scene.title}': ${changes.hpps}×${changes.vpps} px, offset ${changes.offsetx}/${changes.offsety}`);
      return ok(text);
    } catch (e) {
      return errorResult(e.message);
    }
  });
}
