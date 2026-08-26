import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connectorDeliveryGenerationSchema } from "@doorbell/protocol";
import { buildApp } from "./app.js";
import { BellService } from "./bell-service.js";
import { CommunityDatabase } from "./community-database.js";
import { readDoorbellServerConfig } from "./config.js";
import { ConnectorService } from "./connector-service.js";
import { FarmHumanBulletinClient } from "./farm-bulletin-client.js";
import { FarmHumanCatalogClient } from "./farm-catalog-client.js";
import { FarmCreationClient } from "./farm-creation-client.js";
import { FarmHumanCropCodexActionClient } from "./farm-crop-codex-action-client.js";
import { FarmDirectoryClient } from "./farm-directory-client.js";
import { FarmHumanExpeditionActionClient } from "./farm-expedition-action-client.js";
import { FarmHumanClient } from "./farm-human-client.js";
import { FarmHumanKitchenClient } from "./farm-kitchen-client.js";
import { FarmHumanKitchenCookClient } from "./farm-kitchen-cook-client.js";
import { FarmHumanKitchenInventoryActionClient } from "./farm-kitchen-inventory-action-client.js";
import { FarmHumanKitchenPurchaseClient } from "./farm-kitchen-purchase-client.js";
import { FarmHumanKitchenShopRefreshClient } from "./farm-kitchen-shop-refresh-client.js";
import { FarmLingyeClient } from "./farm-lingye-client.js";
import { FarmHumanMarketActionClient } from "./farm-market-action-client.js";
import { FarmHumanNeighborhoodMessageActionClient } from "./farm-neighborhood-message-action-client.js";
import { FarmHumanOriginalPlantActionClient } from "./farm-original-plant-action-client.js";
import { FarmPurchaseRequestService } from "./farm-purchase-request-service.js";
import { FarmHumanRanchResidentActionClient } from "./farm-ranch-action-client.js";
import { FarmHumanRanchClient } from "./farm-ranch-client.js";
import { FarmHumanRanchCollectionClient } from "./farm-ranch-collection-client.js";
import { FarmHumanRanchDecorationActionClient } from "./farm-ranch-decoration-action-client.js";
import { FarmHumanRanchInteractionActionClient } from "./farm-ranch-interaction-action-client.js";
import { FarmRewardClient } from "./farm-reward-client.js";
import { FarmHumanFarmSettingsActionClient } from "./farm-settings-action-client.js";
import { FarmHumanSmeltingActionClient } from "./farm-smelting-action-client.js";
import { HomeWeatherEngine } from "./home-weather-engine.js";
import { LingyeDailyService } from "./lingye-daily-service.js";
import { MailboxService } from "./mailbox-service.js";
import { McpAccessService } from "./mcp-access-service.js";
import { FarmMcpActionClient } from "./mcp-farm-action-client.js";
import { FarmMcpMigrationClient } from "./mcp-farm-migration-client.js";
import { LingyeMcpActionClient } from "./mcp-lingye-action-client.js";
import { DoorbellMcpRuntime } from "./mcp-runtime.js";
import { OneBotGroupMembershipClient } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";
import { SharedMemeService } from "./shared-meme-service.js";

function readDeliveryGenerationCredential(environment: NodeJS.ProcessEnv = process.env): string {
  const credentialsDirectory = environment.CREDENTIALS_DIRECTORY?.trim();
  if (!credentialsDirectory) {
    throw new Error("The systemd delivery generation credential is required");
  }
  let rawCredential: string;
  try {
    rawCredential = readFileSync(join(credentialsDirectory, "delivery-generation"), "utf8");
  } catch (error) {
    throw new Error("The systemd delivery generation credential is required and must be readable", {
      cause: error,
    });
  }
  const candidate = rawCredential.endsWith("\n") ? rawCredential.slice(0, -1) : rawCredential;
  const parsed = connectorDeliveryGenerationSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error("The systemd delivery generation credential must contain one UUID");
  }
  return parsed.data;
}

