import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  type ConnectorLocalSharedMemeSync,
  type SharedMemeLibraryMetadata,
  sharedMemeLibraryMetadataSchema,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { validateConnectorServerWebSocketUrl } from "./connector-config.js";
import type { ConnectorStateDatabase } from "./connector-state.js";

type SharedMemeSyncErrorCode =
  | "metadata_unavailable"
  | "invalid_metadata"
  | "stale_version"
  | "snapshot_unavailable"
  | "size_mismatch"
  | "checksum_mismatch"
  | "invalid_sqlite"
  | "schema_mismatch"
  | "atomic_replace_failed"
  | "internal_error";

class SharedMemeSyncError extends Error {
  readonly code: SharedMemeSyncErrorCode;

  constructor(code: SharedMemeSyncErrorCode) {
    super(code);
    this.name = "SharedMemeSyncError";
    this.code = code;
  }
}

export interface SharedMemeSynchronizerOptions {
  serverWebSocketUrl: string;
  credential: string;
  httpRequestTimeoutMs: number;
  state: ConnectorStateDatabase;
  snapshotPath: string;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  replaceFile?: (source: string, target: string) => void;
}

export class SharedMemeSynchronizer {
  readonly #serverWebSocketUrl: string;
  readonly #credential: string;
  readonly #state: ConnectorStateDatabase;
  readonly #snapshotPath: string;
  readonly #fetch: typeof fetch;
  readonly #httpRequestTimeoutMs: number;
  readonly #now: () => number;
  readonly #replaceFile: (source: string, target: string) => void;
  #activeSync: Promise<boolean> | undefined;

  constructor(options: SharedMemeSynchronizerOptions) {
    if (!Number.isSafeInteger(options.httpRequestTimeoutMs) || options.httpRequestTimeoutMs <= 0) {
      throw new TypeError("Connector HTTP timeout must be a positive integer in milliseconds");
    }
    this.#serverWebSocketUrl = validateConnectorServerWebSocketUrl(options.serverWebSocketUrl);
    this.#credential = options.credential;
    this.#state = options.state;
    this.#snapshotPath = options.snapshotPath;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#httpRequestTimeoutMs = options.httpRequestTimeoutMs;
    this.#now = options.now ?? Date.now;
    this.#replaceFile = options.replaceFile ?? renameSync;
  }

  getStatus(): ConnectorLocalSharedMemeSync {
    return this.#state.getSharedMemeSyncStatus();
  }

