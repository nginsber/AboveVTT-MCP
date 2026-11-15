// AboveVTT MCP server — talks to Claude desktop over stdio and to the
// "AboveVTT MCP Bridge" Chrome extension over a local WebSocket.
// Never write to stdout here except through the MCP transport.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Bridge, loadOrCreateToken, TOKEN_FILE } from "./bridge.js";
import { SERVER_VERSION } from "./version.js";
import * as statusTool from "./tools/status.js";
import * as scenesTool from "./tools/scenes.js";
import * as sceneConfigTool from "./tools/scene_config.js";
import * as sceneFoldersTool from "./tools/scene_folders.js";
import * as backupTool from "./tools/backup.js";
import * as sceneCreateTool from "./tools/scene_create.js";
import * as settingsTool from "./tools/settings.js";
import * as settingsActionsTool from "./tools/settings_actions.js";
import * as notesTool from "./tools/notes.js";
import * as creaturesTool from "./tools/creatures.js";
import * as tokensTool from "./tools/tokens.js";
import * as musicTool from "./tools/music.js";

const port = Number(process.env.AVTT_BRIDGE_PORT || 47321);
const token = loadOrCreateToken();
console.error(`[abovevtt-mcp] v${SERVER_VERSION} (pid ${process.pid}); bridge token is in ${TOKEN_FILE}`);

const bridge = new Bridge({ port, token, version: SERVER_VERSION });
bridge.start();

const server = new McpServer(
  { name: "abovevtt", version: SERVER_VERSION },
  {
    instructions:
      "Tools for the AboveVTT virtual tabletop running in the DM's Chrome tab on D&D Beyond. " +
      "If a tool fails, call `status` to see what is missing (extension, tab, DM role).",
  }
);

// Each step of the build adds one module here.
for (const tool of [statusTool, scenesTool, sceneConfigTool, sceneFoldersTool, backupTool, sceneCreateTool, settingsTool, settingsActionsTool, notesTool, creaturesTool, tokensTool, musicTool]) tool.register(server, bridge);

// Exit when the client goes away. Otherwise the open port and timers keep this
// process alive after Claude restarts, and the stale copy holds the port.
let exiting = false;
function shutdown(reason) {
  if (exiting) return;
  exiting = true;
  console.error(`[abovevtt-mcp] shutting down (${reason})`);
  bridge.stop();
  setTimeout(() => process.exit(0), 200).unref();
}
process.stdin.on("end", () => shutdown("stdin closed"));
process.stdin.on("close", () => shutdown("stdin closed"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

const transport = new StdioServerTransport();
transport.onclose = () => shutdown("transport closed");
await server.connect(transport);
