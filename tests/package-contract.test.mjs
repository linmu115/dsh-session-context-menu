import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes a version-open workspace peer contract", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.version, "0.2.2");
  assert.deepEqual(new Set(Object.values(packageJson.peerDependencies)), new Set(["*"]));
});
