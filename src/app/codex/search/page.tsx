import { searchCodexSessions, resolveCodexProjectPath } from "@/lib/codex";
import { formatRelative } from "@/lib/format";
import {
  EmptyState,
  PageHeader,
  ResultList,
  ResultRow,
  SearchForm,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CodexSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = q ? await searchCodexSessions(q, 100) : [];
  return (
    <div>
      <PageHeader title="Search Codex">
        Case-insensitive substring match across every line of every{" "}
        <span className="font-mono text-fg">.jsonl</span> in{" "}
        <span className="font-mono text-fg">~/.codex/sessions</span> — prompts,
        agent replies, tool calls, file paths, command output, session ids. Each
        result links to the session that contains the match.
      </PageHeader>

      <SearchForm
        action="/codex/search"
        q={q}
        placeholder="Search Codex session contents…"
      />

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
                href={`/codex/p/${encodeURIComponent(r.projectId)}/s/${r.sessionId}`}
                path={resolveCodexProjectPath(r.projectId)}
                meta={formatRelative(r.mtime)}
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
            title="Type a query to search your Codex logs."
            hint="A file path, a command, or an error string all work."
          />
        )}
      </div>
    </div>
  );
}
