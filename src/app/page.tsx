import { listProjects } from "@/lib/sessions";
import { ProjectsView } from "@/components/ProjectsView";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjects();
  const sessions = projects.reduce((a, p) => a + p.sessionCount, 0);
  return (
    <div>
      <PageHeader title="Projects">
        {projects.length} project{projects.length === 1 ? "" : "s"} · {sessions}{" "}
        session{sessions === 1 ? "" : "s"} recorded in{" "}
        <span className="font-mono text-fg">~/.claude/projects</span>.
      </PageHeader>

      <ProjectsView projects={projects} />
    </div>
  );
}
