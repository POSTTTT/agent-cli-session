import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { recentSessions } from "@/lib/recent";
import { SessionsList } from "@/components/SessionsList";

export const dynamic = "force-dynamic";

export default async function AgentSessionsPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  const agent = getAgent(tool);
  if (!agent) notFound();

  const sessions = await recentSessions(agent.store);
  return (
    <div>
      <h1 className="text-2xl font-semibold">{agent.label} sessions</h1>
      <p className="mt-1 text-sm text-white/60">
        {sessions.length} session{sessions.length === 1 ? "" : "s"} · most
        recent first
      </p>
      <SessionsList
        sessions={sessions}
        basePath={`/${agent.key}/p`}
        projectBasePath={`/${agent.key}/p`}
        deletePrefix={`agent-session:${agent.key}:`}
        kind={agent.key}
      />
    </div>
  );
}
