// Bridge between the MCP server and the "AboveVTT MCP Bridge" Chrome extension.
// The extension connects to ws://127.0.0.1:<port>, proves it knows the shared token,
// and then carries out calls inside the DM's AboveVTT tab.
//
// Several copies of this server can run at once (Claude desktop, a linked chat,
// Claude Code...). Only one can own the port. The first copy becomes the
// "primary": it accepts the extension and also accepts the other copies as
// "peers". A copy that finds the port taken connects to the primary as a peer
// and forwards its calls through it. If the primary exits, a peer takes over
// the port and the extension reconnects to it on its own.

import WebSocket, { WebSocketServer } from "ws";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const log = (...args) => console.error("[abovevtt-mcp]", ...args);

export const CONFIG_DIR = path.join(os.homedir(), ".abovevtt-mcp");
export const TOKEN_FILE = path.join(CONFIG_DIR, "bridge-token.txt");

export function loadOrCreateToken() {
  if (process.env.AVTT_BRIDGE_TOKEN) return process.env.AVTT_BRIDGE_TOKEN.trim();
  try {
    const existing = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (existing.length >= 16) return existing;
  } catch { /* create below */ }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const token = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(TOKEN_FILE, token + "\n", { encoding: "utf8" });
  return token;
}

export class Bridge {
  constructor({ port, token, version = "", callTimeoutMs = 20000 }) {
    this.port = port;
    this.token = token;
    this.version = version;
    this.callTimeoutMs = callTimeoutMs;
    this.pid = process.pid;
    this.startedAt = new Date().toISOString();
    this.role = "starting";      // starting | primary | peer

    // shared view of the extension (owned directly when primary, mirrored when peer)
    this.extensionInfo = null;   // { extVersion, connectedAt }
    this.tabs = [];              // latest tab list reported by the extension
    this.pending = new Map();    // id -> { resolve, reject, timer }
    this.nextId = 1;

    // primary
    this.wss = null;
    this.socket = null;          // the authenticated extension connection
    this.peers = new Set();      // authenticated peer connections
    this.listening = false;
    this.listenError = null;     // a bind error other than "port in use"

    // peer
    this.upstream = null;        // connection to the primary
    this.upstreamReady = false;
    this.primaryInfo = null;     // { pid, version, startedAt }
    this.remoteExtensionConnected = false;
    this.peerError = null;

    this.retryTimer = null;
    this.stopped = false;
  }

