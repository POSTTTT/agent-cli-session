import path from "node:path";
import { MUSE_SESSIONS_DIR, encodeId, decodeId } from "./paths.ts";
import {
  aliasSidecar,
  jsonLines,
  projectsFrom,
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
} from "./agentstore";
import type { AgentEntry } from "./transcript";

// ---------------------------------------------------------------------------
// Muse Code writes one append-only event log per session, sharded by local
// date: <data dir>/muse/sessions/YYYY/MM/DD/<session uuid>/session.jsonl.
// Every line is an envelope — {sequence, recorded_at, payload_type, payload} —
// and the conversation is a handful of payload.event kinds among a great many
// runtime ones, so we project the log down to the turns instead of rendering
// it raw. Some lines are `retained_frame` batches whose children carry their
// records as JSON strings; those get unwrapped first.
// There is no chat file to stat and no project folder: a session's cwd comes
// from its own metadata / route_facts records.
// ---------------------------------------------------------------------------

const aliases = aliasSidecar(path.join(MUSE_SESSIONS_DIR, "_aliases.json"));

type MuseSession = {
  relPath: string; // "YYYY/MM/DD/<session uuid>", the session id source
  dir: string;
  log: string;
  uuid: string;
  bytes: number;
  mtime: number;
  birth: number;
};

type MuseLog = {
  entries: AgentEntry[];
  cwd: string | null;
  model: string | null;
  name: string | null;
  promptCount: number;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
};

async function walkSessions(): Promise<MuseSession[]> {
  const out: MuseSession[] = [];
  for (const year of await safeReaddir(MUSE_SESSIONS_DIR)) {
    if (!/^\d{4}$/.test(year)) continue; // skips .msp-view-v1 and friends
    for (const month of await safeReaddir(path.join(MUSE_SESSIONS_DIR, year))) {
      for (const day of await safeReaddir(
        path.join(MUSE_SESSIONS_DIR, year, month),
      )) {
        const dayDir = path.join(MUSE_SESSIONS_DIR, year, month, day);
        for (const uuid of await safeReaddir(dayDir)) {
          if (uuid.startsWith(".")) continue;
          const dir = path.join(dayDir, uuid);
          const log = path.join(dir, "session.jsonl");
          const stat = await safeStat(log);
          if (!stat?.isFile()) continue;
          out.push({
            relPath: `${year}/${month}/${day}/${uuid}`,
            dir,
            log,
            uuid,
            bytes: stat.size,
            mtime: stat.mtimeMs,
            birth: stat.birthtimeMs || stat.ctimeMs || stat.mtimeMs,
          });
        }
      }
    }
  }
  return out;
}

function sessionDir(sessionId: string): string {
  return path.join(MUSE_SESSIONS_DIR, decodeId(sessionId));
}

/** Unwrap retained_frame batches so every line yields plain event records. */
function* records(line: any): Generator<any> {
  if (Array.isArray(line?.children)) {
    for (const child of line.children) {
      try {
        yield JSON.parse(child?.record_json);
      } catch {}
    }
    return;
  }
  yield line;
}

