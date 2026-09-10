import { listProjects, listSessions } from "@/lib/sessions";
import { recentSessions } from "@/lib/recent";
import { SessionsList } from "@/components/SessionsList";

export const dynamic = "force-dynamic";

export default async function ClaudeSessionsPage() {
  const sessions = await recentSessions({ listProjects, listSessions });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Sessions</h1>
      <p className="mt-1 text-sm text-white/60">
        {sessions.length} session{sessions.length === 1 ? "" : "s"} · most
        recent first
      </p>
      <SessionsList
        sessions={sessions}
        basePath="/p"
        projectBasePath="/p"
        deletePrefix="session:"
        kind="claude"
      />
    </div>
  );
}
