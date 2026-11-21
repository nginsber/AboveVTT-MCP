# AboveVTT MCP

Lets **Claude desktop** run the prep side of an [AboveVTT](https://github.com/cyruzzo/AboveVTT) game for you. You type plain requests in chat, such as *"Create a folder Chapter 2 with scenes Cave A and Cave B, grid on"* or *"Cult Leader takes 8 damage"*, and Claude makes the change in your D&D Beyond campaign tab.

It's an [MCP](https://modelcontextprotocol.io) connector with two parts:

- **`server/`**: a small Node.js MCP server that Claude desktop starts. It's a single bundled file, `server/dist/abovevtt-mcp.mjs`.
- **`extension/`**: a Chrome extension, **AboveVTT MCP Bridge**, that you install next to AboveVTT. It passes requests from the server to AboveVTT's own code in your campaign tab.

AboveVTT itself is not modified. The connector calls the same functions AboveVTT's buttons and menus use, so changes are saved and sent to players the same way as when you click.

See **[INSTALL.md](INSTALL.md)** for setup.

> ⚠️ **Tested only on Windows 11, Google Chrome, Claude desktop for Windows, and AboveVTT 1.61** (the current version as of November 2026). It may work elsewhere, but that hasn't been tried. AboveVTT changes often, and a future AboveVTT update can break some tools until the connector is updated. The `status` tool reports the AboveVTT version it finds.

---

## What it can do

You need to be the **DM**, with the campaign open in Chrome and AboveVTT running. Every change is also written to a change log on your PC (see [Safety](#safety)).

### Checking the connection
- **`status`**: is the extension connected, is AboveVTT running, are you the DM, which campaign and scene, which AboveVTT version.
- **The toolbar icon** shows the same at a glance: AboveVTT's red "A" with **MCP** underneath, and the colour of the letters tells you the state. Hover over it for details, such as which campaign is open, or why it isn't ready.

| MCP colour | Meaning |
|---|---|
| Green | Ready: connected to the MCP server (Claude desktop), and AboveVTT is running as DM in a campaign tab. |
| Orange | Connected to the server, but no AboveVTT DM tab: no campaign open, AboveVTT not started yet, or running as a player. |
| Yellow | Connecting to the server. |
| Grey | Can't reach the server. Is Claude desktop running? |
| Red | The server rejected the token. Copy it again from `bridge-token.txt` into the extension's options page. |

The icon changes within a few seconds of opening or closing a campaign tab, starting AboveVTT, or Claude desktop starting or stopping. The extensions page and Chrome's menus show the plain AboveVTT icon.

### Scenes
- **`list_scenes`**: the scene tree with folders, and which scene you and the players are on.
- **`get_scene_config` / `update_scene_config`**: read and change the settings in a scene's ⚙ dialog: name, map links, grid (on/off, colour, line width, square size), darkness, weather, vision, snap and more. It saves through AboveVTT's own dialog code, without switching the scene you're on.
- **`detect_grid`**: reads a scene's map image and finds the grid printed on it (square size, offset, dark or light lines), then sets AboveVTT's manual grid data so the two line up, the job of AboveVTT's Super Mega Wizard. It says so when a map has no printed grid. Needs a one-time "Allow reading map images" click on the extension's options page.
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
- **Change log.** Every change is added to `%USERPROFILE%\.abovevtt-mcp\change-log.jsonl`. Ask Claude *"show the change log"*.
- **Local only.** The server listens on `127.0.0.1` only. It accepts only the Chrome extension, which has to present a secret token stored in `%USERPROFILE%\.abovevtt-mcp\bridge-token.txt`. Nothing is sent anywhere else. Like any connector, what Claude reads from your campaign (notes, stat blocks, scene names) becomes part of your Claude conversation.
- **Back up first.** Ask *"back up the campaign"* before big changes. It's AboveVTT's normal export, so you can restore it with AboveVTT's own import.

## Limits

- **DM only**, one campaign tab at a time. If several AboveVTT tabs are open, the tools can be pointed at one.
- **Images and audio are links only.** Uploading files needs AboveVTT's Patreon storage, which isn't supported.
- **Player characters:** their name, HP, AC and standard conditions come from their D&D Beyond character sheet, so AboveVTT doesn't let the DM set those on the token. Markers, auras, image, size, settings and notes do work.
- **The music track library is per browser.** AboveVTT keeps it in Chrome's storage, shared by all your campaigns. Playlists are per campaign.
- **Token edits on another scene** take a few seconds to save, and the reply says whether the change was confirmed.
- **Two PCs:** AboveVTT keeps some data (track library, some settings) in each browser. Syncing between PCs isn't built yet.

## Project layout

```
extension/   Chrome extension (manifest v3). page.js + one file per feature run inside the campaign tab.
             background.js keeps the connection to the server; badge.js decides the toolbar icon; icons/ holds the icons.
server/      MCP server. src/ is the source, dist/abovevtt-mcp.mjs the bundled file Claude desktop runs.
test/        jsdom tests that load the real AboveVTT source from a sibling ../AboveVTT folder.
tools/       make_status_icons.py rebuilds the toolbar icons (needs Python and Pillow).
ROADMAP.md   Build history, design decisions and test results for each step.
```

## Not affiliated

This is an independent fan project. It is not made by or affiliated with AboveVTT, D&D Beyond, Wizards of the Coast, or Anthropic.

### Icon credit

The extension's icon is [AboveVTT](https://github.com/cyruzzo/AboveVTT)'s icon, © 2021 Daniele "cyruzzo" Martini and AboveVTT contributors, used under AboveVTT's license, the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html) (AGPL-3.0). `extension/icons/icon16–128.png` are the original, resized. The toolbar icons in `extension/icons/status/` are modified versions: the red "A" is made smaller and "MCP" is added underneath in a colour per state, by `tools/make_status_icons.py`. These icon files remain under AGPL-3.0. Using the icon doesn't mean this project is made or endorsed by AboveVTT. Details: [extension/icons/NOTICE.md](extension/icons/NOTICE.md).
