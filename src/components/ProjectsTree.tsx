"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectSummary } from "@/lib/sessions";
import { formatBytes, formatDuration, formatRelative } from "@/lib/format";
import { DeleteButton } from "./DeleteButton";

type Node = {
  name: string;
  fullPath: string;
  children: Map<string, Node>;
  project?: ProjectSummary;
  // Aggregated descendants — populated after build.
  totalSessions: number;
  totalBytes: number;
  newest: number;
  oldest: number;
};

function emptyNode(name: string, fullPath: string): Node {
  return {
    name,
    fullPath,
    children: new Map(),
    totalSessions: 0,
    totalBytes: 0,
    newest: 0,
    oldest: Infinity,
  };
}

function buildTree(projects: ProjectSummary[]): Node {
  const root = emptyNode("", "");
  for (const p of projects) {
    const segs = p.decodedPath.split(/[\\/]+/).filter(Boolean);
    let cur = root;
    let acc = "";
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      acc = acc ? `${acc}\\${seg}` : seg;
      const isLeaf = i === segs.length - 1;
      const key = isLeaf ? `__leaf__${seg}` : seg;
      let child = cur.children.get(key);
      if (!child) {
        child = emptyNode(seg, acc);
        cur.children.set(key, child);
      }
      if (isLeaf) child.project = p;
      cur = child;
    }
  }
  aggregate(root);
  return root;
}

function aggregate(n: Node): void {
  if (n.project) {
    n.totalSessions = n.project.sessionCount;
    n.totalBytes = n.project.totalBytes;
    n.newest = n.project.lastModified;
    n.oldest = n.project.firstActivity;
  }
  for (const c of n.children.values()) {
    aggregate(c);
    n.totalSessions += c.totalSessions;
    n.totalBytes += c.totalBytes;
    if (c.newest > n.newest) n.newest = c.newest;
    if (c.oldest < n.oldest) n.oldest = c.oldest;
  }
}

/**
 * Collapse single-child folder chains. If a directory has exactly one child
 * that is itself a directory (not a project leaf), merge them visually:
 * "Users\post9\OneDrive" instead of three separate rows.
 */
function collapse(n: Node): Node {
  const newChildren = new Map<string, Node>();
  for (const [key, child] of n.children) {
    let merged = collapse(child);
    while (
      !merged.project &&
      merged.children.size === 1 &&
      [...merged.children.values()][0].project === undefined
    ) {
      const only = [...merged.children.values()][0];
      const combined: Node = {
        ...only,
        name: `${merged.name}\\${only.name}`,
        fullPath: only.fullPath,
      };
      merged = combined;
    }
    newChildren.set(key, merged);
  }
  return { ...n, children: newChildren };
}

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
  const tree = useMemo(() => collapse(buildTree(projects)), [projects]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [""]: true,
  }));

  const toggle = (path: string) =>
    setExpanded((p) => ({ ...p, [path]: !p[path] }));

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-12 gap-3 border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
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
          <div className="px-4 py-14 text-center text-sm text-muted">
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
      <div className="grid grid-cols-12 items-center gap-3 border-t border-line px-4 py-2 text-[13px] transition-colors hover:bg-surface-2">
        <div
          className="col-span-6 flex items-center"
          style={{ paddingLeft: indent }}
        >
          <span className="mr-2 w-4" aria-hidden />
          <FileIcon />
          <Link
            href={`${basePath}/${encodeURIComponent(p.id)}`}
            className="truncate font-mono text-xs text-accent hover:underline"
          >
            {node.name}
          </Link>
        </div>
        <div className="col-span-1 text-right font-mono tabular-nums text-fg">
          {p.sessionCount}
        </div>
        <div className="col-span-2 text-right font-mono tabular-nums text-muted">
          {formatBytes(p.totalBytes)}
        </div>
        <div
          className="col-span-2 text-right text-muted"
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
        role="button"
        tabIndex={0}
        aria-expanded={!!isOpen}
        className="grid cursor-pointer grid-cols-12 items-center gap-3 border-t border-line px-4 py-2 text-[13px] transition-colors hover:bg-surface-2"
        onClick={() => onToggle(node.fullPath)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(node.fullPath);
          }
        }}
      >
        <div
          className="col-span-6 flex items-center"
          style={{ paddingLeft: indent }}
        >
          <Chevron open={!!isOpen} />
          <FolderIcon />
          <span className="truncate font-mono text-xs text-fg">
            {node.name}
          </span>
          <span className="ml-2 shrink-0 text-[11px] text-faint">
            {countProjects(node)} proj
          </span>
        </div>
        <div className="col-span-1 text-right font-mono tabular-nums text-muted">
          {node.totalSessions}
        </div>
        <div className="col-span-2 text-right font-mono tabular-nums text-muted">
          {formatBytes(node.totalBytes)}
        </div>
        <div
          className="col-span-2 text-right text-muted"
          suppressHydrationWarning
        >
          {node.newest ? formatRelative(node.newest) : "—"}
        </div>
        <div className="col-span-1 text-right text-[11px] text-faint">
          {node.newest ? formatDuration(Date.now() - node.oldest) + " span" : ""}
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

/* Row glyphs — plain strokes, one weight, no emoji. */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`mr-2 shrink-0 text-faint transition-transform duration-150 ${
        open ? "rotate-90" : ""
      }`}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mr-2 shrink-0 text-faint"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mr-2 shrink-0 text-faint"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function countProjects(n: Node): number {
  let c = n.project ? 1 : 0;
  for (const ch of n.children.values()) c += countProjects(ch);
  return c;
}
