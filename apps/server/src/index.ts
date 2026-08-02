import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { readDoorbellServerConfig } from "./config.js";
import { FarmDirectoryClient } from "./farm-directory-client.js";
import { OneBotGroupMembershipClient } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";

const serverConfig = readDoorbellServerConfig();
const database = new CommunityDatabase(serverConfig.databasePath);
const groupMembership = new OneBotGroupMembershipClient({
  apiBaseUrl: serverConfig.oneBotApiBaseUrl,
  apiToken: serverConfig.oneBotApiToken,
});
const farmDirectory = new FarmDirectoryClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
});
const app = buildApp({
  groupId: serverConfig.qqGroupId,
  groupMembership,
  registrationAuth: new RegistrationAuthService({
    database,
    farmDirectory,
    groupMembership,
    groupId: serverConfig.qqGroupId,
  }),
  secureCookies: process.env.NODE_ENV === "production",
});
app.addHook("onClose", () => {
  database.close();
});
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const close = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "Stopping Doorbell Commons");
  await app.close();
};

process.once("SIGINT", () => {
  void close("SIGINT");
});

process.once("SIGTERM", () => {
  void close("SIGTERM");
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
