"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectSummary } from "@/lib/sessions";
import {
  formatBytes,
  formatDuration,
  formatRelative,
} from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";

type SortKey = "path" | "sessions" | "size" | "last" | "age";
type SortDir = "asc" | "desc";

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  path: "asc",
  sessions: "desc",
  size: "desc",
  last: "desc",
  age: "desc",
};

export function ProjectsTable({
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
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const arr = [...projects];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "path":
          cmp = a.decodedPath.localeCompare(b.decodedPath);
          break;
        case "sessions":
          cmp = a.sessionCount - b.sessionCount;
          break;
        case "size":
          cmp = a.totalBytes - b.totalBytes;
          break;
        case "last":
          cmp = a.lastModified - b.lastModified;
          break;
        case "age":
          cmp = a.firstActivity - b.firstActivity;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [projects, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  };

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[46rem] text-[13px]">
        <thead className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          <tr>
            <Th label="Path" col="path" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <Th label="Sessions" col="sessions" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <Th label="Size" col="size" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <Th label="Age" col="age" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <Th label="Last activity" col="last" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.id}
              className="group border-t border-line transition-colors hover:bg-surface-2"
            >
              <td className="px-4 py-2.5">
                <Link
                  href={`${basePath}/${encodeURIComponent(p.id)}`}
                  className="font-mono text-xs text-accent hover:underline"
                >
                  {p.decodedPath}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-fg">
                {p.sessionCount}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">
                {formatBytes(p.totalBytes)}
              </td>
              <td
                className="px-4 py-2.5 text-right font-mono tabular-nums text-muted"
                title={new Date(p.firstActivity).toLocaleString()}
                suppressHydrationWarning
              >
                {formatDuration(Date.now() - p.firstActivity)}
              </td>
              <td
                className="px-4 py-2.5 text-right text-muted"
                suppressHydrationWarning
              >
                {formatRelative(p.lastModified)}
              </td>
              <td className="px-4 py-2.5 text-right">
                <DeleteButton
                  target={`${deletePrefix}${p.id}`}
                  label="Delete"
                  confirm={`Permanently delete project "${p.decodedPath}" and all its sessions? This cannot be undone.`}
                />
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-14 text-center text-muted">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === col;
  return (
    <th
      className={`px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={
        active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-fg ${
          active ? "text-fg" : ""
        }`}
      >
        {label}
        <span aria-hidden className="text-[9px] text-accent">
          {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}
