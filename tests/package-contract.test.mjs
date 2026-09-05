import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes a version-open workspace peer contract", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(new Set(Object.values(packageJson.peerDependencies)), new Set(["*"]));
});

test("client delegates canonical deletion to Maintenance and does not ship native delete/worktree paths", async () => {
  const source = await readFile(new URL("../src/client.js", import.meta.url), "utf8");
  const host = await readFile(new URL("../lib/index.js", import.meta.url), "utf8");
  const built = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.ok(built.includes(source.split("export const inject")[0].trim()));
  for (const forbidden of ["__dshSessionManager", "createPermanentWorktree", "session.rename(", "sessions.fork(", "workspaces.delete("]) {
    assert.ok(!built.includes(forbidden), forbidden);
  }
  assert.ok(!host.includes("webServer"));
  assert.ok(!host.includes("workspaceRegistry"));
  assert.ok(built.includes("operation: 'delete-session'"));
  assert.ok(!built.includes("window.open("));
  assert.ok(built.includes("ctx.uiWorkspace.archiveSession(id)"));
});
