import { randomUUID } from "node:crypto";
import { CommunityDatabase } from "./community-database.js";
import { readDatabasePath } from "./config.js";

const credentialHash = process.argv[2];
if (!credentialHash || !/^[0-9a-f]{64}$/u.test(credentialHash)) {
  throw new Error("Pass exactly one lowercase SHA-256 Bell credential digest");
}

const database = new CommunityDatabase(readDatabasePath());
try {
  const result = database.replaceFirstActiveBellCredential(
    randomUUID(),
    credentialHash,
    Date.now(),
  );
  process.stdout.write(
    `resident_id=${result.residentId}\nreplaced_previous=${String(result.replacedPrevious)}\n`,
  );
} finally {
  database.close();
}
