import { listGeminiProjects } from "@/lib/gemini";
import { ProjectsView } from "@/components/ProjectsView";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GeminiProjectsPage() {
  const projects = await listGeminiProjects();
  const sessions = projects.reduce((a, p) => a + p.sessionCount, 0);
  return (
    <div>
      <PageHeader title="Gemini projects">
        {projects.length} project{projects.length === 1 ? "" : "s"} · {sessions}{" "}
        session{sessions === 1 ? "" : "s"} recorded in{" "}
        <span className="font-mono text-fg">~/.gemini/tmp</span>.
      </PageHeader>

      <ProjectsView
        projects={projects}
        basePath="/gemini/p"
        deletePrefix="gemini-project:"
        emptyLabel="No Gemini sessions found in ~/.gemini/tmp"
      />
    </div>
  );
}
