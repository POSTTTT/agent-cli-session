#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

const args = process.argv.slice(2);
const wantProd = args.includes("--prod") || args.includes("-p");
const wantBuild = args.includes("--build") || args.includes("-b");
const wantHelp = args.includes("--help") || args.includes("-h");
const noOpen = args.includes("--no-open");
const port = Number(process.env.PORT) || 3000;
const url = `http://localhost:${port}`;

if (wantHelp) {
  console.log(`
agent-sessions — launch the Agent Sessions web app

Usage:
  agent-sessions             Start the dev server (default)
  agent-sessions --prod      Start the production server (requires a build)
  agent-sessions --build     Build, then start the production server
  agent-sessions --no-open   Don't auto-open the browser
  agent-sessions --help      Show this help

Browser opens automatically at ${url} once the server is ready.
Project root: ${projectRoot}
`);
  process.exit(0);
}

const nodeModulesPresent = fs.existsSync(
  path.join(projectRoot, "node_modules", "next", "package.json"),
);
if (!nodeModulesPresent) {
  console.error(
    `agent-sessions: dependencies are not installed.\n` +
      `Run "npm install" inside ${projectRoot} first.`,
  );
  process.exit(1);
}

async function waitForReady(targetUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 1500);
      const res = await fetch(targetUrl, { signal: ac.signal });
      clearTimeout(t);
      // Any HTTP response means the server is listening, even a 404 or 500.
      if (res.status < 600) return true;
    } catch {
      // ECONNREFUSED / aborted — server not up yet.
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function openBrowser(targetUrl) {
  const platform = process.platform;
  if (platform === "win32") {
    // The empty "" is the window title for `start`, required because the URL
    // is quoted.
    spawn(`start "" "${targetUrl}"`, {
      shell: true,
      stdio: "ignore",
      detached: true,
    }).unref();
  } else if (platform === "darwin") {
    spawn("open", [targetUrl], { stdio: "ignore", detached: true }).unref();
  } else {
    spawn("xdg-open", [targetUrl], { stdio: "ignore", detached: true }).unref();
  }
}

function run(script) {
  return new Promise((resolve, reject) => {
    // shell: true is required on Windows so that npm.cmd (a batch file) is
    // invoked through cmd.exe; without it, spawn returns immediately with no
    // output and no error.
    const child = spawn(`npm run ${script}`, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", (err) => {
      console.error(`agent-sessions: failed to start npm — ${err.message}`);
      reject(1);
    });
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolve(undefined);
      else reject(code);
    });
  });
}

try {
  if (wantBuild) {
    console.log(`agent-sessions: building in ${projectRoot} …`);
    await run("build");
  }
  const script = wantProd || wantBuild ? "start" : "dev";
  console.log(`agent-sessions: starting "npm run ${script}" in ${projectRoot}`);
  if (!noOpen) {
    // Fire-and-forget: poll the URL and open the browser once it answers.
    waitForReady(url).then((ready) => {
      if (ready) {
        console.log(`agent-sessions: opening ${url} in your browser`);
        openBrowser(url);
      }
    });
  }
  await run(script);
} catch (code) {
  process.exit(typeof code === "number" ? code : 1);
}
