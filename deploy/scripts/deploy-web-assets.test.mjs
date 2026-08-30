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

test("every Main release changes the built worker without changing its cache rules", () => {
  assert.match(
    source,
    /BUILT_SERVICE_WORKER="\$\{build_directory\}\/apps\/web\/dist\/service-worker\.js"/,
  );
  assert.match(source, /printf '\\n\/\/ doorbell-release:%s\\n' "\$\{TARGET_SHA\}"/);
  const webBuild = source.indexOf("npm run build -w @doorbell/web");
  const releaseMarker = source.indexOf("// doorbell-release:%s");
  const buildCopy = source.indexOf(
    `cp -a "\${build_directory}/apps/web/dist" "\${candidate_directory}/apps/web/"`,
  );
  assert.ok(webBuild >= 0 && webBuild < releaseMarker);
  assert.ok(releaseMarker < buildCopy);
});
