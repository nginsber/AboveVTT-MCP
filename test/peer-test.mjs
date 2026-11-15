// Smoke test: two server copies share one bridge; the second forwards through the first;
// when the first exits the second takes over the port and the extension reconnects.
import { Client } from "../server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import WebSocket from "../server/node_modules/ws/wrapper.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SERVER = path.resolve("server/dist/abovevtt-mcp.mjs");
const PORT = 47999;
const home = fs.mkdtempSync(path.join(os.tmpdir(), "avtt-"));
const env = { ...process.env, HOME: home, USERPROFILE: home, AVTT_BRIDGE_PORT: String(PORT) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startCopy(name) {
  const t = new StdioClientTransport({ command: "node", args: [SERVER], env, stderr: "pipe" });
  const c = new Client({ name, version: "0" });
  await c.connect(t);
  t.stderr.on("data", (d) => process.stdout.write(`  [${name}] ${d}`));
  return c;
}
async function status(c) {
  const r = await c.callTool({ name: "status", arguments: {} });
  return JSON.parse(r.content[0].text);
}

// Fake extension: answers "status" calls and reconnects like background.js does.
function fakeExtension() {
  const ext = { ws: null, stop: false };
  const connect = () => {
    if (ext.stop) return;
    const token = fs.readFileSync(path.join(home, ".abovevtt-mcp", "bridge-token.txt"), "utf8").trim();
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: "chrome-extension://fake" });
    ext.ws = ws;
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", token, extVersion: "test", tabs: [{ tabId: 7, isDM: true, aboveVttRunning: true }] })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.type === "call") ws.send(JSON.stringify({ type: "result", id: m.id, ok: true,
        result: { aboveVttRunning: true, isDM: true, aboveVttVersion: "1.61.0", campaignName: "Test", currentScene: "Cave" } }));
    });
    ws.on("close", () => setTimeout(connect, 300));
    ws.on("error", () => {});
  };
  connect();
  return ext;
}

const fail = (m) => { console.error("FAIL:", m); process.exit(1); };

const a = await startCopy("A");
await sleep(500);
const b = await startCopy("B");
await sleep(500);
const ext = fakeExtension();
await sleep(800);

let sa = await status(a), sb = await status(b);
console.log("A:", sa.server.role, "|", sa.summary);
console.log("B:", sb.server.role, "|", sb.summary, "| primary pid", sb.server.primary?.pid);
if (sa.server.role !== "primary" || sb.server.role !== "peer") fail("roles");
if (!sb.summary.startsWith("Ready")) fail("peer not ready");

// A web page must not be able to join as a peer.
await new Promise((res) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: "https://evil.example" });
  ws.on("close", (code) => { console.log("web-origin connection closed with", code); if (code !== 4003) fail("origin"); res(); });
  ws.on("error", () => {});
});

// Kill the primary: B should take over and the extension should reconnect to it.
await a.close();
await sleep(2500);
sb = await status(b);
console.log("B after A exits:", sb.server.role, "|", sb.summary);
if (sb.server.role !== "primary" || !sb.summary.startsWith("Ready")) fail("takeover");

// A new copy should join B.
const c = await startCopy("C");
await sleep(600);
const sc = await status(c);
console.log("C:", sc.server.role, "|", sc.summary);
if (sc.server.role !== "peer" || !sc.summary.startsWith("Ready")) fail("rejoin");

console.log("PASS");
ext.stop = true; ext.ws?.close();
await b.close(); await c.close();
process.exit(0);
