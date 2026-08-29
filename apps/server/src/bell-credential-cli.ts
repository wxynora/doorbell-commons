import { randomUUID } from "node:crypto";
import { humanProfileSwitchRequestSchema } from "@doorbell/protocol";
import { CommunityDatabase } from "./community-database.js";
import { readDatabasePath } from "./config.js";

const profileId = process.argv[2];
const credentialHash = process.argv[3];
const parsedProfile = humanProfileSwitchRequestSchema.safeParse({ profile_id: profileId });
if (!parsedProfile.success) {
  throw new Error("Pass one profile UUID before the Bell credential digest");
}
if (!credentialHash || !/^[0-9a-f]{64}$/u.test(credentialHash)) {
  throw new Error("Pass one lowercase SHA-256 Bell credential digest after the profile UUID");
}

const database = new CommunityDatabase(readDatabasePath());
try {
  const result = database.replaceBellCredentialForProfile(
    parsedProfile.data.profile_id,
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
