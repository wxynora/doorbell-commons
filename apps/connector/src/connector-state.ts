import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type ConnectorEventEnvelope,
  type ConnectorLocalConnectionState,
  type ConnectorLocalSharedMemeSync,
  type ConnectorLocalStatus,
  connectorEventEnvelopeSchema,
  connectorWelcomeMessage,
} from "@doorbell/protocol";
import Database from "better-sqlite3";

interface ConnectorStateRow {
  last_persisted_cursor: number;
  last_connected_at: number | null;
  last_error_code: string | null;
  welcome_received: number;
}

interface ConnectorEventRow {
  event_id: string;
  cursor: number;
  event_type: string;
  created_at: string;
  payload_json: string;
}

interface SharedMemeSyncRow {
  sync_status: "not_synced" | "syncing" | "synced" | "error";
  applied_version: number | null;
  entry_count: number;
  checksum_sha256: string | null;
  size_bytes: number | null;
  schema_version: number | null;
  last_synced_at: number | null;
  last_error_code: string | null;
}

export interface SharedMemeAppliedState {
  appliedVersion: number | null;
  entryCount: number;
  checksumSha256: string | null;
  sizeBytes: number | null;
  schemaVersion: number | null;
  lastSyncedAt: number | null;
}

export interface PersistConnectorEventResult {
  status: "persisted" | "duplicate" | "gap";
  lastPersistedCursor: number;
}

function mapEvent(row: ConnectorEventRow): ConnectorEventEnvelope {
  const payload = JSON.parse(row.payload_json) as unknown;
  return connectorEventEnvelopeSchema.parse({
    event_id: row.event_id,
    cursor: row.cursor,
    event_type: row.event_type,
    created_at: row.created_at,
    payload,
  });
}

export class ConnectorStateDatabase {
  readonly #database: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    }
    this.#database = new Database(databasePath);
    if (databasePath !== ":memory:") {
      chmodSync(databasePath, 0o600);
    }
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS connector_state (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        last_persisted_cursor INTEGER NOT NULL CHECK (last_persisted_cursor >= 0),
        last_connected_at INTEGER,
        last_error_code TEXT,
        welcome_received INTEGER NOT NULL CHECK (welcome_received IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS connector_events (
        cursor INTEGER PRIMARY KEY CHECK (cursor > 0),
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        received_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shared_meme_sync_state (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        sync_status TEXT NOT NULL CHECK (sync_status IN ('not_synced', 'syncing', 'synced', 'error')),
        applied_version INTEGER,
        entry_count INTEGER NOT NULL CHECK (entry_count >= 0),
        checksum_sha256 TEXT,
        size_bytes INTEGER,
        schema_version INTEGER,
        last_synced_at INTEGER,
        last_error_code TEXT
      );

      INSERT INTO connector_state (
        singleton_id,
        last_persisted_cursor,
        last_connected_at,
        last_error_code,
        welcome_received
      ) VALUES (1, 0, NULL, NULL, 0)
      ON CONFLICT(singleton_id) DO NOTHING;

      INSERT INTO shared_meme_sync_state (
        singleton_id,
        sync_status,
        applied_version,
        entry_count,
        checksum_sha256,
        size_bytes,
        schema_version,
        last_synced_at,
        last_error_code
      ) VALUES (1, 'not_synced', NULL, 0, NULL, NULL, NULL, NULL, NULL)
      ON CONFLICT(singleton_id) DO NOTHING;

      UPDATE shared_meme_sync_state
      SET sync_status = 'error',
          last_error_code = 'sync_interrupted'
      WHERE singleton_id = 1
        AND sync_status = 'syncing';
    `);
  }

  close(): void {
    this.#database.close();
  }

  getLastPersistedCursor(): number {
    return this.#state().last_persisted_cursor;
  }

  persistEvent(event: ConnectorEventEnvelope, receivedAt: number): PersistConnectorEventResult {
    const validated = connectorEventEnvelopeSchema.parse(event);
    const transaction = this.#database.transaction(() => {
      const state = this.#state();
      const existingByCursor = this.#database
        .prepare(
          `SELECT event_id, cursor, event_type, created_at, payload_json
           FROM connector_events
           WHERE cursor = ?`,
        )
        .get(validated.cursor) as ConnectorEventRow | undefined;

      if (validated.cursor <= state.last_persisted_cursor) {
        return {
          status:
            existingByCursor?.event_id === validated.event_id
              ? ("duplicate" as const)
              : ("gap" as const),
          lastPersistedCursor: state.last_persisted_cursor,
        };
      }
      if (validated.cursor !== state.last_persisted_cursor + 1 || existingByCursor) {
        return { status: "gap" as const, lastPersistedCursor: state.last_persisted_cursor };
      }

      this.#database
        .prepare(
          `INSERT INTO connector_events (
             cursor,
             event_id,
             event_type,
             created_at,
             payload_json,
             received_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          validated.cursor,
          validated.event_id,
          validated.event_type,
          validated.created_at,
          JSON.stringify(validated.payload),
          receivedAt,
        );
      this.#database
        .prepare(
          `UPDATE connector_state
           SET last_persisted_cursor = ?
           WHERE singleton_id = 1`,
        )
        .run(validated.cursor);
      return { status: "persisted" as const, lastPersistedCursor: validated.cursor };
    });
    return transaction.immediate();
  }

