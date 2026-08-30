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

test("the Main release advances only distinct Web builds before installing assets", () => {
  assert.doesNotMatch(source, /TARGET_SHA.*service-worker|doorbell-release:%s/);
  const webBuild = source.indexOf("npm run build -w @doorbell/web");
  const releaseResolution = source.indexOf("resolve-approved-pwa-release.mjs");
  const buildCopy = source.indexOf(
    `cp -a "\${build_directory}/apps/web/dist" "\${candidate_directory}/apps/web/"`,
  );
  assert.ok(webBuild >= 0 && webBuild < releaseResolution);
  assert.ok(releaseResolution < buildCopy);
});
