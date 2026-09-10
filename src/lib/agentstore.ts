import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import type { ProjectSummary, SessionSummary } from "./sessions.ts";
import type { AgentEntry } from "./transcript.ts";

// ---------------------------------------------------------------------------
// The pieces every agent viewer needs but nothing about a specific log format:
// the interface the routes talk to, plus the filesystem / alias / search
// helpers each store would otherwise re-implement.
// ---------------------------------------------------------------------------

export type SearchHit = {
  projectId: string;
  sessionId: string;
  snippet: string;
  mtime: number;
};

export type GlobalStats = {
  projects: number;
  sessions: number;
  totalBytes: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

/** One agent's on-disk session store, as the /[tool] routes consume it. */
export type AgentStore = {
  listProjects(): Promise<ProjectSummary[]>;
  listSessions(projectId: string): Promise<SessionSummary[]>;
  resolveProjectPath(projectId: string): Promise<string>;
  readTranscript(sessionId: string): Promise<AgentEntry[]>;
  /** The rename sidecar's name and the agent's own title, for one session. */
  getTitles(sessionId: string): Promise<{ alias: string | null; aiTitle: string | null }>;
  search(query: string, limit?: number): Promise<SearchHit[]>;
  stats(): Promise<GlobalStats>;
  rename(sessionId: string, name: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
};

export async function safeStat(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

export async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Session and project ids round-trip through base64url, so a malformed id can
 * decode to anything — including `../..`. Every delete resolves its target
 * through here first so a bad id can only ever reach inside the agent's own
 * store.
 */
export function insideRoot(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export async function removeInside(root: string, target: string) {
  if (!insideRoot(root, target)) throw new Error("refusing to delete outside store");
  await fs.rm(target, {
    force: true,
    recursive: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}

/** First match of `q` in the file, with ~60 chars of context either side. */
export async function scanFile(
  filePath: string,
  q: string,
): Promise<string | null> {
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of rl) {
      const idx = line.toLowerCase().indexOf(q);
      if (idx !== -1) return snippet(line, idx, q.length);
    }
  } catch {
    return null;
  } finally {
    rl.close();
  }
  return null;
}

export function snippet(text: string, idx: number, qLength: number): string {
  return text.slice(Math.max(0, idx - 60), Math.min(text.length, idx + qLength + 60));
}

/** Iterate a .jsonl file, skipping blank and unparsable lines. */
export async function* jsonLines(filePath: string): AsyncGenerator<any> {
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line);
      } catch {}
    }
  } catch {
    // unreadable file: treat as empty
  } finally {
    rl.close();
  }
}

/**
 * A rename sidecar. cursor-agent, grok and Muse Code all derive their picker
 * titles from state we would have to reverse-engineer (a content-addressed
 * blob, an FTS index, a name-authority database), so renames live in a JSON
 * file next to the store instead of being mirrored back into the CLI.
 */
export function aliasSidecar(file: string) {
  type AliasMap = Record<string, string>;

  const load = async (): Promise<AliasMap> => {
    const obj = await readJson<AliasMap>(file);
    return obj && typeof obj === "object" ? obj : {};
  };

  const write = async (map: AliasMap) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(map, null, 2), "utf8");
  };

  return {
    load,
    async set(sessionId: string, name: string) {
      const map = await load();
      const trimmed = name.trim().slice(0, 200);
      if (trimmed === "") delete map[sessionId];
      else map[sessionId] = trimmed;
      await write(map);
    },
    async remove(sessionId: string) {
      const map = await load();
      if (sessionId in map) {
        delete map[sessionId];
        await write(map);
      }
    },
  };
}

/** Roll a store's session list up into the project rows the tables want. */
export function projectsFrom(
  sessions: {
    projectId: string;
    projectPath: string;
    bytes: number;
    mtime: number;
    birth: number;
  }[],
): ProjectSummary[] {
  const byId = new Map<string, ProjectSummary>();
  for (const s of sessions) {
    let p = byId.get(s.projectId);
    if (!p) {
      p = {
        id: s.projectId,
        decodedPath: s.projectPath,
        sessionCount: 0,
        totalBytes: 0,
        lastModified: 0,
        firstActivity: Infinity,
      };
      byId.set(s.projectId, p);
    }
    p.sessionCount += 1;
    p.totalBytes += s.bytes;
    if (s.mtime > p.lastModified) p.lastModified = s.mtime;
    if (s.birth < p.firstActivity) p.firstActivity = s.birth;
  }
  const out = [...byId.values()];
  for (const p of out)
    if (!isFinite(p.firstActivity)) p.firstActivity = p.lastModified;
  out.sort((a, b) => b.lastModified - a.lastModified);
  return out;
}

/** The transcript's first real user message, for a session with no title. */
export function firstUserPrompt(entries: AgentEntry[]): string | null {
  for (const e of entries) {
    if (e.kind !== "user" || !e.text) continue;
    const t = e.text.trim();
    if (t) return t.slice(0, 500);
  }
  return null;
}

export type { ProjectSummary, SessionSummary };
