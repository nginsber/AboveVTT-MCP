// Step 8: the Settings tab options.
// Three groups, all read from AboveVTT's own definitions so new options show up automatically:
//   aboveVTT      — avtt_settings()            → get/set_avtt_setting_value (same side effects as the tab)
//   tokenDefaults — token_setting_options()    → window.TOKEN_SETTINGS + persist_token_settings
//   sceneDefaults — scene_setting_options()    → window.SCENE_DEFAULT_SETTINGS + persist_default_scene_settings
// Buttons on the Settings tab (export, import, recover, …) are step 9.
/* global $, avtt_settings, token_setting_options, scene_setting_options, get_avtt_setting_value,
   set_avtt_setting_value, persist_token_settings, persist_default_scene_settings, init_settings,
   redraw_settings_panel_token_examples, default_options, debounceCampaignSettings */
(() => {
  const M = window.AVTT_MCP;
  if (!M || window.top !== window) return;

  const GROUPS = ["aboveVTT", "tokenDefaults", "sceneDefaults"];
  const SECTION = { defaults: "Default Settings", ui: "UI", stream: "Streaming/P2P", performance: "Performance", debug: "Debugging" };
  // Token default vision/light colours live outside token_setting_options() (the "extra options" in the flyout).
  const TOKEN_COLORS = [
    ["visionColor", "vision", "Vision colour"],
    ["devilsightColor", "devilsight", "Devil's Sight colour"],
    ["truesightColor", "truesight", "Truesight colour"],
    ["light1Color", "light1", "Inner light colour"],
    ["light2Color", "light2", "Outer light colour"],
  ];

  const plain = (html) => (html ? String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) : undefined);

  function need(...names) {
    for (const n of names) {
      if (typeof window[n] !== "function") throw new Error(`AboveVTT function '${n}' was not found. This AboveVTT version may not be supported yet.`);
    }
  }

  function rangeOf(def) {
    const o = Array.isArray(def.options) ? def.options[0] : undefined;
    return o && (o.min !== undefined || o.max !== undefined) ? { min: o.min, max: o.max, step: o.step } : {};
  }

  /** Settings the Settings tab shows (customButtons are actions → step 9; hidden ones aren't shown). */
  function definitions(group) {
    if (group === "aboveVTT") {
      need("avtt_settings");
      return avtt_settings().filter((s) => s.type !== "customButton" && s.hiddenSetting !== true && !(s.dmOnly && !window.DM));
    }
    if (group === "tokenDefaults") {
      need("token_setting_options");
      return token_setting_options().filter((s) => s.hiddenSetting !== true && !(s.dmOnly && !window.DM));
    }
    if (group === "sceneDefaults") {
      need("scene_setting_options");
      return scene_setting_options().filter((s) => s.hiddenSetting !== true);
    }
    throw new Error(`group must be one of: ${GROUPS.join(", ")}.`);
  }

  function choicesOf(def) {
    if (def.type !== "dropdown" && def.type !== "toggle") return undefined;
    return (def.options || []).map((o) => ({ value: o.value, label: o.label ?? String(o.value), description: plain(o.description) }));
  }

  function currentValue(group, def) {
    if (group === "aboveVTT") return get_avtt_setting_value(def.name);
    const store = group === "tokenDefaults" ? window.TOKEN_SETTINGS : window.SCENE_DEFAULT_SETTINGS;
    return store && store[def.name] !== undefined ? store[def.name] : def.defaultValue;
  }

  function isSet(group, def) {
    if (group === "aboveVTT") return window.EXPERIMENTAL_SETTINGS?.[def.name] !== undefined;
    const store = group === "tokenDefaults" ? window.TOKEN_SETTINGS : window.SCENE_DEFAULT_SETTINGS;
    return store?.[def.name] !== undefined;
  }

  function describe(group, def) {
    const value = currentValue(group, def);
    const out = {
      key: def.name,
      label: plain(def.label) || def.name,
      type: def.type,
      value,
      default: def.defaultValue,
      changedFromDefault: isSet(group, def) && JSON.stringify(value) !== JSON.stringify(def.defaultValue),
    };
    if (group === "aboveVTT") {
      out.section = SECTION[def.class] || def.class;
      out.scope = def.global === 1 ? "all campaigns in this browser" : "this campaign (in this browser)";
    }
    const choices = choicesOf(def);
    if (choices) {
      out.choices = choices;
      const hit = choices.find((c) => JSON.stringify(c.value) === JSON.stringify(value) || String(c.value) === String(value));
      if (hit) out.valueLabel = hit.label;
    }
    if (def.type === "rangeInput") Object.assign(out, rangeOf(def));
    if (def.type === "flyoutButton") {
      out.subOptions = (def.options || []).map((o) => ({
        key: o.name, label: plain(o.label) || o.name, type: o.type, default: o.defaultValue,
        choices: choicesOf(o)?.map((c) => ({ value: c.value, label: c.label })),
      }));
    }
    const help = plain(def.description) || plain(def.options?.[0]?.description);
    if (help && def.type !== "toggle" && def.type !== "dropdown") out.help = help;
    if (def.type === "toggle" || def.type === "dropdown") {
      const cur = choices?.find((c) => String(c.value) === String(value));
      if (cur?.description) out.help = cur.description;
    }
    return out;
  }

  function tokenColorEntries() {
    const d = typeof default_options === "function" ? default_options() : {};
    return TOKEN_COLORS.map(([key, store, label]) => ({
      key, label, type: "colorSelect",
      value: window.TOKEN_SETTINGS?.[store]?.color ?? (store === "light1" ? d.light1?.color : d.light2?.color),
      default: store === "light1" ? d.light1?.color : d.light2?.color,
      changedFromDefault: window.TOKEN_SETTINGS?.[store]?.color !== undefined &&
        toRgbaQuiet(window.TOKEN_SETTINGS[store].color) !== toRgbaQuiet(store === "light1" ? d.light1?.color : d.light2?.color),
    }));
  }

  // ---------- value checking --------------------------------------------------------
  function toRgba(color, key) {
    const probe = new Option().style;
    probe.color = String(color);
    if (!probe.color) throw new Error(`'${key}': '${color}' is not a colour. Use a name, #hex or rgba(...).`);
    let css = probe.color;
    if (!/^rgba?\(/.test(css)) {
      // Chrome keeps colour names ("red") as-is; let a canvas turn them into numbers.
      try {
        const ctx = document.createElement("canvas").getContext("2d");
        if (ctx) { ctx.fillStyle = "#000"; ctx.fillStyle = css; css = ctx.fillStyle; }
      } catch { /* fall through */ }
    }
    const hex = css.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 1)`;
    }
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (!m) return css;
    const [r, g, b, a = 1] = m[1].split(",").map((x) => Number(x.trim()));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  function toRgbaQuiet(c) { try { return toRgba(c, "colour"); } catch { return String(c); } }

  function coerce(def, value, key = def.name) {
    if (def.type === "toggle") {
      if (typeof value === "boolean") return value;
      const s = window.AVTT_MCP.nameKey(value);
      if (["true", "on", "yes", "1"].includes(s)) return true;
      if (["false", "off", "no", "0"].includes(s)) return false;
      throw new Error(`'${key}' is on/off; use true or false.`);
    }
    if (def.type === "dropdown") {
      const opts = def.options || [];
      const s = window.AVTT_MCP.nameKey(value);
      const hit = opts.find((o) => String(o.value).toLowerCase() === s) || opts.find((o) => window.AVTT_MCP.nameKey(o.label ?? "") === s);
      if (!hit) throw new Error(`'${value}' is not a choice for '${key}'. Choices: ` + opts.map((o) => `${o.label ?? o.value} (${o.value})`).join(", "));
      return hit.value; // keeps AboveVTT's own type (string, number or boolean)
    }
    if (def.type === "rangeInput") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`'${key}' needs a number.`);
      const { min, max } = rangeOf(def);
      if (min !== undefined && n < min) throw new Error(`'${key}' must be at least ${min}.`);
      if (max !== undefined && n > max) throw new Error(`'${key}' must be at most ${max}.`);
      return n;
    }
    if (def.type === "colorSelect") return toRgba(value, key);
    if (def.type === "text") return String(value ?? "");
    if (def.type === "flyoutButton") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`'${key}' is a group of options; pass an object such as { "${def.options?.[0]?.name ?? "option"}": … }.`);
      }
      const subs = new Map((def.options || []).map((o) => [o.name, o]));
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        const sub = subs.get(k);
        if (!sub) throw new Error(`'${key}' has no option '${k}'. Options: ${[...subs.keys()].join(", ")}.`);
        out[k] = sub.type === "flyoutButton" ? v : coerce(sub, v, `${key}.${k}`);
      }
      return out;
    }
    throw new Error(`'${key}' (${def.type}) can't be changed by the connector.`);
  }

  function refreshSettingsPanel() {
    try {
      const body = $("#settings-panel .sidebar-panel-body");
      if (body.length && typeof init_settings === "function") { body.empty(); init_settings(); }
      else if (typeof redraw_settings_panel_token_examples === "function") redraw_settings_panel_token_examples();
    } catch (err) {
      console.warn("[AVTT MCP] settings panel refresh failed", err);
    }
  }

  // ---------- apply, mirroring what the Settings tab does ---------------------------
  function applyAboveVTT(name, value) {
    const notes = [];
    if (name === "2024Tooltips") { window.tooltipCache = {}; window.spellIdCache = {}; }
    if (name === "autoReconnect" && value === true) {
      notes.push("AboveVTT's warning: enabling Auto Reconnect may cause desync or tokens to reset for everyone due to missed messages on disconnect. Only recommended if your connection drops often.");
    }
    set_avtt_setting_value(name, value);
    if (name === "quickToggleDefaults") window.defaultToggles = value;
    if (name === "campaignDefaults") {
      window.AVTT_CAMPAIGN_INFO.campaignSettings = value;
      if (typeof debounceCampaignSettings === "function") debounceCampaignSettings(); // saved to AboveVTT's server after ~5 s
      notes.push("Campaign suggested defaults are shared with your players (saved to AboveVTT's server within a few seconds).");
    }
    return notes;
  }

  // Shared with step 11 (creature token options).
  M.tokenOptionDefs = () => definitions("tokenDefaults");
  M.coerceSetting = (def, value, key) => coerce(def, value, key);
  M.toRgba = (c, key) => toRgba(c, key);

  // ---------- handlers -------------------------------------------------------------
  M.register("list_settings", async ({ group, search, changedOnly } = {}) => {
    M.requireDM();
    need("get_avtt_setting_value");
    const groups = group ? [group] : GROUPS;
    const q = search ? String(search).toLowerCase() : null;
    const result = {};
    for (const g of groups) {
      let items = definitions(g).map((d) => describe(g, d));
      if (g === "tokenDefaults") items = items.concat(tokenColorEntries());
      if (q) items = items.filter((i) => `${i.key} ${i.label} ${i.help ?? ""} ${i.section ?? ""}`.toLowerCase().includes(q));
      if (changedOnly) items = items.filter((i) => i.changedFromDefault);
      result[g] = items;
    }
    return result;
  });

  M.register("set_setting", async ({ group, changes } = {}) => {
    M.requireDM();
    if (!GROUPS.includes(group)) throw new Error(`group must be one of: ${GROUPS.join(", ")}.`);
    if (!changes || typeof changes !== "object" || !Object.keys(changes).length) throw new Error("Nothing to change: pass changes { key: value }.");
    const defs = new Map(definitions(group).map((d) => [d.name, d]));
    const colorKeys = new Map(TOKEN_COLORS.map(([k, store]) => [k, store]));

    // Check everything first.
    const planned = [];
    for (const [key, raw] of Object.entries(changes)) {
      if (group === "tokenDefaults" && colorKeys.has(key)) {
        planned.push({ key, color: true, value: toRgba(raw, key) });
        continue;
      }
      const def = defs.get(key);
      if (!def) {
        const valid = [...defs.keys(), ...(group === "tokenDefaults" ? colorKeys.keys() : [])];
        throw new Error(`'${key}' is not a ${group} setting. Valid keys: ${valid.join(", ")}.`);
      }
      let value = coerce(def, raw);
      if (def.type === "flyoutButton") {
        const cur = currentValue(group, def);
        value = { ...(cur && typeof cur === "object" ? cur : {}), ...value }; // partial update
      }
      planned.push({ key, def, value });
    }

    const changed = [];
    const notes = [];
    for (const p of planned) {
      if (p.color) {
        window.TOKEN_SETTINGS[colorKeys.get(p.key)] ??= {};
        const before = window.TOKEN_SETTINGS[colorKeys.get(p.key)].color;
        window.TOKEN_SETTINGS[colorKeys.get(p.key)].color = p.value;
        if (before !== p.value) changed.push({ key: p.key, from: before, to: p.value });
        continue;
      }
      const before = currentValue(group, p.def);
      if (JSON.stringify(before) === JSON.stringify(p.value) && isSet(group, p.def)) continue;
      if (group === "aboveVTT") notes.push(...applyAboveVTT(p.key, p.value));
      else if (group === "tokenDefaults") window.TOKEN_SETTINGS[p.key] = p.value;
      else window.SCENE_DEFAULT_SETTINGS[p.key] = p.value;
      changed.push({ key: p.key, label: plain(p.def.label), from: before, to: p.value });
    }
    if (changed.length) {
      if (group === "tokenDefaults") { need("persist_token_settings"); persist_token_settings(window.TOKEN_SETTINGS); }
      if (group === "sceneDefaults") { need("persist_default_scene_settings"); persist_default_scene_settings(window.SCENE_DEFAULT_SETTINGS); }
      refreshSettingsPanel();
    }
    return { group, changed, notes };
  });

  M.register("reset_setting", async ({ group, keys, all, dryRun } = {}) => {
    M.requireDM();
    if (!GROUPS.includes(group)) throw new Error(`group must be one of: ${GROUPS.join(", ")}.`);
    if (!all && (!Array.isArray(keys) || keys.length === 0)) throw new Error("Pass keys to reset, or all: true.");
    const colorKeys = new Map(TOKEN_COLORS.map(([k, store]) => [k, store]));
    const reset = [];

    if (group === "aboveVTT") {
      // Same as the tab's "Reset to Defaults" button when all: true (it goes through every AboveVTT setting).
      const every = avtt_settings();
      const targets = all ? every : keys.map((k) => {
        const d = every.find((s) => s.name === k);
        if (!d || d.type === "customButton") throw new Error(`'${k}' is not an AboveVTT setting that can be reset.`);
        return d;
      });
      for (const d of targets) {
        const before = get_avtt_setting_value(d.name);
        if (JSON.stringify(before) !== JSON.stringify(d.defaultValue)) reset.push({ key: d.name, from: before, to: d.defaultValue });
        if (dryRun) continue;
        set_avtt_setting_value(d.name, d.defaultValue);
        if (d.name === "quickToggleDefaults") window.defaultToggles = d.defaultValue;
      }
    } else {
      const store = group === "tokenDefaults" ? window.TOKEN_SETTINGS : window.SCENE_DEFAULT_SETTINGS;
      const defs = new Map(definitions(group).map((d) => [d.name, d]));
      const targets = all
        ? [...defs.keys(), ...(group === "tokenDefaults" ? colorKeys.keys() : [])]
        : keys;
      const d0 = typeof default_options === "function" ? default_options() : {};
      for (const k of targets) {
        if (group === "tokenDefaults" && colorKeys.has(k)) {
          const s = colorKeys.get(k);
          const def = s === "light1" ? d0.light1?.color : d0.light2?.color;
          const before = store[s]?.color;
          if (before !== def) reset.push({ key: k, from: before, to: def });
          if (dryRun) continue;
          // Keep the object (AboveVTT's flyout reads TOKEN_SETTINGS.vision.color etc. directly).
          store[s] ??= {};
          store[s].color = def;
          continue;
        }
        if (!defs.has(k)) throw new Error(`'${k}' is not a ${group} setting.`);
        if (store[k] !== undefined) {
          reset.push({ key: k, from: store[k], to: defs.get(k).defaultValue });
          if (!dryRun) delete store[k];
        }
      }
      if (!dryRun) {
        if (group === "tokenDefaults") persist_token_settings(window.TOKEN_SETTINGS);
        else persist_default_scene_settings(window.SCENE_DEFAULT_SETTINGS);
      }
    }
    if (dryRun) return { group, reset, dryRun: true };
    if (reset.length) refreshSettingsPanel();
    return { group, reset };
  });
})();
