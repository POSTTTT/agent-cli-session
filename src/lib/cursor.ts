import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CURSOR_CHATS_DIR, encodeId, decodeId } from "./paths.ts";
import {
  aliasSidecar,
  firstUserPrompt,
  projectsFrom,
  readJson,
  removeInside,
  safeReaddir,
  safeStat,
  snippet,
} from "./agentstore.ts";
import type {
  AgentStore,
  GlobalStats,
  ProjectSummary,
  SearchHit,
  SessionSummary,
} from "./agentstore.ts";
import type { AgentEntry } from "./transcript.ts";

// ---------------------------------------------------------------------------
// cursor-agent gives every chat its own directory,
// ~/.cursor/chats/<workspace hash>/<session uuid>/, containing:
//   meta.json  — title, cwd, created/updated timestamps
//   store.db   — SQLite: a `meta` row (hex-encoded JSON) and content-addressed
//                `blobs`, each either a Vercel-AI-SDK message ({"role":…}) or a
//                protobuf tree node linking them.
// The blob hashes make the message order unrecoverable without walking that
// protobuf DAG, but blobs are inserted as the conversation happens, so rowid
// order is the conversation order — that's what we replay.
// The workspace-hash folder is not the project: sessions are grouped by the
// cwd recorded in meta.json, like every other tab.
// ---------------------------------------------------------------------------

const aliases = aliasSidecar(path.join(CURSOR_CHATS_DIR, "_aliases.json"));

type CursorSession = {
  relPath: string; // "<workspace hash>/<session uuid>", the session id source
  dir: string;
  uuid: string;
  cwd: string;
  title: string | null;
  bytes: number;
  mtime: number;
  birth: number;
};

type CursorMeta = {
  title?: string;
  cwd?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
};

async function walkSessions(): Promise<CursorSession[]> {
  const out: CursorSession[] = [];
  for (const hash of await safeReaddir(CURSOR_CHATS_DIR)) {
    if (hash.startsWith(".") || hash.startsWith("_")) continue;
    const hashDir = path.join(CURSOR_CHATS_DIR, hash);
    for (const uuid of await safeReaddir(hashDir)) {
      if (uuid.startsWith(".")) continue;
      const dir = path.join(hashDir, uuid);
      const meta = await readJson<CursorMeta>(path.join(dir, "meta.json"));
      if (!meta?.cwd) continue;
      const store = await safeStat(path.join(dir, "store.db"));
      const dirStat = await safeStat(dir);
      const mtime = meta.updatedAtMs ?? store?.mtimeMs ?? dirStat?.mtimeMs ?? 0;
      out.push({
        relPath: `${hash}/${uuid}`,
        dir,
        uuid,
        cwd: meta.cwd,
        title: meta.title?.trim() || null,
        bytes: store?.size ?? 0,
        mtime,
        birth: meta.createdAtMs ?? dirStat?.birthtimeMs ?? mtime,
      });
    }
  }
  return out;
}

function sessionDir(sessionId: string): string {
  return path.join(CURSOR_CHATS_DIR, decodeId(sessionId));
}

/** Every message blob of a session, in insertion (conversation) order. */
function messageBlobs(dir: string): any[] {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path.join(dir, "store.db"), { readOnly: true });
  } catch {
    return [];
  }
  try {
    const rows = db
      .prepare("select data from blobs order by rowid")
      .all() as unknown as { data: Uint8Array }[];
    const out: any[] = [];
    for (const row of rows) {
      // Protobuf tree nodes share the table with the messages; only the
      // messages are JSON, and only those with a role are conversation turns.
      if (!row.data || row.data[0] !== 0x7b /* { */) continue;
      try {
        const obj = JSON.parse(Buffer.from(row.data).toString("utf8"));
        if (obj && typeof obj.role === "string") out.push(obj);
      } catch {}
    }
    return out;
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** store.db's `meta` row holds hex-encoded JSON (name, lastUsedModel, …). */
function storeMeta(dir: string): Record<string, any> {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path.join(dir, "store.db"), { readOnly: true });
  } catch {
    return {};
  }
  try {
    const row = db.prepare("select value from meta limit 1").get() as
      | { value: string }
      | undefined;
    if (!row?.value) return {};
    return JSON.parse(Buffer.from(row.value, "hex").toString("utf8"));
  } catch {
    return {};
  } finally {
    db.close();
  }
}

function partsText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p: any) => p?.type === "text" && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("")
    .trim();
}

function resultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result === undefined || result === null) return "";
  return JSON.stringify(result, null, 2);
}

