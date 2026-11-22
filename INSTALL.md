# Installing AboveVTT MCP

About 10 minutes. Pick your system: **[Windows](#windows)** · **[macOS](#macos)** · **[Linux](#linux-not-tested-yet)** (not tested yet). The setups that have been tested are listed in **[AboveVTT MCP compatibility](COMPATIBILITY.md)**.

Every system uses the same five steps:

| Step | What you do | Where |
|---|---|---|
| 1 | Check that Node.js is installed | Your system's section |
| 2 | Put the connector files on your computer | Your system's section |
| 3 | Tell Claude desktop to start the server, and copy the server's token | Your system's section |
| 4 | Load the Chrome extension and give it the token | [All systems](#4-install-the-chrome-extension-all-systems) |
| 5 | Test | [All systems](#5-test-all-systems) |

## What you need

- **Windows 11** or **macOS**. Linux hasn't been tested yet.
- **Google Chrome** with the **AboveVTT** extension installed and working.
- **Claude desktop**, signed in.
- A D&D Beyond campaign where **you are the DM**. Test in a throwaway campaign first.
- **Node.js 20 or newer**. See step 1.

> **Browser-only AI chats won't work.** The connector is a program that runs on your computer, so it needs an AI app that can start a local MCP server on the same computer as Chrome. AI chats used only in a web browser (for example ChatGPT, Gemini, or Claude at claude.ai) can't start local programs, so they can't use this connector. These steps use Claude desktop. Other MCP clients that can start a local server should also work: Claude Code has been tried on a Mac (see [compatibility](COMPATIBILITY.md)); others, such as VS Code, haven't been tested.

---

## Windows

### 1. Check for Node.js

1. Press **Win + X** and choose **Terminal** (or **Windows PowerShell**).
2. Type `node -v` and press Enter.
   - If it shows **v20 or higher** (for example `v22.11.0`), you're set.
   - If it says `node is not recognized`, or the version is below v20, install Node.js using either `winget install OpenJS.NodeJS.LTS` in the same terminal, or the **LTS** Windows installer from <https://nodejs.org> run with the defaults. Then **close and reopen** the terminal and run `node -v` again.
3. Run `where.exe node` and note the full path it prints, usually `C:\Program Files\nodejs\node.exe`. You'll need it in step 3.

### 2. Get the files

1. Download this repository (**Code → Download ZIP**, then extract it, or `git clone`) to a folder of your choice, for example `C:\Users\<you>\AboveVTT-MCP`. Below, `<folder>` means that path.
2. You don't need to run `npm install`: `<folder>\server\dist\abovevtt-mcp.mjs` is already built.

### 3. Tell Claude desktop about the server

1. Open the config file, `claude_desktop_config.json`, in Notepad. Either:
   - in Claude desktop open **Settings → Desktop app → Extensions → Local MCP servers** and use its button to edit the config, or
   - press **Win + R**, type `%APPDATA%\Claude`, press Enter, and open `claude_desktop_config.json`.

   If Claude was installed from the Microsoft Store or with winget, the file Claude actually reads may be `%LOCALAPPDATA%\Packages\Claude_…\LocalCache\Roaming\Claude\claude_desktop_config.json`. Use the copy that already lists your other local servers, if you have any.
2. Add an `abovevtt` entry inside `"mcpServers": { … }`. Paths use **double backslashes**. If the file is empty or has no other servers, the whole file is:

   ```json
   {
     "mcpServers": {
       "abovevtt": {
         "command": "C:\\Program Files\\nodejs\\node.exe",
         "args": ["C:\\Users\\<you>\\AboveVTT-MCP\\server\\dist\\abovevtt-mcp.mjs"]
       }
     }
   }
   ```

   Set `command` to the path `where.exe node` printed, and `args` to your `<folder>`. If other servers are already listed, see [Adding to an existing config](#adding-to-an-existing-config).
3. Save. **Fully quit** Claude desktop (right-click its icon in the system tray → **Quit**; closing the window isn't enough) and start it again.
4. **abovevtt** should now appear under **Settings → Desktop app → Extensions → Local MCP servers**.
5. The first time it starts, the server creates a token file: `%USERPROFILE%\.abovevtt-mcp\bridge-token.txt`. Press **Win + R**, paste that path, press Enter to open it in Notepad, and copy the line of text. Treat it like a password.

Then continue with **[step 4](#4-install-the-chrome-extension-all-systems)**.

---

## macOS

### 1. Check for Node.js

1. Open **Terminal** (Applications → Utilities, or press **Cmd+Space** and type *Terminal*).
2. Type `node -v` and press Return.
   - If it shows **v20 or higher**, you're set.
   - If it says `command not found`, or the version is below v20, install the **LTS** macOS installer from <https://nodejs.org> (or `brew install node` if you use Homebrew). Then **close and reopen** Terminal and run `node -v` again.
3. Run `which node` and note the full path it prints, for example `/opt/homebrew/bin/node` or `/usr/local/bin/node`. You'll need it in step 3.

### 2. Get the files

1. Download this repository (**Code → Download ZIP**, then double-click to extract it, or `git clone`) to a folder of your choice, for example `/Users/<you>/AboveVTT-MCP`. Below, `<folder>` means that path.
2. You don't need to run `npm install`: `<folder>/server/dist/abovevtt-mcp.mjs` is already built.

### 3. Tell Claude desktop about the server

1. Open the config file, `claude_desktop_config.json`, in TextEdit or another text editor. Either:
   - in Claude desktop open **Settings → Desktop app → Extensions → Local MCP servers** and use its button to edit the config, or
   - in Finder press **Cmd+Shift+G**, type `~/Library/Application Support/Claude/`, press Return, and open `claude_desktop_config.json`.
2. Add an `abovevtt` entry inside `"mcpServers": { … }`. Paths use **single forward slashes**, and `command` must be the **full path** to `node`: plain `node` isn't found when Claude desktop starts the server. If the file is empty or has no other servers, the whole file is:

   ```json
   {
     "mcpServers": {
       "abovevtt": {
         "command": "/opt/homebrew/bin/node",
         "args": ["/Users/<you>/AboveVTT-MCP/server/dist/abovevtt-mcp.mjs"]
       }
     }
   }
   ```

   Set `command` to the path `which node` printed, and `args` to your `<folder>`. If other servers are already listed, see [Adding to an existing config](#adding-to-an-existing-config).
3. Save. **Fully quit** Claude desktop with **Cmd+Q** (closing the window isn't enough) and start it again.
4. **abovevtt** should now appear under **Settings → Desktop app → Extensions → Local MCP servers**.
5. The first time it starts, the server creates a token file: `~/.abovevtt-mcp/bridge-token.txt`. The folder is hidden: in Finder press **Cmd+Shift+G**, type `~/.abovevtt-mcp`, press Return, open the file and copy the line of text. Treat it like a password.

Then continue with **[step 4](#4-install-the-chrome-extension-all-systems)**.

---

## Linux (not tested yet)

> 🚧 **Placeholder.** AboveVTT MCP hasn't been tried on Linux, and these steps haven't been written yet. If you get it working, please open an issue with what you did so this section can be filled in.

### 1. Check for Node.js

*To be written.*

### 2. Get the files

*To be written.*

### 3. Tell an MCP client about the server

*To be written.* The server and extension don't depend on Windows or macOS, so the setup is expected to look like the macOS one: full path to `node`, forward-slash paths, and the token in `~/.abovevtt-mcp/bridge-token.txt`. Which MCP client to use, and where its config file lives, still needs to be confirmed.

---

## 4. Install the Chrome extension (all systems)

1. In Chrome go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder inside `<folder>`.
   - On a Mac, press **Cmd+Shift+G** in the folder picker to type a path, for example `~/AboveVTT-MCP/extension`. This also reaches hidden folders.
4. From the puzzle-piece menu, **pin** "AboveVTT MCP Bridge" so you can see its icon.
5. Click the extension's icon to open its options page. Paste the token, leave the port at **47321**, optionally give this browser a name (for example *Desktop*), and click **Save and connect**.
6. Optional, for grid detection: on the same options page click **Allow reading map images** and accept Chrome's prompt. This lets the extension download a scene's map image to measure its grid. You can remove it again from the same page. It's only used for maps on the internet: links to this computer or your local network (for example `localhost` or `192.168.x.x`) are refused.

The extension's toolbar icon is AboveVTT's red "A" with **MCP** written underneath. The colour of the letters shows whether everything is ready. Hover over it for details.

| Icon | Meaning |
|---|---|
| **MCP** in green | Ready: connected to the server, and AboveVTT is running as DM in a campaign tab. |
| **MCP** in orange | Connected to the server, but no usable AboveVTT DM tab: no campaign open, AboveVTT not started, running as a player, or this DM tab is paused because AboveVTT is active as DM somewhere else. |
| **MCP** in yellow | Connecting to the server. |
| **MCP** in grey | Can't reach the server. Is Claude desktop running? |
| **MCP** in red | The token is wrong. Copy it again. |

## 5. Test (all systems)

1. Open your campaign on D&D Beyond **as the DM** and start AboveVTT.
2. **Reload the tab once.** You only need to do this the first time after installing the extension.
3. The toolbar icon should show **MCP** in green, and the extension's options page should list the tab as *AboveVTT running as DM*.
4. In Claude desktop, ask **"Check the AboveVTT status."** You should get something like *Ready: DM in "<campaign>", AboveVTT 1.61, scene "<scene>".*
5. Try a read-only request first, such as **"List my scenes."**

See [README.md](README.md) for everything it can do.

---

## Adding to an existing config

If `claude_desktop_config.json` already lists other servers, add only the `"abovevtt": { … }` part inside `"mcpServers"`. Entries are separated by commas: every entry except the **last** one ends with `},`. If `abovevtt` is the last entry, put a comma after the entry before it and **no** comma after `abovevtt`. A missing comma, or an extra comma after the last entry, makes the file invalid and Claude won't load any of your local servers. For example (Windows paths shown; on a Mac use the paths from the macOS section):

```json
{
  "mcpServers": {
    "some-other-server": {
      "command": "…"
    },
    "abovevtt": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\<you>\\AboveVTT-MCP\\server\\dist\\abovevtt-mcp.mjs"]
    }
  }
}
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Claude has no AboveVTT tools | Check the JSON: commas, correct paths (double backslashes on Windows, full path to `node` on a Mac). Then fully quit and restart Claude desktop. **Settings → Desktop app → Extensions → Local MCP servers** shows the server's state and log. |
| Icon shows MCP in grey | Claude desktop must be running. Then click **Save and connect** again. |
| Icon shows MCP in red | Copy the token again from `bridge-token.txt`. |
| Icon shows MCP in grey, tooltip says Claude is using another browser | Only one browser at a time can be connected. The one with the AboveVTT DM tab is used; if both have one, the first stays. Close AboveVTT in the other browser, or remove the bridge there. |
| A grey overlay says "This DM tab is paused" | AboveVTT is also open as DM somewhere else (the overlay says where), and that one is in use. Close one of them, click **Use here** to switch to this one, or ask Claude to make this the active DM tab. |
| Icon shows MCP in orange | Open the campaign as DM and start AboveVTT. If it's already open, reload the tab. The tooltip says which it is. |
| "no campaign tab is open" | Reload the D&D Beyond campaign tab. |
| "not running as the DM" | Open the campaign from the DM side and start AboveVTT. |
| "could not open port 47321" | Another program is using that port. Add `"env": { "AVTT_BRIDGE_PORT": "47400" }` to the `abovevtt` entry, and set the same port on the extension's options page. |
| `detect_grid` says "Map image not read: … local network" | The scene's map link points at this computer or your home network, which map reading never reaches. Use a map hosted on the internet, or set the grid by hand. |
| A tool says an AboveVTT function wasn't found | AboveVTT was probably updated and changed something inside. Check `status` for the version, and look for a connector update. |

## Updating

1. Replace the files in `<folder>` with the new version.
2. In `chrome://extensions`, click the **reload** icon on AboveVTT MCP Bridge, then **reload the campaign tab**.
3. **Fully quit** Claude desktop (Windows: system tray → **Quit**; Mac: **Cmd+Q**) and start it again so the new server is used.

The token and change log in the `.abovevtt-mcp` folder (Windows: `%USERPROFILE%\.abovevtt-mcp`; Mac: `~/.abovevtt-mcp`) are kept.

## Uninstalling

1. Remove the extension in `chrome://extensions`.
2. Delete the `abovevtt` entry from `claude_desktop_config.json` and restart Claude desktop.
3. Delete `<folder>`. To remove the token and change log too, delete the `.abovevtt-mcp` folder (Windows: `%USERPROFILE%\.abovevtt-mcp`; Mac: `~/.abovevtt-mcp`).

Your AboveVTT campaign data isn't affected by uninstalling.

## For developers

- Server source is in `server/src`. To rebuild the single file, run `npm install` and then `npm run build` in `server/`.
- Each feature is a tool module in `server/src/tools/` plus a handler in `extension/`, registered with `AVTT_MCP.register(name, fn)`.
- Tests in `test/` use jsdom and load the real AboveVTT source from a sibling `../AboveVTT` folder (or set `AVTT_DIR`). Install jsdom, then run e.g. `node test/tokens.test.mjs`.
