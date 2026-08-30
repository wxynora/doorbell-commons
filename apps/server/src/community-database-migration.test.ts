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

test("schema v9 adds a profile-keyed persistent activity reminder ledger", () => {
  withTemporaryDatabase((databasePath) => {
    const versionNine = new CommunityDatabase(databasePath);
    versionNine.close();

    const downgraded = new Database(databasePath);
    downgraded.exec("DROP TABLE activity_reminders");
    downgraded.pragma("user_version = 9");
    downgraded.close();

    const migrated = new CommunityDatabase(databasePath);
    migrated.close();

    const database = new Database(databasePath, { readonly: true });
    try {
      assert.equal(
        database.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
      const columns = database.pragma("table_info(activity_reminders)") as Array<{
        name: string;
        pk: number;
      }>;
      assert.deepEqual(
        columns.filter((column) => column.pk > 0).map((column) => column.name),
        ["resident_id", "home_id", "farm_doorplate", "kind", "source_key"],
      );
      assert.ok(columns.some((column) => column.name === "ready_at"));
      const foreignKeys = database.pragma("foreign_key_list(activity_reminders)") as Array<{
        from: string;
        table: string;
      }>;
      assert.ok(
        foreignKeys.some(
          (foreignKey) =>
            foreignKey.from === "farm_doorplate" && foreignKey.table === "farm_bindings",
        ),
      );
    } finally {
      database.close();
    }
  });
});

test("schema v11 preserves subscriptions and makes the endpoint key profile-scoped", () => {
  withTemporaryDatabase((databasePath) => {
    const current = new CommunityDatabase(databasePath);
    const created = current.createHumanSession("10001", 1, {
      residentName: "小机",
      homeName: "小屋",
      farmDoorplate: "FARM-1",
      farmHumanKey: "private-human-key",
    });
    current.upsertBrowserPushSubscription({
      residentId: created.community.resident.residentId,
      homeId: created.community.home.homeId,
      endpoint: "https://push.example.test/existing",
      p256dh: "p256dh",
      auth: "auth",
      now: 2,
    });
    current.close();

    const versionTen = new Database(databasePath);
    versionTen.pragma("foreign_keys = OFF");
    versionTen.exec(`
      DROP INDEX browser_push_subscriptions_resident;
      CREATE TABLE browser_push_subscriptions_v10 (
        endpoint TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO browser_push_subscriptions_v10
      SELECT endpoint, resident_id, home_id, p256dh, auth, created_at, updated_at
      FROM browser_push_subscriptions;
      DROP TABLE browser_push_subscriptions;
      ALTER TABLE browser_push_subscriptions_v10 RENAME TO browser_push_subscriptions;
      CREATE INDEX browser_push_subscriptions_resident
        ON browser_push_subscriptions (resident_id, updated_at DESC, endpoint);
    `);
    versionTen.pragma("user_version = 10");
    versionTen.close();

    const migrated = new CommunityDatabase(databasePath);
    migrated.close();

    const database = new Database(databasePath, { readonly: true });
    try {
      assert.equal(
        database.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
      const columns = database.pragma("table_info(browser_push_subscriptions)") as Array<{
        name: string;
        pk: number;
      }>;
      assert.deepEqual(
        columns.filter((column) => column.pk > 0).map((column) => column.name),
        ["endpoint", "resident_id", "home_id"],
      );
      assert.deepEqual(
        database
          .prepare(
            `SELECT endpoint, resident_id, home_id, p256dh, auth, created_at, updated_at
             FROM browser_push_subscriptions`,
          )
          .all(),
        [
          {
            endpoint: "https://push.example.test/existing",
            resident_id: created.community.resident.residentId,
            home_id: created.community.home.homeId,
            p256dh: "p256dh",
            auth: "auth",
            created_at: 2,
            updated_at: 2,
          },
        ],
      );
      assert.deepEqual(database.pragma("foreign_key_check"), []);
    } finally {
      database.close();
    }
  });
});

test("schema v12 adds isolated career job wakes without rewriting existing Bell wakes", () => {
  withTemporaryDatabase((databasePath) => {
    const current = new CommunityDatabase(databasePath);
    current.close();

    const versionEleven = new Database(databasePath);
    versionEleven.exec("DROP TABLE career_job_wakes");
    versionEleven.pragma("user_version = 11");
    versionEleven.close();

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
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'career_job_wakes'",
          )
          .get(),
        { name: "career_job_wakes" },
      );
      assert.deepEqual(database.pragma("foreign_key_check"), []);
    } finally {
      database.close();
    }
  });
});

