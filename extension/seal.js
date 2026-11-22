// Loaded last (see manifest.json): every feature file has registered its methods by now, so lock the bridge.
// After this, no script on the page can add or replace methods (security review item 2).
(() => {
  if (window.top !== window || !window.AVTT_MCP || Object.isFrozen(window.AVTT_MCP)) return;
  window.AVTT_MCP.seal();
})();
