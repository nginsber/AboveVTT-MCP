// A simple shared change log: one JSON line per change, in %USERPROFILE%\.abovevtt-mcp\change-log.jsonl.
// Every copy of the server (primary or peer) appends to the same file.
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./bridge.js";

export const CHANGE_LOG_FILE = path.join(CONFIG_DIR, "change-log.jsonl");
const MAX_BYTES = 5 * 1024 * 1024; // start a new file past 5 MB, keeping one old copy

export function logChange(bridge, { tool, params, summary }) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    try {
      if (fs.statSync(CHANGE_LOG_FILE).size > MAX_BYTES) fs.renameSync(CHANGE_LOG_FILE, CHANGE_LOG_FILE + ".old");
    } catch { /* no file yet */ }
    const tab = (bridge?.tabs || []).find((t) => t.isDM) || bridge?.tabs?.[0];
    const { tabId, ...rest } = params || {};
    const entry = {
      time: new Date().toISOString(),
      tool,
      campaign: tab?.campaignName ?? tab?.gameId ?? null,
      params: rest,
      summary,
    };
    fs.appendFileSync(CHANGE_LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.error("[abovevtt-mcp] could not write change log:", err.message);
  }
}

export function readChanges({ limit = 20, tool, search } = {}) {
  let lines = [];
  for (const f of [CHANGE_LOG_FILE + ".old", CHANGE_LOG_FILE]) {
    try { lines = lines.concat(fs.readFileSync(f, "utf8").split("\n").filter(Boolean)); } catch { /* missing */ }
  }
  let entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (tool) entries = entries.filter((e) => e.tool === tool);
  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter((e) => JSON.stringify(e).toLowerCase().includes(q));
  }
  return { total: entries.length, entries: entries.slice(-limit).reverse() };
}
