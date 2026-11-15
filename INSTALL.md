# Installing AboveVTT MCP

> ⚠️ **Tested only on Windows 11, Google Chrome, Claude desktop for Windows, and AboveVTT 1.61** (the current version as of November 2026). These steps are written for that setup.

About 10 minutes. You'll:

1. Check that Node.js is installed.
2. Put the connector files on your PC.
3. Tell Claude desktop to start the server.
4. Load the Chrome extension and give it the server's token.
5. Test.

## What you need

- **Windows 11.**
- **Google Chrome** with the **AboveVTT** extension installed and working.
- **Claude desktop** for Windows, signed in.
- A D&D Beyond campaign where **you are the DM**. Test in a throwaway campaign first.
- **Node.js 20 or newer**. See step 1.

---

## 1. Check for Node.js

1. Press **Win + X** and choose **Terminal** (or **Windows PowerShell**).
2. Type `node -v` and press Enter.
   - If it shows **v20 or higher** (for example `v22.11.0`), you're set. Also run `where.exe node` and note the path it prints, usually `C:\Program Files\nodejs\node.exe`.
   - If it says `node is not recognized`, or the version is below v20, install Node.js using either:
     - `winget install OpenJS.NodeJS.LTS` in the same terminal, or
     - the **LTS** Windows installer from <https://nodejs.org>, run with the defaults.

     Then **close and reopen** the terminal and run `node -v` again.

## 2. Get the files

Download this repository (**Code → Download ZIP**, then extract it, or `git clone`) to a folder of your choice, for example:

```
C:\Users\<you>\AboveVTT-MCP
```

Below, `<folder>` means that path.

You don't need to run `npm install`. `server\dist\abovevtt-mcp.mjs` is already built.

## 3. Tell Claude desktop about the server

1. In Claude desktop open **Settings → Desktop app → Extensions → Local MCP servers**. Use its button to edit the config, which opens `claude_desktop_config.json` (or its folder). Open the file in Notepad.
   - Or press **Win + R**, type `%APPDATA%\Claude`, press Enter, and open `claude_desktop_config.json`.
   - If Claude was installed from the Microsoft Store or with winget, the file Claude actually reads may be `%LOCALAPPDATA%\Packages\Claude_…\LocalCache\Roaming\Claude\claude_desktop_config.json`. Use the copy that already lists your other local servers, if you have any.
2. Add an `abovevtt` entry inside `"mcpServers": { … }`. Use double backslashes in paths, and put a comma between entries.

   If the file is empty or has no other servers, the whole file is:

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

   If other servers are already listed, add only the `"abovevtt": { … }` part, with a comma after the entry before it.

   Change the `command` path if `where.exe node` printed a different one, and change the `args` path to your `<folder>`.
3. Save. **Fully quit** Claude desktop (right-click its icon in the system tray → **Quit**; closing the window isn't enough) and start it again.
4. **abovevtt** should now appear under **Settings → Desktop app → Extensions → Local MCP servers**.
5. The first time it starts, the server creates a token file: `%USERPROFILE%\.abovevtt-mcp\bridge-token.txt`. Open it in Notepad and copy the line of text. Treat it like a password.

## 4. Install the Chrome extension

1. In Chrome go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose `<folder>\extension`.
4. From the puzzle-piece menu, **pin** "AboveVTT MCP Bridge" so you can see its badge.
5. Click the extension's icon to open its options page. Paste the token, leave the port at **47321**, and click **Save and connect**.

6. Optional, for grid detection: on the same options page click **Allow reading map images** and accept Chrome's prompt. This lets the extension download a scene's map image to measure its grid. You can remove it again from the same page.

The badge shows the connection state:

| Badge | Meaning |
|---|---|
| **ON** (green) | Connected to the server. |
| **OFF** | Can't reach the server. Is Claude desktop running? |
| **KEY** | The token is wrong. Copy it again. |

## 5. Test

1. Open your campaign on D&D Beyond **as the DM** and start AboveVTT.
2. **Reload the tab once.** You only need to do this the first time after installing the extension.
3. The extension's options page should list the tab as *AboveVTT running as DM*.
4. In Claude desktop, ask **"Check the AboveVTT status."** You should get something like *Ready: DM in "<campaign>", AboveVTT 1.61, scene "<scene>".*
5. Try a read-only request first, such as **"List my scenes."**

See [README.md](README.md) for everything it can do.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Claude has no AboveVTT tools | Check the JSON: commas, double backslashes, correct paths. Then fully quit and restart Claude desktop. **Settings → Desktop app → Extensions → Local MCP servers** shows the server's state and log. |
| Badge OFF | Claude desktop must be running. Then click **Save and connect** again. |
| Badge KEY | Copy the token again from `bridge-token.txt`. |
| "no campaign tab is open" | Reload the D&D Beyond campaign tab. |
| "not running as the DM" | Open the campaign from the DM side and start AboveVTT. |
| "could not open port 47321" | Another program is using that port. Add `"env": { "AVTT_BRIDGE_PORT": "47400" }` to the `abovevtt` entry, and set the same port on the extension's options page. |
| A tool says an AboveVTT function wasn't found | AboveVTT was probably updated and changed something inside. Check `status` for the version, and look for a connector update. |

## Updating

1. Replace the files in `<folder>` with the new version.
2. In `chrome://extensions`, click the **reload** icon on AboveVTT MCP Bridge, then **reload the campaign tab**.
3. **Fully quit** Claude desktop and start it again so the new server is used.

The token and change log in `%USERPROFILE%\.abovevtt-mcp\` are kept.

## Uninstalling

1. Remove the extension in `chrome://extensions`.
2. Delete the `abovevtt` entry from `claude_desktop_config.json` and restart Claude desktop.
3. Delete `<folder>`. To remove the token and change log too, delete `%USERPROFILE%\.abovevtt-mcp`.

Your AboveVTT campaign data isn't affected by uninstalling.

## For developers

- Server source is in `server\src`. To rebuild the single file, run `npm install` and then `npm run build` in `server\`.
- Each feature is a tool module in `server\src\tools\` plus a handler in `extension\`, registered with `AVTT_MCP.register(name, fn)`.
- Tests in `test\` use jsdom and load the real AboveVTT source from a sibling `..\AboveVTT` folder (or set `AVTT_DIR`). Install jsdom, then run e.g. `node test\tokens.test.mjs`.
