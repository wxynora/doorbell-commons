import {
  climateTypeValues,
  type LingyeDailyEditionPublish,
  type LingyeDailyPublishRequest,
  lingyeDailyEditionPublishSchema,
  mailboxCategoryValues,
  weatherConditionValues,
  weatherSeasonPhaseValues,
} from "@doorbell/protocol";
import type Database from "better-sqlite3";

export const COMMUNITY_DATABASE_SCHEMA_VERSION = 22;
const LEGACY_CONNECTOR_DELIVERY_GENERATION = "00000000-0000-0000-0000-000000000000";

interface FarmCreationRequestRow {
  creation_id: string;
  qq_number: string;
  requested_farm_name: string;
  requested_ai_name: string;
  requested_human_name: string;
  requested_at: number;
  farm_doorplate: string | null;
  farm_name: string | null;
  ai_name: string | null;
  human_name: string | null;
  farm_human_key: string | null;
  farm_created_at: number | null;
  completed_at: number | null;
}

interface LingyeDailyIssueRow {
  issue_date: string;
  issue_number: number;
  revision: number;
  revision_note: string | null;
  period_start: string;
  period_end: string;
  coverage_status: LingyeDailyPublishRequest["coverage_status"];
  coverage_note: string;
  generated_at: string;
  published_at: number;
  editor_model: string;
  screening_model: string;
  edition_json: string;
}

interface BellWakeRow {
  wake_id: string;
  resident_id: string;
  reason: string;
  status: string;
  created_at: number;
  ended_at: number | null;
  block_reason: string | null;
  error_code: string | null;
  purchase_request_id: string | null;
  letter_id: string | null;
  payload_json: string | null;
}

function sqlStringList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(", ");
}

