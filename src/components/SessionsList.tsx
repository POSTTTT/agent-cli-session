import Link from "next/link";
import { formatBytes, formatNumber, formatRelative } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";
import { SessionTitle } from "@/components/SessionTitle";
import type { RecentSession } from "@/lib/recent";

/**
 * The flat newest-first session list behind every tool's Sessions tab. Same
 * card as a project's session list, plus the project it belongs to — that
 * context is the only thing lost by leaving the project view.
 */
export function SessionsList({
  sessions,
  basePath,
  projectBasePath,
  deletePrefix,
  kind,
}: {
  sessions: RecentSession[];
  /** Session links: `${basePath}/<projectId>/s/<sessionId>`. */
  basePath: string;
  /** Project links: `${projectBasePath}/<projectId>`. */
  projectBasePath: string;
  /** Delete targets: `${deletePrefix}<projectId>:<sessionId>`. */
  deletePrefix: string;
  kind: string;
}) {
  if (sessions.length === 0)
    return (
      <div className="mt-6 rounded-lg border border-white/10 px-4 py-8 text-center text-white/50">
        No sessions yet.
      </div>
    );

  return (
    <div className="mt-6 space-y-3">
      {sessions.map((s) => (
        <div
          key={`${s.projectId}:${s.sessionId}`}
          className="rounded-lg border border-white/10 bg-white/[0.02] p-4 hover:border-white/20"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <SessionTitle
                projectId={s.projectId}
                sessionId={s.sessionId}
                alias={s.alias}
                // Codex has no auto-title: it puts the CLI picker's name in
                // threadName and keeps the session uuid in aiTitle, which is
                // an id, not a title.
                aiTitle={s.threadName !== undefined ? s.threadName : s.aiTitle}
                customTitle={s.customTitle}
                firstUserPrompt={s.firstUserPrompt}
                basePath={basePath}
                kind={kind}
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
              <Link
                href={`${projectBasePath}/${encodeURIComponent(s.projectId)}`}
                className="mt-1 block truncate font-mono text-[11px] text-white/35 hover:text-white/70"
              >
                {s.projectPath}
              </Link>
            </div>
            <DeleteButton
              target={`${deletePrefix}${s.projectId}:${s.sessionId}`}
              label="Delete"
              confirm="Permanently delete this session? This cannot be undone."
            />
          </div>
        </div>
      ))}
    </div>
  );
}
