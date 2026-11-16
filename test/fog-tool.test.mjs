// Run from the AboveVTT-MCP folder: node test/fog-tool.test.mjs  (needs server/node_modules)
// Checks the server side of get_fog / set_fog — wording, backups and restore — with a stand-in bridge.
// Backups go to a temporary home folder, not your real %USERPROFILE%\.abovevtt-mcp.
import os from "node:os"; import fs from "node:fs"; import path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fogtest-"));
process.env.HOME = tmp; process.env.USERPROFILE = tmp;
const { register, FOG_BACKUP_DIR } = await import("../server/src/tools/fog.js");

let fog = { s1: [[1, 1, 5, 5, 0, 0], [9, 9, 3, 0, 1, 0]] };
const describe = (l) => ({ state: l.length ? (l.length === 1 && l[0][4] === 2 ? "fully revealed" : "partly revealed") : "fully hidden", zones: l.length, shapes: {} });
const calls = [];
const bridge = {
  tabs: [{ isDM: true, campaignName: "Test" }],
  async call(method, p) {
    calls.push({ method, p });
    const base = { scene: "The Tavern", sceneId: "s1", isCurrentScene: true, playersHere: true, fogOn: true };
    if (method === "get_fog") return { ...base, ...describe(fog.s1) };
    const next = p.action === "hideAll" ? [] : p.action === "revealAll" ? [[0, 0, 0, 0, 2, 0]] : p.reveals;
    const before = fog.s1;
    const r = { ...base, before: describe(before), after: describe(next), changed: JSON.stringify(before) !== JSON.stringify(next), dryRun: !!p.dryRun };
    if (!r.changed || p.dryRun) return r;
    fog.s1 = next;
    return { ...r, previous: before, verified: true };
  },
};
const tools = {};
register({ registerTool: (name, _def, fn) => { tools[name] = fn; } }, bridge);
const run = async (name, p) => (await tools[name](p)).content[0].text;
let fails = 0;
const check = (label, cond, text = "") => { console.log((cond ? "ok   " : "FAIL ") + label); if (!cond) { fails++; console.log(text); } };

let t = await run("set_fog", { action: "hideAll", dryRun: true });
check("dry run wording", /Would change \(nothing changed yet\)/.test(t) && /players are on it/.test(t) && fog.s1.length === 2, t);
check("dry run saves no copy", !fs.existsSync(FOG_BACKUP_DIR));
const original = JSON.stringify(fog.s1);
t = await run("set_fog", { action: "hideAll" });
check("hide all", /Changed — Hide all/.test(t) && /Previous fog saved/.test(t) && /Checked/.test(t) && fog.s1.length === 0, t);
await new Promise((r) => setTimeout(r, 5));
t = await run("set_fog", { action: "revealAll" });
check("reveal all", fog.s1.length === 1, t);
t = await run("get_fog", {});
check("get lists 2 copies", /1\. .*fully hidden/.test(t) && /2\. .*partly revealed/.test(t), t);
t = await run("set_fog", { action: "restore", backup: 2 });
check("restore copy 2 = the original fog", JSON.stringify(fog.s1) === original && /Restore the copy saved/.test(t), t);
check("restore sent as 'set' with the scene id", calls.at(-1).p.action === "set" && calls.at(-1).p.sceneId === "s1");
t = await run("set_fog", { action: "restore", backup: 9 });
check("restore missing copy refused", /only 3 saved fog copies/.test(t), t);
t = await run("set_fog", { action: "restore" });
check("restore is itself undoable (newest copy = reveal all)", fog.s1.length === 1, t);
const log = fs.readFileSync(path.join(tmp, ".abovevtt-mcp", "change-log.jsonl"), "utf8").trim().split("\n");
check("change log has 4 entries", log.length === 4 && log.every((l) => JSON.parse(l).tool === "set_fog"), log.join("\n"));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
