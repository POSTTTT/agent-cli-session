import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  GROK_SESSIONS_DIR,
  GROK_SEARCH_DB,
  encodeId,
  decodeId,
} from "./paths.ts";
import {
  aliasSidecar,
  jsonLines,
  projectsFrom,
  readJson,
  removeInside,
  safeReaddir,
  safeStat,
  scanFile,
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
// grok shards sessions by working directory — the folder name is the cwd,
// percent-encoded — and gives each session a directory of its own:
//   ~/.grok/sessions/<percent-encoded cwd>/<session uuid>/
//     summary.json       — cwd, model, git branch, message counts, timestamps
//     chat_history.jsonl — the model-facing turns, one JSON object per line
//     updates.jsonl      — the ACP event stream (hooks, usage, tool progress)
// The transcript comes from chat_history.jsonl (ordered and complete); token
// usage only ever appears in the ACP updates, so we sweep those for it.
// Titles live in grok's own FTS index, session_search.sqlite.
// ---------------------------------------------------------------------------

const aliases = aliasSidecar(path.join(GROK_SESSIONS_DIR, "_aliases.json"));

type GrokSession = {
  relPath: string; // "<percent-encoded cwd>/<session uuid>", the session id source
  dir: string;
  uuid: string;
  cwd: string;
  model: string | null;
  gitBranch: string | null;
  messageCount: number;
  bytes: number;
  mtime: number;
  birth: number;
};

type GrokSummary = {
  info?: { id?: string; cwd?: string };
  created_at?: string;
  updated_at?: string;
  last_active_at?: string;
  num_chat_messages?: number;
  current_model_id?: string;
  head_branch?: string;
};

function millis(iso: unknown, fallback: number): number {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? fallback : t;
}

async function walkSessions(): Promise<GrokSession[]> {
  const out: GrokSession[] = [];
  for (const encoded of await safeReaddir(GROK_SESSIONS_DIR)) {
    if (encoded.startsWith(".") || encoded.startsWith("_")) continue;
    const projectDir = path.join(GROK_SESSIONS_DIR, encoded);
    const projectStat = await safeStat(projectDir);
    if (!projectStat?.isDirectory()) continue;
    for (const uuid of await safeReaddir(projectDir)) {
      if (uuid.startsWith(".")) continue;
      const dir = path.join(projectDir, uuid);
      const summary = await readJson<GrokSummary>(path.join(dir, "summary.json"));
      if (!summary) continue;
      let bytes = 0;
      for (const f of ["chat_history.jsonl", "updates.jsonl", "summary.json"]) {
        bytes += (await safeStat(path.join(dir, f)))?.size ?? 0;
      }
      const dirStat = await safeStat(dir);
      const mtime = millis(
        summary.last_active_at ?? summary.updated_at,
        dirStat?.mtimeMs ?? 0,
      );
      out.push({
        relPath: `${encoded}/${uuid}`,
        dir,
        uuid,
        cwd: summary.info?.cwd ?? decodeCwdDir(encoded),
        model: summary.current_model_id ?? null,
        gitBranch: summary.head_branch ?? null,
        messageCount: summary.num_chat_messages ?? 0,
        bytes,
        mtime,
        birth: millis(summary.created_at, mtime),
      });
    }
  }
  return out;
}

function decodeCwdDir(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function sessionDir(sessionId: string): string {
  return path.join(GROK_SESSIONS_DIR, decodeId(sessionId));
}

function blockText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
    .join("")
    .trim();
}

/** The prompt as typed, with grok's <user_query> wrapper peeled off. */
function promptText(text: string): string | null {
  const query = /<user_query>\n?([\s\S]*?)\n?<\/user_query>/.exec(text);
  if (query) return query[1].trim() || null;
  // Injected context (skill lists, reminders) always arrives as a tag block.
  return text.trimStart().startsWith("<") ? null : text.trim() || null;
}

async function readChat(dir: string): Promise<AgentEntry[]> {
  const entries: AgentEntry[] = [];
  for await (const o of jsonLines(path.join(dir, "chat_history.jsonl"))) {
    const type = o?.type;
    if (type === "system") {
      entries.push({ kind: "meta", text: blockText(o.content), raw: o });
      continue;
    }
    if (type === "user") {
      // Turns grok injects itself (skill catalogs, reminders, tool nudges)
      // carry a synthetic_reason and were never typed by anyone.
      const text = blockText(o.content);
      const prompt = o.synthetic_reason ? null : promptText(text);
      entries.push({ kind: prompt ? "user" : "raw", text: prompt ?? text, raw: o });
      continue;
    }
    if (type === "assistant") {
      if (typeof o.reasoning_content === "string" && o.reasoning_content.trim())
        entries.push({ kind: "reasoning", text: o.reasoning_content, raw: o });
      const text = blockText(o.content);
      if (text) entries.push({ kind: "agent", text, raw: o });
      for (const call of Array.isArray(o.tool_calls) ? o.tool_calls : []) {
        const fn = call?.function ?? call;
        entries.push({
          kind: "tool_call",
          toolName: fn?.name ?? "tool",
          callId: call?.id ?? call?.tool_call_id,
          text: typeof fn?.arguments === "string" ? fn.arguments : JSON.stringify(fn?.arguments ?? {}, null, 2),
          raw: call,
        });
      }
      continue;
    }
    if (type === "tool") {
      entries.push({
        kind: "tool_output",
        callId: o.tool_call_id,
        text: blockText(o.content),
        raw: o,
      });
      continue;
    }
    entries.push({ kind: "raw", raw: o });
  }
  return entries;
}

/**
 * grok reports usage only in its ACP update stream, as running totals, so the
 * largest value seen is the session total.
 */
async function readUsage(dir: string): Promise<{ input: number; output: number }> {
  let input = 0;
  let output = 0;
  for await (const o of jsonLines(path.join(dir, "updates.jsonl"))) {
    const update = o?.params?.update;
    const usage = update?.usage ?? update;
    if (!usage || typeof usage !== "object") continue;
    if (typeof usage.inputTokens === "number")
      input = Math.max(input, usage.inputTokens);
    if (typeof usage.outputTokens === "number")
      output = Math.max(output, usage.outputTokens);
  }
  return { input, output };
}

/** session id -> title, from grok's own search index. */
function searchIndexTitles(): Map<string, string> {
  const titles = new Map<string, string>();
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(GROK_SEARCH_DB, { readOnly: true });
  } catch {
    return titles;
  }
  try {
    const rows = db
      .prepare("select session_id, title from session_docs")
      .all() as unknown as { session_id: string; title: string }[];
    for (const r of rows) if (r.title?.trim()) titles.set(r.session_id, r.title.trim());
  } catch {
    // index missing or a schema we don't know: titles fall back to prompts
  } finally {
    db.close();
  }
  return titles;
}

