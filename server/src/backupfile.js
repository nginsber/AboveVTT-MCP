// Finding and reading AboveVTT backup files (.abovevtt), shared by import_backup and compare_backups.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DOWNLOADS = path.join(os.homedir(), "Downloads");
export const MAX_BYTES = 200 * 1024 * 1024;

/** A file name in Downloads or a full path → { full, size, modified }. Only .abovevtt files up to MAX_BYTES. */
export function resolveBackupPath(p) {
  if (!p) throw new Error("Pass the file: a name from list_backup_files, or a full path to a .abovevtt file.");
  let full = path.isAbsolute(p) ? p : path.join(DOWNLOADS, p);
  full = path.normalize(full);
  if (!full.toLowerCase().endsWith(".abovevtt")) throw new Error("Only .abovevtt files (AboveVTT exports) can be used.");
  let st;
  try { st = fs.statSync(full); } catch { throw new Error(`File not found: ${full}`); }
  if (!st.isFile()) throw new Error(`Not a file: ${full}`);
  if (st.size > MAX_BYTES) throw new Error(`That file is ${(st.size / 1048576).toFixed(0)} MB; the limit is ${MAX_BYTES / 1048576} MB.`);
  return { full, size: st.size, modified: st.mtime };
}

/**
 * The data inside a backup. AboveVTT writes JSON as base64 of its UTF-8 bytes (b64EncodeUnicode in Settings.js);
 * plain JSON is accepted too.
 */
export function parseBackupText(text) {
  const t = String(text).trim();
  try { if (!t.startsWith("{")) return JSON.parse(Buffer.from(t, "base64").toString("utf8")); } catch { /* fall through */ }
  try { return JSON.parse(t); } catch { /* fall through */ }
  throw new Error("This doesn't look like an AboveVTT backup (couldn't read its contents).");
}

export function readBackup(p) {
  const info = resolveBackupPath(p);
  const data = parseBackupText(fs.readFileSync(info.full, "utf8"));
  if (!data || typeof data !== "object" || !Array.isArray(data.scenes)) throw new Error(`${path.basename(info.full)} doesn't look like a full AboveVTT backup (no scene list).`);
  return { ...info, name: path.basename(info.full), data };
}
