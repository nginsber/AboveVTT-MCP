// Service worker: keeps a WebSocket to the local AboveVTT MCP server and routes
// calls to the campaign tab(s) through relay.js. Methods starting with "ext_" are
// handled here in the service worker itself (e.g. reading a map image for step 15).
importScripts("grid_detect.js");

const EXT_VERSION = chrome.runtime.getManifest().version;
const DEFAULT_PORT = 47321;

/** tabId -> { port, info, updatedAt } */
const tabs = new Map();
let ws = null;
let wsState = "disconnected"; // disconnected | connecting | connected | bad-token
let lastError = "";
let reconnectTimer = null;
let retryDelay = 1000;
/** server call id -> tabId */
const inFlight = new Map();

// ---------- tabs ------------------------------------------------------------
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "avtt-tab" || !port.sender?.tab) return;
  const tabId = port.sender.tab.id;
  tabs.set(tabId, { port, info: { url: port.sender.tab.url }, updatedAt: Date.now() });

  port.onMessage.addListener((msg) => {
    if (msg?.type === "info") {
      const entry = tabs.get(tabId);
      if (entry) { entry.info = msg.info; entry.updatedAt = Date.now(); }
      sendTabs();
    } else if (msg?.type === "result") {
      inFlight.delete(msg.id);
      sendToServer(msg);
    }
  });
  port.onDisconnect.addListener(() => {
    tabs.delete(tabId);
    for (const [id, t] of inFlight) {
      if (t === tabId) {
        inFlight.delete(id);
        sendToServer({ type: "result", id, ok: false, error: "The AboveVTT tab was closed or reloaded." });
      }
    }
    sendTabs();
  });
  sendTabs();
  ensureConnected();
});

function tabList() {
  return [...tabs.entries()].map(([tabId, t]) => ({ tabId, ...t.info, updatedAt: t.updatedAt }));
}

/** Prefer a ready DM tab, most recently updated first. */
function pickTab(requested) {
  if (requested != null) return tabs.has(requested) ? requested : null;
  const list = tabList().sort((a, b) => score(b) - score(a) || b.updatedAt - a.updatedAt);
  return list[0]?.tabId ?? null;
}
const score = (t) => (t.aboveVttRunning ? 2 : 0) + (t.isDM ? 1 : 0);

// ---------- server connection ----------------------------------------------
async function settings() {
  const s = await chrome.storage.local.get({ port: DEFAULT_PORT, token: "" });
  return { port: Number(s.port) || DEFAULT_PORT, token: String(s.token || "").trim() };
}

async function ensureConnected() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(reconnectTimer);
  const { port, token } = await settings();
  if (!token) { setState("disconnected", "No token set. Open the extension's options page."); return; }

  setState("connecting");
  let socket;
  try {
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
  } catch (e) {
    setState("disconnected", e.message);
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "hello", token, extVersion: EXT_VERSION, tabs: tabList() }));
  };
  socket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === "welcome") { retryDelay = 1000; setState("connected"); sendTabs(); return; }
    if (msg.type === "ping") return; // keeps this worker alive
    if (msg.type === "call") routeCall(msg);
  };
  socket.onclose = (event) => {
    if (ws === socket) ws = null;
    if (event.code === 4001) setState("bad-token", "The server rejected the token. Copy it again from bridge-token.txt.");
    else setState("disconnected", event.reason || "Server not running (is Claude desktop open?)");
    scheduleReconnect(event.code === 4001 ? 30000 : undefined);
  };
  socket.onerror = () => { /* onclose follows */ };
}

function scheduleReconnect(delay) {
  clearTimeout(reconnectTimer);
  const wait = delay ?? retryDelay;
  retryDelay = Math.min(retryDelay * 2, 15000);
  reconnectTimer = setTimeout(ensureConnected, wait);
}

function routeCall(msg) {
  if (typeof msg.method === "string" && msg.method.startsWith("ext_")) { handleLocal(msg); return; }
  const tabId = pickTab(msg.tabId);
  if (tabId == null) {
    sendToServer({ type: "result", id: msg.id, ok: false,
      error: msg.tabId != null ? `No AboveVTT tab with id ${msg.tabId}.` : "No D&D Beyond campaign tab is open in Chrome." });
    return;
  }
  inFlight.set(msg.id, tabId);
  tabs.get(tabId).port.postMessage({ type: "call", id: msg.id, method: msg.method, params: msg.params });
}

