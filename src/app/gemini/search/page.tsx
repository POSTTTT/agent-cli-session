import { searchGeminiSessions, resolveGeminiProjectPath } from "@/lib/gemini";
import { formatRelative } from "@/lib/format";
import {
  EmptyState,
  PageHeader,
  ResultList,
  ResultRow,
  SearchForm,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GeminiSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = q ? await searchGeminiSessions(q, 100) : [];
  const pathMap = new Map<string, string>();
  await Promise.all(
    [...new Set(results.map((r) => r.projectId))].map(async (pid) => {
      pathMap.set(pid, await resolveGeminiProjectPath(pid));
    }),
  );
  return (
    <div>
      <PageHeader title="Search Gemini">
        Case-insensitive substring match across every line of every{" "}
        <span className="font-mono text-fg">.jsonl</span> in{" "}
        <span className="font-mono text-fg">~/.gemini/tmp</span> — prompts,
        model replies, thoughts, tool calls, file paths. Each result links to
        the session that contains the match.
      </PageHeader>

      <SearchForm
        action="/gemini/search"
        q={q}
        placeholder="Search Gemini session contents…"
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
                href={`/gemini/p/${encodeURIComponent(r.projectId)}/s/${r.sessionId}`}
                path={pathMap.get(r.projectId) ?? r.projectId}
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
            title="Type a query to search your Gemini logs."
            hint="A file path, a prompt fragment, or a tool name all work."
          />
        )}
      </div>
    </div>
  );
}
