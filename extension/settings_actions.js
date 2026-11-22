// Step 9: the Settings tab buttons. AboveVTT's own buttons use alert()/confirm()/file pickers,
// which would freeze the connector, so these call the functions behind the buttons and let
// the confirmation happen in chat (dryRun shows what would happen first).
/* global $, AboveApi, export_current_scene, export_token_customization, export_journal, export_audio,
   import_process_datafile_text, b64DecodeUnicode, build_import_loading_indicator, set_avtt_setting_value,
   clear_avtt_setting, persist_experimental_settings, persist_all_token_customizations, init_settings,
   redraw_settings_panel_token_examples, showTempMessage */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const campaignName = () => window.CAMPAIGN_INFO?.name ?? "Campaign";
  function need(...names) {
    for (const n of names) if (typeof window[n] !== "function") throw new Error(`AboveVTT function '${n}' was not found. This AboveVTT version may not be supported yet.`);
  }
  function refreshSettingsPanel() {
    try {
      const body = $("#settings-panel .sidebar-panel-body");
      if (body.length && typeof init_settings === "function") { body.empty(); init_settings(); }
    } catch (err) { console.warn("[AVTT MCP] settings refresh failed", err); }
  }
  const mask = (s) => (s && s.length > 12 ? `${s.slice(0, s.indexOf("-") > 0 ? s.indexOf("-") + 1 : 6)}…${s.slice(-4)}` : "…");

  // ---------- simple downloads ------------------------------------------------------
  const EXPORTS = {
    exportCurrentScene: { fn: "export_current_scene", file: () => `${window.CURRENT_SCENE_DATA?.title}-${today()}.abovevtt`,
      what: "the scene you're on, with its tokens, drawings, fog reveals, token notes, stat blocks and scene note" },
    exportTokenCustomizations: { fn: "export_token_customization", file: () => `${campaignName()}-${today()}-token.abovevtt`,
      what: "all token customizations (My Tokens, custom creatures, token overrides) and stat-block notes" },
    exportJournal: { fn: "export_journal", file: () => `${campaignName()}-${today()}-journal.abovevtt`,
      what: "all journal notes and chapters" },
    exportAudio: { fn: "export_audio", file: () => `${campaignName()}-${today()}-audio.abovevtt`,
      what: "soundpads, mixer state and the music library" },
  };

  // ---------- analyse a .abovevtt file (for the import preview) ----------------------
  function parseDataFile(text) {
    try { return JSON.parse(b64DecodeUnicode(text)); } catch { /* try plain base64 */ }
    try { return JSON.parse(atob(text)); } catch { return null; }
  }

  function analyse(df) {
    const all = Array.isArray(df.scenes) ? df.scenes.filter((s) => s && s.id) : [];
    const folderType = M.folderType();
    const folders = all.filter((s) => s.itemType === folderType);
    const scenes = all.filter((s) => s.itemType !== folderType);
    const existingIds = new Set((window.ScenesHandler?.scenes || []).map((s) => s.id));
    const tcs = Array.isArray(df.tokencustomizations) ? df.tokencustomizations.filter(Boolean) : [];
    const existingTc = new Set((window.TOKEN_CUSTOMIZATIONS || []).map((t) => `${t.tokenType}|${t.id}`));
    const notes = df.notes && typeof df.notes === "object" ? Object.keys(df.notes) : [];
    const existingNotes = window.JOURNAL?.notes || {};
    return {
      scenes: {
        total: scenes.length,
        alreadyInCampaign: scenes.filter((s) => existingIds.has(s.id)).length,
        titles: scenes.slice(0, 30).map((s) => s.title || "(untitled)"),
      },
      sceneFolders: {
        total: folders.length,
        notInCampaign: folders.filter((f) => !existingIds.has(f.id)).map((f) => f.title || "(untitled)"),
      },
      tokenCustomizations: { total: tcs.length, replacesExisting: tcs.filter((t) => existingTc.has(`${t.tokenType}|${t.id}`)).length },
      notes: { total: notes.length, replacesExisting: notes.filter((id) => existingNotes[id] !== undefined).length },
      journalChapters: Array.isArray(df.journalchapters) ? df.journalchapters.length : 0,
      soundpads: df.soundpads ? Object.keys(df.soundpads).length : 0,
      musicTracks: Array.isArray(df.tracklibrary) ? df.tracklibrary.length : 0,
      replacesMixerState: df.mixerstate !== undefined,
      replacesMusicLibrary: df.tracklibrary !== undefined,
    };
  }

  M.register("import_backup", async ({ fileText, fileName, dryRun, reloadAfter = true } = {}) => {
    M.requireDM();
    need("import_process_datafile_text", "b64DecodeUnicode");
    if (typeof AboveApi?.migrateScenes !== "function") throw new Error("AboveVTT's scene save function was not found.");
    if (!fileText) throw new Error("No file content received.");
    const df = parseDataFile(fileText);
    if (!df) throw new Error(`'${fileName}' is not a readable .abovevtt file.`);
    const preview = analyse(df);
    if (dryRun) return { dryRun: true, fileName, preview };
    if ($(".import-loading-indicator").length) throw new Error("AboveVTT is already importing or exporting. Wait for it to finish.");

    // Same steps as AboveVTT's import_readfile, minus the file picker and the alert().
    if (typeof build_import_loading_indicator === "function") build_import_loading_indicator("Preparing Import");
    window.__IMPORT_SCENES_BUFFER = [];
    try {
      if (!import_process_datafile_text(fileText)) throw new Error("AboveVTT could not read the file.");
      const scenes = window.__IMPORT_SCENES_BUFFER || [];
      await AboveApi.migrateScenes(window.gameId, scenes);
    } catch (err) {
      $(".import-loading-indicator").remove();
      throw new Error(`Import failed: ${err?.message || err}. Some local data (tokens, notes, audio) may already have been merged.`);
    }
    $(".import-loading-indicator .loading-status-indicator__subtext").addClass("complete");
    // AboveVTT reloads after an import ("You need to Re-Join AboveVTT"); do the same once we've answered.
    if (reloadAfter) setTimeout(() => location.reload(), 1500);
    else setTimeout(() => $(".import-loading-indicator").remove(), 1500);
    return { imported: true, fileName, preview, reloading: !!reloadAfter };
  });

  // ---------- the other buttons ---------------------------------------------------------
  M.register("settings_action", async ({ action, dryRun, oldInviteId, previousIndex } = {}) => {
    M.requireDM();

    if (EXPORTS[action]) {
      const e = EXPORTS[action];
      need(e.fn);
      if (action === "exportCurrentScene" && !window.CURRENT_SCENE_DATA?.id) throw new Error("No scene is open to export.");
      const filename = e.file();
      window[e.fn]();
      return { action, done: true, filename, contains: e.what, savedTo: "Chrome's Downloads folder" };
    }

    switch (action) {
      case "storeGridVisualSize": {
        need("set_avtt_setting_value");
        const hpps = parseFloat(window.CURRENT_SCENE_DATA?.hpps);
        if (!Number.isFinite(hpps) || !Number.isFinite(window.ZOOM)) throw new Error("Open a scene with a grid first; the size is taken from its grid and your current zoom.");
        const value = window.ZOOM * hpps;
        set_avtt_setting_value("gridZoomConversion", value);
        $("#grid_zoom_conversion").css("display", "");
        return { action, done: true, stored: value, note: "Taken from the current scene's grid and zoom on this device. A quick-toggle button now appears on the right." };
      }
      case "clearGridVisualSize": {
        need("clear_avtt_setting");
        clear_avtt_setting("gridZoomConversion");
        $("#grid_zoom_conversion").css("display", "none");
        return { action, done: true };
      }
      case "matchCampaignSettings": {
        const suggested = window.AVTT_CAMPAIGN_INFO?.campaignSettings || {};
        const keys = Object.keys(suggested);
        const willDrop = Object.keys(window.EXPERIMENTAL_SETTINGS || {}).filter((k) => !(k in suggested));
        if (dryRun) {
          return { action, dryRun: true, suggestedSettings: suggested, yourSettingsThatWouldBeCleared: willDrop,
            note: "Your settings in this browser are replaced by the campaign's suggested settings; anything not in that list goes back to its default." };
        }
        need("persist_experimental_settings");
        window.EXPERIMENTAL_SETTINGS = { ...suggested };
        persist_experimental_settings(window.EXPERIMENTAL_SETTINGS); // AboveVTT's button calls this without the settings
        refreshSettingsPanel();
        return { action, done: true, applied: keys.length, cleared: willDrop };
      }
      case "clearAllTokenOptionOverrides": {
        const tcs = window.TOKEN_CUSTOMIZATIONS || [];
        const withOverrides = tcs.filter((tc) => tc.tokenOptions && Object.keys(tc.tokenOptions).some((k) => !["name", "alternativeImages", "statBlock"].includes(k)));
        if (dryRun) {
          return { action, dryRun: true, tokenCustomizations: tcs.length, withOptionOverrides: withOverrides.length,
            note: "AboveVTT's warning: this removes ALL overridden token options from every player, monster, custom token and folder in the Tokens panel. It shouldn't remove custom images. Tokens already placed on scenes are not updated. This cannot be undone. " +
              "Note: AboveVTT keeps only each token's name, alternative images and stat-block link, so custom creatures (My Tokens) also lose their HP, AC, size and other options." };
        }
        need("persist_all_token_customizations");
        tcs.forEach((tc) => tc.clearTokenOptions());
        persist_all_token_customizations(tcs);
        if (typeof redraw_settings_panel_token_examples === "function") redraw_settings_panel_token_examples();
        return { action, done: true, cleared: withOverrides.length };
      }
      case "recoverScenes": {
        if (typeof AboveApi?.exportScenes !== "function" || typeof AboveApi?.migrateScenes !== "function") {
          throw new Error("AboveVTT's recovery functions were not found.");
        }
        const stored = (localStorage.getItem(`AVTT-CampaignInfo-${window.CAMPAIGN_INFO?.id}-previous`) || "").split(",").filter(Boolean);
        let secret = oldInviteId ? String(oldInviteId).trim().replace(/^https?:\/\/www\.dndbeyond\.com\/campaigns\/join\//i, "") : undefined;
        if (!secret && previousIndex !== undefined) secret = stored[previousIndex];
        if (!secret) {
          return { action, needsInviteId: true, previousLinks: stored.map((s, i) => ({ index: i, masked: mask(s) })),
            note: "Pass oldInviteId (the code after /campaigns/join/ in an old invite link) or previousIndex." };
        }
        if (!secret.startsWith(String(window.CAMPAIGN_INFO?.id))) throw new Error("That invite id doesn't belong to this campaign (AboveVTT checks this too).");
        // Never let the old invite secret come back to Claude, even inside an error message.
        const scrub = (m) => String(m ?? "").split(secret).join(mask(secret));
        let scenes;
        try { scenes = await AboveApi.exportScenes(secret); }
        catch (err) { throw new Error(`Couldn't read scenes for that invite id: ${scrub(err?.message || err)}`); }
        if (!scenes || !scenes.length) return { action, found: 0, note: "No scenes found for that invite id." };
        if (dryRun) return { action, dryRun: true, found: scenes.length, titles: scenes.slice(0, 30).map((s) => s.title || "(untitled)") };
        if (typeof build_import_loading_indicator === "function") build_import_loading_indicator("Preparing Import");
        try {
          await AboveApi.migrateScenes(window.gameId, scenes);
        } catch (err) {
          $(".import-loading-indicator").remove();
          throw new Error(`Recovery failed: ${scrub(err?.message || err)}`);
        }
        setTimeout(() => location.reload(), 1500); // AboveVTT reloads after recovery as well
        return { action, done: true, recovered: scenes.length, reloading: true };
      }
      default:
        throw new Error(`Unknown action '${action}'.`);
    }
  });
})();
