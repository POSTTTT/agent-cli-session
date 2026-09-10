import { listOpencodeProjects, listOpencodeSessions } from "@/lib/opencode";
import { recentSessions } from "@/lib/recent";
import { SessionsList } from "@/components/SessionsList";

export const dynamic = "force-dynamic";

export default async function OpencodeSessionsPage() {
  const sessions = await recentSessions({
    listProjects: listOpencodeProjects,
    listSessions: listOpencodeSessions,
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Opencode sessions</h1>
      <p className="mt-1 text-sm text-white/60">
        {sessions.length} session{sessions.length === 1 ? "" : "s"} · most
        recent first
      </p>
      <SessionsList
        sessions={sessions}
        basePath="/opencode/p"
        projectBasePath="/opencode/p"
        deletePrefix="opencode-session:"
        kind="opencode"
      />
    </div>
  );
}