test("schema v14 repairs the exam-reminder wake foreign key and preserves scheduled reminders", () => {
  withTemporaryDatabase((databasePath) => {
    const current = new CommunityDatabase(databasePath);
    const created = current.createHumanSession("10001", 1, {
      residentName: "小机",
      homeName: "小屋",
      farmDoorplate: "FARM-1",
      farmHumanKey: "private-human-key",
    });
    current.close();

    const versionThirteen = new Database(databasePath);
    versionThirteen.pragma("foreign_keys = OFF");
    versionThirteen.exec(`
      DROP INDEX career_exam_reminders_due;
      DROP TABLE career_exam_reminders;
      CREATE TABLE career_exam_reminders (
        attempt_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
        scheduled_at INTEGER NOT NULL,
        remind_at INTEGER NOT NULL CHECK (remind_at = scheduled_at - 300000),
        status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
        letter_id TEXT UNIQUE REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
        wake_id TEXT UNIQUE REFERENCES bell_wakes_v6(wake_id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL,
        delivered_at INTEGER,
        cancelled_at INTEGER
      );
      INSERT INTO career_exam_reminders VALUES (
        'attempt-existing',
        '${created.community.resident.residentId}',
        '${created.community.home.homeId}',
        1788242400000,
        1788242100000,
        'scheduled',
        NULL,
        NULL,
        10,
        NULL,
        NULL
      );
      CREATE INDEX career_exam_reminders_due
        ON career_exam_reminders (status, remind_at, attempt_id);
    `);
    versionThirteen.pragma("user_version = 13");
    versionThirteen.close();

    const migrated = new CommunityDatabase(databasePath);
    try {
      assert.equal(readUserVersion(databasePath), COMMUNITY_DATABASE_SCHEMA_VERSION);
      const inspection = new Database(databasePath, { readonly: true });
      const reminderForeignKeys = inspection.pragma(
        "foreign_key_list(career_exam_reminders)",
      ) as Array<{ from: string; table: string; to: string }>;
      inspection.close();
      assert.deepEqual(
        reminderForeignKeys
          .filter((foreignKey) => foreignKey.from === "wake_id")
          .map((foreignKey) => ({
            targetTable: foreignKey.table,
            sourceColumn: foreignKey.from,
            targetColumn: foreignKey.to,
          })),
        [{ targetTable: "bell_wakes", sourceColumn: "wake_id", targetColumn: "wake_id" }],
      );
      assert.equal(migrated.getCareerExamReminder("attempt-existing")?.status, "scheduled");
      assert.equal(
        migrated.scheduleCareerExamReminder({
          attemptId: "attempt-new",
          residentId: created.community.resident.residentId,
          homeId: created.community.home.homeId,
          scheduledAt: 1788242400000,
          remindAt: 1788242100000,
          createdAt: 11,
        }).status,
        "scheduled",
      );
    } finally {
      migrated.close();
    }
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
      CREATE TABLE human_sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES human_accounts(account_id),
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
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
      INSERT INTO human_sessions VALUES ('session-hash', 'account-1', 1, NULL);
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
      const migratedSession = migratedDatabase
        .prepare(
          `SELECT s.account_id, s.active_profile_id, r.resident_id
           FROM human_sessions AS s
           JOIN residents AS r
             ON r.account_id = s.account_id AND r.profile_id = s.active_profile_id`,
        )
        .get() as {
        account_id: string;
        active_profile_id: string;
        resident_id: string;
      };
      assert.equal(migratedSession.account_id, "account-1");
      assert.equal(migratedSession.resident_id, "resident-1");
      assert.match(migratedSession.active_profile_id, /^[0-9a-f-]{36}$/u);
      assert.equal(
        migratedDatabase.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
    } finally {
      migratedDatabase.close();
    }
  });
});

