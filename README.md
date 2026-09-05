# agent-cli-session

A local web app for browsing, searching, and managing the session logs your
coding agents leave behind — **Claude Code** (`~/.claude/projects/`), **Codex**
(`~/.codex/sessions/`), **Gemini CLI** (`~/.gemini/tmp/`), and **opencode**
(`~/.local/share/opencode/opencode.db`).

Everything runs on your machine. No data leaves your computer, and no API calls
are made. Works on macOS, Linux, and Windows.

The header has four tabs — **Claude**, **Codex**, **Gemini**, **opencode** —
each with the same Projects / Search / Stats pages.

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

### Codex tab (`/codex`)

Mirrors every feature above for Codex sessions in `~/.codex/sessions/`, handling
the format differences transparently:

- Codex writes a flat date tree (`sessions/YYYY/MM/DD/rollout-*.jsonl`) rather
  than per-project folders, so sessions are grouped into projects by their real
  `cwd`, read from each rollout's `session_meta` line.
- The viewer understands Codex's event stream: user messages, agent replies,
  collapsible reasoning, and `function_call` cards merged with their output.
- Renames live in `~/.codex/sessions/_codex_aliases.json`. Codex has no
  `/resume` title to mirror into, so the rollout `.jsonl` is never modified.

### Gemini tab (`/gemini`)

Same again for Gemini CLI chats under `~/.gemini/tmp/`:

- Gemini already stores one folder per project
  (`tmp/<project>/chats/session-*.jsonl`), and `~/.gemini/projects.json` maps
  each to its real working directory, which the app shows as the project path.
- Each chat log is an append journal — a header line, `$set` patches, then one
  object per message. The viewer reconstructs the conversation from it: prompts,
  replies, collapsible **thoughts**, and `toolCalls` merged with their results.
- **Context tokens** are shown instead of input tokens. Gemini records
  cumulative context size per turn, so the app reports the peak rather than a
  meaningless sum. Output tokens are summed normally.
- Renames live in `~/.gemini/_gemini_aliases.json`; the chat log is untouched.

### opencode tab (`/opencode`)

opencode keeps no log files at all — everything lives in one SQLite database at
`~/.local/share/opencode/opencode.db`, read here through Node's built-in
`node:sqlite` (no extra dependency):

- Recent opencode versions file every session under a single `global` project
  whose worktree is `/`, so that table is useless for grouping. Projects are
  grouped by each session's recorded `directory` instead, which is the real
  working directory.
- A session is a `session` row, a turn is a `message` row, and every text /
  reasoning / tool block is a `part` row holding JSON. The viewer replays them
  in order: prompts, replies, collapsible reasoning, and tool calls merged with
  their output.
- **Size** is the stored JSON weight of a session's messages and parts, since
  there is no file to measure. Token counts come from the session row.
- opencode auto-titles sessions and its own `/rename` overwrites that same
  field, so **Rename** writes straight to `session.title` — the change shows up
  in the opencode TUI too. Deleting a session or project deletes those rows;
  messages and parts cascade with them.

---

## Setup

### 1. Prerequisites

- **Node.js 20+** (`node -v`).
- At least one agent's storage — `~/.claude/projects/`, `~/.codex/sessions/`,
  `~/.gemini/tmp/`, or `~/.local/share/opencode/opencode.db`. Each appears the
  first time you run that agent. Tabs whose storage is missing simply render
  empty. The opencode tab needs **Node.js 22.5+** for `node:sqlite`.

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

By default the app reads `~/.claude/projects/`, `~/.codex/sessions/`,
`~/.gemini/tmp/`, and `~/.local/share/opencode/`. Point it elsewhere with
`CLAUDE_HOME`, `CODEX_HOME`, `GEMINI_HOME`, and/or `OPENCODE_DATA_DIR`:

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

The path-to-folder-tree logic has a standalone check:

```bash
node src/lib/pathtree.test.mjs
```

## Safety

- **Delete is permanent.** `fs.rm` removes the `.jsonl` file or the whole
  project folder. The confirmation dialog shows the full path first.
- **Rename never rewrites existing content** — it appends a single `ai-title`
  line and leaves every other entry intact.
- **No auth, single user.** The app expects to be reached on `localhost`.
  Don't expose it on a network.

## License

See `LICENSE`.
