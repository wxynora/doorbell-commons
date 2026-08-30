import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mergeWebAssets } from "./merge-web-assets.mjs";

const source = readFileSync(new URL("./deploy-doorbell-main.sh", import.meta.url), "utf8");

test("the Main release retains previous content-hashed assets before switching runtimes", () => {
  const buildCopy = source.search(
    /cp -a "\$\{build_directory\}\/apps\/web\/dist" "\$\{candidate_directory\}\/apps\/web\/"/,
  );
  const assetMerge = source.indexOf("merge-web-assets.mjs");
  const runtimeSwitch = source.search(/mv "\$\{RUNTIME_DIRECTORY\}" "\$\{previous_directory\}"/);
  assert.ok(assetMerge >= 0 && assetMerge < buildCopy);
  assert.ok(buildCopy < runtimeSwitch);
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

test("old lazy chunks remain available without replacing a newly built hash", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-web-assets-"));
  const previous = join(directory, "previous");
  const candidate = join(directory, "candidate");
  try {
    await Promise.all([
      mkdir(join(previous, "nested"), { recursive: true }),
      mkdir(candidate, { recursive: true }),
    ]);
    writeFileSync(join(previous, "farm-page-OLDHASH.js"), "old lazy chunk");
    writeFileSync(join(previous, "field-OLDHASH.png"), "old image");
    writeFileSync(join(previous, "nested", "tool-OLDHASH.js"), "nested old chunk");
    writeFileSync(join(previous, "shared-SAMEHASH.js"), "previous content");
    writeFileSync(join(candidate, "index-NEWHASH.js"), "new entry");
    writeFileSync(join(candidate, "shared-SAMEHASH.js"), "candidate content");

    await mergeWebAssets(previous, candidate);

    assert.equal(readFileSync(join(candidate, "farm-page-OLDHASH.js"), "utf8"), "old lazy chunk");
    assert.equal(readFileSync(join(candidate, "field-OLDHASH.png"), "utf8"), "old image");
    assert.equal(
      readFileSync(join(candidate, "nested", "tool-OLDHASH.js"), "utf8"),
      "nested old chunk",
    );
    assert.equal(readFileSync(join(candidate, "index-NEWHASH.js"), "utf8"), "new entry");
    assert.equal(readFileSync(join(candidate, "shared-SAMEHASH.js"), "utf8"), "candidate content");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
