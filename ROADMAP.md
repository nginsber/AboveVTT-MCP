# AboveVTT MCP — progress and roadmap

*Updated 14 Nov 2026. Review answers recorded; token editing added (step 12).*

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
| Live-session tools | Not wanted. No switching the players' scene, placing tokens on the map, or playing music from the connector. Editing tokens already on a scene (step 12) is in. |

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
