import { CommunityDatabase } from "./community-database.js";
import { readDatabasePath } from "./config.js";

const database = new CommunityDatabase(readDatabasePath());
try {
  const current = database.getCurrentRegistrationCode(Date.now());
  process.stdout.write(
    `code=${current.code}\ngenerated_at=${new Date(current.generatedAt).toISOString()}\nexpires_at=${new Date(current.expiresAt).toISOString()}\n`,
  );
} finally {
  database.close();
}
