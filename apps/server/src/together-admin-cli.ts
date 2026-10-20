import { readFileSync } from "node:fs";
import { CommunityDatabase } from "./community-database.js";
import { readDatabasePath } from "./config.js";
import { togetherAdminSchema } from "./together/config.js";

const [commandId, file, flag, rawPid] = process.argv.slice(2);
if (!commandId || !file || (flag !== undefined && flag !== "--notify-pid"))
  throw new Error("Usage: together:admin <command-id> <request.json> [--notify-pid <Main PID>]");
const pid = rawPid === undefined ? undefined : Number(rawPid);
if (flag && (!Number.isSafeInteger(pid) || (pid ?? 0) <= 0)) throw new Error("invalid_main_pid");
const request: unknown = JSON.parse(readFileSync(file, "utf8"));
const payload = togetherAdminSchema.parse(request);
const database = new CommunityDatabase(readDatabasePath());
try {
  const result = database.queueTogetherControl(commandId, payload, Date.now());
  if (pid !== undefined) process.kill(pid, "SIGUSR2"); // Wake the known Main, do not restart it.
  process.stdout.write(`${JSON.stringify({ commandId, ...result })}\n`);
} finally {
  database.close();
}
