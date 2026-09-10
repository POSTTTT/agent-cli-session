import { listCodexProjects, listCodexSessions } from "@/lib/codex";
import { recentSessions } from "@/lib/recent";
import { SessionsList } from "@/components/SessionsList";

export const dynamic = "force-dynamic";

export default async function CodexSessionsPage() {
  const sessions = await recentSessions({
    listProjects: listCodexProjects,
    listSessions: listCodexSessions,
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Codex sessions</h1>
      <p className="mt-1 text-sm text-white/60">
        {sessions.length} session{sessions.length === 1 ? "" : "s"} · most
        recent first
      </p>
      <SessionsList
        sessions={sessions}
        basePath="/codex/p"
        projectBasePath="/codex/p"
        deletePrefix="codex-session:"
        kind="codex"
      />
    </div>
  );
}