export const grokStore: AgentStore = {
  async listProjects(): Promise<ProjectSummary[]> {
    const sessions = await walkSessions();
    return projectsFrom(
      sessions.map((s) => ({ ...s, projectId: encodeId(s.cwd), projectPath: s.cwd })),
    );
  },

  async listSessions(projectId: string): Promise<SessionSummary[]> {
    const cwd = decodeId(projectId);
    const [sessions, alias] = await Promise.all([walkSessions(), aliases.load()]);
    const titles = searchIndexTitles();
    const out: SessionSummary[] = [];
    for (const s of sessions) {
      if (s.cwd !== cwd) continue;
      const [entries, usage] = await Promise.all([readChat(s.dir), readUsage(s.dir)]);
      const prompt = entries.find((e) => e.kind === "user")?.text ?? null;
      out.push({
        projectId,
        sessionId: encodeId(s.relPath),
        file: s.dir,
        bytes: s.bytes,
        mtime: s.mtime,
        firstUserPrompt: prompt ? prompt.slice(0, 500) : null,
        aiTitle: titles.get(s.uuid) ?? null,
        customTitle: null,
        messageCount: s.messageCount,
        model: s.model,
        gitBranch: s.gitBranch,
        cwd: s.cwd,
        inputTokens: usage.input,
        outputTokens: usage.output,
        alias: alias[encodeId(s.relPath)] ?? null,
      });
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
  },

  async resolveProjectPath(projectId: string): Promise<string> {
    return decodeId(projectId);
  },

  async readTranscript(sessionId: string): Promise<AgentEntry[]> {
    return readChat(sessionDir(sessionId));
  },

  async getTitles(sessionId: string) {
    const alias = (await aliases.load())[sessionId] ?? null;
    const aiTitle = await (async () => {
      const uuid = path.basename(decodeId(sessionId));
      return searchIndexTitles().get(uuid) ?? null;
    })();
    return { alias, aiTitle };
  },

  async search(query: string, limit = 100): Promise<SearchHit[]> {
    const q = query.toLowerCase();
    if (!q) return [];
    const results: SearchHit[] = [];
    for (const s of await walkSessions()) {
      const hit = await scanFile(path.join(s.dir, "chat_history.jsonl"), q);
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
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const s of sessions) {
      const usage = await readUsage(s.dir);
      totalInputTokens += usage.input;
      totalOutputTokens += usage.output;
    }
    return {
      projects: new Set(sessions.map((s) => s.cwd)).size,
      sessions: sessions.length,
      totalBytes: sessions.reduce((a, s) => a + s.bytes, 0),
      totalInputTokens,
      totalOutputTokens,
    };
  },

  async rename(sessionId: string, name: string) {
    await aliases.set(sessionId, name);
  },

  async deleteSession(sessionId: string) {
    await removeInside(GROK_SESSIONS_DIR, sessionDir(sessionId));
    await aliases.remove(sessionId);
  },

  async deleteProject(projectId: string) {
    const cwd = decodeId(projectId);
    for (const s of await walkSessions()) {
      if (s.cwd !== cwd) continue;
      await removeInside(GROK_SESSIONS_DIR, s.dir);
      await aliases.remove(encodeId(s.relPath));
    }
  },
};
