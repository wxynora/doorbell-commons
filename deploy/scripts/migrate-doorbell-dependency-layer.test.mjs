import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./migrate-doorbell-dependency-layer.sh", import.meta.url),
  "utf8",
);

test("dependency migration moves the existing Linux layer without npm or a rebuild", () => {
  assert.match(source, /mv "\$\{RUNTIME_DIRECTORY\}\/node_modules"/u);
  assert.match(source, /DEPENDENCY_DIRECTORY="\/opt\/doorbell-commons-deps"/u);
  assert.match(source, /cmp --silent/u);
  assert.doesNotMatch(source, /\b(?:npm|npx|tsc|vite|docker|podman)\b/u);
  assert.doesNotMatch(source, /cp -a .*node_modules/u);
});

test("dependency migration holds the deployment lock before stopping Main", () => {
  const lock = source.indexOf("flock --nonblock 9");
  const stop = source.search(/systemctl stop "\$\{SERVICE_NAME\}"/u);
  assert.ok(lock >= 0 && lock < stop);
});

test("dependency migration verifies absolute workspace links and rolls back before restart", () => {
  assert.match(source, /RUNTIME_DIRECTORY.*packages\/protocol/u);
  assert.match(source, /RUNTIME_DIRECTORY.*apps\/server/u);
  assert.match(source, /RUNTIME_DIRECTORY.*apps\/web/u);
  assert.match(source, /migration rolled back; persistent dependency layer was not activated/u);
  const rollback = source.indexOf("rollback()");
  const health = source.indexOf("health check did not pass after dependency migration");
  assert.ok(rollback >= 0 && rollback < health);
});

test("an already valid dependency layer is an idempotent success", () => {
  assert.match(source, /Doorbell dependency layer is already migrated/u);
  assert.match(source, /an incomplete persistent dependency layer already exists/u);
});
