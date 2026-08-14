import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { COMMUNITY_DATABASE_SCHEMA_VERSION, CommunityDatabase } from "./community-database.js";

function withTemporaryDatabase(run: (databasePath: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-schema-migration-"));
  try {
    run(join(directory, "doorbell.sqlite"));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function readUserVersion(databasePath: string): number {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.pragma("user_version", { simple: true }) as number;
  } finally {
    database.close();
  }
}

test("a fresh community database records the current schema version", () => {
  withTemporaryDatabase((databasePath) => {
    const communityDatabase = new CommunityDatabase(databasePath);
    communityDatabase.close();

    assert.equal(readUserVersion(databasePath), COMMUNITY_DATABASE_SCHEMA_VERSION);
  });
});

test("schema v0 upgrades missing identity columns in one versioned migration without data loss", () => {
  withTemporaryDatabase((databasePath) => {
    const legacyDatabase = new Database(databasePath);
    legacyDatabase.exec(`
      CREATE TABLE human_accounts (
        account_id TEXT PRIMARY KEY,
        qq_number TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        membership_status TEXT NOT NULL,
        membership_checked_at INTEGER NOT NULL,
        membership_inactive_at INTEGER
      );
      CREATE TABLE residents (
        resident_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE REFERENCES human_accounts(account_id),
        resident_name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE homes (
        home_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL UNIQUE REFERENCES residents(resident_id),
        home_name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE farm_bindings (
        farm_doorplate TEXT PRIMARY KEY,
        home_id TEXT NOT NULL UNIQUE REFERENCES homes(home_id),
        bound_at INTEGER NOT NULL
      );
      INSERT INTO human_accounts VALUES ('account-1', '10001', 1, 'active', 1, NULL);
      INSERT INTO residents VALUES ('resident-1', 'account-1', '小机', 1);
      INSERT INTO homes VALUES ('home-1', 'resident-1', '小屋', 1);
      INSERT INTO farm_bindings VALUES ('FARM-1', 'home-1', 1);
    `);
    legacyDatabase.close();

    const communityDatabase = new CommunityDatabase(databasePath);
    communityDatabase.close();

    const migratedDatabase = new Database(databasePath, { readonly: true });
    try {
      const humanAccountColumns = migratedDatabase.pragma("table_info(human_accounts)") as Array<{
        name: string;
      }>;
      const farmBindingColumns = migratedDatabase.pragma("table_info(farm_bindings)") as Array<{
        name: string;
      }>;
      assert.ok(humanAccountColumns.some((column) => column.name === "password_credential"));
      assert.ok(farmBindingColumns.some((column) => column.name === "farm_human_key"));
      assert.deepEqual(
        migratedDatabase
          .prepare("SELECT account_id, qq_number, password_credential FROM human_accounts")
          .get(),
        { account_id: "account-1", password_credential: null, qq_number: "10001" },
      );
      assert.deepEqual(
        migratedDatabase
          .prepare("SELECT farm_doorplate, home_id, farm_human_key FROM farm_bindings")
          .get(),
        { farm_doorplate: "FARM-1", farm_human_key: null, home_id: "home-1" },
      );
      assert.equal(
        migratedDatabase.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
    } finally {
      migratedDatabase.close();
    }
  });
});

test("a database from a newer schema version fails closed before initialization", () => {
  withTemporaryDatabase((databasePath) => {
    const futureDatabase = new Database(databasePath);
    futureDatabase.pragma(`user_version = ${COMMUNITY_DATABASE_SCHEMA_VERSION + 1}`);
    futureDatabase.close();

    assert.throws(
      () => new CommunityDatabase(databasePath),
      /Unsupported community database schema version: 2/,
    );

    const unchangedDatabase = new Database(databasePath, { readonly: true });
    try {
      const tables = unchangedDatabase
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all();
      assert.deepEqual(tables, []);
      assert.equal(
        unchangedDatabase.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION + 1,
      );
    } finally {
      unchangedDatabase.close();
    }
  });
});
