// node src/lib/codex.test.mjs   (node >= 22.6, native TS type stripping)
// Writes a rollout file in the newer `item_completed` shape, then checks the
// reader still finds the messages, the title and the transcript entries.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-test-"));
process.env.CODEX_HOME = home;
const day = path.join(home, "sessions", "2026", "09", "08");
fs.mkdirSync(day, { recursive: true });
const uuid = "01a07f02-3000-7c32-8e6c-31fa28761d1c";
const rows = [
  {
    type: "session_meta",
    payload: { id: uuid, cwd: "/tmp/proj" },
  },
  {
    type: "event_msg",
    payload: {
      type: "item_completed",
      item: { type: "UserMessage", content: [{ type: "text", text: "hello there" }] },
    },
  },
  {
    type: "event_msg",
    payload: {
      type: "item_completed",
      item: { type: "AgentMessage", content: [{ type: "Text", text: "hi back" }] },
    },
  },
  {
    type: "event_msg",
    payload: {
      type: "item_completed",
      item: { type: "Reasoning", summary_text: "thinking" },
    },
  },
];
fs.writeFileSync(
  path.join(day, `rollout-2026-09-08T12-14-04-${uuid}.jsonl`),
  rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
);

fs.writeFileSync(
  path.join(home, "external_agent_session_imports.json"),
  JSON.stringify({
    records: [{ imported_thread_id: uuid, title: "Imported title" }],
  }),
);

const { listCodexProjects, listCodexSessions, readCodexTranscript } =
  await import("./codex.ts");

const [proj] = await listCodexProjects();
assert.equal(proj.decodedPath, "/tmp/proj");

const [session] = await listCodexSessions(proj.id);
assert.equal(session.messageCount, 2);
assert.equal(session.firstUserPrompt, "hello there");
assert.equal(session.threadName, "Imported title");

const entries = await readCodexTranscript(session.sessionId);
const kinds = entries.map((e) => e.kind);
assert.deepEqual(kinds, ["meta", "user", "agent", "raw"]);
assert.equal(entries[1].text, "hello there");
assert.equal(entries[2].text, "hi back");

fs.rmSync(home, { recursive: true, force: true });
console.log("codex.test.mjs ok");