  syncLatest(): Promise<boolean> {
    if (this.#activeSync) {
      return this.#activeSync;
    }
    this.#activeSync = this.#runSync().finally(() => {
      this.#activeSync = undefined;
    });
    return this.#activeSync;
  }

  async #runSync(): Promise<boolean> {
    this.#state.markSharedMemeSyncing();
    try {
      const metadata = await this.#readMetadata();
      const applied = this.#state.getSharedMemeAppliedState();
      if (applied.appliedVersion !== null && metadata.library_version < applied.appliedVersion) {
        throw new SharedMemeSyncError("stale_version");
      }
      if (
        applied.appliedVersion === metadata.library_version &&
        applied.entryCount === metadata.entry_count &&
        applied.checksumSha256 === metadata.checksum_sha256 &&
        applied.sizeBytes === metadata.size_bytes &&
        applied.schemaVersion === metadata.snapshot_schema_version &&
        this.#validateExistingSnapshot(metadata)
      ) {
        this.#state.markSharedMemeSynced(
          metadata.library_version,
          metadata.entry_count,
          metadata.checksum_sha256,
          metadata.size_bytes,
          metadata.snapshot_schema_version,
          applied.lastSyncedAt ?? this.#now(),
        );
        return false;
      }

      const snapshot = await this.#downloadSnapshot(metadata.size_bytes);
      const checksum = createHash("sha256").update(snapshot).digest("hex");
      if (checksum !== metadata.checksum_sha256) {
        throw new SharedMemeSyncError("checksum_mismatch");
      }

      mkdirSync(dirname(this.#snapshotPath), { recursive: true, mode: 0o700 });
      const temporaryPath = join(
        dirname(this.#snapshotPath),
        `.${basename(this.#snapshotPath)}.${randomUUID()}.tmp`,
      );
      try {
        writeFileSync(temporaryPath, snapshot, { flag: "wx", mode: 0o600 });
        chmodSync(temporaryPath, 0o600);
        this.#validateSnapshotDatabase(temporaryPath, metadata);
        try {
          this.#replaceFile(temporaryPath, this.#snapshotPath);
        } catch {
          throw new SharedMemeSyncError("atomic_replace_failed");
        }
      } finally {
        rmSync(temporaryPath, { force: true });
      }
      chmodSync(this.#snapshotPath, 0o600);
      this.#state.markSharedMemeSynced(
        metadata.library_version,
        metadata.entry_count,
        metadata.checksum_sha256,
        metadata.size_bytes,
        metadata.snapshot_schema_version,
        this.#now(),
      );
      return true;
    } catch (error) {
      this.#state.markSharedMemeSyncError(
        error instanceof SharedMemeSyncError ? error.code : "internal_error",
      );
      return false;
    }
  }

  async #readMetadata(): Promise<SharedMemeLibraryMetadata> {
    let response: Response;
    try {
      response = await this.#fetch(this.#serverUrl("/api/connector/shared-memes/version"), {
        headers: { authorization: `Bearer ${this.#credential}` },
        signal: AbortSignal.timeout(this.#httpRequestTimeoutMs),
      });
    } catch {
      throw new SharedMemeSyncError("metadata_unavailable");
    }
    if (!response.ok) {
      throw new SharedMemeSyncError("metadata_unavailable");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SharedMemeSyncError("invalid_metadata");
    }
    const metadata = sharedMemeLibraryMetadataSchema.safeParse(body);
    if (!metadata.success) {
      throw new SharedMemeSyncError("invalid_metadata");
    }
    return metadata.data;
  }

  async #downloadSnapshot(expectedSize: number): Promise<Buffer> {
    let response: Response;
    try {
      response = await this.#fetch(this.#serverUrl("/api/connector/shared-memes/snapshot"), {
        headers: { authorization: `Bearer ${this.#credential}` },
        signal: AbortSignal.timeout(this.#httpRequestTimeoutMs),
      });
    } catch {
      throw new SharedMemeSyncError("snapshot_unavailable");
    }
    if (!response.ok || response.headers.get("content-type") !== "application/vnd.sqlite3") {
      throw new SharedMemeSyncError("snapshot_unavailable");
    }
    if (!response.body) {
      throw new SharedMemeSyncError("snapshot_unavailable");
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let receivedSize = 0;
    try {
      while (true) {
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch {
          throw new SharedMemeSyncError("snapshot_unavailable");
        }
        if (result.done) {
          break;
        }
        const chunk = Buffer.from(result.value);
        if (receivedSize + chunk.length > expectedSize) {
          try {
            await reader.cancel();
          } catch {
            // The size violation remains authoritative even if stream cancellation also fails.
          }
          throw new SharedMemeSyncError("size_mismatch");
        }
        receivedSize += chunk.length;
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    if (receivedSize !== expectedSize) {
      throw new SharedMemeSyncError("size_mismatch");
    }
    return Buffer.concat(chunks, receivedSize);
  }

  #validateExistingSnapshot(metadata: SharedMemeLibraryMetadata): boolean {
    if (!existsSync(this.#snapshotPath)) {
      return false;
    }
    try {
      const snapshot = readFileSync(this.#snapshotPath);
      if (
        snapshot.length !== metadata.size_bytes ||
        createHash("sha256").update(snapshot).digest("hex") !== metadata.checksum_sha256
      ) {
        return false;
      }
      this.#validateSnapshotDatabase(this.#snapshotPath, metadata);
      return true;
    } catch {
      return false;
    }
  }

  #validateSnapshotDatabase(path: string, metadata: SharedMemeLibraryMetadata): void {
    let database: Database.Database;
    try {
      database = new Database(path, { readonly: true, fileMustExist: true });
    } catch {
      throw new SharedMemeSyncError("invalid_sqlite");
    }
    try {
      const integrity = database.pragma("integrity_check") as Array<{ integrity_check: string }>;
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
        throw new SharedMemeSyncError("invalid_sqlite");
      }
      const foreignKeys = database.pragma("foreign_key_check") as unknown[];
      if (foreignKeys.length > 0) {
        throw new SharedMemeSyncError("invalid_sqlite");
      }
      const metadataRows = database.prepare("SELECT key, value FROM metadata").all() as Array<{
        key: string;
        value: string;
      }>;
      const snapshotMetadata = Object.fromEntries(metadataRows.map((row) => [row.key, row.value]));
      const entryCount = (
        database.prepare("SELECT COUNT(*) AS count FROM memes").get() as { count: number }
      ).count;
      if (
        snapshotMetadata.schema_version !== String(metadata.snapshot_schema_version) ||
        snapshotMetadata.library_version !== String(metadata.library_version) ||
        snapshotMetadata.entry_count !== String(metadata.entry_count) ||
        entryCount !== metadata.entry_count
      ) {
        throw new SharedMemeSyncError("schema_mismatch");
      }
      const tableNames = (
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all() as Array<{ name: string }>
      ).map((row) => row.name);
      const approvedTables = new Set([
        "metadata",
        "memes",
        "meme_aliases",
        "meme_categories",
        "meme_types",
        "meme_examples",
        "meme_keywords",
        "meme_fts",
        "sqlite_sequence",
      ]);
      if (
        tableNames.some((table) => !approvedTables.has(table) && !table.startsWith("meme_fts_"))
      ) {
        throw new SharedMemeSyncError("schema_mismatch");
      }
    } catch (error) {
      if (error instanceof SharedMemeSyncError) {
        throw error;
      }
      throw new SharedMemeSyncError("invalid_sqlite");
    } finally {
      database.close();
    }
  }

  #serverUrl(pathname: string): URL {
    const url = new URL(this.#serverWebSocketUrl);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = pathname;
    url.search = "";
    url.hash = "";
    return url;
  }
}
