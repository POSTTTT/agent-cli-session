"use server";

import { revalidatePath } from "next/cache";
import { deleteSession, deleteProject } from "@/lib/sessions";
import { setAlias } from "@/lib/aliases";
import {
  deleteCodexSession,
  deleteCodexProject,
  setCodexAlias,
} from "@/lib/codex";
import {
  deleteGeminiSession,
  deleteGeminiProject,
  setGeminiAlias,
} from "@/lib/gemini";
import {
  deleteOpencodeSession,
  deleteOpencodeProject,
  setOpencodeTitle,
} from "@/lib/opencode";
import { getAgent } from "@/lib/agents";

export async function deleteTarget(target: string) {
  // Registry-backed tabs (cursor-agent, grok, Muse) share one target format:
  // agent-session:<tool>:<projectId>:<sessionId>. Ids are base64url, so they
  // never contain the separator.
  if (target.startsWith("agent-session:")) {
    const [tool, projectId, sessionId] = target
      .slice("agent-session:".length)
      .split(":");
    const agent = getAgent(tool);
    if (!agent || !projectId || !sessionId) throw new Error("bad target");
    await agent.store.deleteSession(sessionId);
    revalidatePath(`/${tool}/p/${encodeURIComponent(projectId)}`);
  } else if (target.startsWith("agent-project:")) {
    const [tool, projectId] = target
      .slice("agent-project:".length)
      .split(":");
    const agent = getAgent(tool);
    if (!agent || !projectId) throw new Error("bad target");
    await agent.store.deleteProject(projectId);
    revalidatePath(`/${tool}`);
  } else if (target.startsWith("opencode-session:")) {
    const rest = target.slice("opencode-session:".length);
    const idx = rest.lastIndexOf(":");
    if (idx === -1) throw new Error("bad target");
    const projectId = rest.slice(0, idx);
    const sessionId = rest.slice(idx + 1);
    await deleteOpencodeSession(sessionId);
    revalidatePath(`/opencode/p/${encodeURIComponent(projectId)}`);
  } else if (target.startsWith("opencode-project:")) {
    const projectId = target.slice("opencode-project:".length);
    await deleteOpencodeProject(projectId);
    revalidatePath("/opencode");
  } else if (target.startsWith("gemini-session:")) {
    const rest = target.slice("gemini-session:".length);
    const idx = rest.lastIndexOf(":");
    if (idx === -1) throw new Error("bad target");
    const projectId = rest.slice(0, idx);
    const sessionId = rest.slice(idx + 1);
    await deleteGeminiSession(sessionId);
    revalidatePath(`/gemini/p/${encodeURIComponent(projectId)}`);
  } else if (target.startsWith("gemini-project:")) {
    const projectId = target.slice("gemini-project:".length);
    await deleteGeminiProject(projectId);
    revalidatePath("/gemini");
  } else if (target.startsWith("codex-session:")) {
    const rest = target.slice("codex-session:".length);
    const idx = rest.lastIndexOf(":");
    if (idx === -1) throw new Error("bad target");
    const projectId = rest.slice(0, idx);
    const sessionId = rest.slice(idx + 1);
    await deleteCodexSession(sessionId);
    revalidatePath(`/codex/p/${encodeURIComponent(projectId)}`);
  } else if (target.startsWith("codex-project:")) {
    const projectId = target.slice("codex-project:".length);
    await deleteCodexProject(projectId);
    revalidatePath("/codex");
  } else if (target.startsWith("session:")) {
    const rest = target.slice("session:".length);
    const idx = rest.lastIndexOf(":");
    if (idx === -1) throw new Error("bad target");
    const projectId = rest.slice(0, idx);
    const sessionId = rest.slice(idx + 1);
    await deleteSession(projectId, sessionId);
    revalidatePath(`/p/${encodeURIComponent(projectId)}`);
  } else if (target.startsWith("project:")) {
    const projectId = target.slice("project:".length);
    await deleteProject(projectId);
    revalidatePath("/");
  } else {
    throw new Error("unknown target");
  }
}

export async function renameSession(
  projectId: string,
  sessionId: string,
  name: string,
) {
  await setAlias(projectId, sessionId, name);
  revalidatePath(`/p/${encodeURIComponent(projectId)}`);
  revalidatePath(`/p/${encodeURIComponent(projectId)}/s/${sessionId}`);
}

export async function renameCodexSession(
  projectId: string,
  sessionId: string,
  name: string,
) {
  await setCodexAlias(sessionId, name);
  revalidatePath(`/codex/p/${encodeURIComponent(projectId)}`);
  revalidatePath(`/codex/p/${encodeURIComponent(projectId)}/s/${sessionId}`);
}

export async function renameGeminiSession(
  projectId: string,
  sessionId: string,
  name: string,
) {
  await setGeminiAlias(sessionId, name);
  revalidatePath(`/gemini/p/${encodeURIComponent(projectId)}`);
  revalidatePath(`/gemini/p/${encodeURIComponent(projectId)}/s/${sessionId}`);
}

export async function renameOpencodeSession(
  projectId: string,
  sessionId: string,
  name: string,
) {
  await setOpencodeTitle(sessionId, name);
  revalidatePath(`/opencode/p/${encodeURIComponent(projectId)}`);
  revalidatePath(`/opencode/p/${encodeURIComponent(projectId)}/s/${sessionId}`);
}

export async function renameAgentSession(
  tool: string,
  projectId: string,
  sessionId: string,
  name: string,
) {
  const agent = getAgent(tool);
  if (!agent) throw new Error("unknown agent");
  await agent.store.rename(sessionId, name);
  revalidatePath(`/${tool}/p/${encodeURIComponent(projectId)}`);
  revalidatePath(`/${tool}/p/${encodeURIComponent(projectId)}/s/${sessionId}`);
}
