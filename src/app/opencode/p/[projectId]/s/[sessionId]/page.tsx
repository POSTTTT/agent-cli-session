import Link from "next/link";
import {
  readOpencodeTranscript,
  resolveOpencodeProjectPath,
  getOpencodeTitle,
} from "@/lib/opencode";
import type { AgentEntry } from "@/lib/transcript";
import { AgentTranscriptView } from "@/components/AgentTranscriptView";
import { SessionTitle } from "@/components/SessionTitle";

export const dynamic = "force-dynamic";

export default async function OpencodeSessionPage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId: string }>;
}) {
  const { projectId, sessionId } = await params;
  const decoded = decodeURIComponent(projectId);
  const [entries, title, realPath] = await Promise.all([
    readOpencodeTranscript(sessionId),
    getOpencodeTitle(sessionId),
    resolveOpencodeProjectPath(decoded),
  ]);
  const firstUserPrompt = findFirstUserPrompt(entries);

  return (
    <div>
      <Link
        href={`/opencode/p/${encodeURIComponent(decoded)}`}
        className="text-sm text-white/60 hover:text-white"
      >
        ← {realPath}
      </Link>
      <div className="mt-3">
        <SessionTitle
          projectId={decoded}
          sessionId={sessionId}
          alias={null}
          aiTitle={title}
          firstUserPrompt={firstUserPrompt}
          basePath="/opencode/p"
          kind="opencode"
        />
      </div>
      <p className="mt-1 text-sm text-white/50">{entries.length} entries</p>
      <AgentTranscriptView entries={entries} agentLabel="Opencode" />
    </div>
  );
}

function findFirstUserPrompt(entries: AgentEntry[]): string | null {
  for (const e of entries) {
    if (e.kind === "user" && e.text) {
      const t = e.text.trim();
      if (t) return t.slice(0, 200);
    }
  }
  return null;
}
