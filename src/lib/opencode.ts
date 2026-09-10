import { DatabaseSync } from "node:sqlite";
import { OPENCODE_DB, encodeId, decodeId } from "./paths.ts";
import type { ProjectSummary, SessionSummary } from "./sessions.ts";
import type { AgentEntry } from "./transcript.ts";

// ---------------------------------------------------------------------------
// opencode stores everything in one SQLite file (~/.local/share/opencode/
// opencode.db): a `session` row per chat, a `message` row per turn, and a
// `part` row per text / reasoning / tool block, each with a JSON `data` blob.
// Its `project` rows are useless for grouping (recent versions file everything
// under a single "global" project with worktree "/"), so we group sessions by
// their recorded `directory` instead — that is the real project path.
// ---------------------------------------------------------------------------

function open(readOnly = true): DatabaseSync | null {
  try {
    return new DatabaseSync(OPENCODE_DB, { readOnly });
  } catch {
    return null;
  }
}

type Row = {
  id: string;
  directory: string;
  title: string;
  model: string | null;
  agent: string | null;
  tokens_input: number;
  tokens_output: number;
  time_created: number;
  time_updated: number;
  msgs: number;
  bytes: number;
  prompt: string | null;
};

const ROWS_SQL = `
  select s.id, s.directory, s.title, s.model, s.agent,
         s.tokens_input, s.tokens_output, s.time_created, s.time_updated,
         (select count(*) from message m where m.session_id = s.id) as msgs,
         (select coalesce(sum(length(m.data)), 0) from message m where m.session_id = s.id)
       + (select coalesce(sum(length(p.data)), 0) from part p where p.session_id = s.id) as bytes,
         (select json_extract(p.data, '$.text') from part p
            join message m on m.id = p.message_id
           where p.session_id = s.id
             and json_extract(m.data, '$.role') = 'user'
             and json_extract(p.data, '$.type') = 'text'
           order by m.time_created, p.id limit 1) as prompt
    from session s
   order by s.time_updated desc`;

function allRows(): Row[] {
  const db = open();
  if (!db) return [];
  try {
    return db.prepare(ROWS_SQL).all() as unknown as Row[];
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** session.model is JSON: {"id": "...", "providerID": "..."} */
function modelName(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o?.id) return null;
    return o.providerID ? `${o.providerID}/${o.id}` : o.id;
  } catch {
    return raw;
  }
}

export async function listOpencodeProjects(): Promise<ProjectSummary[]> {
  const byDir = new Map<string, ProjectSummary>();
  for (const r of allRows()) {
    let proj = byDir.get(r.directory);
    if (!proj) {
      proj = {
        id: encodeId(r.directory),
        decodedPath: r.directory,
        sessionCount: 0,
        totalBytes: 0,
        lastModified: 0,
        firstActivity: Infinity,
      };
      byDir.set(r.directory, proj);
    }
    proj.sessionCount += 1;
    proj.totalBytes += r.bytes;
    if (r.time_updated > proj.lastModified) proj.lastModified = r.time_updated;
    if (r.time_created < proj.firstActivity) proj.firstActivity = r.time_created;
  }
  const results = [...byDir.values()];
  results.sort((a, b) => b.lastModified - a.lastModified);
  return results;
}

export async function listOpencodeSessions(
  projectId: string,
): Promise<SessionSummary[]> {
  const dir = decodeId(projectId);
  return allRows()
    .filter((r) => r.directory === dir)
    .map((r) => ({
      projectId,
      sessionId: r.id,
      file: OPENCODE_DB,
      bytes: r.bytes,
      mtime: r.time_updated,
      firstUserPrompt: r.prompt,
      // opencode auto-titles sessions and `/rename` overwrites the same field,
      // so there is only one title to show — no alias sidecar needed.
      aiTitle: r.title || null,
      customTitle: null,
      messageCount: r.msgs,
      model: modelName(r.model),
      gitBranch: null,
      cwd: r.directory,
      inputTokens: r.tokens_input,
      outputTokens: r.tokens_output,
      alias: null,
    }));
}

export async function resolveOpencodeProjectPath(
  projectId: string,
): Promise<string> {
  return decodeId(projectId);
}

export async function getOpencodeTitle(
  sessionId: string,
): Promise<string | null> {
  const db = open();
  if (!db) return null;
  try {
    const row = db
      .prepare("select title from session where id = ?")
      .get(sessionId) as { title?: string } | undefined;
    return row?.title || null;
  } finally {
    db.close();
  }
}

