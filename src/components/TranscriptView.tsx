"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { TranscriptEntry } from "@/lib/sessions";
import { Markdown } from "./Markdown";

type Filter = "all" | "messages" | "tools";

export function TranscriptView({ entries }: { entries: TranscriptEntry[] }) {
  const [filter, setFilter] = useState<Filter>("messages");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Stable identity so memoized EntryCards don't all re-render when one toggles.
  const toggle = useCallback((key: string) => {
    setExpanded((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const toolNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) {
      const content = (e.raw as { message?: { content?: unknown } }).message
        ?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content as { type?: string; id?: string; name?: string }[]) {
        if (c.type === "tool_use" && c.id && c.name) m.set(c.id, c.name);
      }
    }
    return m;
  }, [entries]);

  const toolResultById = useMemo(() => {
    const m = new Map<string, { text: string; isError: boolean }>();
    for (const e of entries) {
      const content = (e.raw as { message?: { content?: unknown } }).message
        ?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content as {
        type?: string;
        tool_use_id?: string;
        content?: unknown;
        is_error?: boolean;
      }[]) {
        if (c.type !== "tool_result" || !c.tool_use_id) continue;
        const text =
          typeof c.content === "string"
            ? c.content
            : Array.isArray(c.content)
              ? (c.content as { text?: string }[])
                  .map((x) => (typeof x === "string" ? x : x.text ?? ""))
                  .join("\n")
              : JSON.stringify(c.content);
        m.set(c.tool_use_id, { text, isError: !!c.is_error });
      }
    }
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "messages")
      return entries.filter((e) => {
        if (e.type !== "user" && e.type !== "assistant") return false;
        const raw = e.raw as {
          isMeta?: boolean;
          message?: { content?: unknown };
        };
        if (raw.isMeta) return false;
        // Hide user entries that are pure tool_result carriers — the result is
        // shown inline inside the tool_use card.
        if (e.type === "user") {
          const c = raw.message?.content;
          if (
            Array.isArray(c) &&
            c.length > 0 &&
            c.every(
              (x: { type?: string }) => x.type === "tool_result",
            )
          )
            return false;
        }
        return true;
      });
    if (filter === "tools")
      return entries.filter((e) => {
        const raw = e.raw as any;
        if (e.type !== "assistant" && e.type !== "user") return false;
        const content = raw.message?.content;
        return (
          Array.isArray(content) &&
          content.some(
            (c: any) => c.type === "tool_use" || c.type === "tool_result",
          )
        );
      });
    return entries;
  }, [entries, filter]);

  return (
    <div>
      <div className="sticky top-[148px] z-10 mt-3 flex gap-1 rounded-lg border border-white/10 bg-black/60 p-1 backdrop-blur">
        {(["messages", "tools", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-xs ${
              filter === f
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto self-center pr-2 text-xs text-white/50">
          {filtered.length} of {entries.length}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {groupCommands(filtered).map((g, i) => {
          const key = `${g.entries[0].uuid ?? "x"}-${i}`;
          if (g.kind === "command") {
            return <CommandBlock key={key} entries={g.entries} />;
          }
          const e = g.entries[0];
          return (
            <EntryCard
              key={key}
              id={key}
              entry={e}
              toolNameById={toolNameById}
              toolResultById={toolResultById}
              isOpen={!!expanded[key]}
              onToggle={toggle}
            />
          );
        })}
      </div>
      <ScrollFab />
    </div>
  );
}

function ScrollFab() {
  return (
    <div className="fixed bottom-6 right-6 z-20 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="h-10 w-10 rounded-full border border-white/15 bg-black/70 text-white/80 shadow-lg backdrop-blur hover:bg-black hover:text-white"
        title="Scroll to top"
        aria-label="Scroll to top"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() =>
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
          })
        }
        className="h-10 w-10 rounded-full border border-white/15 bg-black/70 text-white/80 shadow-lg backdrop-blur hover:bg-black hover:text-white"
        title="Scroll to bottom"
        aria-label="Scroll to bottom"
      >
        ↓
      </button>
    </div>
  );
}

