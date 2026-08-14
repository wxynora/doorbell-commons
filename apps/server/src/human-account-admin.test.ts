import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { CommunityDatabase, HUMAN_LOGIN_FAILURE_THRESHOLD } from "./community-database.js";
import { createHumanPasswordCredential } from "./password-auth.js";

const QQ_NUMBER = "3877162412";
const NOW = Date.UTC(2026, 7, 14, 0, 0, 0);
const UNLOCK_CLI_PATH = fileURLToPath(new URL("./unlock-human-account.ts", import.meta.url));

function queryCount(databasePath: string, tableName: string): number {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as {
      count: number;
    };
    return row.count;
  } finally {
    database.close();
  }
}

test("administrator unlock and password reset clear QQ login security state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-human-account-admin-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => "active-session-token",
    generateAccountId: () => "account-1",
    generateResidentId: () => "resident-1",
    generateHomeId: () => "home-1",
  });
  try {
    const credential = await createHumanPasswordCredential("original password");
    const created = database.createHumanSession(QQ_NUMBER, NOW, {
      residentName: "辛玥 & 小机",
      homeName: "辛玥的小家",
      farmDoorplate: "3ET3FE",
      farmHumanKey: "private-human-key",
      passwordCredential: credential,
    });

    for (let attempt = 0; attempt < HUMAN_LOGIN_FAILURE_THRESHOLD; attempt += 1) {
      database.recordFailedHumanLogin(QQ_NUMBER, NOW + attempt);
    }
    assert.equal(database.isHumanLoginLocked(QQ_NUMBER, NOW + 10), true);

    const unlocked = spawnSync(process.execPath, ["--import", "tsx", UNLOCK_CLI_PATH, QQ_NUMBER], {
      encoding: "utf8",
      env: { ...process.env, DOORBELL_DATABASE_PATH: databasePath },
    });
    assert.equal(unlocked.status, 0, unlocked.stderr);
    assert.equal(unlocked.stdout, `Login lock and failed attempts cleared for QQ ${QQ_NUMBER}.\n`);
    assert.equal(database.isHumanLoginLocked(QQ_NUMBER, NOW + 10), false);
    assert.equal(queryCount(databasePath, "human_login_failures"), 0);
    assert.equal(queryCount(databasePath, "human_login_locks"), 0);

    for (let attempt = 0; attempt < HUMAN_LOGIN_FAILURE_THRESHOLD; attempt += 1) {
      database.recordFailedHumanLogin(QQ_NUMBER, NOW + 20 + attempt);
    }
    assert.equal(database.isHumanLoginLocked(QQ_NUMBER, NOW + 30), true);

    const replacementCredential = await createHumanPasswordCredential("replacement password");
    assert.equal(database.resetHumanPassword(QQ_NUMBER, replacementCredential, NOW + 31), true);
    assert.equal(database.isHumanLoginLocked(QQ_NUMBER, NOW + 31), false);
    assert.equal(queryCount(databasePath, "human_login_failures"), 0);
    assert.equal(queryCount(databasePath, "human_login_locks"), 0);
    assert.equal(database.findActiveHumanSession(created.token), undefined);
  } finally {
    database.close();
    rmSync(directory, { force: true, recursive: true });
  }
});

test("administrator unlock rejects an unknown QQ without creating account state", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-human-account-admin-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const database = new CommunityDatabase(databasePath);
  database.close();
  try {
    const unlocked = spawnSync(
      process.execPath,
      ["--import", "tsx", UNLOCK_CLI_PATH, "1000000000"],
      {
        encoding: "utf8",
        env: { ...process.env, DOORBELL_DATABASE_PATH: databasePath },
      },
    );
    assert.notEqual(unlocked.status, 0);
    assert.match(unlocked.stderr, /No Doorbell human account exists for QQ 1000000000/);
    assert.equal(queryCount(databasePath, "human_accounts"), 0);
    assert.equal(queryCount(databasePath, "human_login_failures"), 0);
    assert.equal(queryCount(databasePath, "human_login_locks"), 0);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
