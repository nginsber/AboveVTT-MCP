// Server-side copy of extension/netguard.js: refuses links to this computer or the local network.
// The server can also look up DNS, so isPrivateAddress() is used on every resolved address too.
const NAME_SUFFIXES = [".localhost", ".local", ".lan", ".home", ".internal", ".intranet", ".corp", ".home.arpa"];

function ipv4Private(h) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && Number(m[3]) === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function ipv6Private(h) {
  if (!h.includes(":")) return null;
  const s = h.toLowerCase();
  if (s === "::" || s === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return ipv4Private(mapped[1]);
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(s.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
}

/** True for loopback, private, link-local, CGNAT, multicast and similar addresses (IPv4 or IPv6). */
export function isPrivateAddress(ip) {
  const h = String(ip).replace(/^\[|\]$/g, "").toLowerCase();
  return !!(ipv4Private(h) || ipv6Private(h));
}

/** A reason string if the URL must not be fetched, otherwise null. */
export function blockedUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return "isn't a valid web link"; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "isn't an http or https link";
  if (u.username || u.password) return "has a user name or password in it";
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host.includes(".") && !host.includes(":")) return `points at a local name ('${host}')`;
  if (host === "localhost" || NAME_SUFFIXES.some((s) => host.endsWith(s))) return `points at a local name ('${host}')`;
  if (isPrivateAddress(host)) return `points at a private address ('${host}')`;
  return null;
}