  start() {
    this.#listen();
    // Keep the extension's service worker awake and detect dead connections.
    this.keepAlive = setInterval(() => {
      if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: "ping", t: Date.now() }));
    }, 20000);
  }

  stop() {
    this.stopped = true;
    clearInterval(this.keepAlive);
    clearTimeout(this.retryTimer);
    try { this.upstream?.close(); } catch {}
    try { this.socket?.close(1001, "server shutting down"); } catch {}
    for (const p of this.peers) { try { p.close(1001, "primary shutting down"); } catch {} }
    try { this.wss?.close(); } catch {}
  }

  // ---------- becoming primary ---------------------------------------------

  #listen() {
    if (this.stopped) return;
    const wss = new WebSocketServer({ host: "127.0.0.1", port: this.port });
    wss.on("listening", () => {
      this.wss = wss;
      this.role = "primary";
      this.listening = true;
      this.listenError = null;
      this.peerError = null;
      log(`bridge listening on ws://127.0.0.1:${this.port} (primary, pid ${this.pid})`);
    });
    wss.on("error", (err) => {
      if (this.wss !== wss) {
        // Could not bind.
        try { wss.close(); } catch {}
        if (err.code === "EADDRINUSE") {
          this.#connectAsPeer();
        } else {
          this.role = "starting";
          this.listenError = err;
          log(`bridge could not listen on port ${this.port}: ${err.message}`);
          this.#retryLater(5000);
        }
        return;
      }
      log(`bridge server error: ${err.message}`);
    });
    wss.on("connection", (ws, req) => this.#onConnection(ws, req));
  }

  #retryLater(delayMs) {
    if (this.stopped) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.#listen(), delayMs);
  }

  #onConnection(ws, req) {
    const origin = req.headers.origin || "";
    const fromExtension = origin.startsWith("chrome-extension://");
    // Browsers always send an Origin header, so web pages can never pose as a peer.
    if (origin && !fromExtension) {
      log(`rejected connection from origin '${origin}'`);
      ws.close(4003, "origin not allowed");
      return;
    }
    let kind = null; // "extension" | "peer" once authenticated
    const authTimer = setTimeout(() => { if (!kind) ws.close(4001, "auth timeout"); }, 5000);

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (!kind) {
        const tokenOk = typeof msg.token === "string" && safeEqual(msg.token, this.token);
        if (fromExtension && msg.type === "hello" && tokenOk) {
          kind = "extension";
          clearTimeout(authTimer);
          if (this.socket && this.socket !== ws) this.socket.close(4000, "replaced by newer connection");
          this.socket = ws;
          this.extensionInfo = { extVersion: msg.extVersion, connectedAt: new Date().toISOString() };
          this.tabs = Array.isArray(msg.tabs) ? msg.tabs : [];
          ws.send(JSON.stringify({ type: "welcome" }));
          log(`extension connected (v${msg.extVersion})`);
          this.#broadcastState();
        } else if (!fromExtension && msg.type === "peer-hello" && tokenOk) {
          kind = "peer";
          clearTimeout(authTimer);
          ws.peerInfo = { pid: msg.pid, version: msg.version, startedAt: msg.startedAt };
          this.peers.add(ws);
          ws.send(JSON.stringify({ type: "peer-welcome", primary: this.#selfInfo(), state: this.#state() }));
          log(`peer joined (pid ${msg.pid}, v${msg.version})`);
        } else {
          ws.close(4001, "bad token");
        }
        return;
      }

      if (kind === "peer") {
        if (msg.type === "call") this.#servePeerCall(ws, msg);
        return;
      }

      // extension
      if (msg.type === "tabs") {
        this.tabs = Array.isArray(msg.tabs) ? msg.tabs : [];
        this.#broadcastState();
      } else if (msg.type === "result") {
        this.#settle(msg);
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (kind === "peer") {
        this.peers.delete(ws);
        log(`peer left (pid ${ws.peerInfo?.pid})`);
      } else if (kind === "extension" && this.socket === ws) {
        this.socket = null;
        this.tabs = [];
        this.extensionInfo = null;
        this.#rejectAll("The Chrome extension disconnected before answering.");
        log("extension disconnected");
        this.#broadcastState();
      }
    });
  }

  #servePeerCall(ws, msg) {
    const reply = (body) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "result", id: msg.id, ...body })); };
    this.call(msg.method, msg.params, { tabId: msg.tabId, timeoutMs: msg.timeoutMs })
      .then((result) => reply({ ok: true, result }))
      .catch((err) => reply({ ok: false, error: err.message }));
  }

  #selfInfo() { return { pid: this.pid, version: this.version, startedAt: this.startedAt }; }

  #state() {
    const connected = this.socket?.readyState === 1;
    return {
      extension: connected ? { connected: true, ...this.extensionInfo } : { connected: false },
      tabs: this.tabs,
    };
  }

  #broadcastState() {
    if (this.peers.size === 0) return;
    const payload = JSON.stringify({ type: "state", state: this.#state() });
    for (const p of this.peers) if (p.readyState === 1) p.send(payload);
  }

  // ---------- being a peer ---------------------------------------------------

  #connectAsPeer() {
    if (this.stopped) return;
    this.role = "peer";
    this.listening = false;
    const up = new WebSocket(`ws://127.0.0.1:${this.port}`);
    this.upstream = up;

    up.on("open", () => {
      up.send(JSON.stringify({
        type: "peer-hello", token: this.token, pid: this.pid, version: this.version, startedAt: this.startedAt,
      }));
    });
    up.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === "peer-welcome") {
        this.upstreamReady = true;
        this.peerError = null;
        this.primaryInfo = msg.primary || null;
        this.#applyState(msg.state);
        log(`joined the bridge owned by pid ${this.primaryInfo?.pid} as a peer`);
      } else if (msg.type === "state") {
        this.#applyState(msg.state);
      } else if (msg.type === "result") {
        this.#settle(msg);
      }
    });
    up.on("error", (err) => { this.peerError = err.message; }); // "close" follows
    up.on("close", (code) => {
      if (this.upstream !== up) return;
      const wasReady = this.upstreamReady;
      this.upstream = null;
      this.upstreamReady = false;
      this.primaryInfo = null;
      this.#applyState(null);
      this.#rejectAll("The AboveVTT MCP server that owns the bridge stopped before answering.");
      let delay = 1000;
      if (code === 4003) {
        this.peerError = `Port ${this.port} is held by a process that does not accept other copies ` +
          `(probably an older build of the AboveVTT MCP server).`;
        delay = 10000;
      } else if (code === 4001) {
        this.peerError = `The process on port ${this.port} rejected the token in ${TOKEN_FILE}.`;
        delay = 10000;
      } else if (wasReady) {
        this.peerError = "The primary server exited; taking over the port.";
        delay = 200 + Math.floor(Math.random() * 300); // spread out peers racing for the port
      } else if (!this.peerError) {
        this.peerError = `Connection to port ${this.port} closed (code ${code}).`;
      }
      if (wasReady) log("lost the primary; retrying the port");
      this.#retryLater(delay);
    });
  }

  #applyState(state) {
    this.remoteExtensionConnected = !!state?.extension?.connected;
    this.extensionInfo = this.remoteExtensionConnected ? { ...state.extension } : null;
    if (this.extensionInfo) delete this.extensionInfo.connected;
    this.tabs = Array.isArray(state?.tabs) ? state.tabs : [];
  }

  // ---------- calls ------------------------------------------------------------

  get connected() {
    if (this.role === "primary") return this.socket?.readyState === 1;
    if (this.role === "peer") return this.upstreamReady && this.upstream?.readyState === 1 && this.remoteExtensionConnected;
    return false;
  }

  /** Whether this copy can reach the bridge at all (as primary or through one). */
  get bridgeUp() {
    return (this.role === "primary" && this.listening) || (this.role === "peer" && this.upstreamReady);
  }

  /** Send a call to the AboveVTT tab and wait for its answer. */
  call(method, params = {}, { tabId, timeoutMs } = {}) {
    if (!this.connected) {
      return Promise.reject(new Error(notConnectedMessage(this)));
    }
    const target = this.role === "primary" ? this.socket : this.upstream;
    const id = this.nextId++;
    const wait = timeoutMs ?? this.callTimeoutMs;
    // A peer waits a little longer than the primary so the primary's own timeout message arrives first.
    const localWait = this.role === "peer" ? wait + 2000 : wait;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`AboveVTT tab did not answer '${method}' within ${wait / 1000}s.`));
      }, localWait);
      this.pending.set(id, { resolve, reject, timer });
      target.send(JSON.stringify({ type: "call", id, method, params, tabId, timeoutMs: wait }));
    });
  }

  #settle(msg) {
    const p = this.pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error || "Unknown error in AboveVTT tab"));
  }

  #rejectAll(message) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
      this.pending.delete(id);
    }
  }

  /** Summary of this copy's place in the bridge, for the status tool. */
  describe() {
    const d = { role: this.role, pid: this.pid, startedAt: this.startedAt, bridgePort: this.port };
    if (this.role === "primary") {
      d.listening = true;
      d.peers = [...this.peers].map((p) => p.peerInfo);
    } else if (this.role === "peer") {
      d.listening = false;
      if (this.upstreamReady) d.primary = this.primaryInfo;
      else d.peerError = this.peerError || "Connecting to the copy that owns the port…";
    } else {
      d.listening = false;
      if (this.listenError) d.listenError = String(this.listenError.code || this.listenError.message);
    }
    return d;
  }
}

export function notConnectedMessage(bridge) {
  if (bridge.role === "peer" && !bridge.upstreamReady) {
    return `Port ${bridge.port} is in use and this server could not join the process holding it: ` +
      `${bridge.peerError || "still connecting"}`;
  }
  if (bridge.role === "starting") {
    return bridge.listenError
      ? `The bridge could not open port ${bridge.port} (${bridge.listenError.code || bridge.listenError.message}).`
      : "The bridge is still starting.";
  }
  return "The AboveVTT MCP Bridge Chrome extension is not connected. Check that Chrome is open, the extension is " +
    `enabled, and its options page has port ${bridge.port} and the token from ${TOKEN_FILE}.`;
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
