// Names and titles the MCP writes into AboveVTT (scenes, folders, My Tokens, tokens, notes, playlists, tracks).
//
// AboveVTT inserts many names into its pages as raw HTML, e.g. the sidebar's `<div …>${listItem.name}</div>`
// (SidebarPanel.js) and token names inside quoted attributes (`title='${token.options.name}'`, TokenMenu.js).
// A name containing an HTML tag, or a quote followed by something like ` onmouseover=…`, would then run as code
// in the DM's tab (and, for tokens, possibly players' tabs). Typing such a name by hand does the same; it's an
// AboveVTT issue, but names reaching Claude from web pages, PDFs or player-written text make it likelier here.
// So names Claude writes:
//   - may not contain < or > (refused with a clear message, nothing changed);
//   - get typographic quotes instead of straight ones: ' → ‘ ’ and " → “ ”, so they can't close an HTML attribute.
// Only fields that SET a name use this; fields that look an existing item up by name are left alone.
import { z } from "zod";

export const NAME_HAS_HTML = /[<>]/;
export const NAME_HTML_MESSAGE =
  "Names can't contain < or >. AboveVTT shows names as HTML, so these could run as code in the page. Leave them out.";

/** Straight quotes → typographic ones: opening after the start, a space or a bracket; closing (and apostrophes) otherwise. */
export function curlyQuotes(s) {
  return String(s)
    .replace(/(^|[\s([{—–-])"/g, "$1“").replace(/"/g, "”")
    .replace(/(^|[\s([{—–-])'/g, "$1‘").replace(/'/g, "’");
}

/** Throws if the name contains HTML; returns it with typographic quotes. */
export function cleanName(s, what = "Name") {
  if (NAME_HAS_HTML.test(String(s))) throw new Error(`${what}: ${NAME_HTML_MESSAGE}`);
  return curlyQuotes(s);
}

/** Schema for a field that sets a name or title. Add .optional() / .describe() as usual. */
export const nameField = () =>
  z.string().refine((s) => !NAME_HAS_HTML.test(s), { message: NAME_HTML_MESSAGE }).transform(curlyQuotes);
