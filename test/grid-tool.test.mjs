// Run from the AboveVTT-MCP folder: node test/grid-tool.test.mjs — detect_grid server tool with a fake bridge.
import { register } from "../server/src/tools/grid.js";
const tools = {}; const server = { registerTool: (n, d, fn) => (tools[n] = fn) };
const calls = [];
let detect = { width: 1498, height: 1236, verdict: "grid", confidence: "medium", squarePx: 72, x: { spacing: 72, offset: 33.3, ratio: 1.63, lineWidth: 6, lines: "dark" }, y: { spacing: 72, offset: 55.3, ratio: 1.85, lineWidth: 6, lines: "dark" } };
const bridge = { call: async (m, p) => { calls.push(m);
  if (m === "get_scene_config") return { scene: { id: "s1", title: "The Tavern", dmIsHere: true }, fields: [{ key: "player_map", value: "https://x/t.jpg" }, { key: "player_map_is_video", value: false }, { key: "hpps", value: 60 }, { key: "vpps", value: 60 }, { key: "offsetx", value: 0 }, { key: "offsety", value: 0 }, { key: "grid", value: false }] };
  if (m === "ext_detect_grid") return detect;
  if (m === "update_scene_config") return { saved: true, changed: Object.fromEntries(Object.entries(p.changes).map(([k, v]) => [k, { label: k, from: 0, to: v }])) };
  if (m === "append_change_log") return {};
  return {}; } };
register(server, bridge);
console.log((await tools.detect_grid({})).content[0].text, "\n---");
console.log((await tools.detect_grid({ apply: true, drawGrid: true, color: "red", lineWidth: 4 })).content[0].text, "\n---");
detect = { width: 1536, height: 1024, verdict: "none", x: {}, y: {} };
console.log((await tools.detect_grid({ apply: true })).content[0].text);
console.log("calls:", calls.join(", "));
