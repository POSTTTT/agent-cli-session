"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectSummary } from "@/lib/sessions";
import { formatBytes, formatDuration, formatRelative } from "@/lib/format";
import { DeleteButton } from "./DeleteButton";
import {
  type Node,
  sepOf,
  buildTree,
  collapse,
  countProjects,
} from "@/lib/pathtree";

export function ProjectsTree({
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
  const tree = useMemo(() => {
    const sep = sepOf(projects);
    return collapse(buildTree(projects, sep), sep);
  }, [projects]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [""]: true,
  }));

  const toggle = (path: string) =>
    setExpanded((p) => ({ ...p, [path]: !p[path] }));

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-white/10">
      <div className="grid grid-cols-12 gap-3 border-b border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-white/50">
        <div className="col-span-6">Path</div>
        <div className="col-span-1 text-right">Sessions</div>
        <div className="col-span-2 text-right">Size</div>
        <div className="col-span-2 text-right">Last activity</div>
        <div className="col-span-1"></div>
      </div>
      <div>
        {[...tree.children.entries()]
          .sort(([, a], [, b]) => sortNode(a, b))
          .map(([key, c]) => (
            <TreeRow
              key={key}
              node={c}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              basePath={basePath}
              deletePrefix={deletePrefix}
            />
          ))}
        {tree.children.size === 0 && (
          <div className="px-4 py-8 text-center text-sm text-white/50">
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function sortNode(a: Node, b: Node): number {
  // Folders first, then projects, then by recency.
  const aLeaf = !!a.project ? 1 : 0;
  const bLeaf = !!b.project ? 1 : 0;
  if (aLeaf !== bLeaf) return aLeaf - bLeaf;
  return b.newest - a.newest;
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  basePath,
  deletePrefix,
}: {
  node: Node;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (k: string) => void;
  basePath: string;
  deletePrefix: string;
}) {
  const isOpen = expanded[node.fullPath];
  const indent = depth * 16;

  if (node.project) {
    const p = node.project;
    return (
      <div className="grid grid-cols-12 items-center gap-3 border-t border-white/5 px-4 py-2 text-sm hover:bg-white/5">
        <div className="col-span-6 flex items-center" style={{ paddingLeft: indent }}>
          <span className="mr-2 text-white/30">📄</span>
          <Link
            href={`${basePath}/${encodeURIComponent(p.id)}`}
            className="truncate font-mono text-xs text-sky-300 hover:underline"
          >
            {node.name}
          </Link>
        </div>
        <div className="col-span-1 text-right tabular-nums">
          {p.sessionCount}
        </div>
        <div className="col-span-2 text-right tabular-nums text-white/70">
          {formatBytes(p.totalBytes)}
        </div>
        <div
          className="col-span-2 text-right text-white/70"
          suppressHydrationWarning
        >
          {formatRelative(p.lastModified)}
        </div>
        <div className="col-span-1 text-right">
          <DeleteButton
            target={`${deletePrefix}${p.id}`}
            label="Delete"
            confirm={`Permanently delete project "${p.decodedPath}" and all its sessions? This cannot be undone.`}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="grid cursor-pointer grid-cols-12 items-center gap-3 border-t border-white/5 px-4 py-2 text-sm hover:bg-white/5"
        onClick={() => onToggle(node.fullPath)}
      >
        <div
          className="col-span-6 flex items-center"
          style={{ paddingLeft: indent }}
        >
          <span className="mr-2 w-4 text-white/40">{isOpen ? "▼" : "▶"}</span>
          <span className="mr-2 text-white/40">📁</span>
          <span className="truncate font-mono text-xs text-white/90">
            {node.name}
          </span>
          <span className="ml-2 text-[10px] text-white/40">
            {countProjects(node)} proj
          </span>
        </div>
        <div className="col-span-1 text-right tabular-nums text-white/60">
          {node.totalSessions}
        </div>
        <div className="col-span-2 text-right tabular-nums text-white/60">
          {formatBytes(node.totalBytes)}
        </div>
        <div
          className="col-span-2 text-right text-white/60"
          suppressHydrationWarning
        >
          {node.newest ? formatRelative(node.newest) : "—"}
        </div>
        <div className="col-span-1 text-right text-[10px] text-white/30">
          {node.newest
            ? formatDuration(Date.now() - node.oldest) + " span"
            : ""}
        </div>
      </div>
      {isOpen &&
        [...node.children.entries()]
          .sort(([, a], [, b]) => sortNode(a, b))
          .map(([key, c]) => (
            <TreeRow
              key={key}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              basePath={basePath}
              deletePrefix={deletePrefix}
            />
          ))}
    </>
  );
}

