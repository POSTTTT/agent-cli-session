import Link from "next/link";
import { readTranscript, resolveProjectPath } from "@/lib/sessions";
import { loadAliases, getAlias } from "@/lib/aliases";
import { TranscriptView } from "@/components/TranscriptView";
import { SessionTitle } from "@/components/SessionTitle";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId: string }>;
}) {
  const { projectId, sessionId } = await params;
  const decoded = decodeURIComponent(projectId);
  const [entries, realPath, aliases] = await Promise.all([
    readTranscript(decoded, sessionId),
    resolveProjectPath(decoded),
    loadAliases(),
  ]);
  const alias = getAlias(aliases, decoded, sessionId);
  const firstUserPrompt = findFirstUserPrompt(entries);
  const aiTitle = findAiTitle(entries);
  const customTitle = findCustomTitle(entries);

  return (
    <div>
      <Link
        href={`/p/${encodeURIComponent(decoded)}`}
        className="text-sm text-white/60 hover:text-white"
      >
        ← {realPath}
      </Link>
      <div className="mt-3">
        <SessionTitle
          projectId={decoded}
          sessionId={sessionId}
          alias={alias}
          aiTitle={aiTitle}
          customTitle={customTitle}
          firstUserPrompt={firstUserPrompt}
        />
      </div>
      <div className="mt-2 font-mono text-[11px] text-white/40">{sessionId}</div>
      <p className="mt-1 text-sm text-white/50">{entries.length} entries</p>
      <TranscriptView entries={entries} />
    </div>
  );
}

function findAiTitle(entries: { type: string; raw: unknown }[]): string | null {
  let last: string | null = null;
  for (const e of entries) {
    if (e.type === "ai-title") {
      const raw = e.raw as { aiTitle?: string };
      if (typeof raw.aiTitle === "string") last = raw.aiTitle;
    }
  }
  return last;
}

function findCustomTitle(
  entries: { type: string; raw: unknown }[],
): string | null {
  let last: string | null = null;
  for (const e of entries) {
    if (e.type === "custom-title") {
      const raw = e.raw as { customTitle?: string };
      // Latest occurrence wins; empty (a cleared name) resets to no title.
      if (typeof raw.customTitle === "string")
        last = raw.customTitle.trim() ? raw.customTitle : null;
    }
  }
  return last;
}

function findFirstUserPrompt(
  entries: { type: string; raw: unknown }[],
): string | null {
  for (const e of entries) {
    if (e.type !== "user") continue;
    const raw = e.raw as { isMeta?: boolean; message?: { content?: unknown } };
    if (raw.isMeta) continue;
    const c = raw.message?.content;
    if (typeof c === "string" && !c.startsWith("<"))
      return c.trim().slice(0, 200);
    if (Array.isArray(c)) {
      for (const part of c as { type?: string; text?: string }[]) {
        if (part.type === "text" && part.text)
          return part.text.trim().slice(0, 200);
      }
    }
  }
  return null;
}
