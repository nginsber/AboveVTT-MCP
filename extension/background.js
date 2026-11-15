// Service worker: keeps a WebSocket to the local AboveVTT MCP server and routes
// calls to the campaign tab(s) through relay.js.

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
  const tabId = pickTab(msg.tabId);
  if (tabId == null) {
    sendToServer({ type: "result", id: msg.id, ok: false,
      error: msg.tabId != null ? `No AboveVTT tab with id ${msg.tabId}.` : "No D&D Beyond campaign tab is open in Chrome." });
    return;
  }
  inFlight.set(msg.id, tabId);
  tabs.get(tabId).port.postMessage({ type: "call", id: msg.id, method: msg.method, params: msg.params });
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
