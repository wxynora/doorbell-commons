import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { HumanBulletinStore } from "./human-bulletin-store.js";

const DATABASE_PATH_ENVIRONMENT_NAME = "DOORBELL_HUMAN_ANNOUNCEMENT_DATABASE_PATH";

export interface HumanAnnouncementArguments {
  id: string;
  title: string;
  body: string;
}

export class HumanAnnouncementArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HumanAnnouncementArgumentError";
  }
}

export class HumanAnnouncementConflictError extends Error {
  constructor(id: string) {
    super(`Human announcement ${id} already exists with different content`);
    this.name = "HumanAnnouncementConflictError";
  }
}

interface StoredHumanAnnouncement {
  id: string;
  title: string;
  body: string;
  publishedAt: number;
}

export function parseHumanAnnouncementArguments(
  argv: readonly string[],
): HumanAnnouncementArguments {
  const values = new Map<string, string>();
  const names = new Set(["--id", "--title", "--body"]);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name || !names.has(name)) {
      throw new HumanAnnouncementArgumentError(`Unknown argument: ${name ?? "<missing>"}`);
    }
    if (values.has(name)) {
      throw new HumanAnnouncementArgumentError(`Repeated argument: ${name}`);
    }
    if (value === undefined) {
      throw new HumanAnnouncementArgumentError(`Missing value for ${name}`);
    }
    const normalized = value.trim();
    if (!normalized) {
      throw new HumanAnnouncementArgumentError(`Empty value for ${name}`);
    }
    values.set(name, normalized);
  }
  for (const name of names) {
    if (!values.has(name)) {
      throw new HumanAnnouncementArgumentError(`Missing required argument: ${name}`);
    }
  }
  return {
    id: values.get("--id") as string,
    title: values.get("--title") as string,
    body: values.get("--body") as string,
  };
}

function readStoredAnnouncement(
  database: Database.Database,
  id: string,
): StoredHumanAnnouncement | undefined {
  const row = database
    .prepare(
      `SELECT announcement_id, title, body, published_at
       FROM human_bulletin_announcements
       WHERE announcement_id = ?`,
    )
    .get(id) as
    | { announcement_id: string; title: string; body: string; published_at: number }
    | undefined;
  return row
    ? { id: row.announcement_id, title: row.title, body: row.body, publishedAt: row.published_at }
    : undefined;
}

export function publishHumanAnnouncement(options: {
  databasePath: string;
  announcement: HumanAnnouncementArguments;
  now?: () => number;
}): { status: "published" | "already_published"; announcement: StoredHumanAnnouncement } {
  const database = new Database(options.databasePath, { fileMustExist: true });
  try {
    const publish = database.transaction(() => {
      const { id, title, body } = options.announcement;
      const existing = readStoredAnnouncement(database, id);
      if (existing) {
        if (existing.title !== title || existing.body !== body) {
          throw new HumanAnnouncementConflictError(id);
        }
        return { status: "already_published" as const, announcement: existing };
      }

      const publishedAt = (options.now ?? Date.now)();
      new HumanBulletinStore(database).announce(id, title, body, publishedAt);
      const saved = readStoredAnnouncement(database, id);
      if (
        !saved ||
        saved.title !== title ||
        saved.body !== body ||
        saved.publishedAt !== publishedAt
      ) {
        throw new Error(`Human announcement ${id} could not be verified after publication`);
      }
      return { status: "published" as const, announcement: saved };
    });
    return publish.immediate();
  } finally {
    database.close();
  }
}

export function runHumanAnnouncementCli(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): number {
  try {
    const databasePath = environment[DATABASE_PATH_ENVIRONMENT_NAME]?.trim();
    if (!databasePath) {
      throw new HumanAnnouncementArgumentError(
        `${DATABASE_PATH_ENVIRONMENT_NAME} must be provided by the maintenance wrapper`,
      );
    }
    const result = publishHumanAnnouncement({
      databasePath,
      announcement: parseHumanAnnouncementArguments(argv),
    });
    process.stdout.write(`Human announcement ${result.announcement.id}: ${result.status}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Human announcement failed"}\n`,
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runHumanAnnouncementCli(process.argv.slice(2));
}
