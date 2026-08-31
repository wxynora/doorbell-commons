#!/usr/bin/env node

import { readdir, rm, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

export const DOORBELL_RELEASE_RETENTION = Object.freeze({
  previousRuntimes: 1,
  releaseBackups: 2,
  dailyBackups: 3,
});

const PREVIOUS_PREFIX = "doorbell-commons.previous-";
const FAILED_PREFIX = "doorbell-commons.failed-";
const BUILD_PREFIX = ".doorbell-commons.build.";
const CANDIDATE_PREFIX = ".doorbell-commons.candidate.";
const REMOVABLE_RUNTIME_PREFIXES = [PREVIOUS_PREFIX, FAILED_PREFIX, BUILD_PREFIX, CANDIDATE_PREFIX];

function newest(entries, keepCount) {
  return [...entries]
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name))
    .slice(0, keepCount);
}

async function directoryEntries(root) {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function removeValidated(target, parent, kind) {
  const absolute = resolve(target);
  if (dirname(absolute) !== resolve(parent)) {
    throw new Error(`Refusing ${kind} cleanup outside its exact parent`);
  }
  await rm(absolute, { recursive: true, force: false });
}

async function pruneDailyBackups(backupRoot, remove) {
  const entries = [];
  for (const entry of await readdir(backupRoot, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== ".sqlite") continue;
    const target = join(backupRoot, entry.name);
    entries.push({ name: entry.name, target, mtimeMs: (await stat(target)).mtimeMs });
  }
  const kept = new Set(
    newest(entries, DOORBELL_RELEASE_RETENTION.dailyBackups).map((entry) => entry.name),
  );
  const removals = entries.filter((entry) => !kept.has(entry.name));
  for (const entry of removals) {
    const absolute = resolve(entry.target);
    if (dirname(absolute) !== resolve(backupRoot) || extname(absolute) !== ".sqlite") {
      throw new Error("Refusing unexpected daily backup cleanup target");
    }
    await remove(absolute, { force: true });
  }
  return { kept: kept.size, removed: removals.length };
}

async function pruneReleaseBackups(backupRoot) {
  const releaseRoot = join(backupRoot, "releases");
  const entries = [];
  for (const name of await directoryEntries(releaseRoot)) {
    const target = join(releaseRoot, name);
    const children = await readdir(target, { withFileTypes: true });
    entries.push({
      name,
      target,
      mtimeMs: (await stat(target)).mtimeMs,
      valid: children.some((child) => child.isFile() && extname(child.name) === ".sqlite"),
    });
  }
  const validEntries = entries.filter((entry) => entry.valid);
  const kept = new Set(
    newest(validEntries, DOORBELL_RELEASE_RETENTION.releaseBackups).map((entry) => entry.name),
  );
  const removals = entries.filter((entry) => !kept.has(entry.name));
  for (const entry of removals) {
    await removeValidated(entry.target, releaseRoot, "release backup");
  }
  return { kept: kept.size, removed: removals.length };
}

async function pruneRuntimeDirectories(runtimeRoot, preservedPreviousRuntime) {
  const preserved = resolve(preservedPreviousRuntime);
  if (
    dirname(preserved) !== resolve(runtimeRoot) ||
    !preserved.slice(preserved.lastIndexOf("/") + 1).startsWith(PREVIOUS_PREFIX)
  ) {
    throw new Error("The preserved previous runtime is outside the exact runtime root");
  }
  const preservedState = await stat(preserved);
  if (!preservedState.isDirectory()) {
    throw new Error("The preserved previous runtime is not a directory");
  }

  const counts = { previous: 0, failed: 0, build: 0, candidate: 0 };
  for (const name of await directoryEntries(runtimeRoot)) {
    if (!REMOVABLE_RUNTIME_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    const target = resolve(runtimeRoot, name);
    if (target === preserved) continue;
    if (name.startsWith(PREVIOUS_PREFIX)) counts.previous += 1;
    else if (name.startsWith(FAILED_PREFIX)) counts.failed += 1;
    else if (name.startsWith(BUILD_PREFIX)) counts.build += 1;
    else if (name.startsWith(CANDIDATE_PREFIX)) counts.candidate += 1;
    await removeValidated(target, runtimeRoot, "runtime");
  }
  return counts;
}

export async function cleanupDoorbellReleaseState(options) {
  const runtimeRoot = resolve(options.runtimeRoot);
  const backupRoot = resolve(options.backupRoot);
  const remove = options.remove ?? rm;
  const daily = await pruneDailyBackups(backupRoot, remove);
  if (options.mode === "daily-only") {
    return { mode: options.mode, daily };
  }
  if (options.mode !== "after-deploy" || !options.preservedPreviousRuntime) {
    throw new Error("after-deploy cleanup requires one preserved previous runtime");
  }
  const runtime = await pruneRuntimeDirectories(runtimeRoot, options.preservedPreviousRuntime);
  const releases = await pruneReleaseBackups(backupRoot);
  return { mode: options.mode, runtime, releases, daily };
}

async function main() {
  const [mode, preservedPreviousRuntime] = process.argv.slice(2);
  if (mode !== "--daily-only" && mode !== "--after-deploy") {
    throw new Error(
      "Usage: cleanup-doorbell-release-state.mjs --daily-only | --after-deploy <previous-runtime>",
    );
  }
  if (mode === "--after-deploy" && !preservedPreviousRuntime) {
    throw new Error("after-deploy cleanup requires the preserved previous runtime path");
  }
  if (mode === "--after-deploy" && process.geteuid?.() !== 0) {
    throw new Error("after-deploy cleanup must run as root");
  }
  const result = await cleanupDoorbellReleaseState({
    mode: mode === "--daily-only" ? "daily-only" : "after-deploy",
    runtimeRoot: "/opt",
    backupRoot: "/var/backups/doorbell-commons",
    ...(preservedPreviousRuntime ? { preservedPreviousRuntime } : {}),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
