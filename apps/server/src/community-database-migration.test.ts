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

test("schema v1 preserves login security state while upgrading through v4", () => {
  withTemporaryDatabase((databasePath) => {
    const versionOneDatabase = new Database(databasePath);
    versionOneDatabase.exec(`
      CREATE TABLE human_accounts (
        account_id TEXT PRIMARY KEY,
        qq_number TEXT NOT NULL UNIQUE,
        password_credential TEXT,
        created_at INTEGER NOT NULL,
        membership_status TEXT NOT NULL,
        membership_checked_at INTEGER NOT NULL,
        membership_inactive_at INTEGER
      );
      INSERT INTO human_accounts VALUES (
        'account-1',
        '10001',
        'scrypt-v1$credential',
        1,
        'active',
        1,
        NULL
      );
    `);
    versionOneDatabase.pragma("user_version = 1");
    versionOneDatabase.close();

    const communityDatabase = new CommunityDatabase(databasePath);
    communityDatabase.close();

    const migratedDatabase = new Database(databasePath, { readonly: true });
    try {
      assert.equal(
        migratedDatabase.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
      assert.equal(COMMUNITY_DATABASE_SCHEMA_VERSION, 4);
      assert.deepEqual(
        migratedDatabase
          .prepare("SELECT account_id, qq_number, password_credential FROM human_accounts")
          .get(),
        {
          account_id: "account-1",
          password_credential: "scrypt-v1$credential",
          qq_number: "10001",
        },
      );
      assert.deepEqual(
        migratedDatabase
          .prepare(
            `SELECT name
             FROM sqlite_master
             WHERE type = 'table' AND name IN ('human_login_failures', 'human_login_locks')
             ORDER BY name`,
          )
          .all(),
        [{ name: "human_login_failures" }, { name: "human_login_locks" }],
      );
    } finally {
      migratedDatabase.close();
    }
  });
});

test("schema v2 archives cursor-only Connector events without consuming the current generation", () => {
  withTemporaryDatabase((databasePath) => {
    const versionTwoDatabase = new Database(databasePath);
    versionTwoDatabase.exec(`
      CREATE TABLE human_accounts (
        account_id TEXT PRIMARY KEY,
        qq_number TEXT NOT NULL UNIQUE,
        password_credential TEXT,
        created_at INTEGER NOT NULL,
        membership_status TEXT NOT NULL,
        membership_checked_at INTEGER NOT NULL,
        membership_inactive_at INTEGER
      );
      CREATE TABLE residents (
        resident_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE REFERENCES human_accounts(account_id) ON DELETE CASCADE,
        resident_name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE connector_delivery_state (
        resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE CASCADE,
        last_event_cursor INTEGER NOT NULL,
        last_acked_cursor INTEGER NOT NULL
      );
      CREATE TABLE connector_events (
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        cursor INTEGER NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (resident_id, cursor)
      );
      INSERT INTO human_accounts VALUES ('account-1', '10001', NULL, 1, 'active', 1, NULL);
      INSERT INTO residents VALUES ('resident-1', 'account-1', '小机', 1);
      INSERT INTO connector_delivery_state VALUES ('resident-1', 2, 1);
      INSERT INTO connector_events VALUES (
        'resident-1', 1, '00000000-0000-4000-8000-000000000001',
        'foundation.fact', 1, '{"value":1}'
      );
      INSERT INTO connector_events VALUES (
        'resident-1', 2, '00000000-0000-4000-8000-000000000002',
        'foundation.fact', 2, '{"value":2}'
      );
    `);
    versionTwoDatabase.pragma("user_version = 2");
    versionTwoDatabase.close();

    const communityDatabase = new CommunityDatabase(databasePath);
    const currentGeneration = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    try {
      const migratedDatabase = new Database(databasePath, { readonly: true });
      try {
        assert.equal(
          migratedDatabase.pragma("user_version", { simple: true }),
          COMMUNITY_DATABASE_SCHEMA_VERSION,
        );
        const archivedState = migratedDatabase
          .prepare(
            `SELECT generation, resident_id, last_event_cursor, last_acked_cursor
             FROM connector_delivery_state`,
          )
          .get() as {
          generation: string;
          last_acked_cursor: number;
          last_event_cursor: number;
          resident_id: string;
        };
        assert.notEqual(archivedState.generation, currentGeneration);
        assert.deepEqual(
          {
            last_acked_cursor: archivedState.last_acked_cursor,
            last_event_cursor: archivedState.last_event_cursor,
            resident_id: archivedState.resident_id,
          },
          { last_acked_cursor: 1, last_event_cursor: 2, resident_id: "resident-1" },
        );
        assert.deepEqual(
          migratedDatabase
            .prepare(
              `SELECT generation, cursor, event_id
               FROM connector_events
               ORDER BY cursor`,
            )
            .all(),
          [
            {
              cursor: 1,
              event_id: "00000000-0000-4000-8000-000000000001",
              generation: archivedState.generation,
            },
            {
              cursor: 2,
              event_id: "00000000-0000-4000-8000-000000000002",
              generation: archivedState.generation,
            },
          ],
        );
      } finally {
        migratedDatabase.close();
      }

      const currentEvent = communityDatabase.appendConnectorEvent(
        currentGeneration,
        "resident-1",
        "00000000-0000-4000-8000-000000000003",
        "foundation.fact",
        { value: 3 },
        3,
      );
      assert.equal(currentEvent.generation, currentGeneration);
      assert.equal(currentEvent.cursor, 1);
      assert.equal(
        communityDatabase.listConnectorEventsAfter(currentGeneration, "resident-1", 0).length,
        1,
      );
    } finally {
      communityDatabase.close();
    }
  });
});

test("schema v3 adds Bell delivery state without changing existing community rows", () => {
  withTemporaryDatabase((databasePath) => {
    const current = new CommunityDatabase(databasePath);
    current.close();

    const versionThreeDatabase = new Database(databasePath);
    versionThreeDatabase.exec(`
      DROP TABLE bell_wakes;
      DROP TABLE bell_bindings;
    `);
    versionThreeDatabase.pragma("user_version = 3");
    versionThreeDatabase.close();

    const migrated = new CommunityDatabase(databasePath);
    migrated.close();

    const database = new Database(databasePath, { readonly: true });
    try {
      assert.equal(
        database.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
      assert.deepEqual(
        database
          .prepare(
            `SELECT name
             FROM sqlite_master
             WHERE type = 'table' AND name IN ('bell_bindings', 'bell_wakes')
             ORDER BY name`,
          )
          .all(),
        [{ name: "bell_bindings" }, { name: "bell_wakes" }],
      );
      const bindingColumns = database.pragma("table_info(bell_bindings)") as Array<{
        name: string;
      }>;
      assert.ok(bindingColumns.some((column) => column.name === "last_wake_mailbox_revision"));
      const homeColumns = database.pragma("table_info(homes)") as Array<{ name: string }>;
      assert.ok(homeColumns.some((column) => column.name === "mailbox_revision"));
    } finally {
      database.close();
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
      new RegExp(
        `Unsupported community database schema version: ${String(
          COMMUNITY_DATABASE_SCHEMA_VERSION + 1,
        )}`,
      ),
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