type Group =
  | { kind: "single"; entries: [TranscriptEntry] }
  | { kind: "command"; entries: TranscriptEntry[] };

function userText(e: TranscriptEntry): string {
  const raw = e.raw as { message?: { content?: unknown } };
  const c = raw.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c))
    return c
      .map((p: { type?: string; text?: string }) =>
        p.type === "text" ? p.text ?? "" : "",
      )
      .join("\n");
  return "";
}

function isCommand(e: TranscriptEntry): boolean {
  return e.type === "user" && /<command-name>/i.test(userText(e));
}

function isCommandOutput(e: TranscriptEntry): boolean {
  return (
    e.type === "user" &&
    /<(local-)?command-(stdout|stderr)>/i.test(userText(e))
  );
}

function groupCommands(entries: TranscriptEntry[]): Group[] {
  const out: Group[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    if (isCommand(e)) {
      const group: TranscriptEntry[] = [e];
      let j = i + 1;
      while (j < entries.length && isCommandOutput(entries[j])) {
        group.push(entries[j]);
        j++;
      }
      out.push({ kind: "command", entries: group });
      i = j;
    } else {
      out.push({ kind: "single", entries: [e] });
      i++;
    }
  }
  return out;
}

function parseCommandFields(text: string): {
  name: string;
  args: string;
} {
  const name = /<command-name>([\s\S]*?)<\/command-name>/i.exec(text)?.[1] ?? "";
  const args = /<command-args>([\s\S]*?)<\/command-args>/i.exec(text)?.[1] ?? "";
  return { name: name.trim(), args: args.trim() };
}

