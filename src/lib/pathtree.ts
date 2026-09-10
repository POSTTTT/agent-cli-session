import type { ProjectSummary } from "./sessions.ts";

export type Node = {
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

/** Which separator to render with — decided by what the paths actually look like. */
export function sepOf(projects: ProjectSummary[]): string {
  const windows = projects.some(
    (p) => /^[A-Za-z]:/.test(p.decodedPath) || p.decodedPath.includes("\\"),
  );
  return windows ? "\\" : "/";
}

export function buildTree(projects: ProjectSummary[], sep: string): Node {
  const root = emptyNode("", "");
  for (const p of projects) {
    const segs = p.decodedPath.split(/[\\/]+/).filter(Boolean);
    let cur = root;
    let acc = "";
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      // POSIX paths are absolute, so the first segment keeps its leading "/".
      acc = acc ? `${acc}${sep}${seg}` : sep === "/" ? `/${seg}` : seg;
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
 * "Users/post9/Documents" instead of three separate rows.
 */
export function collapse(n: Node, sep: string): Node {
  const newChildren = new Map<string, Node>();
  for (const [key, child] of n.children) {
    let merged = collapse(child, sep);
    while (
      !merged.project &&
      merged.children.size === 1 &&
      [...merged.children.values()][0].project === undefined
    ) {
      const only = [...merged.children.values()][0];
      const combined: Node = {
        ...only,
        name: `${merged.name}${sep}${only.name}`,
        fullPath: only.fullPath,
      };
      merged = combined;
    }
    newChildren.set(key, merged);
  }
  return { ...n, children: newChildren };
}

export function countProjects(n: Node): number {
  let c = n.project ? 1 : 0;
  for (const ch of n.children.values()) c += countProjects(ch);
  return c;
}
