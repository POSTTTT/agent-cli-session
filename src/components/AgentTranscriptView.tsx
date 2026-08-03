"use client";

import { useMemo, useState } from "react";
import type { AgentEntry } from "@/lib/transcript";
import { Markdown } from "./Markdown";

type Filter = "all" | "messages" | "tools";

export function AgentTranscriptView({
  entries,
  agentLabel = "Assistant",
}: {
  entries: AgentEntry[];
  agentLabel?: string;
}) {
  const [filter, setFilter] = useState<Filter>("messages");

  // Pair tool outputs to their calls by call_id so each tool call card can
  // show its result inline.
  const outputByCallId = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) {
      if (e.kind === "tool_output" && e.callId)
        m.set(e.callId, e.text ?? "");
    }
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "tools")
      return entries.filter((e) => e.kind === "tool_call");
    // messages
    return entries.filter((e) => e.kind === "user" || e.kind === "agent");
  }, [entries, filter]);

  return (
    <div className="mt-4">
      <div className="sticky top-[148px] z-20 -mx-6 mb-4 border-b border-white/10 bg-black/60 px-6 py-2 backdrop-blur">
        <div className="inline-flex rounded-md border border-white/10 bg-white/[0.03] p-0.5 text-xs">
          {(["messages", "tools", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded px-3 py-1 capitalize ${
                filter === f
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3" id="codex-transcript-top">
        {filtered.map((e, i) => (
          <EntryCard
            key={i}
            entry={e}
            agentLabel={agentLabel}
            output={e.kind === "tool_call" && e.callId ? outputByCallId.get(e.callId) : undefined}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-white/10 px-4 py-8 text-center text-white/50">
            Nothing to show for this filter.
          </div>
        )}
      </div>

      <ScrollFab />
    </div>
  );
}

function EntryCard({
  entry,
  output,
  agentLabel,
}: {
  entry: AgentEntry;
  output?: string;
  agentLabel: string;
}) {
  if (entry.kind === "user") {
    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <Label text="User" className="text-accent" />
        <div className="mt-1 whitespace-pre-wrap text-sm text-white/90">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.kind === "agent") {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <Label text={agentLabel} className="text-emerald-300" />
        <div className="mt-1 text-sm text-white/90">
          <Markdown text={entry.text ?? ""} />
        </div>
      </div>
    );
  }

  if (entry.kind === "reasoning") {
    return (
      <Collapsible
        summary={<Label text="Reasoning" className="text-violet-300" />}
        defaultOpen={false}
      >
        <div className="mt-1 whitespace-pre-wrap text-sm text-white/60">
          {entry.text ?? "(encrypted reasoning — not stored in plaintext)"}
        </div>
      </Collapsible>
    );
  }

  if (entry.kind === "tool_call") {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
            tool
          </span>
          <span className="font-mono text-xs text-amber-100">
            {entry.toolName}
          </span>
        </div>
        {entry.text && (
          <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2 text-xs text-white/70">
            {entry.text}
          </pre>
        )}
        {output !== undefined && (
          <Collapsible
            summary={<span className="text-xs text-white/50">output</span>}
            defaultOpen={false}
          >
            <pre className="mt-1 max-h-96 overflow-auto rounded bg-black/40 p-2 text-xs text-white/70">
              {output || "(empty)"}
            </pre>
          </Collapsible>
        )}
      </div>
    );
  }

  if (entry.kind === "tool_output") {
    // Standalone output (no matching call shown) — only seen in "all".
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <Label text="Tool output" className="text-white/50" />
        <pre className="mt-1 max-h-96 overflow-auto rounded bg-black/40 p-2 text-xs text-white/70">
          {entry.text || "(empty)"}
        </pre>
      </div>
    );
  }

  if (entry.kind === "meta") {
    return (
      <div className="rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2 font-mono text-[11px] text-white/40">
        {entry.text}
      </div>
    );
  }

  // raw
  return (
    <Collapsible
      summary={
        <span className="font-mono text-[11px] text-white/40">
          {rawLabel(entry.raw)}
        </span>
      }
      defaultOpen={false}
    >
      <pre className="mt-1 max-h-96 overflow-auto rounded bg-black/40 p-2 text-[11px] text-white/50">
        {JSON.stringify(entry.raw, null, 2)}
      </pre>
    </Collapsible>
  );
}

function rawLabel(raw: unknown): string {
  const o = raw as { type?: string; payload?: { type?: string } };
  const t = o?.type ?? "entry";
  const pt = o?.payload?.type;
  return pt ? `${t} · ${pt}` : t;
}

function Label({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={`text-[10px] font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {text}
    </span>
  );
}

function Collapsible({
  summary,
  children,
  defaultOpen,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-left hover:opacity-80"
      >
        <span className="text-[10px] text-white/40">{open ? "▼" : "▶"}</span>
        {summary}
      </button>
      {open && children}
    </div>
  );
}

function ScrollFab() {
  return (
    <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="h-9 w-9 rounded-full border border-white/15 bg-black/70 text-white/70 backdrop-blur hover:text-white"
        title="Scroll to top"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() =>
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
          })
        }
        className="h-9 w-9 rounded-full border border-white/15 bg-black/70 text-white/70 backdrop-blur hover:text-white"
        title="Scroll to bottom"
      >
        ↓
      </button>
    </div>
  );
}
