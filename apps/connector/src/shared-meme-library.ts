import { type SharedMemeEntry, sharedMemeEntrySchema } from "@doorbell/protocol";
import Database from "better-sqlite3";

interface MemeRow {
  id: number;
  term: string;
  normalized_term: string;
  primary_category: string;
  primary_type: string;
  meaning: string;
  usage: string;
  origin: string;
  notes: string;
}

interface ChildRow {
  meme_id: number;
  value: string;
}

interface SnapshotMetadata {
  libraryVersion: number;
  entryCount: number;
}

export interface SharedMemeLibraryList {
  libraryVersion: number;
  memes: SharedMemeEntry[];
}

export interface SharedMemeLibraryDetail {
  libraryVersion: number;
  meme: SharedMemeEntry;
}

export class SharedMemeLibraryUnavailableError extends Error {
  constructor() {
    super("The shared meme library is not available locally");
    this.name = "SharedMemeLibraryUnavailableError";
  }
}

export class SharedMemeNotFoundError extends Error {
  constructor() {
    super("The shared meme entry was not found");
    this.name = "SharedMemeNotFoundError";
  }
}

function normalizeSharedMemeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.,?()'。“”~!:]/gu, "")
    .replace(/x{3,}/g, "xx");
}

function nullable(value: string): string | null {
  return value === "" ? null : value;
}

function groupRows(rows: ChildRow[]): Map<number, string[]> {
  const grouped = new Map<number, string[]>();
  for (const row of rows) {
    const values = grouped.get(row.meme_id) ?? [];
    values.push(row.value);
    grouped.set(row.meme_id, values);
  }
  return grouped;
}

function readMetadata(database: Database.Database): SnapshotMetadata {
  const rows = database.prepare("SELECT key, value FROM metadata").all() as Array<{
    key: string;
    value: string;
  }>;
  const metadata = new Map(rows.map((row) => [row.key, row.value]));
  const schemaVersion = Number(metadata.get("schema_version"));
  const libraryVersion = Number(metadata.get("library_version"));
  const entryCount = Number(metadata.get("entry_count"));
  if (
    schemaVersion !== 1 ||
    !Number.isSafeInteger(libraryVersion) ||
    libraryVersion <= 0 ||
    !Number.isSafeInteger(entryCount) ||
    entryCount < 0
  ) {
    throw new Error("Invalid shared meme snapshot metadata");
  }
  return { libraryVersion, entryCount };
}

function readEntries(database: Database.Database, memeId?: number): SharedMemeEntry[] {
  const rows = (
    memeId === undefined
      ? database.prepare("SELECT * FROM memes ORDER BY id").all()
      : database.prepare("SELECT * FROM memes WHERE id = ?").all(memeId)
  ) as MemeRow[];
  const aliases = groupRows(
    database
      .prepare("SELECT meme_id, alias AS value FROM meme_aliases ORDER BY id")
      .all() as ChildRow[],
  );
  const categories = groupRows(
    database
      .prepare("SELECT meme_id, category AS value FROM meme_categories ORDER BY rowid")
      .all() as ChildRow[],
  );
  const types = groupRows(
    database
      .prepare("SELECT meme_id, type AS value FROM meme_types ORDER BY rowid")
      .all() as ChildRow[],
  );
  const examples = groupRows(
    database
      .prepare("SELECT meme_id, example AS value FROM meme_examples ORDER BY id")
      .all() as ChildRow[],
  );
  const keywords = groupRows(
    database
      .prepare("SELECT meme_id, keyword AS value FROM meme_keywords ORDER BY id")
      .all() as ChildRow[],
  );
  return rows.map((row) =>
    sharedMemeEntrySchema.parse({
      meme_id: row.id,
      term: row.term,
      normalized_term: row.normalized_term,
      category: nullable(row.primary_category),
      type: nullable(row.primary_type),
      meaning: nullable(row.meaning),
      usage: nullable(row.usage),
      origin: nullable(row.origin),
      notes: nullable(row.notes),
      categories: categories.get(row.id) ?? [],
      types: types.get(row.id) ?? [],
      aliases: aliases.get(row.id) ?? [],
      examples: examples.get(row.id) ?? [],
      keywords: keywords.get(row.id) ?? [],
    }),
  );
}

export class SharedMemeLibrary {
  readonly #snapshotPath: string;

  constructor(snapshotPath: string) {
    this.#snapshotPath = snapshotPath;
  }

  list(): SharedMemeLibraryList {
    return this.#read((database, metadata) => {
      const memes = readEntries(database);
      if (memes.length !== metadata.entryCount) {
        throw new Error("Shared meme snapshot entry count mismatch");
      }
      return { libraryVersion: metadata.libraryVersion, memes };
    });
  }

  resolve(term: string): SharedMemeLibraryDetail {
    const normalizedTerm = normalizeSharedMemeText(term);
    return this.#read((database, metadata) => {
      const row = database
        .prepare(
          `SELECT id FROM memes WHERE normalized_term = ?
           UNION ALL
           SELECT meme_id AS id FROM meme_aliases WHERE normalized_alias = ?
           LIMIT 1`,
        )
        .get(normalizedTerm, normalizedTerm) as { id: number } | undefined;
      if (!row) {
        throw new SharedMemeNotFoundError();
      }
      const meme = readEntries(database, row.id)[0];
      if (!meme) {
        throw new Error("Shared meme index points to a missing entry");
      }
      return { libraryVersion: metadata.libraryVersion, meme };
    });
  }

  getById(memeId: number): SharedMemeLibraryDetail {
    return this.#read((database, metadata) => {
      const meme = readEntries(database, memeId)[0];
      if (!meme) {
        throw new SharedMemeNotFoundError();
      }
      return { libraryVersion: metadata.libraryVersion, meme };
    });
  }

  #read<TResult>(
    operation: (database: Database.Database, metadata: SnapshotMetadata) => TResult,
  ): TResult {
    let database: Database.Database | undefined;
    try {
      database = new Database(this.#snapshotPath, { readonly: true, fileMustExist: true });
      return operation(database, readMetadata(database));
    } catch (error) {
      if (error instanceof SharedMemeNotFoundError) {
        throw error;
      }
      throw new SharedMemeLibraryUnavailableError();
    } finally {
      database?.close();
    }
  }
}
