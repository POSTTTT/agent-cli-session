# agent-cli-session

A local web app for browsing, searching, and managing the session logs your
coding agents leave behind — Claude Code, Codex, Gemini CLI, Opencode, Cursor,
Grok, and Muse Code.

Everything runs on your machine. No data leaves your computer, and no API calls
are made. Works on macOS, Linux, and Windows.

The header has one tab per agent, each with the same Projects / Search / Stats
pages.

---

## What it does

### Browse

**Projects (`/`)** lists every project folder with its *real* directory path,
resolved by reading the `cwd` recorded inside each session rather than trusting
the lossy dash-encoded folder name. Two views, toggled by a pill at the top and
remembered in `localStorage`:

- **Table** — sortable by path, sessions, size, age, or last activity. Click a
  header to sort, click again to flip direction.
- **Tree** — projects nested under their parent directories, with aggregated
  session count, size, and most recent activity per folder. Single-child chains
  collapse into one row, so `/Users/me/Desktop/GitHub` doesn't cost three lines.
  Separators follow the logs themselves, so Windows paths keep their
  backslashes even when viewed from another OS.

**Sessions (`/p/[projectId]`)** lists a project's sessions with title (alias →
ai-title → first user prompt), message count, model, git branch, input/output
tokens, file size, and session UUID.

**Transcript (`/p/[projectId]/s/[sessionId]`)** renders the JSONL as readable
messages:

- Markdown formatting — bold, italic, lists, fenced and inline code, links.
- Slash commands (`/clear`, `/model`, …) merged with their stdout into one
  compact terminal-style block.
- Tool calls merged with their matching results in a single card. Long results
  collapse behind a `▶` toggle with a one-line preview.
- Collapsible "thinking" blocks.
- Filter pills: **messages** (default, hides meta and tool-result chatter),
  **tools** (anything involving a tool call), **all** (raw).
- Sticky header and filter bar, plus floating ↑/↓ buttons, so long sessions
  stay navigable.

### Search (`/search`)

Case-insensitive substring scan across every line of every `.jsonl`. It matches
anywhere — user prompts, assistant replies, tool names, file paths, error
messages, session UUIDs, git branches — and each hit links to its session.

### Stats (`/stats`)

Five summary tiles aggregated across every session log on disk: projects,
sessions, total size, total input tokens, total output tokens.

### Manage

**Rename** gives any session a custom display name. Click **Rename** beside a
title to edit inline; an empty name clears the alias and falls back to the
auto-generated title. The name is stored in a sidecar
(`~/.claude/projects/_aliases.json`, which Claude Code ignores) *and* mirrored
into the `.jsonl` as a new `ai-title` line, so Claude Code's `/resume` picker
shows the same name. The filename and session UUID are never changed.

**Delete** removes a session or a whole project after a confirmation dialog
showing the full path. It uses `fs.rm` with retries, which absorbs the
transient file locks Windows AV and OneDrive sync tend to produce.

---

## Supported agents

Every tab reads its agent's own storage, in place and read-only unless you
rename or delete. Nothing is copied, indexed, or uploaded.