const deliveryGeneration = readDeliveryGenerationCredential();
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
const farmHumanReader = new FarmHumanClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmExpeditionActioner = new FarmHumanExpeditionActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmCatalogReader = new FarmHumanCatalogClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmBulletinReader = new FarmHumanBulletinClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmKitchenReader = new FarmHumanKitchenClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmKitchenPurchaser = new FarmHumanKitchenPurchaseClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmKitchenCooker = new FarmHumanKitchenCookClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmKitchenInventoryActioner = new FarmHumanKitchenInventoryActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmKitchenShopRefresher = new FarmHumanKitchenShopRefreshClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmOriginalPlantActioner = new FarmHumanOriginalPlantActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmCropCodexActioner = new FarmHumanCropCodexActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmSmeltingActioner = new FarmHumanSmeltingActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmRanchReader = new FarmHumanRanchClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmRanchResidentActioner = new FarmHumanRanchResidentActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmRanchCollector = new FarmHumanRanchCollectionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmRanchDecorationActioner = new FarmHumanRanchDecorationActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmRanchInteractionActioner = new FarmHumanRanchInteractionActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmNeighborhoodMessageActioner = new FarmHumanNeighborhoodMessageActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmMarketActioner = new FarmHumanMarketActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmSettingsActioner = new FarmHumanFarmSettingsActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmLingyeReader = new FarmLingyeClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
let disconnectRealtimeResident = (_residentId: string): void => undefined;
const registrationAuth = new RegistrationAuthService({
  database,
  farmDirectory,
  farmCreator,
  farmCatalogReader,
  farmBulletinReader,
  farmHumanReader,
  farmExpeditionActioner,
  farmKitchenReader,
  farmKitchenPurchaser,
  farmKitchenCooker,
  farmKitchenInventoryActioner,
  farmKitchenShopRefresher,
  farmOriginalPlantActioner,
  farmCropCodexActioner,
  farmSmeltingActioner,
  farmLingyeReader,
  farmRanchReader,
  farmRanchResidentActioner,
  farmRanchCollector,
  farmRanchDecorationActioner,
  farmRanchInteractionActioner,
  farmNeighborhoodMessageActioner,
  farmMarketActioner,
  farmSettingsActioner,
  groupMembership,
  groupId: serverConfig.qqGroupId,
  farmHumanUiBaseUrl: serverConfig.farmHumanUiBaseUrl,
  onMembershipRevoked: (residentId) => disconnectRealtimeResident(residentId),
});
const farmRewardGranter = new FarmRewardClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const reportBellError = (error: unknown): void => {
  process.stderr.write(`[doorbell-bell] ${error instanceof Error ? error.name : "UnknownError"}\n`);
};
const reportMcpNotificationError = (error: unknown): void => {
  process.stderr.write(
    `[doorbell-mcp-notification] ${error instanceof Error ? error.name : "UnknownError"}\n`,
  );
};
const reportRealtimeDisconnectError = (error: unknown): void => {
  process.stderr.write(
    `[doorbell-realtime-disconnect] ${error instanceof Error ? error.name : "UnknownError"}\n`,
  );
};
const bellService = new BellService({
  database,
  registrationAuth,
  heartbeatIntervalMs: serverConfig.bellHeartbeatIntervalMs,
  replayIntervalMs: serverConfig.bellReplayIntervalMs,
  onError: reportBellError,
});
const farmPurchaseRequestService = new FarmPurchaseRequestService({
  database,
  bellNotifier: bellService,
});
const mailboxService = new MailboxService({
  database,
  farmRewardGranter,
});
const connectorService = new ConnectorService({
  database,
  deliveryGeneration,
  registrationAuth,
  mailboxService,
});
disconnectRealtimeResident = (residentId): void => {
  try {
    connectorService.disconnectResident(residentId, 4003, "membership_revoked");
  } catch (error) {
    reportRealtimeDisconnectError(error);
  }
  bellService.disconnectResident(residentId);
};
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
const lingyeMcpActions = new LingyeMcpActionClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const mcpRuntime = new DoorbellMcpRuntime({
  database,
  registrationAuth,
  farmActions: farmMcpActions,
  lingyeActions: lingyeMcpActions,
  mcpEndpoint: serverConfig.mcpEndpoint,
  onNotificationDeliveryError: reportMcpNotificationError,
});
const mcpAccessService = new McpAccessService({
  database,
  registrationAuth,
  farmMigration: farmMcpMigration,
  mcpEndpoint: serverConfig.mcpEndpoint,
  isRuntimeReady: () => serverConfig.mcpRuntimeReady,
});
const weatherEngine = new HomeWeatherEngine({ database });
const lingyeDailyService = new LingyeDailyService({
  database,
  publishToken: serverConfig.lingyeDailyPublishToken,
});
const sharedMemeService = new SharedMemeService({ databasePath: serverConfig.databasePath });
const app = buildApp({
  groupId: serverConfig.qqGroupId,
  groupMembership,
  registrationAuth,
  farmPurchaseRequestService,
  bellService,
  connectorService,
  weatherEngine,
  lingyeDailyService,
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
