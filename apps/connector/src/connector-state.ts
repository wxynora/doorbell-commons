import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type ConnectorDeliveryGeneration,
  type ConnectorEventEnvelope,
  type ConnectorLocalConnectionState,
  type ConnectorLocalSharedMemeSync,
  type ConnectorLocalStatus,
  connectorDeliveryGenerationSchema,
  connectorEventEnvelopeSchema,
  connectorWelcomeMessage,
} from "@doorbell/protocol";
import Database from "better-sqlite3";

interface ConnectorStateRow {
  delivery_generation: string | null;
  last_persisted_cursor: number;
  last_connected_at: number | null;
  last_error_code: string | null;
  welcome_received: number;
}

interface ConnectorEventRow {
  generation: string;
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
  status: "persisted" | "duplicate" | "gap" | "generation_mismatch";
  lastPersistedCursor: number;
}

export interface ConnectorDeliveryCheckpoint {
  generation: ConnectorDeliveryGeneration | null;
  lastPersistedCursor: number;
}

export interface ResetConnectorDeliveryGenerationResult extends ConnectorDeliveryCheckpoint {
  changed: boolean;
}

function mapEvent(row: ConnectorEventRow): ConnectorEventEnvelope {
  const payload = JSON.parse(row.payload_json) as unknown;
  return connectorEventEnvelopeSchema.parse({
    generation: row.generation,
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
    this.#initializeSchema();
    this.#database.exec(`
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

  getDeliveryCheckpoint(): ConnectorDeliveryCheckpoint {
    const state = this.#state();
    return {
      generation:
        state.delivery_generation === null
          ? null
          : connectorDeliveryGenerationSchema.parse(state.delivery_generation),
      lastPersistedCursor: state.last_persisted_cursor,
    };
  }

  resetDeliveryGeneration(
    generation: ConnectorDeliveryGeneration,
  ): ResetConnectorDeliveryGenerationResult {
    const validatedGeneration = connectorDeliveryGenerationSchema.parse(generation);
    const transaction = this.#database.transaction(() => {
      const state = this.#state();
      if (state.delivery_generation === validatedGeneration) {
        return {
          changed: false,
          generation: validatedGeneration,
          lastPersistedCursor: state.last_persisted_cursor,
        };
      }
      this.#database.prepare("DELETE FROM connector_events").run();
      this.#database
        .prepare(
          `UPDATE connector_state
           SET delivery_generation = ?,
               last_persisted_cursor = 0
           WHERE singleton_id = 1`,
        )
        .run(validatedGeneration);
      return {
        changed: true,
        generation: validatedGeneration,
        lastPersistedCursor: 0,
      };
    });
    return transaction.immediate();
  }

  persistEvent(event: ConnectorEventEnvelope, receivedAt: number): PersistConnectorEventResult {
    const validated = connectorEventEnvelopeSchema.parse(event);
    const transaction = this.#database.transaction(() => {
      const state = this.#state();
      if (state.delivery_generation !== validated.generation) {
        return {
          status: "generation_mismatch" as const,
          lastPersistedCursor: state.last_persisted_cursor,
        };
      }
      const existingByCursor = this.#database
        .prepare(
          `SELECT generation, event_id, cursor, event_type, created_at, payload_json
           FROM connector_events
           WHERE generation = ? AND cursor = ?`,
        )
        .get(validated.generation, validated.cursor) as ConnectorEventRow | undefined;

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
             generation,
             cursor,
             event_id,
             event_type,
             created_at,
             payload_json,
             received_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          validated.generation,
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

  listEventsAfter(
    generation: ConnectorDeliveryGeneration,
    afterCursor: number,
  ): ConnectorEventEnvelope[] {
    const validatedGeneration = connectorDeliveryGenerationSchema.parse(generation);
    if (this.#state().delivery_generation !== validatedGeneration) {
      return [];
    }
    const rows = this.#database
      .prepare(
        `SELECT generation, event_id, cursor, event_type, created_at, payload_json
         FROM connector_events
         WHERE generation = ? AND cursor > ?
         ORDER BY cursor ASC`,
      )
      .all(validatedGeneration, afterCursor) as ConnectorEventRow[];
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
      protocol_version: "2.0",
      delivery_generation:
        state.delivery_generation === null
          ? null
          : connectorDeliveryGenerationSchema.parse(state.delivery_generation),
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

  #initializeSchema(): void {
    const stateTableExists =
      this.#database
        .prepare(
          `SELECT 1
           FROM sqlite_master
           WHERE type = 'table' AND name = 'connector_state'`,
        )
        .get() !== undefined;

    if (!stateTableExists) {
      this.#database.exec(`
        CREATE TABLE connector_state (
          singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
          delivery_generation TEXT,
          last_persisted_cursor INTEGER NOT NULL CHECK (last_persisted_cursor >= 0),
          last_connected_at INTEGER,
          last_error_code TEXT,
          welcome_received INTEGER NOT NULL CHECK (welcome_received IN (0, 1))
        );
        CREATE TABLE connector_events (
          cursor INTEGER PRIMARY KEY CHECK (cursor > 0),
          generation TEXT NOT NULL,
          event_id TEXT NOT NULL UNIQUE,
          event_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          received_at INTEGER NOT NULL
        );
        INSERT INTO connector_state (
          singleton_id,
          delivery_generation,
          last_persisted_cursor,
          last_connected_at,
          last_error_code,
          welcome_received
        ) VALUES (1, NULL, 0, NULL, NULL, 0);
        PRAGMA user_version = 2;
      `);
      return;
    }

    const stateColumns = this.#database
      .prepare("PRAGMA table_info(connector_state)")
      .all() as Array<{
      name: string;
    }>;
    const eventColumns = this.#database
      .prepare("PRAGMA table_info(connector_events)")
      .all() as Array<{
      name: string;
    }>;
    const hasGenerationState = stateColumns.some((column) => column.name === "delivery_generation");
    const hasGenerationEvents = eventColumns.some((column) => column.name === "generation");

    if (!hasGenerationState || !hasGenerationEvents) {
      const migrate = this.#database.transaction(() => {
        if (!hasGenerationState) {
          this.#database.exec("ALTER TABLE connector_state ADD COLUMN delivery_generation TEXT");
        }
        this.#database.exec(`
          DROP TABLE IF EXISTS connector_events;
          CREATE TABLE connector_events (
            cursor INTEGER PRIMARY KEY CHECK (cursor > 0),
            generation TEXT NOT NULL,
            event_id TEXT NOT NULL UNIQUE,
            event_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            received_at INTEGER NOT NULL
          );
          UPDATE connector_state
          SET delivery_generation = NULL,
              last_persisted_cursor = 0
          WHERE singleton_id = 1;
          PRAGMA user_version = 2;
        `);
      });
      migrate.immediate();
      return;
    }

    this.#database.pragma("user_version = 2");
  }

  #state(): ConnectorStateRow {
    return this.#database
      .prepare(
        `SELECT delivery_generation,
                last_persisted_cursor,
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
