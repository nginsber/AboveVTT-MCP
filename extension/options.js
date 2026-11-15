const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.local.get({ port: 47321, token: "" });
  $("port").value = s.port;
  $("token").value = s.token;
}

async function refresh() {
  const r = await chrome.runtime.sendMessage({ type: "getState" });
  const el = $("state");
  const lines = [`Server connection: ${r.state}${r.error ? " — " + r.error : ""}`, `Extension version: ${r.extVersion}`];
  if (r.tabs.length === 0) lines.push("Campaign tabs: none open");
  for (const t of r.tabs) {
    lines.push(`Tab ${t.tabId}: ${t.campaignName || t.gameId || t.url} — ` +
      (t.aboveVttRunning ? (t.isDM ? "AboveVTT running as DM" : "AboveVTT running as player") : "AboveVTT not running"));
  }
  el.textContent = lines.join("\n");
  el.className = r.state === "connected" ? "connected" : r.state === "bad-token" ? "bad" : "";
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ port: Number($("port").value) || 47321, token: $("token").value.trim() });
  await chrome.runtime.sendMessage({ type: "reconnect" });
  setTimeout(refresh, 800);
});

load();
refresh();
setInterval(refresh, 2000);
