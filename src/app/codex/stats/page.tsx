import { computeCodexStats } from "@/lib/codex";
import { formatBytes, formatNumber } from "@/lib/format";
import { PageHeader, Stat, StatPanel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CodexStatsPage() {
  const stats = await computeCodexStats();

  return (
    <div>
      <PageHeader title="Codex stats">
        Totals across every Codex rollout log on this machine.
      </PageHeader>

      <StatPanel>
        <Stat label="Projects" value={formatNumber(stats.projects)} />
        <Stat label="Sessions" value={formatNumber(stats.sessions)} />
        <Stat label="Total size" value={formatBytes(stats.totalBytes)} />
        <Stat
          label="Input tokens"
          value={formatNumber(stats.totalInputTokens)}
        />
        <Stat
          label="Output tokens"
          value={formatNumber(stats.totalOutputTokens)}
        />
      </StatPanel>
    </div>
  );
}