export async function readOpencodeTranscript(
  sessionId: string,
): Promise<AgentEntry[]> {
  const db = open();
  if (!db) return [];
  let messages: { id: string; data: string; time_created: number }[];
  let parts: { message_id: string; data: string }[];
  try {
    messages = db
      .prepare(
        "select id, data, time_created from message where session_id = ? order by time_created, id",
      )
      .all(sessionId) as never;
    parts = db
      .prepare(
        "select message_id, data from part where session_id = ? order by message_id, id",
      )
      .all(sessionId) as never;
  } catch {
    return [];
  } finally {
    db.close();
  }

  const byMessage = new Map<string, any[]>();
  for (const p of parts) {
    let parsed: any;
    try {
      parsed = JSON.parse(p.data);
    } catch {
      continue;
    }
    const list = byMessage.get(p.message_id);
    if (list) list.push(parsed);
    else byMessage.set(p.message_id, [parsed]);
  }

  const entries: AgentEntry[] = [];
  for (const m of messages) {
    let msg: any;
    try {
      msg = JSON.parse(m.data);
    } catch {
      msg = {};
    }
    const ts = new Date(m.time_created).toISOString();
    const isUser = msg.role === "user";
    for (const part of byMessage.get(m.id) ?? []) {
      if (part.type === "text") {
        const text = typeof part.text === "string" ? part.text : "";
        if (text.trim())
          entries.push({ kind: isUser ? "user" : "agent", text, timestamp: ts, raw: part });
        continue;
      }
      if (part.type === "reasoning") {
        const text = typeof part.text === "string" ? part.text : "";
        if (text.trim())
          entries.push({ kind: "reasoning", text, timestamp: ts, raw: part });
        continue;
      }
      if (part.type === "tool") {
        const state = part.state ?? {};
        entries.push({
          kind: "tool_call",
          toolName: part.tool ?? "tool",
          callId: part.callID,
          text:
            state.input !== undefined
              ? JSON.stringify(state.input, null, 2)
              : undefined,
          timestamp: ts,
          raw: part,
        });
        const output =
          typeof state.output === "string"
            ? state.output
            : state.error
              ? String(state.error)
              : null;
        if (output !== null)
          entries.push({
            kind: "tool_output",
            callId: part.callID,
            text: output,
            timestamp: ts,
            raw: state,
          });
        continue;
      }
      // step-start / step-finish / anything new: raw, hidden unless "all".
      entries.push({ kind: "raw", timestamp: ts, raw: part });
    }
  }
  return entries;
}

export async function deleteOpencodeSession(sessionId: string) {
  const db = open(false);
  if (!db) return;
  try {
    // message/part rows cascade off the session row.
    db.prepare("delete from session where id = ?").run(sessionId);
  } finally {
    db.close();
  }
}

export async function deleteOpencodeProject(projectId: string) {
  const dir = decodeId(projectId);
  const db = open(false);
  if (!db) return;
  try {
    db.prepare("delete from session where directory = ?").run(dir);
  } finally {
    db.close();
  }
}

/** Renames write straight to session.title, so the opencode TUI agrees. */
export async function setOpencodeTitle(sessionId: string, name: string) {
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) return;
  const db = open(false);
  if (!db) return;
  try {
    db.prepare("update session set title = ? where id = ?").run(
      trimmed,
      sessionId,
    );
  } finally {
    db.close();
  }
}

export async function searchOpencodeSessions(
  query: string,
  limit = 100,
): Promise<
  { projectId: string; sessionId: string; snippet: string; mtime: number }[]
> {
  const q = query.toLowerCase();
  if (!q) return [];
  const db = open();
  if (!db) return [];
  let hits: { session_id: string; data: string }[];
  try {
    // Message rows are pure metadata; all readable text lives in parts.
    hits = db
      .prepare(
        "select session_id, data from part where lower(data) like ? escape '\\' order by time_created desc",
      )
      .all(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) as never;
  } catch {
    return [];
  } finally {
    db.close();
  }

  const dirs = new Map<string, { directory: string; time_updated: number }>();
  for (const r of allRows())
    dirs.set(r.id, { directory: r.directory, time_updated: r.time_updated });

  const seen = new Set<string>();
  const results: {
    projectId: string;
    sessionId: string;
    snippet: string;
    mtime: number;
  }[] = [];
  for (const h of hits) {
    if (seen.has(h.session_id)) continue;
    const meta = dirs.get(h.session_id);
    if (!meta) continue;
    seen.add(h.session_id);
    const idx = h.data.toLowerCase().indexOf(q);
    results.push({
      projectId: encodeId(meta.directory),
      sessionId: h.session_id,
      snippet: h.data.slice(Math.max(0, idx - 60), idx + q.length + 60),
      mtime: meta.time_updated,
    });
    if (results.length >= limit) break;
  }
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

export type GlobalStats = {
  projects: number;
  sessions: number;
  totalBytes: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

export async function computeOpencodeStats(): Promise<GlobalStats> {
  const rows = allRows();
  const dirs = new Set<string>();
  let totalBytes = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const r of rows) {
    dirs.add(r.directory);
    totalBytes += r.bytes;
    totalInputTokens += r.tokens_input;
    totalOutputTokens += r.tokens_output;
  }
  return {
    projects: dirs.size,
    sessions: rows.length,
    totalBytes,
    totalInputTokens,
    totalOutputTokens,
  };
}
