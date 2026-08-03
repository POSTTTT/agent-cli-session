import { computeGlobalStats } from "@/lib/sessions";
import { formatBytes, formatNumber } from "@/lib/format";
import { PageHeader, Stat, StatPanel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const stats = await computeGlobalStats();

  return (
    <div>
      <PageHeader title="Stats">
        Totals across every Claude Code session log on this machine.
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
