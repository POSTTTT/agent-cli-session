import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { firstUserPrompt } from "@/lib/agentstore";
import { AgentTranscriptView } from "@/components/AgentTranscriptView";
import { SessionTitle } from "@/components/SessionTitle";

export const dynamic = "force-dynamic";

export default async function AgentSessionPage({
  params,
}: {
  params: Promise<{ tool: string; projectId: string; sessionId: string }>;
}) {
  const { tool, projectId, sessionId } = await params;
  const agent = getAgent(tool);
  if (!agent) notFound();

  const decoded = decodeURIComponent(projectId);
  const [entries, titles, realPath] = await Promise.all([
    agent.store.readTranscript(sessionId),
    agent.store.getTitles(sessionId),
    agent.store.resolveProjectPath(decoded),
  ]);

  return (
    <div>
      <Link
        href={`/${agent.key}/p/${encodeURIComponent(decoded)}`}
        className="text-sm text-white/60 hover:text-white"
      >
        ← {realPath}
      </Link>
      <div className="mt-3">
        <SessionTitle
          projectId={decoded}
          sessionId={sessionId}
          alias={titles.alias}
          aiTitle={titles.aiTitle}
          firstUserPrompt={firstUserPrompt(entries)}
          basePath={`/${agent.key}/p`}
          kind={agent.key}
        />
      </div>
      <p className="mt-1 text-sm text-white/50">{entries.length} entries</p>
      <AgentTranscriptView entries={entries} agentLabel={agent.label} />
    </div>
  );
}
