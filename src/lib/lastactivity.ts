import fs from "node:fs/promises";
import path from "node:path";
import {
  PROJECTS_DIR,
  CODEX_SESSIONS_DIR,
  GEMINI_TMP_DIR,
  OPENCODE_DB,
  CURSOR_CHATS_DIR,
  GROK_SESSIONS_DIR,
  MUSE_SESSIONS_DIR,
} from "./paths.ts";

// ---------------------------------------------------------------------------
// "When did I last use this agent?" for the tab row. Every store answers it
// the same cheap way — the newest mtime anywhere under it — so this never
// parses a log; listing a tab's sessions properly is the page's job.
// ---------------------------------------------------------------------------

const ROOTS: Record<string, string> = {
  claude: PROJECTS_DIR,
  codex: CODEX_SESSIONS_DIR,
  gemini: GEMINI_TMP_DIR,
  opencode: OPENCODE_DB, // a single SQLite file rather than a tree
  cursor: CURSOR_CHATS_DIR,
  grok: GROK_SESSIONS_DIR,
  muse: MUSE_SESSIONS_DIR,
};

/** Newest mtime under `root`, or null if it doesn't exist / holds no files. */
async function newestMtime(root: string): Promise<number | null> {
  let stat;
  try {
    stat = await fs.stat(root);
  } catch {
    return null;
  }
  if (stat.isFile()) return stat.mtimeMs;

  let names: string[];
  try {
    names = (await fs.readdir(root, { recursive: true })) as unknown as string[];
  } catch {
    return null;
  }
  const stats = await Promise.all(
    names
      // `_codex_aliases.json` and friends are our own sidecars, not activity.
      .filter((rel) => !path.basename(rel).startsWith("_"))
      .map((rel) => fs.stat(path.join(root, rel)).catch(() => null)),
  );
  let newest = 0;
  for (const s of stats)
    if (s?.isFile() && s.mtimeMs > newest) newest = s.mtimeMs;
  return newest || null;
}

export type LastActivity = Record<string, number | null>;

export async function lastActivityByTool(): Promise<LastActivity> {
  const entries = await Promise.all(
    Object.entries(ROOTS).map(
      async ([tool, root]) => [tool, await newestMtime(root)] as const,
    ),
  );
  return Object.fromEntries(entries);
}
