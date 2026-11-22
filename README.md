# AboveVTT MCP

Lets **Claude desktop** run the prep side of an [AboveVTT](https://github.com/cyruzzo/AboveVTT) game for you. You type plain requests in chat, such as *"Create a folder Chapter 2 with scenes Cave A and Cave B, grid on"* or *"Cult Leader takes 8 damage"*, and Claude makes the change in your D&D Beyond campaign tab.

It's an [MCP](https://modelcontextprotocol.io) connector with two parts:

- **`server/`**: a small Node.js MCP server that Claude desktop starts. It's a single bundled file, `server/dist/abovevtt-mcp.mjs`.
- **`extension/`**: a Chrome extension, **AboveVTT MCP Bridge**, that you install next to AboveVTT. It passes requests from the server to AboveVTT's own code in your campaign tab.

AboveVTT itself is not modified. The connector calls the same functions AboveVTT's buttons and menus use, so changes are saved and sent to players the same way as when you click.

See **[INSTALL.md](INSTALL.md)** for setup.

> ⚠️ See **[AboveVTT MCP compatibility](COMPATIBILITY.md)** for the Windows and Mac setups it has been tested on. AboveVTT changes often, and a future AboveVTT update can break some tools until the connector is updated. The `status` tool reports the AboveVTT version it finds.

---

## What it can do

You need to be the **DM**, with the campaign open in Chrome and AboveVTT running. Every change is also written to a change log on your PC (see [Safety](#safety)).

### Checking the connection
- **`status`**: is the extension connected, is AboveVTT running, are you the DM, which campaign and scene, which AboveVTT version, and whether this DM tab is the active one or paused.
- **`list_dm_tabs`** / **`switch_active_dm_tab`**: where else AboveVTT is open as DM (other tabs, browsers or PCs running the bridge), and, when you ask, making this browser's DM tab the active one. Example: *"Make this the active DM tab."* Claude shows which tab would be paused and waits for your yes.
- **The toolbar icon** shows the same at a glance: AboveVTT's red "A" with **MCP** underneath, and the colour of the letters tells you the state. Hover over it for details, such as which campaign is open, or why it isn't ready.

| MCP colour | Meaning |
|---|---|
| Green | Ready: connected to the MCP server (Claude desktop), and AboveVTT is running as DM in a campaign tab. |
| Orange | Connected to the server, but no usable AboveVTT DM tab: no campaign open, AboveVTT not started yet, running as a player, or this DM tab is paused because AboveVTT is active as DM somewhere else. |
| Yellow | Connecting to the server. |
| Grey | Can't reach the server. Is Claude desktop running? |
| Red | The server rejected the token. Copy it again from `bridge-token.txt` into the extension's options page. |

The icon changes within a few seconds of opening or closing a campaign tab, starting AboveVTT, or Claude desktop starting or stopping. The extensions page and Chrome's menus show the plain AboveVTT icon.

### Scenes
- **`list_scenes`**: the scene tree with folders, and which scene you and the players are on.
- **`get_scene_config` / `update_scene_config`**: read and change the settings in a scene's ⚙ dialog: name, map links, grid (on/off, colour, line width, square size), darkness, weather, vision, snap and more. It saves through AboveVTT's own dialog code, without switching the scene you're on.
- **`detect_grid`**: reads a scene's map image and finds the grid printed on it (square size, offset, dark or light lines), then sets AboveVTT's manual grid data so the two line up, the job of AboveVTT's Super Mega Wizard. It says so when a map has no printed grid. Needs a one-time "Allow reading map images" click on the extension's options page, and only reads maps on the internet (not links to your own computer or network).
- **`create_scene`**: create up to 25 scenes at once, at the top or in a folder, with any of those settings (for example a map link, grid on, 5 ft squares).
- **`create_folder` / `rename_folder`**: scene folders, including folders inside folders, with colours.
- **`move_scene`**: move scenes and folders between folders.
- **`delete_scene` / `delete_folder`**: delete a scene, or a folder in either of AboveVTT's two ways (move its contents up, or delete everything inside). It won't delete the scene you or the players are on.
- **`get_fog` / `set_fog`**: a scene's fog of war. `set_fog` does what the two ALL buttons on the FOG menu do, **hide all** or **reveal all**, on any scene, without opening it. Unlike those buttons it can be undone: the old fog is saved first, and `set_fog` with **restore** puts it back. Drawing individual fog shapes isn't supported.

### Backups and the Settings tab
- **`export_backup`**: AboveVTT's EXPORT button. It downloads a `.abovevtt` backup of the whole campaign to your Downloads folder.
- **`list_backup_files` / `import_backup`**: list your `.abovevtt` files, preview what importing one would change, then import it.
- **`list_settings` / `set_setting` / `reset_setting`**: every option on the Settings tab: AboveVTT settings, token default settings and scene default settings.
- **`run_settings_action`**: the Settings tab buttons:
  - export the current scene, tokens, journal or audio
  - store or clear the grid visual size
  - match the campaign's suggested settings
  - clear all token overrides
  - recover scenes from an old invite link
- **`get_change_log`**: what the connector has changed, and when.

### Journal notes
- **`list_notes` / `get_note`**: browse and read the journal.
- **`create_note` / `update_note` / `delete_note`**: write notes in plain text. Use `# heading`, `- bullet` and `**bold**` for formatting. You can replace, add to the end or add to the start, and share a note with all players or with named players. For small fixes in a long note, `update_note` can **find and replace**, for example *"In Session 3, change Nov 3 to Nov 10 and 45 HP to 52 HP."* Each piece of text must appear exactly once, and if any doesn't, nothing changes. Say **"Replace all"** (for example *"Replace all Goblin with Kobold in Session 3"*) to change every place a piece of text appears: Claude first shows a preview of each place, original → change, and only saves after your yes.
- **`create_note_folder` / `update_note_folder` / `delete_note_folder`**: journal folders.

### Custom creatures (My Tokens)
- **`list_creatures` / `get_creature`**: your My Tokens and their stat blocks.
- **`create_creature` / `update_creature`**: create up to 25 at once. Each can have:
  - image links, token size, border colour
  - two auras, darkvision, light
  - any token setting
  - a **stat block**, given as fields (AC, HP or hit dice, abilities, actions…) or as pasted text

  The stat blocks use the same markers as AboveVTT's stat block editor, so a placed token gets the right **HP, AC and initiative**.
- **`delete_creature`**, **`create_creature_folder` / `delete_creature_folder`**.
- **`find_tokens_to_copy` / `copy_to_my_tokens`**: copy into My Tokens (any folder, any name) from a token already on a scene, or from the Tokens tab's **Monsters** (D&D Beyond), **Open5e Monsters**, **AboveVTT Tokens** and **D&D Beyond Tokens**, up to 25 at once. Monsters get an editable stat block built from D&D Beyond or Open5e. A token copied from a scene keeps its image(s), size, auras, vision and settings, and by default its own AC and max HP. Player characters, doors and Area of Effect templates can't be copied.

### Tokens already on a scene
- **`list_scene_tokens` / `get_token`**: what's on the map, with HP, AC, size, conditions, whether it's hidden, and its note.
- **`update_token`**: change a token's:
  - **name** and **AC**
  - **HP, max HP and temp HP**, or apply **damage** (comes off temp HP first) or **healing** (stops at max HP). If the token has the Concentration marker, the reply gives the save DC.
  - **conditions** (the 15 standard ones), AboveVTT's **markers** (Concentration, Blessed, Rage…) and its **coloured markers** with your own text, with durations in rounds
  - **auras**, **darkvision / light** and **border colour**
  - **image** and **size**
  - any **token setting** (hidden, reveal name, hide HP bar…)

  Changes on your current scene show up live. Changes on other scenes are sent to that scene and then read back to check they were saved.
- **`set_token_note`**: create, change, share or delete the note attached to a token.

### Music
- **`list_tracks` / `add_tracks` / `update_track` / `delete_tracks`**: the Sounds tab's track library, added by public link (for example Dropbox), with **tags**. Tags are how AboveVTT now groups the old soundpads.
- **`list_playlists` / `create_playlist` / `update_playlist` / `delete_playlist`**: the mixer's playlists. A playlist can be built from track names or from everything with a tag.

### Player characters (read-only)
- **`list_characters`**: the party from D&D Beyond, with player, class and level, AC, HP, passive Perception, speed, conditions, inspiration and death saves.
- **`get_character`**: one full sheet: abilities and saves, skills, attacks, spell DC, senses, defences, proficiencies, class features, feats, spells and slots, inventory, money, background and personality. The player's own notes (backstory, allies…) are only included when you ask. Nothing is ever changed on D&D Beyond.

---

## Safety

- **Claude asks before anything permanent.** Deletes, imports, resets and the Settings buttons that change data are previewed first (`dryRun`), and Claude has to wait for your "yes" in chat. The server enforces the preview: the real change needs the single-use `confirmToken` from a preview of exactly the same request (valid 10 minutes), and it is refused if what would change is no longer the same as in the preview. AboveVTT's own pop-up confirmations are not used, because they would freeze the connection.
- **No live-session control.** The connector doesn't switch the players' scene, place tokens on the map, or play, pause or change the volume of music. Those stay with you. It won't edit the playlist that's loaded in the mixer while music is playing. The one exception is `set_fog`: if players are on that scene, they see the fog change at once. By your choice it runs without asking first; the old fog is always saved so it can be restored.
- **Everything is checked before saving.** Unknown setting names, bad colours, links that aren't http(s), duplicate names and similar mistakes are caught before anything is changed.
- **Other scripts on the page can't use the bridge.** The extension runs each command in the campaign tab through Chrome's own scripting API, and gets the result back the same way, so other scripts on the D&D Beyond page (ads, analytics, other extensions) can't send it fake commands or feed Claude fake results. The bridge's entry points in the page are locked once it has loaded. (Code running inside the page could still tamper with AboveVTT itself; no extension can prevent that.)
- **Names can't carry code.** AboveVTT displays many names (scenes, folders, My Tokens, tokens) as raw HTML, so a name like `<img … onerror=…>` would run as code in the page. Names and titles Claude writes may not contain `<` or `>`, and straight quotes become typographic ones (`Bob's` → `Bob’s`). Looking things up by name still works with either kind of quote.
- **Map reading stays on the internet.** The "Allow reading map images" permission is only used for `detect_grid`, without your cookies, and refuses links to this computer or your local network (`localhost`, `192.168.x.x`, `10.x.x.x`, `.local` names and similar), including a public link that redirects there. So a scene's map link can't be used to reach your router, NAS or other local services.
- **One DM tab at a time.** If AboveVTT is open as DM in more than one place (another tab, another browser, or another PC), each DM tab running this bridge finds the others, and only the first one is used. Later DM tabs are **paused**: an overlay covers the page so nothing is changed there by accident, and Claude can read but not change anything through them. Switching is never automatic: click **Use here** in the paused tab and confirm (the Yes button waits 2 seconds to avoid accidental clicks), or ask Claude to switch, which also needs a preview and your yes. If the active tab is closed or its PC goes to sleep, the paused tab says so after about a minute, and still waits for you. DM tabs without this bridge can't be detected.
- **Change log.** Every change is added to `%USERPROFILE%\.abovevtt-mcp\change-log.jsonl`. Ask Claude *"show the change log"*.
- **Local only.** The server listens on `127.0.0.1` only. It accepts only the Chrome extension, which has to present a secret token stored in `%USERPROFILE%\.abovevtt-mcp\bridge-token.txt`. Only one browser can be connected at a time (the one with the active AboveVTT DM tab). Nothing is sent anywhere else, apart from the small "DM tab here" message each DM tab sends every 30 seconds through AboveVTT's own message channel, so other DM tabs can find it. It holds random IDs, the browser name you chose and the bridge version. Players' browsers receive it too, as with all AboveVTT messages, but AboveVTT ignores it and nothing is shown. Like any connector, what Claude reads from your campaign (notes, stat blocks, scene names) becomes part of your Claude conversation.
- **Back up first.** Ask *"back up the campaign"* before big changes. It's AboveVTT's normal export, so you can restore it with AboveVTT's own import.

## Limits

- **DM only**, one active DM tab at a time (see *One DM tab at a time* above).
- **Images and audio are links only.** Uploading files needs AboveVTT's Patreon storage, which isn't supported.
- **Player characters:** their name, HP, AC and standard conditions come from their D&D Beyond character sheet, so AboveVTT doesn't let the DM set those on the token. Markers, auras, image, size, settings and notes do work.
- **The music track library is per browser.** AboveVTT keeps it in Chrome's storage, shared by all your campaigns. Playlists are per campaign.
- **Token edits on another scene** take a few seconds to save, and the reply says whether the change was confirmed.
- **Two PCs:** AboveVTT keeps some data (track library, some settings) in each browser. Syncing between PCs isn't built yet.

## Project layout

```
extension/   Chrome extension (manifest v3). page.js + one file per feature run inside the campaign tab.
             background.js keeps the connection to the server; badge.js decides the toolbar icon; netguard.js keeps map downloads off the local network; icons/ holds the icons;
             presence.js finds other DM tabs and pauses all but the active one; seal.js locks the bridge once
             loaded. relay.js only reports tabs opening and closing; commands run through chrome.scripting.
server/      MCP server. src/ is the source, dist/abovevtt-mcp.mjs the bundled file Claude desktop runs.
test/        jsdom tests that load the real AboveVTT source from a sibling ../AboveVTT folder.
tools/       make_status_icons.py rebuilds the toolbar icons (needs Python and Pillow).
ROADMAP.md   Build history, design decisions and test results for each step.
```

## Not affiliated

This is an independent fan project. It is not made by or affiliated with AboveVTT, D&D Beyond, Wizards of the Coast, or Anthropic.

### Icon credit

The extension's icon is [AboveVTT](https://github.com/cyruzzo/AboveVTT)'s icon, © 2021 Daniele "cyruzzo" Martini and AboveVTT contributors, used under AboveVTT's license, the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html) (AGPL-3.0). `extension/icons/icon16–128.png` are the original, resized. The toolbar icons in `extension/icons/status/` are modified versions: the red "A" is made smaller and "MCP" is added underneath in a colour per state, by `tools/make_status_icons.py`. These icon files remain under AGPL-3.0. Using the icon doesn't mean this project is made or endorsed by AboveVTT. Details: [extension/icons/NOTICE.md](extension/icons/NOTICE.md).
