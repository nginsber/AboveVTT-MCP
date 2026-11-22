// Runs in the extension's isolated world on the campaign page.
// Tells background.js when this campaign tab opens or closes (through the port), and passes on page.js's bare
// "infoChanged" nudge. It no longer carries commands, results or tab info: background.js runs commands and
// reads tab info itself with chrome.scripting.executeScript, so page scripts can't fake them
// (security review item 2).
(() => {
  const FROM_PAGE = "avtt-mcp:page";
  let port = null;

  function connect() {
    try {
      port = chrome.runtime.connect({ name: "avtt-tab" });
    } catch {
      return; // extension was reloaded; this page needs a refresh
    }
    port.onDisconnect.addListener(() => {
      port = null;
      setTimeout(connect, 1000); // service worker restarted; reconnect
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.channel !== FROM_PAGE) return;
    if (event.data.payload?.type === "infoChanged" && port) port.postMessage({ type: "infoChanged" }); // nothing else is passed on
  });

  connect();
})();
