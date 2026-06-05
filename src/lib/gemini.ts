import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import {
  GEMINI_HOME,
  GEMINI_TMP_DIR,
  GEMINI_PROJECTS_JSON,
  encodeId,
  decodeId,
} from "./paths";
import type { ProjectSummary, SessionSummary } from "./sessions";
import type { AgentEntry } from "./transcript";

// ---------------------------------------------------------------------------
// Gemini CLI keeps chats under
//   ~/.gemini/tmp/<projectName>/chats/session-<date>-<id>.jsonl
// and a ~/.gemini/projects.json map of real cwd -> projectName. Each chat file
// is an append log: a header line, occasional {"$set": {...}} patches, and one
// JSON object per conversation message ({id,timestamp,type,content,...}).
// ---------------------------------------------------------------------------

const GEMINI_ALIASES_PATH = path.join(GEMINI_HOME, "_gemini_aliases.json");

type GeminiFile = {
  relPath: string; // relative to GEMINI_TMP_DIR (the session id source)
  absPath: string;
  projectName: string;
  bytes: number;
  mtime: number;
  birth: number;
};

type GeminiMeta = {
  uuid: string | null;
  model: string | null;
  firstUserPrompt: string | null;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
};

async function safeStat(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

function prettyCwd(cwd: string): string {
  return cwd.replace(/^([a-z]):/, (_m, d: string) => `${d.toUpperCase()}:`);
}

/** real cwd (as recorded by Gemini, lowercased) -> short project folder name */
async function loadProjectMap(): Promise<Record<string, string>> {
  try {
    const text = await fs.readFile(GEMINI_PROJECTS_JSON, "utf8");
    const obj = JSON.parse(text);
    return obj?.projects && typeof obj.projects === "object"
      ? (obj.projects as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** project folder name -> pretty cwd */
async function nameToCwd(): Promise<Map<string, string>> {
  const map = await loadProjectMap();
  const out = new Map<string, string>();
  for (const [cwd, name] of Object.entries(map)) out.set(name, prettyCwd(cwd));
  return out;
}

/** Collect every chat file across all Gemini project folders. */
async function walkGeminiFiles(): Promise<GeminiFile[]> {
  let projectDirs: string[];
  try {
    projectDirs = await fs.readdir(GEMINI_TMP_DIR);
  } catch {
    return [];
  }
  const out: GeminiFile[] = [];
  for (const projectName of projectDirs) {
    const chatsDir = path.join(GEMINI_TMP_DIR, projectName, "chats");
    let files: string[];
    try {
      files = await fs.readdir(chatsDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const absPath = path.join(chatsDir, f);
      const s = await safeStat(absPath);
      if (!s || !s.isFile()) continue;
      out.push({
        relPath: `${projectName}/chats/${f}`,
        absPath,
        projectName,
        bytes: s.size,
        mtime: s.mtimeMs,
        birth: s.birthtimeMs || s.ctimeMs || s.mtimeMs,
      });
    }
  }
  return out;
}

/** Ordered, de-duplicated conversation events for one chat file. */
async function collectEvents(absPath: string): Promise<any[]> {
  const events: any[] = [];
  const seen = new Set<string>();
  const rl = readline.createInterface({
    input: createReadStream(absPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.$set) {
      const msgs = o.$set.messages;
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          if (m?.id && !seen.has(m.id)) {
            seen.add(m.id);
            events.push(m);
          }
        }
      }
      continue;
    }
    const t = o.type;
    if (t === "user" || t === "gemini") {
      if (o.id) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
      }
      events.push(o);
    } else if (t === "info" || t === "error") {
      events.push(o);
    }
  }
  rl.close();
  // header line has no type, won't be in events; keep timestamp order.
  events.sort((a, b) =>
    String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")),
  );
  return events;
}

function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" ? (c as any).text ?? "" : ""))
      .join("")
      .trim();
  }
  return "";
}

async function summarizeGeminiFile(absPath: string): Promise<GeminiMeta> {
  const meta: GeminiMeta = {
    uuid: null,
    model: null,
    firstUserPrompt: null,
    messageCount: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  // header (first line) for the session uuid
  const headRl = readline.createInterface({
    input: createReadStream(absPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of headRl) {
    try {
      const o = JSON.parse(line);
      if (o.sessionId) meta.uuid = o.sessionId;
    } catch {}
    break;
  }
  headRl.close();

  const events = await collectEvents(absPath);
  for (const e of events) {
    if (e.type === "gemini") meta.messageCount += 1;
    else if (e.type === "user") {
      // Skip empty (tool-response carrier) and injected-context messages.
      const t = userText(e.content);
      if (t.trim() && !t.startsWith("<session_context>")) meta.messageCount += 1;
    }
    if (e.type === "gemini" && e.model) meta.model = e.model; // last wins
    if (e.type === "gemini" && e.tokens && typeof e.tokens === "object") {
      // input is cumulative context size -> keep the largest; output is
      // per-response -> sum.
      meta.inputTokens = Math.max(meta.inputTokens, e.tokens.input ?? 0);
      meta.outputTokens += e.tokens.output ?? 0;
    }
    if (!meta.firstUserPrompt && e.type === "user") {
      const t = userText(e.content);
      if (t && !t.startsWith("<")) meta.firstUserPrompt = t.slice(0, 500);
    }
  }
  return meta;
}

export async function listGeminiProjects(): Promise<ProjectSummary[]> {
  const [files, names] = await Promise.all([walkGeminiFiles(), nameToCwd()]);
  const byName = new Map<string, ProjectSummary>();
  for (const f of files) {
    let proj = byName.get(f.projectName);
    if (!proj) {
      proj = {
        id: encodeId(f.projectName),
        decodedPath: names.get(f.projectName) ?? f.projectName,
        sessionCount: 0,
        totalBytes: 0,
        lastModified: 0,
        firstActivity: Infinity,
      };
      byName.set(f.projectName, proj);
    }
    proj.sessionCount += 1;
    proj.totalBytes += f.bytes;
    if (f.mtime > proj.lastModified) proj.lastModified = f.mtime;
    if (f.birth < proj.firstActivity) proj.firstActivity = f.birth;
  }
  const results = [...byName.values()];
  for (const r of results)
    if (!isFinite(r.firstActivity)) r.firstActivity = r.lastModified;
  results.sort((a, b) => b.lastModified - a.lastModified);
  return results;
}

export async function listGeminiSessions(
  projectId: string,
): Promise<SessionSummary[]> {
  const projectName = decodeId(projectId);
  const [files, aliases] = await Promise.all([
    walkGeminiFiles(),
    loadGeminiAliases(),
  ]);
  const out: SessionSummary[] = [];
  for (const f of files) {
    if (f.projectName !== projectName) continue;
    const meta = await summarizeGeminiFile(f.absPath);
    const sessionId = encodeId(f.relPath);
    out.push({
      projectId,
      sessionId,
      file: f.absPath,
      bytes: f.bytes,
      mtime: f.mtime,
      firstUserPrompt: meta.firstUserPrompt,
      aiTitle: meta.uuid,
      customTitle: null,
      messageCount: meta.messageCount,
      model: meta.model,
      gitBranch: null,
      cwd: null,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      alias: aliases[sessionId] ?? null,
    });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

export async function resolveGeminiProjectPath(
  projectId: string,
): Promise<string> {
  const projectName = decodeId(projectId);
  const names = await nameToCwd();
  return names.get(projectName) ?? projectName;
}

export async function readGeminiTranscript(
  sessionId: string,
): Promise<AgentEntry[]> {
  const relPath = decodeId(sessionId);
  const absPath = path.join(GEMINI_TMP_DIR, relPath);
  const events = await collectEvents(absPath);
  const entries: AgentEntry[] = [];
  for (const e of events) {
    const ts = e.timestamp;
    if (e.type === "user") {
      const text = userText(e.content);
      // Two kinds of noise we keep out of the default view (still under "all"):
      //  - the boilerplate <session_context> Gemini injects at chat start
      //  - empty "user" messages that just carry tool function-responses back
      //    to the model (their results already show inline on the tool call)
      const isNoise = !text.trim() || text.startsWith("<session_context>");
      entries.push({ kind: isNoise ? "raw" : "user", text, timestamp: ts, raw: e });
      continue;
    }
    if (e.type === "gemini") {
      if (Array.isArray(e.thoughts) && e.thoughts.length > 0) {
        const text = e.thoughts
          .map((t: any) =>
            t?.subject ? `${t.subject}\n${t.description ?? ""}` : t?.description ?? "",
          )
          .join("\n\n")
          .trim();
        if (text) entries.push({ kind: "reasoning", text, timestamp: ts, raw: e });
      }
      if (Array.isArray(e.toolCalls)) {
        for (const tc of e.toolCalls) {
          entries.push({
            kind: "tool_call",
            toolName: tc?.name ?? "tool",
            callId: tc?.id,
            text:
              tc?.args !== undefined
                ? JSON.stringify(tc.args, null, 2)
                : undefined,
            timestamp: ts,
            raw: tc,
          });
          const result = extractToolResult(tc?.result);
          if (result !== null)
            entries.push({
              kind: "tool_output",
              callId: tc?.id,
              text: result,
              timestamp: ts,
              raw: tc?.result,
            });
        }
      }
      const content = typeof e.content === "string" ? e.content : userText(e.content);
      if (content && content.trim())
        entries.push({ kind: "agent", text: content, timestamp: ts, raw: e });
      continue;
    }
    if (e.type === "info" || e.type === "error") {
      entries.push({
        kind: "meta",
        text: `${e.type}: ${typeof e.content === "string" ? e.content : JSON.stringify(e.content)}`,
        timestamp: ts,
        raw: e,
      });
      continue;
    }
    entries.push({ kind: "raw", timestamp: ts, raw: e });
  }
  return entries;
}

function extractToolResult(result: unknown): string | null {
  if (result === undefined || result === null) return null;
  if (typeof result === "string") return result;
  // Gemini tool results are usually [{ functionResponse: { response: {...} } }]
  if (Array.isArray(result)) {
    const parts = result.map((r) => {
      const fr = (r as any)?.functionResponse?.response;
      if (fr === undefined) return JSON.stringify(r);
      if (typeof fr === "string") return fr;
      if (fr?.output && typeof fr.output === "string") return fr.output;
      return JSON.stringify(fr);
    });
    return parts.join("\n");
  }
  return JSON.stringify(result);
}

export async function deleteGeminiSession(sessionId: string) {
  const relPath = decodeId(sessionId);
  const absPath = path.join(GEMINI_TMP_DIR, relPath);
  await fs.rm(absPath, { force: true, maxRetries: 3, retryDelay: 200 });
  await removeGeminiAlias(sessionId);
}

export async function deleteGeminiProject(projectId: string) {
  const projectName = decodeId(projectId);
  const dir = path.join(GEMINI_TMP_DIR, projectName);
  await fs.rm(dir, {
    force: true,
    recursive: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}

export async function searchGeminiSessions(
  query: string,
  limit = 100,
): Promise<
  { projectId: string; sessionId: string; snippet: string; mtime: number }[]
> {
  const q = query.toLowerCase();
  if (!q) return [];
  const files = await walkGeminiFiles();
  const results: {
    projectId: string;
    sessionId: string;
    snippet: string;
    mtime: number;
  }[] = [];
  for (const f of files) {
    const hit = await scanFile(f.absPath, q);
    if (!hit) continue;
    results.push({
      projectId: encodeId(f.projectName),
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

export async function computeGeminiStats(): Promise<GlobalStats> {
  const files = await walkGeminiFiles();
  const names = new Set<string>();
  let totalBytes = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const f of files) {
    names.add(f.projectName);
    totalBytes += f.bytes;
    const meta = await summarizeGeminiFile(f.absPath);
    totalInputTokens += meta.inputTokens;
    totalOutputTokens += meta.outputTokens;
  }
  return {
    projects: names.size,
    sessions: files.length,
    totalBytes,
    totalInputTokens,
    totalOutputTokens,
  };
}

// --- Gemini rename sidecar (no chat-file mirror) ---

type AliasMap = Record<string, string>;

async function loadGeminiAliases(): Promise<AliasMap> {
  try {
    const text = await fs.readFile(GEMINI_ALIASES_PATH, "utf8");
    const obj = JSON.parse(text);
    return obj && typeof obj === "object" ? (obj as AliasMap) : {};
  } catch {
    return {};
  }
}

async function writeGeminiAliases(map: AliasMap): Promise<void> {
  await fs.mkdir(path.dirname(GEMINI_ALIASES_PATH), { recursive: true });
  await fs.writeFile(GEMINI_ALIASES_PATH, JSON.stringify(map, null, 2), "utf8");
}

export async function setGeminiAlias(
  sessionId: string,
  name: string,
): Promise<void> {
  const map = await loadGeminiAliases();
  const trimmed = name.trim().slice(0, 200);
  if (trimmed === "") delete map[sessionId];
  else map[sessionId] = trimmed;
  await writeGeminiAliases(map);
}

async function removeGeminiAlias(sessionId: string): Promise<void> {
  const map = await loadGeminiAliases();
  if (sessionId in map) {
    delete map[sessionId];
    await writeGeminiAliases(map);
  }
}

export async function getGeminiAlias(sessionId: string): Promise<string | null> {
  const map = await loadGeminiAliases();
  return map[sessionId] ?? null;
}
