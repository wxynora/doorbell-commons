import { ActivityReminderService } from "./activity-reminder-service.js";
import { buildApp } from "./app.js";
import { BellAccessService } from "./bell-access-service.js";
import { BellService } from "./bell-service.js";
import { BrowserPushService } from "./browser-push-service.js";
import { CareerExamReminderService } from "./career-exam-reminder-service.js";
import { CommunityDatabase } from "./community-database.js";
import { readDoorbellServerConfig } from "./config.js";
import { ConstableInterviewSignupMailService } from "./constable-interview-signup-mail-service.js";
import { FarmActionListAuthority } from "./farm-action-list-authority.js";
import { FarmActionListAuthorityClient } from "./farm-action-list-authority-client.js";
import { FarmActionListScheduler } from "./farm-action-list-scheduler.js";
import { FarmActionListService } from "./farm-action-list-service.js";
import { FarmHumanBulletinClient } from "./farm-bulletin-client.js";
import { FarmHumanCatalogClient } from "./farm-catalog-client.js";
import { FarmConstableInterviewClient } from "./farm-constable-interview-client.js";
import { FarmCreationClient } from "./farm-creation-client.js";
import { FarmHumanCropCodexActionClient } from "./farm-crop-codex-action-client.js";
import { FarmDirectoryClient } from "./farm-directory-client.js";
import { FarmHumanExpeditionActionClient } from "./farm-expedition-action-client.js";
import { FarmHarvestRequestService } from "./farm-harvest-request-service.js";
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
import { FarmPlantRequestService } from "./farm-plant-request-service.js";
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
import { LingyeNotificationDeliveryService, MailboxService } from "./mailbox-service.js";
import { McpAccessService } from "./mcp-access-service.js";
import { FarmMcpActionClient } from "./mcp-farm-action-client.js";
import { FarmMcpMigrationClient } from "./mcp-farm-migration-client.js";
import { LingyeMcpActionClient } from "./mcp-lingye-action-client.js";
import { DoorbellMcpRuntime } from "./mcp-runtime.js";
import { FarmHumanQixiMemorialClient } from "./qixi-memorial-client.js";
import { OneBotGroupMembershipClient } from "./qq-group-membership.js";
import { RegistrationAuthService } from "./registration-auth.js";
import { ReporterDailyScheduler } from "./reporter-daily-scheduler.js";
import { ReporterRelayFarmClient } from "./reporter-relay-farm-client.js";
import { reporterRelayRenderer } from "./reporter-relay-renderer.js";
import { ReporterRelayService } from "./reporter-relay-service.js";
import { SharedMemeBackendService } from "./shared-meme-backend-service.js";
import { SharedMemeService } from "./shared-meme-service.js";

