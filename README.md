# claude-code-sessions

A local web app for browsing, searching, and managing the session logs that
pile up from your coding agents — **Claude Code** (`~/.claude/projects/`),
**Codex** (`~/.codex/sessions/`), and **Gemini CLI** (`~/.gemini/tmp/`).
Everything runs on your machine. No data leaves your computer; no API calls
are made.

The header has three tabs — **Claude**, **Codex**, and **Gemini** — each with
the same Projects / Search / Stats functionality.

---

## What it does

### Browse

- **Projects page (`/`)** — every folder under `~/.claude/projects/`, with the
  *real* directory path (resolved by reading the `cwd` field inside each
  session, not the lossy dash-encoded folder name). Two views, toggled with a
  pill at the top of the page:
  - **Table** — sortable columns: Path, Sessions, Size, Age, Last activity.
    Click any column header to sort; click again to flip direction.
  - **Tree** — projects nested under their parent directories. Single-child
    folder chains are collapsed visually (`/Users/me/Desktop/GitHub` becomes
    one row instead of three; likewise `C:\Users\me\OneDrive` on Windows). Folders show aggregated session count, size,
    and most recent activity.
  - Your view choice is remembered in `localStorage`.
- **Sessions page (`/p/[projectId]`)** — every session in one project. Each
  row shows the title (alias → ai-title → first user prompt), message count,
  model used, git branch, total input/output tokens, file size, and the
  session UUID.
- **Transcript viewer (`/p/[projectId]/s/[sessionId]`)** — renders the JSONL
  as readable messages.
  - Markdown formatting (bold, italic, lists, fenced code blocks, inline
    code, links).
  - Slash commands (`/clear`, `/model`, etc.) and their stdout are merged
    into a single compact block, terminal-style.
  - Tool calls are merged with their matching tool results in one card. Long
    results are collapsed by default with a `▶` toggle and a one-line preview.
  - "Thinking" blocks are collapsible.
  - Filter pills: **messages** (default — hides meta/tool-result chatter),
    **tools** (only entries that involve a tool call), **all** (raw).
  - Sticky page header + sticky filter bar so navigation stays accessible in
    long sessions.
  - Floating ↑/↓ buttons to jump to top/bottom.

### Search (`/search`)

Case-insensitive substring scan across every line of every `.jsonl` in
`~/.claude/projects/`. Matches anywhere: user prompts, assistant replies,
tool names, file paths, error messages, session UUIDs, git branches. Each
result links to the matching session.

### Stats (`/stats`)

Five summary tiles: projects, sessions, total disk size, total input tokens,
total output tokens — aggregated across every session log on disk.

### Manage

- **Rename a session** — give any session a custom display name.
  - Stored in `~/.claude/projects/_aliases.json` (a sidecar file the app
    owns; Claude Code ignores it).
  - **Also mirrored into the `.jsonl`** as a new `ai-title` line, so
    Claude Code's terminal `/resume` picker shows the same name. The
    `<uuid>.jsonl` filename and the session UUID are never changed —
    Claude Code's internal references stay intact.
  - Click **Rename** next to any session title to edit inline. Empty name
    removes the alias and lets the title fall back to the auto-generated
    one.
- **Delete a session or whole project** — confirmation prompt first, then
  `fs.rm` with retries (handles transient Windows file locks from AV /
  OneDrive sync).

### Codex tab (`/codex`)

The **Codex** tab mirrors every feature above for OpenAI Codex sessions read
from `~/.codex/sessions/`. A few format differences are handled transparently:

- Codex stores sessions in a flat date tree
  (`sessions/YYYY/MM/DD/rollout-*.jsonl`), not per-project folders, so sessions
  are **grouped into projects by their real `cwd`** (read from each rollout's
  `session_meta` line).
- The transcript viewer understands Codex's event stream: user messages, agent
  replies (markdown), collapsible reasoning, and `function_call` cards merged
  with their output. Same **messages / tools / all** filter pills.
- **Rename** is stored in a sidecar (`~/.codex/sessions/_codex_aliases.json`).
  Codex has no `/resume` title to mirror into, so nothing is written back into
  the rollout `.jsonl`.
- Stats and search work the same, scoped to `~/.codex/sessions/`.

### Gemini tab (`/gemini`)

The **Gemini** tab does the same for Gemini CLI chats under `~/.gemini/tmp/`:

- Gemini already stores one folder per project
  (`tmp/<project>/chats/session-*.jsonl`), and `~/.gemini/projects.json` maps
  each folder to its **real working directory** — which the app uses as the
  project path.
- Each chat log is an append journal (a header line, `$set` patches, then one
  JSON object per message). The transcript viewer reconstructs the
  conversation from it: user prompts, Gemini replies (markdown), collapsible
  **thoughts** (reasoning), and `toolCalls` merged with their results.
- **Context tokens** are reported instead of input tokens — Gemini records the
  cumulative context size per turn, so the app shows the peak rather than a
  misleading sum. Output tokens are summed normally.
- **Rename** uses a sidecar (`~/.gemini/_gemini_aliases.json`); nothing is
  written back into the chat log.

