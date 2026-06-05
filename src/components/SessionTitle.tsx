"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  renameSession,
  renameCodexSession,
  renameGeminiSession,
} from "@/app/actions";

export function SessionTitle({
  projectId,
  sessionId,
  alias,
  aiTitle,
  customTitle,
  firstUserPrompt,
  basePath = "/p",
  kind = "claude",
}: {
  projectId: string;
  sessionId: string;
  alias: string | null;
  aiTitle?: string | null;
  customTitle?: string | null;
  firstUserPrompt: string | null;
  basePath?: string;
  kind?: "claude" | "codex" | "gemini";
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(alias ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  const displayed =
    alias ?? customTitle ?? aiTitle ?? firstUserPrompt ?? "(no title)";
  const source: "alias" | "custom" | "ai" | "prompt" | "none" = alias
    ? "alias"
    : customTitle
      ? "custom"
      : aiTitle
        ? "ai"
        : firstUserPrompt
          ? "prompt"
          : "none";
  const href = `${basePath}/${encodeURIComponent(projectId)}/s/${sessionId}`;

  const save = (next: string) => {
    start(async () => {
      if (kind === "codex") await renameCodexSession(projectId, sessionId, next);
      else if (kind === "gemini")
        await renameGeminiSession(projectId, sessionId, next);
      else await renameSession(projectId, sessionId, next);
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(value);
            if (e.key === "Escape") {
              setEditing(false);
              setValue(alias ?? "");
            }
          }}
          placeholder="Custom name (empty = use first prompt)"
          className="flex-1 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-sky-400"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => save(value)}
          className="rounded-md border border-emerald-500/30 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(alias ?? "");
          }}
          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/60 hover:text-white"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={href}
        className="block min-w-0 flex-1 truncate text-sm font-medium text-sky-300 hover:underline"
      >
        {source === "alias" && (
          <span className="mr-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-200">
            named
          </span>
        )}
        {source === "custom" && (
          <span className="mr-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
            rename
          </span>
        )}
        {source === "ai" && (
          <span className="mr-2 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-violet-200">
            auto
          </span>
        )}
        {displayed}
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setEditing(true);
        }}
        className="shrink-0 rounded-md border border-white/15 px-2 py-1 text-xs text-white/60 hover:text-white"
        title="Rename"
      >
        Rename
      </button>
    </div>
  );
}
