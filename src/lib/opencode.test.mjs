// node src/lib/opencode.test.mjs   (node >= 22.6, native TS type stripping)
// Builds a throwaway DB with opencode's schema, then runs the reader over it.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-test-"));
process.env.OPENCODE_DATA_DIR = dir;

const db = new DatabaseSync(path.join(dir, "opencode.db"));
db.exec(`
  create table session (
    id text primary key, project_id text not null, slug text not null,
    directory text not null, title text not null, version text not null,
    model text, agent text, cost real default 0 not null,
    tokens_input integer default 0 not null, tokens_output integer default 0 not null,
    time_created integer not null, time_updated integer not null);
  create table message (
    id text primary key,
    session_id text not null references session(id) on delete cascade,
    time_created integer not null, time_updated integer not null, data text not null);
  create table part (
    id text primary key,
    message_id text not null references message(id) on delete cascade,
    session_id text not null references session(id) on delete cascade,
    time_created integer not null, time_updated integer not null, data text not null);
`);

const session = (id, directory, title, t) =>
  db
    .prepare(
      `insert into session (id, project_id, slug, directory, title, version, model,
        agent, tokens_input, tokens_output, time_created, time_updated)
       values (?, 'global', 'slug', ?, ?, '1.0.0',
        '{"id":"claude-opus-5","providerID":"anthropic"}', 'build', 100, 20, ?, ?)`,
    )
    .run(id, directory, title, t, t);

const message = (id, sessionId, role, t) =>
  db
    .prepare(
      "insert into message (id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?)",
    )
    .run(id, sessionId, t, t, JSON.stringify({ role }));

const part = (id, messageId, sessionId, data, t) =>
  db
    .prepare(
      "insert into part (id, message_id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)",
    )
    .run(id, messageId, sessionId, t, t, JSON.stringify(data));

session("ses_a", "/Users/me/app", "First chat", 1000);
session("ses_b", "/Users/me/app", "Second chat", 2000);
session("ses_c", "/Users/me/other", "Elsewhere", 3000);

message("msg_1", "ses_a", "user", 1001);
part("prt_1", "msg_1", "ses_a", { type: "text", text: "build me a parser" }, 1001);
message("msg_2", "ses_a", "assistant", 1002);
part("prt_2", "msg_2", "ses_a", { type: "step-start" }, 1002);
part("prt_3", "msg_2", "ses_a", { type: "reasoning", text: "thinking hard" }, 1002);
part(
  "prt_4",
  "msg_2",
  "ses_a",
  {
    type: "tool",
    tool: "bash",
    callID: "call_1",
    state: { status: "completed", input: { command: "ls" }, output: "a.txt" },
  },
  1002,
);
part("prt_5", "msg_2", "ses_a", { type: "text", text: "done" }, 1002);
message("msg_3", "ses_c", "user", 3001);
part("prt_6", "msg_3", "ses_c", { type: "text", text: "100% unrelated" }, 3001);
db.close();

const oc = await import("./opencode.ts");

// Projects group by the session's recorded directory, newest first.
const projects = await oc.listOpencodeProjects();
assert.deepEqual(
  projects.map((p) => p.decodedPath),
  ["/Users/me/other", "/Users/me/app"],
);
const app = projects.find((p) => p.decodedPath === "/Users/me/app");
assert.equal(app.sessionCount, 2);
assert.equal(app.lastModified, 2000);
assert.equal(app.firstActivity, 1000);
assert.ok(app.totalBytes > 0);

// Sessions carry title, token counts, a flattened model name, first prompt.
const sessions = await oc.listOpencodeSessions(app.id);
assert.deepEqual(
  sessions.map((s) => s.sessionId),
  ["ses_b", "ses_a"],
);
const a = sessions.find((s) => s.sessionId === "ses_a");
assert.equal(a.aiTitle, "First chat");
assert.equal(a.model, "anthropic/claude-opus-5");
assert.equal(a.messageCount, 2);
assert.equal(a.inputTokens, 100);
assert.equal(a.firstUserPrompt, "build me a parser");

// Transcript: parts become entries in order; step-start stays "raw"; a tool
// part expands into a call plus its output.
const entries = await oc.readOpencodeTranscript("ses_a");
assert.deepEqual(
  entries.map((e) => e.kind),
  ["user", "raw", "reasoning", "tool_call", "tool_output", "agent"],
);
assert.equal(entries[3].toolName, "bash");
assert.equal(entries[4].text, "a.txt");
assert.equal(entries[5].text, "done");

// Search matches part text, one result per session, and treats LIKE
// wildcards in the query as literals.
const hits = await oc.searchOpencodeSessions("PARSER");
assert.deepEqual(
  hits.map((h) => h.sessionId),
  ["ses_a"],
);
assert.equal((await oc.searchOpencodeSessions("100%")).length, 1);
assert.equal((await oc.searchOpencodeSessions("1_0%")).length, 0);

// Rename writes through to session.title (what the opencode TUI reads).
await oc.setOpencodeTitle("ses_a", "  renamed  ");
assert.equal(await oc.getOpencodeTitle("ses_a"), "renamed");

// Deleting a session takes its messages and parts with it.
await oc.deleteOpencodeSession("ses_a");
assert.equal((await oc.readOpencodeTranscript("ses_a")).length, 0);
assert.equal((await oc.listOpencodeSessions(app.id)).length, 1);

// Deleting a project drops every session in that directory.
await oc.deleteOpencodeProject(app.id);
const after = await oc.listOpencodeProjects();
assert.deepEqual(
  after.map((p) => p.decodedPath),
  ["/Users/me/other"],
);

const stats = await oc.computeOpencodeStats();
assert.equal(stats.projects, 1);
assert.equal(stats.sessions, 1);
assert.equal(stats.totalInputTokens, 100);

// A missing database reads as empty rather than throwing.
fs.rmSync(dir, { recursive: true, force: true });
assert.deepEqual(await oc.listOpencodeProjects(), []);
assert.deepEqual(await oc.readOpencodeTranscript("ses_c"), []);

console.log("opencode: ok");
