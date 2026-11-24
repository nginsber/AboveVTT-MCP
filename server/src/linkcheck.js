// Checks whether links still work, for audit_campaign. Never reaches this computer or the local network:
// every hop (including redirects) and every address a name resolves to is checked first.
import dns from "node:dns/promises";
import { blockedUrl, isPrivateAddress } from "./netguard.js";

const UA = "Mozilla/5.0 (AboveVTT-MCP link check)";
const MAX_REDIRECTS = 5;

// What a working link of each kind should return.
const EXPECT = {
  image: { ok: (t) => /^image\//.test(t), what: "an image" },
  map: { ok: (t) => /^(image|video)\//.test(t), what: "an image" },
  token: { ok: (t) => /^(image|video)\//.test(t), what: "an image or video" }, // AboveVTT plays .webm/.mp4/.m4v tokens as video
  video: { ok: (t) => /^video\//.test(t), what: "a video" },
  audio: { ok: (t) => /^(audio|video)\//.test(t) || t === "application/ogg", what: "an audio file" },
  page: { ok: () => true, what: "a page" },
};
const BINARY = /^(application\/octet-stream|binary\/octet-stream|application\/binary|application\/x-download|application\/force-download)$/;

const result = (status, reason, extra = {}) => ({ status, reason, ...extra });
// status: ok | broken | warning | unchecked

function networkReason(err) {
  const code = err?.cause?.code || err?.code || "";
  const name = err?.name || "";
  if (name === "AbortError" || name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT") return result("unchecked", "the site didn't answer in time");
  if (code === "ENOTFOUND" || code === "EAI_NONAME") return result("broken", "the website doesn't exist (no such address)");
  if (code === "EAI_AGAIN") return result("unchecked", "the website's address couldn't be looked up right now");
  if (code === "ECONNREFUSED") return result("broken", "the website refused the connection");
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return result("unchecked", "the connection was dropped");
  if (/CERT|SSL|TLS/i.test(code) || /certificate/i.test(String(err?.cause?.message || err?.message))) return result("broken", "the site's secure connection (certificate) failed");
  return result("unchecked", `couldn't reach the site (${code || err?.message || "error"})`);
}

async function hostIsLocal(url, lookup) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  let addrs;
  try { addrs = await lookup(host, { all: true }); }
  catch (err) {
    if (err?.code === "ENOTFOUND" || err?.code === "EAI_NONAME") return { notFound: true };
    return { error: err };
  }
  const bad = (addrs || []).find((a) => isPrivateAddress(a.address));
  return bad ? { local: bad.address } : {};
}

/**
 * Check one link. kind: image | map | video | audio | page.
 * Returns { status, reason, httpStatus?, finalUrl? }.
 */
export async function checkLink(url, kind = "page", { fetchImpl = fetch, lookup = dns.lookup, timeoutMs = 10000 } = {}) {
  const expect = EXPECT[kind] || EXPECT.page;
  const youTube = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url);
  if (youTube) {
    // YouTube answers 200 even for removed videos; its oEmbed endpoint says 404 / 401 instead.
    const full = /^https?:/i.test(url) ? url : `https://${url}`;
    try {
      const r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(full)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
      try { await r.body?.cancel?.(); } catch { /* ignore */ }
      if (r.ok) return result("ok", "", { httpStatus: r.status });
      if ([400, 401, 403, 404].includes(r.status)) return result("broken", r.status === 401 || r.status === 403 ? "the YouTube video is private or can't be embedded" : "the YouTube video doesn't exist or was removed", { httpStatus: r.status });
      return result("unchecked", `YouTube answered HTTP ${r.status}`, { httpStatus: r.status });
    } catch (err) { return networkReason(err); }
  }

  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const blocked = blockedUrl(current);
    if (blocked) return result("warning", hop ? `redirects to a link that ${blocked}` : `${blocked}: players on other networks can't load it (not fetched)`);
    const where = await hostIsLocal(current, lookup);
    if (where.notFound) return result("broken", "the website doesn't exist (no such address)");
    if (where.local) return result("warning", `the website's address is on a local network (${where.local}): players on other networks can't load it (not fetched)`);
    if (where.error) return networkReason(where.error);

    let res;
    const ask = async (method) => {
      const headers = { "User-Agent": UA, Accept: kind === "page" ? "*/*" : `${kind === "audio" ? "audio" : kind === "video" ? "video" : "image"}/*,*/*;q=0.8` };
      if (method === "GET") headers.Range = "bytes=0-1023";
      const r = await fetchImpl(current, { method, redirect: "manual", headers, signal: AbortSignal.timeout(timeoutMs) });
      try { await r.body?.cancel?.(); } catch { /* ignore */ }
      return r;
    };
    try {
      res = await ask("HEAD");
      // Plenty of hosts mishandle HEAD: anything but a success or redirect is asked again with a small GET,
      // and so is a success whose content type isn't what this kind of link needs (Dropbox's file servers,
      // for example, answer HEAD with application/json but send the real file to a GET).
      const headType = String(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const headOk = res.status >= 200 && res.status < 300;
      if (!(res.status >= 200 && res.status < 400) || (headOk && headType && !BINARY.test(headType) && !expect.ok(headType))) res = await ask("GET");
    } catch (err) {
      try { res = await ask("GET"); } catch (err2) { return networkReason(err2); }
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return result("unchecked", `the site answered HTTP ${res.status} without saying where to go`, { httpStatus: res.status });
      const next = new URL(loc, current).toString();
      if (/^https?:\/\/i\.imgur\.com\/removed\.(png|jpg|jpeg|gif)$/i.test(next)) return result("broken", "the image was removed from Imgur", { httpStatus: res.status });
      current = next;
      continue;
    }
    const s = res.status;
    const finalUrl = current === url ? undefined : current;
    if (s === 404 || s === 410) return result("broken", `not found (HTTP ${s})`, { httpStatus: s, finalUrl });
    if (s === 401 || s === 403) {
      return kind === "page"
        ? result("ok", "", { httpStatus: s, finalUrl }) // a page behind a sign-in still exists
        : result("warning", `the site refuses to hand out this file (HTTP ${s}); players' browsers may be refused too`, { httpStatus: s, finalUrl });
    }
    if (s === 429 || s >= 500) return result("unchecked", `the site is busy or having trouble (HTTP ${s})`, { httpStatus: s, finalUrl });
    if (s < 200 || s >= 300) return result("unchecked", `the site answered HTTP ${s}`, { httpStatus: s, finalUrl });

    const type = String(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!type || BINARY.test(type) || expect.ok(type)) return result("ok", "", { httpStatus: s, finalUrl, contentType: type || undefined });
    if (type === "text/html" || type === "application/xhtml+xml") {
      // A direct Imgur image link that answers with a page means the image is gone.
      if (kind !== "page" && /^https?:\/\/i\.imgur\.com\//i.test(url)) return result("broken", "the image no longer exists on Imgur", { httpStatus: s, finalUrl, contentType: type });
      return result("warning", `opens a web page, not ${expect.what}`, { httpStatus: s, finalUrl, contentType: type });
    }
    return result("warning", `is ${type}, not ${expect.what}`, { httpStatus: s, finalUrl, contentType: type });
  }
  return result("broken", `redirects more than ${MAX_REDIRECTS} times`);
}

/** Check many links, `concurrency` at a time; same URL+kind is only checked once. */
export async function checkLinks(items, { concurrency = 8, ...opts } = {}) {
  const key = (it) => `${it.kind}|${it.url}`;
  const unique = [...new Map(items.map((it) => [key(it), it])).values()];
  const out = new Map();
  const queue = [...unique];
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      try { out.set(key(it), await checkLink(it.url, it.kind, opts)); }
      catch (err) { out.set(key(it), result("unchecked", `check failed: ${err?.message || err}`)); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length || 1) }, worker));
  return items.map((it) => ({ ...it, ...out.get(key(it)) }));
}