test("schema v1 preserves login security state while upgrading through the current schema", () => {
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
      assert.equal(COMMUNITY_DATABASE_SCHEMA_VERSION, 14);
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

test("schema v2 preserves cursor-only Connector rows only as unreachable legacy history", () => {
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

test("schema v4 adds the final-only Lingye Daily archive without changing existing rows", () => {
  withTemporaryDatabase((databasePath) => {
    const current = new CommunityDatabase(databasePath);
    current.close();

    const versionFourDatabase = new Database(databasePath);
    versionFourDatabase.exec("DROP TABLE lingye_daily_issues");
    versionFourDatabase.pragma("user_version = 4");
    versionFourDatabase.close();

    const migrated = new CommunityDatabase(databasePath);
    migrated.close();

    const database = new Database(databasePath, { readonly: true });
    try {
      assert.equal(
        database.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
      const columns = database.pragma("table_info(lingye_daily_issues)") as Array<{
        name: string;
      }>;
      assert.ok(columns.some((column) => column.name === "edition_json"));
      assert.ok(columns.some((column) => column.name === "revision_note"));
      assert.equal(
        columns.some((column) => /message|speaker|qq/iu.test(column.name)),
        false,
      );
    } finally {
      database.close();
    }
  });
});

test("schema v5 preserves an existing group-chat issue inside the seven-column edition", () => {
  withTemporaryDatabase((databasePath) => {
    const current = new CommunityDatabase(databasePath);
    current.close();

    const versionFiveDatabase = new Database(databasePath);
    versionFiveDatabase.exec(`
      DROP TABLE lingye_daily_issues;
      CREATE TABLE lingye_daily_issues (
        issue_date TEXT PRIMARY KEY,
        issue_number INTEGER NOT NULL UNIQUE CHECK (issue_number > 0),
        revision INTEGER NOT NULL CHECK (revision > 0),
        revision_note TEXT,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        coverage_status TEXT NOT NULL CHECK (coverage_status IN ('complete', 'partial')),
        coverage_note TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        published_at INTEGER NOT NULL,
        editor_model TEXT NOT NULL,
        screening_model TEXT NOT NULL,
        group_chat_json TEXT NOT NULL
      );
      INSERT INTO lingye_daily_issues VALUES (
        '2026-08-16',
        1,
        1,
        NULL,
        '2026-08-15T05:00:00+08:00',
        '2026-08-16T04:59:59+08:00',
        'complete',
        '',
        '2026-08-16T05:00:08+08:00',
        1786838400000,
        'gpt-5.6-terra',
        'gpt-5.6-terra',
        '{"summary":"旧版今日群聊","topics":["旧话题"],"topic_sources":[{"text":"旧话题","source_event_ids":["E1"]}]}'
      );
    `);
    versionFiveDatabase.pragma("user_version = 5");
    versionFiveDatabase.close();

    const migrated = new CommunityDatabase(databasePath);
    try {
      const issue = migrated.getLatestLingyeDailyIssue();
      assert.equal(issue?.edition.front_page, null);
      assert.equal(issue?.edition.group_chat.summary, "旧版今日群聊");
      assert.deepEqual(issue?.edition.group_chat.topics, [
        { text: "旧话题", source_event_ids: ["E1"] },
      ]);
      assert.deepEqual(issue?.edition.behavior_slices, []);
      assert.deepEqual(issue?.edition.quotes, []);
      assert.equal(issue?.edition.farm_observation, null);
      assert.deepEqual(issue?.edition.submissions, []);
      assert.equal(issue?.edition.tomorrow_question, null);
    } finally {
      migrated.close();
    }

    const migratedDatabase = new Database(databasePath, { readonly: true });
    try {
      const columns = migratedDatabase.pragma("table_info(lingye_daily_issues)") as Array<{
        name: string;
      }>;
      assert.ok(columns.some((column) => column.name === "edition_json"));
      assert.equal(
        columns.some((column) => column.name === "group_chat_json"),
        false,
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

test("schema v6 migrates legacy Bell wakes through the career reminder schema", () => {
  withTemporaryDatabase((databasePath) => {
    const legacy = new Database(databasePath);
    legacy.exec(`
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
      CREATE TABLE homes (
        home_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL UNIQUE REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        mailbox_revision INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE bell_wakes (
        wake_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        reason TEXT NOT NULL CHECK (reason = 'mailbox_unread'),
        status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
        created_at INTEGER NOT NULL,
        ended_at INTEGER,
        block_reason TEXT,
        error_code TEXT
      );
      CREATE UNIQUE INDEX bell_wakes_one_pending_per_resident
        ON bell_wakes (resident_id)
        WHERE status = 'pending';
      INSERT INTO human_accounts VALUES ('account-1', '10001', NULL, 1, 'active', 1, NULL);
      INSERT INTO residents VALUES ('resident-1', 'account-1', '小机', 1);
      INSERT INTO homes VALUES ('home-1', 'resident-1', '小屋', 1, 0);
      INSERT INTO bell_wakes VALUES (
        'wake-legacy', 'resident-1', 'mailbox_unread', 'pending', 10, NULL, NULL, NULL
      );
    `);
    legacy.pragma("user_version = 6");
    legacy.close();

    const migrated = new CommunityDatabase(databasePath);
    migrated.close();

    const database = new Database(databasePath, { readonly: true });
    try {
      assert.equal(
        database.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
      const wakeColumns = database.pragma("table_info(bell_wakes)") as Array<{ name: string }>;
      assert.ok(wakeColumns.some((column) => column.name === "payload_json"));
      assert.ok(wakeColumns.some((column) => column.name === "letter_id"));
      const settingsColumns = database.pragma("table_info(human_settings)") as Array<{
        name: string;
      }>;
      assert.ok(
        settingsColumns.some((column) => column.name === "shared_meme_update_signals_enabled"),
      );
      assert.ok(settingsColumns.some((column) => column.name === "browser_notifications_enabled"));
      assert.ok(settingsColumns.some((column) => column.name === "activity_reminders_enabled"));
      const activityReminderColumns = database.pragma("table_info(activity_reminders)") as Array<{
        name: string;
        pk: number;
      }>;
      assert.ok(activityReminderColumns.some((column) => column.name === "source_key"));
      assert.ok(activityReminderColumns.some((column) => column.name === "ready_at"));
      assert.ok(activityReminderColumns.some((column) => column.name === "farm_doorplate"));
      const itemColumns = database.pragma("table_info(farm_purchase_request_items)") as Array<{
        name: string;
      }>;
      assert.ok(itemColumns.some((column) => column.name === "settled_qty"));
      assert.ok(itemColumns.some((column) => column.name === "receipt_id"));
      assert.ok(itemColumns.some((column) => column.name === "reason_code"));
      assert.deepEqual(
        database.prepare("SELECT wake_id, reason, payload_json FROM bell_wakes").all(),
        [{ wake_id: "wake-legacy", reason: "mailbox_unread", payload_json: null }],
      );
      assert.deepEqual(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'bell_wakes_one_pending_per_resident'",
          )
          .all(),
        [],
      );
      assert.deepEqual(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('farm_purchase_requests', 'farm_purchase_request_items') ORDER BY name",
          )
          .all(),
        [{ name: "farm_purchase_request_items" }, { name: "farm_purchase_requests" }],
      );
      assert.deepEqual(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'career_exam_reminders'",
          )
          .all(),
        [{ name: "career_exam_reminders" }],
      );
    } finally {
      database.close();
    }
  });
});

test("schema v7 preserves purchase wakes while adding career exam reminder references", () => {
  withTemporaryDatabase((databasePath) => {
    const legacy = new Database(databasePath);
    legacy.exec(`
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
      CREATE TABLE homes (
        home_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL UNIQUE REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        mailbox_revision INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE mailbox_letters (
        letter_id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        attachment_type TEXT,
        attachment_status TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE (home_id, idempotency_key)
      );
      CREATE TABLE bell_wakes (
        wake_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        reason TEXT NOT NULL CHECK (reason IN ('mailbox_unread', 'farm_purchase_request')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
        created_at INTEGER NOT NULL,
        ended_at INTEGER,
        block_reason TEXT,
        error_code TEXT,
        purchase_request_id TEXT,
        payload_json TEXT
      );
      CREATE TABLE farm_purchase_requests (
        request_id TEXT PRIMARY KEY,
        wake_id TEXT NOT NULL UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        shop TEXT NOT NULL,
        shop_revision TEXT NOT NULL,
        human_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        payload_hash TEXT NOT NULL,
        UNIQUE (resident_id, idempotency_key)
      );
      CREATE TABLE farm_purchase_request_items (
        request_id TEXT NOT NULL REFERENCES farm_purchase_requests(request_id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        qty INTEGER NOT NULL CHECK (qty > 0),
        display_name TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (request_id, kind, item_id)
      );
      INSERT INTO human_accounts VALUES ('account-1', '10001', NULL, 1, 'active', 1, NULL);
      INSERT INTO residents VALUES ('resident-1', 'account-1', '小机', 1);
      INSERT INTO homes VALUES ('home-1', 'resident-1', '小屋', 1, 0);
      INSERT INTO bell_wakes VALUES (
        'wake-purchase', 'resident-1', 'farm_purchase_request', 'pending',
        10, NULL, NULL, NULL, 'request-1', '{"text":"existing"}'
      );
      INSERT INTO farm_purchase_requests VALUES (
        'request-1', 'wake-purchase', 'resident-1', 'home-1', 'attempt-1',
        'field', 'revision-1', '人类', 'requested', 10, 86400010, 'payload-hash'
      );
      INSERT INTO farm_purchase_request_items VALUES (
        'request-1', 'seed-1', 'seed', 2, '种子', 'pending'
      );
    `);
    legacy.pragma("user_version = 7");
    legacy.close();

    const migrated = new CommunityDatabase(databasePath);
    migrated.close();

    const database = new Database(databasePath);
    try {
      assert.equal(
        database.pragma("user_version", { simple: true }),
        COMMUNITY_DATABASE_SCHEMA_VERSION,
      );
      assert.deepEqual(
        database
          .prepare(
            "SELECT wake_id, reason, purchase_request_id, letter_id, payload_json FROM bell_wakes",
          )
          .all(),
        [
          {
            wake_id: "wake-purchase",
            reason: "farm_purchase_request",
            purchase_request_id: "request-1",
            letter_id: null,
            payload_json: '{"text":"existing"}',
          },
        ],
      );
      assert.deepEqual(
        (
          database.pragma("foreign_key_list(farm_purchase_requests)") as Array<{
            table: string;
            from: string;
            to: string;
          }>
        )
          .filter((foreignKey) => foreignKey.from === "wake_id")
          .map((foreignKey) => ({
            target_table: foreignKey.table,
            source_column: foreignKey.from,
            target_column: foreignKey.to,
          })),
        [{ target_table: "bell_wakes", source_column: "wake_id", target_column: "wake_id" }],
      );
      assert.deepEqual(
        database
          .prepare(
            "SELECT request_id, item_id, kind, qty, display_name, status FROM farm_purchase_request_items",
          )
          .all(),
        [
          {
            request_id: "request-1",
            item_id: "seed-1",
            kind: "seed",
            qty: 2,
            display_name: "种子",
            status: "pending",
          },
        ],
      );
      database.exec(`
        INSERT INTO bell_wakes VALUES (
          'wake-new', 'resident-1', 'farm_purchase_request', 'pending',
          20, NULL, NULL, NULL, 'request-new', NULL, '{"text":"new"}'
        );
        INSERT INTO farm_purchase_requests VALUES (
          'request-new', 'wake-new', 'resident-1', 'home-1', 'attempt-new',
          'ranch', 'revision-new', '人类', 'requested', 20, 86400020, 'payload-new'
        );
      `);
      assert.deepEqual(database.pragma("foreign_key_check"), []);
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
