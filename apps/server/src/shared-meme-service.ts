import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  SharedMemeAddRequest,
  SharedMemeEntry,
  SharedMemeLibraryMetadata,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { type SharedMemeBaseline, sharedMemeBaselineV1 } from "./shared-meme-baseline-import.js";

const SNAPSHOT_SCHEMA_VERSION = 1 as const;

interface SharedMemeRow {
  meme_id: number;
  term: string;
  normalized_term: string;
  primary_category: string;
  primary_type: string;
  meaning: string;
  usage: string;
  origin: string;
  notes: string;
}

interface SharedMemeChildRow {
  meme_id: number;
  value: string;
}

interface SharedMemeReleaseRow {
  library_version: number;
  snapshot_schema_version: number;
  entry_count: number;
  published_at: string;
  checksum_sha256: string;
  size_bytes: number;
  snapshot_blob: Buffer;
}

export interface SharedMemeSnapshot {
  metadata: SharedMemeLibraryMetadata;
  snapshot: Buffer;
}

export interface SharedMemeAddResult {
  metadata: SharedMemeLibraryMetadata;
  meme: SharedMemeEntry;
}

export interface SharedMemeServiceOptions {
  databasePath: string;
  baseline?: SharedMemeBaseline;
  now?: () => number;
  temporaryRoot?: string;
}

export class SharedMemeNotFoundError extends Error {
  constructor() {
    super("The requested shared meme does not exist");
    this.name = "SharedMemeNotFoundError";
  }
}

export class SharedMemeDuplicateError extends Error {
  readonly kind: "term" | "alias";
  readonly existingMemeId: number;

  constructor(kind: "term" | "alias", existingMemeId: number) {
    super(`The normalized shared meme ${kind} already exists`);
    this.name = "SharedMemeDuplicateError";
    this.kind = kind;
    this.existingMemeId = existingMemeId;
  }
}

export class SharedMemeInvalidInputError extends Error {
  constructor(message = "The shared meme input is invalid") {
    super(message);
    this.name = "SharedMemeInvalidInputError";
  }
}

export function normalizeSharedMemeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.,?()'。“”~!:]/gu, "")
    .replace(/x{3,}/g, "xx");
}

function nullable(value: string): string | null {
  return value === "" ? null : value;
}

function groupRows(rows: SharedMemeChildRow[]): Map<number, string[]> {
  const grouped = new Map<number, string[]>();
  for (const row of rows) {
    const values = grouped.get(row.meme_id) ?? [];
    values.push(row.value);
    grouped.set(row.meme_id, values);
  }
  return grouped;
}

function metadataFromRelease(row: SharedMemeReleaseRow): SharedMemeLibraryMetadata {
  return {
    library_version: row.library_version,
    snapshot_schema_version: SNAPSHOT_SCHEMA_VERSION,
    entry_count: row.entry_count,
    published_at: row.published_at,
    checksum_sha256: row.checksum_sha256,
    size_bytes: row.size_bytes,
  };
}

export class SharedMemeService {
  readonly #database: Database.Database;
  readonly #now: () => number;
  readonly #temporaryRoot: string;

  constructor(options: SharedMemeServiceOptions) {
    if (options.databasePath !== ":memory:") {
      mkdirSync(dirname(options.databasePath), { recursive: true, mode: 0o700 });
    }
    this.#database = new Database(options.databasePath);
    if (options.databasePath !== ":memory:") {
      chmodSync(options.databasePath, 0o600);
    }
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("busy_timeout = 5000");
    this.#now = options.now ?? Date.now;
    this.#temporaryRoot = options.temporaryRoot ?? tmpdir();
    this.#initializeSchema();
    this.#importBaseline(options.baseline ?? sharedMemeBaselineV1);
  }

  close(): void {
    this.#database.close();
  }