// ---------- calls handled in the service worker ------------------------------
const IMAGE_ORIGINS = ["https://*/*", "http://*/*"];
const MAX_PIXELS = 16_000_000; // larger maps are scaled down for the analysis (results scaled back)

async function handleLocal(msg) {
  const reply = (ok, payload) => sendToServer(ok ? { type: "result", id: msg.id, ok: true, result: payload } : { type: "result", id: msg.id, ok: false, error: payload });
  try {
    if (msg.method === "ext_detect_grid") reply(true, await detectGridFromUrl(msg.params || {}));
    else reply(false, `Unknown method '${msg.method}'.`);
  } catch (e) {
    reply(false, e?.message || String(e));
  }
}

async function detectGridFromUrl({ url, minSquare, maxSquare }) {
  const u = String(url || "");
  if (!/^https?:\/\//i.test(u)) throw new Error("The scene's map isn't a web link (it may be an AboveVTT upload or a data link), so it can't be read.");
  if (!(await chrome.permissions.contains({ origins: IMAGE_ORIGINS }))) {
    throw new Error("The extension isn't allowed to read map images yet. Open the AboveVTT MCP Bridge options page (click its icon) and click 'Allow reading map images', then try again.");
  }
  let res;
  try { res = await fetch(u, { credentials: "omit" }); } catch (e) { throw new Error(`Couldn't download the map image: ${e?.message || e}`); }
  if (!res.ok) throw new Error(`Couldn't download the map image (HTTP ${res.status}).`);
  const blob = await res.blob();
  if (/^video\//i.test(blob.type)) throw new Error("This map is a video; grid detection only works on images.");
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch { throw new Error(`The map link didn't return an image the browser can read (type '${blob.type || "unknown"}').`); }
  const W = bmp.width, H = bmp.height;
  const scale = W * H > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / (W * H)) : 1;
  const w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const r = self.AVTT_detectGrid(ctx.getImageData(0, 0, w, h), {
    minSquare: Math.max(8, Math.round((minSquare || 20) * scale)), maxSquare: Math.round((maxSquare || 400) * scale),
  });
  if (scale !== 1) {
    // back to original-image pixels, which is what AboveVTT's grid settings use
    const up = (v) => (v === undefined ? v : +(v / scale).toFixed(2));
    for (const a of [r.x, r.y]) if (a) { a.spacing = up(a.spacing); a.offset = +(a.offset / scale).toFixed(1); a.lineWidth = Math.max(1, Math.round(a.lineWidth / scale)); }
    r.squarePx = up(r.squarePx);
  }
  r.width = W; r.height = H; r.analysedAtScale = +scale.toFixed(3);
  return r;
}

function sendToServer(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function sendTabs() { sendToServer({ type: "tabs", tabs: tabList() }); }

function setState(state, error = "") {
  wsState = state;
  lastError = error;
  const badge = { connected: ["ON", "#2e7d32"], connecting: ["…", "#f9a825"], "bad-token": ["KEY", "#c62828"] }[state] || ["OFF", "#757575"];
  chrome.action.setBadgeText({ text: badge[0] });
  chrome.action.setBadgeBackgroundColor({ color: badge[1] });
}

// ---------- options page / popup --------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "getState") {
    sendResponse({ state: wsState, error: lastError, tabs: tabList(), extVersion: EXT_VERSION });
  } else if (msg?.type === "imageAccess") {
    chrome.permissions.contains({ origins: IMAGE_ORIGINS }).then((has) => sendResponse({ has }));
    return true;
  } else if (msg?.type === "reconnect") {
    if (ws) { try { ws.close(); } catch {} ws = null; }
    retryDelay = 1000;
    ensureConnected().then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onStartup.addListener(ensureConnected);
chrome.runtime.onInstalled.addListener(ensureConnected);
setState("disconnected");
ensureConnected();