function toEntries(messages: any[]): AgentEntry[] {
  const entries: AgentEntry[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      entries.push({ kind: "meta", text: partsText(m.content), raw: m });
      continue;
    }
    if (m.role === "user") {
      // cursor-agent wraps the typed prompt in <user_query>; the rest of the
      // message is injected environment context nobody typed.
      const text = partsText(m.content);
      const query = /<user_query>\n?([\s\S]*?)\n?<\/user_query>/.exec(text);
      entries.push({
        kind: query ? "user" : "raw",
        text: query ? query[1] : text,
        raw: m,
      });
      continue;
    }
    if (m.role === "assistant") {
      for (const p of Array.isArray(m.content) ? m.content : []) {
        if (p?.type === "reasoning" || p?.type === "redacted-reasoning") {
          entries.push({
            kind: "reasoning",
            text: typeof p.text === "string" ? p.text : "(reasoning withheld by the provider)",
            raw: p,
          });
        } else if (p?.type === "text" && p.text?.trim()) {
          entries.push({ kind: "agent", text: p.text, raw: p });
        } else if (p?.type === "tool-call") {
          entries.push({
            kind: "tool_call",
            toolName: p.toolName ?? "tool",
            callId: p.toolCallId,
            text: p.args !== undefined ? JSON.stringify(p.args, null, 2) : undefined,
            raw: p,
          });
        }
      }
      continue;
    }
    if (m.role === "tool") {
      for (const p of Array.isArray(m.content) ? m.content : []) {
        if (p?.type !== "tool-result") continue;
        entries.push({
          kind: "tool_output",
          toolName: p.toolName,
          callId: p.toolCallId,
          text: resultText(p.result),
          raw: p,
        });
      }
      continue;
    }
    entries.push({ kind: "raw", raw: m });
  }
  return entries;
}

async function toSummary(
  s: CursorSession,
  alias: string | null,
): Promise<SessionSummary> {
  const messages = messageBlobs(s.dir);
  const entries = toEntries(messages);
  return {
    projectId: encodeId(s.cwd),
    sessionId: encodeId(s.relPath),
    file: s.dir,
    bytes: s.bytes,
    mtime: s.mtime,
    firstUserPrompt: firstUserPrompt(entries),
    aiTitle: s.title,
    customTitle: null,
    messageCount: messages.filter((m) => m.role === "user" || m.role === "assistant")
      .length,
    model: storeMeta(s.dir).lastUsedModel ?? null,
    gitBranch: null,
    cwd: s.cwd,
    inputTokens: 0, // cursor-agent records no usage anywhere in the store
    outputTokens: 0,
    alias,
  };
}

export const cursorStore: AgentStore = {
  async listProjects(): Promise<ProjectSummary[]> {
    const sessions = await walkSessions();
    return projectsFrom(
      sessions.map((s) => ({ ...s, projectId: encodeId(s.cwd), projectPath: s.cwd })),
    );
  },

  async listSessions(projectId: string): Promise<SessionSummary[]> {
    const cwd = decodeId(projectId);
    const [sessions, alias] = await Promise.all([walkSessions(), aliases.load()]);
    const out: SessionSummary[] = [];
    for (const s of sessions) {
      if (s.cwd !== cwd) continue;
      out.push(await toSummary(s, alias[encodeId(s.relPath)] ?? null));
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
  },

  async resolveProjectPath(projectId: string): Promise<string> {
    return decodeId(projectId);
  },

  async readTranscript(sessionId: string): Promise<AgentEntry[]> {
    return toEntries(messageBlobs(sessionDir(sessionId)));
  },

  async getTitles(sessionId: string) {
    const alias = (await aliases.load())[sessionId] ?? null;
    const aiTitle = await (async () => {
      const dir = sessionDir(sessionId);
      const meta = await readJson<CursorMeta>(path.join(dir, "meta.json"));
      return meta?.title?.trim() || storeMeta(dir).name || null;
    })();
    return { alias, aiTitle };
  },

  async search(query: string, limit = 100): Promise<SearchHit[]> {
    const q = query.toLowerCase();
    if (!q) return [];
    const sessions = await walkSessions();
    const results: SearchHit[] = [];
    for (const s of sessions) {
      let hit: string | null = null;
      for (const m of messageBlobs(s.dir)) {
        const line = JSON.stringify(m);
        const idx = line.toLowerCase().indexOf(q);
        if (idx !== -1) {
          hit = snippet(line, idx, q.length);
          break;
        }
      }
      if (!hit) continue;
      results.push({
        projectId: encodeId(s.cwd),
        sessionId: encodeId(s.relPath),
        snippet: hit,
        mtime: s.mtime,
      });
      if (results.length >= limit) break;
    }
    results.sort((a, b) => b.mtime - a.mtime);
    return results;
  },

  async stats(): Promise<GlobalStats> {
    const sessions = await walkSessions();
    return {
      projects: new Set(sessions.map((s) => s.cwd)).size,
      sessions: sessions.length,
      totalBytes: sessions.reduce((a, s) => a + s.bytes, 0),
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  },

  async rename(sessionId: string, name: string) {
    await aliases.set(sessionId, name);
  },

  async deleteSession(sessionId: string) {
    await removeInside(CURSOR_CHATS_DIR, sessionDir(sessionId));
    await aliases.remove(sessionId);
  },

  async deleteProject(projectId: string) {
    const cwd = decodeId(projectId);
    for (const s of await walkSessions()) {
      if (s.cwd !== cwd) continue;
      await removeInside(CURSOR_CHATS_DIR, s.dir);
      await aliases.remove(encodeId(s.relPath));
    }
  },
};
