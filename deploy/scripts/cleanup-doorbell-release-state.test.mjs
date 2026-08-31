import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  cleanupDoorbellReleaseState,
  DOORBELL_RELEASE_RETENTION,
} from "./cleanup-doorbell-release-state.mjs";

function touchFile(path, mtimeMs) {
  writeFileSync(path, path);
  const time = new Date(mtimeMs);
  utimesSync(path, time, time);
}

function createReleaseBackup(root, name, mtimeMs, valid = true) {
  const target = join(root, "releases", name);
  mkdirSync(target, { recursive: true });
  if (valid) touchFile(join(target, `${name}.sqlite`), mtimeMs);
  const time = new Date(mtimeMs);
  utimesSync(target, time, time);
  return target;
}

test("after-deploy cleanup retains only the explicit previous runtime and bounded backups", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-release-cleanup-"));
  const runtimeRoot = join(directory, "opt");
  const backupRoot = join(directory, "backups");
  mkdirSync(runtimeRoot);
  mkdirSync(join(backupRoot, "releases"), { recursive: true });
  mkdirSync(join(backupRoot, "manual", "active-recovery"), { recursive: true });
  try {
    const current = join(runtimeRoot, "doorbell-commons");
    const preserved = join(runtimeRoot, "doorbell-commons.previous-new");
    const protectedNames = [
      "doorbell-commons-source",
      "doorbell-commons-deps",
      "aifarm",
      "doorbell-commons-web-assets",
    ];
    mkdirSync(current);
    mkdirSync(preserved);
    mkdirSync(join(runtimeRoot, "doorbell-commons.previous-old"));
    mkdirSync(join(runtimeRoot, "doorbell-commons.failed-old"));
    mkdirSync(join(runtimeRoot, ".doorbell-commons.build.old"));
    mkdirSync(join(runtimeRoot, ".doorbell-commons.candidate.old"));
    for (const name of protectedNames) mkdirSync(join(runtimeRoot, name));
    symlinkSync(current, join(runtimeRoot, "doorbell-commons.previous-link"));

    createReleaseBackup(backupRoot, "release-1", 1_000);
    createReleaseBackup(backupRoot, "release-2", 2_000);
    createReleaseBackup(backupRoot, "release-3", 3_000);
    createReleaseBackup(backupRoot, "invalid-old", 4_000, false);
    for (let index = 1; index <= 5; index += 1) {
      touchFile(join(backupRoot, `daily-${index}.sqlite`), index * 1_000);
    }

    const result = await cleanupDoorbellReleaseState({
      mode: "after-deploy",
      runtimeRoot,
      backupRoot,
      preservedPreviousRuntime: preserved,
    });

    assert.deepEqual(result, {
      mode: "after-deploy",
      runtime: { previous: 1, failed: 1, build: 1, candidate: 1 },
      releases: { kept: 2, removed: 2 },
      daily: { kept: 3, removed: 2 },
    });
    assert.equal(readFileSync(join(backupRoot, "daily-5.sqlite"), "utf8").length > 0, true);
    assert.equal(readFileSync(join(backupRoot, "daily-3.sqlite"), "utf8").length > 0, true);
    for (const name of ["doorbell-commons", "doorbell-commons.previous-new", ...protectedNames]) {
      assert.equal(existsSync(join(runtimeRoot, name)), true);
    }
    assert.equal(existsSync(join(runtimeRoot, "doorbell-commons.previous-old")), false);
    assert.equal(existsSync(join(runtimeRoot, "doorbell-commons.failed-old")), false);
    assert.equal(existsSync(join(runtimeRoot, ".doorbell-commons.build.old")), false);
    assert.equal(existsSync(join(runtimeRoot, ".doorbell-commons.candidate.old")), false);
    assert.equal(existsSync(join(runtimeRoot, "doorbell-commons.previous-link")), true);
    assert.equal(existsSync(join(backupRoot, "releases", "release-1")), false);
    assert.equal(existsSync(join(backupRoot, "releases", "invalid-old")), false);
    assert.equal(existsSync(join(backupRoot, "manual", "active-recovery")), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("daily-only cleanup cannot touch runtimes, release backups, manual recovery, or assets", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-daily-cleanup-"));
  const runtimeRoot = join(directory, "opt");
  const backupRoot = join(directory, "backups");
  mkdirSync(join(runtimeRoot, "doorbell-commons.previous-old"), { recursive: true });
  mkdirSync(join(runtimeRoot, "doorbell-commons-web-assets"));
  mkdirSync(join(backupRoot, "releases"), { recursive: true });
  mkdirSync(join(backupRoot, "manual", "active-recovery"), { recursive: true });
  try {
    createReleaseBackup(backupRoot, "release-1", 1_000);
    for (let index = 1; index <= 5; index += 1) {
      touchFile(join(backupRoot, `daily-${index}.sqlite`), index * 1_000);
    }
    const result = await cleanupDoorbellReleaseState({
      mode: "daily-only",
      runtimeRoot,
      backupRoot,
    });
    assert.deepEqual(result, { mode: "daily-only", daily: { kept: 3, removed: 2 } });
    assert.equal(
      readFileSync(join(backupRoot, "releases", "release-1", "release-1.sqlite"), "utf8").length >
        0,
      true,
    );
    assert.equal(existsSync(join(runtimeRoot, "doorbell-commons.previous-old")), true);
    assert.equal(existsSync(join(runtimeRoot, "doorbell-commons-web-assets")), true);
    assert.equal(existsSync(join(backupRoot, "manual", "active-recovery")), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cleanup refuses a preserved runtime outside the exact runtime root", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-cleanup-refusal-"));
  const runtimeRoot = join(directory, "opt");
  const backupRoot = join(directory, "backups");
  mkdirSync(runtimeRoot);
  mkdirSync(join(backupRoot, "releases"), { recursive: true });
  try {
    await assert.rejects(
      cleanupDoorbellReleaseState({
        mode: "after-deploy",
        runtimeRoot,
        backupRoot,
        preservedPreviousRuntime: join(directory, "doorbell-commons.previous-outside"),
      }),
      /outside the exact runtime root/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("retention constants remain the approved minimal 1, 2, and 3", () => {
  assert.deepEqual(DOORBELL_RELEASE_RETENTION, {
    previousRuntimes: 1,
    releaseBackups: 2,
    dailyBackups: 3,
  });
});
