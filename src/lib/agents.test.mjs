// node src/lib/agents.test.mjs   (node >= 22.6, native TS type stripping)
// Builds a throwaway store for each registry agent — cursor-agent, grok and
// Muse Code — in the shape the real CLIs write, then runs the readers over it.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-test-"));
process.env.CURSOR_HOME = path.join(root, "cursor");
process.env.GROK_HOME = path.join(root, "grok");
process.env.MUSE_DATA_DIR = path.join(root, "muse");

const id = (value) => Buffer.from(value, "utf8").toString("base64url");
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const jsonl = (file, records) =>
  write(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");

// --- cursor-agent -----------------------------------------------------------

const chats = path.join(process.env.CURSOR_HOME, "chats");

function cursorSession(hash, uuid, cwd, title, messages) {
  const dir = path.join(chats, hash, uuid);
  write(
    path.join(dir, "meta.json"),
    JSON.stringify({ cwd, title, createdAtMs: 1000, updatedAtMs: 2000 }),
  );
  const db = new DatabaseSync(path.join(dir, "store.db"));
  db.exec(
    "create table blobs (id text primary key, data blob); create table meta (key text primary key, value text)",
  );
  db.prepare("insert into meta values ('0', ?)").run(
    Buffer.from(
      JSON.stringify({ name: title, lastUsedModel: "composer-2.5" }),
      "utf8",
    ).toString("hex"),
  );
  const insert = db.prepare("insert into blobs values (?, ?)");
  // A protobuf tree node shares the table with the messages and must be
  // skipped rather than parsed.
  insert.run("tree", Buffer.from([0x0a, 0x20, 0x01, 0x02]));
  messages.forEach((m, i) =>
    insert.run(`b${i}`, Buffer.from(JSON.stringify(m), "utf8")),
  );
  db.close();
}

cursorSession("h1", "u1", "/w/app", "First chat", [
  { role: "system", content: "you are an agent" },
  { role: "user", content: "<user_info>machine details</user_info>" },
  {
    role: "user",
    content: [{ type: "text", text: "<user_query>\nbuild a parser\n</user_query>" }],
  },
  {
    role: "assistant",
    content: [
      { type: "redacted-reasoning", data: "opaque" },
      { type: "text", text: "on it" },
      { type: "tool-call", toolCallId: "c1", toolName: "Read", args: { path: "a.ts" } },
    ],
  },
  {
    role: "tool",
    content: [
      { type: "tool-result", toolCallId: "c1", toolName: "Read", result: "file body" },
    ],
  },
]);
cursorSession("h1", "u2", "/w/other", "Elsewhere", [
  { role: "user", content: [{ type: "text", text: "<user_query>\nunrelated\n</user_query>" }] },
]);

const { cursorStore } = await import("./cursor.ts");

const cursorProjects = await cursorStore.listProjects();
assert.deepEqual(cursorProjects.map((p) => p.decodedPath).sort(), [
  "/w/app",
  "/w/other",
]);

const cursorSessions = await cursorStore.listSessions(id("/w/app"));
assert.equal(cursorSessions.length, 1);
assert.equal(cursorSessions[0].aiTitle, "First chat");
assert.equal(cursorSessions[0].model, "composer-2.5");
assert.equal(cursorSessions[0].firstUserPrompt, "build a parser");
// system and tool turns don't count as messages; the two user turns and the
// assistant turn do.
assert.equal(cursorSessions[0].messageCount, 3);

const cursorEntries = await cursorStore.readTranscript(id("h1/u1"));
assert.deepEqual(
  cursorEntries.map((e) => e.kind),
  ["meta", "raw", "user", "reasoning", "agent", "tool_call", "tool_output"],
);
assert.equal(cursorEntries[2].text, "build a parser");
assert.equal(cursorEntries[5].toolName, "Read");
assert.equal(cursorEntries[6].text, "file body");

assert.deepEqual(
  (await cursorStore.search("PARSER")).map((h) => h.sessionId),
  [id("h1/u1")],
);
assert.equal((await cursorStore.search("nothing here")).length, 0);

await cursorStore.rename(id("h1/u1"), "  my chat  ");
assert.deepEqual(await cursorStore.getTitles(id("h1/u1")), {
  alias: "my chat",
  aiTitle: "First chat",
});

// --- grok -------------------------------------------------------------------

const grokDir = path.join(
  process.env.GROK_HOME,
  "sessions",
  encodeURIComponent("/w/app"),
  "s1",
);
write(
  path.join(grokDir, "summary.json"),
  JSON.stringify({
    info: { id: "s1", cwd: "/w/app" },
    created_at: "2026-09-01T00:00:00Z",
    last_active_at: "2026-09-02T00:00:00Z",
    num_chat_messages: 4,
    current_model_id: "grok-4.6",
    head_branch: "main",
  }),
);
jsonl(path.join(grokDir, "chat_history.jsonl"), [
  { type: "system", content: "you are grok" },
  { type: "user", content: [{ type: "text", text: "<skills>…</skills>" }], synthetic_reason: "skills" },
  { type: "user", content: [{ type: "text", text: "<user_query>\nfix the build\n</user_query>" }] },
  {
    type: "assistant",
    content: "looking now",
    reasoning_content: "check the config first",
    tool_calls: [
      { id: "t1", type: "function", function: { name: "shell", arguments: '{"cmd":"make"}' } },
    ],
  },
  { type: "tool", tool_call_id: "t1", content: "build ok" },
]);
jsonl(path.join(grokDir, "updates.jsonl"), [
  { method: "_x.ai/session/update", params: { update: { sessionUpdate: "hook_execution" } } },
  {
    method: "_x.ai/session/update",
    params: { update: { sessionUpdate: "usage_update", usage: { inputTokens: 120, outputTokens: 30 } } },
  },
  {
    method: "_x.ai/session/update",
    params: { update: { sessionUpdate: "usage_update", usage: { inputTokens: 900, outputTokens: 45 } } },
  },
]);

const { grokStore } = await import("./grok.ts");

const grokProjects = await grokStore.listProjects();
assert.deepEqual(
  grokProjects.map((p) => p.decodedPath),
  ["/w/app"],
);

const grokSessions = await grokStore.listSessions(id("/w/app"));
assert.equal(grokSessions.length, 1);
assert.equal(grokSessions[0].model, "grok-4.6");
assert.equal(grokSessions[0].gitBranch, "main");
assert.equal(grokSessions[0].firstUserPrompt, "fix the build");
// Usage is reported as a running total, so the session total is the largest.
assert.equal(grokSessions[0].inputTokens, 900);
assert.equal(grokSessions[0].outputTokens, 45);

const grokEntries = await grokStore.readTranscript(
  id(`${encodeURIComponent("/w/app")}/s1`),
);
assert.deepEqual(
  grokEntries.map((e) => e.kind),
  ["meta", "raw", "user", "reasoning", "agent", "tool_call", "tool_output"],
);
assert.equal(grokEntries[5].toolName, "shell");
assert.equal(grokEntries[5].text, '{"cmd":"make"}');
assert.equal(grokEntries[6].text, "build ok");

assert.equal((await grokStore.search("FIX THE BUILD")).length, 1);

// --- Muse Code --------------------------------------------------------------

const museLog = path.join(
  process.env.MUSE_DATA_DIR,
  "sessions/2026/09/07/m1/session.jsonl",
);
const run = (sequence, event) => ({
  sequence,
  recorded_at: sequence * 1_000_000,
  payload_type: "runtime.session",
  payload: { kind: "run", run_id: "r1", event },
});
jsonl(museLog, [
  // A retained_frame batch carries its records as JSON strings.
  {
    retained_frame: "session_permission_transaction",
    children: [
      {
        child_index: 0,
        record_json: JSON.stringify({
          sequence: 1,
          recorded_at: 1_000_000,
          payload_type: "runtime.session.metadata",
          payload: { kind: "metadata", record: { workspace_root: "/w/app", model_id: "muse-1" } },
        }),
      },
    ],
  },
  {
    sequence: 2,
    recorded_at: 2_000_000,
    payload_type: "session.name.changed",
    payload: { new_name: "basalt-meteor" },
  },
  run(3, { kind: "started", prompt: "write a file" }),
  run(4, { kind: "reasoning_committed", text: "pick a path" }),
  run(5, {
    kind: "assistant_tool_calls_committed",
    tool_calls: [{ name: "write_file", call_id: "w1", args: { path: "a.txt" } }],
  }),
  run(6, { kind: "tool_result", call_id: "w1", content: "wrote a.txt" }),
  run(7, { kind: "assistant_message_committed", text: "done" }),
  run(8, { kind: "model_completed", usage: { input_tokens: 400, output_tokens: 15 } }),
  run(9, { kind: "model_completed", usage: { input_tokens: 900, output_tokens: 25 } }),
]);

const { museStore } = await import("./muse.ts");

const museProjects = await museStore.listProjects();
assert.deepEqual(
  museProjects.map((p) => p.decodedPath),
  ["/w/app"],
);

const museSessions = await museStore.listSessions(id("/w/app"));
assert.equal(museSessions.length, 1);
assert.equal(museSessions[0].aiTitle, "basalt-meteor");
assert.equal(museSessions[0].model, "muse-1");
assert.equal(museSessions[0].firstUserPrompt, "write a file");
// input_tokens is the whole prompt each call (largest wins); output accrues.
assert.equal(museSessions[0].inputTokens, 900);
assert.equal(museSessions[0].outputTokens, 40);

const museEntries = await museStore.readTranscript(id("2026/09/07/m1"));
assert.deepEqual(
  museEntries.map((e) => e.kind),
  ["user", "reasoning", "tool_call", "tool_output", "agent"],
);
assert.equal(museEntries[2].toolName, "write_file");
assert.equal(museEntries[3].text, "wrote a.txt");

const museStats = await museStore.stats();
assert.equal(museStats.projects, 1);
assert.equal(museStats.sessions, 1);
assert.equal(museStats.totalOutputTokens, 40);

// --- deletes stay inside their own store ------------------------------------

await assert.rejects(() => museStore.deleteSession(id("../../../etc")));
assert.ok(fs.existsSync(museLog));

await museStore.deleteSession(id("2026/09/07/m1"));
assert.equal((await museStore.listProjects()).length, 0);

await grokStore.deleteProject(id("/w/app"));
assert.equal((await grokStore.listProjects()).length, 0);

await cursorStore.deleteSession(id("h1/u1"));
assert.deepEqual(
  (await cursorStore.listProjects()).map((p) => p.decodedPath),
  ["/w/other"],
);

// A store that isn't there at all reads as empty rather than throwing.
fs.rmSync(root, { recursive: true, force: true });
assert.deepEqual(await cursorStore.listProjects(), []);
assert.deepEqual(await grokStore.listProjects(), []);
assert.deepEqual(await museStore.listProjects(), []);
assert.deepEqual(await museStore.readTranscript(id("2026/09/07/m1")), []);

console.log("agents: ok");