function parseOutputFields(text: string): { stdout: string; stderr: string } {
  const stdout =
    /<(?:local-)?command-stdout>([\s\S]*?)<\/(?:local-)?command-stdout>/i.exec(
      text,
    )?.[1] ?? "";
  const stderr =
    /<(?:local-)?command-stderr>([\s\S]*?)<\/(?:local-)?command-stderr>/i.exec(
      text,
    )?.[1] ?? "";
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

function CommandBlock({ entries }: { entries: TranscriptEntry[] }) {
  const cmd = parseCommandFields(userText(entries[0]));
  const outputs = entries.slice(1).map((e) => parseOutputFields(userText(e)));
  const cmdName = cmd.name.replace(/^\/+/, "");
  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 font-mono text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-indigo-500/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-indigo-100">
          command
        </span>
        <span className="text-indigo-100">/{cmdName}</span>
        {cmd.args && <span className="text-indigo-200/70">{cmd.args}</span>}
      </div>
      {outputs.map((o, i) => (
        <div key={i} className="mt-2 flex gap-2 pl-2">
          <span className="select-none text-white/30">⤷</span>
          <div className="flex-1 space-y-1">
            {o.stdout && (
              <pre className="whitespace-pre-wrap break-words text-emerald-100/90">
                {stripAnsi(o.stdout)}
              </pre>
            )}
            {o.stderr && (
              <pre className="whitespace-pre-wrap break-words text-red-200/90">
                {stripAnsi(o.stderr)}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function stripAnsi(s: string): string {
  return s.replace(/\[[0-9;]*m/g, "");
}

const EntryCard = memo(function EntryCard({
  id,
  entry,
  toolNameById,
  toolResultById,
  isOpen,
  onToggle,
}: {
  id: string;
  entry: TranscriptEntry;
  toolNameById: Map<string, string>;
  toolResultById: Map<string, { text: string; isError: boolean }>;
  isOpen: boolean;
  onToggle: (id: string) => void;
}) {
  const raw = entry.raw as any;
  const role = entry.role ?? entry.type;
  const content = raw.message?.content;
  const tone =
    role === "user"
      ? "border-sky-500/30 bg-sky-500/5"
      : role === "assistant"
        ? "border-emerald-500/30 bg-emerald-500/5"
        : "border-white/10 bg-white/[0.02]";

  return (
    <div className={`rounded-lg border ${tone} p-3`}>
      <div className="flex items-center justify-between text-xs text-white/50">
        <div className="flex items-center gap-2">
          <span className="font-mono uppercase">
            {role === "assistant" ? "claude" : role}
          </span>
          {entry.model && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
              {entry.model}
            </span>
          )}
          {raw.isMeta && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">
              meta
            </span>
          )}
        </div>
        <div className="font-mono text-[10px]">
          {entry.timestamp
            ? new Date(entry.timestamp).toLocaleTimeString()
            : ""}
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {renderContent(content, toolNameById, toolResultById)}
      </div>

      <button
        onClick={() => onToggle(id)}
        className="mt-2 text-[10px] text-white/40 hover:text-white/70"
      >
        {isOpen ? "hide raw" : "show raw"}
      </button>
      {isOpen && (
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-black/50 p-2 text-[10px] leading-relaxed text-white/70">
          {JSON.stringify(entry.raw, null, 2)}
        </pre>
      )}
    </div>
  );
});

function renderContent(
  content: unknown,
  toolNameById: Map<string, string>,
  toolResultById: Map<string, { text: string; isError: boolean }>,
) {
  if (typeof content === "string") {
    return renderText(content);
  }
  if (!Array.isArray(content)) return null;
  return content.map((c: any, idx: number) => {
    if (c.type === "text") {
      return <div key={idx}>{renderText(c.text ?? "")}</div>;
    }
    if (c.type === "thinking") {
      return (
        <details key={idx} className="text-xs text-white/60">
          <summary className="cursor-pointer">💭 thinking</summary>
          <div className="mt-1 whitespace-pre-wrap pl-3 italic">
            {c.thinking}
          </div>
        </details>
      );
    }
    if (c.type === "tool_use") {
      const result = c.id ? toolResultById.get(c.id) : undefined;
      return (
        <ToolUseBlock
          key={idx}
          name={c.name}
          input={c.input}
          result={result}
        />
      );
    }
    if (c.type === "tool_result") {
      const text =
        typeof c.content === "string"
          ? c.content
          : Array.isArray(c.content)
            ? c.content
                .map((x: any) => (typeof x === "string" ? x : x.text ?? ""))
                .join("\n")
            : JSON.stringify(c.content);
      const toolName =
        (c.tool_use_id && toolNameById.get(c.tool_use_id)) || null;
      return (
        <div
          key={idx}
          className="rounded border border-white/10 bg-white/[0.03] p-2 text-xs"
        >
          <div className="font-mono text-white/50">
            ← {toolName ? `${toolName} result` : "tool result"}
            {c.is_error && (
              <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] uppercase text-red-200">
                error
              </span>
            )}
          </div>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] text-white/70">
            {text}
          </pre>
        </div>
      );
    }
    return (
      <div key={idx} className="text-xs text-white/40">
        {c.type}
      </div>
    );
  });
}

/* --- text rendering with awareness of Claude Code's wrapper tags --- */

type Block =
  | { kind: "text"; text: string }
  | { kind: "tag"; name: string; body: string };

function parseBlocks(s: string): Block[] {
  const blocks: Block[] = [];
  // Match top-level <tag>...</tag> sections. Non-greedy, multiline.
  const re = /<([a-z][a-z0-9-]*)>([\s\S]*?)<\/\1>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      const text = s.slice(last, m.index);
      if (text.trim()) blocks.push({ kind: "text", text });
    }
    blocks.push({ kind: "tag", name: m[1].toLowerCase(), body: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    const text = s.slice(last);
    if (text.trim()) blocks.push({ kind: "text", text });
  }
  if (blocks.length === 0 && s.trim()) blocks.push({ kind: "text", text: s });
  return blocks;
}

function renderText(s: string) {
  const blocks = parseBlocks(s);
  if (blocks.length === 1 && blocks[0].kind === "text") {
    return <Markdown text={s} />;
  }
  // Group consecutive command-* tags into one card.
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.kind === "tag" && b.name === "command-name") {
      const group: Record<string, string> = {};
      while (
        i < blocks.length &&
        blocks[i].kind === "tag" &&
        (blocks[i] as { name: string }).name.startsWith("command-")
      ) {
        const t = blocks[i] as { name: string; body: string };
        group[t.name] = t.body.trim();
        i++;
      }
      out.push(
        <CommandCard
          key={`cmd-${i}`}
          name={group["command-name"] ?? ""}
          message={group["command-message"]}
          args={group["command-args"]}
        />,
      );
      continue;
    }
    if (b.kind === "tag") {
      out.push(<TagCard key={`tag-${i}`} name={b.name} body={b.body} />);
      i++;
      continue;
    }
    out.push(<Markdown key={`txt-${i}`} text={b.text} />);
    i++;
  }
  return <div className="space-y-2">{out}</div>;
}

function CommandCard({
  name,
  args,
}: {
  name: string;
  message?: string;
  args?: string;
}) {
  const cmd = name.replace(/^\/+/, "");
  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-xs">
      <span className="rounded bg-indigo-500/30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-indigo-100">
        command
      </span>
      <span className="font-mono text-indigo-100">/{cmd}</span>
      {args && (
        <span className="font-mono text-indigo-200/70">{args}</span>
      )}
    </div>
  );
}

const FRIENDLY_TAGS: Record<string, { label: string; tone: string }> = {
  "local-command-stdout": { label: "command output", tone: "stdout" },
  "command-stdout": { label: "command output", tone: "stdout" },
  "local-command-stderr": { label: "command error", tone: "stderr" },
  "local-command-caveat": { label: "caveat", tone: "muted" },
  "system-reminder": { label: "system reminder", tone: "muted" },
  "user-prompt-submit-hook": { label: "submit hook", tone: "muted" },
  "user-memory-input": { label: "memory", tone: "muted" },
};

function TagCard({ name, body }: { name: string; body: string }) {
  const meta = FRIENDLY_TAGS[name];
  const tone =
    meta?.tone === "stdout"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-100"
      : meta?.tone === "stderr"
        ? "border-red-500/30 bg-red-500/5 text-red-100"
        : "border-white/10 bg-white/[0.03] text-white/70";
  const label = meta?.label ?? name;
  const trimmed = body.trim();
  const isEmpty = trimmed === "";

  return (
    <div className={`rounded-md border ${tone} px-2 py-1.5 text-xs`}>
      <div className="font-mono text-[10px] uppercase tracking-wide opacity-70">
        {label}
      </div>
      {!isEmpty && (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-xs">
          {trimmed}
        </pre>
      )}
    </div>
  );
}

function ToolUseBlock({
  name,
  input,
  result,
}: {
  name: string;
  input: unknown;
  result?: { text: string; isError: boolean };
}) {
  const longResult = !!result && result.text.length > 200;
  const [open, setOpen] = useState(!longResult);
  const previewLine = result?.text.split("\n").find((l) => l.trim()) ?? "";
  const previewSnippet =
    previewLine.length > 120 ? previewLine.slice(0, 120) + "…" : previewLine;

  return (
    <div className="overflow-hidden rounded border border-amber-500/30 bg-amber-500/5 text-xs">
      <div className="px-2 pt-2">
        <div className="flex items-center gap-2 font-mono text-amber-300">
          <span>→ {name}</span>
          {result?.isError && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] uppercase text-red-200">
              error
            </span>
          )}
        </div>
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] text-white/70">
          {JSON.stringify(input, null, 2)}
        </pre>
      </div>
      {result && (
        <div className="mt-1 border-t border-amber-500/20 bg-black/20 px-2 py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-2 text-left font-mono text-[10px] uppercase tracking-wide text-white/40 hover:text-white/70"
          >
            <span className="inline-block w-3">{open ? "▼" : "▶"}</span>
            <span>← result</span>
            {!open && previewSnippet && (
              <span className="ml-1 truncate font-sans normal-case tracking-normal text-white/45">
                {previewSnippet}
              </span>
            )}
            {!open && (
              <span className="ml-auto text-white/30">
                {result.text.length.toLocaleString()} chars
              </span>
            )}
          </button>
          {open && (
            <pre
              className={`mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px] ${
                result.isError ? "text-red-200/90" : "text-white/75"
              }`}
            >
              {result.text}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
