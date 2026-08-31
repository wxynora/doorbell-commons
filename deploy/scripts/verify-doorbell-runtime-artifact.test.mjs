import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyDoorbellRuntimeArtifact } from "./verify-doorbell-runtime-artifact.mjs";

const SHA = "a".repeat(40);
const REQUIRED_PATHS = [
  "package.json",
  "package-lock.json",
  "packages/protocol/package.json",
  "packages/protocol/dist/index.js",
  "apps/server/package.json",
  "apps/server/dist/index.js",
  "apps/web/dist/index.html",
  "apps/web/dist/service-worker.js",
  "apps/web/dist/assets",
  "deploy/scripts/backup-community-database.mjs",
  "deploy/scripts/cleanup-doorbell-release-state.mjs",
  "deploy/scripts/merge-web-assets.mjs",
  "deploy/scripts/resolve-approved-pwa-release.mjs",
  "deploy/scripts/restore-community-database.mjs",
  "deploy/scripts/verify-doorbell-runtime-artifact.mjs",
];

async function runtimeFixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "doorbell-runtime-artifact-"));
  const manifest = {
    schema: 2,
    source_sha: SHA,
    node_major: 24,
    dependency_mode: "reuse-exact-lock",
    ...overrides,
  };
  writeFileSync(join(root, ".doorbell-runtime-artifact.json"), JSON.stringify(manifest));
  writeFileSync(join(root, ".doorbell-release-sha"), `${SHA}\n`);
  for (const path of REQUIRED_PATHS) {
    if (path.endsWith("/assets")) {
      await mkdir(join(root, path), { recursive: true });
      continue;
    }
    await mkdir(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "fixture");
  }
  return root;
}

const linuxNode24 = {
  platform: "linux",
  arch: "x64",
  versions: { node: "24.13.0" },
};

test("accepts a complete Node 24 application artifact for the requested SHA", async () => {
  const root = await runtimeFixture();
  try {
    await verifyDoorbellRuntimeArtifact(root, SHA, linuxNode24);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an artifact built for a different source SHA", async () => {
  const root = await runtimeFixture({ source_sha: "b".repeat(40) });
  try {
    await assert.rejects(
      verifyDoorbellRuntimeArtifact(root, SHA, linuxNode24),
      /target does not match/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an artifact with a different dependency contract", async () => {
  const root = await runtimeFixture({ dependency_mode: "bundled-native-dependencies" });
  try {
    await assert.rejects(
      verifyDoorbellRuntimeArtifact(root, SHA, linuxNode24),
      /target does not match/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an incomplete artifact before any runtime switch", async () => {
  const root = await runtimeFixture();
  rmSync(join(root, "apps/server/dist/index.js"));
  try {
    await assert.rejects(
      verifyDoorbellRuntimeArtifact(root, SHA, linuxNode24),
      /missing apps\/server\/dist\/index\.js/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an artifact that cannot perform bounded post-release cleanup", async () => {
  const root = await runtimeFixture();
  rmSync(join(root, "deploy/scripts/cleanup-doorbell-release-state.mjs"));
  try {
    await assert.rejects(
      verifyDoorbellRuntimeArtifact(root, SHA, linuxNode24),
      /missing deploy\/scripts\/cleanup-doorbell-release-state\.mjs/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
