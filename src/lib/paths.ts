import os from "node:os";
import path from "node:path";

export const CLAUDE_HOME =
  process.env.CLAUDE_HOME ?? path.join(os.homedir(), ".claude");

export const PROJECTS_DIR = path.join(CLAUDE_HOME, "projects");

export const CODEX_HOME =
  process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");

export const CODEX_SESSIONS_DIR = path.join(CODEX_HOME, "sessions");

/**
 * Codex's CLI session picker reads its displayed titles from this flat index
 * (one JSON record per line: { id, thread_name, updated_at }), NOT from the
 * rollout files. Mirroring renames here is what makes them show up in `codex`.
 */
export const CODEX_SESSION_INDEX = path.join(CODEX_HOME, "session_index.jsonl");

export const GEMINI_HOME =
  process.env.GEMINI_HOME ?? path.join(os.homedir(), ".gemini");

/** Gemini CLI stores chats under ~/.gemini/tmp/<project>/chats/*.jsonl */
export const GEMINI_TMP_DIR = path.join(GEMINI_HOME, "tmp");

export const GEMINI_PROJECTS_JSON = path.join(GEMINI_HOME, "projects.json");

/**
 * opencode keeps everything (projects, sessions, messages, parts) in a single
 * SQLite database under its XDG data dir, not in per-session log files.
 */
export const OPENCODE_DATA_DIR =
  process.env.OPENCODE_DATA_DIR ??
  path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "opencode",
  );

export const OPENCODE_DB = path.join(OPENCODE_DATA_DIR, "opencode.db");

/**
 * Codex stores sessions in a flat date tree, not per-project folders, so we
 * group them by their real `cwd`. We encode that path (and per-session file
 * paths) into URL-safe base64url ids so they survive routing losslessly.
 */
export function encodeId(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function decodeId(id: string): string {
  return Buffer.from(id, "base64url").toString("utf8");
}

/**
 * Re-create the folder name Claude derives from a cwd: every non-alphanumeric
 * char becomes `-`. Lossy (same as Claude), but lets us detect whether a
 * session's recorded cwd still matches the folder it lives in. A mismatch means
 * the session file was moved between project folders.
 */
export function encodeProjectId(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Claude encodes project paths as folder names by replacing path separators
 * and `:` with `-`. There's no lossless inverse, but we can produce a
 * readable approximation by re-introducing `\` after the leading drive letter
 * on Windows and `/` on POSIX.
 */
export function decodeProjectId(id: string): string {
  if (/^[A-Za-z]--/.test(id)) {
    const drive = id[0];
    const rest = id.slice(3).replace(/-/g, "\\");
    return `${drive}:\\${rest}`;
  }
  return "/" + id.replace(/^-/, "").replace(/-/g, "/");
}

/**
 * cursor-agent keeps one directory per chat under ~/.cursor/chats/<workspace
 * hash>/<session uuid>/, holding a meta.json (title + cwd) and a store.db
 * SQLite blob store with the messages themselves.
 */
export const CURSOR_HOME =
  process.env.CURSOR_HOME ?? path.join(os.homedir(), ".cursor");

export const CURSOR_CHATS_DIR = path.join(CURSOR_HOME, "chats");

/**
 * grok shards sessions by working directory: ~/.grok/sessions/<percent-encoded
 * cwd>/<session uuid>/, with summary.json metadata, chat_history.jsonl (the
 * model-facing turns) and updates.jsonl (the ACP event stream).
 */
export const GROK_HOME =
  process.env.GROK_HOME ?? path.join(os.homedir(), ".grok");

export const GROK_SESSIONS_DIR = path.join(GROK_HOME, "sessions");

/** grok's own full-text index; the only place a session's title is stored. */
export const GROK_SEARCH_DB = path.join(
  GROK_SESSIONS_DIR,
  "session_search.sqlite",
);

/**
 * Muse Code shards sessions by local date:
 * <data dir>/muse/sessions/YYYY/MM/DD/<session uuid>/session.jsonl — an
 * append-only event log rather than a chat log.
 */
export const MUSE_DATA_DIR =
  process.env.MUSE_DATA_DIR ??
  path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "muse",
  );

export const MUSE_SESSIONS_DIR = path.join(MUSE_DATA_DIR, "sessions");
