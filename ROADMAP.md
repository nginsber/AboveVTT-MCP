# AboveVTT MCP — progress and roadmap

*Updated 21 Nov 2026. Working through review fixes (0.17.2: owner-only token file; 0.18.0: server-enforced preview before deletes, imports and resets; extension 0.18.3: AboveVTT icon with MCP in a colour that shows readiness; 0.19.2: find-and-replace in notes, with previewed replace-all; 0.20.0: one browser connection at a time; 0.22.0: one active DM tab, others paused, switch from chat; 0.23.0: names can't carry HTML; extension 0.24.0: commands through chrome.scripting).*

## What this is

An MCP connector that lets Claude desktop work with AboveVTT, the D&D Beyond virtual tabletop extension, in Chrome. The goal is that you can tell the AI to add, remove and organise scenes, change scene configuration, create custom creatures, edit tokens on scenes, add music and notes, and change the options on AboveVTT's Settings tab.

## How it works

```
Claude desktop ──stdio──► MCP server (Node, your PC) ──ws://127.0.0.1:47321──► Chrome extension "AboveVTT MCP Bridge"
                                                                                   │
                                                                     campaign tab on dndbeyond.com
                                                                     (calls AboveVTT's own functions)
```

- **The MCP server** (`server\dist\abovevtt-mcp.mjs`) is one file with no `npm install` needed. Claude desktop starts it.
- **The companion extension** (`extension\`) is installed next to AboveVTT. A script inside the campaign page calls AboveVTT's own functions. Going through those functions keeps the screen, saved data and players' views in sync.
- **AboveVTT itself is not changed.** It keeps updating normally.
- **Security:**
  - The server only listens on your own PC (127.0.0.1).
  - It only accepts Chrome extensions.
  - The extension has to present a token stored in `%USERPROFILE%\.abovevtt-mcp\bridge-token.txt`.

### Why a browser bridge

Only scenes are stored on AboveVTT's servers. Custom creatures, tokens, notes and the music list live in Chrome's own storage for dndbeyond.com. So the connector has to work inside the open campaign tab rather than call a web API. The details are in the project doc `abovevtt-mcp-feasibility.md`.

## Decisions so far

| Topic | Decision |
|---|---|
| Browser / AI app | Chrome / Claude desktop |
| AboveVTT changes | None. A separate companion extension does the work. |
| Scene order | No custom ordering. Scenes stay in AboveVTT's order (folders first, then A–Z). Organising means moving scenes and folders between folders, and deleting. |
| Uploads | No AboveVTT Patreon, so images and audio are added by link only |
| Testing | Throwaway campaign "Frozen Sick". One step at a time, each tested before the next. |
| Code location | `C:\Users\ginsb\AboveVTT-MCP` |
| Two-PC sync | Planned for a later phase (sync file in the built-in Export format) |
| Step order | As listed. Settings tab stays at steps 8–9. |
| Scene configuration | Through AboveVTT's real configure dialog, run behind the scenes |
| Deleting and importing | Claude asks you in chat before every delete or import. No confirmation flag, no automatic backup. `export_backup` is still available whenever you want one. |
| Live-session tools | Not wanted. No switching the players' scene, placing tokens on the map, or playing music from the connector. Editing tokens already on a scene (step 12) is in. Exception (15 Nov): fog hide all / reveal all on any scene, run without asking first (the old fog is always saved and can be restored). Drawing fog shapes stays out. |

## Completed

### Step 1 — Bridge and `status` ✅ (v0.1.0)

- **Built:**
  - The MCP server.
  - The Chrome extension: background worker, relay, page script and options page.
  - The token check.
  - A `status` tool. It reports whether the extension is connected, which campaign tabs are open, whether you're the DM, the AboveVTT version and the current scene.
- **Added after the first build:** a shared-bridge mode. Claude desktop can start more than one copy of the server, and they now share one connection instead of fighting over the port. The first copy is the "primary"; the others are "peers" that pass their calls through it. If the primary exits, a peer takes over. This is covered by `test\peer-test.mjs`.
- **Setup lessons:**
  - In the current Claude desktop, the config is under **Settings → Desktop app → Extensions → Local MCP servers**. The README is updated.
  - A missing comma in `claude_desktop_config.json` stops every local server from loading.
- **Result:** confirmed working. "Ready: DM in Frozen Sick, AboveVTT 1.61, scene The Tavern."

### Step 2 — `list_scenes` ✅ (v0.2.0)

- **Built:** `list_scenes`, a read-only tree of scenes and folders in the same order as the Scenes panel.
  - Marks the scene the DM is on and the scene players see.
  - Gives each item's ID, which later tools use.
  - Options: search by name, list a single folder, include map links.
- **Result:** confirmed working.

## Upcoming steps

Each step adds a few tools. You test it in Frozen Sick, and the next step starts once you confirm it works. After each step, remember to reload the extension, reload the campaign tab and restart Claude desktop.

### Step 3 — Scene configuration (the configure icon) ✅ (v0.3.0)

- **Tools:**
  - `get_scene_config`: every field in a scene's configure dialog, with its key, current value, and allowed range or choices.
  - `update_scene_config`: change one or more fields and save. Returns a list of what changed, from → to.
- **Which scene:** by ID, by exact title, or by default the scene you're on.
- **Fields (28):**
  - **Maps:** title, map link and "is video", Use DM Map, DM map link and "is video".
  - **Vision:** darkness, vision trail, disable token vision/light.
  - **Grid:** snap to grid, alphanumeric labels, draw grid, grid colour, grid layer, line width.
  - **Atmosphere:** playlist and weather (choices read live from your campaign), weather intensity.
  - **Starting view:** initial X, Y and zoom.
  - **Manual grid data:** grid pixel width and height, offsets, units per square, unit, scale factor.
- **How:**
  - Opens AboveVTT's real configure dialog out of sight and sets each field with AboveVTT's own controls, so its handlers run.
  - Saves with the same steps as the dialog's Save button.
  - One difference: Save in AboveVTT also switches your DM view to the edited scene, and the connector deliberately doesn't. Nothing moves you or the players.
- **Safeguards:**
  - Unknown fields, out-of-range numbers and invalid choices are rejected with the valid options listed.
  - If you have the configure dialog open yourself, the tool asks you to close it first.
  - If the values were already set, nothing is saved.
  - Fields that a future AboveVTT version adds are listed as read-only.
- **Not included:** the Super Mega Wizard, the Dropbox, OneDrive and AVTT file pickers, "Clear player explore data", and "Set initial position to current view". These are interactive, though X/Y/zoom can be set as numbers.
- **Tested:** against AboveVTT 1.61's real dialog code in a simulated page (`test/scene-config.test.mjs`).
- **Your test in Frozen Sick:**
  1. "Show me the configuration of The Tavern."
  2. "Set The Tavern's darkness to 40, turn the grid on in red with line width 2, and set weather to Snow."
  3. Open the scene's cog by hand and check the values. Then put them back.
  4. Edit a second scene that you're not on, and check that you stay on The Tavern.

### Step 4 — Folders and moving ✅ (v0.4.0)

- **Tools:**
  - `create_folder`: name, optional parent folder, optional colour.
  - `rename_folder`: new name and/or colour.
  - `move_scene`: one or more scenes and/or folders, into a folder or to the top level.
- **How:** AboveVTT's own `rename_scene_folder` and `move_scene_to_folder`, plus `persist_scene` and `did_update_scenes`. The Scenes panel refreshes after each change.
- **Which items:** IDs from `list_scenes` or exact titles. If a title matches more than one item, the tool lists them all with their paths and asks for the ID.
- **Safeguards:**
  - Everything is checked before anything moves.
  - A folder can't be moved into itself or one of its subfolders.
  - Folder names can't be empty or contain "/", which AboveVTT uses in folder paths.
  - No two folders with the same name in the same place. AboveVTT allows that, but it makes folders impossible to tell apart by name.
  - Moving an item to where it already is changes nothing.
- **Order:** the panel keeps AboveVTT's automatic order, folders first and then A–Z.
- **Tested:** against AboveVTT 1.61's real folder functions in a simulated page (`test/scene-folders.test.mjs`).
- **Your test in Frozen Sick:**
  1. "Create a folder called Test Chapter, coloured blue."
  2. "Create a folder called Town inside Test Chapter."
  3. "Move The Tavern into Town."
  4. "Rename Town to Phandalin." Then: "Move Phandalin to the top level."
  5. Check the Scenes panel after each step. Then: "Move The Tavern back to the top level."
  6. The empty test folders can be deleted by hand for now, or with step 6 later.

### Step 5 — Safety net ✅ (v0.5.0; extension 0.5.1 fixes the soundpad count showing "?")

- **Tools:**
  - **`export_backup`:** runs AboveVTT's built-in Export, the same as the EXPORT button on the Settings tab. Chrome downloads a `.abovevtt` file named like `Frozen Sick-2026-11-14.abovevtt` into Downloads.
    - **Contents:** all scenes, custom tokens, notes, journal chapters, soundpads, mixer state and the music library. Explored fog isn't included.
    - **Restoring:** use AboveVTT's Import.
    - **Report:** what the file contains, for example 20 scenes in 3 folders, 5 token customizations and 4 notes.
  - **`get_change_log`:** every change made through the connector, newest first, with time, campaign and what it did. Can be filtered by tool or searched by name, for example "tavern".
- **Change log file:** `%USERPROFILE%\.abovevtt-mcp\change-log.jsonl`, shared by every copy of the server.
  - Logged: saved scene changes, folder creates and renames, moves and backups. Later steps add their own.
  - Not logged: changes that turned out to be no-ops, and anything you do by hand in AboveVTT.
  - Logging starts with this version, so the step 3–4 test changes aren't in it.
- **How it detects a finished export:**
  - For big campaigns, AboveVTT's Export switches to a slower method and reports "done" before it has finished. So the tool waits for the timestamp AboveVTT saves when an export really completes. The default wait is 3 minutes, and it can be raised to 15.
  - If AboveVTT shows an export error, the tool reports it straight away and clears the stuck spinner.
- **Tested:** against AboveVTT 1.61's real `export_file` code, on the fast path, the slow path and a failure (`test/backup.test.mjs`), plus an end-to-end change-log test.
- **Your test in Frozen Sick:**
  1. "Back up the campaign." Check that the file appears in Downloads. Chrome may ask once whether to allow downloads from dndbeyond.com.
  2. "Create a folder called Log Test", then "Move Map 2.1: The Sanctum into Log Test", then "Move it back to the top level".
  3. "Show the change log." It should list those changes and the backup.

### Step 6 — Deleting ✅ (v0.6.0)

- **Tools:**
  - **`delete_scene`:** one or more scenes. The scene's attached scene note is deleted too, as in AboveVTT.
  - **`delete_folder`:** works in one of two modes, matching AboveVTT's two folder-delete buttons.
    - `moveContentsUp` (the default) moves everything directly inside the folder up one level, then deletes the folder.
    - `deleteEverything` deletes the folder and every scene and subfolder inside it.
- **Preview:** both tools have a `dryRun` option that shows exactly what would be deleted or moved, without changing anything.
- **Confirmation (your choice):** Claude asks you in chat and waits for your yes before every delete. The tool descriptions tell Claude to do a dry run first, show you the result and wait. The tools are also marked as destructive, so Claude desktop can prompt as well.
- **How:** AboveVTT's own buttons pop up a browser confirmation box, which would freeze the connector. So the tools call the functions behind those buttons directly:
  - `ScenesHandler.delete_scene` for scenes.
  - `move_scenes_to_parent_folder` + `delete_scenes_folder` for `moveContentsUp`.
  - `delete_folder_and_all_scenes_within_it` for `deleteEverything`.
- **Safeguards beyond AboveVTT:**
  - A scene can't be deleted while you or the players are on it. Switch scenes first.
  - The same goes for any scene inside a folder being deleted with `deleteEverything`.
  - Folders must be deleted with `delete_folder`, not `delete_scene`.
  - Moving contents up warns if it would put two folders with the same name side by side.
- **Logged:** every real delete goes in the change log. Dry runs aren't logged.
- **Known display glitch:** after "move contents up", the Scenes panel once showed the moved folder twice. AboveVTT's data held only one copy, and reloading the tab fixed the display. The connector uses the same three AboveVTT calls as AboveVTT's own button. A later fix could rebuild the panel after deletes.
- **Tested:** against AboveVTT 1.61's real delete functions in a simulated page (`test/delete.test.mjs`).
- **Your test in Frozen Sick:** the three empty test folders (Test Chapter, Phandalin, Log Test) are ready.
  1. "Delete the Log Test folder." Claude should show what will happen and ask before doing it.
  2. "Create a folder Del Test, create a folder Inner inside it, then delete Del Test and move its contents up." Inner should end up at the top level.
  3. "Delete Test Chapter, Phandalin and Inner."
  4. "Delete The Tavern." This should be refused, because you're on it.
  5. "Show the change log."

### Step 7 — Creating scenes ✅ (v0.7.0)

- **Tool:** `create_scene` creates one or more scenes (up to 25 per call) at the top level or in a folder. Each one takes a title, an optional map link (a public image or video web link) and optional settings, using the same field names as `get_scene_config`.
- **How:** the same route as AboveVTT's own Dropbox import:
  - `create_scene_inside` builds each scene. It applies AboveVTT's defaults and your default scene settings, detects video maps and UVTT files automatically, and adds a number when a name is already taken in that folder ("Ruins" → "Ruins 1").
  - `AboveApi.migrateScenes` then saves the batch, and `did_update_scenes` refreshes the panel.
  - Unlike AboveVTT's plain "New Scene" button, no configure dialog pops up, and nobody is moved to the new scene.
- **Settings in the same call:** for example grid on, 70-pixel squares and darkness 30. These are applied through the step 3 configure-dialog tool and reported from → to.
- **Safeguards:**
  - Titles are required.
  - Map links must be http(s); "data:" links are rejected because they crash AboveVTT.
  - The destination folder must exist.
  - Setting names are checked before anything is created.
  - If AboveVTT's server refuses the save, the half-created scenes are removed from the panel again.
  - A setting value that turns out to be invalid, such as darkness 500, is reported for that scene. The scene itself is still created.
- **Logged** in the change log.
- **Tested:** against AboveVTT 1.61's real scene-building code in a simulated page (`test/scene-create.test.mjs`).
- **Your test in Frozen Sick:**
  1. "Create a scene called Test Map using https://i.pinimg.com/originals/a2/04/d4/a204d4a2faceb7f4ae93e8bd9d146469.jpg", which is The Tavern's map.
  2. "Create a folder Step 7, and in it create scenes Cave A and Cave B with no map, grid on, 5 ft squares."
  3. "Create a scene called Test Map again." It should come out as "Test Map 1".
  4. Open one of the new scenes yourself to check it, then come back to The Tavern.
  5. Clean up: "Delete Test Map, Test Map 1 and the Step 7 folder with everything in it." Claude asks first.

### Step 8 — Settings tab: options ✅ (v0.8.0; extension 0.8.1 stores colour names like "red" as rgba and stops flagging default colours as changed)

- **Tools:**
  - `list_settings`: options with current value, default, choices or range, and help text. Can be filtered by group, by search text, or to "changed from default only".
  - `set_setting`: change several options in a group at once.
  - `reset_setting`: reset chosen options, or a whole group.
- **Three groups, matching the Settings tab:**
  - **`aboveVTT`** (25 options): UI, streaming/P2P, performance, debugging, and the grouped options "Quick Toggle Defaults on Load", "Numkey Quick Roll options" and "Campaign Suggested Defaults". For grouped options, only the sub-options you name change. Each option shows whether it applies to all campaigns in this browser or just this campaign.
  - **`tokenDefaults`** (26): every Token Settings Defaults option plus the 5 vision and light colours.
  - **`sceneDefaults`** (10): the Scene Settings Defaults, used by step 7 when new scenes are created.
- **How:** the option lists come from AboveVTT's own definitions (`avtt_settings()`, `token_setting_options()`, `scene_setting_options()`), so new options in future AboveVTT versions appear automatically. Changes are saved the way the tab saves them:
  - `set_avtt_setting_value` runs the same side effects, such as switching the icon UI or colour-blind text straight away.
  - Quick toggles update straight away.
  - Campaign suggested defaults are saved to AboveVTT's server for your players.
  - Token and scene defaults use `persist_token_settings` and `persist_default_scene_settings`.
  - The Settings tab redraws if it's open.
- **Safeguards and notes:**
  - Every value is checked before anything changes, against the valid choices, ranges and colours.
  - AboveVTT's own Auto Reconnect warning is passed on.
  - Resetting all `aboveVTT` options is the tab's "Reset to Defaults" button, and resetting all `sceneDefaults` is "Reset Scene Defaults". Claude asks before resetting a whole group.
  - These settings are stored in this browser, except Campaign Suggested Defaults, which are saved for the campaign. That matters for the later two-PC sync phase.
- **Not here:** the Settings tab buttons (Export, Import, Export Current Scene, Recover Scenes, the specific exports, Store Grid Visual Size, Match DM Suggested Settings, and "Clear All Token Option Overrides") are step 9.
- **Tested:** against AboveVTT 1.61's real settings code in a simulated page (`test/settings.test.mjs`).
- **Your test in Frozen Sick:**
  1. "Show my AboveVTT settings that differ from the defaults."
  2. "Turn on Red/Green Colorblind Text and set Export Reminder to Weekly." Check the Settings tab.
  3. "Set my default token style to Square and turn on Show name to players."
  4. "Make new scenes default to a red grid that's switched on."
  5. Put it all back: "Reset those settings to their defaults."

### Step 9 — Settings tab: buttons ✅ (v0.9.0; 0.9.1 lists scene folders separately in the import preview)

- **Tools:**
  - `list_backup_files`: `.abovevtt` files in Downloads (or another folder), newest first.
  - `import_backup`: the IMPORT button.
  - `run_settings_action`: every other button.
- **What each button maps to:**

  | Settings tab button | Connector |
  |---|---|
  | EXPORT | `export_backup` (step 5) |
  | IMPORT | `import_backup` |
  | EXPORT CURRENT SCENE | `run_settings_action` → `exportCurrentScene` |
  | TOKEN CUSTOMIZATIONS / JOURNAL / AUDIO | `exportTokenCustomizations` / `exportJournal` / `exportAudio` |
  | Recover Scenes | `recoverScenes` |
  | Store Grid Visual Size (Store / Clear) | `storeGridVisualSize` / `clearGridVisualSize` |
  | Match DM Suggested Settings | `matchCampaignSettings` |
  | Clear All Token Option Overrides (in Token Settings Defaults) | `clearAllTokenOptionOverrides` |
  | Reset to Defaults / Reset Scene Defaults | `reset_setting` (step 8) |
  | Token / Scene Settings Defaults "Edit" | `set_setting` (step 8) |

- **Import, without the file picker:**
  - The connector's server on your PC reads the `.abovevtt` file, either by name from Downloads or by full path, up to 200 MB.
  - It hands the file to AboveVTT's own `import_process_datafile_text`, then saves the scenes with `AboveApi.migrateScenes`, the same steps as the IMPORT button.
  - The preview shows what the file contains and what it would replace: scenes with the same ID, token customizations, notes, the music library and the mixer state.
  - Afterwards the AboveVTT tab reloads, as AboveVTT itself does after an import.
- **Recover Scenes, without the pop-up box:** pass the old invite link or its code. You can also pick one of AboveVTT's remembered previous links, which are shown masked because they're campaign keys. The preview lists the scenes found. As in AboveVTT, the link must belong to this campaign, and the tab reloads afterwards.
- **Asking first:** Import, Recover Scenes, Match DM Suggested Settings and Clear All Token Option Overrides all change data. Claude previews each one, tells you exactly what will happen and waits for your yes. The exports and grid-size buttons just run.
- **Worth knowing:**
  - Clear All Token Option Overrides keeps only each token's name, alternative images and stat-block link, so custom creatures also lose their HP, AC and size. The preview says so.
  - AboveVTT's own Match DM Suggested Settings button saves the settings without the actual values (an AboveVTT bug). The connector saves them properly.
- **Logged:** real runs go in the change log; previews don't.
- **AboveVTT display issue found while testing:** after storing a grid visual size, AboveVTT 1.61 draws its quick-toggle button as a tiny dot between the eye and fit-to-screen buttons, even after a reload. The button is AboveVTT's own (`Main.js`), and its icon seems to have no size. Worth reporting to AboveVTT. The stored value itself works.
- **Tested:** against AboveVTT 1.61's real export, import and token-customization code (`test/settings-actions.test.mjs`), including an export → import round trip, plus an end-to-end test of reading files from Downloads.
- **Your test in Frozen Sick:**
  1. "Export the current scene" and "Export the journal." Check Downloads.
  2. "List my backup files."
  3. "What would importing Frozen Sick-2026-11-14.abovevtt change?" This is a preview only.
  4. Optional: actually import that file. It's tonight's backup, so the result should be identical. The tab reloads afterwards.
  5. "Store the grid visual size", then "Clear the grid visual size."

### Step 10 — Notes ✅ (v0.10.0; extension 0.10.1 lists each player name once, shares with every entry under that name, and stops showing stat blocks as "all players")

- **Tools:**
  - `list_notes`: the Journal tab's folders and notes as a tree, with who can see each one. It can also list scene notes, token notes, creature stat blocks or all notes, and search titles and text.
  - `get_note`: read one note.
  - `create_note`: in a journal folder, with text and visibility.
  - `update_note`: rename; replace, append or prepend text; change who can see it; move it to another folder. Works on journal, scene and token notes.
  - `delete_note`.
  - `create_note_folder`, `update_note_folder` (rename, move, share with players) and `delete_note_folder`.
- **Visibility:** DM only (the default), all players, or named players. AboveVTT's own player list is used, so "Aria" maps to her user ID. A whole folder can be shared too, which makes everything in it visible.
- **Text:**
  - Plain text by default. A blank line starts a new paragraph, and `# heading`, `- bullets`, `**bold**` and `*italic*` are understood.
  - HTML can be passed instead.
  - Everything is run through AboveVTT's own sanitizer (`basic_sanitize_html`), the same one its note editor uses.
  - Notes are limited to about 100,000 characters, because AboveVTT can't send bigger notes to players.
- **How:**
  - Changes go into `window.JOURNAL` and are saved with `JOURNAL.persist()`.
  - Visibility uses `JOURNAL.note_visibility`, and folder sharing uses `JOURNAL.share_chapter`.
  - Players are sent the same `custom/myVTT/note` and `JournalChapters` messages the journal sends. The Journal tab redraws.
  - A token whose note changes is redrawn, so its note icon updates.
- **Safeguards:**
  - Deleting a note, or a folder with its subfolders and notes (as the journal's own Delete does), is previewed and asked about first.
  - A note open in AboveVTT's editor can't be changed until you close it, so neither set of edits overwrites the other.
  - Notes from D&D Beyond books can't be edited.
  - Creature stat blocks are left to step 11.
  - Folders can't be moved into themselves.
  - Old journal folders without an ID get one automatically.
- **Not here:** "Force open by players" pop-ups, note pins on maps, and the player-side journal.
- **Tested:** against AboveVTT 1.61's real journal methods and HTML sanitizer in a simulated page (`test/notes.test.mjs`).
- **Your test in Frozen Sick:**
  1. "List my notes."
  2. "Create a journal folder called MCP Test, and in it a DM-only note 'Barkeep Bob' saying he runs the bar and owes the party 5 gp."
  3. "Add 'Knows about the cult' to Barkeep Bob." Then: "Share Barkeep Bob with all players."
  4. Open the note in the Journal tab and check the text and the share icon.
  5. Clean up: "Delete the MCP Test journal folder." Claude asks first.

### Step 11 — Custom creatures and My Tokens ✅ (v0.11.0)

- **Tools:**
  - `list_creatures`: the My Tokens tree, with size, image count and the AC/HP/initiative/CR read from each stat block.
  - `get_creature`.
  - `create_creature`: up to 25 at once, at the top level or in a folder.
  - `update_creature`.
  - `delete_creature`.
  - `create_creature_folder` and `delete_creature_folder`.
- **What a creature can have:**
  - Name.
  - Images: public links, with several allowed; AboveVTT picks one when placing. Video links are flagged as video tokens.
  - Token size: Tiny, Small/Medium, Large, Huge or Gargantuan.
  - Border colour, two auras, darkvision, inner and outer light.
  - Any of the token settings from step 8, such as Square style, Show name to players, Hidden, or Max HP Calculation.
  - A **stat block**, which can be given in one of three ways:
    - **Fields:** size/type/alignment, AC (with note), HP and hit dice, speed, initiative, the six ability scores, saves, skills, resistances/immunities, senses, languages, CR, and traits, actions, bonus actions, reactions and legendary actions.
    - **Pasted text.**
    - **HTML.**
- **How HP/AC work:** AboveVTT has no separate HP or AC fields for My Tokens. It reads them from the stat block every time the token is placed, applying the Max HP Calculation setting (average, roll, max, advantage, disadvantage). The connector writes stat blocks with the same markers AboveVTT's stat block editor uses (`custom-ac`, `custom-avghp`, `custom-hp-roll`, `custom-initiative`, `custom-challenge-rating`). HP is worked out from the hit dice if only those are given, and initiative defaults to the DEX modifier.
  - **Tested:** AboveVTT's own placement code reads the right HP, AC and initiative from the stat blocks the connector writes.
- **How it saves:**
  - `TokenCustomization.MyToken` / `.Folder` with `persist_token_customization`.
  - The stat block note is saved in the same shape AboveVTT uses (journal note with `statBlock: true`, ID = creature ID).
  - Deleting uses AboveVTT's `delete_token_customization_by_type_and_id`, which also deletes the stat block.
  - The Tokens panel refreshes.
- **Safeguards:**
  - Everything is checked first: sizes, setting names and values, colours, and image links (http(s) only).
  - A stat block is given one way only.
  - A taken name gets a number added, as in AboveVTT.
  - Changing a stat block that's open in AboveVTT's editor is refused.
  - Deletes are previewed and asked about first.
  - Default aura, light and darkvision colours are filled in when only a distance is given.
- **Small fixes to make (found in your test, cosmetic):** the image count shows 99 for creatures with many images (check whether that's a cap); a size saved as `sizeId` is listed as "default"; `get_creature` text splits the ability-score table one value per line.
- **Not here:** tokens already placed on maps keep their values when a creature changes; editing those is step 12. Uploading image files needs Patreon, so images are links only.
- **Tested:** against AboveVTT 1.61's real `TokenCustomization` class, its save and delete functions, and its token-placement stat block reader (`test/creatures.test.mjs`).
- **Your test in Frozen Sick:**
  1. "List my custom creatures."
  2. "Show me the Goblin Boss."
  3. "Create a My Tokens folder 'MCP Test' with a creature 'Cultist': medium humanoid, AC 12 leather armor, 2d8 hit points, DEX 12, CR 1/8, a Scimitar action (+3 to hit, 1d6+1 slashing), with a red 10 ft aura." Give it an image link if you have one.
  4. Drag Cultist onto the map. Check that it shows 9 HP and AC 12, with the aura.
  5. "Make Cultist Large and give it 60 ft darkvision", then place another.
  6. Clean up: delete the placed test tokens by hand, then "Delete the MCP Test creature folder with everything in it." Claude asks first.

### Step 12 — Tokens on scenes ✅ (v0.12.0; 0.12.1 waits up to ~12 s when checking another scene and shows condition durations)

- **Tools:**
  - `list_scene_tokens`: the tokens on a scene (the DM's current scene unless another is named), with kind (player / monster / custom creature / token), HP, AC, size, conditions, hidden and whether it has a note. Doors, walls and AoE templates are left out unless asked for.
  - `get_token`: everything about one token, including its other images, auras, vision/light, settings, linked stat block and note.
  - `update_token`: change any of these, one or many at once, with `dryRun` to preview:
    - **Name** (the token's note is retitled too, as AboveVTT does).
    - **AC.**
    - **HP:** max HP, current HP, temp HP, or `damage` / `heal`. Damage comes off temp HP first; healing stops at max HP. If a token with the Concentration marker takes damage, the reply gives the save DC (10 or half the damage).
    - **Conditions and markers:** the 15 standard conditions, AboveVTT's named markers (Concentration, Reaction Used, Flying, Burning, Rage, Blessed, Baned, Bloodied, Advantage, Disadvantage, Bardic Inspiration, Hasted) and the 10 coloured markers with your own text. Optional duration in rounds. Add, remove or clear all.
    - **Auras:** inner/outer, feet and colour. Setting an aura switches "show auras" on.
    - **Darkvision, inner/outer light, border colour.**
    - **Image:** a new link (the old one stays as an alternative, like AboveVTT's change-image panel) or one of the token's other images.
    - **Size:** Tiny to Gargantuan or a number of squares.
    - **Token settings:** any per-token setting, e.g. hidden, reveal name, square style, hide HP bar.
  - `set_token_note`: create, change (replace/append/prepend), share (DM only / all players / named players) or delete a token's note. Deleting is previewed and asked about first.
- **Player characters:** their name, HP, AC and standard conditions come from the D&D Beyond sheet; AboveVTT only whispers the player if the DM tries. The tool refuses those and says so. Markers, auras, vision, image, size, settings and notes work.
- **How it saves:**
  - **DM's current scene:** changes the live token like AboveVTT's token menu, then `place_sync_persist()` (redraw + save + send to players). Hidden/shown goes through `hide()` / `show()`, size through `Token.size()`. The combat tracker copy is updated too.
  - **Other scenes (experimental):** reads the scene with `AboveApi.getScene`, sends the changed token with AboveVTT's own `custom/myVTT/token` message addressed to that scene (what `Token.sync(sceneId)` does), then reads the scene back after a moment and says whether the change was saved. Your test: the Abjurer Archmage's AC change on Map 2.1 was saved, but only showed up after a few seconds, so 0.12.1 checks for longer.
- **Also in this release (step 11 fixes):**
  - Creature sizes saved as a D&D Beyond size id (like Skrix) now show their real size instead of "default"; no size at all shows as "Small/Medium (default)".
  - The image count counts each link once. (Fire Mage really does have 99 images.)
  - Stat block text from D&D Beyond puts each ability score on one line.
- **Tested:** against AboveVTT 1.61's real `Token` class (HP getters, `hasCondition`, conditions list), its condition lists and token settings (`test/tokens.test.mjs`), plus all earlier tests.
- **Your test in Frozen Sick** (on the DM's current scene, with a monster or custom creature token placed by hand, e.g. a Cultist):
  1. "What tokens are on this scene?"
  2. "Rename Cultist to Cult Leader, set AC 15, max HP 30, HP 22 and 5 temp HP."
  3. "Cult Leader takes 8 damage." (Expect 19/30, no temp HP.) Then "Heal Cult Leader 50." (Expect 30/30.)
  4. "Make Cult Leader Poisoned and Prone for 2 rounds, add a red marker saying Hexed."
  5. "Give Cult Leader a 10 ft red aura and 60 ft darkvision, make it Large, and turn on hide HP bar."
  6. "Change Cult Leader's image to <a link>."
  7. "Add a DM-only note to Cult Leader: Carries the cellar key." Then "Share it with all players."
  8. Optional, experimental: "Set the AC of <a token on another scene> to 18," then open that scene to see whether it stuck.
  9. Clean up by hand, or "Delete Cult Leader's note" (Claude asks first) and delete the token yourself.

### Step 13 — Music library and playlists ✅ (v0.13.0)

- **What AboveVTT 1.61 actually has:**
  - **Track library** (Sounds tab): tracks with a name, a link and tags. It lives in this Chrome's local storage and is **shared by all your campaigns**.
  - **Soundpads** from older AboveVTT versions were converted by AboveVTT into tags, so "soundpads" are now just tags.
  - **Mixer playlists**, per campaign. Each holds its own copies of tracks; one is loaded in the mixer at a time.
- **Tools:**
  - `list_tracks` (search, or one tag), with how many tracks each tag has.
  - `add_tracks`: up to 50 at once by public link, with tags. A link already in the library is skipped; a taken name gets a number.
  - `update_track`: rename, change link, set / add / remove tags.
  - `delete_tracks`: by name, id, or every track with a tag. Previewed and asked about first.
  - `list_playlists`, `create_playlist` (from track names or a tag, optional loop), `update_playlist` (rename, add, remove), `delete_playlist` (asked first).
- **Never plays anything:**
  - A new or edited playlist that isn't loaded in the mixer is saved as plain data: no sound, nothing sent to players.
  - The loaded playlist's tracks can only be changed while the mixer is paused, and new tracks go in paused.
  - Loading a playlist, playing, pausing and volume stay with you, and the loaded playlist can't be deleted.
- **How it saves:** `TRACK_LIBRARY._write()` (saves and redraws the Sounds panel, like the Add Track button) and the mixer's own `_write()`.
- **Not here:** uploading audio files (needs Patreon storage), token sounds placed on maps (live-session).
- **Tested:** against AboveVTT 1.61's real `Library`, `TrackLibrary` and `Mixer` classes (`test/music.test.mjs`): AboveVTT's own `find()` sees added tracks, creating a playlist triggers no audio sync, the loaded playlist is refused while playing.
- **Your test in Frozen Sick:**
  1. "List my music." (Shows what's already in the library and its tags.)
  2. "Add a track 'MCP Test Rain' from <a public mp3 link>, tagged MCP Test and Ambience." Check it appears in the Sounds tab.
  3. "Tag MCP Test Rain with Weather too, and rename it MCP Test Storm."
  4. "Create a playlist 'MCP Test' with every MCP Test track, looping." Check the playlist dropdown in the mixer; nothing should start playing.
  5. "List my playlists."
  6. Clean up: "Delete the MCP Test playlist" and "Delete every track tagged MCP Test." Claude asks first each time.


### Fog — hide all / reveal all (v0.16.0; 0.16.1 stops asking before each change) — hide/reveal on the current scene confirmed in Prisoner 13

- **How AboveVTT stores fog:** a list of fog zones per scene (`window.REVEALED` for the open scene, `reveals` in the saved scene). An empty list hides the whole map; `[[0,0,0,0,2,0]]` reveals it. The FOG menu's two ALL buttons write exactly those values, then call `redraw_fog()` and `sync_fog()`.
- **Tools:**
  - `get_fog`: fully hidden / fully revealed / partly revealed, how many zones and of which shapes, whether players are on the scene, and the saved copies that can be restored.
  - `set_fog`: `hideAll`, `revealAll` or `restore` (`backup: 1` = newest), with `dryRun`.
- **Current scene:** the same steps as the ALL buttons, without their confirm() pop-up (it would freeze the connection).
- **Other scenes:** AboveVTT's own `custom/myVTT/fogdata` message addressed to that scene, like token edits on other scenes. Players on that scene see it at once; otherwise it shows when they next go there.
- **Checked and undoable:** the scene is read back with `AboveApi.getScene()` (up to ~12 s). Before each change the old fog is saved to `%USERPROFILE%\.abovevtt-mcp\fog-backups\<scene id>\`, keeping the last 20 per scene, and the change is added to the change log. A restore saves a copy too, so it can be undone as well.
- **Not asked first (your choice, 15 Nov):** Claude runs fog changes directly and reports the result, including whether players are on the scene. `dryRun` still gives a preview on request.
- **Not here:** drawing or erasing individual fog shapes (live map work).
- **Tested:** `test/fog.test.mjs` checks that the values match AboveVTT 1.61's ALL buttons in `Fog.js`, and runs AboveVTT's real `sync_fog()` on the current scene, another scene, dry run, no-op, restore and errors. `test/fog-tool.test.mjs` covers the server side: wording, saved copies, restore and the change log.
- **Your test in Frozen Sick:**
  1. "What's the fog on The Tavern?"
  2. "Hide all the fog on The Tavern." The map should go fully dark in a player view.
  3. "Reveal all the fog on The Tavern," then "Put The Tavern's fog back to how it was before." The original fog should return.
  4. Pick a scene you're **not** on and hide all its fog. Then open it and check.

### Copy into My Tokens (v0.17.0; 0.17.1 fixes monster size) — monster copy confirmed live (Aboleth)

- **Tools:**
  - `find_tokens_to_copy`: search Monsters (D&D Beyond's monster search, with the Tokens tab's filters), Open5e Monsters, AboveVTT Tokens and D&D Beyond Tokens by name. Shows ids, CR, book (2014 / 2025) and legacy flags.
  - `copy_to_my_tokens`: up to 25 items, into any My Tokens folder, optional new name (a taken name gets a number). Sources:
    - **scene**: a token already placed, on the current or another scene. Copies image(s), size, auras, vision/light and token settings, but not position, current HP, conditions, hidden or the token's note. Stat block: copied from a custom creature, fetched for a D&D Beyond / Open5e monster, or made from AC and max HP for a plain token. The token's own AC / max HP go into the copy's stat block when they differ (`keepOriginalStats: true` to keep the book values).
    - **monster** / **open5e**: by exact name or id. Same as AboveVTT's "Copy to My Tokens": image, size, darkvision/truesight/devil's sight, and an editable custom stat block (`build_monster_copy_stat_block`). A name in more than one book (e.g. Goblin 2014 and 2025) asks which. Monsters you don't own on D&D Beyond are copied without stats.
    - **aboveVTT** / **ddbToken**: same as AboveVTT's "Copy to My Tokens" for those folders (`duplicate_my_token`): images and settings, no stats.
  - Refused: player characters, doors/walls, Area of Effect templates (AboveVTT has no copy for them either).
- **Size fix (0.17.1):** AboveVTT places a My Token by its size setting (`tokenSize`) only and ignores the D&D Beyond size (`sizeId`), so a copied Large monster came out Small/Medium. Copies now get `tokenSize` from the monster's size (Tiny 0.5, Large 2, Huge 3, Gargantuan 4). AboveVTT's own "Copy to My Tokens" has the same problem. `get_creature` / `list_creatures` now report the size that will actually be placed.
- **Differences from AboveVTT's menu:** any folder and name, no configuration panel popping up, and the reply says what was copied. Monster details are fetched with `fetch_monsters()` directly, because `fetch_and_cache_monsters` is debounced and drops all but the last of several quick calls.
- **Tested:** `test/copy-tokens.test.mjs`, against AboveVTT 1.61's real `TokenCustomization`, `SidebarListItem`, `find_token_options_for_list_item`, `random_image_for_item`, `get_monster_senses` and monster caches. AboveVTT's own placement code reads the copies' AC and HP, including the token-value overrides. D&D Beyond / Open5e network calls are stand-ins.
- **Your test in Frozen Sick:**
  1. "Find goblin to copy." Check the 2014 / 2025 versions are listed.
  2. "Copy the 2025 Goblin and the Bugbear Warrior into My Tokens folder <folder>." Check the Tokens tab and open a stat block.
  3. "Copy a barrel from AboveVTT Tokens."
  4. Change a placed monster's max HP, then "Copy <that token> to My Tokens." Place the copy and check its HP.
  5. Clean up with delete_creature.

### Review fixes (from a user's code review, 21 Nov 2026)

Worked through in this order: 5, 1, 4, 6, 3, 2.

- **5. Token file owner-only (server 0.17.2; extension unchanged).** `%USERPROFILE%\.abovevtt-mcp` is created as 0700 and `bridge-token.txt` as 0600; an older folder or token file that others can read is tightened on start. This only matters on macOS / Linux (Windows ignores file modes; the user profile is already private). The token is created with "fail if it exists", so several copies of the server starting at once now always share one token. Before, two could each write their own and one would be refused with KEY. Tested on Linux: fresh install, old 755/644 install, empty token file, eight copies at once, and `AVTT_BRIDGE_TOKEN` set.
- **1. Preview-and-confirm enforced by the server (server and extension 0.18.0).** Guarded tools: every delete tool (`delete_scene`, `delete_folder`, `delete_note`, `delete_note_folder`, `delete_tracks`, `delete_playlist`, `delete_creature`, `delete_creature_folder`), `import_backup`, `reset_setting`, and `run_settings_action` for `matchCampaignSettings`, `clearAllTokenOptionOverrides` and `recoverScenes` with an old link (exports, grid size and listing old links aren't guarded). A `dryRun` preview returns a `confirmToken`; the real call needs it. The token is single-use, lasts 10 minutes, and must match the tool, the exact options and the tab. Just before the change, the server runs the preview again and refuses if the result differs (e.g. a scene was added to the folder). For `import_backup` the token matches the file's path, size and date instead (a large file isn't sent twice). The descriptions still tell Claude to show the preview and wait for the user's yes in chat. New: `server/src/confirm.js`; `reset_setting` gained `dryRun` (extension `settings.js`); the change log never records tokens. Tested: `test/confirm.test.mjs` (76 checks: every guarded tool, wrong request, other tool, other tab, changed state, expiry, made-up token, changed import file, change log) and new preview checks in `test/settings.test.mjs`.
- Known flaky test (not from this work): `test/fog-tool.test.mjs` "restore missing copy refused" fails about 1 run in 4; two fog backups saved in the same instant seem to overwrite each other.
- **4. Badge shows whether AboveVTT is ready (extension 0.18.1; server unchanged).** **DM** green = connected and an AboveVTT tab is running as DM; **ON** orange = connected but no DM tab (none open, AboveVTT not started, or as a player); **…** connecting; **OFF** server not reachable; **KEY** token rejected. The tooltip says which, names the campaign, and keeps the last connection error. Rules in `extension/badge.js` (no Chrome calls, so it can be tested); `background.js` updates the badge when the connection or the tab reports change, and only touches it when something differs. Tested: `test/badge.test.mjs` (16 checks: each rule, plus the real `background.js` with a stand-in Chrome API going through connect, tab loading, DM ready, tab closed, server stopped, bad token).
  - **0.18.2 (your choice):** the badge always says **MCP**; its text colour gives the state (green ready, orange connected but no DM tab, yellow connecting, grey server not reachable, red token rejected) on a dark background. The extension now uses AboveVTT's icon (`extension/icons/`, resized to 16/32/48/128), credited in `extension/icons/NOTICE.md` and the README; those files stay AGPL-3.0.
  - **0.18.3:** the badge covered most of the icon (Chrome draws it at a fixed size), so it's gone. The toolbar icon itself now has "MCP" drawn under a smaller red "A", in the state's colour: ten pre-made images in `extension/icons/status/` (16 and 32 px for each state, letters drawn pixel by pixel so they stay sharp), made by `tools/make_status_icons.py`; `background.js` swaps them with `chrome.action.setIcon`. The extensions page keeps the plain AboveVTT icon. `test/badge.test.mjs` (22 checks) also reads each image and checks the letters are in the right colour.
- **6. Find-and-replace in `update_note` (server and extension 0.19.0).** New `replacements: [{ find, replace }]` (1–50 pairs, instead of `content`). Every find must appear exactly once in the note as it is now, and they mustn't overlap; otherwise nothing changes and the error names each problem (not found / appears N times / split by formatting / overlap). Plain-text finds match only the note's visible text, never tag names or link addresses, and allow for how AboveVTT's editor stores `&`, `<`, `>`, quotes and non-breaking spaces; replacement text is escaped, and a newline becomes a line break. `format: "html"` matches the HTML as is (to change formatting), and the result goes through AboveVTT's sanitizer. The reply shows a before/after excerpt for each change. Same rules as `content`: refused while the note is open in AboveVTT's editor, or for D&D Beyond book pages. Tested: `test/note-replace.test.mjs` (22 checks against AboveVTT's real sanitizer and journal code).
  - **0.19.1 (your choice): replace all.** A pair with `all: true` changes every place its text appears (at least one, or nothing changes; overlaps still refused). Claude sets it only when you explicitly ask to replace all. A replace-all needs a `dryRun` preview that lists every place as a snippet with the changed text marked «like this» (original → change), and your yes: the server enforces it with the same `confirmToken` as deletes. Ordinary replacements still save straight away, and can also be previewed. Tested: 31 checks in `test/note-replace.test.mjs`, 7 more in `test/confirm.test.mjs`.
  - **Confirmed live in Frozen Sick:** two replacements in one save; a find appearing twice refused with nothing changed; "Replace all Goblin with Kobold" previewed both places, then changed them after the user's yes. **Extension 0.19.2** fixes the preview's "Text: x → y characters" line, which compared visible text with HTML length.
- **3. A second DM tab, browser or PC** (in stages; decisions in chat 21 Nov). AboveVTT itself doesn't track whether a DM is connected (players announce themselves with `playerjoin`; DM tabs never do), so the bridge does its own detection. Design: the first DM tab is the active one; any later DM tab running the bridge is soft-locked by an overlay; switching the active tab is never automatic, only when the user clicks **Use here** (two-step, the Yes button waits ~2 s) or asks in chat (preview + yes). If the active tab goes silent, the locked tab offers Use here rather than switching. Browsers can be named in the options page; DM tabs announce every 30 s.
  - **3a. One browser connection (server and extension 0.20.0).** Before, a second browser with the bridge pushed the first off the server, which reconnected and pushed back, so they took turns and changes landed in either. Now the server keeps the connected browser while it answers (pings every 20 s; replaced after ~45 s of silence), switches only to a browser that has an AboveVTT DM tab when the connected one has none, and refuses the other with close code 4002 saying which browser is in use. The refused browser shows a grey icon explaining why, retries every 30 s, and asks again at once when it gets a DM tab. Each browser gets a random ID (stored once) and an optional name (options page); `status` reports a recently refused browser. Tested: `test/browsers.test.mjs` (17 checks with the real server bridge and stand-in browsers), 6 more in `test/badge.test.mjs`.
  - **3b. Presence, soft lock and Use here (server and extension 0.21.0).** New `extension/presence.js`. Each DM tab sends `custom/myVTT/avttMcpPresence` through AboveVTT's own `MB.sendMessage` (not tied to a scene) when it starts and every 30 s, and listens with its own listener on AboveVTT's connection (re-attached when AboveVTT reconnects). Message: `{ v, event: hello|reply|takeover|bye, tabId, browserId, name, version, role, epoch, since }`. A new tab listens 4 s; if a tab is already active it pauses, otherwise it becomes active. Unknown tabs, starting tabs and tabs wrongly claiming to be active get an immediate reply. Claims carry an epoch (+1 per switch): higher wins, then earlier, then lower tab id, so a tab waking from sleep after a switch pauses itself, and two tabs starting at once settle on one. A tab not heard from for 75 s is gone; the paused tab then says so but keeps waiting. Paused: overlay over the page (clicks, keys, wheel, paste blocked), naming the active tab and when; **Use here** opens a confirm step whose Yes button waits 2 s; **Leave AboveVTT in this tab** goes back to the campaign page. `page.js` refuses changes in a paused tab (reads, previews and exports still work) and reports `dmRole`; `background.js` sends calls to the active tab and passes the browser ID/name to each tab; the server ignores paused DM tabs when choosing between browsers. AboveVTT's message handler is an if/else-if chain on known types with no catch-all, so it ignores this one (checked in 1.61). Tested: `test/presence.test.mjs` (37 checks, several tabs in separate jsdom windows with a stand-in AboveVTT server: active/paused, overlay text, keys blocked, MCP refused vs reads/previews/exports, accidental and real confirm, Cancel, no automatic switching, sleeping and waking, same browser, simultaneous start, bye, players never take part), plus routing in `test/badge.test.mjs` and paused tabs in `test/browsers.test.mjs`.
    **Confirmed live (21 Nov) on two PCs:** AboveVTT's real server passes the presence messages between PCs; the second DM tab paused, and switching with Use here worked both ways.
  - **3c. Switching through chat; status and icon (server and extension 0.22.0).** New tools in `server/src/tools/dm_tabs.js`: `list_dm_tabs` (read-only: this tab active or paused, other DM tabs with name/where/role/last heard) and `switch_active_dm_tab` (only when the user asks; `dryRun` preview names the tab that would be paused and warns about unsaved edits; needs the `confirmToken` like deletes; the preview is re-checked, so if the active tab changed meanwhile nothing switches; logged in the change log). If the call lands on an already-active tab while this browser has a paused DM tab, the reply gives that tab's `tabId`. Page methods `get_dm_presence` and `take_over_dm` (allowed in a paused tab; its preview contains nothing that changes on its own). Tab info now carries `dmActiveWhere` and `dmOtherTabs`; `status` summary says "Paused: … is the active DM tab" or "Ready … Also open as DM elsewhere (paused): …"; the icon shows orange "paused" with where the active tab is, and the green tooltip counts paused tabs elsewhere. Tested: `test/dm-tabs.test.mjs` (12 checks), 8 more in `test/presence.test.mjs`, 3 more in `test/badge.test.mjs`.
    **Confirmed live (21 Nov) on two PCs:** paused tab shows orange MCP naming the other PC; `status` reports paused; "Make this the active DM tab" previewed, then switched after the user's yes, and the other PC showed the overlay.
- 2. Lock down the page-script message channel.

### Security review (21 Nov 2026)

After the code review items, a security pass over the server, the extension and how AboveVTT displays what the MCP writes. Findings, most important first: (1) names can carry HTML into AboveVTT's pages; (2) faked results from page scripts (= review item 2, option C: run commands through `chrome.scripting.executeScript`); (3) instructions hidden in campaign content (players' notes, character sheets) can trigger unguarded changes; best protection is Claude desktop's "ask before using" for change tools; (4) players can fake presence messages (optional DM key); (5) `recoverScenes` returns old invite links to Claude (show only the last characters); (6) the image-reading permission could reach the home network (refuse private addresses). Checked and sound: local-only server with token and safe compare, owner-only config folder, imports only `.abovevtt` and return a preview, fog backup paths can't escape their folder, notes escaped/sanitized, stat blocks escaped, confirm codes random and single-use, overlay shows names as text.

- **1. Names can't carry HTML (server and extension 0.23.0).** AboveVTT inserts names into its pages as raw HTML (`SidebarPanel.js` `${listItem.name}`) and into quoted attributes (`TokenMenu.js` `title='${token.options.name}'`), so a name with a tag, or a quote followed by an event attribute, would run as code in the DM's tab (token names possibly in players' tabs). New `server/src/names.js`: every field that *sets* a name or title (18 fields in 7 tools: scenes, scene folders, My Tokens and folders, copies, tokens and coloured-marker labels, token notes, notes and journal folders, tracks and playlists), plus a `title` inside `update_scene_config` / `create_scene` config, refuses `<` or `>` and turns straight quotes into typographic ones. Lookup fields are untouched. Lookups in the extension now go through `AVTT_MCP.nameKey` (trimmed, any case, straight and curly quotes equal; 42 places), so "Bob's" still finds "Bob’s". Tested: `test/names.test.mjs` (23 checks: every name field through its schema, config titles, lookups), the full suite, and a real MCP client against the built server. Also worth reporting upstream to AboveVTT: the same names typed by hand behave the same way.

- **2. Commands through Chrome's scripting API (extension 0.24.0; server unchanged).** Review item 2 / security finding 2. Before, commands and results travelled between `relay.js` and `page.js` by `window.postMessage`, checked only by source window and channel name, so any script on the page could send commands past the server's checks and change log, or answer a pending call with a forged result (call ids are 1, 2, 3…). Now `background.js` runs each command with `chrome.scripting.executeScript` in the page's main world, calling `window.__avttMcpRun(method, params)`; the result comes back through Chrome. Tab info (`__avttMcpInfo`) and the browser identity (`__avttMcpSetIdentity`) go the same way. These globals and `window.AVTT_MCP` are non-writable and non-configurable; the new last content script `seal.js` freezes `AVTT_MCP` so no methods can be added or replaced. `page.js` only posts a bare `infoChanged` nudge (a fake one only causes a re-read); `relay.js` only reports the tab opening/closing and passes on that nudge; `background.js` no longer accepts results or info from the tab. Manifest: `scripting` permission, host permission `https://www.dndbeyond.com/*` (no new install warning: the content scripts already cover that site). Tests: `test/channel.test.mjs` (15 checks: locked entry points, sealing, old-style messages ignored, nudge only, relay passes only the nudge), background routing and forged result/info in `test/badge.test.mjs`; all 16 page-side tests now call `__avttMcpRun` like `background.js` does. Imports travel as one `executeScript` argument (before: one extension message); both have Chrome size limits in the tens of MB, so very large backups should be tried. Limit: code inside the page can still tamper with AboveVTT's own functions.
  **Confirmed live (21 Nov) in Chrome:** status (tab info read via scripting, page script 0.24.0), list_scenes, rename_folder (straight-quote lookup of a curly-quoted name) and a previewed, confirmed delete_folder all worked through the new route. Large imports not yet tried.

- **5. Old invite links stay out of Claude's view (extension 0.24.1; server unchanged).** Checked every place a `recoverScenes` invite secret could reach Claude: the list of AboveVTT's remembered links was already masked (campaign number, then `…` and the last 4 characters, e.g. `8258198-…ret9`), the change log records only the action name, and the preview returns scene titles only. The one gap: an error from AboveVTT's `exportScenes` or `migrateScenes` was passed back as is, so a message that echoed the request could include the secret. Both errors now have the secret replaced by its masked form. A link the user pastes into chat is of course in the chat. Test: `test/settings-actions.test.mjs` now fails if a secret appears in an error.
- **6. Map reading can't reach the local network (extension 0.25.0; server unchanged).** `detect_grid` downloads the scene's map in the extension with the optional "read any site" permission, so a map link set to `http://192.168.1.1/…` (by anyone who can edit scenes, or by hidden instructions) could have made the DM's browser send requests to the router or other local services. New `extension/netguard.js`, checked before every download: refuses `localhost` and single-word or local names (`.local`, `.lan`, `.home.arpa`, `.internal`…), private, loopback, link-local (including cloud metadata `169.254.169.254`), carrier-grade-NAT and multicast IPv4, the IPv6 equivalents and IPv4-mapped forms, and links with a user name or password. Numeric tricks such as `2130706433` or `127.1` are caught because the browser's URL parser normalises them first. If a public link redirects to a blocked address the response isn't read. Downloads also send no referrer (cookies were already omitted). Limit: a public name whose DNS points at a private address can't be detected by an extension; Chrome's own Private Network Access rules cover part of that. Test: `test/netguard.test.mjs` (39 checks: 27 refused, 7 allowed, and `background.js` refusing before any request and after a redirect).
- **4. Players faking presence messages: skipped (21 Nov, user's decision).** AboveVTT's `sender` field is filled in by the sending browser and its server relays to anyone holding the invite code, which every player has, so a player with console skills could send a fake "active DM tab" claim and pause the real DM tab (overlay, change tools blocked) until the DM clicks Use here, repeatedly if they kept at it. AboveVTT's own messages (scenes, tokens) have the same gap with worse effects, and that can't be closed without changing AboveVTT. A possible fix if it ever matters: an optional DM key on the options page of each DM PC, HMAC-SHA256-signed presence messages with a timestamp (older than ~60 s refused), unsigned ones ignored when a key is set, and a key fingerprint shown so two PCs can be compared.
- **3. Hidden instructions in campaign content: advice only.** No code change; keep Claude desktop's "ask before using" on for change tools. Deletes, imports and the other destructive tools already need a preview and a yes in chat.

### Campaign audit (server 0.24.0–0.24.3, extension 0.26.0–0.26.2)

User's choice (23 Nov) from the feature ideas: an audit that only *lists* broken scenes, tokens, audio and journal links and empty folders. No rolling backups and no image link fixer.

- **`audit_campaign`** (read-only; allowed in a paused DM tab). Options: `checks` (scenes, tokens, audio, journal, folders), `includeSceneTokens` (default true), `showUnchecked`.
- **Page side (`extension/audit.js`, `get_audit_data`):** collects every link with where it's used:
  - scene player and DM maps (YouTube and video maps marked as video); scenes with no player map;
  - token images from `TOKEN_CUSTOMIZATIONS` (My Tokens with folder path, plus monster/other token settings), and from tokens on every scene: live `TOKEN_OBJECTS` for the current scene, `AboveApi.getScene` for the others, four at a time; a scene that can't be read is reported, not fatal; Area of Effect shapes skipped;
  - the track library and every playlist's channels;
  - `<img src>` and `<a href>` (web links only) in journal notes;
  - empty folders: scene folders with nothing in them, My Tokens folders, journal folders with no notes (or only deleted note ids) and no subfolders.

  Images go through AboveVTT's own `parse_img` (Drive → thumbnail link, Dropbox → dl.dropboxusercontent, OneDrive), audio through the mixer's Dropbox/OneDrive rewriting, so working share links aren't flagged. `data:` images and non-web links are reported; AboveVTT cloud-storage links (`above-bucket-not-a-url`) are skipped.
- **Server side (`server/src/linkcheck.js`):** checks each different link once, 8 at a time, 10 s timeout. HEAD first, then a 1 KB ranged GET if the host mishandles HEAD; redirects followed by hand (up to 5), each hop checked. Before any request the URL and every address its name resolves to are checked by `server/src/netguard.js` (a copy of the extension's guard plus DNS), so nothing on the local network is fetched; such links are reported as suspect because players elsewhere can't load them. Results: **broken** (404/410, no such site, refused connection, bad certificate, Imgur `removed.png` or an Imgur image link answering with a page, redirect loop, YouTube oEmbed 404/401), **suspect** (opens a web page or the wrong file type, 401/403 on a file, local-network link), **couldn't check** (timeouts, 429/5xx), counted unless `showUnchecked`. A 401/403 on a journal *page* link counts as fine (page behind a sign-in).
- **Report:** per area, broken / suspect / other problems, grouping one URL used in many places; empty folders by area; up to 40 entries per section.
- **Tests:** `test/linkcheck.test.mjs` (30 checks against a fake web and DNS: every result type, HEAD fallback, redirects, Imgur, local-network links never requested, one fetch per repeated link) and `test/audit.test.mjs` (25 checks with AboveVTT's real `parse_img`: Drive/Dropbox/OneDrive conversion, current vs other scenes, unreadable scene, AoE skipped, data images, journal images/links, empty folders incl. nested ones, `checks` and `includeSceneTokens`).
- **First live run (23 Nov, Frozen Sick):** 156 links in 381 places read in 5 s, 2 of 2 scenes' tokens read. 11 Dropbox links (5 My Tokens images, 6 tracks) came back as "application/json, not an image/audio file": Dropbox's file servers answer HEAD with JSON. **0.24.1:** a HEAD success with the wrong content type is asked again with the small GET and judged on that (2 more checks in `test/linkcheck.test.mjs`, now 27).
- **Second live run (23 Nov, Frozen Sick, 0.24.1):** 156 links in 381 places in 6 s; the Dropbox links now pass. Its one finding was wrong: the Ghast's animated `.webm` image was called "video/webm, not an image", but AboveVTT plays `.webm`/`.mp4`/`.m4v` token images as video (`Token.js`). **0.24.2 / extension 0.26.2:** token images are checked as "image or video"; a video inside a journal `<img>` is still suspect (2 more checks in `test/linkcheck.test.mjs`, 1 in `test/audit.test.mjs`).
- **Third live run (23 Nov, Frozen Sick):** 157 links in 383 places in 6 s, with a test link `https://i.imgur.com/doesnotexist123.png` added to a My Tokens creature and a placed token. Claude desktop was still running the 0.24.1 server, so the Ghast `.webm` came up again. The Imgur link was only "suspect: opens a web page": for an image that doesn't exist Imgur answers with a page instead of redirecting to `removed.png`. **0.24.3:** a direct `i.imgur.com` image link answering with a page is broken ("the image no longer exists on Imgur"); 1 more check in `test/linkcheck.test.mjs`, now 30.
- **Fourth live run (23 Nov, Frozen Sick, server 0.24.3) — confirmed:** 157 different links in 383 places in 6 s, tokens read from 2 of 2 scenes. Exactly one finding, as expected: the Imgur test link, reported **broken** ("no longer exists on Imgur") once, listing both places (the My Tokens creature and the token on Catacombs). The Dropbox links and the Ghast's `.webm` passed, and no empty folders were found. Still to try: a campaign with real dead links.

### Compare two backups (server 0.25.0–0.25.3; extension unchanged)

User's choice (23 Nov) from the feature ideas, after the audit.

- **`compare_backups`** (read-only; server only, no AboveVTT tab needed): `before` and `after` are file names from `list_backup_files` (Downloads) or full paths; `areas` limits the report to scenes, tokens, journal or audio. Warns if `before` is the newer file; refuses the same file twice, non-`.abovevtt` files and files that aren't backups.
- **Reading files:** `server/src/backupfile.js` now holds `resolveBackupPath` (moved from `settings_actions.js`, same rules: `.abovevtt` only, up to 200 MB) and `parseBackupText`, which decodes AboveVTT's format (base64 of UTF-8 JSON, from `b64EncodeUnicode`) or plain JSON.
- **What's compared (`server/src/backupdiff.js`):**
  - **Scenes and scene folders** by id: added, removed, renamed, moved (with the old folder), changed settings by name (draw grid, grid size, map links, fog of war, drawings and walls, weather…; width and height of the grid count once), and the **tokens on each scene**: added, removed, changed (name and what changed, e.g. "Goblin: hit points"), and how many only moved on the map.
  - **My Tokens and token settings** by type and id: added, removed, renamed, moved, changed fields (AC, images, stat block…).
  - **Journal:** notes added, removed, renamed, moved between folders (by folder id, so renaming a folder doesn't move its notes), **text edited with just the changed part** («…3…» → «…10…») and character counts, sharing changed; folders added, removed, renamed, moved, sharing changed.
  - **Audio:** tracks added, removed, renamed, link or tags changed; playlists added, removed, renamed, tracks added or removed, or only their settings changed.
  - Not compared: explored fog details (only "fog of war changed"), soundpads.
- **Report:** a counts line (before → after), then per area; up to 40 entries per section.
- **Tests:** `test/compare-backups.test.mjs` (34 checks at first, 44 in 0.25.1): two files written with AboveVTT's real `b64EncodeUnicode`, every kind of change above, a token that only moved, a renamed journal folder vs a note really moved, `areas`, swapped order, same file, identical contents, wrong file type, junk file. `settings-actions` still passes with the shared file helper.
- **First live run (23 Nov, Frozen Sick, 0.25.0):** two backups two minutes apart. The real changes were found (scene renamed The Tavern → The Tavern Test, token Flame 1 added, text appended to a note), but the scene also listed 15 "changed" settings and the note a "stat block flag": renaming in AboveVTT's configure dialog re-saves every field, as another spelling (`29` → `"29"`, `1` → `true`), as a blank or `"0"` where there was nothing, or as AboveVTT's default (grid colour `rgba(0, 0, 0, 0.5)`, line width `0.5`, weather intensity `120`), plus the dialog's helper inputs (`scale_check`, `gridStrokeNumberInput`, `darkness_filter_number`, `uuid`). Comparing the 14 Nov backup with today's also showed `devilsight`/`truesight` added at 0 feet on two tokens, and the empty Default playlist "added" and "removed" (recreated with a new id).
- **0.25.1:** values are compared in one spelling (numbers, `"1"`/`true`, `"0"`/`false`); missing, `null`, `""`, `[]`, `{}` and `{ feet: 0 }` vision/light/aura settings all count as empty, and empty equals `"0"` or a scene default; the dialog's helper inputs are ignored; playlists with no id match are paired by name; text that was only added or only removed reads "text added: «…»" / "text removed: «…»". Re-run on the real files: the two-minute pair shows only the rename, Flame 1 and «changing this note»; 14 → 23 Nov shows only real changes (20 deleted test scenes and 2 folders, 6 new My Tokens, 6 new notes, «(9d10+27)» added to Captain Dravek, the new Frozen Sick journal folder). 10 more checks in `test/compare-backups.test.mjs` (44) built from these real cases, including that real setting changes, moved tokens and vision turned on still show.
- **Second live run (23 Nov, 0.25.2):** the 18:39 backup vs the new `Frozen Sick-2026-11-23 18-53-53.abovevtt`, with nothing changed in between. Only five notes were listed, each as "formatting changed", four of them "(untitled)". They were stat-block notes that AboveVTT had re-saved with the attributes of their first tag in another order (`id class style` ↔ `style class id`), same length and text. The saved times were also shown in UTC (23:39) instead of local time.
- **0.25.3:** HTML is compared in a canonical form (attributes sorted, whitespace between tags collapsed), so only a real markup change counts as "formatting changed"; untitled stat-block notes are named after the token whose `statBlock` points at them ("stat block of 'Ghast'"); times are local, in the same format as `list_backup_files`. On the real files: 18:39 → 18:53 shows no differences, and 14 Nov → today names the new note "stat block of 'Ghast'". 6 more checks (50).
- **Confirmed live (23 Nov, 0.25.3):** 18:39 backup vs `Frozen Sick-2026-11-23 18-53-53.abovevtt` → "No differences found", saved times shown in local time.

### Date and time in export file names (server 0.25.2, extension 0.27.0)

User's request (23 Nov), after two same-day backups came out as `Frozen Sick-2026-11-23.abovevtt` and `… (1).abovevtt`.

- AboveVTT picks the name itself (`${name}-${year}-${month}-${day}.abovevtt`, unpadded, plus `-token`/`-journal`/`-audio`) and saves through its global `download()` (Settings.js). While a connector export runs, `AVTT_MCP.withTimestampedDownloads` swaps in a wrapper that replaces the date with `YYYY-MM-DD HH-MM-SS` (zero-padded so files sort; `-` instead of `:`, which Windows doesn't allow), then puts AboveVTT's own `download()` back. AboveVTT's code isn't changed, and its EXPORT button still names by date only.
- Used by `export_backup` (the wrapper stays in place until the export has really finished, which matters for big campaigns, where AboveVTT saves the file after its export call returns) and the four Settings tab exports in `run_settings_action`. The reported file name is the one Chrome was given.
- An unexpected AboveVTT name gets the date and time added before `.abovevtt` instead.
- **Confirmed live (23 Nov, Frozen Sick):** `export_backup` saved `Frozen Sick-2026-11-23 18-53-53.abovevtt` in Downloads (255 KB), next to the earlier date-only files. Listing Downloads straight after the export didn't show it yet: Chrome was still finishing the download (its temporary `.crdownload` name). A second listing a few seconds later did.
- Tests: `test/backup.test.mjs` now counts (17 checks): stamped name in the normal and large-campaign paths, reported name = downloaded name, `download()` restored, the EXPORT button unaffected, and the renaming rule (unpadded dates, kind suffix, a date inside the name, unexpected names, zero padding). `test/settings-actions.test.mjs` shows the four exports with stamped names.

### Undo for edits — dropped for now (23 Nov)

Designed but not built: the user decided it would get too complicated and invite mistakes and corner cases. The design, for a later look:

- **Claude's changes only:** before each connector change, record the old values of exactly what it changes (per campaign, in `~/.abovevtt-mcp/undo/`). `undo_change` previews, needs the user's yes and a confirm token, and puts the old values back through the same tools; creates would be undone by deleting what was made; one change undone in one step (e.g. a whole replace-all); the undo itself recorded, so it can be redone. Not covered: imports, Settings buttons, fog (own restore), DM tab switching. Deletes were proposed for a phase 2.
- **Safety check:** read the current values first; if anything was changed again since, stop and show it instead of overwriting.
- **The user's own changes** aren't seen by the connector. Two ways were considered: (A) permanently wrapping AboveVTT's save functions (precise, but intrusive, likely to break on AboveVTT updates, and noisy: whole-journal saves while typing, token moves in play), or (B) periodic snapshots of prep data plus `compare_backups`-style restore (safer, but only back to the last snapshot, and close to the rolling backups the user skipped).
- Open questions if picked up again: include creates? deletes? how much history (last 50 or 30 days)? refuse on a later change, or undo only the untouched parts?

Meanwhile: `export_backup` (date-and-time names) plus `compare_backups` show what changed between two points, and `import_backup` can restore.

### Later phase — Two-PC sync

- The bridge saves a sync file in the built-in Export format when things change, and loads a newer copy when the campaign opens.
- The sync file would live in a synced folder such as OneDrive or Google Drive.
- It starts as "last save wins", with per-item merging possible later.
- Explored fog isn't part of the Export, so it won't sync.

## Applies to every step

- `status` and the change log are extended as new tools arrive.
- Tools check that AboveVTT's functions exist before calling them. The connector warns when it sees an AboveVTT version it hasn't been tested with (currently tested: 1.61).
- Each step bumps the version: extension, page script and server.

## Risks

- **AboveVTT updates:** the connector relies on AboveVTT's internal function names, which aren't a published interface. An AboveVTT update could break one or more tools until they're adjusted.
- **AboveVTT's server endpoints** are unofficial and can change.
- **The DM tab must be open** for every tool.
- **The campaign secret** (the D&D Beyond join-link code) is the only key to the campaign's scenes. Treat it like a password.

## Open questions

- Editing tokens on scenes other than the one you have open (step 12). This will be tested when the step is built.
