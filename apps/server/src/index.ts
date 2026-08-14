import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { readDoorbellServerConfig } from "./config.js";
import { ConnectorService } from "./connector-service.js";
import { FarmCreationClient } from "./farm-creation-client.js";
import { FarmDirectoryClient } from "./farm-directory-client.js";
import { FarmRewardClient } from "./farm-reward-client.js";
import { HomeWeatherEngine } from "./home-weather-engine.js";
import { MailboxService } from "./mailbox-service.js";
import { McpAccessService } from "./mcp-access-service.js";
import { FarmMcpActionClient } from "./mcp-farm-action-client.js";
import { FarmMcpMigrationClient } from "./mcp-farm-migration-client.js";
import { DoorbellMcpRuntime } from "./mcp-runtime.js";
import { OneBotGroupMembershipClient } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";
import { SharedMemeService } from "./shared-meme-service.js";

const serverConfig = readDoorbellServerConfig();
const database = new CommunityDatabase(serverConfig.databasePath);
const groupMembership = new OneBotGroupMembershipClient({
  apiBaseUrl: serverConfig.oneBotApiBaseUrl,
  apiToken: serverConfig.oneBotApiToken,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
});
const farmDirectory = new FarmDirectoryClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
});
const farmCreator = new FarmCreationClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const registrationAuth = new RegistrationAuthService({
  database,
  farmDirectory,
  farmCreator,
  groupMembership,
  groupId: serverConfig.qqGroupId,
  farmHumanUiBaseUrl: serverConfig.farmHumanUiBaseUrl,
});
const farmRewardGranter = new FarmRewardClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const mailboxService = new MailboxService({ database, farmRewardGranter });
const connectorService = new ConnectorService({ database, registrationAuth, mailboxService });
const farmMcpMigration = new FarmMcpMigrationClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmMcpActions = new FarmMcpActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const mcpRuntime = new DoorbellMcpRuntime({
  database,
  registrationAuth,
  farmActions: farmMcpActions,
  mcpEndpoint: serverConfig.mcpEndpoint,
});
const mcpAccessService = new McpAccessService({
  database,
  registrationAuth,
  farmMigration: farmMcpMigration,
  mcpEndpoint: serverConfig.mcpEndpoint,
  isRuntimeReady: () => serverConfig.mcpRuntimeReady,
});
const weatherEngine = new HomeWeatherEngine({ database });
const sharedMemeService = new SharedMemeService({ databasePath: serverConfig.databasePath });
const app = buildApp({
  groupId: serverConfig.qqGroupId,
  groupMembership,
  registrationAuth,
  connectorService,
  weatherEngine,
  mailboxService,
  mcpAccessService,
  mcpRuntime,
  sharedMemeService,
  secureCookies: process.env.NODE_ENV === "production",
});
app.addHook("onClose", () => {
  sharedMemeService.close();
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
