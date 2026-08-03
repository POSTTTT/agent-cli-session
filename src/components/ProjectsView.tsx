"use client";

import { useEffect, useState } from "react";
import type { ProjectSummary } from "@/lib/sessions";
import { ProjectsTable } from "./ProjectsTable";
import { ProjectsTree } from "./ProjectsTree";

type View = "table" | "tree";

const STORAGE_KEY = "projects-view";

export function ProjectsView({
  projects,
  basePath = "/p",
  deletePrefix = "project:",
  emptyLabel = "No projects found in ~/.claude/projects",
}: {
  projects: ProjectSummary[];
  basePath?: string;
  deletePrefix?: string;
  emptyLabel?: string;
}) {
  const [view, setView] = useState<View>("table");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "tree" || saved === "table") setView(saved);
  }, []);

  const change = (v: View) => {
    setView(v);
    window.localStorage.setItem(STORAGE_KEY, v);
  };

  return (
    <div>
      <div
        role="group"
        aria-label="Layout"
        className="inline-flex rounded-lg border border-line bg-surface p-1 text-[13px]"
      >
        {(["table", "tree"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => change(v)}
            aria-pressed={view === v}
            className={`rounded-md px-3 py-1 capitalize transition-colors ${
              view === v
                ? "bg-surface-2 text-fg ring-1 ring-line-strong"
                : "text-faint hover:text-muted"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {view === "table" ? (
        <ProjectsTable
          projects={projects}
          basePath={basePath}
          deletePrefix={deletePrefix}
          emptyLabel={emptyLabel}
        />
      ) : (
        <ProjectsTree
          projects={projects}
          basePath={basePath}
          deletePrefix={deletePrefix}
          emptyLabel={emptyLabel}
        />
      )}
    </div>
  );
}
