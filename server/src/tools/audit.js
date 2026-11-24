import { z } from "zod";
import { errorResult } from "../util.js";
import { checkLinks } from "../linkcheck.js";

const tab = { tabId: z.number().int().optional().describe("Only needed if several AboveVTT tabs are open.") };
const CHECKS = ["scenes", "tokens", "audio", "journal", "folders"];
const TITLES = { scenes: "Scene maps", tokens: "Token images", audio: "Audio", journal: "Journal notes" };
const PER_SECTION = 40; // problems listed per section before "…and N more"

const short = (u, n = 90) => (u.length > n ? `${u.slice(0, n - 1)}…` : u);

/** Group checked links by URL + reason so one dead image used by 12 tokens is one line. */
function group(items) {
  const g = new Map();
  for (const it of items) {
    const k = `${it.url}|${it.reason}`;
    if (!g.has(k)) g.set(k, { url: it.url, original: it.original, reason: it.reason, places: [] });
    g.get(k).places.push(it.where);
  }
  return [...g.values()].sort((a, b) => a.places[0].localeCompare(b.places[0]));
}

function section(title, entries, render) {
  if (!entries.length) return [];
  const lines = [`${title} (${entries.length}):`];
  for (const e of entries.slice(0, PER_SECTION)) lines.push(...render(e));
  if (entries.length > PER_SECTION) lines.push(`  …and ${entries.length - PER_SECTION} more. Ask for one area at a time to see the rest.`);
  return lines;
}

const renderLink = (e) => {
  const places = e.places.slice(0, 4).join("; ") + (e.places.length > 4 ? `; +${e.places.length - 4} more` : "");
  return [`  • ${places}`, `    ${short(e.url)}${e.original ? `  (from ${short(e.original, 60)})` : ""}`, `    → ${e.reason}`];
};

export function register(server, bridge) {
  server.registerTool(
    "audit_campaign",
    {
      title: "Audit the campaign: broken links and empty folders",
      description:
        "Read-only health check of the campaign. Lists scene maps, token images (My Tokens and tokens placed on scenes), " +
        "audio tracks and playlists, and images/links inside journal notes whose links no longer work, plus empty scene, " +
        "My Tokens and journal folders. Links are checked as AboveVTT loads them (Google Drive, Dropbox and OneDrive share " +
        "links are converted the way AboveVTT converts them). Changes nothing and fixes nothing: report the findings and let " +
        "the user decide what to do. Links to this computer or the local network are never fetched. Reading the tokens on " +
        "every scene takes a while in big campaigns; use checks or includeSceneTokens: false to narrow it.",
      inputSchema: {
        checks: z.array(z.enum(CHECKS)).optional().describe("Which areas to check (default all): scenes, tokens, audio, journal, folders."),
        includeSceneTokens: z.boolean().optional().describe("Also check tokens placed on every scene (default true). False checks only My Tokens images."),
        showUnchecked: z.boolean().optional().describe("List links that couldn't be checked (site down, timeouts) one by one (default: only a count)."),
        ...tab,
      },
    },
    async ({ checks, includeSceneTokens, showUnchecked, tabId }) => {
      try {
        const started = Date.now();
        const data = await bridge.call("get_audit_data", { checks, includeSceneTokens }, { tabId, timeoutMs: 600000 });
        const checked = await checkLinks(data.links);
        const broken = checked.filter((l) => l.status === "broken");
        const warn = checked.filter((l) => l.status === "warning");
        const unchecked = checked.filter((l) => l.status === "unchecked");
        const okCount = checked.filter((l) => l.status === "ok").length;
        const uniqueUrls = new Set(checked.map((l) => `${l.kind}|${l.url}`)).size;

        const out = [`Audit of "${data.campaign || "campaign"}" (nothing was changed).`];
        out.push(`Checked ${uniqueUrls} different links used in ${checked.length} places: ${okCount} places fine, ` +
          `${broken.length} broken, ${warn.length} suspect, ${unchecked.length} couldn't be checked.`);
        if (data.tokenScan) {
          out.push(`Tokens on scenes: read ${data.tokenScan.scenes} of ${data.counts.scenes} scenes` +
            (data.tokenScan.failed.length ? `; couldn't read ${data.tokenScan.failed.map((f) => `'${f.scene}' (${f.error})`).join(", ")}.` : "."));
        }
        out.push("");

        for (const cat of ["scenes", "tokens", "audio", "journal"]) {
          const b = group(broken.filter((l) => l.category === cat));
          const w = group(warn.filter((l) => l.category === cat));
          const n = data.notes.filter((x) => x.category === cat);
          if (!b.length && !w.length && !n.length) continue;
          out.push(`== ${TITLES[cat]} ==`);
          out.push(...section("Broken", b, renderLink));
          out.push(...section("Suspect (may not load for players)", w, renderLink));
          out.push(...section("Other problems", n, (x) => [`  • ${x.where}: ${x.problem}`]));
          out.push("");
        }

        if (data.emptyFolders.length) {
          out.push("== Empty folders ==");
          for (const area of ["Scenes", "My Tokens", "Journal"]) {
            const f = data.emptyFolders.filter((x) => x.area === area);
            if (f.length) out.push(...section(area, f, (x) => [`  • ${x.path}`]));
          }
          out.push("");
        }

        if (unchecked.length) {
          if (showUnchecked) out.push(...section("Couldn't be checked", group(unchecked), renderLink));
          else {
            const reasons = [...new Set(unchecked.map((u) => u.reason))].slice(0, 3).join("; ");
            out.push(`${unchecked.length} places use links that couldn't be checked (${reasons}). Ask with showUnchecked to list them.`);
          }
        }
        if (data.skipped.length) out.push(`${data.skipped.length} links point at AboveVTT's own cloud storage and weren't checked.`);
        if (!broken.length && !warn.length && !data.notes.length && !data.emptyFolders.length) out.push("No problems found.");
        out.push(`Took ${Math.round((Date.now() - started) / 1000)} s.`);
        return { content: [{ type: "text", text: out.join("\n").replace(/\n{3,}/g, "\n\n") }] };
      } catch (err) {
        return errorResult(err.message);
      }
    }
  );
}
