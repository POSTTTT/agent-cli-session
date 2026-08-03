import { computeGeminiStats } from "@/lib/gemini";
import { formatBytes, formatNumber } from "@/lib/format";
import { PageHeader, Stat, StatPanel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GeminiStatsPage() {
  const stats = await computeGeminiStats();

  return (
    <div>
      <PageHeader title="Gemini stats">
        Totals across every Gemini CLI chat log on this machine.
      </PageHeader>

      <StatPanel>
        <Stat label="Projects" value={formatNumber(stats.projects)} />
        <Stat label="Sessions" value={formatNumber(stats.sessions)} />
        <Stat label="Total size" value={formatBytes(stats.totalBytes)} />
        <Stat
          label="Context tokens"
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
