import { listCodexProjects } from "@/lib/codex";
import { ProjectsView } from "@/components/ProjectsView";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CodexProjectsPage() {
  const projects = await listCodexProjects();
  const sessions = projects.reduce((a, p) => a + p.sessionCount, 0);
  return (
    <div>
      <PageHeader title="Codex projects">
        {projects.length} project{projects.length === 1 ? "" : "s"} · {sessions}{" "}
        session{sessions === 1 ? "" : "s"}, grouped by working directory.
      </PageHeader>

      <ProjectsView
        projects={projects}
        basePath="/codex/p"
        deletePrefix="codex-project:"
        emptyLabel="No Codex sessions found in ~/.codex/sessions"
      />
    </div>
  );
}
