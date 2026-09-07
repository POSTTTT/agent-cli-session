import { notFound } from "next/navigation";
import { getAgent } from "@/lib/agents";
import { ProjectsView } from "@/components/ProjectsView";

export const dynamic = "force-dynamic";

export default async function AgentProjectsPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  const agent = getAgent(tool);
  if (!agent) notFound();

  const projects = await agent.store.listProjects();
  return (
    <div>
      <h1 className="text-2xl font-semibold">{agent.label} projects</h1>
      <p className="mt-1 text-sm text-white/60">
        {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
        {projects.reduce((a, p) => a + p.sessionCount, 0)} sessions
      </p>

      <ProjectsView
        projects={projects}
        basePath={`/${agent.key}/p`}
        deletePrefix={`agent-project:${agent.key}:`}
        emptyLabel={`No ${agent.label} sessions found in ${agent.dataPath}`}
      />
    </div>
  );
}
