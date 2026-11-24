// audit_campaign's link checker, against a fake web (no network): node test/linkcheck.test.mjs
import { checkLink, checkLinks } from "../server/src/linkcheck.js";

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : "  " + extra}`); };

// ---- a pretend internet ----
const DNS = { "img.example.com": "93.184.216.34", "dl.example.com": "93.184.216.37", "cdn.example.com": "93.184.216.35", "i.imgur.com": "151.101.1.1",
  "sneaky.example.com": "192.168.1.20", "www.youtube.com": "142.250.1.1", "slow.example.com": "93.184.216.36" };
const lookup = async (host) => { if (!DNS[host]) { const e = new Error("nf"); e.code = "ENOTFOUND"; throw e; } return [{ address: DNS[host], family: 4 }]; };
const seen = [];
const resp = (status, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(headers), body: { cancel: async () => {} } });
const PAGES = {
  "https://img.example.com/ok.png": () => resp(200, { "content-type": "image/png" }),
  "https://img.example.com/gone.png": () => resp(404),
  "https://img.example.com/page.png": () => resp(200, { "content-type": "text/html; charset=utf-8" }),
  "https://img.example.com/octet.png": () => resp(200, { "content-type": "application/octet-stream" }),
  "https://img.example.com/nohead.png": (m) => (m === "HEAD" ? resp(405) : resp(206, { "content-type": "image/jpeg" })),
  "https://img.example.com/private.png": () => resp(403),
  "https://dl.example.com/door.png": (m) => (m === "HEAD" ? resp(200, { "content-type": "application/json" }) : resp(206, { "content-type": "image/png" })),
  "https://dl.example.com/fake.png": () => resp(200, { "content-type": "application/json" }),
  "https://img.example.com/moved.png": () => resp(301, { location: "https://cdn.example.com/new.png" }),
  "https://cdn.example.com/new.png": () => resp(200, { "content-type": "image/webp" }),
  "https://i.imgur.com/abc.png": () => resp(302, { location: "https://i.imgur.com/removed.png" }),
  "https://img.example.com/toLocal.png": () => resp(302, { location: "http://192.168.1.1/x.png" }),
  "https://img.example.com/loop": () => resp(302, { location: "https://img.example.com/loop" }),
  "https://img.example.com/busy.mp3": () => resp(503),
  "https://img.example.com/ghast.webm": () => resp(200, { "content-type": "video/webm" }),
  "https://img.example.com/song.mp3": () => resp(200, { "content-type": "audio/mpeg" }),
  "https://img.example.com/song.ogg": () => resp(200, { "content-type": "application/ogg" }),
  "https://img.example.com/members": () => resp(403),
  "https://i.imgur.com/doesnotexist123.png": () => resp(200, { "content-type": "text/html" }),
  "https://sneaky.example.com/x.png": () => resp(200, { "content-type": "image/png" }),
  "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dgood": () => resp(200, { "content-type": "application/json" }),
  "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dgone": () => resp(404),
};
const fetchImpl = async (url, { method = "GET" } = {}) => {
  seen.push(url);
  if (url.startsWith("https://slow.example.com")) { const e = new Error("timeout"); e.name = "TimeoutError"; throw e; }
  const p = PAGES[url];
  return p ? p(method) : resp(404);
};
const opts = { fetchImpl, lookup, timeoutMs: 1000 };
const is = async (label, url, kind, status, reasonRe) => {
  const r = await checkLink(url, kind, opts);
  check(`${label}: ${status}`, r.status === status && (!reasonRe || reasonRe.test(r.reason)), JSON.stringify(r));
};

await is("working image", "https://img.example.com/ok.png", "image", "ok");
await is("deleted image", "https://img.example.com/gone.png", "image", "broken", /HTTP 404/);
await is("link opens a web page", "https://img.example.com/page.png", "image", "warning", /web page, not an image/);
await is("binary content type is fine", "https://img.example.com/octet.png", "image", "ok");
await is("HEAD says JSON but GET sends the image (Dropbox)", "https://dl.example.com/door.png", "image", "ok");
await is("JSON for both HEAD and GET is still suspect", "https://dl.example.com/fake.png", "image", "warning", /application\/json, not an image/);
await is("host that refuses HEAD", "https://img.example.com/nohead.png", "map", "ok");
await is("403 on an image", "https://img.example.com/private.png", "image", "warning", /refuses/);
await is("403 on a journal link (page exists)", "https://img.example.com/members", "page", "ok");
await is("followed redirect", "https://img.example.com/moved.png", "image", "ok");
await is("Imgur removed image", "https://i.imgur.com/abc.png", "image", "broken", /removed from Imgur/);
await is("redirect into the local network", "https://img.example.com/toLocal.png", "image", "warning", /redirects to a link that points at a private address/);
await is("redirect loop", "https://img.example.com/loop", "image", "broken", /more than 5/);
await is("site busy", "https://img.example.com/busy.mp3", "audio", "unchecked", /HTTP 503/);
await is("animated .webm token image", "https://img.example.com/ghast.webm", "token", "ok");
await is("…but a video in a journal <img> is suspect", "https://img.example.com/ghast.webm", "image", "warning", /video\/webm, not an image/);
await is("audio file", "https://img.example.com/song.mp3", "audio", "ok");
await is("ogg audio", "https://img.example.com/song.ogg", "audio", "ok");
await is("Imgur link that answers with a page", "https://i.imgur.com/doesnotexist123.png", "image", "broken", /no longer exists on Imgur/);
await is("image used as audio", "https://img.example.com/ok.png", "audio", "warning", /image\/png, not an audio file/);
await is("website that doesn't exist", "https://nope.invalid/x.png", "image", "broken", /doesn't exist/);
await is("timeout", "https://slow.example.com/x.png", "image", "unchecked", /in time/);
await is("YouTube video", "https://www.youtube.com/watch?v=good", "video", "ok");
await is("removed YouTube video", "https://www.youtube.com/watch?v=gone", "video", "broken", /YouTube video/);

seen.length = 0;
await is("localhost link", "http://localhost:8080/map.png", "map", "warning", /local name.*other networks/);
await is("private IP link", "http://10.0.0.5/map.png", "map", "warning", /private address/);
await is("public name pointing at a private address", "https://sneaky.example.com/x.png", "image", "warning", /local network \(192\.168\.1\.20\)/);
check("…and none of those three were requested", seen.length === 0, JSON.stringify(seen));

seen.length = 0;
const many = await checkLinks([
  { url: "https://img.example.com/ok.png", kind: "image", where: "A" },
  { url: "https://img.example.com/ok.png", kind: "image", where: "B" },
  { url: "https://img.example.com/gone.png", kind: "image", where: "C" },
], opts);
check("same link used twice is fetched once", seen.filter((u) => u.endsWith("/ok.png")).length === 1, JSON.stringify(seen));
check("…and both places get the result", many.map((m) => `${m.where}:${m.status}`).join(",") === "A:ok,B:ok,C:broken", JSON.stringify(many));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
