import type { ProjectSummary, SessionSummary } from "./sessions.ts";

// ---------------------------------------------------------------------------
// The Sessions tab: one flat, newest-first list across every project of a tool,
// so the session you are in right now sits at the top. Each store already
// exposes projects and per-project sessions, so this just flattens them.
// ---------------------------------------------------------------------------

export type RecentSession = SessionSummary & { projectPath: string };

export type SessionSource = {
  listProjects(): Promise<ProjectSummary[]>;
  listSessions(projectId: string): Promise<SessionSummary[]>;
};

export async function recentSessions(
  source: SessionSource,
  limit = 200,
): Promise<RecentSession[]> {
  const projects = await source.listProjects();
  // One project at a time: a store fans out over its own session files, and
  // fanning out over projects on top of that opens enough streams at once to
  // hit the process's file-descriptor limit (EMFILE) on a busy Claude tree.
  const all: RecentSession[] = [];
  for (const p of projects)
    for (const s of await source.listSessions(p.id))
      all.push({ ...s, projectPath: p.decodedPath });
  return all
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}
