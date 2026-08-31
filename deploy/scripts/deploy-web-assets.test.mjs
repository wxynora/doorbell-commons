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
const backupUnit = readFileSync(
  new URL("../systemd/doorbell-commons-backup.service", import.meta.url),
  "utf8",
);

test("the production deployer accepts a prebuilt artifact and never builds or installs packages", () => {
  assert.match(deployer, /usage: doorbell-deploy-main .* <runtime-artifact>/u);
  assert.match(deployer, /tar --extract --gzip/u);
  assert.match(deployer, /verify-doorbell-runtime-artifact\.mjs/u);
  assert.doesNotMatch(deployer, /\b(?:npm|npx|tsc|vite|docker|podman)\b/u);
  assert.doesNotMatch(deployer, /git .* archive/u);
});

test("all application builds run locally without Docker", () => {
  assert.doesNotMatch(builder, /\b(?:docker|podman)\b/u);
  assert.match(builder, /npm ci/u);
  assert.match(builder, /npm run build -w @doorbell\/protocol/u);
  assert.match(builder, /npm run build -w @doorbell\/server/u);
  assert.match(builder, /npm run build -w @doorbell\/web/u);
  assert.doesNotMatch(builder, /node_modules.*runtime_directory/u);
});

test("the publisher uploads the artifact and deployer without remote build commands", () => {
  assert.match(publisher, /build-doorbell-main-artifact\.sh/u);
  assert.match(publisher, /\/usr\/local\/sbin\/doorbell-deploy-main/u);
  assert.match(publisher, /git[\s\S]*archive[\s\S]*migrate-doorbell-dependency-layer\.sh/u);
  assert.match(publisher, /scp -- "\$\{dependency_migrator\}"/u);
  const migration = publisher.indexOf("/usr/local/sbin/doorbell-migrate-dependencies");
  const artifactInstall = publisher.indexOf("install -m 0600");
  const deployment = publisher.lastIndexOf("/usr/local/sbin/doorbell-deploy-main");
  assert.ok(migration >= 0 && migration < artifactInstall);
  assert.ok(artifactInstall < deployment);
  assert.doesNotMatch(publisher, /ssh[^\n]*(?:npm|npx|tsc|vite|docker|podman)/u);
});

test("the macOS publisher uses terminal mktemp placeholders and no archive pipe", () => {
  assert.match(
    publisher,
    /publish_directory="\$\(mktemp -d "\$\{TMPDIR:-\/tmp\}\/doorbell-main-publish\.XXXXXX"\)"/u,
  );
  assert.doesNotMatch(publisher, /mktemp[^\n]*XXXXXX\.tar\.gz/u);
  const archive = publisher.indexOf("archive --format=tar --output");
  const extraction = publisher.search(/tar --extract --file "\$\{control_archive\}"/u);
  const upload = publisher.search(/scp -- "\$\{artifact\}"/u);
  assert.ok(archive >= 0 && archive < extraction && extraction < upload);
  assert.doesNotMatch(publisher, /archive[^\n]*\|[\s\\]*tar/u);
  assert.match(publisher, /rm -rf -- "\$\{publish_directory\}"/u);
});

test("approved release resolution and old hash retention happen before the runtime switch", () => {
  const extraction = deployer.indexOf("tar --extract --gzip");
  const directoryPermission = deployer.search(/chmod 0755 "\$\{candidate_directory\}"/u);
  const releaseResolution = deployer.indexOf("resolve-approved-pwa-release.mjs");
  const assetMerge = deployer.indexOf("merge-web-assets.mjs");
  const runtimeSwitch = deployer.search(/mv "\$\{RUNTIME_DIRECTORY\}" "\$\{previous_directory\}"/u);
  assert.ok(extraction >= 0 && extraction < releaseResolution);
  assert.ok(extraction < directoryPermission && directoryPermission < releaseResolution);
  assert.ok(releaseResolution < assetMerge);
  assert.ok(assetMerge < runtimeSwitch);
});

test("the VPS links one persistent dependency layer only when the lockfile is identical", () => {
  const verification = deployer.indexOf("verify-doorbell-runtime-artifact.mjs");
  const lockComparison = deployer.indexOf("cmp --silent");
  const dependencyLink = deployer.search(
    /ln -s "\$\{DEPENDENCY_DIRECTORY\}\/node_modules" "\$\{candidate_directory\}\/node_modules"/u,
  );
  const serviceStop = deployer.lastIndexOf("systemctl stop");
  assert.ok(verification >= 0 && verification < lockComparison);
  assert.ok(lockComparison < dependencyLink && dependencyLink < serviceStop);
  assert.match(deployer, /dependency lock changed; refusing to install or build dependencies/u);
  assert.match(deployer, /persistent workspace link is invalid/u);
  assert.match(deployer, /RUNTIME_DIRECTORY.*packages\/protocol/u);
  assert.match(deployer, /RUNTIME_DIRECTORY.*apps\/server/u);
  assert.match(deployer, /RUNTIME_DIRECTORY.*apps\/web/u);
  assert.doesNotMatch(deployer, /cp -a .*node_modules/u);
});

test("deployment and cleanup share one lock and retain only the dynamic direct previous runtime", () => {
  const lock = deployer.indexOf("flock --nonblock 9");
  const candidate = deployer.indexOf('candidate_directory="$(mktemp');
  const health = deployer.indexOf("systemctl is-active --quiet");
  const cleanup = deployer.indexOf("cleanup-doorbell-release-state.mjs");
  assert.ok(lock >= 0 && lock < candidate);
  assert.ok(health >= 0 && health < cleanup);
  assert.match(deployer, /ionice -c3 nice -n 19 node/u);
  assert.match(deployer, /--after-deploy "\$\{previous_directory\}"/u);
  assert.match(deployer, /post-release cleanup failed; do not retry the deployment/u);
  assert.match(builder, /cleanup-doorbell-release-state\.mjs/u);
  assert.match(backupUnit, /cleanup-doorbell-release-state\.mjs --daily-only/u);
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
