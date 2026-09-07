import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { formatBytes, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentStatsPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  const agent = getAgent(tool);
  if (!agent) notFound();

  const stats = await agent.store.stats();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{agent.label} stats</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Projects" value={formatNumber(stats.projects)} />
        <Stat label="Sessions" value={formatNumber(stats.sessions)} />
        <Stat label="Total size" value={formatBytes(stats.totalBytes)} />
        <Stat label="Input tokens" value={formatNumber(stats.totalInputTokens)} />
        <Stat
          label="Output tokens"
          value={formatNumber(stats.totalOutputTokens)}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-white/50">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
