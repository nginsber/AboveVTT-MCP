// Refuses map-image links that point at this computer or the home/office network,
// so the "read map images" permission can't be used to reach a router, NAS or local service.
// Works on the hostname as the browser's URL parser normalises it (so 2130706433, 0x7f.1 and
// 127.1 all arrive as 127.0.0.1). A public name that resolves to a private address can't be
// caught here (extensions get no DNS lookup); Chrome's own Private Network Access rules cover part of that.
(function (root) {
  const NAME_SUFFIXES = [".localhost", ".local", ".lan", ".home", ".internal", ".intranet", ".corp", ".home.arpa"];

  function ipv4Private(h) {
    const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
    if (!m) return null;
    const [a, b] = [Number(m[1]), Number(m[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||       // this network, private, loopback, multicast/reserved
      (a === 169 && b === 254) ||                            // link-local (incl. cloud metadata 169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||                  // carrier-grade NAT / Tailscale
      (a === 192 && b === 0 && Number(m[3]) === 0) ||        // IETF protocol assignments
      (a === 198 && (b === 18 || b === 19))                  // benchmarking
    );
  }

  function ipv6Private(h) {
    if (!h.includes(":")) return null;
    const s = h.toLowerCase();
    if (s === "::" || s === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return ipv4Private(mapped[1]);
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s); // URL parser writes ::ffff:7f00:1
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
      return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(s.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00; // unique-local, link-local, multicast
  }

  // Returns a reason string if the URL must not be fetched, otherwise null.
  function blockedImageUrl(url) {
    let u;
    try { u = new URL(String(url)); } catch { return "That isn't a valid web link."; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return "Only http and https links can be read.";
    if (u.username || u.password) return "Links with a user name or password in them aren't read.";
    const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
    const why = "it points at this computer or your local network, which map reading is not allowed to reach";
    if (!host.includes(".") && !host.includes(":")) return `'${host}' is a local name: ${why}.`;
    if (host === "localhost" || NAME_SUFFIXES.some((s) => host.endsWith(s))) return `'${host}' is a local name: ${why}.`;
    if (ipv4Private(host) || ipv6Private(host)) return `'${host}' is a private address: ${why}.`;
    return null;
  }

  root.AVTT_blockedImageUrl = blockedImageUrl;
})(typeof self !== "undefined" ? self : globalThis);