function stamp(record: any): string | undefined {
  // recorded_at is microseconds since the epoch.
  const us = record?.recorded_at;
  return typeof us === "number" ? new Date(us / 1000).toISOString() : undefined;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((v: any) => (typeof v?.text === "string" ? v.text : JSON.stringify(v)))
      .join("\n");
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

async function readLog(file: string): Promise<MuseLog> {
  const log: MuseLog = {
    entries: [],
    cwd: null,
    model: null,
    name: null,
    promptCount: 0,
    messageCount: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  for await (const line of jsonLines(file)) {
    for (const record of records(line)) {
      const payload = record?.payload;
      if (!payload || typeof payload !== "object") continue;
      const type = record.payload_type ?? "";
      const timestamp = stamp(record);

      if (type === "runtime.session.metadata") {
        const r = payload.record ?? {};
        if (r.workspace_root) log.cwd = r.workspace_root;
        if (r.model_id) log.model = r.model_id;
        else if (!log.model && r.provider_id) log.model = r.provider_id;
        continue;
      }
      if (type === "runtime.session.route_facts") {
        if (payload.record?.cwd) log.cwd = payload.record.cwd;
        continue;
      }
      if (type === "session.name.changed") {
        if (payload.new_name) log.name = payload.new_name;
        continue;
      }

      const event = payload.event;
      if (!event || typeof event !== "object") continue;
      switch (event.kind) {
        case "started":
          // A run starting carries the prompt that started it — Muse's own
          // projector treats this as the user message.
          if (payload.kind === "run" && typeof event.prompt === "string") {
            log.promptCount += 1;
            log.messageCount += 1;
            log.entries.push({
              kind: "user",
              text: event.prompt,
              timestamp,
              raw: event,
            });
          }
          break;
        case "reasoning_committed":
        case "reasoning_summary_committed": {
          const text = textOf(event.text ?? event.summary ?? event.content);
          if (text.trim())
            log.entries.push({ kind: "reasoning", text, timestamp, raw: event });
          break;
        }
        case "assistant_message_committed":
          log.messageCount += 1;
          log.entries.push({
            kind: "agent",
            text: textOf(event.text),
            timestamp,
            raw: event,
          });
          break;
        case "assistant_tool_calls_committed":
          for (const call of event.tool_calls ?? []) {
            log.entries.push({
              kind: "tool_call",
              toolName: call?.name ?? "tool",
              callId: call?.call_id ?? call?.id,
              text: textOf(call?.args),
              timestamp,
              raw: call,
            });
          }
          break;
        case "tool_result":
        case "tool_result_model_visible_content":
          log.entries.push({
            kind: "tool_output",
            callId: event.call_id ?? event.id,
            text: textOf(event.content ?? event.output ?? event.result),
            timestamp,
            raw: event,
          });
          break;
        case "model_completed": {
          const usage = event.usage ?? {};
          // input_tokens is the whole prompt each call, so it grows with the
          // conversation: the largest is the session's context size.
          log.inputTokens = Math.max(log.inputTokens, usage.input_tokens ?? 0);
          log.outputTokens += usage.output_tokens ?? 0;
          break;
        }
        case "terminal":
          log.entries.push({
            kind: "meta",
            text: `turn ${event.terminal ?? "ended"}`,
            timestamp,
            raw: event,
          });
          break;
      }
    }
  }
  return log;
}

async function toSummary(
  s: MuseSession,
  alias: string | null,
): Promise<SessionSummary> {
  const log = await readLog(s.log);
  const prompt = log.entries.find((e) => e.kind === "user")?.text ?? null;
  return {
    projectId: encodeId(log.cwd ?? "(unknown)"),
    sessionId: encodeId(s.relPath),
    file: s.log,
    bytes: s.bytes,
    mtime: s.mtime,
    firstUserPrompt: prompt ? prompt.slice(0, 500) : null,
    aiTitle: log.name,
    customTitle: null,
    messageCount: log.messageCount,
    model: log.model,
    gitBranch: null,
    cwd: log.cwd,
    inputTokens: log.inputTokens,
    outputTokens: log.outputTokens,
    alias,
  };
}

/** cwd per session, which only the log itself knows. */
async function withCwd(sessions: MuseSession[]) {
  return Promise.all(
    sessions.map(async (s) => ({
      ...s,
      cwd: (await readLog(s.log)).cwd ?? "(unknown)",
    })),
  );
}

export const museStore: AgentStore = {
  async listProjects(): Promise<ProjectSummary[]> {
    const sessions = await withCwd(await walkSessions());
    return projectsFrom(
      sessions.map((s) => ({ ...s, projectId: encodeId(s.cwd), projectPath: s.cwd })),
    );
  },

  async listSessions(projectId: string): Promise<SessionSummary[]> {
    const [sessions, alias] = await Promise.all([walkSessions(), aliases.load()]);
    const out: SessionSummary[] = [];
    for (const s of sessions) {
      const summary = await toSummary(s, alias[encodeId(s.relPath)] ?? null);
      if (summary.projectId !== projectId) continue;
      out.push(summary);
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
  },

  async resolveProjectPath(projectId: string): Promise<string> {
    return decodeId(projectId);
  },

  async readTranscript(sessionId: string): Promise<AgentEntry[]> {
    return (await readLog(path.join(sessionDir(sessionId), "session.jsonl"))).entries;
  },

  async getTitles(sessionId: string) {
    const alias = (await aliases.load())[sessionId] ?? null;
    const aiTitle = await (async () => {
      return (await readLog(path.join(sessionDir(sessionId), "session.jsonl"))).name;
    })();
    return { alias, aiTitle };
  },

  async search(query: string, limit = 100): Promise<SearchHit[]> {
    const q = query.toLowerCase();
    if (!q) return [];
    const results: SearchHit[] = [];
    for (const s of await walkSessions()) {
      const hit = await scanFile(s.log, q);
      if (!hit) continue;
      const cwd = (await readLog(s.log)).cwd ?? "(unknown)";
      results.push({
        projectId: encodeId(cwd),
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
    const cwds = new Set<string>();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const s of sessions) {
      const log = await readLog(s.log);
      cwds.add(log.cwd ?? "(unknown)");
      totalInputTokens += log.inputTokens;
      totalOutputTokens += log.outputTokens;
    }
    return {
      projects: cwds.size,
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
    await removeInside(MUSE_SESSIONS_DIR, sessionDir(sessionId));
    await aliases.remove(sessionId);
  },

  async deleteProject(projectId: string) {
    const cwd = decodeId(projectId);
    for (const s of await withCwd(await walkSessions())) {
      if (s.cwd !== cwd) continue;
      await removeInside(MUSE_SESSIONS_DIR, s.dir);
      await aliases.remove(encodeId(s.relPath));
    }
  },
};
