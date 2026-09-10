import type { AgentStore } from "./agentstore.ts";
import { cursorStore } from "./cursor.ts";
import { grokStore } from "./grok.ts";
import { museStore } from "./muse.ts";

// ---------------------------------------------------------------------------
// The tabs served by the shared /[tool] routes. Claude, Codex, Gemini and
// opencode predate this registry and still have hand-written route folders;
// anything added from here on only needs a store and a row in this table.
// ---------------------------------------------------------------------------

export type Agent = {
  key: string;
  label: string;
  /** Where the sessions live, shown on the projects and search pages. */
  dataPath: string;
  store: AgentStore;
};

export const AGENTS: Record<string, Agent> = {
  cursor: {
    key: "cursor",
    label: "Cursor",
    dataPath: "~/.cursor/chats/",
    store: cursorStore,
  },
  grok: {
    key: "grok",
    label: "Grok",
    dataPath: "~/.grok/sessions/",
    store: grokStore,
  },
  muse: {
    key: "muse",
    label: "Muse",
    dataPath: "~/.local/share/muse/sessions/",
    store: museStore,
  },
};

export function getAgent(tool: string): Agent | null {
  return AGENTS[tool] ?? null;
}