| Tab          | CLI            | Sessions read from                                                | Notes                                                                     |
| ------------ | -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Claude**   | Claude Code    | `~/.claude/projects/<encoded cwd>/<uuid>.jsonl`                    | One folder per project already; renames mirror into the log, so `/resume` shows them |
| **Codex**    | Codex CLI      | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`                     | Flat date tree; renames also land in `session_index.jsonl`, which the CLI picker reads |
| **Gemini**   | Gemini CLI     | `~/.gemini/tmp/<project>/chats/session-*.jsonl`                    | Real paths come from `projects.json`; "input" is peak context, not a sum   |
| **Opencode** | opencode       | `~/.local/share/opencode/opencode.db` (SQLite)                     | No log files at all; renames write back to `session.title`, so the TUI agrees |
| **Cursor**   | cursor-agent   | `~/.cursor/chats/<workspace>/<uuid>/store.db` (SQLite)             | Message order is blob insertion order; no token usage is recorded anywhere |
| **Grok**     | grok           | `~/.grok/sessions/<encoded cwd>/<uuid>/chat_history.jsonl`         | Token counts come from the ACP stream in `updates.jsonl`, as running totals |
| **Muse**     | Muse Code      | `~/.local/share/muse/sessions/YYYY/MM/DD/<uuid>/session.jsonl`     | An event log, projected down to the conversation turns                     |

Whatever the format, the app normalizes it to the same thing:

- **Projects are the real working directory.** Date trees, workspace hashes and
  lossy dash-encoded folder names are all resolved back to the `cwd` recorded
  inside the session itself.
- **Transcripts are one shape.** Prompts, replies, collapsible reasoning, and
  tool calls merged with their output — whether the source is a JSONL chat log,
  a runtime event stream, or SQLite rows.
- **Renames use a sidecar** (`_aliases.json` next to the store) for agents with
  no title field to write back to, so the original logs stay untouched. Claude
  Code and opencode are the exceptions noted above.
- **A missing store is not an error.** Tabs for agents you don't have installed
  simply render empty.

---

## Setup

### 1. Prerequisites

- **Node.js 20+** (`node -v`), or **22.5+** for the SQLite-backed tabs
  (Opencode, Cursor, Grok), which use the built-in `node:sqlite`.
- At least one agent's storage from the table above. Each appears the first
  time you run that agent.

### 2. Get the code

```bash
git clone https://github.com/POSTTTT/agent-cli-session
cd agent-cli-session
npm install
```

> **OneDrive caveat (Windows only).** If you cloned into a OneDrive-synced path
> like `C:\Users\<you>\OneDrive\Documents\GitHub\…`, `npm install` may hang
> silently — file-on-demand sync intercepts every small write npm makes. Either
> pause syncing for two hours from the tray icon and retry, or move the repo
> somewhere unsynced such as `C:\dev\agent-cli-session`.

### 3. Register the launcher (one time per machine)

```bash
npm link
```

This installs a global `agent-sessions` command pointing at this copy of the
project. `npm install -g .` from the project folder does the same thing.

### 4. Launch from anywhere

```bash
agent-sessions
```

No `cd`, no `npm run`. The server defaults to <http://localhost:3000> and your
browser opens automatically once it's ready. `Ctrl+C` stops it.

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `agent-sessions`           | Start the **dev** server + auto-open browser (default)    |
| `agent-sessions --prod`    | Start the **production** server (requires a prior build)  |
| `agent-sessions --build`   | Run `next build`, then start the production server        |
| `agent-sessions --no-open` | Don't open the browser                                    |
| `agent-sessions --help`    | Show the help and the project path                        |

### 5. Reading from a different directory (optional)

Each store's location can be overridden — useful for reading a backup or
another machine's logs:

| Tab      | Variable            | Tab      | Variable             |
| -------- | ------------------- | -------- | -------------------- |
| Claude   | `CLAUDE_HOME`       | Cursor   | `CURSOR_HOME`        |
| Codex    | `CODEX_HOME`        | Grok     | `GROK_HOME`          |
| Gemini   | `GEMINI_HOME`       | Muse     | `MUSE_DATA_DIR`      |
| Opencode | `OPENCODE_DATA_DIR` |          |                      |

```bash
# macOS / Linux
CLAUDE_HOME=/Volumes/backups/.claude agent-sessions
```

```powershell
# Windows
$env:CLAUDE_HOME = "D:\backups\.claude"
agent-sessions
```

---

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript, Tailwind CSS
- Server-side filesystem access via server components and Server Actions
- No database, no auth — runs on `localhost` only

The path-to-folder-tree logic and the session readers have standalone checks:

```bash
node src/lib/pathtree.test.mjs
node src/lib/opencode.test.mjs
node src/lib/agents.test.mjs
```

## Safety

- **Delete is permanent.** `fs.rm` removes the `.jsonl` file or the whole
  project folder. The confirmation dialog shows the full path first.
- **Rename never rewrites existing content.** Where it writes back to an agent
  at all it appends or updates one title field; every other entry is left
  intact. Elsewhere it only touches the `_aliases.json` sidecar.
- **No auth, single user.** The app expects to be reached on `localhost`.
  Don't expose it on a network.

## License

See `LICENSE`.
