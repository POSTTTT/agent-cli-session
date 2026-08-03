import { searchSessions, resolveProjectPath } from "@/lib/sessions";
import { formatRelative } from "@/lib/format";
import {
  EmptyState,
  PageHeader,
  ResultList,
  ResultRow,
  SearchForm,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = q ? await searchSessions(q, 100) : [];
  const pathMap = new Map<string, string>();
  await Promise.all(
    [...new Set(results.map((r) => r.projectId))].map(async (pid) => {
      pathMap.set(pid, await resolveProjectPath(pid));
    }),
  );
  return (
    <div>
      <PageHeader title="Search">
        Case-insensitive substring match across every line of every{" "}
        <span className="font-mono text-fg">.jsonl</span> in{" "}
        <span className="font-mono text-fg">~/.claude/projects</span> — prompts,
        replies, tool names, file paths, error messages, session ids, git
        branches. Each result links to the session that contains the match.
      </PageHeader>

      <SearchForm action="/search" q={q} placeholder="Search session contents…" />

      {q && (
        <p className="mt-4 text-[13px] text-muted">
          {results.length} result{results.length === 1 ? "" : "s"} for{" "}
          <span className="font-mono text-fg">{q}</span>
        </p>
      )}

      <div className="mt-4">
        {results.length > 0 ? (
          <ResultList>
            {results.map((r) => (
              <ResultRow
                key={`${r.projectId}/${r.sessionId}`}
                href={`/p/${encodeURIComponent(r.projectId)}/s/${r.sessionId}`}
                path={pathMap.get(r.projectId) ?? r.projectId}
                meta={`${r.sessionId} · ${formatRelative(r.mtime)}`}
                snippet={r.snippet}
              />
            ))}
          </ResultList>
        ) : q ? (
          <EmptyState
            title={`Nothing matched "${q}".`}
            hint="Try a shorter fragment — matching is literal, not fuzzy."
          />
        ) : (
          <EmptyState
            title="Type a query to search your session logs."
            hint="A file path, an error string, or a session id all work."
          />
        )}
      </div>
    </div>
  );
}
