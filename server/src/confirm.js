// Preview-and-confirm, enforced by the server (review item 1).
//
// Tools that delete, import or reset can only change data with a confirmToken, and the only
// way to get one is a dryRun preview of exactly the same request. The token:
//   - is single-use and expires after TOKEN_TTL_MS,
//   - is tied to the tool and to the exact options of the preview (minus dryRun/confirmToken),
//   - is checked against a fresh preview just before the real change: if what would change is
//     no longer the same (e.g. a scene was added to the folder), nothing is changed and Claude
//     has to preview again and show the user the new list.
// The tool descriptions still tell Claude to show the preview and wait for the user's explicit
// yes in chat; the token makes sure a preview really happened first.

import crypto from "node:crypto";
import { z } from "zod";

export const TOKEN_TTL_MS = 10 * 60 * 1000;
const pending = new Map(); // token -> { tool, key, fingerprint, expires }

/** JSON with object keys sorted, so equal data always gives the same string. */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

const keyOf = (tool, params, tabId) => stableStringify({ tool, tabId: tabId ?? null, params });
// What the preview says would happen, without the flag that says it was a preview.
const fingerprintOf = (r) => stableStringify({ ...r, dryRun: undefined });

function sweep(now = Date.now()) {
  for (const [t, e] of pending) if (e.expires <= now) pending.delete(t);
}

export class ConfirmError extends Error {}

export const NEEDS_PREVIEW =
  "This change needs a preview first. Call this tool again with the same options plus dryRun: true, show the user " +
  "exactly what will change, and wait for their explicit yes in chat. Then call it once more with the same options " +
  "plus the confirmToken from the preview.";

/**
 * Use instead of bridge.call for a guarded tool.
 * @param params the tool's options, including dryRun / confirmToken (tabId separate)
 * @param opts.needsConfirm(params) → false when this particular call changes nothing (default: always guarded)
 * @param opts.keyParams what the token must match, if not the options themselves (e.g. an import file's
 *        path, size and date instead of its whole text)
 * @param opts.recheck false to skip the fresh preview before the change (when keyParams already covers it)
 * @returns the bridge result; a preview also gets r.confirmToken and r.confirmExpiresMinutes
 */
export async function guardedCall(bridge, method, params, { tabId, timeoutMs, tool = method, needsConfirm, keyParams, recheck = true } = {}) {
  const { dryRun, confirmToken, ...rest } = params;
  const callOpts = { tabId, ...(timeoutMs ? { timeoutMs } : {}) };
  const guarded = needsConfirm ? needsConfirm(rest) : true;
  const key = keyOf(tool, keyParams === undefined ? rest : keyParams, tabId);

  if (!guarded) return bridge.call(method, dryRun ? { ...rest, dryRun } : rest, callOpts);

  if (dryRun) {
    const r = await bridge.call(method, { ...rest, dryRun: true }, callOpts);
    if (r && r.dryRun) {
      sweep();
      const token = crypto.randomBytes(6).toString("hex");
      pending.set(token, { tool, key, fingerprint: fingerprintOf(r), expires: Date.now() + TOKEN_TTL_MS });
      return { ...r, confirmToken: token, confirmExpiresMinutes: TOKEN_TTL_MS / 60000 };
    }
    return r;
  }

  if (!confirmToken) throw new ConfirmError(NEEDS_PREVIEW);
  sweep();
  const entry = pending.get(confirmToken);
  pending.delete(confirmToken); // single use, whatever happens next
  if (!entry) {
    throw new ConfirmError("That confirmToken is unknown, already used or expired (they last " +
      `${TOKEN_TTL_MS / 60000} minutes). ` + NEEDS_PREVIEW);
  }
  if (entry.tool !== tool || entry.key !== key) {
    throw new ConfirmError("That confirmToken was issued for a different request. The options must be exactly the " +
      "same as in the preview. " + NEEDS_PREVIEW);
  }
  if (recheck) {
    const fresh = await bridge.call(method, { ...rest, dryRun: true }, callOpts);
    if (fingerprintOf(fresh) !== entry.fingerprint) {
      throw new ConfirmError("Nothing was changed: what this would change is no longer the same as in the preview " +
        "(something changed in AboveVTT in the meantime). " + NEEDS_PREVIEW);
    }
  }
  return bridge.call(method, rest, callOpts);
}

/** Line to add to a preview's reply. */
export function previewFooter(r) {
  if (!r?.confirmToken) return "";
  return `\n\nTo go ahead, show the user this preview and wait for their explicit yes. Then call this tool again ` +
    `with exactly the same options plus confirmToken: "${r.confirmToken}" (single use, valid ${r.confirmExpiresMinutes} minutes).`;
}

/** Schema field for guarded tools. */
export const confirmTokenField = z.string().optional()
  .describe("From this tool's dryRun preview of exactly the same request. Required to make the change.");

/** Added to the ask-first text of every guarded tool. */
export const CONFIRM_STEP = "The preview returns a confirmToken; only after the user's yes, call again with the same options plus that confirmToken. ";

/** For tests. */
export function _pendingCount() { sweep(); return pending.size; }
