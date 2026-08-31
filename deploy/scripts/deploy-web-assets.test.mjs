import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mergeWebAssets } from "./merge-web-assets.mjs";

const deployer = readFileSync(new URL("./deploy-doorbell-main.sh", import.meta.url), "utf8");
const builder = readFileSync(new URL("./build-doorbell-main-artifact.sh", import.meta.url), "utf8");
const publisher = readFileSync(new URL("./publish-doorbell-main.sh", import.meta.url), "utf8");

test("the production deployer accepts a prebuilt artifact and never builds or installs packages", () => {
  assert.match(deployer, /usage: doorbell-deploy-main .* <runtime-artifact>/u);
  assert.match(deployer, /tar --extract --gzip/u);
  assert.match(deployer, /verify-doorbell-runtime-artifact\.mjs/u);
  assert.doesNotMatch(deployer, /\b(?:npm|npx|tsc|vite|docker|podman)\b/u);
  assert.doesNotMatch(deployer, /git .* archive/u);
});

test("Linux dependency installation and all builds live only in the local Docker builder", () => {
  assert.match(builder, /BUILD_PLATFORM="linux\/amd64"/u);
  assert.match(builder, /docker run --rm --platform/u);
  assert.match(builder, /npm ci/u);
  assert.match(builder, /npm run build -w @doorbell\/protocol/u);
  assert.match(builder, /npm run build -w @doorbell\/server/u);
  assert.match(builder, /npm run build -w @doorbell\/web/u);
  assert.match(builder, /npm prune --omit=dev/u);
  assert.match(builder, /new Database\(":memory:"\)/u);
});

test("the publisher uploads the artifact and deployer without remote build commands", () => {
  assert.match(publisher, /build-doorbell-main-artifact\.sh/u);
  assert.match(publisher, /\/usr\/local\/sbin\/doorbell-deploy-main/u);
  assert.doesNotMatch(publisher, /ssh[^\n]*(?:npm|npx|tsc|vite|docker|podman)/u);
});

test("approved release resolution and old hash retention happen before the runtime switch", () => {
  const extraction = deployer.indexOf("tar --extract --gzip");
  const releaseResolution = deployer.indexOf("resolve-approved-pwa-release.mjs");
  const assetMerge = deployer.indexOf("merge-web-assets.mjs");
  const runtimeSwitch = deployer.search(/mv "\$\{RUNTIME_DIRECTORY\}" "\$\{previous_directory\}"/u);
  assert.ok(extraction >= 0 && extraction < releaseResolution);
  assert.ok(releaseResolution < assetMerge);
  assert.ok(assetMerge < runtimeSwitch);
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
