// node src/lib/pathtree.test.mjs   (node >= 22.6, native TS type stripping)
import assert from "node:assert/strict";
import { sepOf, buildTree, collapse, countProjects } from "./pathtree.ts";

const proj = (decodedPath) => ({
  id: decodedPath,
  decodedPath,
  sessionCount: 1,
  totalBytes: 10,
  lastModified: 1,
  firstActivity: 1,
});

// POSIX: absolute paths keep their leading "/", chains collapse with "/".
const mac = [proj("/Users/me/Desktop/GitHub/app"), proj("/Users/me/dev")];
const macSep = sepOf(mac);
assert.equal(macSep, "/");
const macTree = collapse(buildTree(mac, macSep), macSep);
const users = [...macTree.children.values()][0];
assert.equal(users.name, "Users/me");
assert.equal(countProjects(macTree), 2);
const macLeaf = [...[...users.children.values()][0].children.values()][0];
assert.equal(macLeaf.fullPath, "/Users/me/Desktop/GitHub/app");

// Windows paths still render with backslashes and no leading separator.
const win = [proj("C:\\Users\\me\\OneDrive\\GitHub\\app")];
const winSep = sepOf(win);
assert.equal(winSep, "\\");
const winTree = collapse(buildTree(win, winSep), winSep);
const drive = [...winTree.children.values()][0];
assert.equal(drive.name, "C:\\Users\\me\\OneDrive\\GitHub");
assert.equal(
  [...drive.children.values()][0].fullPath,
  "C:\\Users\\me\\OneDrive\\GitHub\\app",
);

console.log("pathtree: ok");
