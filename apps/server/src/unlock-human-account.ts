import { CommunityDatabase } from "./community-database.js";
import { readDatabasePath } from "./config.js";

const qqNumber = process.argv[2];
if (!qqNumber || !/^[1-9][0-9]*$/.test(qqNumber)) {
  throw new Error("Usage: npm run account:unlock -w @doorbell/server -- <qq-number>");
}

const database = new CommunityDatabase(readDatabasePath());
try {
  if (!database.unlockHumanAccount(qqNumber)) {
    throw new Error(`No Doorbell human account exists for QQ ${qqNumber}`);
  }
  process.stdout.write(`Login lock and failed attempts cleared for QQ ${qqNumber}.\n`);
} finally {
  database.close();
}
