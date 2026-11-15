// Step 3: scene configuration through AboveVTT's own configure dialog (the cog on a scene).
// The dialog is opened off-screen, fields are read/set with AboveVTT's own controls and
// event handlers, and the scene is saved the same way the dialog's Save button does —
// except that we don't switch the DM's view to the edited scene.
/* global $, edit_scene_dialog, get_edit_form_data, did_update_scenes */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  // key → how to find the control in #edit_scene_form, plus a friendly label.
  // Kept in the same order as the dialog.
  const FIELDS = [
    { key: "title", label: "Scene Title", type: "text", sel: "input[name='title']" },
    { key: "player_map", label: "Map link (player map)", type: "url", sel: "input[name='player_map']" },
    { key: "player_map_is_video", label: "Map link is a video", type: "toggle", sel: "button[name='player_map_is_video']" },
    { key: "dm_map_usable", label: "Use DM Map", type: "toggle", sel: "button[name='dm_map_usable']" },
    { key: "dm_map", label: "DM Only Map link", type: "url", sel: "input[name='dm_map']" },
    { key: "dm_map_is_video", label: "DM map link is a video", type: "toggle", sel: "button[name='dm_map_is_video']" },
    { key: "darkness_filter", label: "Line of Sight/Darkness Opacity", type: "number", sel: "input[name='darkness_filter']", event: "input" },
    { key: "visionTrail", label: "Player Explored Vision Trail", type: "toggle", sel: "button[name='visionTrail']" },
    { key: "disableSceneVision", label: "Disable token vision/light", type: "toggle", sel: "button[name='disableSceneVision']" },
    { key: "snap", label: "Snap to Grid", type: "toggle", sel: "button[name='snap']" },
    { key: "alphaNumGrid", label: "Alphanumeric Grid Labels", type: "toggle", sel: "button[name='alphaNumGrid']" },
    { key: "grid", label: "Draw Grid", type: "toggle", sel: "button[name='grid']" },
    { key: "grid_color", label: "Grid colour", type: "color", sel: "input[name='grid_color']" },
    { key: "gridOver", label: "Grid layer", type: "select", sel: "#gridOverSelect" },
    { key: "grid_line_width", label: "Grid Line Width", type: "number", sel: "input[name='grid_line_width']", event: "input" },
    { key: "playlist", label: "Load Playlist", type: "select", sel: "#playlistSceneSelect" },
    { key: "weather", label: "Weather Overlay", type: "select", sel: "#weatherSceneSelect" },
    { key: "weatherIntensity", label: "Weather Intensity", type: "number", sel: "#weatherIntensitySlider", event: "input" },
    { key: "initial_x", label: "Initial Position X", type: "number", sel: "input[name='initial_x']" },
    { key: "initial_y", label: "Initial Position Y", type: "number", sel: "input[name='initial_y']" },
    { key: "initial_zoom", label: "Initial Zoom", type: "number", sel: "input[name='initial_zoom']" },
    { key: "hpps", label: "Grid pixel size in original image — width", type: "number", sel: "input[name='hpps']" },
    { key: "vpps", label: "Grid pixel size in original image — height", type: "number", sel: "input[name='vpps']" },
    { key: "offsetx", label: "Grid offset X (pixels)", type: "number", sel: "input[name='offsetx']" },
    { key: "offsety", label: "Grid offset Y (pixels)", type: "number", sel: "input[name='offsety']" },
    { key: "fpsq", label: "Units per square", type: "number", sel: "input[name='fpsq']" },
    { key: "upsq", label: "Distance unit (e.g. feet)", type: "text", sel: "input[name='upsq']" },
    { key: "scale_factor", label: "Scene Scale Factor", type: "number", sel: "input[name='scale_factor']" },
  ];
  // Named controls in the form that mirror another field or are internal.
  const IGNORE = new Set(["uuid", "darkness_filter_number", "gridStrokeNumberInput"]);
  const HIDE_CSS_ID = "avtt-mcp-hide-scene-dialog";

  // ---------- helpers ----------------------------------------------------------
  function sceneIndexFor({ sceneId, sceneTitle }) {
    const scenes = window.ScenesHandler.scenes;
    const folderType = M.folderType();
    const realScenes = scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.itemType !== folderType);
    let hit;
    if (sceneId) {
      hit = realScenes.find(({ s }) => s.id === sceneId);
      if (!hit) throw new Error(`No scene with id '${sceneId}'. Use list_scenes to find ids.`);
    } else if (sceneTitle) {
      const q = String(sceneTitle).trim().toLowerCase();
      const found = realScenes.filter(({ s }) => String(s.title || "").trim().toLowerCase() === q);
      if (found.length === 0) throw new Error(`No scene titled '${sceneTitle}'. Use list_scenes to find it.`);
      if (found.length > 1) {
        throw new Error(`${found.length} scenes are titled '${sceneTitle}': ` +
          found.map(({ s }) => s.id).join(", ") + ". Pass sceneId instead.");
      }
      hit = found[0];
    } else {
      const id = window.CURRENT_SCENE_DATA?.id;
      hit = realScenes.find(({ s }) => s.id === id);
      if (!hit) throw new Error("No scene is open. Pass sceneId or sceneTitle.");
    }
    return hit.i;
  }

  function requireFunctions() {
    for (const name of ["edit_scene_dialog", "get_edit_form_data", "did_update_scenes"]) {
      if (typeof window[name] !== "function" && typeof globalThis[name] !== "function") {
        throw new Error(`AboveVTT function '${name}' was not found. This AboveVTT version may not be supported yet.`);
      }
    }
    if (typeof $ !== "function") throw new Error("jQuery is not available on the page.");
  }

  function openDialog(index) {
    if ($("#edit_scene_form").length) {
      throw new Error("A scene configure dialog is already open in AboveVTT. Close it (Save or Cancel) and try again.");
    }
    if ($("#sources-import-main-container").length) {
      throw new Error("An AboveVTT import/edit window is open. Close it and try again.");
    }
    // Keep the dialog invisible while we work with it.
    $("head").append(`<style id="${HIDE_CSS_ID}">#sources-import-main-container{visibility:hidden!important;pointer-events:none!important}</style>`);
    try {
      edit_scene_dialog(index);
    } catch (err) {
      closeDialog();
      throw err;
    }
    const form = $("#edit_scene_form");
    if (!form.length) {
      closeDialog();
      throw new Error("AboveVTT's scene configure dialog did not open.");
    }
    return form;
  }

  function closeDialog() {
    $("#sources-import-main-container").remove();
    $(".ddb-classes-page-stylesheet").remove();
    $("#scene_selector").removeAttr("disabled");
    $(`#${HIDE_CSS_ID}`).remove();
  }

  function rowHelp(el) {
    const title = el.closest("[title]").attr("title");
    return title ? String(title).trim() : undefined;
  }

  function readField(form, f) {
    const el = form.find(f.sel).first();
    if (!el.length) return null;
    const out = { key: f.key, label: f.label, type: f.type };
    if (f.type === "toggle") {
      out.value = el.hasClass("rc-switch-checked");
    } else if (f.type === "color") {
      try {
        const c = el.spectrum("get").toRgb();
        out.value = `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
      } catch { out.value = el.val(); }
    } else if (f.type === "select") {
      out.value = String(el.val());
      out.choices = el.find("option").map((_, o) => ({ value: String(o.value), label: $(o).text() })).get();
      const sel = out.choices.find((c) => c.value === out.value);
      if (sel) out.valueLabel = sel.label;
    } else if (f.type === "number") {
      const raw = el.val();
      out.value = raw === "" || raw == null ? null : Number(raw);
      for (const a of ["min", "max", "step"]) {
        const v = el.attr(a);
        if (v !== undefined && v !== "" && v !== "any") out[a] = Number(v);
      }
    } else {
      out.value = el.val() ?? "";
    }
    if (f.key === "weatherIntensity" && !el.closest("#weatherIntensityRow_row").is(":visible") &&
        form.find("#weatherSceneSelect").val() === "0") {
      out.note = "Only used when a weather overlay is selected.";
    }
    if ((f.key === "dm_map" || f.key === "dm_map_is_video")) out.note = "Only used when 'Use DM Map' is on.";
    if (f.key === "gridOver" || f.key === "grid_color" || f.key === "grid_line_width") out.note = "Only used when 'Draw Grid' is on.";
    const help = rowHelp(el);
    if (help) out.help = help;
    return out;
  }

  /** Every named control the dialog has that this connector doesn't know yet (new AboveVTT versions). */
  function readExtraFields(form) {
    const known = new Set(FIELDS.map((f) => f.key));
    const extras = [];
    form.find("input[name], button.rc-switch[name]").each((_, node) => {
      const el = $(node);
      const name = el.attr("name");
      if (!name || known.has(name) || IGNORE.has(name) || el.attr("type") === "hidden") return;
      known.add(name);
      const isToggle = el.is("button");
      extras.push({
        key: name,
        label: name,
        type: isToggle ? "toggle" : (el.attr("type") === "number" || el.attr("type") === "range") ? "number" : "text",
        value: isToggle ? el.hasClass("rc-switch-checked") : el.val(),
        note: "Not yet described by the connector; read-only.",
      });
    });
    return extras;
  }

  function readAll(form) {
    const fields = FIELDS.map((f) => readField(form, f)).filter(Boolean);
    return { fields, extras: readExtraFields(form) };
  }

  function toBool(v, key) {
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["1", "true", "on", "yes"].includes(s)) return true;
    if (["0", "false", "off", "no"].includes(s)) return false;
    throw new Error(`'${key}' is an on/off setting; use true or false.`);
  }

  function setField(form, f, value) {
    const el = form.find(f.sel).first();
    if (!el.length) throw new Error(`'${f.key}' is not in this AboveVTT version's scene dialog.`);

    if (f.type === "toggle") {
      const want = toBool(value, f.key);
      if (el.hasClass("rc-switch-checked") !== want) el.trigger("click"); // AboveVTT's own toggle handler
      return;
    }
    if (f.type === "select") {
      const choices = el.find("option").map((_, o) => ({ value: String(o.value), label: $(o).text() })).get();
      const s = String(value).trim().toLowerCase();
      const hit = choices.find((c) => c.value.toLowerCase() === s) || choices.find((c) => c.label.trim().toLowerCase() === s);
      if (!hit) {
        throw new Error(`'${value}' is not a choice for '${f.key}'. Choices: ` + choices.map((c) => `${c.label} (${c.value})`).join(", "));
      }
      el.val(hit.value).trigger("change");
      return;
    }
    if (f.type === "color") {
      const probe = new Option().style;
      probe.color = String(value);
      if (!probe.color) throw new Error(`'${value}' is not a colour. Use a name, #hex or rgba(...).`);
      el.spectrum("set", String(value));
      el.trigger("change.spectrum");
      return;
    }
    if (f.type === "number") {
      if (value === null || value === "") { el.val("").trigger(f.event || "change"); return; }
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`'${f.key}' needs a number.`);
      const min = el.attr("min"), max = el.attr("max");
      if (min !== undefined && min !== "" && n < Number(min)) throw new Error(`'${f.key}' must be at least ${min}.`);
      if (max !== undefined && max !== "" && n > Number(max)) throw new Error(`'${f.key}' must be at most ${max}.`);
      el.val(String(n)).trigger(f.event || "change");
      return;
    }
    const s = String(value ?? "");
    if (f.type === "url" && s.startsWith("data:")) throw new Error("Map links that start with 'data:' crash AboveVTT; use a normal web link.");
    el.val(s).trigger("change");
  }

  /** Same steps as the dialog's Save button, minus switching the DM to the scene. */
  async function saveLikeDialog(form, index) {
    const scene = window.ScenesHandler.scenes[index];
    const formData = await get_edit_form_data();
    scene.gridOver = +($("#gridOverSelect").val() || 0);
    for (const key in formData) scene[key] = formData[key];
    scene.playlist = $("#playlistSceneSelect").val();
    scene.weather = $("#weatherSceneSelect").val();
    scene.weatherIntensity = $("#weatherIntensitySlider").val();
    await window.ScenesHandler.persist_scene(index, false);
    did_update_scenes();
  }

  const summary = (index) => {
    const s = window.ScenesHandler.scenes[index];
    return { id: s.id, title: s.title, dmIsHere: s.id === window.CURRENT_SCENE_DATA?.id, playersAreHere: s.id === window.PLAYER_SCENE_ID };
  };

  // Other steps (create_scene) check field names against this list up front.
  M.sceneConfigKeys = FIELDS.map((f) => f.key);

  // ---------- handlers ------------------------------------------------------------
  M.register("get_scene_config", async (params) => {
    M.requireDM();
    requireFunctions();
    const index = sceneIndexFor(params);
    const form = openDialog(index);
    try {
      return { scene: summary(index), ...readAll(form) };
    } finally {
      closeDialog();
    }
  });

  M.register("update_scene_config", async ({ changes, ...which } = {}) => {
    M.requireDM();
    requireFunctions();
    if (!changes || typeof changes !== "object" || !Object.keys(changes).length) {
      throw new Error("Nothing to change. Pass 'changes', e.g. { \"title\": \"Ice Cave\", \"grid\": true }.");
    }
    const index = sceneIndexFor(which);
    const form = openDialog(index);
    try {
      const byKey = new Map(FIELDS.map((f) => [f.key, f]));
      const unknown = Object.keys(changes).filter((k) => !byKey.has(k));
      if (unknown.length) {
        throw new Error(`Unknown field(s): ${unknown.join(", ")}. Valid fields: ${FIELDS.map((f) => f.key).join(", ")}.`);
      }
      const before = readAll(form).fields;
      // Weather first: choosing a weather type resets the intensity to that type's default,
      // so an intensity given in the same call must be applied after it.
      const order = Object.keys(changes).sort((a, b) => (a === "weather" ? -1 : b === "weather" ? 1 : 0));
      for (const key of order) setField(form, byKey.get(key), changes[key]);

      const after = readAll(form).fields;
      const diff = {};
      for (const a of after) {
        const b = before.find((x) => x.key === a.key);
        if (b && JSON.stringify(b.value) !== JSON.stringify(a.value)) {
          diff[a.key] = { label: a.label, from: b.valueLabel ?? b.value, to: a.valueLabel ?? a.value };
        }
      }
      if (Object.keys(diff).length === 0) {
        return { scene: summary(index), saved: false, changed: {}, message: "Those values were already set; nothing to save." };
      }
      await saveLikeDialog(form, index);
      return { scene: summary(index), saved: true, changed: diff };
    } finally {
      closeDialog();
    }
  });
})();
