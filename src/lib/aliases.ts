import fs from "node:fs/promises";
import path from "node:path";
import { PROJECTS_DIR } from "./paths";

const ALIASES_PATH = path.join(PROJECTS_DIR, "_aliases.json");

type AliasMap = Record<string, string>;

function keyOf(projectId: string, sessionId: string): string {
  return `${projectId}/${sessionId}`;
}

async function readMap(): Promise<AliasMap> {
  try {
    const text = await fs.readFile(ALIASES_PATH, "utf8");
    const obj = JSON.parse(text);
    return obj && typeof obj === "object" ? (obj as AliasMap) : {};
  } catch {
    return {};
  }
}

async function writeMap(map: AliasMap): Promise<void> {
  await fs.mkdir(path.dirname(ALIASES_PATH), { recursive: true });
  await fs.writeFile(ALIASES_PATH, JSON.stringify(map, null, 2), "utf8");
}

export async function loadAliases(): Promise<AliasMap> {
  return readMap();
}

export async function setAlias(
  projectId: string,
  sessionId: string,
  name: string,
): Promise<void> {
  const map = await readMap();
  const trimmed = name.trim().slice(0, 200);
  const k = keyOf(projectId, sessionId);
  if (trimmed === "") {
    delete map[k];
  } else {
    map[k] = trimmed;
  }
  await writeMap(map);
  // Also mirror to the .jsonl so Claude Code's /resume picker shows the same
  // title. We append a custom-title line — the exact entry the CLI's `/rename`
  // writes — so the CLI picks it up. Both readers take the latest occurrence,
  // so this overrides any earlier title without rewriting the file. Skip the
  // mirror when clearing, so we never write a blank title into the JSONL.
  if (trimmed !== "") await appendCustomTitle(projectId, sessionId, trimmed);
}

async function appendCustomTitle(
  projectId: string,
  sessionId: string,
  title: string,
): Promise<void> {
  const file = path.join(PROJECTS_DIR, projectId, `${sessionId}.jsonl`);
  try {
    await fs.access(file);
  } catch {
    return; // session file doesn't exist; nothing to do
  }
  const line =
    JSON.stringify({ type: "custom-title", customTitle: title, sessionId }) +
    "\n";
  try {
    await fs.appendFile(file, line, "utf8");
  } catch {
    // best-effort sync; the sidecar still has the rename
  }
}

export function getAlias(
  map: AliasMap,
  projectId: string,
  sessionId: string,
): string | null {
  return map[keyOf(projectId, sessionId)] ?? null;
}
