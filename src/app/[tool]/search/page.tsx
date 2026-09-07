import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ tool: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { tool } = await params;
  const agent = getAgent(tool);
  if (!agent) notFound();

  const { q = "" } = await searchParams;
  const results = q ? await agent.store.search(q, 100) : [];
  const pathMap = new Map<string, string>();
  await Promise.all(
    [...new Set(results.map((r) => r.projectId))].map(async (pid) => {
      pathMap.set(pid, await agent.store.resolveProjectPath(pid));
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">Search {agent.label}</h1>
      <p className="mt-1 text-sm text-white/60">
        Looks through every session stored in{" "}
        <span className="font-mono text-white/80">{agent.dataPath}</span>.
        Case-insensitive substring match — prompts, model replies, reasoning,
        tool calls and their output, file paths, anything kept in the
        transcript. Each result links to the session that contains the match.
      </p>
      <form action={`/${agent.key}/search`} className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder={`Search ${agent.label} session contents…`}
          className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm outline-none focus:border-sky-400"
          autoFocus
        />
        <button
          type="submit"
          className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/25"
        >
          Search
        </button>
      </form>

      {q && (
        <p className="mt-3 text-sm text-white/60">
          {results.length} result{results.length === 1 ? "" : "s"} for{" "}
          <span className="font-mono">{q}</span>
        </p>
      )}

      <div className="mt-4 space-y-2">
        {results.map((r) => (
          <Link
            key={`${r.projectId}/${r.sessionId}`}
            href={`/${agent.key}/p/${encodeURIComponent(r.projectId)}/s/${r.sessionId}`}
            className="block rounded-lg border border-white/10 bg-white/[0.02] p-3 hover:border-white/20"
          >
            <div className="font-mono text-xs text-sky-300">
              {pathMap.get(r.projectId) ?? r.projectId}
            </div>
            <div
              className="mt-1 font-mono text-[10px] text-white/40"
              suppressHydrationWarning
            >
              {formatRelative(r.mtime)}
            </div>
            <div className="mt-1 truncate text-sm text-white/80">
              …{r.snippet}…
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
