// Review item 3b: only one AboveVTT DM tab is active at a time, across tabs, browsers and PCs.
//
// AboveVTT doesn't track whether a DM is connected (players announce themselves; DM tabs never do), so each
// DM tab running this bridge announces itself on AboveVTT's own message channel and listens for the others:
//   - a small "custom/myVTT/avttMcpPresence" message when it starts and every 30 s (AboveVTT ignores message
//     types it doesn't know, in players' browsers too, and nothing is shown anywhere);
//   - the first DM tab is the active one; a DM tab that finds an active one already is paused: an overlay
//     covers the page so it can't be edited by accident, and the MCP won't change anything through it;
//   - switching is never automatic: only "Use here" in the paused tab (two steps, the Yes button waits ~2 s)
//     or a request in chat (step 3c). If the active tab goes silent (closed, asleep, offline), the paused tab
//     says so and offers Use here; it still waits for the user.
// Every claim to be active carries an "epoch" that goes up by one on each switch, so a tab that comes back
// after sleeping sees it was replaced and pauses itself. Two tabs starting at the very same moment both
// claim epoch 1; the earlier one (then the lower tab id) stays active.
// Nothing in AboveVTT is changed: this only sends through window.MB.sendMessage, adds its own listener to
// AboveVTT's connection, and puts an overlay on top of the page.
(() => {
  const M = window.AVTT_MCP;
  if (!M || M.presence) return;

  const TYPE = "custom/myVTT/avttMcpPresence";
  // Timings (tests shrink them through window.__AVTT_MCP_PRESENCE_TIMING__; nothing else sets it)
  const T = Object.assign({
    HEARTBEAT_MS: 30000,     // announce this often
    EXPIRE_MS: 75000,        // a tab not heard from for this long is gone
    JOIN_WAIT_MS: 4000,      // listen this long for an active tab before claiming to be active
    REPLY_GAP_MS: 3000,      // answer new tabs at most this often
    CONFIRM_DELAY_MS: 2000,  // "Yes, use this tab" can't be clicked for this long
    TICK_MS: 1000,
  }, window.__AVTT_MCP_PRESENCE_TIMING__ || {});
  const { HEARTBEAT_MS, EXPIRE_MS, JOIN_WAIT_MS, REPLY_GAP_MS, CONFIRM_DELAY_MS, TICK_MS } = T;

  const me = { tabId: crypto.randomUUID(), role: null, epoch: 0, since: null };
  const peers = new Map();      // tabId -> last message from that tab, plus lastSeen
  let attachedTo = null;        // the AboveVTT WebSocket our listener is on
  let joinTimer = null, lastReply = 0, lastBeat = 0;
  let pausedBy = null;          // tab id of the active tab when we paused (for the overlay text)
  let pausedHow = null;         // "found" (another tab was already active) | "taken" (another tab took over)
  let confirming = null;        // timestamp when the confirm step was opened

  // ---------- helpers ------------------------------------------------------------------------------
  const identity = () => M.identity || { browserId: "", browserName: "" };
  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const alive = (p) => Date.now() - p.lastSeen < EXPIRE_MS;
  /** Does claim a win over claim b? Higher epoch, then earlier since, then lower tab id. */
  const beats = (a, b) => (a.epoch !== b.epoch ? a.epoch > b.epoch : a.since !== b.since ? a.since < b.since : a.tabId < b.tabId);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const maxEpoch = () => Math.max(me.epoch, ...[...peers.values()].map((p) => p.epoch || 0));
  function where(p) {
    const name = p.name ? `'${p.name}'` : null;
    if (p.browserId && p.browserId === identity().browserId) return name ? `another tab in this browser (${name})` : "another tab in this browser";
    return name ? `${name}` : "another browser or PC";
  }
  /** The active tab among the others (alive, best claim), if any. */
  function activePeer() {
    let best = null;
    for (const p of peers.values()) if (p.role === "active" && alive(p) && (!best || beats(p, best))) best = p;
    return best;
  }
  function ready() {
    const mb = window.MB;
    return window.DM === true && mb && typeof mb.sendMessage === "function" && mb.abovews && mb.abovews.readyState === 1;
  }

  // ---------- messages -----------------------------------------------------------------------------
  function send(event) {
    if (!ready()) return;
    const id = identity();
    try {
      window.MB.sendMessage(TYPE, {
        v: 1, event, tabId: me.tabId, browserId: id.browserId, name: id.browserName.slice(0, 40),
        version: M.version, role: me.role, epoch: me.epoch, since: me.since,
      }, true);
    } catch (err) { console.warn("[AboveVTT MCP] presence message not sent:", err); }
  }

  function attach() {
    const ws = window.MB?.abovews;
    if (!ws || ws === attachedTo) return;
    attachedTo = ws;
    ws.addEventListener("message", onSocketMessage); // alongside AboveVTT's own handler, not instead of it
    if (me.role === "active" || me.role === "paused") { lastBeat = Date.now(); send("hello"); } // reconnected
  }

  function onSocketMessage(event) {
    let m;
    try { m = JSON.parse(event.data); } catch { return; }
    const d = m?.eventType === TYPE ? m.data : null;
    if (!d || d.v !== 1 || typeof d.tabId !== "string" || d.tabId === me.tabId) return;
    handle(d);
  }

  function handle(d) {
    if (d.event === "bye") { peers.delete(d.tabId); render(); report(); return; }
    const known = peers.has(d.tabId);
    peers.set(d.tabId, {
      tabId: d.tabId, browserId: String(d.browserId || ""), name: String(d.name || "").slice(0, 40), version: d.version,
      role: d.role === "active" || d.role === "paused" ? d.role : "joining",
      epoch: Number(d.epoch) || 0, since: Number(d.since) || 0, lastSeen: Date.now(),
    });
    const p = peers.get(d.tabId);
    // Answer straight away: a tab we didn't know, one just starting, or one that wrongly thinks it's active
    // (e.g. it woke from sleep after a switch), so it pauses now rather than at our next announcement.
    const stale = me.role === "active" && p.role === "active" && beats(me, p);
    if ((!known || p.role === "joining" || stale) && me.role && Date.now() - lastReply > REPLY_GAP_MS) { lastReply = Date.now(); send("reply"); }
    // two active tabs (a switch, or two that started at the same moment): the losing claim pauses
    if (me.role === "active" && p.role === "active" && beats(p, me)) pause(d.event === "takeover" || p.epoch > me.epoch ? "taken" : "found", p.tabId);
    render();
    report();
  }

  // ---------- roles --------------------------------------------------------------------------------
  function startJoin() {
    me.role = "joining";
    send("hello");
    joinTimer = setTimeout(() => {
      joinTimer = null;
      const a = activePeer();
      if (a) { me.epoch = a.epoch; pause("found", a.tabId); }
      else becomeActive();
      lastBeat = Date.now();
      send("hello");
    }, JOIN_WAIT_MS);
  }

  function becomeActive() {
    me.role = "active";
    me.epoch = maxEpoch() + 1;
    me.since = Date.now();
    pausedBy = pausedHow = null;
    confirming = null;
    render();
    report();
  }

  function pause(how, byTabId) {
    me.role = "paused";
    pausedHow = how;
    pausedBy = byTabId;
    render();
    report();
  }

  /** Make this tab the active DM tab. Only ever called after the user asked (Use here + Yes, or chat). */
  function takeOver() {
    if (me.role !== "paused") return { changed: false, role: me.role };
    const previous = activePeer();
    becomeActive();
    lastBeat = Date.now();
    send("takeover");
    return { changed: true, role: me.role, previous: previous ? describe(previous) : null };
  }

  // ---------- overlay ------------------------------------------------------------------------------
  let overlay = null;
  const CSS = `
    #avtt-mcp-pause { position: fixed; inset: 0; z-index: 2147483647; background: rgba(15,15,18,.62);
      display: flex; align-items: center; justify-content: center; font: 15px/1.45 system-ui, sans-serif; }
    #avtt-mcp-pause .card { background: #fff; color: #202124; max-width: 460px; margin: 16px; padding: 22px 24px;
      border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,.45); }
    #avtt-mcp-pause h2 { font-size: 18px; margin: 0 0 10px; }
    #avtt-mcp-pause p { margin: 0 0 12px; }
    #avtt-mcp-pause .who { font-weight: 600; }
    #avtt-mcp-pause .row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; flex-wrap: wrap; }
    #avtt-mcp-pause button { font: inherit; padding: 7px 14px; border-radius: 6px; border: 1px solid #b0b4ba; background: #f1f3f4; cursor: pointer; }
    #avtt-mcp-pause button.main { background: #1a73e8; border-color: #1a73e8; color: #fff; }
    #avtt-mcp-pause button.warn { background: #c5221f; border-color: #c5221f; color: #fff; }
    #avtt-mcp-pause button:disabled { opacity: .45; cursor: default; }
    #avtt-mcp-pause .small { font-size: 12px; color: #5f6368; }`;

  function pausedText() {
    const a = activePeer();
    const by = a || peers.get(pausedBy);
    if (a) {
      const lead = pausedHow === "taken" ? `${cap(where(a))} was made the active DM tab at ${time(a.since)}.` : `AboveVTT is already open as DM in ${where(a)}, active since ${time(a.since)}.`;
      return { title: "This DM tab is paused", body: `${lead} Only one DM tab is used at a time, so the two can't overwrite each other's changes.`, gone: false, by: a };
    }
    const name = by ? where(by) : "The other DM tab";
    return {
      title: "This DM tab is paused",
      body: `${cap(name)} hasn't been heard from for over a minute. It may have been closed, or its PC is asleep or offline. This tab stays paused until you choose to use it.`,
      gone: true, by,
    };
  }

  function render() {
    const paused = me.role === "paused";
    if (!paused) { if (overlay) { overlay.remove(); overlay = null; } return; }
    if (!document.body) return;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "avtt-mcp-pause";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      const style = document.createElement("style");
      style.textContent = CSS;
      overlay.appendChild(style);
      overlay.appendChild(document.createElement("div")).className = "card";
      document.body.appendChild(overlay);
    }
    const card = overlay.querySelector(".card");
    const t = pausedText();
    const key = JSON.stringify([t.title, t.body, t.gone, confirming ? Math.min(1, Math.floor((Date.now() - confirming) / CONFIRM_DELAY_MS)) : -1]);
    if (card.dataset.key === key) return; // nothing changed
    card.dataset.key = key;
    card.textContent = "";
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; card.appendChild(e); return e; };

    if (confirming) {
      const otherName = t.by ? where(t.by) : "the other DM tab";
      el("h2", null, "Make this the active DM tab?");
      el("p", null, `${cap(otherName)} will be paused.${t.gone ? "" : " If you're still working there, unsaved edits in that tab could be lost."}`);
      const row = el("div", "row");
      const cancel = row.appendChild(document.createElement("button"));
      cancel.textContent = "Cancel";
      cancel.onclick = () => { confirming = null; render(); };
      const yes = row.appendChild(document.createElement("button"));
      yes.className = "warn";
      yes.textContent = "Yes, use this tab";
      const wait = CONFIRM_DELAY_MS - (Date.now() - confirming);
      yes.disabled = wait > 0;
      yes.onclick = () => { if (Date.now() - confirming >= CONFIRM_DELAY_MS) takeOver(); };
      setTimeout(() => cancel.focus(), 0);
      return;
    }
    el("h2", null, t.title);
    el("p", null, t.body);
    el("p", "small", "Reading still works here, but changes are blocked, by hand and through Claude. (AboveVTT MCP Bridge)");
    const row = el("div", "row");
    const leave = row.appendChild(document.createElement("button"));
    leave.textContent = "Leave AboveVTT in this tab";
    leave.onclick = () => { location.href = `${location.origin}/campaigns/${window.gameId ?? location.pathname.split("/")[2]}`; };
    const use = row.appendChild(document.createElement("button"));
    use.className = "main";
    use.textContent = "Use here";
    use.onclick = () => { confirming = Date.now(); render(); };
  }

  // While paused, keys, wheel and paste don't reach the page (clicks are already stopped by the overlay).
  for (const type of ["keydown", "keyup", "keypress", "wheel", "paste", "drop", "contextmenu"]) {
    window.addEventListener(type, (e) => {
      if (me.role !== "paused" || (overlay && overlay.contains(e.target))) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    }, { capture: true, passive: false });
  }

  // ---------- reporting ----------------------------------------------------------------------------
  function describe(p) {
    return { tabId: p.tabId, name: p.name || null, where: where(p), role: p.role, since: p.since || null, lastSeen: p.lastSeen, sameBrowser: !!p.browserId && p.browserId === identity().browserId, version: p.version || null };
  }
  let lastReport = "";
  function report() {
    // page.js checks tab info every 3 s; nudge background.js now so the MCP sees a role change sooner
    const key = `${me.role}`;
    if (key !== lastReport) { lastReport = key; M.nudge(); }
  }

  M.presence = {
    get role() { return me.role === "active" || me.role === "paused" ? me.role : null; },
    /** Small summary for the tab info (icon tooltip, server): where the active tab is, how many other DM tabs. */
    summary() {
      const others = [...peers.values()].filter(alive);
      const a = activePeer();
      return { dmOtherTabs: others.length, ...(me.role === "paused" ? { dmActiveWhere: a ? where(a) : null } : {}) };
    },
    state() {
      const others = [...peers.values()].filter(alive).map(describe);
      const a = activePeer();
      return { tabId: me.tabId, role: this.role, since: me.since, otherDMTabs: others, active: me.role === "active" ? "this tab" : a ? describe(a) : null };
    },
    pausedMessage() {
      const a = activePeer();
      return a ? `This DM tab is paused because ${where(a)} is the active DM tab.` : "This DM tab is paused (the active DM tab hasn't been heard from for over a minute).";
    },
    takeOver,
  };

  // ---------- step 3c: switching from chat (only when the user asks; the server enforces preview + yes) --------
  M.register("get_dm_presence", async () => ({ ...M.presence.state(), browserName: identity().browserName || null }));
  M.register("take_over_dm", async ({ dryRun } = {}) => {
    M.requireDM();
    if (me.role !== "active" && me.role !== "paused") throw new Error("This DM tab is still checking for other DM tabs. Try again in a few seconds.");
    const a = activePeer();
    // The preview must not include anything that changes on its own (like last-seen times): the server compares
    // it with a fresh preview just before switching.
    const other = a ? { tabId: a.tabId, where: where(a), name: a.name || null, since: a.since || null, sameBrowser: !!a.browserId && a.browserId === identity().browserId } : null;
    if (me.role === "active") return { ...(dryRun ? { dryRun: true } : {}), alreadyActive: true, changed: false };
    if (dryRun) return { dryRun: true, alreadyActive: false, wouldPause: other, activeTabGone: !a };
    const r = takeOver();
    return { alreadyActive: false, changed: r.changed, paused: other, activeTabGone: !a };
  });

  // ---------- main loop ----------------------------------------------------------------------------
  setInterval(() => {
    if (!ready()) return;
    attach();
    for (const [id, p] of peers) if (Date.now() - p.lastSeen > 3 * EXPIRE_MS) peers.delete(id); // tidy
    if (!me.role && !joinTimer) startJoin();
    if ((me.role === "active" || me.role === "paused") && Date.now() - lastBeat >= HEARTBEAT_MS) { lastBeat = Date.now(); send("hello"); }
    if (me.role === "paused") render(); // overlay text changes when the active tab goes quiet; confirm countdown
  }, TICK_MS);
  window.addEventListener("pagehide", () => send("bye"));
})();