const serverConfig = readDoorbellServerConfig();
const database = new CommunityDatabase(serverConfig.databasePath);
const groupMembership = new OneBotGroupMembershipClient({
  apiBaseUrl: serverConfig.oneBotApiBaseUrl,
  apiToken: serverConfig.oneBotApiToken,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  snapshotStore: database,
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
const farmConstableInterviewClient = new FarmConstableInterviewClient({
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
const farmQixiMemorialReader = new FarmHumanQixiMemorialClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const farmActionListAuthorityReader = new FarmActionListAuthorityClient({
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
  farmShopOpener: farmCatalogReader,
  farmBulletinReader,
  farmHumanReader,
  farmExpeditionActioner,
  farmKitchenReader,
  farmKitchenShopOpener: farmKitchenReader,
  farmKitchenPurchaser,
  farmKitchenCooker,
  farmKitchenInventoryActioner,
  farmKitchenShopRefresher,
  farmOriginalPlantActioner,
  farmCropCodexActioner,
  farmSmeltingActioner,
  farmLingyeReader,
  farmQixiMemorialReader,
  farmConstableInterviewReader: farmConstableInterviewClient,
  farmConstableInterviewActioner: farmConstableInterviewClient,
  farmConstableInterviewPublicNoticeOpener: farmConstableInterviewClient,
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
const sharedMemeService = new SharedMemeService({ databasePath: serverConfig.databasePath });
const reportConstableInterviewMailError = (error: unknown): void => {
  process.stderr.write(
    `[doorbell-constable-interview-mail] ${error instanceof Error ? error.name : "UnknownError"}\n`,
  );
};
const reportBrowserPushError = (error: unknown): void => {
  process.stderr.write(
    `[doorbell-browser-push] ${error instanceof Error ? error.name : "UnknownError"}\n`,
  );
};
const bellService = new BellService({
  database,
  registrationAuth,
  heartbeatIntervalMs: serverConfig.bellHeartbeatIntervalMs,
  replayIntervalMs: serverConfig.bellReplayIntervalMs,
  getSharedMemeLibraryVersion: () => sharedMemeService.getMetadata().library_version,
  onError: reportBellError,
});
const bellAccessService = new BellAccessService({
  database,
  registrationAuth,
  bellService,
  bellEndpoint: new URL("/api/bell/stream", serverConfig.mcpEndpoint).toString(),
});
const reporterRelayService = new ReporterRelayService({
  database,
  bellService,
  renderer: reporterRelayRenderer,
});
const reporterRelayFarm = new ReporterRelayFarmClient({
  apiBaseUrl: serverConfig.farmApiBaseUrl,
  requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
  serviceToken: serverConfig.farmServiceToken,
});
const reporterDailyScheduler = new ReporterDailyScheduler({
  farm: reporterRelayFarm,
  relay: reporterRelayService,
  onError: (error) => {
    process.stderr.write(
      `[doorbell-reporter-daily] ${error instanceof Error ? error.name : "UnknownError"}\n`,
    );
  },
});
reporterDailyScheduler.start();
const browserPushService = serverConfig.browserPush
  ? new BrowserPushService({
      config: serverConfig.browserPush,
      database,
      registrationAuth,
      requestTimeoutMs: serverConfig.upstreamRequestTimeoutMs,
      onError: reportBrowserPushError,
    })
  : undefined;
const activityReminderService = browserPushService
  ? new ActivityReminderService({
      database,
      browserPushService,
      registrationAuth,
      farmFieldReader: farmHumanReader,
      farmLingyeReader,
      onError: reportBrowserPushError,
    })
  : undefined;
const farmPurchaseRequestService = new FarmPurchaseRequestService({
  database,
  bellNotifier: bellService,
});
const farmHarvestRequestService = new FarmHarvestRequestService({
  database,
  bellNotifier: bellService,
});
const farmPlantRequestService = new FarmPlantRequestService({
  database,
  bellNotifier: bellService,
});
const farmActionListAuthority = new FarmActionListAuthority({
  actionListStateReader: farmActionListAuthorityReader,
  fieldReader: farmHumanReader,
  catalogReader: farmCatalogReader,
  kitchenReader: farmKitchenReader,
});
const farmActionListService = new FarmActionListService({
  database,
  authority: farmActionListAuthority,
  bellNotifier: bellService,
  profileResolver: {
    resolve: async (residentId) => {
      await registrationAuth.confirmCurrentResidentMembership(residentId);
      const community = database.findActiveHumanCommunityByResidentId(residentId);
      const farmHumanKey = community?.farmBinding.farmHumanKey;
      if (!community || !farmHumanKey) {
        throw new Error("The scheduled farm action list resident is not active");
      }
      const catalog = await farmCatalogReader.readCatalog({
        farmDoorplate: community.farmBinding.farmDoorplate,
        farmHumanKey,
      });
      const humanName =
        catalog.data.settings.status === "available"
          ? catalog.data.settings.human_name?.trim()
          : undefined;
      if (!humanName) throw new Error("The scheduled farm action list has no Human name");
      return {
        humanName,
        profile: {
          residentId,
          homeId: community.home.homeId,
          farmDoorplate: community.farmBinding.farmDoorplate,
          farmHumanKey,
        },
      };
    },
  },
});
const farmActionListScheduler = new FarmActionListScheduler({
  store: database,
  sender: farmActionListService,
  onError: reportBellError,
});
farmActionListScheduler.start();
const mailboxService = new MailboxService({
  database,
  farmRewardGranter,
});
const lingyeNotificationDeliveryService = new LingyeNotificationDeliveryService({
  database,
  mailbox: mailboxService,
  bell: bellService,
});
const sharedMemeBackendService = new SharedMemeBackendService({
  database,
  registrationAuth,
});
const constableInterviewSignupMailService = serverConfig.constableInterviewSignupMailCopy
  ? new ConstableInterviewSignupMailService({
      database,
      registrationAuth,
      farmInterviews: farmConstableInterviewClient,
      mailboxService,
      copy: serverConfig.constableInterviewSignupMailCopy,
      onError: reportConstableInterviewMailError,
    })
  : null;
constableInterviewSignupMailService?.start();
disconnectRealtimeResident = (residentId): void => {
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
const careerExamReminderService = new CareerExamReminderService({
  database,
  mailboxService,
  bellService,
  ...(browserPushService ? { browserPushService } : {}),
  registrationAuth,
  lingyeActions: lingyeMcpActions,
  onError: reportBellError,
});
const mcpRuntime = new DoorbellMcpRuntime({
  database,
  registrationAuth,
  farmActions: farmMcpActions,
  lingyeActions: lingyeMcpActions,
  careerExamReminders: careerExamReminderService,
  reporterRelayService,
  mcpEndpoint: serverConfig.mcpEndpoint,
  onNotificationDeliveryError: reportMcpNotificationError,
  onLingyeNotification: (notification, sourceResidentId) =>
    lingyeNotificationDeliveryService.deliver(notification, sourceResidentId),
  onResidentNotificationsRead: (residentId) => bellService.notifyResident(residentId),
});
const mcpAccessService = new McpAccessService({
  database,
  registrationAuth,
  farmMigration: farmMcpMigration,
  mcpEndpoint: serverConfig.mcpEndpoint,
  isRuntimeReady: async () =>
    serverConfig.mcpRuntimeReady && (await lingyeMcpActions.isRuntimeReady()),
});
const weatherEngine = new HomeWeatherEngine({ database });
const lingyeDailyService = new LingyeDailyService({
  database,
  publishToken: serverConfig.lingyeDailyPublishToken,
});
const app = buildApp({
  groupId: serverConfig.qqGroupId,
  groupMembership,
  registrationAuth,
  farmActionListService,
  refreshFarmActionListSchedule: () => farmActionListScheduler.refresh(),
  farmHarvestRequestService,
  farmPlantRequestService,
  farmPurchaseRequestService,
  bellAccessService,
  bellService,
  ...(browserPushService ? { browserPushService } : {}),
  ...(activityReminderService ? { activityReminderService } : {}),
  sharedMemeBackendService,
  weatherEngine,
  lingyeDailyService,
  mailboxService,
  mcpAccessService,
  mcpRuntime,
  sharedMemeService,
  secureCookies: process.env.NODE_ENV === "production",
});
app.addHook("onClose", () => {
  farmActionListScheduler.close();
  reporterDailyScheduler.close();
  activityReminderService?.close();
  careerExamReminderService.close();
  constableInterviewSignupMailService?.close();
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
