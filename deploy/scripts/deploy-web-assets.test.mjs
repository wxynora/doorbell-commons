import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./deploy-doorbell-main.sh", import.meta.url), "utf8");

test("the Main release installs only the newly built web assets", () => {
  assert.doesNotMatch(source, /RUNTIME_DIRECTORY.*apps\/web\/dist\/assets|--no-clobber/);
  const buildCopy = source.search(
    /cp -a "\$\{build_directory\}\/apps\/web\/dist" "\$\{candidate_directory\}\/apps\/web\/"/,
  );
  const runtimeSwitch = source.search(/mv "\$\{RUNTIME_DIRECTORY\}" "\$\{previous_directory\}"/);
  assert.ok(buildCopy >= 0 && buildCopy < runtimeSwitch);
});

test("the Main release does not mutate the built worker to force a client reload", () => {
  assert.doesNotMatch(source, /BUILT_SERVICE_WORKER|doorbell-release:%s/);
});
