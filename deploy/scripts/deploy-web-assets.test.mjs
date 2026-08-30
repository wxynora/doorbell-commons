import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./deploy-doorbell-main.sh", import.meta.url), "utf8");

test("the Main release carries old hashed assets forward without replacing the new build", () => {
  assert.match(
    source,
    /\[\[ -d "\$\{RUNTIME_DIRECTORY\}\/apps\/web\/dist\/assets" \]\][\s\S]*?cp -a --no-clobber --[\s\S]*?"\$\{RUNTIME_DIRECTORY\}\/apps\/web\/dist\/assets\/\."[\s\S]*?"\$\{candidate_directory\}\/apps\/web\/dist\/assets\/"/,
  );
  const buildCopy = source.search(
    /cp -a "\$\{build_directory\}\/apps\/web\/dist" "\$\{candidate_directory\}\/apps\/web\/"/,
  );
  const carryForward = source.indexOf("cp -a --no-clobber --");
  const runtimeSwitch = source.search(/mv "\$\{RUNTIME_DIRECTORY\}" "\$\{previous_directory\}"/);
  assert.ok(buildCopy >= 0 && buildCopy < carryForward);
  assert.ok(carryForward < runtimeSwitch);
});