  getMetadata(): SharedMemeLibraryMetadata {
    return metadataFromRelease(this.#latestRelease());
  }

  getSnapshot(): SharedMemeSnapshot {
    const release = this.#latestRelease();
    return {
      metadata: metadataFromRelease(release),
      snapshot: Buffer.from(release.snapshot_blob),
    };
  }

  list(): { metadata: SharedMemeLibraryMetadata; memes: SharedMemeEntry[] } {
    return { metadata: this.getMetadata(), memes: this.#readEntries() };
  }

  get(memeId: number): { libraryVersion: number; meme: SharedMemeEntry } {
    const meme = this.#readEntries([memeId])[0];
    if (!meme) {
      throw new SharedMemeNotFoundError();
    }
    return { libraryVersion: this.getMetadata().library_version, meme };
  }

  add(input: SharedMemeAddRequest, contributorAccountId: string): SharedMemeAddResult {
    const normalizedTerm = normalizeSharedMemeText(input.term);
    if (normalizedTerm === "") {
      throw new SharedMemeInvalidInputError("term must contain searchable content");
    }
    const aliases = input.aliases ?? [];
    const normalizedAliases = aliases.map((alias) => normalizeSharedMemeText(alias));
    if (normalizedAliases.some((alias) => alias === "")) {
      throw new SharedMemeInvalidInputError("aliases must contain searchable content");
    }
    const requestKeys = [normalizedTerm, ...normalizedAliases];
    if (new Set(requestKeys).size !== requestKeys.length) {
      throw new SharedMemeDuplicateError("alias", 0);
    }

    const transaction = this.#database.transaction(() => {
      this.#assertNormalizedKeyAvailable(normalizedTerm, "term");
      for (const alias of normalizedAliases) {
        this.#assertNormalizedKeyAvailable(alias, "alias");
      }

      const createdAt = new Date(this.#now()).toISOString();
      const result = this.#database
        .prepare(
          `INSERT INTO shared_meme_entries (
             term,
             normalized_term,
             primary_category,
             primary_type,
             meaning,
             usage,
             origin,
             notes,
             source_kind,
             contributor_account_id,
             created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'human', ?, ?)`,
        )
        .run(
          input.term,
          normalizedTerm,
          input.category ?? "",
          input.type ?? "",
          input.meaning ?? "",
          input.usage ?? "",
          input.origin ?? "",
          input.notes ?? "",
          contributorAccountId,
          createdAt,
        );
      const memeId = Number(result.lastInsertRowid);
      this.#insertNormalizedKey(normalizedTerm, memeId, "term");
      this.#insertChildValues("shared_meme_aliases", "alias", memeId, aliases, normalizedAliases);
      for (const [index, alias] of normalizedAliases.entries()) {
        this.#insertNormalizedKey(alias, memeId, "alias");
        if (normalizeSharedMemeText(aliases[index] ?? "") !== alias) {
          throw new SharedMemeInvalidInputError();
        }
      }
      this.#insertChildValues(
        "shared_meme_categories",
        "category",
        memeId,
        input.category === undefined || input.category === null ? [] : [input.category],
      );
      this.#insertChildValues(
        "shared_meme_types",
        "type",
        memeId,
        input.type === undefined || input.type === null ? [] : [input.type],
      );
      this.#insertChildValues("shared_meme_examples", "example", memeId, input.examples ?? []);
      this.#insertChildValues(
        "shared_meme_keywords",
        "keyword",
        memeId,
        input.keywords ?? [],
        (input.keywords ?? []).map(normalizeSharedMemeText),
      );

      const nextVersion = this.#latestRelease().library_version + 1;
      const release = this.#publishSnapshot(nextVersion, createdAt);
      const meme = this.#readEntries([memeId])[0];
      if (!meme) {
        throw new Error("The inserted shared meme could not be read");
      }
      return { metadata: metadataFromRelease(release), meme };
    });

    return transaction.immediate();
  }

  #initializeSchema(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS shared_meme_entries (
        meme_id INTEGER PRIMARY KEY AUTOINCREMENT,
        term TEXT NOT NULL,
        normalized_term TEXT NOT NULL,
        primary_category TEXT NOT NULL,
        primary_type TEXT NOT NULL,
        meaning TEXT NOT NULL,
        usage TEXT NOT NULL,
        origin TEXT NOT NULL,
        notes TEXT NOT NULL,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('baseline_v1', 'human')),
        contributor_account_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shared_meme_normalized_keys (
        normalized_key TEXT PRIMARY KEY,
        meme_id INTEGER NOT NULL REFERENCES shared_meme_entries(meme_id) ON DELETE CASCADE,
        key_kind TEXT NOT NULL CHECK (key_kind IN ('term', 'alias'))
      );

      CREATE TABLE IF NOT EXISTS shared_meme_aliases (
        meme_id INTEGER NOT NULL REFERENCES shared_meme_entries(meme_id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        alias TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        PRIMARY KEY (meme_id, position)
      );

      CREATE TABLE IF NOT EXISTS shared_meme_categories (
        meme_id INTEGER NOT NULL REFERENCES shared_meme_entries(meme_id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        category TEXT NOT NULL,
        PRIMARY KEY (meme_id, position)
      );

      CREATE TABLE IF NOT EXISTS shared_meme_types (
        meme_id INTEGER NOT NULL REFERENCES shared_meme_entries(meme_id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        type TEXT NOT NULL,
        PRIMARY KEY (meme_id, position)
      );

      CREATE TABLE IF NOT EXISTS shared_meme_examples (
        meme_id INTEGER NOT NULL REFERENCES shared_meme_entries(meme_id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        example TEXT NOT NULL,
        PRIMARY KEY (meme_id, position)
      );

      CREATE TABLE IF NOT EXISTS shared_meme_keywords (
        meme_id INTEGER NOT NULL REFERENCES shared_meme_entries(meme_id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        keyword TEXT NOT NULL,
        normalized_keyword TEXT NOT NULL,
        PRIMARY KEY (meme_id, position)
      );

      CREATE TABLE IF NOT EXISTS shared_meme_releases (
        library_version INTEGER PRIMARY KEY CHECK (library_version > 0),
        snapshot_schema_version INTEGER NOT NULL CHECK (snapshot_schema_version = 1),
        entry_count INTEGER NOT NULL CHECK (entry_count >= 0),
        published_at TEXT NOT NULL,
        checksum_sha256 TEXT NOT NULL CHECK (length(checksum_sha256) = 64),
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
        snapshot_blob BLOB NOT NULL
      );
    `);
  }

  #importBaseline(baseline: SharedMemeBaseline): void {
    const currentEntries = (
      this.#database.prepare("SELECT COUNT(*) AS count FROM shared_meme_entries").get() as {
        count: number;
      }
    ).count;
    const currentReleases = (
      this.#database.prepare("SELECT COUNT(*) AS count FROM shared_meme_releases").get() as {
        count: number;
      }
    ).count;
    if (currentEntries > 0 || currentReleases > 0) {
      if (currentEntries === 0 || currentReleases === 0) {
        throw new Error("The shared meme library is only partially initialized");
      }
      return;
    }

    if (baseline.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || baseline.entries.length !== 317) {
      throw new Error("The shared meme baseline does not match schema v1");
    }
    const totals = baseline.entries.reduce(
      (counts, entry) => ({
        aliases: counts.aliases + entry.aliases.length,
        categories: counts.categories + entry.categories.length,
        types: counts.types + entry.types.length,
        examples: counts.examples + entry.examples.length,
        keywords: counts.keywords + entry.keywords.length,
      }),
      { aliases: 0, categories: 0, types: 0, examples: 0, keywords: 0 },
    );
    if (
      totals.aliases !== 134 ||
      totals.categories !== 351 ||
      totals.types !== 136 ||
      totals.examples !== 119 ||
      totals.keywords !== 169
    ) {
      throw new Error("The shared meme baseline content counts do not match the approved source");
    }
    const baselinePublishedAt = new Date(baseline.createdAt).toISOString();

    const transaction = this.#database.transaction(() => {
      for (const entry of baseline.entries) {
        if (normalizeSharedMemeText(entry.term) !== entry.normalizedTerm) {
          throw new Error(`The baseline term normalization is invalid for meme ${entry.id}`);
        }
        this.#database
          .prepare(
            `INSERT INTO shared_meme_entries (
               meme_id,
               term,
               normalized_term,
               primary_category,
               primary_type,
               meaning,
               usage,
               origin,
               notes,
               source_kind,
               contributor_account_id,
               created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'baseline_v1', NULL, ?)`,
          )
          .run(
            entry.id,
            entry.term,
            entry.normalizedTerm,
            entry.primaryCategory,
            entry.primaryType,
            entry.meaning,
            entry.usage,
            entry.origin,
            entry.notes,
            baselinePublishedAt,
          );
        this.#insertNormalizedKey(entry.normalizedTerm, entry.id, "term");
        this.#insertChildValues(
          "shared_meme_aliases",
          "alias",
          entry.id,
          entry.aliases.map((alias) => alias.value),
          entry.aliases.map((alias) => alias.normalized),
        );
        for (const alias of entry.aliases) {
          if (normalizeSharedMemeText(alias.value) !== alias.normalized) {
            throw new Error(`The baseline alias normalization is invalid for meme ${entry.id}`);
          }
          this.#insertNormalizedKey(alias.normalized, entry.id, "alias");
        }
        this.#insertChildValues("shared_meme_categories", "category", entry.id, entry.categories);
        this.#insertChildValues("shared_meme_types", "type", entry.id, entry.types);
        this.#insertChildValues("shared_meme_examples", "example", entry.id, entry.examples);
        this.#insertChildValues(
          "shared_meme_keywords",
          "keyword",
          entry.id,
          entry.keywords.map((keyword) => keyword.value),
          entry.keywords.map((keyword) => keyword.normalized),
        );
      }
      this.#publishSnapshot(1, baselinePublishedAt);
    });
    transaction.immediate();
  }

  #assertNormalizedKeyAvailable(normalizedKey: string, requestedKind: "term" | "alias"): void {
    const existing = this.#database
      .prepare(
        `SELECT meme_id, key_kind
         FROM shared_meme_normalized_keys
         WHERE normalized_key = ?`,
      )
      .get(normalizedKey) as { meme_id: number; key_kind: "term" | "alias" } | undefined;
    if (existing) {
      throw new SharedMemeDuplicateError(requestedKind, existing.meme_id);
    }
  }

  #insertNormalizedKey(normalizedKey: string, memeId: number, keyKind: "term" | "alias"): void {
    this.#database
      .prepare(
        `INSERT INTO shared_meme_normalized_keys (normalized_key, meme_id, key_kind)
         VALUES (?, ?, ?)`,
      )
      .run(normalizedKey, memeId, keyKind);
  }

  #insertChildValues(
    table: string,
    column: string,
    memeId: number,
    values: string[],
    normalizedValues?: string[],
  ): void {
    const normalizedColumn =
      table === "shared_meme_aliases"
        ? "normalized_alias"
        : table === "shared_meme_keywords"
          ? "normalized_keyword"
          : undefined;
    const statement = this.#database.prepare(
      normalizedColumn
        ? `INSERT INTO ${table} (meme_id, position, ${column}, ${normalizedColumn}) VALUES (?, ?, ?, ?)`
        : `INSERT INTO ${table} (meme_id, position, ${column}) VALUES (?, ?, ?)`,
    );
    for (const [position, value] of values.entries()) {
      if (normalizedColumn) {
        statement.run(memeId, position, value, normalizedValues?.[position] ?? "");
      } else {
        statement.run(memeId, position, value);
      }
    }
  }

  #latestRelease(): SharedMemeReleaseRow {
    const release = this.#database
      .prepare(
        `SELECT
           library_version,
           snapshot_schema_version,
           entry_count,
           published_at,
           checksum_sha256,
           size_bytes,
           snapshot_blob
         FROM shared_meme_releases
         ORDER BY library_version DESC
         LIMIT 1`,
      )
      .get() as SharedMemeReleaseRow | undefined;
    if (!release) {
      throw new Error("The shared meme library has no published release");
    }
    return release;
  }

  #readEntries(memeIds?: number[]): SharedMemeEntry[] {
    if (memeIds?.length === 0) {
      return [];
    }
    const filter = memeIds ? `WHERE meme_id IN (${memeIds.map(() => "?").join(",")})` : "";
    const rows = this.#database
      .prepare(
        `SELECT
           meme_id,
           term,
           normalized_term,
           primary_category,
           primary_type,
           meaning,
           usage,
           origin,
           notes
         FROM shared_meme_entries
         ${filter}
         ORDER BY meme_id ASC`,
      )
      .all(...(memeIds ?? [])) as SharedMemeRow[];
    const childFilter = memeIds ? `WHERE meme_id IN (${memeIds.map(() => "?").join(",")})` : "";
    const child = (table: string, column: string) =>
      groupRows(
        this.#database
          .prepare(
            `SELECT meme_id, ${column} AS value
             FROM ${table}
             ${childFilter}
             ORDER BY meme_id ASC, position ASC`,
          )
          .all(...(memeIds ?? [])) as SharedMemeChildRow[],
      );
    const aliases = child("shared_meme_aliases", "alias");
    const categories = child("shared_meme_categories", "category");
    const types = child("shared_meme_types", "type");
    const examples = child("shared_meme_examples", "example");
    const keywords = child("shared_meme_keywords", "keyword");
    return rows.map((row) => ({
      meme_id: row.meme_id,
      term: row.term,
      normalized_term: row.normalized_term,
      category: nullable(row.primary_category),
      type: nullable(row.primary_type),
      meaning: nullable(row.meaning),
      usage: nullable(row.usage),
      origin: nullable(row.origin),
      notes: nullable(row.notes),
      categories: categories.get(row.meme_id) ?? [],
      types: types.get(row.meme_id) ?? [],
      aliases: aliases.get(row.meme_id) ?? [],
      examples: examples.get(row.meme_id) ?? [],
      keywords: keywords.get(row.meme_id) ?? [],
    }));
  }

  #publishSnapshot(libraryVersion: number, publishedAt: string): SharedMemeReleaseRow {
    const directory = mkdtempSync(join(this.#temporaryRoot, "doorbell-shared-memes-"));
    const snapshotPath = join(directory, "shared-memes.sqlite");
    try {
      const snapshot = new Database(snapshotPath);
      try {
        snapshot.pragma("foreign_keys = ON");
        snapshot.exec(`
          CREATE TABLE metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
          CREATE TABLE memes (
            id INTEGER PRIMARY KEY,
            term TEXT NOT NULL,
            normalized_term TEXT NOT NULL UNIQUE,
            primary_category TEXT NOT NULL,
            primary_type TEXT NOT NULL,
            meaning TEXT NOT NULL,
            usage TEXT NOT NULL,
            origin TEXT NOT NULL,
            notes TEXT NOT NULL
          );
          CREATE TABLE meme_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
            alias TEXT NOT NULL,
            normalized_alias TEXT NOT NULL UNIQUE
          );
          CREATE TABLE meme_categories (
            meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
            category TEXT NOT NULL,
            PRIMARY KEY (meme_id, category)
          );
          CREATE TABLE meme_types (
            meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            PRIMARY KEY (meme_id, type)
          );
          CREATE TABLE meme_examples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
            example TEXT NOT NULL
          );
          CREATE TABLE meme_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meme_id INTEGER NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
            keyword TEXT NOT NULL,
            normalized_keyword TEXT NOT NULL
          );
          CREATE VIRTUAL TABLE meme_fts USING fts5(
            term,
            aliases,
            meaning,
            usage,
            keywords
          );
        `);
        const transaction = snapshot.transaction(() => {
          const metadata = snapshot.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
          metadata.run("schema_version", String(SNAPSHOT_SCHEMA_VERSION));
          metadata.run("library_version", String(libraryVersion));
          metadata.run("published_at", publishedAt);
          const entries = this.#readEntries();
          metadata.run("entry_count", String(entries.length));

          const insertMeme = snapshot.prepare(
            `INSERT INTO memes (
               id, term, normalized_term, primary_category, primary_type, meaning, usage, origin, notes
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          const insertAlias = snapshot.prepare(
            "INSERT INTO meme_aliases (meme_id, alias, normalized_alias) VALUES (?, ?, ?)",
          );
          const insertCategory = snapshot.prepare(
            "INSERT INTO meme_categories (meme_id, category) VALUES (?, ?)",
          );
          const insertType = snapshot.prepare(
            "INSERT INTO meme_types (meme_id, type) VALUES (?, ?)",
          );
          const insertExample = snapshot.prepare(
            "INSERT INTO meme_examples (meme_id, example) VALUES (?, ?)",
          );
          const insertKeyword = snapshot.prepare(
            "INSERT INTO meme_keywords (meme_id, keyword, normalized_keyword) VALUES (?, ?, ?)",
          );
          const insertFts = snapshot.prepare(
            "INSERT INTO meme_fts (rowid, term, aliases, meaning, usage, keywords) VALUES (?, ?, ?, ?, ?, ?)",
          );
          for (const entry of entries) {
            insertMeme.run(
              entry.meme_id,
              entry.term,
              entry.normalized_term,
              entry.category ?? "",
              entry.type ?? "",
              entry.meaning ?? "",
              entry.usage ?? "",
              entry.origin ?? "",
              entry.notes ?? "",
            );
            for (const alias of entry.aliases) {
              insertAlias.run(entry.meme_id, alias, normalizeSharedMemeText(alias));
            }
            for (const category of entry.categories) {
              insertCategory.run(entry.meme_id, category);
            }
            for (const type of entry.types) {
              insertType.run(entry.meme_id, type);
            }
            for (const example of entry.examples) {
              insertExample.run(entry.meme_id, example);
            }
            for (const keyword of entry.keywords) {
              insertKeyword.run(entry.meme_id, keyword, normalizeSharedMemeText(keyword));
            }
            insertFts.run(
              entry.meme_id,
              entry.term,
              entry.aliases.join(" "),
              entry.meaning ?? "",
              entry.usage ?? "",
              entry.keywords.join(" "),
            );
          }
        });
        transaction.immediate();
        const integrity = snapshot.pragma("integrity_check") as Array<{ integrity_check: string }>;
        if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
          throw new Error("The generated shared meme snapshot failed integrity_check");
        }
      } finally {
        snapshot.close();
      }

      const snapshotBlob = readFileSync(snapshotPath);
      const checksum = createHash("sha256").update(snapshotBlob).digest("hex");
      const entryCount = (
        this.#database.prepare("SELECT COUNT(*) AS count FROM shared_meme_entries").get() as {
          count: number;
        }
      ).count;
      this.#database
        .prepare(
          `INSERT INTO shared_meme_releases (
             library_version,
             snapshot_schema_version,
             entry_count,
             published_at,
             checksum_sha256,
             size_bytes,
             snapshot_blob
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          libraryVersion,
          SNAPSHOT_SCHEMA_VERSION,
          entryCount,
          publishedAt,
          checksum,
          snapshotBlob.length,
          snapshotBlob,
        );
      return this.#latestRelease();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
