import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import {
  CODEX_SESSIONS_DIR,
  CODEX_SESSION_INDEX,
  encodeId,
  decodeId,
} from "./paths";
import type { ProjectSummary, SessionSummary } from "./sessions";
import type { AgentEntry } from "./transcript";

// ---------------------------------------------------------------------------
// Codex stores every session as a JSONL "rollout" file under
//   ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
// There are no per-project folders the way Claude has them, so we group
// sessions by their real `cwd` (read from each file's session_meta line) to
// reconstruct the same Projects → Sessions → Transcript hierarchy.
// ---------------------------------------------------------------------------

const CODEX_ALIASES_PATH = path.join(CODEX_SESSIONS_DIR, "_codex_aliases.json");

type CodexFile = {
  relPath: string; // path relative to CODEX_SESSIONS_DIR (the session id source)
  absPath: string;
  bytes: number;
  mtime: number;
  birth: number;
};

type CodexMeta = {
  uuid: string | null;
  cwd: string | null;
  model: string | null;
  gitBranch: string | null;
  firstUserPrompt: string | null;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
};

export type CodexEntry = AgentEntry;

async function safeStat(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

/** Recursively collect every .jsonl rollout file under the sessions tree. */
async function walkCodexFiles(): Promise<CodexFile[]> {
  let names: string[];
  try {
    names = (await fs.readdir(CODEX_SESSIONS_DIR, {
      recursive: true,
    })) as unknown as string[];
  } catch {
    return [];
  }
  const out: CodexFile[] = [];
  for (const rel of names) {
    if (!rel.endsWith(".jsonl")) continue;
    const absPath = path.join(CODEX_SESSIONS_DIR, rel);
    const s = await safeStat(absPath);
    if (!s || !s.isFile()) continue;
    out.push({
      relPath: rel.split(path.sep).join("/"),
      absPath,
      bytes: s.size,
      mtime: s.mtimeMs,
      birth: s.birthtimeMs || s.ctimeMs || s.mtimeMs,
    });
  }
  return out;
}

async function summarizeCodexFile(absPath: string): Promise<CodexMeta> {
  const meta: CodexMeta = {
    uuid: null,
    cwd: null,
    model: null,
    gitBranch: null,
    firstUserPrompt: null,
    messageCount: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  const rl = readline.createInterface({
    input: createReadStream(absPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const p = obj.payload;
    if (obj.type === "session_meta" && p) {
      if (typeof p.id === "string") meta.uuid = p.id;
      if (typeof p.cwd === "string") meta.cwd = p.cwd;
      if (p.git && typeof p.git.branch === "string")
        meta.gitBranch = p.git.branch;
      continue;
    }
    if (obj.type === "turn_context" && p) {
      if (!meta.model && typeof p.model === "string") meta.model = p.model;
      if (!meta.cwd && typeof p.cwd === "string") meta.cwd = p.cwd;
      continue;
    }
    if (obj.type === "event_msg" && p) {
      if (p.type === "user_message") {
        meta.messageCount += 1;
        if (!meta.firstUserPrompt && typeof p.message === "string") {
          const t = p.message.trim();
          if (t && !t.startsWith("<")) meta.firstUserPrompt = t.slice(0, 500);
        }
      } else if (p.type === "agent_message") {
        meta.messageCount += 1;
      } else if (p.type === "token_count" && p.info?.total_token_usage) {
        // total_token_usage is cumulative — last occurrence wins.
        const u = p.info.total_token_usage;
        meta.inputTokens = u.input_tokens ?? meta.inputTokens;
        meta.outputTokens = u.output_tokens ?? meta.outputTokens;
      }
    }
  }
  rl.close();
  return meta;
}

export async function listCodexProjects(): Promise<ProjectSummary[]> {
  const files = await walkCodexFiles();
  const byCwd = new Map<string, ProjectSummary>();
  for (const f of files) {
    const meta = await summarizeCodexFile(f.absPath);
    const cwd = meta.cwd ?? "(unknown)";
    const id = encodeId(cwd);
    let proj = byCwd.get(cwd);
    if (!proj) {
      proj = {
        id,
        decodedPath: cwd,
        sessionCount: 0,
        totalBytes: 0,
        lastModified: 0,
        firstActivity: Infinity,
      };
      byCwd.set(cwd, proj);
    }
    proj.sessionCount += 1;
    proj.totalBytes += f.bytes;
    if (f.mtime > proj.lastModified) proj.lastModified = f.mtime;
    if (f.birth < proj.firstActivity) proj.firstActivity = f.birth;
  }
  const results = [...byCwd.values()];
  for (const r of results)
    if (!isFinite(r.firstActivity)) r.firstActivity = r.lastModified;
  results.sort((a, b) => b.lastModified - a.lastModified);
  return results;
}

export async function listCodexSessions(
  projectId: string,
): Promise<SessionSummary[]> {
  const cwd = decodeId(projectId);
  const [files, aliases, threadNames] = await Promise.all([
    walkCodexFiles(),
    loadCodexAliases(),
    loadCodexThreadNames(),
  ]);
  const out: SessionSummary[] = [];
  for (const f of files) {
    const meta = await summarizeCodexFile(f.absPath);
    if ((meta.cwd ?? "(unknown)") !== cwd) continue;
    const sessionId = encodeId(f.relPath);
    const uuid = meta.uuid ?? uuidFromRelPath(f.relPath);
    out.push({
      projectId,
      sessionId,
      file: f.absPath,
      bytes: f.bytes,
      mtime: f.mtime,
      firstUserPrompt: meta.firstUserPrompt,
      aiTitle: meta.uuid, // surfaced as the short id, no auto-title concept
      // The CLI picker's title — used as the app's default so the two agree.
      threadName: (uuid && threadNames.get(uuid)) || null,
      messageCount: meta.messageCount,
      model: meta.model,
      gitBranch: meta.gitBranch,
      cwd: meta.cwd,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      alias: aliases[sessionId] ?? null,
    });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

export function resolveCodexProjectPath(projectId: string): string {
  return decodeId(projectId);
}

export async function readCodexTranscript(
  sessionId: string,
): Promise<CodexEntry[]> {
  const relPath = decodeId(sessionId);
  const absPath = path.join(CODEX_SESSIONS_DIR, relPath);
  const rl = readline.createInterface({
    input: createReadStream(absPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const entries: CodexEntry[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = obj.timestamp;
    const p = obj.payload;
    if (obj.type === "session_meta" && p) {
      entries.push({
        kind: "meta",
        text: `session ${p.id ?? ""} · ${p.model_provider ?? ""} · codex ${p.cli_version ?? ""} · cwd ${p.cwd ?? ""}`,
        timestamp: ts,
        raw: obj,
      });
      continue;
    }
    if (obj.type === "event_msg" && p) {
      if (p.type === "user_message") {
        entries.push({
          kind: "user",
          text: typeof p.message === "string" ? p.message : "",
          timestamp: ts,
          raw: obj,
        });
      } else if (p.type === "agent_message") {
        entries.push({
          kind: "agent",
          text: typeof p.message === "string" ? p.message : "",
          timestamp: ts,
          raw: obj,
        });
      } else {
        entries.push({ kind: "raw", timestamp: ts, raw: obj });
      }
      continue;
    }
    if (obj.type === "response_item" && p) {
      if (p.type === "reasoning") {
        const summary = Array.isArray(p.summary)
          ? p.summary
              .map((s: any) => (typeof s === "string" ? s : s?.text ?? ""))
              .join("\n")
              .trim()
          : "";
        entries.push({
          kind: "reasoning",
          text: summary || undefined,
          timestamp: ts,
          raw: obj,
        });
      } else if (p.type === "function_call" || p.type === "local_shell_call") {
        entries.push({
          kind: "tool_call",
          toolName: p.name ?? p.type,
          callId: p.call_id ?? p.id,
          text:
            typeof p.arguments === "string"
              ? p.arguments
              : JSON.stringify(p.arguments ?? p.action ?? {}, null, 2),
          timestamp: ts,
          raw: obj,
        });
      } else if (
        p.type === "function_call_output" ||
        p.type === "custom_tool_call_output"
      ) {
        entries.push({
          kind: "tool_output",
          callId: p.call_id ?? p.id,
          text: extractOutput(p.output),
          timestamp: ts,
          raw: obj,
        });
      } else {
        // response_item "message" (developer/system/echoed user+assistant) is
        // redundant with the event_msg stream — keep it only for the raw view.
        entries.push({ kind: "raw", timestamp: ts, raw: obj });
      }
      continue;
    }
    entries.push({ kind: "raw", timestamp: ts, raw: obj });
  }
  rl.close();
  return entries;
}

function extractOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const o = output as { content?: unknown; output?: unknown };
    if (typeof o.content === "string") return o.content;
    if (typeof o.output === "string") return o.output;
  }
  return JSON.stringify(output ?? "", null, 2);
}

export async function deleteCodexSession(sessionId: string) {
  const relPath = decodeId(sessionId);
  const absPath = path.join(CODEX_SESSIONS_DIR, relPath);
  await fs.rm(absPath, { force: true, maxRetries: 3, retryDelay: 200 });
  await removeCodexAlias(sessionId);
  const uuid = uuidFromRelPath(relPath);
  if (uuid) await syncCodexSessionIndex(uuid, null);
}

export async function deleteCodexProject(projectId: string) {
  const cwd = decodeId(projectId);
  const files = await walkCodexFiles();
  for (const f of files) {
    const meta = await summarizeCodexFile(f.absPath);
    if ((meta.cwd ?? "(unknown)") !== cwd) continue;
    await fs.rm(f.absPath, { force: true, maxRetries: 3, retryDelay: 200 });
  }
}

export async function searchCodexSessions(
  query: string,
  limit = 100,
): Promise<
  { projectId: string; sessionId: string; snippet: string; mtime: number }[]
> {
  const q = query.toLowerCase();
  if (!q) return [];
  const files = await walkCodexFiles();
  const results: {
    projectId: string;
    sessionId: string;
    snippet: string;
    mtime: number;
  }[] = [];
  for (const f of files) {
    const hit = await scanFile(f.absPath, q);
    if (!hit) continue;
    const meta = await summarizeCodexFile(f.absPath);
    results.push({
      projectId: encodeId(meta.cwd ?? "(unknown)"),
      sessionId: encodeId(f.relPath),
      snippet: hit,
      mtime: f.mtime,
    });
    if (results.length >= limit) break;
  }
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

async function scanFile(filePath: string, q: string): Promise<string | null> {
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const lower = line.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx !== -1) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(line.length, idx + q.length + 60);
      rl.close();
      return line.slice(start, end);
    }
  }
  return null;
}

export type GlobalStats = {
  projects: number;
  sessions: number;
  totalBytes: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

export async function computeCodexStats(): Promise<GlobalStats> {
  const files = await walkCodexFiles();
  const cwds = new Set<string>();
  let totalBytes = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const f of files) {
    const meta = await summarizeCodexFile(f.absPath);
    cwds.add(meta.cwd ?? "(unknown)");
    totalBytes += f.bytes;
    totalInputTokens += meta.inputTokens;
    totalOutputTokens += meta.outputTokens;
  }
  return {
    projects: cwds.size,
    sessions: files.length,
    totalBytes,
    totalInputTokens,
    totalOutputTokens,
  };
}

// --- Codex rename: sidecar (app source of truth) + session_index mirror -----

/** Pull the session UUID out of a rollout relpath/filename. */
function uuidFromRelPath(relPath: string): string | null {
  const m = relPath.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  return m ? m[0] : null;
}

type SessionIndexRecord = {
  id: string;
  thread_name?: string;
  updated_at?: string;
  [k: string]: unknown;
};

/** Read ~/.codex/session_index.jsonl into a uuid → thread_name map. */
async function loadCodexThreadNames(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let text: string;
  try {
    text = await fs.readFile(CODEX_SESSION_INDEX, "utf8");
  } catch {
    return map;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as SessionIndexRecord;
      if (typeof rec.id === "string" && typeof rec.thread_name === "string")
        map.set(rec.id, rec.thread_name); // last occurrence wins
    } catch {
      // ignore malformed lines
    }
  }
  return map;
}

/**
 * Update the Codex CLI's session index so a rename done in this app shows up
 * in the `codex` picker. Best-effort: rewrites the whole file (preserving all
 * other records and any extra fields). `name === null` removes our title
 * override so the CLI falls back to its derived title.
 */
async function syncCodexSessionIndex(
  uuid: string,
  name: string | null,
): Promise<void> {
  let records: SessionIndexRecord[] = [];
  try {
    const text = await fs.readFile(CODEX_SESSION_INDEX, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as SessionIndexRecord);
      } catch {
        // drop unparseable lines on rewrite
      }
    }
  } catch {
    // index doesn't exist yet — we'll create it on write (only when setting)
  }

  const idx = records.findIndex((r) => r.id === uuid);
  if (name === null) {
    if (idx === -1) return; // nothing to clear
    records.splice(idx, 1);
  } else if (idx >= 0) {
    records[idx].thread_name = name;
    records[idx].updated_at = new Date().toISOString();
  } else {
    records.push({ id: uuid, thread_name: name, updated_at: new Date().toISOString() });
  }

  const body = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  try {
    await fs.writeFile(CODEX_SESSION_INDEX, body, "utf8");
  } catch {
    // best-effort; the app's sidecar still holds the rename
  }
}

type AliasMap = Record<string, string>;

async function loadCodexAliases(): Promise<AliasMap> {
  try {
    const text = await fs.readFile(CODEX_ALIASES_PATH, "utf8");
    const obj = JSON.parse(text);
    return obj && typeof obj === "object" ? (obj as AliasMap) : {};
  } catch {
    return {};
  }
}

async function writeCodexAliases(map: AliasMap): Promise<void> {
  await fs.mkdir(path.dirname(CODEX_ALIASES_PATH), { recursive: true });
  await fs.writeFile(CODEX_ALIASES_PATH, JSON.stringify(map, null, 2), "utf8");
}

export async function setCodexAlias(
  sessionId: string,
  name: string,
): Promise<void> {
  const map = await loadCodexAliases();
  const trimmed = name.trim().slice(0, 200);
  if (trimmed === "") delete map[sessionId];
  else map[sessionId] = trimmed;
  await writeCodexAliases(map);

  // Mirror to Codex's own session index so the `codex` CLI picker matches.
  const uuid = uuidFromRelPath(decodeId(sessionId));
  if (uuid) await syncCodexSessionIndex(uuid, trimmed === "" ? null : trimmed);
}

async function removeCodexAlias(sessionId: string): Promise<void> {
  const map = await loadCodexAliases();
  if (sessionId in map) {
    delete map[sessionId];
    await writeCodexAliases(map);
  }
}

export async function getCodexAlias(sessionId: string): Promise<string | null> {
  const map = await loadCodexAliases();
  return map[sessionId] ?? null;
}
