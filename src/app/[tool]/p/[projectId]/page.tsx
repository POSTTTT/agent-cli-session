import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { formatBytes, formatNumber, formatRelative } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";
import { SessionTitle } from "@/components/SessionTitle";

export const dynamic = "force-dynamic";

export default async function AgentProjectPage({
  params,
}: {
  params: Promise<{ tool: string; projectId: string }>;
}) {
  const { tool, projectId } = await params;
  const agent = getAgent(tool);
  if (!agent) notFound();

  const decoded = decodeURIComponent(projectId);
  const [sessions, realPath] = await Promise.all([
    agent.store.listSessions(decoded),
    agent.store.resolveProjectPath(decoded),
  ]);

  return (
    <div>
      <Link
        href={`/${agent.key}`}
        className="text-sm text-white/60 hover:text-white"
      >
        ← All {agent.label} projects
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{realPath}</h1>
      <p className="mt-2 text-sm text-white/60">
        {sessions.length} session{sessions.length === 1 ? "" : "s"}
      </p>

      <div className="mt-6 space-y-3">
        {sessions.map((s) => (
          <div
            key={s.sessionId}
            className="rounded-lg border border-white/10 bg-white/[0.02] p-4 hover:border-white/20"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <SessionTitle
                  projectId={decoded}
                  sessionId={s.sessionId}
                  alias={s.alias}
                  aiTitle={s.aiTitle}
                  firstUserPrompt={s.firstUserPrompt}
                  basePath={`/${agent.key}/p`}
                  kind={agent.key}
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                  <span suppressHydrationWarning>{formatRelative(s.mtime)}</span>
                  <span>{s.messageCount} msgs</span>
                  <span>{formatBytes(s.bytes)}</span>
                  {s.model && <span className="font-mono">{s.model}</span>}
                  {s.gitBranch && (
                    <span className="font-mono">{s.gitBranch}</span>
                  )}
                  <span>
                    {formatNumber(s.inputTokens)} in /{" "}
                    {formatNumber(s.outputTokens)} out
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-white/30">
                  {s.file}
                </div>
              </div>
              <DeleteButton
                target={`agent-session:${agent.key}:${decoded}:${s.sessionId}`}
                label="Delete"
                confirm={`Permanently delete this ${agent.label} session from disk? This cannot be undone.`}
              />
            </div>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="rounded-lg border border-white/10 px-4 py-8 text-center text-white/50">
            No sessions in this project.
          </div>
        )}
      </div>
    </div>
  );
}
