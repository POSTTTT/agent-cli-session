import { listGeminiProjects, listGeminiSessions } from "@/lib/gemini";
import { recentSessions } from "@/lib/recent";
import { SessionsList } from "@/components/SessionsList";

export const dynamic = "force-dynamic";

export default async function GeminiSessionsPage() {
  const sessions = await recentSessions({
    listProjects: listGeminiProjects,
    listSessions: listGeminiSessions,
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Gemini sessions</h1>
      <p className="mt-1 text-sm text-white/60">
        {sessions.length} session{sessions.length === 1 ? "" : "s"} · most
        recent first
      </p>
      <SessionsList
        sessions={sessions}
        basePath="/gemini/p"
        projectBasePath="/gemini/p"
        deletePrefix="gemini-session:"
        kind="gemini"
      />
    </div>
  );
}
