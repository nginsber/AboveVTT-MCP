const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.local.get({ port: 47321, token: "", browserName: "" });
  $("port").value = s.port;
  $("token").value = s.token;
  $("browserName").value = s.browserName;
}

async function refresh() {
  const r = await chrome.runtime.sendMessage({ type: "getState" });
  const el = $("state");
  const lines = [`Server connection: ${r.state}${r.error ? " — " + r.error : ""}`, `Extension version: ${r.extVersion}`];
  if (r.title) lines.push("", r.title.replace(/\nClick for settings\.$/, ""), "");
  if (r.tabs.length === 0) lines.push("Campaign tabs: none open");
  for (const t of r.tabs) {
    lines.push(`Tab ${t.tabId}: ${t.campaignName || t.gameId || t.url} — ` +
      (t.aboveVttRunning ? (t.isDM ? "AboveVTT running as DM" : "AboveVTT running as player") : "AboveVTT not running"));
  }
  el.textContent = lines.join("\n");
  el.className = r.state === "connected" ? "connected" : r.state === "bad-token" ? "bad" : "";
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ port: Number($("port").value) || 47321, token: $("token").value.trim(), browserName: $("browserName").value.trim().slice(0, 40) });
  await chrome.runtime.sendMessage({ type: "reconnect" });
  setTimeout(refresh, 800);
});

const ORIGINS = ["https://*/*", "http://*/*"];
async function refreshImageAccess() {
  const has = await chrome.permissions.contains({ origins: ORIGINS });
  $("imageState").textContent = has ? "✓ Allowed. Grid detection can read map images." : "Not allowed yet.";
  $("imageAccess").textContent = has ? "Remove permission to read map images" : "Allow reading map images";
  $("imageAccess").dataset.has = has ? "1" : "";
}
$("imageAccess").addEventListener("click", async () => {
  if ($("imageAccess").dataset.has) await chrome.permissions.remove({ origins: ORIGINS });
  else await chrome.permissions.request({ origins: ORIGINS });
  refreshImageAccess();
});

load();
refresh();
refreshImageAccess();
setInterval(refresh, 2000);