  listEventsAfter(afterCursor: number): ConnectorEventEnvelope[] {
    const rows = this.#database
      .prepare(
        `SELECT event_id, cursor, event_type, created_at, payload_json
         FROM connector_events
         WHERE cursor > ?
         ORDER BY cursor ASC`,
      )
      .all(afterCursor) as ConnectorEventRow[];
    return rows.map(mapEvent);
  }

  recordConnected(now: number): void {
    this.#database
      .prepare(
        `UPDATE connector_state
         SET last_connected_at = ?,
             last_error_code = NULL,
             welcome_received = 1
         WHERE singleton_id = 1`,
      )
      .run(now);
  }

  recordError(code: string): void {
    this.#database
      .prepare(
        `UPDATE connector_state
         SET last_error_code = ?
         WHERE singleton_id = 1`,
      )
      .run(code);
  }

  getStatus(connectionState: ConnectorLocalConnectionState): ConnectorLocalStatus {
    const state = this.#state();
    return {
      connection_state: connectionState,
      protocol_version: "1.0",
      last_persisted_cursor: state.last_persisted_cursor,
      last_connected_at:
        state.last_connected_at === null ? null : new Date(state.last_connected_at).toISOString(),
      last_error_code: state.last_error_code,
      welcome_message: state.welcome_received === 1 ? connectorWelcomeMessage : null,
    };
  }

  getSharedMemeAppliedState(): SharedMemeAppliedState {
    const state = this.#sharedMemeState();
    return {
      appliedVersion: state.applied_version,
      entryCount: state.entry_count,
      checksumSha256: state.checksum_sha256,
      sizeBytes: state.size_bytes,
      schemaVersion: state.schema_version,
      lastSyncedAt: state.last_synced_at,
    };
  }

  getSharedMemeSyncStatus(): ConnectorLocalSharedMemeSync {
    const state = this.#sharedMemeState();
    return {
      sync_status: state.sync_status,
      applied_version: state.applied_version,
      entry_count: state.entry_count,
      last_synced_at:
        state.last_synced_at === null ? null : new Date(state.last_synced_at).toISOString(),
      last_error_code: state.last_error_code,
    };
  }

  markSharedMemeSyncing(): void {
    this.#database
      .prepare(
        `UPDATE shared_meme_sync_state
         SET sync_status = 'syncing',
             last_error_code = NULL
         WHERE singleton_id = 1`,
      )
      .run();
  }

  markSharedMemeSynced(
    libraryVersion: number,
    entryCount: number,
    checksumSha256: string,
    sizeBytes: number,
    schemaVersion: number,
    now: number,
  ): void {
    this.#database
      .prepare(
        `UPDATE shared_meme_sync_state
         SET sync_status = 'synced',
             applied_version = ?,
             entry_count = ?,
             checksum_sha256 = ?,
             size_bytes = ?,
             schema_version = ?,
             last_synced_at = ?,
             last_error_code = NULL
         WHERE singleton_id = 1`,
      )
      .run(libraryVersion, entryCount, checksumSha256, sizeBytes, schemaVersion, now);
  }

  markSharedMemeSyncError(code: string): void {
    this.#database
      .prepare(
        `UPDATE shared_meme_sync_state
         SET sync_status = 'error',
             last_error_code = ?
         WHERE singleton_id = 1`,
      )
      .run(code);
  }

  #state(): ConnectorStateRow {
    return this.#database
      .prepare(
        `SELECT last_persisted_cursor,
                last_connected_at,
                last_error_code,
                welcome_received
         FROM connector_state
         WHERE singleton_id = 1`,
      )
      .get() as ConnectorStateRow;
  }

  #sharedMemeState(): SharedMemeSyncRow {
    return this.#database
      .prepare(
        `SELECT
           sync_status,
           applied_version,
           entry_count,
           checksum_sha256,
           size_bytes,
           schema_version,
           last_synced_at,
           last_error_code
         FROM shared_meme_sync_state
         WHERE singleton_id = 1`,
      )
      .get() as SharedMemeSyncRow;
  }
}