---

## Setup

### 1. Prerequisites

- **Node.js 20+**. Check with `node -v`.
- An existing `~/.claude/projects/` directory (it appears the first time you
  run Claude Code).

### 2. Get the code

```bash
git clone https://github.com/POSTTTT/claude-code-sessions
cd claude-code-sessions
```

### 3. Install dependencies

```bash
npm install
```

> **OneDrive caveat (Windows only).** If you cloned this repo into a OneDrive-synced
> path like `C:\Users\<you>\OneDrive\Documents\GitHub\…`, `npm install` may
> hang silently — OneDrive's file-on-demand sync intercepts every small write
> npm makes. If you see no progress after a couple of minutes:
>
> 1. Right-click the OneDrive tray icon → **Pause syncing → 2 hours**, then
>    retry `npm install`, **or**
> 2. Move the repo to a non-synced path (e.g. `C:\dev\claude-code-sessions`)
>    and install there.

### 4. Register the launcher (one time)

```bash
npm link
```

This installs a global command called `claude-sessions` that points at this
project's copy. You only need to do this once per machine. (Equivalent
alternative: `npm install -g .` from the project folder.)

### 5. Launch from anywhere

```bash
claude-sessions
```

That's it — no `cd`, no `npm run`. Open the URL the server prints (defaults
to <http://localhost:3000>).

Flags:

The browser opens automatically as soon as the server is ready. Pass
`--no-open` to skip that.

| Command                     | What it does                                            |
| --------------------------- | ------------------------------------------------------- |
| `claude-sessions`           | Start the **dev** server + auto-open browser (default)  |
| `claude-sessions --prod`    | Start the **production** server (requires a prior build) |
| `claude-sessions --build`   | Run `next build`, then start the production server      |
| `claude-sessions --no-open` | Don't open the browser                                  |
| `claude-sessions --help`    | Show the help and the project path                      |

To stop the server: `Ctrl+C` in the terminal where it's running.

### 6. Pointing at a different `.claude` directory (optional)

By default the app reads from `~/.claude/projects/` (Claude),
`~/.codex/sessions/` (Codex), and `~/.gemini/tmp/` (Gemini). To point at
different locations, set the `CLAUDE_HOME`, `CODEX_HOME`, and/or `GEMINI_HOME`
environment variables before starting the server:

```bash
# macOS / Linux
CLAUDE_HOME=/Volumes/backups/.claude claude-sessions
```

```powershell
# Windows
$env:CLAUDE_HOME = "D:\backups\.claude"
claude-sessions
```

---

## Project layout

```
bin/
  claude-sessions.mjs               global launcher (npm bin)
src/
  app/
    page.tsx                          Claude projects list
    p/[projectId]/page.tsx            sessions in a project
    p/[projectId]/s/[sessionId]/      session transcript
    search/page.tsx                   content search
    stats/page.tsx                    summary tiles
    codex/                            Codex tab — mirrors the routes above
    gemini/                           Gemini tab — mirrors the routes above
      page.tsx                        projects (from ~/.gemini/projects.json)
      p/[projectId]/page.tsx          sessions in a project
      p/[projectId]/s/[sessionId]/    session transcript
      search/page.tsx, stats/page.tsx search + stats
    actions.ts                        server actions (delete, rename — all tabs)
    layout.tsx, globals.css           dark theme + <SiteHeader/>
  components/
    SiteHeader.tsx                    3-tab header (Claude / Codex / Gemini)
    ProjectsView.tsx                  table/tree toggle (client, basePath-aware)
    ProjectsTable.tsx                 sortable table (client)
    ProjectsTree.tsx                  directory tree (client)
    SessionTitle.tsx                  inline rename (claude/codex/gemini)
    DeleteButton.tsx                  delete w/ confirm (client)
    TranscriptView.tsx                Claude transcript renderer + filters
    AgentTranscriptView.tsx           shared Codex/Gemini transcript renderer
    Markdown.tsx                      lightweight markdown renderer
  lib/
    paths.ts                          CLAUDE/CODEX/GEMINI_HOME + id encode/decode
    sessions.ts                       Claude: list/read/search/delete + stats
    codex.ts                          Codex: list/read/search/delete + stats
    gemini.ts                         Gemini: list/read/search/delete + stats
    pathtree.ts                       path → folder tree (+ pathtree.test.mjs)
    transcript.ts                     shared AgentEntry type
    aliases.ts                        Claude rename sidecar + ai-title mirror
    format.ts                         bytes / relative / duration / number
```

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript, Tailwind CSS
- Server-side filesystem access via Server Actions and one Route Handler
- No database, no auth — runs locally on `localhost` only

## Safety

- **Delete is permanent.** The app uses `fs.rm` to remove the `.jsonl` file
  (or the whole project folder). A confirmation dialog shows the full path
  before anything is removed.
- **Rename never touches the `.jsonl` content** — only appends a single
  `ai-title` line. Existing entries are preserved.
- **The app is single-user, no auth.** It expects to be reached on
  `localhost` only. Don't expose it on a network.

## License

See `LICENSE`.