export function migrateCommunityDatabase(
  database: Database.Database,
  generateProfileId: () => string,
): void {
  const databaseSchemaVersion = database.pragma("user_version", {
    simple: true,
  });
  if (
    typeof databaseSchemaVersion !== "number" ||
    !Number.isInteger(databaseSchemaVersion) ||
    databaseSchemaVersion < 0 ||
    databaseSchemaVersion > COMMUNITY_DATABASE_SCHEMA_VERSION
  ) {
    database.close();
    throw new Error(
      `Unsupported community database schema version: ${String(databaseSchemaVersion)}`,
    );
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS registration_code (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      code TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS farm_creation_requests (
      creation_id TEXT PRIMARY KEY,
      qq_number TEXT NOT NULL,
      requested_farm_name TEXT NOT NULL,
      requested_ai_name TEXT NOT NULL,
      requested_human_name TEXT NOT NULL,
      requested_at INTEGER NOT NULL,
      farm_doorplate TEXT UNIQUE,
      farm_name TEXT,
      ai_name TEXT,
      human_name TEXT,
      farm_human_key TEXT,
      farm_created_at INTEGER,
      completed_at INTEGER,
      CHECK (
        (farm_doorplate IS NULL
          AND farm_name IS NULL
          AND ai_name IS NULL
          AND human_name IS NULL
          AND farm_human_key IS NULL
          AND farm_created_at IS NULL
          AND completed_at IS NULL)
        OR (farm_doorplate IS NOT NULL
          AND farm_name IS NOT NULL
          AND ai_name IS NOT NULL
          AND human_name IS NOT NULL
          AND farm_human_key IS NOT NULL
          AND farm_created_at IS NOT NULL
          AND completed_at IS NULL)
        OR (farm_doorplate IS NOT NULL
          AND farm_name IS NOT NULL
          AND ai_name IS NOT NULL
          AND human_name IS NOT NULL
          AND farm_human_key IS NULL
          AND farm_created_at IS NOT NULL
          AND completed_at IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS farm_creation_requests_one_pending_per_qq
      ON farm_creation_requests (qq_number)
      WHERE completed_at IS NULL;

    CREATE TABLE IF NOT EXISTS human_accounts (
      account_id TEXT PRIMARY KEY,
      qq_number TEXT NOT NULL UNIQUE,
      password_credential TEXT,
      created_at INTEGER NOT NULL,
      membership_status TEXT NOT NULL CHECK (membership_status IN ('active', 'inactive')),
      membership_checked_at INTEGER NOT NULL,
      membership_inactive_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS qq_group_member_snapshots (
      group_id TEXT NOT NULL,
      qq_number TEXT NOT NULL,
      captured_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, qq_number)
    );

    CREATE TABLE IF NOT EXISTS human_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS residents (
      resident_id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
      resident_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (account_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS homes (
      home_id TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL UNIQUE REFERENCES residents(resident_id) ON DELETE CASCADE,
      home_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      mailbox_revision INTEGER NOT NULL DEFAULT 0 CHECK (mailbox_revision >= 0)
    );

    CREATE TABLE IF NOT EXISTS farm_bindings (
      farm_doorplate TEXT PRIMARY KEY,
      home_id TEXT NOT NULL UNIQUE REFERENCES homes(home_id) ON DELETE CASCADE,
      farm_human_key TEXT,
      bound_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS human_settings (
      home_id TEXT PRIMARY KEY REFERENCES homes(home_id) ON DELETE CASCADE,
      environment_description TEXT,
      pause_all_wakeups INTEGER CHECK (pause_all_wakeups IN (0, 1)),
      visit_requests_and_invitations_enabled INTEGER
        CHECK (visit_requests_and_invitations_enabled IN (0, 1)),
      activity_invitations_enabled INTEGER CHECK (activity_invitations_enabled IN (0, 1)),
      important_system_notifications_enabled INTEGER
        CHECK (important_system_notifications_enabled IN (0, 1)),
      shared_meme_update_signals_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (shared_meme_update_signals_enabled IN (0, 1)),
      browser_notifications_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (browser_notifications_enabled IN (0, 1)),
      activity_reminders_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (activity_reminders_enabled IN (0, 1)),
      default_connection_duration_minutes INTEGER
        CHECK (default_connection_duration_minutes > 0),
      initial_recent_activity_count INTEGER CHECK (initial_recent_activity_count >= 0),
      chat_mode TEXT CHECK (chat_mode IN ('natural', 'proactive', 'listening')),
      allow_activity_room_warmup INTEGER CHECK (allow_activity_room_warmup IN (0, 1)),
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS browser_push_subscriptions (
      endpoint TEXT NOT NULL,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (endpoint, resident_id, home_id)
    );

    CREATE INDEX IF NOT EXISTS browser_push_subscriptions_resident
      ON browser_push_subscriptions (resident_id, updated_at DESC, endpoint);

    CREATE TABLE IF NOT EXISTS lingye_daily_issues (
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
      edition_json TEXT NOT NULL,
      CHECK (
        (revision = 1 AND revision_note IS NULL)
        OR (revision > 1 AND revision_note IS NOT NULL AND length(trim(revision_note)) > 0)
      )
    );

    CREATE TABLE IF NOT EXISTS home_weather_state (
      home_id TEXT PRIMARY KEY REFERENCES homes(home_id) ON DELETE CASCADE,
      climate_type TEXT NOT NULL CHECK (climate_type IN (${sqlStringList(climateTypeValues)})),
      weather_revision INTEGER NOT NULL CHECK (weather_revision > 0),
      season_phase TEXT CHECK (
        season_phase IS NULL OR season_phase IN (${sqlStringList(weatherSeasonPhaseValues)})
      ),
      condition TEXT CHECK (
        condition IS NULL OR condition IN (${sqlStringList(weatherConditionValues)})
      ),
      state_started_at INTEGER,
      next_transition_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connector_bindings (
      resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      credential_token_hash TEXT UNIQUE,
      credential_issued_at INTEGER NOT NULL,
      credential_revoked_at INTEGER,
      last_connected_at INTEGER,
      last_online_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS mcp_access_bindings (
      resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE CASCADE,
      migration_id TEXT NOT NULL UNIQUE,
      farm_doorplate TEXT NOT NULL UNIQUE,
      migration_requested_at INTEGER NOT NULL,
      farm_revoked_at INTEGER,
      farm_confirmation_id TEXT UNIQUE,
      credential_id TEXT UNIQUE,
      credential_token_hash TEXT UNIQUE,
      credential_issued_at INTEGER,
      credential_revoked_at INTEGER,
      CHECK (
        (farm_revoked_at IS NULL AND farm_confirmation_id IS NULL)
        OR (farm_revoked_at IS NOT NULL AND farm_confirmation_id IS NOT NULL)
      ),
      CHECK (
        (credential_id IS NULL
          AND credential_token_hash IS NULL
          AND credential_issued_at IS NULL
          AND credential_revoked_at IS NULL)
        OR (credential_id IS NOT NULL
          AND credential_issued_at IS NOT NULL
          AND (
            (credential_token_hash IS NOT NULL AND credential_revoked_at IS NULL)
            OR (credential_token_hash IS NULL AND credential_revoked_at IS NOT NULL)
          ))
      ),
      CHECK (
        credential_token_hash IS NULL
        OR (
          farm_revoked_at IS NOT NULL
          AND farm_confirmation_id IS NOT NULL
          AND length(credential_token_hash) = 64
          AND credential_token_hash NOT GLOB '*[^0-9a-f]*'
        )
      )
    );

    CREATE TABLE IF NOT EXISTS connector_delivery_state (
      resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE CASCADE,
      last_event_cursor INTEGER NOT NULL DEFAULT 0 CHECK (last_event_cursor >= 0),
      last_acked_cursor INTEGER NOT NULL DEFAULT 0 CHECK (
        last_acked_cursor >= 0 AND last_acked_cursor <= last_event_cursor
      )
    );

    CREATE TABLE IF NOT EXISTS connector_events (
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      cursor INTEGER NOT NULL CHECK (cursor > 0),
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (resident_id, cursor)
    );

    CREATE TABLE IF NOT EXISTS mailbox_letters (
      letter_id TEXT PRIMARY KEY,
      home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN (${sqlStringList(mailboxCategoryValues)})),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      attachment_type TEXT CHECK (
        attachment_type IS NULL OR attachment_type = 'farm_reward'
      ),
      attachment_status TEXT CHECK (
        attachment_status IS NULL OR attachment_status IN ('available', 'claimed')
      ),
      created_at INTEGER NOT NULL,
      UNIQUE (home_id, idempotency_key),
      CHECK (
        (attachment_type IS NULL AND attachment_status IS NULL)
        OR (attachment_type IS NOT NULL AND attachment_status IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS mailbox_letters_home_created
      ON mailbox_letters (home_id, created_at DESC, letter_id DESC);

    CREATE INDEX IF NOT EXISTS mailbox_letters_home_category_created
      ON mailbox_letters (home_id, category, created_at DESC, letter_id DESC);

    CREATE TABLE IF NOT EXISTS mailbox_read_states (
      letter_id TEXT NOT NULL REFERENCES mailbox_letters(letter_id) ON DELETE CASCADE,
      audience TEXT NOT NULL CHECK (audience IN ('human', 'resident')),
      read_at INTEGER NOT NULL,
      PRIMARY KEY (letter_id, audience)
    );

    CREATE TABLE IF NOT EXISTS bell_bindings (
      resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      credential_token_hash TEXT UNIQUE,
      credential_issued_at INTEGER NOT NULL,
      credential_revoked_at INTEGER,
      last_connected_at INTEGER,
      last_wake_mailbox_revision INTEGER CHECK (
        last_wake_mailbox_revision IS NULL OR last_wake_mailbox_revision >= 0
      ),
      CHECK (
        (credential_token_hash IS NOT NULL
          AND credential_revoked_at IS NULL
          AND length(credential_token_hash) = 64
          AND credential_token_hash NOT GLOB '*[^0-9a-f]*')
        OR (credential_token_hash IS NULL AND credential_revoked_at IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS bell_wakes (
      wake_id TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      reason TEXT NOT NULL CHECK (
        reason IN ('mailbox_unread', 'farm_purchase_request', 'career_exam_reminder')
      ),
      status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
      created_at INTEGER NOT NULL,
      ended_at INTEGER,
      block_reason TEXT,
      error_code TEXT,
      purchase_request_id TEXT,
      letter_id TEXT REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
      payload_json TEXT,
      CHECK (
        (status = 'pending' AND ended_at IS NULL AND block_reason IS NULL AND error_code IS NULL)
        OR (status = 'acked' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
        OR (status = 'blocked' AND ended_at IS NOT NULL AND block_reason IS NOT NULL AND error_code IS NOT NULL)
        OR (status = 'cancelled' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
      ),
      CHECK (
        (reason = 'mailbox_unread'
          AND purchase_request_id IS NULL
          AND letter_id IS NULL
          AND payload_json IS NULL)
        OR (reason = 'farm_purchase_request'
          AND purchase_request_id IS NOT NULL
          AND letter_id IS NULL
          AND payload_json IS NOT NULL)
        OR (reason = 'career_exam_reminder'
          AND purchase_request_id IS NULL
          AND letter_id IS NOT NULL
          AND payload_json IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS career_job_wakes (
      wake_id TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      letter_id TEXT NOT NULL UNIQUE REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
      created_at INTEGER NOT NULL,
      ended_at INTEGER,
      block_reason TEXT,
      error_code TEXT,
      payload_json TEXT NOT NULL,
      CHECK (
        (status = 'pending' AND ended_at IS NULL AND block_reason IS NULL AND error_code IS NULL)
        OR (status = 'acked' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
        OR (status = 'blocked' AND ended_at IS NOT NULL AND block_reason IS NOT NULL AND error_code IS NOT NULL)
        OR (status = 'cancelled' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS career_job_wakes_resident_status
      ON career_job_wakes (resident_id, status, created_at, wake_id);

    CREATE TABLE IF NOT EXISTS career_exam_reminders (
      attempt_id TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
      scheduled_at INTEGER NOT NULL,
      remind_at INTEGER NOT NULL CHECK (remind_at = scheduled_at - 300000),
      status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
      letter_id TEXT UNIQUE REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
      wake_id TEXT UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
      created_at INTEGER NOT NULL,
      delivered_at INTEGER,
      cancelled_at INTEGER,
      CHECK (
        (status = 'scheduled'
          AND letter_id IS NULL
          AND wake_id IS NULL
          AND delivered_at IS NULL
          AND cancelled_at IS NULL)
        OR (status = 'delivered'
          AND letter_id IS NOT NULL
          AND wake_id IS NOT NULL
          AND delivered_at IS NOT NULL
          AND cancelled_at IS NULL)
        OR (status = 'cancelled'
          AND letter_id IS NULL
          AND wake_id IS NULL
          AND delivered_at IS NULL
          AND cancelled_at IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS career_exam_reminders_due
      ON career_exam_reminders (status, remind_at, attempt_id);

    CREATE TABLE IF NOT EXISTS activity_reminders (
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
      farm_doorplate TEXT NOT NULL REFERENCES farm_bindings(farm_doorplate) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('crop_matured', 'glimmer_capture_ready')),
      source_key TEXT NOT NULL,
      ready_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
      created_at INTEGER NOT NULL,
      delivered_at INTEGER,
      cancelled_at INTEGER,
      PRIMARY KEY (resident_id, home_id, farm_doorplate, kind, source_key),
      CHECK (
        (status = 'scheduled' AND delivered_at IS NULL AND cancelled_at IS NULL)
        OR (status = 'delivered' AND delivered_at IS NOT NULL AND cancelled_at IS NULL)
        OR (status = 'cancelled' AND delivered_at IS NULL AND cancelled_at IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS activity_reminders_due
      ON activity_reminders (
        status, ready_at, resident_id, home_id, farm_doorplate, kind, source_key
      );

    CREATE TABLE IF NOT EXISTS farm_purchase_requests (
      request_id TEXT PRIMARY KEY,
      wake_id TEXT NOT NULL UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL,
      shop TEXT NOT NULL CHECK (shop IN ('field', 'ranch')),
      shop_revision TEXT NOT NULL,
      human_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN (
          'requested',
          'processing',
          'completed',
          'partially_completed',
          'declined',
          'expired',
          'failed'
        )
      ),
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
      payload_hash TEXT NOT NULL,
      UNIQUE (resident_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS farm_purchase_requests_resident_created
      ON farm_purchase_requests (resident_id, created_at DESC, request_id DESC);

    CREATE TABLE IF NOT EXISTS farm_purchase_request_items (
      request_id TEXT NOT NULL REFERENCES farm_purchase_requests(request_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      qty INTEGER NOT NULL CHECK (qty > 0),
      display_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('pending', 'settled', 'declined', 'failed', 'expired')
      ),
      settled_qty INTEGER NOT NULL DEFAULT 0 CHECK (settled_qty >= 0 AND settled_qty <= qty),
      receipt_id TEXT,
      reason_code TEXT,
      PRIMARY KEY (request_id, kind, item_id)
    );

    CREATE INDEX IF NOT EXISTS farm_purchase_request_items_request
      ON farm_purchase_request_items (request_id, kind, item_id);

    CREATE TABLE IF NOT EXISTS farm_harvest_requests (
      request_id TEXT PRIMARY KEY,
      wake_id TEXT NOT NULL UNIQUE,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL,
      field_revision TEXT NOT NULL,
      mature_plot_count INTEGER NOT NULL CHECK (mature_plot_count > 0),
      human_name TEXT NOT NULL,
      request_status TEXT NOT NULL CHECK (request_status IN ('requested', 'expired', 'failed')),
      wake_status TEXT NOT NULL CHECK (wake_status IN ('pending', 'acked', 'blocked', 'cancelled')),
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
      ended_at INTEGER,
      block_reason TEXT,
      error_code TEXT,
      payload_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE (resident_id, idempotency_key),
      CHECK (
        (wake_status = 'pending' AND ended_at IS NULL AND block_reason IS NULL AND error_code IS NULL)
        OR (wake_status = 'acked' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
        OR (wake_status = 'blocked' AND ended_at IS NOT NULL AND block_reason IS NOT NULL AND error_code IS NOT NULL)
        OR (wake_status = 'cancelled' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS farm_harvest_requests_resident_created
      ON farm_harvest_requests (resident_id, created_at DESC, request_id DESC);

    CREATE TABLE IF NOT EXISTS farm_plant_requests (
      request_id TEXT PRIMARY KEY,
      wake_id TEXT NOT NULL UNIQUE,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL,
      field_revision TEXT NOT NULL,
      empty_plot_count INTEGER NOT NULL CHECK (empty_plot_count > 0),
      human_name TEXT NOT NULL,
      request_status TEXT NOT NULL CHECK (request_status IN ('requested', 'expired', 'failed')),
      wake_status TEXT NOT NULL CHECK (wake_status IN ('pending', 'acked', 'blocked', 'cancelled')),
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
      ended_at INTEGER,
      block_reason TEXT,
      error_code TEXT,
      payload_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE (resident_id, idempotency_key),
      CHECK (
        (wake_status = 'pending' AND ended_at IS NULL AND block_reason IS NULL AND error_code IS NULL)
        OR (wake_status = 'acked' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
        OR (wake_status = 'blocked' AND ended_at IS NOT NULL AND block_reason IS NOT NULL AND error_code IS NOT NULL)
        OR (wake_status = 'cancelled' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS farm_plant_requests_resident_created
      ON farm_plant_requests (resident_id, created_at DESC, request_id DESC);

    CREATE TABLE IF NOT EXISTS farm_action_lists (
      list_id TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK (revision >= 0),
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      schedule_json TEXT,
      next_trigger_at INTEGER,
      items_json TEXT NOT NULL,
      checked_items_json TEXT NOT NULL,
      checked_at INTEGER,
      last_notification_status TEXT CHECK (
        last_notification_status IS NULL
        OR last_notification_status IN ('sent', 'all_crossed', 'failed')
      ),
      last_notification_at INTEGER,
      updated_at INTEGER NOT NULL,
      CHECK (
        (last_notification_status IS NULL AND last_notification_at IS NULL)
        OR (last_notification_status IS NOT NULL AND last_notification_at IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS farm_action_lists_due
      ON farm_action_lists (enabled, next_trigger_at, resident_id);

    CREATE TABLE IF NOT EXISTS farm_action_list_notifications (
      notification_id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES farm_action_lists(list_id) ON DELETE CASCADE,
      resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
      source_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      list_revision INTEGER NOT NULL CHECK (list_revision >= 0),
      scheduled_for INTEGER,
      notification_status TEXT NOT NULL CHECK (
        notification_status IN ('sent', 'all_crossed', 'failed')
      ),
      wake_id TEXT UNIQUE,
      wake_status TEXT CHECK (
        wake_status IS NULL OR wake_status IN ('pending', 'acked', 'blocked', 'cancelled')
      ),
      ended_at INTEGER,
      block_reason TEXT,
      error_code TEXT,
      payload_json TEXT,
      checked_items_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (list_id, source_key),
      CHECK (
        (notification_status IN ('all_crossed', 'failed')
          AND wake_id IS NULL
          AND wake_status IS NULL
          AND ended_at IS NULL
          AND block_reason IS NULL
          AND error_code IS NULL
          AND payload_json IS NULL)
        OR (notification_status = 'sent'
          AND wake_id IS NOT NULL
          AND payload_json IS NOT NULL
          AND (
            (wake_status = 'pending'
              AND ended_at IS NULL
              AND block_reason IS NULL
              AND error_code IS NULL)
            OR (wake_status = 'acked'
              AND ended_at IS NOT NULL
              AND block_reason IS NULL
              AND error_code IS NULL)
            OR (wake_status = 'blocked'
              AND ended_at IS NOT NULL
              AND block_reason IS NOT NULL
              AND error_code IS NOT NULL)
            OR (wake_status = 'cancelled'
              AND ended_at IS NOT NULL
              AND block_reason IS NULL
              AND error_code IS NULL)
          ))
      )
    );

    CREATE INDEX IF NOT EXISTS farm_action_list_notifications_resident_created
      ON farm_action_list_notifications (resident_id, created_at DESC, notification_id DESC);
  `);
  let migratedSchemaVersion = databaseSchemaVersion;
  if (migratedSchemaVersion < 1) {
    database.transaction(() => {
      const farmBindingColumns = database.pragma("table_info(farm_bindings)") as Array<{
        name: string;
      }>;
      if (!farmBindingColumns.some((column) => column.name === "farm_human_key")) {
        database.exec("ALTER TABLE farm_bindings ADD COLUMN farm_human_key TEXT");
      }
      const humanAccountColumns = database.pragma("table_info(human_accounts)") as Array<{
        name: string;
      }>;
      if (!humanAccountColumns.some((column) => column.name === "password_credential")) {
        database.exec("ALTER TABLE human_accounts ADD COLUMN password_credential TEXT");
      }
      database.pragma("user_version = 1");
    })();
    migratedSchemaVersion = 1;
  }
  if (migratedSchemaVersion < 2) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE human_login_failures (
          account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
          failed_at INTEGER NOT NULL
        );

        CREATE INDEX human_login_failures_account_time
          ON human_login_failures (account_id, failed_at);

        CREATE TABLE human_login_locks (
          account_id TEXT PRIMARY KEY REFERENCES human_accounts(account_id) ON DELETE CASCADE,
          locked_until INTEGER NOT NULL
        );
      `);
      database.pragma("user_version = 2");
    })();
    migratedSchemaVersion = 2;
  }
  if (migratedSchemaVersion < 3) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE connector_delivery_state RENAME TO connector_delivery_state_v2;
        ALTER TABLE connector_events RENAME TO connector_events_v2;

        CREATE TABLE connector_delivery_state (
          generation TEXT NOT NULL CHECK (length(generation) > 0),
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          last_event_cursor INTEGER NOT NULL DEFAULT 0 CHECK (last_event_cursor >= 0),
          last_acked_cursor INTEGER NOT NULL DEFAULT 0 CHECK (
            last_acked_cursor >= 0 AND last_acked_cursor <= last_event_cursor
          ),
          PRIMARY KEY (generation, resident_id)
        );

        CREATE TABLE connector_events (
          generation TEXT NOT NULL CHECK (length(generation) > 0),
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          cursor INTEGER NOT NULL CHECK (cursor > 0),
          event_id TEXT NOT NULL UNIQUE,
          event_type TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (generation, resident_id, cursor)
        );

        INSERT INTO connector_delivery_state (
          generation,
          resident_id,
          last_event_cursor,
          last_acked_cursor
        )
        SELECT '${LEGACY_CONNECTOR_DELIVERY_GENERATION}',
               resident_id,
               last_event_cursor,
               last_acked_cursor
        FROM connector_delivery_state_v2;

        INSERT INTO connector_events (
          generation,
          resident_id,
          cursor,
          event_id,
          event_type,
          created_at,
          payload_json
        )
        SELECT '${LEGACY_CONNECTOR_DELIVERY_GENERATION}',
               resident_id,
               cursor,
               event_id,
               event_type,
               created_at,
               payload_json
        FROM connector_events_v2;

        DROP TABLE connector_events_v2;
        DROP TABLE connector_delivery_state_v2;
      `);
      database.pragma("user_version = 3");
    })();
    migratedSchemaVersion = 3;
  }
  if (migratedSchemaVersion < 4) {
    database.transaction(() => {
      const homeColumns = database.pragma("table_info(homes)") as Array<{
        name: string;
      }>;
      if (!homeColumns.some((column) => column.name === "mailbox_revision")) {
        database.exec(
          "ALTER TABLE homes ADD COLUMN mailbox_revision INTEGER NOT NULL DEFAULT 0 CHECK (mailbox_revision >= 0)",
        );
      }
      database.pragma("user_version = 4");
    })();
    migratedSchemaVersion = 4;
  }
  if (migratedSchemaVersion < 5) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS lingye_daily_issues (
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
          group_chat_json TEXT NOT NULL,
          CHECK (
            (revision = 1 AND revision_note IS NULL)
            OR (revision > 1 AND revision_note IS NOT NULL AND length(trim(revision_note)) > 0)
          )
        );
      `);
      database.pragma("user_version = 5");
    })();
    migratedSchemaVersion = 5;
  }
  if (migratedSchemaVersion < 6) {
    database.transaction(() => {
      const dailyColumns = database.pragma("table_info(lingye_daily_issues)") as Array<{
        name: string;
      }>;
      if (dailyColumns.some((column) => column.name === "group_chat_json")) {
        const legacyRows = database
          .prepare(
            `SELECT issue_date,
                    issue_number,
                    revision,
                    revision_note,
                    period_start,
                    period_end,
                    coverage_status,
                    coverage_note,
                    generated_at,
                    published_at,
                    editor_model,
                    screening_model,
                    group_chat_json
             FROM lingye_daily_issues`,
          )
          .all() as Array<Omit<LingyeDailyIssueRow, "edition_json"> & { group_chat_json: string }>;
        database.exec(`
          CREATE TABLE lingye_daily_issues_v6 (
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
            edition_json TEXT NOT NULL,
            CHECK (
              (revision = 1 AND revision_note IS NULL)
              OR (revision > 1 AND revision_note IS NOT NULL AND length(trim(revision_note)) > 0)
            )
          );
        `);
        const insert = database.prepare(
          `INSERT INTO lingye_daily_issues_v6 (
             issue_date,
             issue_number,
             revision,
             revision_note,
             period_start,
             period_end,
             coverage_status,
             coverage_note,
             generated_at,
             published_at,
             editor_model,
             screening_model,
             edition_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const row of legacyRows) {
          const legacyGroupChat = JSON.parse(row.group_chat_json) as {
            summary: string;
            topic_sources: LingyeDailyEditionPublish["group_chat"]["topics"];
          };
          const edition = lingyeDailyEditionPublishSchema.parse({
            front_page: null,
            group_chat: {
              summary: legacyGroupChat.summary,
              topics: legacyGroupChat.topic_sources,
            },
            behavior_slices: [],
            quotes: [],
            farm_observation: null,
            submissions: [],
            tomorrow_question: null,
            images: [],
          });
          insert.run(
            row.issue_date,
            row.issue_number,
            row.revision,
            row.revision_note,
            row.period_start,
            row.period_end,
            row.coverage_status,
            row.coverage_note,
            row.generated_at,
            row.published_at,
            row.editor_model,
            row.screening_model,
            JSON.stringify(edition),
          );
        }
        database.exec(`
          DROP TABLE lingye_daily_issues;
          ALTER TABLE lingye_daily_issues_v6 RENAME TO lingye_daily_issues;
        `);
      }
      database.pragma("user_version = 6");
    })();
    migratedSchemaVersion = 6;
  }
  if (migratedSchemaVersion < 7) {
    database.transaction(() => {
      const wakeColumns = database.pragma("table_info(bell_wakes)") as Array<{
        name: string;
      }>;
      const hasPurchaseRequestId = wakeColumns.some(
        (column) => column.name === "purchase_request_id",
      );
      const hasPayloadJson = wakeColumns.some((column) => column.name === "payload_json");
      const legacyRows =
        !hasPurchaseRequestId || !hasPayloadJson
          ? (database
              .prepare(
                `SELECT wake_id,
                        resident_id,
                        reason,
                        status,
                        created_at,
                        ended_at,
                        block_reason,
                        error_code,
                        ${hasPurchaseRequestId ? "purchase_request_id" : "NULL AS purchase_request_id"},
                        ${hasPayloadJson ? "payload_json" : "NULL AS payload_json"}
                 FROM bell_wakes`,
              )
              .all() as BellWakeRow[])
          : [];

      if (legacyRows.length > 0 || !hasPurchaseRequestId || !hasPayloadJson) {
        database.exec(`
        DROP INDEX IF EXISTS bell_wakes_one_pending_per_resident;
        DROP INDEX IF EXISTS bell_wakes_one_purchase_request;
        ALTER TABLE bell_wakes RENAME TO bell_wakes_v6;

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
          payload_json TEXT,
          CHECK (
            (status = 'pending' AND ended_at IS NULL AND block_reason IS NULL AND error_code IS NULL)
            OR (status = 'acked' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
            OR (status = 'blocked' AND ended_at IS NOT NULL AND block_reason IS NOT NULL AND error_code IS NOT NULL)
            OR (status = 'cancelled' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
          ),
          CHECK (
            (reason = 'mailbox_unread' AND purchase_request_id IS NULL AND payload_json IS NULL)
            OR (reason = 'farm_purchase_request'
              AND purchase_request_id IS NOT NULL
              AND payload_json IS NOT NULL)
          )
        );
      `);
        const insertWake = database.prepare(
          `INSERT INTO bell_wakes (
             wake_id,
             resident_id,
             reason,
             status,
             created_at,
             ended_at,
             block_reason,
             error_code,
             purchase_request_id,
             payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const row of legacyRows) {
          insertWake.run(
            row.wake_id,
            row.resident_id,
            row.reason,
            row.status,
            row.created_at,
            row.ended_at,
            row.block_reason,
            row.error_code,
            row.purchase_request_id,
            row.payload_json,
          );
        }
        database.exec(`
        DROP TABLE bell_wakes_v6;
        CREATE UNIQUE INDEX IF NOT EXISTS bell_wakes_one_purchase_request
          ON bell_wakes (purchase_request_id)
          WHERE purchase_request_id IS NOT NULL;
      `);
      }
      database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS bell_wakes_one_purchase_request
          ON bell_wakes (purchase_request_id)
          WHERE purchase_request_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS farm_purchase_requests (
          request_id TEXT PRIMARY KEY,
          wake_id TEXT NOT NULL UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
          idempotency_key TEXT NOT NULL,
          shop TEXT NOT NULL CHECK (shop IN ('field', 'ranch')),
          shop_revision TEXT NOT NULL,
          human_name TEXT NOT NULL,
          status TEXT NOT NULL CHECK (
            status IN (
              'requested',
              'processing',
              'completed',
              'partially_completed',
              'declined',
              'expired',
              'failed'
            )
          ),
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
          payload_hash TEXT NOT NULL,
          UNIQUE (resident_id, idempotency_key)
        );

        CREATE INDEX IF NOT EXISTS farm_purchase_requests_resident_created
          ON farm_purchase_requests (resident_id, created_at DESC, request_id DESC);

        CREATE TABLE IF NOT EXISTS farm_purchase_request_items (
          request_id TEXT NOT NULL REFERENCES farm_purchase_requests(request_id) ON DELETE CASCADE,
          item_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          qty INTEGER NOT NULL CHECK (qty > 0),
          display_name TEXT NOT NULL,
          status TEXT NOT NULL CHECK (
            status IN ('pending', 'settled', 'declined', 'failed', 'expired')
          ),
          settled_qty INTEGER NOT NULL DEFAULT 0 CHECK (settled_qty >= 0 AND settled_qty <= qty),
          receipt_id TEXT,
          reason_code TEXT,
          PRIMARY KEY (request_id, kind, item_id)
        );

        CREATE INDEX IF NOT EXISTS farm_purchase_request_items_request
          ON farm_purchase_request_items (request_id, kind, item_id);
      `);
      database.pragma("user_version = 7");
    })();
    migratedSchemaVersion = 7;
  }
  if (migratedSchemaVersion < 8) {
    const wakeColumns = database.pragma("table_info(bell_wakes)") as Array<{
      name: string;
    }>;
    const hasLetterId = wakeColumns.some((column) => column.name === "letter_id");
    database.pragma("foreign_keys = OFF");
    try {
      database.transaction(() => {
        if (!hasLetterId) {
          database.exec(`
            DROP INDEX IF EXISTS bell_wakes_one_purchase_request;

            CREATE TABLE bell_wakes_v8 (
              wake_id TEXT PRIMARY KEY,
              resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
              reason TEXT NOT NULL CHECK (
                reason IN ('mailbox_unread', 'farm_purchase_request', 'career_exam_reminder')
              ),
              status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
              created_at INTEGER NOT NULL,
              ended_at INTEGER,
              block_reason TEXT,
              error_code TEXT,
              purchase_request_id TEXT,
              letter_id TEXT REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
              payload_json TEXT,
              CHECK (
                (status = 'pending'
                  AND ended_at IS NULL
                  AND block_reason IS NULL
                  AND error_code IS NULL)
                OR (status = 'acked'
                  AND ended_at IS NOT NULL
                  AND block_reason IS NULL
                  AND error_code IS NULL)
                OR (status = 'blocked'
                  AND ended_at IS NOT NULL
                  AND block_reason IS NOT NULL
                  AND error_code IS NOT NULL)
                OR (status = 'cancelled'
                  AND ended_at IS NOT NULL
                  AND block_reason IS NULL
                  AND error_code IS NULL)
              ),
              CHECK (
                (reason = 'mailbox_unread'
                  AND purchase_request_id IS NULL
                  AND letter_id IS NULL
                  AND payload_json IS NULL)
                OR (reason = 'farm_purchase_request'
                  AND purchase_request_id IS NOT NULL
                  AND letter_id IS NULL
                  AND payload_json IS NOT NULL)
                OR (reason = 'career_exam_reminder'
                  AND purchase_request_id IS NULL
                  AND letter_id IS NOT NULL
                  AND payload_json IS NOT NULL)
              )
            );

            INSERT INTO bell_wakes_v8 (
              wake_id,
              resident_id,
              reason,
              status,
              created_at,
              ended_at,
              block_reason,
              error_code,
              purchase_request_id,
              letter_id,
              payload_json
            )
            SELECT wake_id,
                   resident_id,
                   reason,
                   status,
                   created_at,
                   ended_at,
                   block_reason,
                   error_code,
                   purchase_request_id,
                   NULL,
                   payload_json
            FROM bell_wakes;

            DROP TABLE bell_wakes;
            ALTER TABLE bell_wakes_v8 RENAME TO bell_wakes;
          `);
        }
        database.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS bell_wakes_one_purchase_request
            ON bell_wakes (purchase_request_id)
            WHERE purchase_request_id IS NOT NULL;

          CREATE TABLE IF NOT EXISTS career_exam_reminders (
            attempt_id TEXT PRIMARY KEY,
            resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
            home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
            scheduled_at INTEGER NOT NULL,
            remind_at INTEGER NOT NULL CHECK (remind_at = scheduled_at - 300000),
            status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
            letter_id TEXT UNIQUE REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
            wake_id TEXT UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
            created_at INTEGER NOT NULL,
            delivered_at INTEGER,
            cancelled_at INTEGER,
            CHECK (
              (status = 'scheduled'
                AND letter_id IS NULL
                AND wake_id IS NULL
                AND delivered_at IS NULL
                AND cancelled_at IS NULL)
              OR (status = 'delivered'
                AND letter_id IS NOT NULL
                AND wake_id IS NOT NULL
                AND delivered_at IS NOT NULL
                AND cancelled_at IS NULL)
              OR (status = 'cancelled'
                AND letter_id IS NULL
                AND wake_id IS NULL
                AND delivered_at IS NULL
                AND cancelled_at IS NOT NULL)
            )
          );

          CREATE INDEX IF NOT EXISTS career_exam_reminders_due
            ON career_exam_reminders (status, remind_at, attempt_id);
        `);
        database.pragma("user_version = 8");
      })();
    } finally {
      database.pragma("foreign_keys = ON");
    }
    const foreignKeyErrors = database.pragma("foreign_key_check") as unknown[];
    if (foreignKeyErrors.length > 0) {
      throw new Error("Community database schema v8 migration violated foreign keys");
    }
    migratedSchemaVersion = 8;
  }
  if (migratedSchemaVersion < 9) {
    database.transaction(() => {
      const settingsColumns = database.pragma("table_info(human_settings)") as Array<{
        name: string;
      }>;
      if (!settingsColumns.some((column) => column.name === "shared_meme_update_signals_enabled")) {
        database.exec(
          "ALTER TABLE human_settings ADD COLUMN shared_meme_update_signals_enabled INTEGER NOT NULL DEFAULT 1 CHECK (shared_meme_update_signals_enabled IN (0, 1))",
        );
      }
      if (!settingsColumns.some((column) => column.name === "browser_notifications_enabled")) {
        database.exec(
          "ALTER TABLE human_settings ADD COLUMN browser_notifications_enabled INTEGER NOT NULL DEFAULT 0 CHECK (browser_notifications_enabled IN (0, 1))",
        );
      }
      if (!settingsColumns.some((column) => column.name === "activity_reminders_enabled")) {
        database.exec(
          "ALTER TABLE human_settings ADD COLUMN activity_reminders_enabled INTEGER NOT NULL DEFAULT 0 CHECK (activity_reminders_enabled IN (0, 1))",
        );
      }
      database.exec(`
        CREATE TABLE IF NOT EXISTS browser_push_subscriptions (
          endpoint TEXT PRIMARY KEY,
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS browser_push_subscriptions_resident
          ON browser_push_subscriptions (resident_id, updated_at DESC, endpoint);
      `);
      database.pragma("user_version = 9");
    })();
    migratedSchemaVersion = 9;
  }
  if (migratedSchemaVersion < 10) {
    const residentColumns = database.pragma("table_info(residents)") as Array<{
      name: string;
    }>;
    const sessionColumns = database.pragma("table_info(human_sessions)") as Array<{
      name: string;
    }>;
    const hasProfileId = residentColumns.some((column) => column.name === "profile_id");
    const hasActiveProfileId = sessionColumns.some((column) => column.name === "active_profile_id");
    if (!hasProfileId || !hasActiveProfileId) {
      const legacyResidents = database
        .prepare(
          `SELECT resident_id, account_id, resident_name, created_at
           FROM residents
           ORDER BY created_at ASC, resident_id ASC`,
        )
        .all() as Array<{
        resident_id: string;
        account_id: string;
        resident_name: string;
        created_at: number;
      }>;
      const legacySessions = database
        .prepare(
          `SELECT token_hash, account_id, created_at, revoked_at
           FROM human_sessions
           ORDER BY created_at ASC, token_hash ASC`,
        )
        .all() as Array<{
        token_hash: string;
        account_id: string;
        created_at: number;
        revoked_at: number | null;
      }>;
      const legacyFarmCreationRequests = database
        .prepare(
          `SELECT creation_id,
                  qq_number,
                  requested_farm_name,
                  requested_ai_name,
                  requested_human_name,
                  requested_at,
                  farm_doorplate,
                  farm_name,
                  ai_name,
                  human_name,
                  farm_human_key,
                  farm_created_at,
                  completed_at
           FROM farm_creation_requests
           ORDER BY requested_at ASC, creation_id ASC`,
        )
        .all() as FarmCreationRequestRow[];
      const profileByAccount = new Map<string, string>();
      database.pragma("foreign_keys = OFF");
      try {
        database.transaction(() => {
          database.exec(`
            CREATE TABLE residents_v10 (
              resident_id TEXT PRIMARY KEY,
              profile_id TEXT NOT NULL UNIQUE,
              account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
              resident_name TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              UNIQUE (account_id, profile_id)
            );

            CREATE TABLE human_sessions_v10 (
              token_hash TEXT PRIMARY KEY,
              account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
              active_profile_id TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              revoked_at INTEGER,
              FOREIGN KEY (account_id, active_profile_id)
                REFERENCES residents(account_id, profile_id) ON DELETE CASCADE
            );

            CREATE TABLE farm_creation_requests_v10 (
              creation_id TEXT PRIMARY KEY,
              qq_number TEXT NOT NULL,
              requested_farm_name TEXT NOT NULL,
              requested_ai_name TEXT NOT NULL,
              requested_human_name TEXT NOT NULL,
              requested_at INTEGER NOT NULL,
              farm_doorplate TEXT UNIQUE,
              farm_name TEXT,
              ai_name TEXT,
              human_name TEXT,
              farm_human_key TEXT,
              farm_created_at INTEGER,
              completed_at INTEGER,
              CHECK (
                (farm_doorplate IS NULL
                  AND farm_name IS NULL
                  AND ai_name IS NULL
                  AND human_name IS NULL
                  AND farm_human_key IS NULL
                  AND farm_created_at IS NULL
                  AND completed_at IS NULL)
                OR (farm_doorplate IS NOT NULL
                  AND farm_name IS NOT NULL
                  AND ai_name IS NOT NULL
                  AND human_name IS NOT NULL
                  AND farm_human_key IS NOT NULL
                  AND farm_created_at IS NOT NULL
                  AND completed_at IS NULL)
                OR (farm_doorplate IS NOT NULL
                  AND farm_name IS NOT NULL
                  AND ai_name IS NOT NULL
                  AND human_name IS NOT NULL
                  AND farm_human_key IS NULL
                  AND farm_created_at IS NOT NULL
                  AND completed_at IS NOT NULL)
              )
            );
          `);
          const insertResident = database.prepare(
            `INSERT INTO residents_v10 (
               resident_id, profile_id, account_id, resident_name, created_at
             ) VALUES (?, ?, ?, ?, ?)`,
          );
          for (const resident of legacyResidents) {
            const profileId = generateProfileId();
            profileByAccount.set(resident.account_id, profileId);
            insertResident.run(
              resident.resident_id,
              profileId,
              resident.account_id,
              resident.resident_name,
              resident.created_at,
            );
          }
          const insertSession = database.prepare(
            `INSERT INTO human_sessions_v10 (
               token_hash, account_id, active_profile_id, created_at, revoked_at
             ) VALUES (?, ?, ?, ?, ?)`,
          );
          for (const session of legacySessions) {
            const activeProfileId = profileByAccount.get(session.account_id);
            if (!activeProfileId) {
              throw new Error("Human session has no resident profile during schema v10 migration");
            }
            insertSession.run(
              session.token_hash,
              session.account_id,
              activeProfileId,
              session.created_at,
              session.revoked_at,
            );
          }
          const insertCreation = database.prepare(
            `INSERT INTO farm_creation_requests_v10 (
               creation_id,
               qq_number,
               requested_farm_name,
               requested_ai_name,
               requested_human_name,
               requested_at,
               farm_doorplate,
               farm_name,
               ai_name,
               human_name,
               farm_human_key,
               farm_created_at,
               completed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          for (const request of legacyFarmCreationRequests) {
            insertCreation.run(
              request.creation_id,
              request.qq_number,
              request.requested_farm_name,
              request.requested_ai_name,
              request.requested_human_name,
              request.requested_at,
              request.farm_doorplate,
              request.farm_name,
              request.ai_name,
              request.human_name,
              request.farm_human_key,
              request.farm_created_at,
              request.completed_at,
            );
          }
          database.exec(`
            DROP TABLE human_sessions;
            DROP TABLE residents;
            DROP TABLE farm_creation_requests;
            ALTER TABLE residents_v10 RENAME TO residents;
            ALTER TABLE human_sessions_v10 RENAME TO human_sessions;
            ALTER TABLE farm_creation_requests_v10 RENAME TO farm_creation_requests;
            CREATE UNIQUE INDEX farm_creation_requests_one_pending_per_qq
              ON farm_creation_requests (qq_number)
              WHERE completed_at IS NULL;

            CREATE TABLE IF NOT EXISTS activity_reminders (
              resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
              home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
              farm_doorplate TEXT NOT NULL REFERENCES farm_bindings(farm_doorplate) ON DELETE CASCADE,
              kind TEXT NOT NULL CHECK (kind IN ('crop_matured', 'glimmer_capture_ready')),
              source_key TEXT NOT NULL,
              ready_at INTEGER NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
              created_at INTEGER NOT NULL,
              delivered_at INTEGER,
              cancelled_at INTEGER,
              PRIMARY KEY (resident_id, home_id, farm_doorplate, kind, source_key),
              CHECK (
                (status = 'scheduled' AND delivered_at IS NULL AND cancelled_at IS NULL)
                OR (status = 'delivered' AND delivered_at IS NOT NULL AND cancelled_at IS NULL)
                OR (status = 'cancelled' AND delivered_at IS NULL AND cancelled_at IS NOT NULL)
              )
            );

            CREATE INDEX IF NOT EXISTS activity_reminders_due
              ON activity_reminders (
                status, ready_at, resident_id, home_id, farm_doorplate, kind, source_key
              );
          `);
          database.pragma("user_version = 10");
        })();
      } finally {
        database.pragma("foreign_keys = ON");
      }
      const foreignKeyErrors = database.pragma("foreign_key_check") as unknown[];
      if (foreignKeyErrors.length > 0) {
        throw new Error("Community database schema v10 migration violated foreign keys");
      }
    } else {
      database.transaction(() => {
        database.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS farm_creation_requests_one_pending_per_qq
            ON farm_creation_requests (qq_number)
            WHERE completed_at IS NULL;

          CREATE TABLE IF NOT EXISTS activity_reminders (
            resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
            home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
            farm_doorplate TEXT NOT NULL REFERENCES farm_bindings(farm_doorplate) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK (kind IN ('crop_matured', 'glimmer_capture_ready')),
            source_key TEXT NOT NULL,
            ready_at INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
            created_at INTEGER NOT NULL,
            delivered_at INTEGER,
            cancelled_at INTEGER,
            PRIMARY KEY (resident_id, home_id, farm_doorplate, kind, source_key),
            CHECK (
              (status = 'scheduled' AND delivered_at IS NULL AND cancelled_at IS NULL)
              OR (status = 'delivered' AND delivered_at IS NOT NULL AND cancelled_at IS NULL)
              OR (status = 'cancelled' AND delivered_at IS NULL AND cancelled_at IS NOT NULL)
            )
          );

          CREATE INDEX IF NOT EXISTS activity_reminders_due
            ON activity_reminders (
              status, ready_at, resident_id, home_id, farm_doorplate, kind, source_key
            );
        `);
        database.pragma("user_version = 10");
      })();
    }
    migratedSchemaVersion = 10;
  }
  if (migratedSchemaVersion < 11) {
    database.pragma("foreign_keys = OFF");
    try {
      database.transaction(() => {
        database.exec(`
          DROP TABLE IF EXISTS browser_push_subscriptions_v11;
          CREATE TABLE browser_push_subscriptions_v11 (
            endpoint TEXT NOT NULL,
            resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
            home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (endpoint, resident_id, home_id)
          );

          INSERT INTO browser_push_subscriptions_v11 (
            endpoint, resident_id, home_id, p256dh, auth, created_at, updated_at
          )
          SELECT endpoint, resident_id, home_id, p256dh, auth, created_at, updated_at
          FROM browser_push_subscriptions;

          DROP TABLE browser_push_subscriptions;
          ALTER TABLE browser_push_subscriptions_v11 RENAME TO browser_push_subscriptions;
          CREATE INDEX browser_push_subscriptions_resident
            ON browser_push_subscriptions (resident_id, updated_at DESC, endpoint);
        `);
        database.pragma("user_version = 11");
      })();
    } finally {
      database.pragma("foreign_keys = ON");
    }
    const foreignKeyErrors = database.pragma("foreign_key_check") as unknown[];
    if (foreignKeyErrors.length > 0) {
      throw new Error("Community database schema v11 migration violated foreign keys");
    }
    migratedSchemaVersion = 11;
  }
  if (migratedSchemaVersion < 12) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS career_job_wakes (
          wake_id TEXT PRIMARY KEY,
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          letter_id TEXT NOT NULL UNIQUE REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
          status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
          created_at INTEGER NOT NULL,
          ended_at INTEGER,
          block_reason TEXT,
          error_code TEXT,
          payload_json TEXT NOT NULL,
          CHECK (
            (status = 'pending' AND ended_at IS NULL AND block_reason IS NULL AND error_code IS NULL)
            OR (status = 'acked' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
            OR (status = 'blocked' AND ended_at IS NOT NULL AND block_reason IS NOT NULL AND error_code IS NOT NULL)
            OR (status = 'cancelled' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
          )
        );
        CREATE INDEX IF NOT EXISTS career_job_wakes_resident_status
          ON career_job_wakes (resident_id, status, created_at, wake_id);
      `);
      database.pragma("user_version = 12");
    })();
    migratedSchemaVersion = 12;
  }
  if (migratedSchemaVersion < 13) {
    const purchaseRequestForeignKeys = database.pragma(
      "foreign_key_list(farm_purchase_requests)",
    ) as Array<{ from: string; table: string; to: string }>;
    const wakeForeignKey = purchaseRequestForeignKeys.find(
      (foreignKey) => foreignKey.from === "wake_id" && foreignKey.to === "wake_id",
    );
    database.pragma("foreign_keys = OFF");
    try {
      database.transaction(() => {
        if (wakeForeignKey?.table !== "bell_wakes") {
          database.exec(`
            DROP INDEX IF EXISTS farm_purchase_requests_resident_created;
            DROP TABLE IF EXISTS farm_purchase_requests_v13;
            CREATE TABLE farm_purchase_requests_v13 (
              request_id TEXT PRIMARY KEY,
              wake_id TEXT NOT NULL UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
              resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
              home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
              idempotency_key TEXT NOT NULL,
              shop TEXT NOT NULL CHECK (shop IN ('field', 'ranch')),
              shop_revision TEXT NOT NULL,
              human_name TEXT NOT NULL,
              status TEXT NOT NULL CHECK (
                status IN (
                  'requested',
                  'processing',
                  'completed',
                  'partially_completed',
                  'declined',
                  'expired',
                  'failed'
                )
              ),
              created_at INTEGER NOT NULL,
              expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
              payload_hash TEXT NOT NULL,
              UNIQUE (resident_id, idempotency_key)
            );

            INSERT INTO farm_purchase_requests_v13 (
              request_id,
              wake_id,
              resident_id,
              home_id,
              idempotency_key,
              shop,
              shop_revision,
              human_name,
              status,
              created_at,
              expires_at,
              payload_hash
            )
            SELECT request_id,
                   wake_id,
                   resident_id,
                   home_id,
                   idempotency_key,
                   shop,
                   shop_revision,
                   human_name,
                   status,
                   created_at,
                   expires_at,
                   payload_hash
            FROM farm_purchase_requests;

            DROP TABLE farm_purchase_requests;
            ALTER TABLE farm_purchase_requests_v13 RENAME TO farm_purchase_requests;
            CREATE INDEX farm_purchase_requests_resident_created
              ON farm_purchase_requests (resident_id, created_at DESC, request_id DESC);
          `);
        }
        database.pragma("user_version = 13");
      })();
    } finally {
      database.pragma("foreign_keys = ON");
    }
    const foreignKeyErrors = database.pragma("foreign_key_check") as unknown[];
    if (foreignKeyErrors.length > 0) {
      throw new Error("Community database schema v13 migration violated foreign keys");
    }
    migratedSchemaVersion = 13;
  }
  if (migratedSchemaVersion < 14) {
    const reminderForeignKeys = database.pragma(
      "foreign_key_list(career_exam_reminders)",
    ) as Array<{ from: string; table: string; to: string }>;
    const wakeForeignKey = reminderForeignKeys.find(
      (foreignKey) => foreignKey.from === "wake_id" && foreignKey.to === "wake_id",
    );
    database.pragma("foreign_keys = OFF");
    try {
      database.transaction(() => {
        if (wakeForeignKey?.table !== "bell_wakes") {
          database.exec(`
            DROP INDEX IF EXISTS career_exam_reminders_due;
            DROP TABLE IF EXISTS career_exam_reminders_v14;
            CREATE TABLE career_exam_reminders_v14 (
              attempt_id TEXT PRIMARY KEY,
              resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
              home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
              scheduled_at INTEGER NOT NULL,
              remind_at INTEGER NOT NULL CHECK (remind_at = scheduled_at - 300000),
              status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
              letter_id TEXT UNIQUE REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
              wake_id TEXT UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
              created_at INTEGER NOT NULL,
              delivered_at INTEGER,
              cancelled_at INTEGER,
              CHECK (
                (status = 'scheduled'
                  AND letter_id IS NULL
                  AND wake_id IS NULL
                  AND delivered_at IS NULL
                  AND cancelled_at IS NULL)
                OR (status = 'delivered'
                  AND letter_id IS NOT NULL
                  AND wake_id IS NOT NULL
                  AND delivered_at IS NOT NULL
                  AND cancelled_at IS NULL)
                OR (status = 'cancelled'
                  AND letter_id IS NULL
                  AND wake_id IS NULL
                  AND delivered_at IS NULL
                  AND cancelled_at IS NOT NULL)
              )
            );

            INSERT INTO career_exam_reminders_v14 (
              attempt_id,
              resident_id,
              home_id,
              scheduled_at,
              remind_at,
              status,
              letter_id,
              wake_id,
              created_at,
              delivered_at,
              cancelled_at
            )
            SELECT attempt_id,
                   resident_id,
                   home_id,
                   scheduled_at,
                   remind_at,
                   status,
                   letter_id,
                   wake_id,
                   created_at,
                   delivered_at,
                   cancelled_at
            FROM career_exam_reminders;

            DROP TABLE career_exam_reminders;
            ALTER TABLE career_exam_reminders_v14 RENAME TO career_exam_reminders;
            CREATE INDEX career_exam_reminders_due
              ON career_exam_reminders (status, remind_at, attempt_id);
          `);
        }
        database.pragma("user_version = 14");
      })();
    } finally {
      database.pragma("foreign_keys = ON");
    }
    const foreignKeyErrors = database.pragma("foreign_key_check") as unknown[];
    if (foreignKeyErrors.length > 0) {
      throw new Error("Community database schema v14 migration violated foreign keys");
    }
    migratedSchemaVersion = 14;
  }
  if (migratedSchemaVersion < 15) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS qq_group_member_snapshots (
          group_id TEXT NOT NULL,
          qq_number TEXT NOT NULL,
          captured_at INTEGER NOT NULL,
          PRIMARY KEY (group_id, qq_number)
        );
      `);
      database.pragma("user_version = 15");
    })();
    migratedSchemaVersion = 15;
  }
  if (migratedSchemaVersion < 16) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS farm_harvest_requests (
          request_id TEXT PRIMARY KEY,
          wake_id TEXT NOT NULL UNIQUE,
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
          idempotency_key TEXT NOT NULL,
          field_revision TEXT NOT NULL,
          mature_plot_count INTEGER NOT NULL CHECK (mature_plot_count > 0),
          human_name TEXT NOT NULL,
          request_status TEXT NOT NULL CHECK (
            request_status IN ('requested', 'expired', 'failed')
          ),
          wake_status TEXT NOT NULL CHECK (
            wake_status IN ('pending', 'acked', 'blocked', 'cancelled')
          ),
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
          ended_at INTEGER,
          block_reason TEXT,
          error_code TEXT,
          payload_hash TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          UNIQUE (resident_id, idempotency_key),
          CHECK (
            (wake_status = 'pending'
              AND ended_at IS NULL
              AND block_reason IS NULL
              AND error_code IS NULL)
            OR (wake_status = 'acked'
              AND ended_at IS NOT NULL
              AND block_reason IS NULL
              AND error_code IS NULL)
            OR (wake_status = 'blocked'
              AND ended_at IS NOT NULL
              AND block_reason IS NOT NULL
              AND error_code IS NOT NULL)
            OR (wake_status = 'cancelled'
              AND ended_at IS NOT NULL
              AND block_reason IS NULL
              AND error_code IS NULL)
          )
        );

        CREATE INDEX IF NOT EXISTS farm_harvest_requests_resident_created
          ON farm_harvest_requests (resident_id, created_at DESC, request_id DESC);
      `);
      database.pragma("user_version = 16");
    })();
    migratedSchemaVersion = 16;
  }
  if (migratedSchemaVersion < 17) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS farm_plant_requests (
          request_id TEXT PRIMARY KEY,
          wake_id TEXT NOT NULL UNIQUE,
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
          idempotency_key TEXT NOT NULL,
          field_revision TEXT NOT NULL,
          empty_plot_count INTEGER NOT NULL CHECK (empty_plot_count > 0),
          human_name TEXT NOT NULL,
          request_status TEXT NOT NULL CHECK (
            request_status IN ('requested', 'expired', 'failed')
          ),
          wake_status TEXT NOT NULL CHECK (
            wake_status IN ('pending', 'acked', 'blocked', 'cancelled')
          ),
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
          ended_at INTEGER,
          block_reason TEXT,
          error_code TEXT,
          payload_hash TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          UNIQUE (resident_id, idempotency_key),
          CHECK (
            (wake_status = 'pending'
              AND ended_at IS NULL
              AND block_reason IS NULL
              AND error_code IS NULL)
            OR (wake_status = 'acked'
              AND ended_at IS NOT NULL
              AND block_reason IS NULL
              AND error_code IS NULL)
            OR (wake_status = 'blocked'
              AND ended_at IS NOT NULL
              AND block_reason IS NOT NULL
              AND error_code IS NOT NULL)
            OR (wake_status = 'cancelled'
              AND ended_at IS NOT NULL
              AND block_reason IS NULL
              AND error_code IS NULL)
          )
        );

        CREATE INDEX IF NOT EXISTS farm_plant_requests_resident_created
          ON farm_plant_requests (resident_id, created_at DESC, request_id DESC);
      `);
      database.pragma("user_version = 17");
    })();
    migratedSchemaVersion = 17;
  }
  if (migratedSchemaVersion < 18) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS farm_action_lists (
          list_id TEXT PRIMARY KEY,
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          revision INTEGER NOT NULL CHECK (revision >= 0),
          name TEXT NOT NULL,
          enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
          schedule_json TEXT,
          next_trigger_at INTEGER,
          items_json TEXT NOT NULL,
          checked_items_json TEXT NOT NULL,
          checked_at INTEGER,
          last_notification_status TEXT CHECK (
            last_notification_status IS NULL
            OR last_notification_status IN ('sent', 'all_crossed', 'failed')
          ),
          last_notification_at INTEGER,
          updated_at INTEGER NOT NULL,
          CHECK (
            (last_notification_status IS NULL AND last_notification_at IS NULL)
            OR (last_notification_status IS NOT NULL AND last_notification_at IS NOT NULL)
          )
        );

        CREATE INDEX IF NOT EXISTS farm_action_lists_due
          ON farm_action_lists (enabled, next_trigger_at, resident_id);

        CREATE TABLE IF NOT EXISTS farm_action_list_notifications (
          notification_id TEXT PRIMARY KEY,
          list_id TEXT NOT NULL REFERENCES farm_action_lists(list_id) ON DELETE CASCADE,
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          source_key TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          list_revision INTEGER NOT NULL CHECK (list_revision >= 0),
          scheduled_for INTEGER,
          notification_status TEXT NOT NULL CHECK (
            notification_status IN ('sent', 'all_crossed', 'failed')
          ),
          wake_id TEXT UNIQUE,
          wake_status TEXT CHECK (
            wake_status IS NULL OR wake_status IN ('pending', 'acked', 'blocked', 'cancelled')
          ),
          ended_at INTEGER,
          block_reason TEXT,
          error_code TEXT,
          payload_json TEXT,
          checked_items_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE (list_id, source_key),
          CHECK (
            (notification_status IN ('all_crossed', 'failed')
              AND wake_id IS NULL
              AND wake_status IS NULL
              AND ended_at IS NULL
              AND block_reason IS NULL
              AND error_code IS NULL
              AND payload_json IS NULL)
            OR (notification_status = 'sent'
              AND wake_id IS NOT NULL
              AND payload_json IS NOT NULL
              AND (
                (wake_status = 'pending'
                  AND ended_at IS NULL
                  AND block_reason IS NULL
                  AND error_code IS NULL)
                OR (wake_status = 'acked'
                  AND ended_at IS NOT NULL
                  AND block_reason IS NULL
                  AND error_code IS NULL)
                OR (wake_status = 'blocked'
                  AND ended_at IS NOT NULL
                  AND block_reason IS NOT NULL
                  AND error_code IS NOT NULL)
                OR (wake_status = 'cancelled'
                  AND ended_at IS NOT NULL
                  AND block_reason IS NULL
                  AND error_code IS NULL)
              ))
          )
        );

        CREATE INDEX IF NOT EXISTS farm_action_list_notifications_resident_created
          ON farm_action_list_notifications (resident_id, created_at DESC, notification_id DESC);
      `);
      database.pragma("user_version = 18");
    })();
    migratedSchemaVersion = 18;
  }
  if (migratedSchemaVersion < 19) {
    database.pragma("foreign_keys = OFF");
    try {
      database.transaction(() => {
        database.exec(`
          DROP INDEX IF EXISTS bell_wakes_one_purchase_request;

          CREATE TABLE bell_wakes_v19 (
            wake_id TEXT PRIMARY KEY,
            resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
            reason TEXT NOT NULL CHECK (
              reason IN (
                'mailbox_unread',
                'farm_purchase_request',
                'career_exam_reminder',
                'reporter_newsroom_work'
              )
            ),
            status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
            created_at INTEGER NOT NULL,
            ended_at INTEGER,
            block_reason TEXT,
            error_code TEXT,
            purchase_request_id TEXT,
            letter_id TEXT REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
            payload_json TEXT,
            CHECK (
              (status = 'pending' AND ended_at IS NULL AND block_reason IS NULL AND error_code IS NULL)
              OR (status = 'acked' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
              OR (status = 'blocked' AND ended_at IS NOT NULL AND block_reason IS NOT NULL AND error_code IS NOT NULL)
              OR (status = 'cancelled' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
            ),
            CHECK (
              (reason = 'mailbox_unread'
                AND purchase_request_id IS NULL
                AND letter_id IS NULL
                AND payload_json IS NULL)
              OR (reason = 'farm_purchase_request'
                AND purchase_request_id IS NOT NULL
                AND letter_id IS NULL
                AND payload_json IS NOT NULL)
              OR (reason = 'career_exam_reminder'
                AND purchase_request_id IS NULL
                AND letter_id IS NOT NULL
                AND payload_json IS NOT NULL)
              OR (reason = 'reporter_newsroom_work'
                AND purchase_request_id IS NULL
                AND letter_id IS NULL
                AND payload_json IS NOT NULL)
            )
          );

          INSERT INTO bell_wakes_v19 (
            wake_id,
            resident_id,
            reason,
            status,
            created_at,
            ended_at,
            block_reason,
            error_code,
            purchase_request_id,
            letter_id,
            payload_json
          )
          SELECT wake_id,
                 resident_id,
                 reason,
                 status,
                 created_at,
                 ended_at,
                 block_reason,
                 error_code,
                 purchase_request_id,
                 letter_id,
                 payload_json
          FROM bell_wakes;

          DROP TABLE bell_wakes;
          ALTER TABLE bell_wakes_v19 RENAME TO bell_wakes;

          CREATE UNIQUE INDEX bell_wakes_one_purchase_request
            ON bell_wakes (purchase_request_id)
            WHERE purchase_request_id IS NOT NULL;
        `);
        database.pragma("user_version = 19");
      })();
    } finally {
      database.pragma("foreign_keys = ON");
    }
    const foreignKeyErrors = database.pragma("foreign_key_check") as unknown[];
    if (foreignKeyErrors.length > 0) {
      throw new Error("Community database schema v19 migration violated foreign keys");
    }
    migratedSchemaVersion = 19;
  }
  if (migratedSchemaVersion < 20) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE lingye_daily_submissions (
          submission_id TEXT PRIMARY KEY,
          resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
          question_issue_date TEXT NOT NULL REFERENCES lingye_daily_issues(issue_date) ON DELETE CASCADE,
          question_text TEXT NOT NULL,
          body TEXT NOT NULL,
          source_label TEXT NOT NULL,
          received_at INTEGER NOT NULL,
          target_issue_date TEXT NOT NULL,
          UNIQUE(resident_id, question_issue_date, question_text, body)
        );
        CREATE INDEX lingye_daily_submissions_target ON lingye_daily_submissions(target_issue_date, received_at);
        CREATE TABLE lingye_daily_submission_batches (
          issue_date TEXT PRIMARY KEY,
          reviewer_resident_id TEXT NOT NULL,
          option_id TEXT NOT NULL UNIQUE,
          candidate_ids_json TEXT NOT NULL,
          selected_ids_json TEXT,
          decided_at INTEGER
        );
        CREATE TABLE lingye_daily_submission_rewards (
          submission_id TEXT PRIMARY KEY REFERENCES lingye_daily_submissions(submission_id) ON DELETE CASCADE,
          issue_date TEXT NOT NULL REFERENCES lingye_daily_issues(issue_date) ON DELETE CASCADE,
          paid_at INTEGER
        );
        CREATE TABLE lingye_daily_submission_review_options (
          wake_id TEXT PRIMARY KEY,
          option_id TEXT NOT NULL,
          include_candidates INTEGER NOT NULL CHECK (include_candidates IN (0, 1)),
          issue_date TEXT NOT NULL REFERENCES lingye_daily_submission_batches(issue_date) ON DELETE CASCADE
        );
        CREATE INDEX lingye_daily_submission_review_option_lookup ON lingye_daily_submission_review_options(option_id);
      `);
      database.pragma("user_version = 20");
    })();
  }
  if (migratedSchemaVersion < 21) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS human_bulletin_announcements (
          announcement_id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, published_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS human_bulletin_reads (
          account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
          notice_id TEXT NOT NULL, read_at INTEGER NOT NULL, PRIMARY KEY(account_id,notice_id)
        );
      `);
      database.pragma("user_version = 21");
    })();
  }
  if (migratedSchemaVersion < 22) {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE lingye_daily_editor_drafts (
          issue_date TEXT PRIMARY KEY, input_json TEXT NOT NULL, edition_json TEXT NOT NULL,
          document_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL,
          updated_by TEXT, published_version INTEGER, publication_synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE lingye_daily_editor_history (
          issue_date TEXT NOT NULL, version INTEGER NOT NULL, document_json TEXT NOT NULL,
          saved_at INTEGER NOT NULL, saved_by TEXT, PRIMARY KEY(issue_date, version)
        );
        CREATE TABLE lingye_daily_editor_sources (
          source_id INTEGER PRIMARY KEY, issue_date TEXT NOT NULL, kind TEXT NOT NULL,
          source_json TEXT NOT NULL, received_at INTEGER NOT NULL
        );
        CREATE TABLE lingye_daily_editor_rewards (
          submission_id TEXT PRIMARY KEY REFERENCES lingye_daily_submissions(submission_id),
          issue_date TEXT NOT NULL, requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL,
          paid_at INTEGER
        );
      `);
      database.pragma("user_version = 22");
    })();
  }
  database.transaction(() => {
    const itemColumns = database.pragma("table_info(farm_purchase_request_items)") as Array<{
      name: string;
    }>;
    if (!itemColumns.some((column) => column.name === "settled_qty")) {
      database.exec(
        "ALTER TABLE farm_purchase_request_items ADD COLUMN settled_qty INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (!itemColumns.some((column) => column.name === "receipt_id")) {
      database.exec("ALTER TABLE farm_purchase_request_items ADD COLUMN receipt_id TEXT");
    }
    if (!itemColumns.some((column) => column.name === "reason_code")) {
      database.exec("ALTER TABLE farm_purchase_request_items ADD COLUMN reason_code TEXT");
    }
  })();
  database.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS bell_wakes_one_purchase_request ON bell_wakes (purchase_request_id) WHERE purchase_request_id IS NOT NULL",
  );
}
