// Step 5: export_backup — runs AboveVTT's built-in Export (Settings tab → EXPORT).
// The .abovevtt file is downloaded by Chrome into the Downloads folder.
/* global $, export_file */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // The file gets a date-and-time name ("Frozen Sick-2026-11-23 18-45-07.abovevtt") so backups made the same day
  // don't collide; AboveVTT's own EXPORT button still names files by date only.
  M.register("export_backup", async (params = {}) => {
    const { result, names } = await M.withTimestampedDownloads(() => exportBackup(params));
    if (names.length) result.filename = names[names.length - 1];
    return result;
  });

  async function exportBackup({ timeoutSeconds = 180 } = {}) {
    M.requireDM();
    if (typeof window.export_file !== "function") {
      throw new Error("AboveVTT's export function was not found. This AboveVTT version may not be supported yet.");
    }
    if ($(".import-loading-indicator").length) {
      throw new Error("AboveVTT is already importing or exporting. Wait for it to finish and try again.");
    }
    const info = window.CAMPAIGN_INFO || {};
    // AboveVTT writes this timestamp only when an export has really finished.
    const stampKey = `AVTT-exportStamp-${info.id}`;
    const before = Number(localStorage.getItem(stampKey) || 0);
    const started = Date.now();

    const filename = M.stampFileName(`${info.name}-0000-0-0.abovevtt`); // replaced by the real name once AboveVTT downloads it

    // AboveVTT's own export. For very large campaigns it falls back to fetching scenes one by
    // one and resolves before that finishes, so we wait for the timestamp instead.
    // Listen for AboveVTT's own error popup while the export runs, so a failure is reported at once.
    let exportError = null;
    const originalShowError = window.showError;
    if (typeof originalShowError === "function") {
      window.showError = function (err, ...rest) {
        exportError = err?.message || String(err ?? "unknown error");
        if (rest.length && typeof rest[0] === "string") exportError = `${rest[0]}: ${exportError}`;
        return originalShowError.apply(this, [err, ...rest]);
      };
    }
    const p = export_file();
    let promiseResult;
    p?.then?.((v) => { promiseResult = v; }).catch(() => { promiseResult = false; });

    const deadline = started + timeoutSeconds * 1000;
    try {
    while (Date.now() < deadline) {
      const stamp = Number(localStorage.getItem(stampKey) || 0);
      if (stamp > before && stamp >= started - 1000) {
        const folderType = M.folderType();
        const all = window.ScenesHandler?.scenes || [];
        return {
          ok: true,
          filename,
          savedTo: "Chrome's Downloads folder (or wherever Chrome is set to save downloads)",
          seconds: Math.round((Date.now() - started) / 1000),
          contents: {
            scenes: all.filter((s) => s.itemType !== folderType).length,
            sceneFolders: all.filter((s) => s.itemType === folderType).length,
            tokenCustomizations: Array.isArray(window.TOKEN_CUSTOMIZATIONS) ? window.TOKEN_CUSTOMIZATIONS.length : null,
            notes: window.JOURNAL?.notes ? Object.keys(window.JOURNAL.notes).length : null,
            journalChapters: Array.isArray(window.JOURNAL?.chapters) ? window.JOURNAL.chapters.length : null,
            // AboveVTT only creates SOUNDPADS once the first soundpad is made, so missing means none.
            soundpads: window.SOUNDPADS ? Object.keys(window.SOUNDPADS).length : 0,
            musicTracks: typeof window.TRACK_LIBRARY?.map === "function" ? window.TRACK_LIBRARY.map().size : null,
          },
        };
      }
      if (exportError) {
        $(".import-loading-indicator").remove(); // AboveVTT leaves its spinner up after this error
        throw new Error(`AboveVTT's export failed: ${exportError}`);
      }
      if (promiseResult === false && !$(".import-loading-indicator").length) {
        throw new Error("AboveVTT's export failed (it could not fetch the scenes from AboveVTT's server). AboveVTT may show an error message on screen.");
      }
      await sleep(500);
    }
    } finally {
      if (originalShowError) window.showError = originalShowError;
    }
    throw new Error(`The export did not finish within ${timeoutSeconds} seconds. Check the AboveVTT tab: it may still be working, ` +
      "or Chrome may be asking whether to allow the download.");
  }
})();
