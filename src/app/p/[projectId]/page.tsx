import Link from "next/link";
import { listSessions, resolveProjectPath } from "@/lib/sessions";
import { formatBytes, formatNumber, formatRelative } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";
import { SessionTitle } from "@/components/SessionTitle";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const decoded = decodeURIComponent(projectId);
  const [sessions, realPath] = await Promise.all([
    listSessions(decoded),
    resolveProjectPath(decoded),
  ]);
  return (
    <div>
      <Link href="/" className="text-sm text-white/60 hover:text-white">
        ← All projects
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{realPath}</h1>
      <p className="mt-1 font-mono text-xs text-white/40">{decoded}</p>
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
                  customTitle={s.customTitle}
                  firstUserPrompt={s.firstUserPrompt}
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                  <span suppressHydrationWarning>{formatRelative(s.mtime)}</span>
                  <span>{s.messageCount} msgs</span>
                  <span>{formatBytes(s.bytes)}</span>
                  {s.model && <span className="font-mono">{s.model}</span>}
                  {s.gitBranch && (
                    <span className="font-mono">⎇ {s.gitBranch}</span>
                  )}
                  <span>
                    {formatNumber(s.inputTokens)} in /{" "}
                    {formatNumber(s.outputTokens)} out
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-white/30">
                  {s.sessionId}
                </div>
              </div>
              <DeleteButton
                target={`session:${decoded}:${s.sessionId}`}
                label="Delete"
                confirm="Permanently delete this session? This cannot be undone."
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
