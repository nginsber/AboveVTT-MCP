// Runs in the extension's isolated world on the campaign page.
// Passes messages between page.js (main world, next to AboveVTT) and background.js.
(() => {
  const FROM_PAGE = "avtt-mcp:page";
  const TO_PAGE = "avtt-mcp:ext";
  let port = null;

  function connect() {
    try {
      port = chrome.runtime.connect({ name: "avtt-tab" });
    } catch {
      return; // extension was reloaded; this page needs a refresh
    }
    port.onMessage.addListener((payload) => {
      window.postMessage({ channel: TO_PAGE, payload }, location.origin);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      setTimeout(connect, 1000); // service worker restarted; reconnect
    });
    // Ask the page script to introduce itself on every (re)connect.
    window.postMessage({ channel: TO_PAGE, payload: { type: "requestInfo" } }, location.origin);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.channel !== FROM_PAGE) return;
    if (port) port.postMessage(event.data.payload);
  });

  connect();
})();
