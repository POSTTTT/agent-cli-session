import { listOpencodeProjects } from "@/lib/opencode";
import { ProjectsView } from "@/components/ProjectsView";

export const dynamic = "force-dynamic";

export default async function OpencodeProjectsPage() {
  const projects = await listOpencodeProjects();
  return (
    <div>
      <h1 className="text-2xl font-semibold">opencode projects</h1>
      <p className="mt-1 text-sm text-white/60">
        {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
        {projects.reduce((a, p) => a + p.sessionCount, 0)} sessions
      </p>

      <ProjectsView
        projects={projects}
        basePath="/opencode/p"
        deletePrefix="opencode-project:"
        emptyLabel="No opencode sessions found in ~/.local/share/opencode/opencode.db"
      />
    </div>
  );
}
