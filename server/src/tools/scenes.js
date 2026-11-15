import { z } from "zod";
import { errorResult } from "../util.js";

export function register(server, bridge) {
  server.registerTool(
    "list_scenes",
    {
      title: "List AboveVTT scenes",
      description:
        "List the campaign's scenes and scene folders as a tree, in the same order as AboveVTT's Scenes panel " +
        "(folders first, then A–Z). Shows which scene the DM is on and which scene the players see, plus each " +
        "item's id for use with other scene tools. Use `search` to find a scene or folder by name, or `folderId` " +
        "to list one folder only.",
      inputSchema: {
        search: z.string().optional().describe("Case-insensitive text to find in scene or folder names."),
        folderId: z.string().optional().describe("Only list this folder's contents."),
        includeMaps: z.boolean().optional().describe("Also return each scene's player and DM map links."),
        tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ tabId, ...params }) => {
      try {
        const r = await bridge.call("list_scenes", params, { tabId });
        const head = [
          `Folder: ${r.folder.title} — ${r.sceneCount} scene(s), ${r.folderCount} folder(s)`,
        ];
        if (r.matches) {
          head.push(r.matches.length
            ? `Matches for "${params.search}":\n` + r.matches.map((m) => `  ${m.type === "folder" ? "📁" : "🗺"} ${m.path}  [${m.id}]`).join("\n")
            : `No scene or folder name contains "${params.search}".`);
        }
        return {
          content: [
            { type: "text", text: head.join("\n") + "\n\n" + r.outline },
            { type: "text", text: JSON.stringify({ dmSceneId: r.dmSceneId, playerSceneId: r.playerSceneId, tree: r.tree }) },
          ],
        };
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );
}
