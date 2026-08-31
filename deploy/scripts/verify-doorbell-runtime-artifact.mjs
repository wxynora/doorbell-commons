#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

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
  "deploy/scripts/merge-web-assets.mjs",
  "deploy/scripts/resolve-approved-pwa-release.mjs",
  "deploy/scripts/restore-community-database.mjs",
  "deploy/scripts/verify-doorbell-runtime-artifact.mjs",
];

async function requirePath(root, relativePath) {
  try {
    await stat(join(root, relativePath));
  } catch {
    throw new Error(`Runtime artifact is missing ${relativePath}`);
  }
}

export async function verifyDoorbellRuntimeArtifact(rootDirectory, expectedSha, runtime = process) {
  const root = resolve(rootDirectory);
  if (!/^[0-9a-f]{40}$/u.test(expectedSha)) {
    throw new Error("Expected source SHA is invalid");
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, ".doorbell-runtime-artifact.json"), "utf8"));
  } catch {
    throw new Error("Runtime artifact manifest is missing or invalid");
  }

  const nodeMajor = Number.parseInt(runtime.versions.node.split(".")[0] ?? "", 10);
  if (
    manifest?.schema !== 2 ||
    manifest.source_sha !== expectedSha ||
    manifest.node_major !== nodeMajor ||
    manifest.dependency_mode !== "reuse-exact-lock"
  ) {
    throw new Error("Runtime artifact target does not match this release host");
  }

  const releaseSha = (await readFile(join(root, ".doorbell-release-sha"), "utf8")).trim();
  if (releaseSha !== expectedSha) {
    throw new Error("Runtime artifact release marker does not match requested SHA");
  }

  await Promise.all(REQUIRED_PATHS.map((path) => requirePath(root, path)));
}

async function main() {
  const [rootDirectory, expectedSha] = process.argv.slice(2);
  if (!rootDirectory || !expectedSha) {
    throw new Error(
      "Usage: verify-doorbell-runtime-artifact <runtime-directory> <40-character-main-sha>",
    );
  }
  await verifyDoorbellRuntimeArtifact(rootDirectory, expectedSha);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
