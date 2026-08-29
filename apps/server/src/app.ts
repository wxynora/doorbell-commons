import {
  additionalHumanProfileRequestSchema,
  type BoundConstableInterviewErrorCode,
  type BoundFarmCropCodexActionErrorCode,
  type BoundFarmExpeditionActionErrorCode,
  type BoundFarmHarvestAssistErrorCode,
  type BoundFarmKitchenCookErrorCode,
  type BoundFarmKitchenInventoryActionErrorCode,
  type BoundFarmKitchenPurchaseErrorCode,
  type BoundFarmKitchenShopRefreshErrorCode,
  type BoundFarmLandUpgradeErrorCode,
  type BoundFarmMarketActionErrorCode,
  type BoundFarmNeighborhoodMessageActionErrorCode,
  type BoundFarmOriginalPlantActionErrorCode,
  type BoundFarmRanchCollectionErrorCode,
  type BoundFarmRanchDecorationActionErrorCode,
  type BoundFarmRanchInteractionActionErrorCode,
  type BoundFarmRanchResidentActionErrorCode,
  type BoundFarmSettingsActionErrorCode,
  type BoundFarmSmeltingActionErrorCode,
  boundConstableInterviewActionRequestSchema,
  boundConstableInterviewErrorCodeSchema,
  boundConstableInterviewErrorSchema,
  boundConstableInterviewReadRequestSchema,
  boundConstableInterviewScoreRequestSchema,
  boundConstableInterviewSuccessSchema,
  boundFarmBulletinAckErrorSchema,
  boundFarmBulletinAckRequestSchema,
  boundFarmBulletinAckSuccessSchema,
  boundFarmBulletinReadErrorSchema,
  boundFarmBulletinReadRequestSchema,
  boundFarmBulletinReadSuccessSchema,
  boundFarmCatalogReadErrorSchema,
  boundFarmCatalogReadRequestSchema,
  boundFarmCatalogReadSuccessSchema,
  boundFarmCropCodexActionErrorSchema,
  boundFarmCropCodexActionRequestSchema,
  boundFarmCropCodexActionSuccessSchema,
  boundFarmExpeditionActionErrorSchema,
  boundFarmExpeditionActionRequestSchema,
  boundFarmExpeditionActionSuccessSchema,
  boundFarmFieldErrorSchema,
  boundFarmFieldRequestSchema,
  boundFarmFieldSuccessSchema,
  boundFarmHarvestAssistErrorSchema,
  boundFarmHarvestAssistRequestSchema,
  boundFarmHarvestAssistSuccessSchema,
  boundFarmKitchenCookErrorSchema,
  boundFarmKitchenCookRequestSchema,
  boundFarmKitchenCookSuccessSchema,
  boundFarmKitchenInventoryActionErrorSchema,
  boundFarmKitchenInventoryActionRequestSchema,
  boundFarmKitchenInventoryActionSuccessSchema,
  boundFarmKitchenPurchaseErrorSchema,
  boundFarmKitchenPurchaseRequestSchema,
  boundFarmKitchenPurchaseSuccessSchema,
  boundFarmKitchenReadErrorSchema,
  boundFarmKitchenReadRequestSchema,
  boundFarmKitchenReadSuccessSchema,
  boundFarmKitchenShopRefreshErrorSchema,
  boundFarmKitchenShopRefreshRequestSchema,
  boundFarmKitchenShopRefreshSuccessSchema,
  boundFarmLandUpgradeErrorSchema,
  boundFarmLandUpgradeRequestSchema,
  boundFarmLandUpgradeSuccessSchema,
  boundFarmMarketActionErrorSchema,
  boundFarmMarketActionRequestSchema,
  boundFarmMarketActionSuccessSchema,
  boundFarmNeighborhoodMessageActionErrorSchema,
  boundFarmNeighborhoodMessageActionRequestSchema,
  boundFarmNeighborhoodMessageActionSuccessSchema,
  boundFarmOriginalPlantActionErrorSchema,
  boundFarmOriginalPlantActionRequestSchema,
  boundFarmOriginalPlantActionSuccessSchema,
  boundFarmOverviewErrorSchema,
  boundFarmOverviewRequestSchema,
  boundFarmOverviewSuccessSchema,
  boundFarmPurchaseRequestCreateSchema,
  boundFarmPurchaseRequestCreateSuccessSchema,
  boundFarmPurchaseRequestErrorSchema,
  boundFarmRanchCollectionErrorSchema,
  boundFarmRanchCollectionRequestSchema,
  boundFarmRanchCollectionSuccessSchema,
  boundFarmRanchDecorationActionErrorSchema,
  boundFarmRanchDecorationActionRequestSchema,
  boundFarmRanchDecorationActionSuccessSchema,
  boundFarmRanchErrorSchema,
  boundFarmRanchInteractionActionErrorSchema,
  boundFarmRanchInteractionActionRequestSchema,
  boundFarmRanchInteractionActionSuccessSchema,
  boundFarmRanchReadRequestSchema,
  boundFarmRanchResidentActionErrorSchema,
  boundFarmRanchResidentActionRequestSchema,
  boundFarmRanchResidentActionSuccessSchema,
  boundFarmRanchSuccessSchema,
  boundFarmSettingsActionErrorSchema,
  boundFarmSettingsActionRequestSchema,
  boundFarmSettingsActionSuccessSchema,
  boundFarmSmeltingActionErrorSchema,
  boundFarmSmeltingActionRequestSchema,
  boundFarmSmeltingActionSuccessSchema,
  boundGlimmerReadErrorSchema,
  boundGlimmerReadRequestSchema,
  boundGlimmerReadSuccessSchema,
  boundQixiMemorialReadErrorSchema,
  boundQixiMemorialReadRequestSchema,
  boundQixiMemorialReadSuccessSchema,
  boundTogetherReadErrorSchema,
  boundTogetherReadRequestSchema,
  boundTogetherReadSuccessSchema,
  browserPushErrorSchema,
  browserPushSubscriptionDeleteRequestSchema,
  browserPushSubscriptionDeleteSuccessSchema,
  browserPushSubscriptionRequestSchema,
  browserPushSubscriptionSuccessSchema,
  createdFarmHumanSessionSuccessSchema,
  currentHumanSessionSuccessSchema,
  type FarmHumanConstableInterviewSuccess,
  farmBulletinAckIdempotencyKeySchema,
  farmCropCodexActionIdempotencyKeySchema,
  farmExpeditionActionIdempotencyKeySchema,
  farmHumanConstableInterviewSuccessSchema,
  farmHumanFieldHarvestAssistIdempotencyKeySchema,
  farmHumanFieldLandUpgradeIdempotencyKeySchema,
  farmHumanRanchCollectionIdempotencyKeySchema,
  farmHumanUiErrorSchema,
  farmKitchenCookIdempotencyKeySchema,
  farmKitchenInventoryActionIdempotencyKeySchema,
  farmKitchenPurchaseIdempotencyKeySchema,
  farmKitchenShopRefreshIdempotencyKeySchema,
  farmLookupErrorSchema,
  farmLookupRequestSchema,
  farmLookupSuccessSchema,
  farmMarketActionIdempotencyKeySchema,
  farmNeighborhoodMessageActionIdempotencyKeySchema,
  farmOriginalPlantActionIdempotencyKeySchema,
  farmPurchaseRequestIdempotencyKeySchema,
  farmRanchDecorationActionIdempotencyKeySchema,
  farmRanchInteractionActionIdempotencyKeySchema,
  farmRanchResidentActionIdempotencyKeySchema,
  farmSettingsActionIdempotencyKeySchema,
  farmSmeltingActionIdempotencyKeySchema,
  type HumanSettingsPatchRequest,
  humanAuthenticationErrorSchema,
  humanLogoutSuccessSchema,
  humanProfileSwitchRequestSchema,
  humanSessionRequestSchema,
  humanSessionSuccessSchema,
  humanSettingsErrorSchema,
  humanSettingsPatchRequestSchema,
  humanSettingsReadRequestSchema,
  humanSettingsSuccessSchema,
  lingyeDailyErrorSchema,
  lingyeDailyLatestSuccessSchema,
  lingyeDailyPublishRequestSchema,
  lingyeDailyPublishSuccessSchema,
  lingyeDailyReadRequestSchema,
  type McpAccessErrorCode,
  mailboxClaimBodySchema,
  mailboxDetailRequestSchema,
  mailboxDetailSuccessSchema,
  mailboxErrorSchema,
  mailboxListRequestSchema,
  mailboxListSuccessSchema,
  mcpAccessErrorMessages,
  mcpAccessErrorSchema,
  mcpAccessMutationBodySchema,
  mcpAccessReadRequestSchema,
  mcpAccessStatusResponseSchema,
  mcpCredentialIssueResponseSchema,
  mcpCredentialSchema,
  qqGroupEligibilityErrorSchema,
  qqGroupEligibilityRequestSchema,
  qqGroupEligibilitySuccessSchema,
  serviceHealthSchema,
  sharedMemeAddRequestSchema,
  sharedMemeAddSuccessSchema,
  sharedMemeBackendPullQuerySchema,
  sharedMemeBackendPullSuccessSchema,
  sharedMemeDetailSuccessSchema,
  sharedMemeErrorSchema,
  sharedMemeIdSchema,
  sharedMemeListSuccessSchema,
  sharedMemeReadRequestSchema,
} from "@doorbell/protocol";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import type { ActivityReminderService } from "./activity-reminder-service.js";
import {
  BellConnectionEpochMismatchError,
  BellCredentialAuthenticationError,
  type BellService,
  type BellStreamSink,
  BellWakeControlError,
} from "./bell-service.js";
import type { BrowserPushService } from "./browser-push-service.js";
import {
  FarmPurchaseRequestIdempotencyConflictError,
  HumanProfileNotAvailableError,
  type HumanSettingsPatch,
  LingyeDailyIdempotencyConflictError,
  type LingyeDailyIssueRecord,
  type MailboxLetterRecord,
} from "./community-database.js";
import {
  FarmHumanBulletinContractUnavailableError,
  FarmHumanBulletinCredentialInvalidError,
  FarmHumanBulletinIdempotencyConflictError,
  FarmHumanBulletinNotFoundError,
  FarmHumanBulletinStateConflictError,
  FarmHumanBulletinUnavailableError,
} from "./farm-bulletin-client.js";
import {
  FarmHumanCatalogContractUnavailableError,
  FarmHumanCatalogCredentialInvalidError,
  FarmHumanCatalogNotFoundError,
  FarmHumanCatalogUnavailableError,
} from "./farm-catalog-client.js";
import {
  FarmConstableInterviewContractUnavailableError,
  FarmConstableInterviewCredentialInvalidError,
  FarmConstableInterviewNotFoundError,
  FarmConstableInterviewRejectedError,
  FarmConstableInterviewUnavailableError,
} from "./farm-constable-interview-client.js";
import {
  FarmCreationConflictError,
  FarmCreationContractUnavailableError,
  FarmCreationRejectedError,
  FarmCreationUnavailableError,
} from "./farm-creation-client.js";
import {
  FarmHumanCropCodexActionContractUnavailableError,
  FarmHumanCropCodexActionCredentialInvalidError,
  FarmHumanCropCodexActionIdempotencyConflictError,
  FarmHumanCropCodexActionNotFoundError,
  FarmHumanCropCodexActionRejectedError,
  FarmHumanCropCodexActionStateConflictError,
  FarmHumanCropCodexActionUnavailableError,
} from "./farm-crop-codex-action-client.js";
import {
  FarmDirectoryUnavailableError,
  FarmHumanCredentialInvalidError,
  FarmNotFoundError,
  FarmNotPubliclyReadableError,
  FarmUpstreamContractUnavailableError,
} from "./farm-directory-client.js";
import {
  FarmHumanExpeditionActionContractUnavailableError,
  FarmHumanExpeditionActionCredentialInvalidError,
  FarmHumanExpeditionActionIdempotencyConflictError,
  FarmHumanExpeditionActionNotFoundError,
  FarmHumanExpeditionActionRejectedError,
  FarmHumanExpeditionActionStateConflictError,
  FarmHumanExpeditionActionUnavailableError,
} from "./farm-expedition-action-client.js";
import {
  FarmHumanFieldContractUnavailableError,
  FarmHumanFieldCredentialInvalidError,
  FarmHumanFieldIdempotencyConflictError,
  FarmHumanFieldNotFoundError,
  FarmHumanFieldStateConflictError,
  FarmHumanFieldUnavailableError,
  FarmHumanHarvestAssistExhaustedError,
  FarmHumanLandUpgradeRejectedError,
  FarmHumanNoRipePlotsError,
} from "./farm-human-client.js";
import { InvalidFarmHumanUrlError } from "./farm-human-url.js";
import {
  FarmHumanKitchenContractUnavailableError,
  FarmHumanKitchenCredentialInvalidError,
  FarmHumanKitchenNotFoundError,
  FarmHumanKitchenUnavailableError,
} from "./farm-kitchen-client.js";
import {
  FarmHumanKitchenCookContractUnavailableError,
  FarmHumanKitchenCookCredentialInvalidError,
  FarmHumanKitchenCookIdempotencyConflictError,
  FarmHumanKitchenCookNotFoundError,
  FarmHumanKitchenCookRejectedError,
  FarmHumanKitchenCookStateConflictError,
  FarmHumanKitchenCookUnavailableError,
} from "./farm-kitchen-cook-client.js";
import {
  FarmHumanKitchenInventoryActionContractUnavailableError,
  FarmHumanKitchenInventoryActionCredentialInvalidError,
  FarmHumanKitchenInventoryActionIdempotencyConflictError,
  FarmHumanKitchenInventoryActionNotFoundError,
  FarmHumanKitchenInventoryActionRejectedError,
  FarmHumanKitchenInventoryActionStateConflictError,
  FarmHumanKitchenInventoryActionUnavailableError,
} from "./farm-kitchen-inventory-action-client.js";
import {
  FarmHumanKitchenPurchaseContractUnavailableError,
  FarmHumanKitchenPurchaseCredentialInvalidError,
  FarmHumanKitchenPurchaseIdempotencyConflictError,
  FarmHumanKitchenPurchaseNotFoundError,
  FarmHumanKitchenPurchaseRejectedError,
  FarmHumanKitchenPurchaseShopChangedError,
  FarmHumanKitchenPurchaseShopUnavailableError,
  FarmHumanKitchenPurchaseStateConflictError,
  FarmHumanKitchenPurchaseUnavailableError,
} from "./farm-kitchen-purchase-client.js";
import {
  FarmHumanKitchenShopRefreshContractUnavailableError,
  FarmHumanKitchenShopRefreshCredentialInvalidError,
  FarmHumanKitchenShopRefreshIdempotencyConflictError,
  FarmHumanKitchenShopRefreshNotFoundError,
  FarmHumanKitchenShopRefreshRejectedError,
  FarmHumanKitchenShopRefreshShopUnavailableError,
  FarmHumanKitchenShopRefreshStateConflictError,
  FarmHumanKitchenShopRefreshUnavailableError,
} from "./farm-kitchen-shop-refresh-client.js";
import {
  FarmLingyeContractUnavailableError,
  FarmLingyeCredentialInvalidError,
  FarmLingyeNotFoundError,
  FarmLingyeUnavailableError,
} from "./farm-lingye-client.js";
import {
  FarmHumanMarketActionContractUnavailableError,
  FarmHumanMarketActionCredentialInvalidError,
  FarmHumanMarketActionCrossFarmAtomicityUnavailableError,
  FarmHumanMarketActionIdempotencyConflictError,
  FarmHumanMarketActionNotFoundError,
  FarmHumanMarketActionRejectedError,
  FarmHumanMarketActionStateConflictError,
  FarmHumanMarketActionUnavailableError,
} from "./farm-market-action-client.js";
import {
  FarmHumanNeighborhoodMessageActionContractUnavailableError,
  FarmHumanNeighborhoodMessageActionCredentialInvalidError,
  FarmHumanNeighborhoodMessageActionIdempotencyConflictError,
  FarmHumanNeighborhoodMessageActionNotFoundError,
  FarmHumanNeighborhoodMessageActionRejectedError,
  FarmHumanNeighborhoodMessageActionStateConflictError,
  FarmHumanNeighborhoodMessageActionUnavailableError,
} from "./farm-neighborhood-message-action-client.js";
import {
  FarmHumanOriginalPlantActionContractUnavailableError,
  FarmHumanOriginalPlantActionCredentialInvalidError,
  FarmHumanOriginalPlantActionIdempotencyConflictError,
  FarmHumanOriginalPlantActionNotFoundError,
  FarmHumanOriginalPlantActionRejectedError,
  FarmHumanOriginalPlantActionStateConflictError,
  FarmHumanOriginalPlantActionUnavailableError,
} from "./farm-original-plant-action-client.js";
import {
  type FarmPurchaseRequestCreateResult,
  FarmPurchaseRequestInputError,
  type FarmPurchaseRequestService,
} from "./farm-purchase-request-service.js";
import {
  FarmHumanRanchResidentActionContractUnavailableError,
  FarmHumanRanchResidentActionCredentialInvalidError,
  FarmHumanRanchResidentActionIdempotencyConflictError,
  FarmHumanRanchResidentActionNotFoundError,
  FarmHumanRanchResidentActionRejectedError,
  FarmHumanRanchResidentActionStateConflictError,
  FarmHumanRanchResidentActionUnavailableError,
} from "./farm-ranch-action-client.js";
import {
  FarmHumanRanchContractUnavailableError,
  FarmHumanRanchCredentialInvalidError,
  FarmHumanRanchNotFoundError,
  FarmHumanRanchUnavailableError,
} from "./farm-ranch-client.js";
import {
  FarmHumanRanchCollectionContractUnavailableError,
  FarmHumanRanchCollectionCredentialInvalidError,
  FarmHumanRanchCollectionIdempotencyConflictError,
  FarmHumanRanchCollectionNoCollectableError,
  FarmHumanRanchCollectionNotFoundError,
  FarmHumanRanchCollectionRejectedError,
  FarmHumanRanchCollectionStateConflictError,
  FarmHumanRanchCollectionUnavailableError,
} from "./farm-ranch-collection-client.js";
import {
  FarmHumanRanchDecorationActionContractUnavailableError,
  FarmHumanRanchDecorationActionCredentialInvalidError,
  FarmHumanRanchDecorationActionIdempotencyConflictError,
  FarmHumanRanchDecorationActionNotFoundError,
  FarmHumanRanchDecorationActionRejectedError,
  FarmHumanRanchDecorationActionStateConflictError,
  FarmHumanRanchDecorationActionUnavailableError,
} from "./farm-ranch-decoration-action-client.js";
import {
  FarmHumanRanchInteractionActionContractUnavailableError,
  FarmHumanRanchInteractionActionCredentialInvalidError,
  FarmHumanRanchInteractionActionIdempotencyConflictError,
  FarmHumanRanchInteractionActionNotFoundError,
  FarmHumanRanchInteractionActionRejectedError,
  FarmHumanRanchInteractionActionStateConflictError,
  FarmHumanRanchInteractionActionUnavailableError,
} from "./farm-ranch-interaction-action-client.js";
import {
  FarmRewardContractUnavailableError,
  FarmRewardCredentialInvalidError,
  FarmRewardUnavailableError,
} from "./farm-reward-client.js";
import {
  FarmHumanFarmSettingsActionContractUnavailableError,
  FarmHumanFarmSettingsActionCredentialInvalidError,
  FarmHumanFarmSettingsActionIdempotencyConflictError,
  FarmHumanFarmSettingsActionNotFoundError,
  FarmHumanFarmSettingsActionRejectedError,
  FarmHumanFarmSettingsActionStateConflictError,
  FarmHumanFarmSettingsActionUnavailableError,
} from "./farm-settings-action-client.js";
import {
  FarmHumanSmeltingActionContractUnavailableError,
  FarmHumanSmeltingActionCredentialInvalidError,
  FarmHumanSmeltingActionIdempotencyConflictError,
  FarmHumanSmeltingActionNotFoundError,
  FarmHumanSmeltingActionRejectedError,
  FarmHumanSmeltingActionStateConflictError,
  FarmHumanSmeltingActionUnavailableError,
} from "./farm-smelting-action-client.js";
import type { HomeWeatherEngine } from "./home-weather-engine.js";
import {
  LingyeDailyPublishAuthenticationError,
  type LingyeDailyService,
} from "./lingye-daily-service.js";
import {
  MAILBOX_PAGE_SIZE,
  MailboxAttachmentNotClaimableError,
  MailboxLetterNotFoundError,
  type MailboxService,
} from "./mailbox-service.js";
import {
  McpAccessInternalContractError,
  type McpAccessService,
  McpCredentialNotConfiguredError,
  McpMigrationNotConfirmedError,
  McpRuntimeUnavailableError,
} from "./mcp-access-service.js";
import {
  FarmMcpMigrationBindingMismatchError,
  FarmMcpMigrationConflictError,
  FarmMcpMigrationContractUnavailableError,
  FarmMcpMigrationCredentialInvalidError,
  FarmMcpMigrationUnavailableError,
} from "./mcp-farm-migration-client.js";
import type { DoorbellMcpRuntime } from "./mcp-runtime.js";
import {
  FarmHumanQixiMemorialContractUnavailableError,
  FarmHumanQixiMemorialCredentialInvalidError,
  FarmHumanQixiMemorialNotFoundError,
  FarmHumanQixiMemorialUnavailableError,
} from "./qixi-memorial-client.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import {
  AuthenticationRequiredError,
  FarmAlreadyBoundError,
  FarmConfirmationMismatchError,
  FarmCreationStateConflictError,
  FarmHumanKeyMismatchError,
  HumanAccountAlreadyRegisteredError,
  type HumanSettingsContext,
  InvalidHumanCredentialsError,
  InvalidRegistrationCodeError,
  QqNotGroupMemberError,
  type RegistrationAuthService,
  RegistrationProfileMismatchError,
  RegistrationProfileRequiredError,
  type RegistrationSessionResult,
} from "./registration-auth.js";
import {
  readHumanSessionToken,
  serializeClearedHumanSessionCookie,
  serializeHumanSessionCookie,
} from "./session-cookie.js";
import {
  SharedMemeBackendAuthenticationError,
  type SharedMemeBackendService,
} from "./shared-meme-backend-service.js";
import {
  SharedMemeDuplicateError,
  SharedMemeInvalidInputError,
  SharedMemeNotFoundError,
  type SharedMemeService,
  SharedMemeVersionAheadError,
} from "./shared-meme-service.js";

export interface BuildAppOptions {
  groupId: string;
  groupMembership: QqGroupMembershipReader;
  registrationAuth: RegistrationAuthService;
  farmPurchaseRequestService?: FarmPurchaseRequestService;
  bellService?: BellService;
  browserPushService?: BrowserPushService;
  activityReminderService?: Pick<ActivityReminderService, "cancelResident" | "refreshEligibility">;
  weatherEngine?: HomeWeatherEngine;
  lingyeDailyService?: LingyeDailyService;
  mailboxService?: MailboxService;
  mcpAccessService?: McpAccessService;
  mcpRuntime?: DoorbellMcpRuntime;
  sharedMemeBackendService?: SharedMemeBackendService;
  sharedMemeService?: SharedMemeService;
  secureCookies: boolean;
  logger?: boolean;
}

function accountResponse(account: {
  accountId: string;
  qqNumber: string;
  createdAt: number;
  membershipStatus: "active" | "inactive";
}) {
  return {
    account_id: account.accountId,
    qq_number: account.qqNumber,
    created_at: new Date(account.createdAt).toISOString(),
    membership_status: account.membershipStatus,
  };
}

function communityResponse(community: {
  account: Parameters<typeof accountResponse>[0];
  resident: { residentId: string; residentName: string };
  home: { homeId: string; homeName: string };
  farmBinding: { farmDoorplate: string };
}) {
  return {
    account: accountResponse(community.account),
    resident: {
      resident_id: community.resident.residentId,
      resident_name: community.resident.residentName,
    },
    home: {
      home_id: community.home.homeId,
      home_name: community.home.homeName,
    },
    farm_binding: {
      farm_doorplate: community.farmBinding.farmDoorplate,
    },
  };
}

function profileSelectionResponse(context: {
  activeProfileId: string;
  profiles: Array<{
    profileId: string;
    residentName: string;
    homeName: string;
    farmDoorplate: string;
  }>;
}) {
  return {
    active_profile_id: context.activeProfileId,
    profiles: context.profiles.map((profile) => ({
      profile_id: profile.profileId,
      resident_name: profile.residentName,
      home_name: profile.homeName,
      farm_doorplate: profile.farmDoorplate,
    })),
  };
}

function humanSettingsResponse(
  context: HumanSettingsContext,
  bellService?: BellService,
  browserPushService?: BrowserPushService,
) {
  const { settings } = context;
  return humanSettingsSuccessSchema.parse({
    ...profileSelectionResponse(context),
    connection_status: {
      wake_bridge: {
        ...(bellService?.getSettingsStatus(settings.residentId) ?? {
          status: "not_configured",
          last_connected_at: null,
        }),
      },
    },
    home: {
      home_name: settings.homeName,
      environment_description: settings.environmentDescription,
      climate_type: settings.climateType,
      weather_state:
        settings.weatherState === null
          ? null
          : {
              weather_revision: settings.weatherState.weatherRevision,
              season_phase: settings.weatherState.seasonPhase,
              condition: settings.weatherState.condition,
              state_started_at:
                settings.weatherState.stateStartedAt === null
                  ? null
                  : new Date(settings.weatherState.stateStartedAt).toISOString(),
              next_transition_at:
                settings.weatherState.nextTransitionAt === null
                  ? null
                  : new Date(settings.weatherState.nextTransitionAt).toISOString(),
            },
    },
    notification_preferences: {
      pause_all_wakeups: settings.pauseAllWakeups,
      visit_requests_and_invitations_enabled: settings.visitRequestsAndInvitationsEnabled,
      activity_invitations_enabled: settings.activityInvitationsEnabled,
      important_system_notifications_enabled: settings.importantSystemNotificationsEnabled,
    },
    shared_data_preferences: {
      shared_meme_update_signals_enabled: settings.sharedMemeUpdateSignalsEnabled,
    },
    browser_notification_preferences: {
      application_server_key: browserPushService?.applicationServerKey ?? null,
      browser_notifications_available: browserPushService !== undefined,
      browser_notifications_enabled: settings.browserNotificationsEnabled,
      activity_reminders_enabled: settings.activityRemindersEnabled,
    },
    community_connection_preferences: {
      default_connection_duration_minutes: settings.defaultConnectionDurationMinutes,
      initial_recent_activity_count: settings.initialRecentActivityCount,
      chat_mode: settings.chatMode,
      allow_activity_room_warmup: settings.allowActivityRoomWarmup,
    },
  });
}

function humanSettingsPatch(request: HumanSettingsPatchRequest): HumanSettingsPatch {
  const patch: HumanSettingsPatch = {};
  if (request.home?.home_name !== undefined) {
    patch.homeName = request.home.home_name;
  }
  if (request.home?.environment_description !== undefined) {
    patch.environmentDescription = request.home.environment_description;
  }
  if (request.home?.climate_type !== undefined) {
    patch.climateType = request.home.climate_type;
  }
  if (request.notification_preferences?.pause_all_wakeups !== undefined) {
    patch.pauseAllWakeups = request.notification_preferences.pause_all_wakeups;
  }
  if (request.notification_preferences?.visit_requests_and_invitations_enabled !== undefined) {
    patch.visitRequestsAndInvitationsEnabled =
      request.notification_preferences.visit_requests_and_invitations_enabled;
  }
  if (request.notification_preferences?.activity_invitations_enabled !== undefined) {
    patch.activityInvitationsEnabled =
      request.notification_preferences.activity_invitations_enabled;
  }
  if (request.notification_preferences?.important_system_notifications_enabled !== undefined) {
    patch.importantSystemNotificationsEnabled =
      request.notification_preferences.important_system_notifications_enabled;
  }
  if (request.shared_data_preferences?.shared_meme_update_signals_enabled !== undefined) {
    patch.sharedMemeUpdateSignalsEnabled =
      request.shared_data_preferences.shared_meme_update_signals_enabled;
  }
  if (request.browser_notification_preferences?.browser_notifications_enabled !== undefined) {
    patch.browserNotificationsEnabled =
      request.browser_notification_preferences.browser_notifications_enabled;
  }
  if (request.browser_notification_preferences?.activity_reminders_enabled !== undefined) {
    patch.activityRemindersEnabled =
      request.browser_notification_preferences.activity_reminders_enabled;
  }
  if (request.community_connection_preferences?.default_connection_duration_minutes !== undefined) {
    patch.defaultConnectionDurationMinutes =
      request.community_connection_preferences.default_connection_duration_minutes;
  }
  if (request.community_connection_preferences?.initial_recent_activity_count !== undefined) {
    patch.initialRecentActivityCount =
      request.community_connection_preferences.initial_recent_activity_count;
  }
  if (request.community_connection_preferences?.chat_mode !== undefined) {
    patch.chatMode = request.community_connection_preferences.chat_mode;
  }
  if (request.community_connection_preferences?.allow_activity_room_warmup !== undefined) {
    patch.allowActivityRoomWarmup =
      request.community_connection_preferences.allow_activity_room_warmup;
  }
  return patch;
}

function mailboxAttachmentResponse(letter: MailboxLetterRecord) {
  return letter.attachment === null
    ? null
    : {
        attachment_type: letter.attachment.attachmentType,
        status: letter.attachment.status,
      };
}

function mailboxLetterSummaryResponse(letter: MailboxLetterRecord) {
  return {
    letter_id: letter.letterId,
    title: letter.title,
    category: letter.category,
    created_at: new Date(letter.createdAt).toISOString(),
    is_new: letter.isNew,
    attachment: mailboxAttachmentResponse(letter),
  };
}

function lingyeDailyIssueResponse(issue: LingyeDailyIssueRecord) {
  const imageUrls = new Map(
    issue.edition.images.map((image) => [
      image.image_id,
      `data:${image.media_type};base64,${image.data_base64}`,
    ]),
  );
  return {
    issue_number: issue.issueNumber,
    issue_date: issue.issueDate,
    revision: issue.revision,
    revision_note: issue.revisionNote,
    period_start: issue.periodStart,
    period_end: issue.periodEnd,
    coverage_status: issue.coverageStatus,
    coverage_note: issue.coverageNote,
    generated_at: issue.generatedAt,
    published_at: new Date(issue.publishedAt).toISOString(),
    editor_model: issue.editorModel,
    front_page: issue.edition.front_page
      ? {
          title: issue.edition.front_page.title,
          paragraphs: issue.edition.front_page.paragraphs,
          image_urls: issue.edition.front_page.image_ids.flatMap((imageId) => {
            const imageUrl = imageUrls.get(imageId);
            return imageUrl ? [imageUrl] : [];
          }),
        }
      : null,
    group_chat: {
      summary: issue.edition.group_chat.summary,
      topics: issue.edition.group_chat.topics.map((topic) => topic.text),
    },
    behavior_slices: issue.edition.behavior_slices.map(({ title, body, image_ids }) => ({
      title,
      body,
      image_urls: image_ids.flatMap((imageId) => {
        const imageUrl = imageUrls.get(imageId);
        return imageUrl ? [imageUrl] : [];
      }),
    })),
    quotes: issue.edition.quotes.map(({ text, source_label }) => ({ text, source_label })),
    farm_observation: issue.edition.farm_observation,
    submissions: issue.edition.submissions,
    tomorrow_question: issue.edition.tomorrow_question
      ? { text: issue.edition.tomorrow_question.text }
      : null,
  };
}

function readMcpBackendCredential(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  const parsed = mcpCredentialSchema.safeParse(authorization.slice("Bearer ".length));
  return parsed.success ? parsed.data : undefined;
}

function readBellCredential(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  const credential = authorization.slice("Bearer ".length);
  return /^dbb_[A-Za-z0-9_-]{43}$/u.test(credential) ? credential : undefined;
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function bellControlText(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value
  );
}

function sendBellError(reply: FastifyReply, statusCode: 400 | 401 | 403 | 409 | 503, code: string) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send({ error: { code } });
}

function sendMailboxError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "letter_not_found"
    | "attachment_not_claimable"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable",
  message: string,
) {
  return reply.code(statusCode).send(
    mailboxErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendSharedMemeError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "shared_meme_not_found"
    | "shared_meme_version_ahead"
    | "duplicate_shared_meme_term"
    | "duplicate_shared_meme_alias"
    | "shared_meme_unavailable",
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(sharedMemeErrorSchema.parse({ error: { code, message } }));
}

function sendLingyeDailyError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 409 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "idempotency_conflict",
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(lingyeDailyErrorSchema.parse({ error: { code, message } }));
}

function sendAuthenticationError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "invalid_credentials"
    | "invalid_registration_code"
    | "account_already_registered"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "authentication_required"
    | "farm_not_found"
    | "farm_unavailable"
    | "farm_confirmation_mismatch"
    | "invalid_farm_human_url"
    | "invalid_farm_human_key"
    | "farm_human_key_mismatch"
    | "upstream_contract_unavailable"
    | "registration_profile_required"
    | "registration_profile_mismatch"
    | "farm_already_bound"
    | "farm_creation_conflict"
    | "farm_creation_unavailable"
    | "profile_not_available",
  message: string,
) {
  return reply.code(statusCode).send(
    humanAuthenticationErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundFarmError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "farm_not_found"
    | "farm_not_publicly_readable"
    | "farm_unavailable",
  message: string,
) {
  return reply.code(statusCode).send(
    boundFarmOverviewErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundFarmFieldError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "farm_not_found"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable",
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmFieldErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundConstableInterviewError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundConstableInterviewErrorCode,
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundConstableInterviewErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundConstableInterviewFailure(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  secureCookies: boolean,
) {
  if (error instanceof AuthenticationRequiredError) {
    return sendBoundConstableInterviewError(
      reply,
      401,
      "authentication_required",
      "An active human session is required",
    );
  }
  if (error instanceof QqNotGroupMemberError) {
    reply.header("set-cookie", serializeClearedHumanSessionCookie(secureCookies));
    return sendBoundConstableInterviewError(
      reply,
      403,
      "qq_not_group_member",
      "The session QQ number is no longer a current member of the community group",
    );
  }
  if (error instanceof OneBotUnavailableError) {
    reportOneBotUnavailable(request, error);
    return sendBoundConstableInterviewError(
      reply,
      503,
      "onebot_unavailable",
      "QQ group membership could not be verified",
    );
  }
  if (error instanceof RegistrationProfileRequiredError) {
    return sendBoundConstableInterviewError(
      reply,
      409,
      "registration_profile_required",
      "A resident, home, and farm binding are required",
    );
  }
  if (error instanceof FarmConstableInterviewCredentialInvalidError) {
    return sendBoundConstableInterviewError(
      reply,
      409,
      "farm_credential_invalid",
      "The bound farm human credential is no longer valid",
    );
  }
  if (error instanceof FarmConstableInterviewNotFoundError) {
    return sendBoundConstableInterviewError(
      reply,
      404,
      "farm_not_found",
      "The bound farm no longer exists",
    );
  }
  if (error instanceof FarmConstableInterviewRejectedError) {
    const parsedCode = boundConstableInterviewErrorCodeSchema.safeParse(error.code);
    if (!parsedCode.success) {
      request.log.warn(
        { error_code: error.code },
        "Farm constable interview returned a code outside the bound Human API",
      );
      return sendBoundConstableInterviewError(
        reply,
        502,
        "upstream_contract_unavailable",
        "The farm constable interview response could not be verified",
      );
    }
    const statusCode =
      error.code === "interview_not_found"
        ? 404
        : error.code === "interview_material_not_configured"
          ? 503
          : error.code === "invalid_interview_score"
            ? 400
            : 409;
    return sendBoundConstableInterviewError(reply, statusCode, parsedCode.data, error.message);
  }
  if (error instanceof FarmConstableInterviewContractUnavailableError) {
    request.log.warn({ error_name: error.name }, "Farm constable interview contract unavailable");
    return sendBoundConstableInterviewError(
      reply,
      502,
      "upstream_contract_unavailable",
      "The farm constable interview response could not be verified",
    );
  }
  if (error instanceof FarmConstableInterviewUnavailableError) {
    request.log.warn({ error_name: error.name }, "Farm constable interview unavailable");
    return sendBoundConstableInterviewError(
      reply,
      503,
      "farm_unavailable",
      "The farm constable interview is unavailable",
    );
  }
  throw error;
}

function boundConstableInterviewResponse(result: FarmHumanConstableInterviewSuccess) {
  const parsedResult = farmHumanConstableInterviewSuccessSchema.safeParse(result);
  if (!parsedResult.success) {
    throw new FarmConstableInterviewContractUnavailableError();
  }
  return boundConstableInterviewSuccessSchema.parse({
    interviews: parsedResult.data.data.interviews.map(
      ({ attempt_id: _attemptId, candidate_resident_id: _candidateResidentId, ...interview }) =>
        interview,
    ),
  });
}

function sendBoundFarmPurchaseRequestError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code:
    | "shop_changed"
    | "idempotency_conflict"
    | "operation_not_allowed"
    | "state_conflict"
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "farm_not_found"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable",
  message: string,
  currentShopRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmPurchaseRequestErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentShopRevision ? { current_shop_revision: currentShopRevision } : {}),
      },
    }),
  );
}

function sendBoundFarmPurchaseRequestSuccess(
  reply: FastifyReply,
  result: FarmPurchaseRequestCreateResult,
) {
  reply.header("cache-control", "no-store");
  return boundFarmPurchaseRequestCreateSuccessSchema.parse({
    data: {
      shop: result.request.shop,
      shop_revision: result.request.shopRevision,
      items: result.request.items.map((item) => ({
        kind: item.kind,
        item_id: item.itemId,
        qty: item.qty,
      })),
      status: result.request.status,
      expires_at: new Date(result.request.expiresAt).toISOString(),
    },
    server_time: new Date().toISOString(),
  });
}

type BoundFarmStructuredErrorCode =
  | "invalid_request"
  | "authentication_required"
  | "qq_not_group_member"
  | "onebot_unavailable"
  | "registration_profile_required"
  | "farm_not_found"
  | "farm_credential_invalid"
  | "farm_unavailable"
  | "upstream_contract_unavailable";

type BoundFarmStructuredStatusCode = 400 | 401 | 403 | 404 | 409 | 502 | 503;

function sendBoundFarmCatalogReadError(
  reply: FastifyReply,
  statusCode: BoundFarmStructuredStatusCode,
  code: BoundFarmStructuredErrorCode,
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmCatalogReadErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundFarmBulletinReadError(
  reply: FastifyReply,
  statusCode: BoundFarmStructuredStatusCode,
  code: BoundFarmStructuredErrorCode,
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmBulletinReadErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundFarmBulletinAckError(
  reply: FastifyReply,
  statusCode: BoundFarmStructuredStatusCode,
  code: BoundFarmStructuredErrorCode | "state_conflict" | "idempotency_conflict",
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmBulletinAckErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision ? { current_revision: currentRevision } : {}),
      },
    }),
  );
}

function sendBoundFarmKitchenReadError(
  reply: FastifyReply,
  statusCode: BoundFarmStructuredStatusCode,
  code: BoundFarmStructuredErrorCode,
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmKitchenReadErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundFarmKitchenPurchaseError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmKitchenPurchaseErrorCode,
  message: string,
  currentShopRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmKitchenPurchaseErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentShopRevision === undefined
          ? {}
          : { current_shop_revision: currentShopRevision }),
      },
    }),
  );
}

function sendBoundFarmKitchenCookError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmKitchenCookErrorCode,
  message: string,
  currentKitchenInventoryRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmKitchenCookErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentKitchenInventoryRevision === undefined
          ? {}
          : { current_kitchen_inventory_revision: currentKitchenInventoryRevision }),
      },
    }),
  );
}

function sendBoundFarmKitchenInventoryActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmKitchenInventoryActionErrorCode,
  message: string,
  currentInventoryRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmKitchenInventoryActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentInventoryRevision === undefined
          ? {}
          : { current_kitchen_inventory_revision: currentInventoryRevision }),
      },
    }),
  );
}

function sendBoundFarmKitchenShopRefreshError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmKitchenShopRefreshErrorCode,
  message: string,
  currentShopRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmKitchenShopRefreshErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentShopRevision === undefined
          ? {}
          : { current_shop_revision: currentShopRevision }),
      },
    }),
  );
}

function sendBoundFarmOriginalPlantActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmOriginalPlantActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmOriginalPlantActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundFarmCropCodexActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmCropCodexActionErrorCode,
  message: string,
  currentCodexRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmCropCodexActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentCodexRevision === undefined ? {} : { current_revision: currentCodexRevision }),
      },
    }),
  );
}

function sendBoundFarmSmeltingActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmSmeltingActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmSmeltingActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundFarmExpeditionActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmExpeditionActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmExpeditionActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundFarmRanchInteractionActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmRanchInteractionActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmRanchInteractionActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundFarmNeighborhoodMessageActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmNeighborhoodMessageActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmNeighborhoodMessageActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundFarmMarketActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmMarketActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmMarketActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundFarmRanchReadError(
  reply: FastifyReply,
  statusCode: BoundFarmStructuredStatusCode,
  code: BoundFarmStructuredErrorCode,
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmRanchErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundFarmRanchResidentActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmRanchResidentActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmRanchResidentActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundFarmRanchCollectionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmRanchCollectionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmRanchCollectionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundFarmRanchDecorationActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmRanchDecorationActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmRanchDecorationActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundFarmSettingsActionError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmSettingsActionErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmSettingsActionErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendBoundGlimmerReadError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "farm_not_found"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable",
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundGlimmerReadErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundTogetherReadError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "farm_not_found"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable",
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundTogetherReadErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBoundQixiMemorialReadError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "farm_not_found"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable",
  message: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundQixiMemorialReadErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendHarvestAssistError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmHarvestAssistErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmHarvestAssistErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function sendLandUpgradeError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
  code: BoundFarmLandUpgradeErrorCode,
  message: string,
  currentRevision?: string,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    boundFarmLandUpgradeErrorSchema.parse({
      error: {
        code,
        message,
        ...(currentRevision === undefined ? {} : { current_revision: currentRevision }),
      },
    }),
  );
}

function parseIfMatchRevision(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (value.startsWith('"') || value.endsWith('"')) {
    return /^"[^"]+"$/.test(value) ? value.slice(1, -1) : undefined;
  }
  return /^[^\s",]+$/.test(value) ? value : undefined;
}

function requestHasBody(request: FastifyRequest): boolean {
  if (request.body !== undefined) {
    return true;
  }
  const contentLength = request.headers["content-length"];
  return typeof contentLength === "string" && Number(contentLength) > 0;
}

function sendHumanSettingsError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 409 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "profile_not_available",
  message: string,
) {
  return reply.code(statusCode).send(
    humanSettingsErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function sendBrowserPushError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 409 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "browser_notifications_unavailable",
  message: string,
) {
  return reply.code(statusCode).send(browserPushErrorSchema.parse({ error: { code, message } }));
}

function sendMcpAccessError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 405 | 409 | 500 | 502 | 503,
  code: McpAccessErrorCode,
) {
  reply.header("cache-control", "no-store");
  return reply.code(statusCode).send(
    mcpAccessErrorSchema.parse({
      error: {
        code,
        message: mcpAccessErrorMessages[code],
      },
    }),
  );
}

function sendFarmHumanUiError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 409 | 502 | 503,
  code:
    | "invalid_request"
    | "authentication_required"
    | "qq_not_group_member"
    | "onebot_unavailable"
    | "registration_profile_required"
    | "farm_credential_invalid"
    | "farm_unavailable"
    | "upstream_contract_unavailable",
  message: string,
) {
  return reply.code(statusCode).send(
    farmHumanUiErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function reportOneBotUnavailable(request: FastifyRequest, error: OneBotUnavailableError): void {
  request.log.error({ error_name: error.name }, "OneBot group-membership lookup is unavailable");
}

function reportFarmUnavailable(
  request: FastifyRequest,
  error: FarmDirectoryUnavailableError | FarmUpstreamContractUnavailableError,
): void {
  request.log.error({ error_name: error.name }, "Farm directory lookup is unavailable");
}

function reportFarmHumanFieldUnavailable(
  request: FastifyRequest,
  error: FarmHumanFieldContractUnavailableError | FarmHumanFieldUnavailableError,
): void {
  request.log.error({ error_name: error.name }, "Farm Human field read is unavailable");
}

function reportFarmLingyeUnavailable(
  request: FastifyRequest,
  error: FarmLingyeContractUnavailableError | FarmLingyeUnavailableError,
): void {
  request.log.error({ error_name: error.name }, "Farm Lingye structured read is unavailable");
}

const FARM_HUMAN_GET_ROUTES = new Map<string, readonly string[]>([
  ["", []],
  ["messages", []],
  ["market", []],
  ["ranch", []],
  ["cooking", []],
  ["ta", []],
  ["expedition", []],
  ["codex", []],
  ["leaderboard", []],
  ["ta/link-design", ["name", "desc", "plant", "harvest", "latin"]],
  ["ta/link-message", ["target", "text"]],
  ["ta/link-craft", ["m1", "m2", "m3"]],
  ["ta/link-visit", ["target"]],
]);

const INDEPENDENT_FARM_HUMAN_SECTIONS = new Set(["glimmer", "together"]);

const FARM_HUMAN_POST_ROUTES = new Map<string, readonly string[]>([
  ["harvest", []],
  ["title", ["id"]],
  ["market/buy", ["seller", "kind", "id", "qty"]],
  ["market/list", ["give", "giveQty", "want", "wantQty"]],
  ["market/trade", ["seller", "listing"]],
  ["market/unlist", ["listing"]],
  ["ranch/collect", []],
  ["ranch/feed", ["animal"]],
  ["ranch/remit", ["amount"]],
  ["ranch/dress", ["acc"]],
  ["ranch/decorate", ["decor"]],
  ["ranch/place", ["decor"]],
  ["ranch/unplace", ["decor"]],
  ["ranch/wear", ["acc", "who"]],
  ["ranch/takeoff", ["acc", "target", "idx"]],
  ["ranch/upgrade", ["animal"]],
  ["ranch/name-animal", ["animal", "name"]],
  ["ranch/name-pet", ["pet", "name"]],
  ["ranch/name-goose", ["name"]],
  ["ranch/pin", ["kind"]],
  ["ranch/variant", ["type", "kind", "variant"]],
  ["ranch/dispatch-raid", ["animal", "to", "hours"]],
  ["ranch/catch-raid", ["raid"]],
  ["cooking/buy-ingredient", ["id", "qty"]],
  ["cooking/buy-recipe", ["id"]],
  ["cooking/cook", ["items"]],
  ["cooking/use", ["dishId", "target"]],
  ["cooking/sell", ["itemId", "itemIds", "qty", "to", "price"]],
  ["ta/names", ["farmName", "aiName", "humanName"]],
  ["ta/welcome", ["text"]],
  ["ta/social", ["key", "on"]],
  ["ta/design", ["name", "desc", "plant", "harvest", "latin"]],
  ["ta/message", ["target", "text"]],
  ["ta/craft", ["m1", "m2", "m3"]],
  ["expedition/roll", []],
  ["expedition/charm", ["kind", "blessing"]],
  ["codex/star", ["id", "anchor"]],
]);

function validateParameters(
  parameters: URLSearchParams,
  allowedFields: readonly string[],
): URLSearchParams | undefined {
  const allowed = new Set(allowedFields);
  const seen = new Set<string>();
  for (const key of parameters.keys()) {
    if (!allowed.has(key) || seen.has(key)) {
      return undefined;
    }
    seen.add(key);
  }
  return parameters;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                'res.headers["set-cookie"]',
              ],
              censor: "[Redacted]",
            },
          },
  });
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) =>
      done(null, new URLSearchParams(typeof body === "string" ? body : body.toString("utf8"))),
  );

  app.get("/api/health", async () =>
    serviceHealthSchema.parse({
      service: "doorbell-commons",
      status: "ok",
    }),
  );

  const bellService = options.bellService;
  if (bellService) {
    const sendBellFailure = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
      if (
        error instanceof BellCredentialAuthenticationError ||
        error instanceof AuthenticationRequiredError
      ) {
        return sendBellError(reply, 401, "authentication_required");
      }
      if (error instanceof QqNotGroupMemberError) {
        return sendBellError(reply, 403, "qq_not_group_member");
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBellError(reply, 503, "membership_verification_unavailable");
      }
      if (
        error instanceof BellConnectionEpochMismatchError ||
        error instanceof BellWakeControlError
      ) {
        return sendBellError(reply, 409, "wake_state_conflict");
      }
      throw error;
    };

    app.get("/api/bell/stream", async (request, reply) => {
      if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
        return sendBellError(reply, 400, "invalid_request");
      }
      const credential = readBellCredential(request.headers.authorization);
      if (!credential) {
        return sendBellError(reply, 401, "authentication_required");
      }

      let started = false;
      const prepareStream = (): void => {
        if (started) return;
        started = true;
        reply.hijack();
        reply.raw.writeHead(200, {
          "cache-control": "no-store",
          connection: "keep-alive",
          "content-type": "text/event-stream; charset=utf-8",
          "x-accel-buffering": "no",
        });
      };
      const sink: BellStreamSink = {
        send: (event, data) => {
          prepareStream();
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        heartbeat: () => {
          prepareStream();
          reply.raw.write(": heartbeat\n\n");
        },
        close: () => {
          if (started && !reply.raw.writableEnded) reply.raw.end();
        },
      };
      try {
        const connection = await bellService.connect(credential, sink);
        reply.raw.once("close", () => connection.close());
        return reply;
      } catch (error) {
        if (started) {
          if (!reply.raw.writableEnded) reply.raw.end();
          return reply;
        }
        return sendBellFailure(request, reply, error);
      }
    });

    app.post("/api/bell/ack", async (request, reply) => {
      const body = request.body;
      if (
        !humanSettingsReadRequestSchema.safeParse(request.query).success ||
        !exactObject(body, ["version", "wake_id", "connection_epoch"]) ||
        body.version !== 1 ||
        !bellControlText(body.wake_id) ||
        !bellControlText(body.connection_epoch)
      ) {
        return sendBellError(reply, 400, "invalid_request");
      }
      const credential = readBellCredential(request.headers.authorization);
      if (!credential) {
        return sendBellError(reply, 401, "authentication_required");
      }
      try {
        return await bellService.acknowledge(credential, {
          wakeId: body.wake_id,
          connectionEpoch: body.connection_epoch,
        });
      } catch (error) {
        return sendBellFailure(request, reply, error);
      }
    });

    app.post("/api/bell/report", async (request, reply) => {
      const body = request.body;
      const allowedReasons = new Set([
        "busy_exhausted",
        "retryable_exhausted",
        "timeout_exhausted",
        "permanent_error",
      ]);
      if (
        !humanSettingsReadRequestSchema.safeParse(request.query).success ||
        !exactObject(body, [
          "version",
          "wake_id",
          "connection_epoch",
          "status",
          "reason",
          "error_code",
        ]) ||
        body.version !== 1 ||
        body.status !== "blocked" ||
        !bellControlText(body.wake_id) ||
        !bellControlText(body.connection_epoch) ||
        typeof body.reason !== "string" ||
        !allowedReasons.has(body.reason) ||
        typeof body.error_code !== "string" ||
        !/^[a-z0-9_]{1,64}$/u.test(body.error_code)
      ) {
        return sendBellError(reply, 400, "invalid_request");
      }
      const credential = readBellCredential(request.headers.authorization);
      if (!credential) {
        return sendBellError(reply, 401, "authentication_required");
      }
      try {
        return await bellService.reportBlocked(credential, {
          wakeId: body.wake_id,
          connectionEpoch: body.connection_epoch,
          blockReason: body.reason,
          errorCode: body.error_code,
        });
      } catch (error) {
        return sendBellFailure(request, reply, error);
      }
    });

    app.addHook("onClose", () => {
      bellService.close();
    });
  }

  app.post("/api/registration/qq-group-eligibility", async (request, reply) => {
    const parsedRequest = qqGroupEligibilityRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.code(400).send(
        qqGroupEligibilityErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "qq_number must be a decimal string and no extra fields are accepted",
          },
        }),
      );
    }

    let isCurrentMember: boolean;
    try {
      isCurrentMember = await options.groupMembership.isCurrentMember(
        options.groupId,
        parsedRequest.data.qq_number,
      );
    } catch (error) {
      if (!(error instanceof OneBotUnavailableError)) {
        throw error;
      }

      request.log.error(
        { error_name: error.name },
        "OneBot group-membership lookup is unavailable",
      );
      return reply.code(503).send(
        qqGroupEligibilityErrorSchema.parse({
          error: {
            code: "onebot_unavailable",
            message: "QQ group membership could not be verified",
          },
        }),
      );
    }

    if (!isCurrentMember) {
      return reply.code(403).send(
        qqGroupEligibilityErrorSchema.parse({
          error: {
            code: "qq_not_group_member",
            message: "The submitted QQ number is not a current member of the community group",
          },
        }),
      );
    }

    return qqGroupEligibilitySuccessSchema.parse({
      eligible: true,
      qq_number: parsedRequest.data.qq_number,
      group_id: options.groupId,
    });
  });

  app.post("/api/registration/farm-lookup", async (request, reply) => {
    const parsedRequest = farmLookupRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.code(400).send(
        farmLookupErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "farm_doorplate must be one exact public farm doorplate",
          },
        }),
      );
    }

    try {
      const farm = await options.registrationAuth.lookupFarm(parsedRequest.data.farm_doorplate);
      return farmLookupSuccessSchema.parse({
        farm_doorplate: farm.farmDoorplate,
        farm_name: farm.farmName,
      });
    } catch (error) {
      if (error instanceof FarmNotFoundError) {
        return reply.code(404).send(
          farmLookupErrorSchema.parse({
            error: {
              code: "farm_not_found",
              message: "The submitted farm doorplate does not exist",
            },
          }),
        );
      }
      if (error instanceof FarmDirectoryUnavailableError) {
        reportFarmUnavailable(request, error);
        return reply.code(503).send(
          farmLookupErrorSchema.parse({
            error: {
              code: "farm_unavailable",
              message: "The farm directory could not be queried",
            },
          }),
        );
      }
      throw error;
    }
  });

  app.post("/api/auth/session", async (request, reply) => {
    const parsedRequest = humanSessionRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return sendAuthenticationError(
        reply,
        400,
        "invalid_request",
        "Submit the exact password-login or first-registration fields",
      );
    }

    try {
      const firstRegistration =
        "resident_name" in parsedRequest.data
          ? "farm_human_url" in parsedRequest.data
            ? {
                mode: "bind_existing" as const,
                residentName: parsedRequest.data.resident_name,
                homeName: parsedRequest.data.home_name,
                farmDoorplate: parsedRequest.data.farm_doorplate,
                farmHumanUrl: parsedRequest.data.farm_human_url,
                confirmedFarmName: parsedRequest.data.confirmed_farm_name,
                password: parsedRequest.data.password,
              }
            : {
                mode: "create_farm" as const,
                residentName: parsedRequest.data.resident_name,
                homeName: parsedRequest.data.home_name,
                farmName: parsedRequest.data.farm_name,
                aiName: parsedRequest.data.ai_name,
                password: parsedRequest.data.password,
              }
          : undefined;
      const session: RegistrationSessionResult =
        "registration_code" in parsedRequest.data
          ? await options.registrationAuth.createSession({
              qqNumber: parsedRequest.data.qq_number,
              registrationCode: parsedRequest.data.registration_code,
              ...(firstRegistration ? { firstRegistration } : {}),
            })
          : await options.registrationAuth.createPasswordSession({
              qqNumber: parsedRequest.data.qq_number,
              password: parsedRequest.data.password,
            });
      try {
        options.mailboxService?.ensureWelcomeLetter(
          session.community.home.homeId,
          session.community.farmBinding.farmHumanKey ?? "",
        );
      } catch (error) {
        request.log.error(
          { error_name: error instanceof Error ? error.name : "UnknownError" },
          "Welcome-letter delivery failed after the human session was created",
        );
      }
      reply.header("set-cookie", serializeHumanSessionCookie(session.token, options.secureCookies));
      if (session.createdFarm) {
        reply.header("cache-control", "no-store");
        return createdFarmHumanSessionSuccessSchema.parse({
          authenticated: true,
          account_created: session.accountCreated,
          ...communityResponse(session.community),
          ...profileSelectionResponse(session),
          created_farm: {
            farm_doorplate: session.createdFarm.farmDoorplate,
            farm_name: session.createdFarm.farmName,
            ai_name: session.createdFarm.aiName,
            farm_human_url: session.createdFarm.farmHumanUrl,
          },
        });
      }
      return humanSessionSuccessSchema.parse({
        authenticated: true,
        account_created: session.accountCreated,
        ...communityResponse(session.community),
        ...profileSelectionResponse(session),
      });
    } catch (error) {
      if (error instanceof InvalidHumanCredentialsError) {
        return sendAuthenticationError(
          reply,
          401,
          "invalid_credentials",
          "The QQ number or password is incorrect",
        );
      }
      if (error instanceof InvalidRegistrationCodeError) {
        return sendAuthenticationError(
          reply,
          403,
          "invalid_registration_code",
          "The registration code is not current",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        return sendAuthenticationError(
          reply,
          403,
          "qq_not_group_member",
          "The submitted QQ number is not a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof FarmNotFoundError) {
        return sendAuthenticationError(
          reply,
          404,
          "farm_not_found",
          "The submitted farm doorplate does not exist",
        );
      }
      if (error instanceof FarmDirectoryUnavailableError) {
        reportFarmUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          503,
          "farm_unavailable",
          "The farm directory could not be queried",
        );
      }
      if (error instanceof FarmHumanCredentialInvalidError) {
        return sendAuthenticationError(
          reply,
          403,
          "invalid_farm_human_key",
          "The submitted farm human credential is invalid",
        );
      }
      if (error instanceof InvalidFarmHumanUrlError) {
        return sendAuthenticationError(
          reply,
          400,
          "invalid_farm_human_url",
          "farm_human_url must use the configured farm origin and /farm/ui/<humanKey> path",
        );
      }
      if (error instanceof FarmHumanKeyMismatchError) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_human_key_mismatch",
          "The submitted farm human credential belongs to a different farm doorplate",
        );
      }
      if (error instanceof FarmUpstreamContractUnavailableError) {
        reportFarmUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm identity response could not be verified",
        );
      }
      if (error instanceof FarmConfirmationMismatchError) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_confirmation_mismatch",
          "The farm name changed or does not match the confirmed farm",
        );
      }
      if (error instanceof FarmCreationRejectedError) {
        return sendAuthenticationError(
          reply,
          400,
          "invalid_request",
          "The farm creation details were rejected",
        );
      }
      if (
        error instanceof FarmCreationConflictError ||
        error instanceof FarmCreationStateConflictError
      ) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_creation_conflict",
          "This farm creation request conflicts with an existing attempt",
        );
      }
      if (error instanceof FarmCreationContractUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm creation receipt could not be verified",
        );
        return sendAuthenticationError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm creation response could not be verified",
        );
      }
      if (error instanceof FarmCreationUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm creation service is unavailable");
        return sendAuthenticationError(
          reply,
          503,
          "farm_creation_unavailable",
          "The farm could not be created at this time",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendAuthenticationError(
          reply,
          409,
          "registration_profile_required",
          "Resident, home, and farm fields are required to complete first registration",
        );
      }
      if (error instanceof HumanAccountAlreadyRegisteredError) {
        return sendAuthenticationError(
          reply,
          409,
          "account_already_registered",
          "This QQ account is already registered; use its password to log in",
        );
      }
      if (error instanceof RegistrationProfileMismatchError) {
        return sendAuthenticationError(
          reply,
          409,
          "registration_profile_mismatch",
          "Submitted resident, home, or farm fields do not match the existing registration",
        );
      }
      if (error instanceof FarmAlreadyBoundError) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_already_bound",
          "The submitted farm doorplate is already bound to another profile",
        );
      }
      throw error;
    }
  });

  app.get("/api/auth/session", async (request, reply) => {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendAuthenticationError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const context = await options.registrationAuth.getCurrentProfileContext(token);
      return currentHumanSessionSuccessSchema.parse({
        authenticated: true,
        ...communityResponse(context.community),
        ...profileSelectionResponse(context),
      });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendAuthenticationError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendAuthenticationError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendAuthenticationError(
          reply,
          409,
          "registration_profile_required",
          "Resident, home, and farm fields are required to complete first registration",
        );
      }
      throw error;
    }
  });

  app.post("/api/profiles", async (request, reply) => {
    const parsedRequest = additionalHumanProfileRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return sendAuthenticationError(
        reply,
        400,
        "invalid_request",
        "Submit one exact existing-farm or new-farm profile",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendAuthenticationError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const input = parsedRequest.data;
      const result = await options.registrationAuth.createAdditionalProfile(
        token,
        "farm_human_url" in input
          ? {
              mode: "bind_existing",
              residentName: input.resident_name,
              homeName: input.home_name,
              farmDoorplate: input.farm_doorplate,
              farmHumanUrl: input.farm_human_url,
              confirmedFarmName: input.confirmed_farm_name,
            }
          : {
              mode: "create_farm",
              residentName: input.resident_name,
              homeName: input.home_name,
              farmName: input.farm_name,
              aiName: input.ai_name,
            },
      );
      try {
        options.mailboxService?.ensureWelcomeLetter(
          result.community.home.homeId,
          result.community.farmBinding.farmHumanKey ?? "",
        );
      } catch (error) {
        request.log.error(
          { error_name: error instanceof Error ? error.name : "UnknownError" },
          "Welcome-letter delivery failed after the additional profile was created",
        );
      }
      if (result.createdFarm) {
        reply.header("cache-control", "no-store");
        return createdFarmHumanSessionSuccessSchema.parse({
          authenticated: true,
          account_created: false,
          ...communityResponse(result.community),
          ...profileSelectionResponse(result),
          created_farm: {
            farm_doorplate: result.createdFarm.farmDoorplate,
            farm_name: result.createdFarm.farmName,
            ai_name: result.createdFarm.aiName,
            farm_human_url: result.createdFarm.farmHumanUrl,
          },
        });
      }
      return humanSessionSuccessSchema.parse({
        authenticated: true,
        account_created: false,
        ...communityResponse(result.community),
        ...profileSelectionResponse(result),
      });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendAuthenticationError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendAuthenticationError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof HumanProfileNotAvailableError) {
        return sendAuthenticationError(
          reply,
          409,
          "profile_not_available",
          "The current session cannot add a profile to this account",
        );
      }
      if (error instanceof FarmNotFoundError) {
        return sendAuthenticationError(
          reply,
          404,
          "farm_not_found",
          "The submitted farm doorplate does not exist",
        );
      }
      if (error instanceof FarmDirectoryUnavailableError) {
        reportFarmUnavailable(request, error);
        return sendAuthenticationError(
          reply,
          503,
          "farm_unavailable",
          "The farm directory could not be queried",
        );
      }
      if (error instanceof FarmHumanCredentialInvalidError) {
        return sendAuthenticationError(
          reply,
          403,
          "invalid_farm_human_key",
          "The submitted farm human credential is invalid",
        );
      }
      if (error instanceof InvalidFarmHumanUrlError) {
        return sendAuthenticationError(
          reply,
          400,
          "invalid_farm_human_url",
          "farm_human_url must use the configured farm origin and /farm/ui/<humanKey> path",
        );
      }
      if (error instanceof FarmHumanKeyMismatchError) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_human_key_mismatch",
          "The submitted farm human credential belongs to a different farm doorplate",
        );
      }
      if (error instanceof FarmConfirmationMismatchError) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_confirmation_mismatch",
          "The farm name changed or does not match the confirmed farm",
        );
      }
      if (error instanceof FarmAlreadyBoundError) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_already_bound",
          "The submitted farm doorplate is already bound to another profile",
        );
      }
      if (
        error instanceof FarmCreationConflictError ||
        error instanceof FarmCreationStateConflictError
      ) {
        return sendAuthenticationError(
          reply,
          409,
          "farm_creation_conflict",
          "This farm creation request conflicts with an existing attempt",
        );
      }
      if (error instanceof FarmCreationRejectedError) {
        return sendAuthenticationError(
          reply,
          400,
          "invalid_request",
          "The farm creation details were rejected",
        );
      }
      if (error instanceof FarmCreationContractUnavailableError) {
        return sendAuthenticationError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm creation response could not be verified",
        );
      }
      if (error instanceof FarmCreationUnavailableError) {
        return sendAuthenticationError(
          reply,
          503,
          "farm_creation_unavailable",
          "The farm could not be created at this time",
        );
      }
      throw error;
    }
  });

  const sendMailboxFailure = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendMailboxError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendMailboxError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendMailboxError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendMailboxError(
        reply,
        409,
        "registration_profile_required",
        "A complete resident, home, and farm registration is required",
      );
    }
    if (error instanceof MailboxLetterNotFoundError) {
      return sendMailboxError(
        reply,
        404,
        "letter_not_found",
        "The requested mailbox letter does not exist in this home",
      );
    }
    if (error instanceof MailboxAttachmentNotClaimableError) {
      return sendMailboxError(
        reply,
        409,
        "attachment_not_claimable",
        "The mailbox letter has no claimable attachment",
      );
    }
    if (error instanceof FarmRewardCredentialInvalidError) {
      return sendMailboxError(
        reply,
        409,
        "farm_credential_invalid",
        "The bound farm credential is no longer valid",
      );
    }
    if (error instanceof FarmRewardUnavailableError) {
      return sendMailboxError(
        reply,
        503,
        "farm_unavailable",
        "The farm reward service is unavailable",
      );
    }
    if (error instanceof FarmRewardContractUnavailableError) {
      return sendMailboxError(
        reply,
        502,
        "upstream_contract_unavailable",
        "The farm reward receipt could not be verified",
      );
    }
    throw error;
  };

  const mailboxService = options.mailboxService;
  if (mailboxService) {
    app.get("/api/mailbox", async (request, reply) => {
      const parsedRequest = mailboxListRequestSchema.safeParse(request.query);
      if (!parsedRequest.success) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "Mailbox list accepts one positive page number and one supported category",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }

      try {
        const community = await options.registrationAuth.getCurrentSession(token);
        const page = mailboxService.listForAudience(
          community.home.homeId,
          "human",
          parsedRequest.data.page,
          parsedRequest.data.category,
        );
        return mailboxListSuccessSchema.parse({
          letters: page.letters.map(mailboxLetterSummaryResponse),
          pagination: {
            page: parsedRequest.data.page,
            page_size: MAILBOX_PAGE_SIZE,
            total_items: page.totalItems,
            total_pages: Math.ceil(page.totalItems / MAILBOX_PAGE_SIZE),
          },
        });
      } catch (error) {
        return sendMailboxFailure(request, reply, error);
      }
    });

    app.get("/api/mailbox/:letterId", async (request, reply) => {
      if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "Mailbox detail does not accept query parameters",
        );
      }
      const parsedRequest = mailboxDetailRequestSchema.safeParse({
        letter_id: (request.params as { letterId?: unknown }).letterId,
      });
      if (!parsedRequest.success) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "letter_id must be a valid mailbox letter identifier",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }

      try {
        const community = await options.registrationAuth.getCurrentSession(token);
        const letter = mailboxService.openForAudience(
          community.home.homeId,
          "human",
          parsedRequest.data.letter_id,
        );
        return mailboxDetailSuccessSchema.parse({
          letter: {
            ...mailboxLetterSummaryResponse(letter),
            body: letter.body,
          },
        });
      } catch (error) {
        return sendMailboxFailure(request, reply, error);
      }
    });

    app.post("/api/mailbox/:letterId/claim", async (request, reply) => {
      const parsedRequest = mailboxDetailRequestSchema.safeParse({
        letter_id: (request.params as { letterId?: unknown }).letterId,
      });
      if (
        !humanSettingsReadRequestSchema.safeParse(request.query).success ||
        !mailboxClaimBodySchema.safeParse(request.body ?? {}).success ||
        !parsedRequest.success
      ) {
        return sendMailboxError(
          reply,
          400,
          "invalid_request",
          "Mailbox attachment claim accepts only a valid letter_id and an empty body",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendMailboxError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }

      try {
        const community = await options.registrationAuth.getCurrentSession(token);
        const letter = await mailboxService.claimFarmReward(
          community.home.homeId,
          "human",
          parsedRequest.data.letter_id,
        );
        return mailboxDetailSuccessSchema.parse({
          letter: {
            ...mailboxLetterSummaryResponse(letter),
            body: letter.body,
          },
        });
      } catch (error) {
        return sendMailboxFailure(request, reply, error);
      }
    });
  }

  const sharedMemeService = options.sharedMemeService;
  const sendHumanSharedMemeFailure = (
    request: FastifyRequest,
    reply: FastifyReply,
    error: unknown,
  ) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendSharedMemeError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendSharedMemeError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendSharedMemeError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendSharedMemeError(
        reply,
        409,
        "registration_profile_required",
        "A complete resident, home, and farm registration is required",
      );
    }
    if (error instanceof SharedMemeNotFoundError) {
      return sendSharedMemeError(
        reply,
        404,
        "shared_meme_not_found",
        "The requested shared meme does not exist",
      );
    }
    if (error instanceof SharedMemeDuplicateError) {
      return sendSharedMemeError(
        reply,
        409,
        error.kind === "term" ? "duplicate_shared_meme_term" : "duplicate_shared_meme_alias",
        error.kind === "term"
          ? "The normalized shared meme term already exists"
          : "A normalized shared meme alias already exists",
      );
    }
    if (error instanceof SharedMemeInvalidInputError) {
      return sendSharedMemeError(
        reply,
        400,
        "invalid_request",
        "The shared meme request does not match the supported contract",
      );
    }
    throw error;
  };

  const sendBackendSharedMemeFailure = (
    request: FastifyRequest,
    reply: FastifyReply,
    error: unknown,
  ) => {
    if (error instanceof SharedMemeBackendAuthenticationError) {
      return sendSharedMemeError(
        reply,
        401,
        "authentication_required",
        "An active Doorbell MCP credential is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      return sendSharedMemeError(
        reply,
        403,
        "qq_not_group_member",
        "The resident is no longer qualified for the community",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendSharedMemeError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof SharedMemeVersionAheadError) {
      return sendSharedMemeError(
        reply,
        409,
        "shared_meme_version_ahead",
        "The applied library version is newer than the current shared meme library",
      );
    }
    throw error;
  };

  if (sharedMemeService) {
    app.get("/api/shared-memes", async (request, reply) => {
      if (!sharedMemeReadRequestSchema.safeParse(request.query).success) {
        return sendSharedMemeError(
          reply,
          400,
          "invalid_request",
          "The shared meme list does not accept query parameters",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendSharedMemeError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      try {
        await options.registrationAuth.getCurrentSession(token);
        const library = sharedMemeService.list();
        reply.header("cache-control", "no-store");
        return sharedMemeListSuccessSchema.parse({
          library: library.metadata,
          memes: library.memes,
        });
      } catch (error) {
        return sendHumanSharedMemeFailure(request, reply, error);
      }
    });

    if (options.sharedMemeBackendService) {
      const sharedMemeBackendService = options.sharedMemeBackendService;
      app.get("/api/shared-memes/sync", async (request, reply) => {
        const query = sharedMemeBackendPullQuerySchema.safeParse(request.query);
        if (!query.success) {
          return sendSharedMemeError(
            reply,
            400,
            "invalid_request",
            "after_version must be one positive library version when provided",
          );
        }
        const credential = readMcpBackendCredential(request.headers.authorization);
        if (!credential) {
          return sendSharedMemeError(
            reply,
            401,
            "authentication_required",
            "An active Doorbell MCP credential is required",
          );
        }
        try {
          await sharedMemeBackendService.authorize(credential);
          reply.header("cache-control", "no-store");
          return sharedMemeBackendPullSuccessSchema.parse(
            sharedMemeService.pull(query.data.after_version),
          );
        } catch (error) {
          return sendBackendSharedMemeFailure(request, reply, error);
        }
      });
    }

    app.get("/api/shared-memes/:memeId", async (request, reply) => {
      const memeId = sharedMemeIdSchema.safeParse((request.params as { memeId?: unknown }).memeId);
      if (!sharedMemeReadRequestSchema.safeParse(request.query).success || !memeId.success) {
        return sendSharedMemeError(
          reply,
          400,
          "invalid_request",
          "A positive meme_id and no query parameters are required",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendSharedMemeError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      try {
        await options.registrationAuth.getCurrentSession(token);
        const detail = sharedMemeService.get(memeId.data);
        reply.header("cache-control", "no-store");
        return sharedMemeDetailSuccessSchema.parse({
          library_version: detail.libraryVersion,
          meme: detail.meme,
        });
      } catch (error) {
        return sendHumanSharedMemeFailure(request, reply, error);
      }
    });

    app.post("/api/shared-memes", async (request, reply) => {
      if (!sharedMemeReadRequestSchema.safeParse(request.query).success) {
        return sendSharedMemeError(
          reply,
          400,
          "invalid_request",
          "The shared meme add request does not accept query parameters",
        );
      }
      const input = sharedMemeAddRequestSchema.safeParse(request.body);
      if (!input.success) {
        return sendSharedMemeError(
          reply,
          400,
          "invalid_request",
          "The shared meme request does not match the supported contract",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendSharedMemeError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      try {
        const community = await options.registrationAuth.getCurrentSession(token);
        const created = sharedMemeService.add(input.data, community.account.accountId);
        options.bellService?.signalSharedMemeUpdateAvailable(created.metadata.library_version);
        reply.header("cache-control", "no-store");
        return sharedMemeAddSuccessSchema.parse({
          created: true,
          library: created.metadata,
          meme: created.meme,
        });
      } catch (error) {
        return sendHumanSharedMemeFailure(request, reply, error);
      }
    });
  }

  const sendHumanSettingsFailure = (
    request: FastifyRequest,
    reply: FastifyReply,
    error: unknown,
  ) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendHumanSettingsError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendHumanSettingsError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendHumanSettingsError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendHumanSettingsError(
        reply,
        409,
        "registration_profile_required",
        "A complete resident, home, and farm registration is required",
      );
    }
    if (error instanceof HumanProfileNotAvailableError) {
      return sendHumanSettingsError(
        reply,
        409,
        "profile_not_available",
        "The selected profile is not available to this account",
      );
    }
    throw error;
  };

  const sendLingyeDailyHumanFailure = (
    request: FastifyRequest,
    reply: FastifyReply,
    error: unknown,
  ) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendLingyeDailyError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendLingyeDailyError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendLingyeDailyError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendLingyeDailyError(
        reply,
        409,
        "registration_profile_required",
        "A complete resident, home, and farm registration is required",
      );
    }
    throw error;
  };

  const mcpRuntime = options.mcpRuntime;
  if (mcpRuntime) {
    const mcpRuntimeErrorHandler = (
      error: FastifyError,
      request: FastifyRequest,
      reply: FastifyReply,
    ): void => {
      reply.header("cache-control", "no-store");
      if (error.statusCode === 400) {
        void reply.code(400).send({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        });
        return;
      }
      request.log.error({ error_name: error.name }, "Doorbell MCP request failed");
      void reply.code(500).send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal error" },
      });
    };

    app.post("/mcp", { errorHandler: mcpRuntimeErrorHandler }, async (request, reply) => {
      const authorization = Array.isArray(request.headers.authorization)
        ? request.headers.authorization[0]
        : request.headers.authorization;
      const origin = Array.isArray(request.headers.origin)
        ? request.headers.origin[0]
        : request.headers.origin;
      const protocolVersionHeader = request.headers["mcp-protocol-version"];
      const protocolVersion = Array.isArray(protocolVersionHeader)
        ? protocolVersionHeader[0]
        : protocolVersionHeader;
      const result = await mcpRuntime.handlePost({
        ...(authorization ? { authorization } : {}),
        ...(origin ? { origin } : {}),
        protocolVersion: protocolVersion ?? null,
        body: request.body,
      });
      for (const [name, value] of Object.entries(result.headers)) {
        reply.header(name, value);
      }
      if (result.body === undefined) {
        return reply.code(result.statusCode).send();
      }
      return reply.code(result.statusCode).send(result.body);
    });
    app.route({
      method: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "PUT"],
      url: "/mcp",
      exposeHeadRoute: false,
      errorHandler: mcpRuntimeErrorHandler,
      handler: async (_request, reply) => {
        reply.header("allow", "POST");
        reply.header("cache-control", "no-store");
        return reply.code(405).send();
      },
    });
  }

  const mcpAccessService = options.mcpAccessService;
  if (mcpAccessService) {
    const sendMcpAccessFailure = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
      if (error instanceof AuthenticationRequiredError) {
        return sendMcpAccessError(reply, 401, "authentication_required");
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendMcpAccessError(reply, 403, "qq_not_group_member");
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendMcpAccessError(reply, 503, "membership_verification_unavailable");
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendMcpAccessError(reply, 409, "registration_profile_required");
      }
      if (error instanceof FarmMcpMigrationCredentialInvalidError) {
        return sendMcpAccessError(reply, 409, "farm_credential_invalid");
      }
      if (error instanceof FarmMcpMigrationBindingMismatchError) {
        return sendMcpAccessError(reply, 409, "farm_binding_mismatch");
      }
      if (error instanceof FarmMcpMigrationConflictError) {
        return sendMcpAccessError(reply, 409, "farm_migration_conflict");
      }
      if (error instanceof McpMigrationNotConfirmedError) {
        return sendMcpAccessError(reply, 409, "migration_not_confirmed");
      }
      if (error instanceof FarmMcpMigrationContractUnavailableError) {
        return sendMcpAccessError(reply, 502, "upstream_contract_unavailable");
      }
      if (error instanceof FarmMcpMigrationUnavailableError) {
        return sendMcpAccessError(reply, 503, "farm_unavailable");
      }
      if (error instanceof McpRuntimeUnavailableError) {
        return sendMcpAccessError(reply, 503, "mcp_runtime_unavailable");
      }
      if (error instanceof McpCredentialNotConfiguredError) {
        return sendMcpAccessError(reply, 404, "mcp_credential_not_configured");
      }
      if (error instanceof McpAccessInternalContractError) {
        return sendMcpAccessError(reply, 500, "internal_contract_error");
      }
      request.log.error(
        { error_name: error instanceof Error ? error.name : "UnknownError" },
        "MCP access control request failed",
      );
      return sendMcpAccessError(reply, 500, "internal_contract_error");
    };

    const mcpRouteErrorHandler = (
      error: FastifyError,
      request: FastifyRequest,
      reply: FastifyReply,
    ): void => {
      if (error.statusCode === 400) {
        void sendMcpAccessError(reply, 400, "invalid_request");
        return;
      }
      request.log.error({ error_name: error.name }, "MCP access route parsing failed");
      void sendMcpAccessError(reply, 500, "internal_contract_error");
    };

    app.get(
      "/api/mcp-access",
      { exposeHeadRoute: false, errorHandler: mcpRouteErrorHandler },
      async (request, reply) => {
        if (
          request.body !== undefined ||
          !mcpAccessReadRequestSchema.safeParse(request.query).success
        ) {
          return sendMcpAccessError(reply, 400, "invalid_request");
        }
        const token = readHumanSessionToken(request.headers.cookie);
        if (!token) {
          return sendMcpAccessError(reply, 401, "authentication_required");
        }
        try {
          const status = await mcpAccessService.getStatus(token);
          reply.header("cache-control", "no-store");
          return reply.code(200).send(mcpAccessStatusResponseSchema.parse(status));
        } catch (error) {
          return sendMcpAccessFailure(request, reply, error);
        }
      },
    );

    app.post(
      "/api/mcp-access/claim",
      { errorHandler: mcpRouteErrorHandler },
      async (request, reply) => {
        if (
          !mcpAccessReadRequestSchema.safeParse(request.query).success ||
          !mcpAccessMutationBodySchema.safeParse(request.body).success
        ) {
          return sendMcpAccessError(reply, 400, "invalid_request");
        }
        const token = readHumanSessionToken(request.headers.cookie);
        if (!token) {
          return sendMcpAccessError(reply, 401, "authentication_required");
        }
        try {
          const status = await mcpAccessService.claim(token);
          reply.header("cache-control", "no-store");
          return reply.code(200).send(mcpAccessStatusResponseSchema.parse(status));
        } catch (error) {
          return sendMcpAccessFailure(request, reply, error);
        }
      },
    );

    app.post(
      "/api/mcp-access/credential",
      { errorHandler: mcpRouteErrorHandler },
      async (request, reply) => {
        if (
          !mcpAccessReadRequestSchema.safeParse(request.query).success ||
          !mcpAccessMutationBodySchema.safeParse(request.body).success
        ) {
          return sendMcpAccessError(reply, 400, "invalid_request");
        }
        const token = readHumanSessionToken(request.headers.cookie);
        if (!token) {
          return sendMcpAccessError(reply, 401, "authentication_required");
        }
        try {
          const credential = await mcpAccessService.issueCredential(token);
          reply.header("cache-control", "no-store");
          return reply.code(200).send(mcpCredentialIssueResponseSchema.parse(credential));
        } catch (error) {
          return sendMcpAccessFailure(request, reply, error);
        }
      },
    );

    app.delete(
      "/api/mcp-access/credential",
      { errorHandler: mcpRouteErrorHandler },
      async (request, reply) => {
        if (
          !mcpAccessReadRequestSchema.safeParse(request.query).success ||
          !mcpAccessMutationBodySchema.safeParse(request.body).success
        ) {
          return sendMcpAccessError(reply, 400, "invalid_request");
        }
        const token = readHumanSessionToken(request.headers.cookie);
        if (!token) {
          return sendMcpAccessError(reply, 401, "authentication_required");
        }
        try {
          const status = await mcpAccessService.revokeCredential(token);
          reply.header("cache-control", "no-store");
          return reply.code(200).send(mcpAccessStatusResponseSchema.parse(status));
        } catch (error) {
          return sendMcpAccessFailure(request, reply, error);
        }
      },
    );

    app.route({
      method: ["DELETE", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
      url: "/api/mcp-access",
      errorHandler: mcpRouteErrorHandler,
      handler: async (_request, reply) => {
        reply.header("allow", "GET");
        return sendMcpAccessError(reply, 405, "method_not_allowed");
      },
    });
    app.route({
      method: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "PUT"],
      url: "/api/mcp-access/claim",
      exposeHeadRoute: false,
      errorHandler: mcpRouteErrorHandler,
      handler: async (_request, reply) => {
        reply.header("allow", "POST");
        return sendMcpAccessError(reply, 405, "method_not_allowed");
      },
    });
    app.route({
      method: ["GET", "HEAD", "OPTIONS", "PATCH", "PUT"],
      url: "/api/mcp-access/credential",
      exposeHeadRoute: false,
      errorHandler: mcpRouteErrorHandler,
      handler: async (_request, reply) => {
        reply.header("allow", "POST, DELETE");
        return sendMcpAccessError(reply, 405, "method_not_allowed");
      },
    });
  }

  const lingyeDailyService = options.lingyeDailyService;
  if (lingyeDailyService) {
    app.post("/api/internal/lingye-daily/issues", async (request, reply) => {
      if (!lingyeDailyReadRequestSchema.safeParse(request.query).success) {
        return sendLingyeDailyError(
          reply,
          400,
          "invalid_request",
          "The Lingye Daily publish request does not accept query parameters",
        );
      }
      const parsedRequest = lingyeDailyPublishRequestSchema.safeParse(request.body);
      if (!parsedRequest.success) {
        return sendLingyeDailyError(
          reply,
          400,
          "invalid_request",
          "The Lingye Daily issue does not match the supported publish contract",
        );
      }
      try {
        const published = lingyeDailyService.publish(
          request.headers.authorization,
          parsedRequest.data,
        );
        reply.header("cache-control", "no-store");
        return lingyeDailyPublishSuccessSchema.parse({
          published: true,
          status: published.status,
          issue_date: published.issue.issueDate,
          issue_number: published.issue.issueNumber,
          revision: published.issue.revision,
          published_at: new Date(published.issue.publishedAt).toISOString(),
        });
      } catch (error) {
        if (error instanceof LingyeDailyPublishAuthenticationError) {
          return sendLingyeDailyError(
            reply,
            401,
            "authentication_required",
            "A valid Lingye Daily publish credential is required",
          );
        }
        if (error instanceof LingyeDailyIdempotencyConflictError) {
          return sendLingyeDailyError(
            reply,
            409,
            "idempotency_conflict",
            "The issue date or revision conflicts with the stored Lingye Daily issue",
          );
        }
        throw error;
      }
    });

    app.get("/api/lingye-daily/latest", async (request, reply) => {
      if (!lingyeDailyReadRequestSchema.safeParse(request.query).success) {
        return sendLingyeDailyError(
          reply,
          400,
          "invalid_request",
          "The Lingye Daily read request does not accept query parameters",
        );
      }
      const token = readHumanSessionToken(request.headers.cookie);
      if (!token) {
        return sendLingyeDailyError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      try {
        await options.registrationAuth.getCurrentSession(token);
        const issue = lingyeDailyService.getLatest();
        reply.header("cache-control", "no-store");
        return lingyeDailyLatestSuccessSchema.parse({
          issue: issue ? lingyeDailyIssueResponse(issue) : null,
        });
      } catch (error) {
        return sendLingyeDailyHumanFailure(request, reply, error);
      }
    });
  }

  app.post("/api/settings/active-profile", async (request, reply) => {
    if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
      return sendHumanSettingsError(
        reply,
        400,
        "invalid_request",
        "The profile switch does not accept query parameters",
      );
    }
    const parsedRequest = humanProfileSwitchRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return sendHumanSettingsError(
        reply,
        400,
        "invalid_request",
        "The profile switch requires one profile_id from the current account list",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendHumanSettingsError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const context = await options.registrationAuth.switchCurrentProfile(
        token,
        parsedRequest.data.profile_id,
      );
      return currentHumanSessionSuccessSchema.parse({
        authenticated: true,
        ...communityResponse(context.community),
        ...profileSelectionResponse(context),
      });
    } catch (error) {
      return sendHumanSettingsFailure(request, reply, error);
    }
  });

  app.get("/api/settings", async (request, reply) => {
    if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
      return sendHumanSettingsError(
        reply,
        400,
        "invalid_request",
        "The settings read does not accept query parameters",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendHumanSettingsError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const context = await options.registrationAuth.getCurrentHumanSettings(token);
      return humanSettingsResponse(
        {
          ...context,
          settings: options.weatherEngine?.ensureCurrent(context.settings) ?? context.settings,
        },
        options.bellService,
        options.browserPushService,
      );
    } catch (error) {
      return sendHumanSettingsFailure(request, reply, error);
    }
  });

  app.patch("/api/settings", async (request, reply) => {
    if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
      return sendHumanSettingsError(
        reply,
        400,
        "invalid_request",
        "The settings update does not accept query parameters",
      );
    }
    const parsedRequest = humanSettingsPatchRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return sendHumanSettingsError(
        reply,
        400,
        "invalid_request",
        "The settings update does not match the supported settings contract",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendHumanSettingsError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const context = await options.registrationAuth.updateCurrentHumanSettings(
        token,
        humanSettingsPatch(parsedRequest.data),
      );
      try {
        options.bellService?.refreshHome(context.settings.homeId);
      } catch (error) {
        request.log.error(
          { error_name: error instanceof Error ? error.name : "UnknownError" },
          "Legacy Bell mailbox wake cancellation failed after settings were saved",
        );
      }
      try {
        if (
          !context.settings.browserNotificationsEnabled ||
          !context.settings.activityRemindersEnabled
        ) {
          options.activityReminderService?.cancelResident(context.settings.residentId);
        } else {
          options.activityReminderService?.refreshEligibility(context.settings.residentId);
        }
      } catch (error) {
        request.log.error(
          { error_name: error instanceof Error ? error.name : "UnknownError" },
          "Activity reminder eligibility refresh failed after settings were saved",
        );
      }
      return humanSettingsResponse(
        {
          ...context,
          settings: options.weatherEngine?.ensureCurrent(context.settings) ?? context.settings,
        },
        options.bellService,
        options.browserPushService,
      );
    } catch (error) {
      return sendHumanSettingsFailure(request, reply, error);
    }
  });

  app.post("/api/browser-notifications/subscription", async (request, reply) => {
    if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
      return sendBrowserPushError(
        reply,
        400,
        "invalid_request",
        "The browser notification subscription does not accept query parameters",
      );
    }
    const parsed = browserPushSubscriptionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendBrowserPushError(
        reply,
        400,
        "invalid_request",
        "The browser notification subscription does not match the supported contract",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBrowserPushError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (!options.browserPushService) {
      return sendBrowserPushError(
        reply,
        503,
        "browser_notifications_unavailable",
        "Browser notifications are not configured",
      );
    }
    try {
      const community = await options.registrationAuth.getCurrentSession(token);
      options.browserPushService.subscribe({
        residentId: community.resident.residentId,
        homeId: community.home.homeId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      });
      try {
        options.activityReminderService?.refreshEligibility(community.resident.residentId);
      } catch (error) {
        request.log.error(
          { error_name: error instanceof Error ? error.name : "UnknownError" },
          "Activity reminder eligibility refresh failed after browser subscription",
        );
      }
      reply.header("cache-control", "no-store");
      return browserPushSubscriptionSuccessSchema.parse({ subscribed: true });
    } catch (error) {
      return sendHumanSettingsFailure(request, reply, error);
    }
  });

  app.delete("/api/browser-notifications/subscription", async (request, reply) => {
    if (!humanSettingsReadRequestSchema.safeParse(request.query).success) {
      return sendBrowserPushError(
        reply,
        400,
        "invalid_request",
        "The browser notification subscription removal does not accept query parameters",
      );
    }
    const parsed = browserPushSubscriptionDeleteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendBrowserPushError(
        reply,
        400,
        "invalid_request",
        "The browser notification subscription removal does not match the supported contract",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBrowserPushError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const community = await options.registrationAuth.getCurrentSession(token);
      const unsubscribeEndpoint =
        options.browserPushService?.unsubscribe(
          community.resident.residentId,
          parsed.data.endpoint,
        ) ?? true;
      try {
        options.activityReminderService?.refreshEligibility(community.resident.residentId);
      } catch (error) {
        request.log.error(
          { error_name: error instanceof Error ? error.name : "UnknownError" },
          "Activity reminder eligibility refresh failed after browser unsubscription",
        );
      }
      reply.header("cache-control", "no-store");
      return browserPushSubscriptionDeleteSuccessSchema.parse({
        subscribed: false,
        unsubscribe_endpoint: unsubscribeEndpoint,
      });
    } catch (error) {
      return sendHumanSettingsFailure(request, reply, error);
    }
  });

  app.get("/api/farm/constable-interview", async (request, reply) => {
    const parsedQuery = boundConstableInterviewReadRequestSchema.safeParse(request.query);
    if (!parsedQuery.success || requestHasBody(request)) {
      return sendBoundConstableInterviewError(
        reply,
        400,
        "invalid_request",
        "The constable interview read request is invalid",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundConstableInterviewError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const result = await options.registrationAuth.getCurrentConstableInterview(
        token,
        parsedQuery.data.interview_id,
      );
      reply.header("cache-control", "no-store");
      return boundConstableInterviewResponse(result);
    } catch (error) {
      return sendBoundConstableInterviewFailure(request, reply, error, options.secureCookies);
    }
  });

  app.post("/api/farm/constable-interview/signup", async (request, reply) => {
    const parsedBody = boundConstableInterviewActionRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendBoundConstableInterviewError(
        reply,
        400,
        "invalid_request",
        "The constable interview signup request is invalid",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundConstableInterviewError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const result = await options.registrationAuth.signupCurrentConstableInterview(
        token,
        parsedBody.data.interview_id,
      );
      reply.header("cache-control", "no-store");
      return boundConstableInterviewResponse(result);
    } catch (error) {
      return sendBoundConstableInterviewFailure(request, reply, error, options.secureCookies);
    }
  });

  app.post("/api/farm/constable-interview/attendance", async (request, reply) => {
    const parsedBody = boundConstableInterviewActionRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendBoundConstableInterviewError(
        reply,
        400,
        "invalid_request",
        "The constable interview attendance request is invalid",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundConstableInterviewError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const result = await options.registrationAuth.confirmCurrentConstableInterviewAttendance(
        token,
        parsedBody.data.interview_id,
      );
      reply.header("cache-control", "no-store");
      return boundConstableInterviewResponse(result);
    } catch (error) {
      return sendBoundConstableInterviewFailure(request, reply, error, options.secureCookies);
    }
  });

  app.post("/api/farm/constable-interview/score", async (request, reply) => {
    const parsedBody = boundConstableInterviewScoreRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendBoundConstableInterviewError(
        reply,
        400,
        "invalid_request",
        "The constable interview score request is invalid",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundConstableInterviewError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const result = await options.registrationAuth.scoreCurrentConstableInterview(token, {
        interviewId: parsedBody.data.interview_id,
        facts: parsedBody.data.facts,
        restraint: parsedBody.data.restraint,
        procedure: parsedBody.data.procedure,
        explanation: parsedBody.data.explanation,
      });
      reply.header("cache-control", "no-store");
      return boundConstableInterviewResponse(result);
    } catch (error) {
      return sendBoundConstableInterviewFailure(request, reply, error, options.secureCookies);
    }
  });

  app.get("/api/farm/field", async (request, reply) => {
    if (!boundFarmFieldRequestSchema.safeParse(request.query).success) {
      return sendBoundFarmFieldError(
        reply,
        400,
        "invalid_request",
        "The bound farm field does not accept query parameters",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmFieldError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const field = await options.registrationAuth.getCurrentFarmField(token);
      reply.header("cache-control", "no-store");
      return boundFarmFieldSuccessSchema.parse(field);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmFieldError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmFieldError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmFieldError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmFieldError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanFieldCredentialInvalidError) {
        return sendBoundFarmFieldError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanFieldNotFoundError) {
        return sendBoundFarmFieldError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanFieldContractUnavailableError) {
        reportFarmHumanFieldUnavailable(request, error);
        return sendBoundFarmFieldError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm field response could not be verified",
        );
      }
      if (error instanceof FarmHumanFieldUnavailableError) {
        reportFarmHumanFieldUnavailable(request, error);
        return sendBoundFarmFieldError(
          reply,
          503,
          "farm_unavailable",
          "The farm field is unavailable",
        );
      }
      throw error;
    }
  });

  app.get("/api/farm/catalog", { exposeHeadRoute: false }, async (request, reply) => {
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      requestHasBody(request)
    ) {
      return sendBoundFarmCatalogReadError(
        reply,
        400,
        "invalid_request",
        "The bound farm catalog does not accept query parameters or a request body",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmCatalogReadError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const catalog = await options.registrationAuth.getCurrentFarmCatalog(token);
      reply.header("cache-control", "no-store");
      return boundFarmCatalogReadSuccessSchema.parse(catalog);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmCatalogReadError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmCatalogReadError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmCatalogReadError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmCatalogReadError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanCatalogCredentialInvalidError) {
        return sendBoundFarmCatalogReadError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanCatalogNotFoundError) {
        return sendBoundFarmCatalogReadError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanCatalogContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm catalog read is unavailable");
        return sendBoundFarmCatalogReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm catalog response could not be verified",
        );
      }
      if (error instanceof FarmHumanCatalogUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm catalog read is unavailable");
        return sendBoundFarmCatalogReadError(
          reply,
          503,
          "farm_unavailable",
          "The farm catalog is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/purchase-requests", async (request, reply) => {
    const parsedBody = boundFarmPurchaseRequestCreateSchema.safeParse(request.body);
    const idempotencyHeader = request.headers["idempotency-key"];
    const parsedIdempotencyKey = farmPurchaseRequestIdempotencyKeySchema.safeParse(
      typeof idempotencyHeader === "string" ? idempotencyHeader : undefined,
    );
    if (!parsedBody.success || !parsedIdempotencyKey.success) {
      return sendBoundFarmPurchaseRequestError(
        reply,
        400,
        "invalid_request",
        "A valid cart and Idempotency-Key are required",
      );
    }
    if (!options.farmPurchaseRequestService) {
      return sendBoundFarmPurchaseRequestError(
        reply,
        503,
        "farm_unavailable",
        "Farm purchase requests are unavailable",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmPurchaseRequestError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const community = await options.registrationAuth.getCurrentSession(token);
      const replay = options.farmPurchaseRequestService.replay({
        residentId: community.resident.residentId,
        shop: parsedBody.data.shop,
        shopRevision: parsedBody.data.shop_revision,
        idempotencyKey: parsedIdempotencyKey.data,
        items: parsedBody.data.items.map((item) => ({
          itemId: item.item_id,
          kind: item.kind,
          qty: item.qty,
        })),
      });
      if (replay) {
        return sendBoundFarmPurchaseRequestSuccess(reply, replay);
      }
      const catalog = await options.registrationAuth.getCurrentFarmCatalog(token);
      const settings = catalog.data.settings;
      if (
        settings.status !== "available" ||
        typeof settings.human_name !== "string" ||
        settings.human_name.trim().length === 0
      ) {
        return sendBoundFarmPurchaseRequestError(
          reply,
          409,
          "operation_not_allowed",
          "Set the farm human name before creating a purchase request",
        );
      }

      let currentRevision: string;
      let requestItems: Array<{
        itemId: string;
        kind: string;
        qty: number;
        displayName: string;
      }>;
      if (parsedBody.data.shop === "field") {
        const shop = catalog.data.shop;
        if (shop.status !== "available") {
          return sendBoundFarmPurchaseRequestError(
            reply,
            503,
            "farm_unavailable",
            "The farm shop is unavailable",
          );
        }
        currentRevision = shop.revision;
        if (currentRevision !== parsedBody.data.shop_revision) {
          return sendBoundFarmPurchaseRequestError(
            reply,
            409,
            "shop_changed",
            "The farm shop has changed",
            currentRevision,
          );
        }
        requestItems = parsedBody.data.items.map((requested) => {
          const item = shop.items.find(
            (candidate) =>
              candidate.kind === requested.kind && candidate.item_id === requested.item_id,
          );
          const supported =
            (requested.kind === "potion" && requested.item_id === "speed_potion") ||
            (requested.kind === "seed" && item?.source === "persisted") ||
            (requested.kind === "recipe" && item?.source === "persisted") ||
            (requested.kind === "potion_set" && item?.source === "persisted");
          if (
            !item ||
            !supported ||
            item.identity_state !== "known" ||
            item.name === null ||
            item.available_quantity === null ||
            item.available_quantity < requested.qty ||
            item.condition === "already_owned"
          ) {
            throw new FarmPurchaseRequestInputError("The requested field item is unavailable");
          }
          return {
            itemId: requested.item_id,
            kind: requested.kind,
            qty: requested.qty,
            displayName: item.name,
          };
        });
      } else {
        const ranch = await options.registrationAuth.getCurrentFarmRanch(token);
        currentRevision = ranch.revision;
        if (currentRevision !== parsedBody.data.shop_revision) {
          return sendBoundFarmPurchaseRequestError(
            reply,
            409,
            "shop_changed",
            "The ranch shop has changed",
            currentRevision,
          );
        }
        requestItems = parsedBody.data.items.map((requested) => {
          const section =
            requested.kind === "animal"
              ? ranch.data.shop.animals
              : requested.kind === "pet"
                ? ranch.data.shop.pets
                : requested.kind === "item"
                  ? ranch.data.shop.skins
                  : null;
          const item = section?.items.find((candidate) =>
            "skin_id" in candidate
              ? candidate.skin_id === requested.item_id
              : candidate.kind_id === requested.item_id,
          );
          if (
            section?.status !== "available" ||
            !item ||
            item.status !== "known" ||
            item.name === null ||
            item.owned !== false ||
            item.available_quantity === null ||
            item.available_quantity < requested.qty
          ) {
            throw new FarmPurchaseRequestInputError("The requested ranch item is unavailable");
          }
          return {
            itemId: requested.item_id,
            kind: requested.kind,
            qty: requested.qty,
            displayName: item.name,
          };
        });
      }

      const created = options.farmPurchaseRequestService.create({
        residentId: community.resident.residentId,
        homeId: community.home.homeId,
        humanName: settings.human_name,
        shop: parsedBody.data.shop,
        shopRevision: currentRevision,
        idempotencyKey: parsedIdempotencyKey.data,
        items: requestItems,
      });
      return sendBoundFarmPurchaseRequestSuccess(reply, created);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmPurchaseRequestError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmPurchaseRequestError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmPurchaseRequestError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmPurchaseRequestError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmPurchaseRequestIdempotencyConflictError) {
        return sendBoundFarmPurchaseRequestError(
          reply,
          409,
          "idempotency_conflict",
          "This Idempotency-Key was used for another cart",
        );
      }
      if (error instanceof FarmPurchaseRequestInputError) {
        return sendBoundFarmPurchaseRequestError(
          reply,
          409,
          "operation_not_allowed",
          error.message,
        );
      }
      if (
        error instanceof FarmHumanCatalogCredentialInvalidError ||
        error instanceof FarmHumanRanchCredentialInvalidError
      ) {
        return sendBoundFarmPurchaseRequestError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (
        error instanceof FarmHumanCatalogNotFoundError ||
        error instanceof FarmHumanRanchNotFoundError
      ) {
        return sendBoundFarmPurchaseRequestError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (
        error instanceof FarmHumanCatalogContractUnavailableError ||
        error instanceof FarmHumanRanchContractUnavailableError
      ) {
        return sendBoundFarmPurchaseRequestError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm shop response could not be verified",
        );
      }
      if (
        error instanceof FarmHumanCatalogUnavailableError ||
        error instanceof FarmHumanRanchUnavailableError
      ) {
        return sendBoundFarmPurchaseRequestError(
          reply,
          503,
          "farm_unavailable",
          "The farm shop is unavailable",
        );
      }
      throw error;
    }
  });

  app.get("/api/farm/bulletin", { exposeHeadRoute: false }, async (request, reply) => {
    if (
      !boundFarmBulletinReadRequestSchema.safeParse(request.query).success ||
      requestHasBody(request)
    ) {
      return sendBoundFarmBulletinReadError(
        reply,
        400,
        "invalid_request",
        "The bound farm bulletin does not accept query parameters or a request body",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmBulletinReadError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const bulletin = await options.registrationAuth.getCurrentFarmBulletin(token);
      reply.header("cache-control", "no-store");
      return boundFarmBulletinReadSuccessSchema.parse(bulletin);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmBulletinReadError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmBulletinReadError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmBulletinReadError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmBulletinReadError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanBulletinCredentialInvalidError) {
        return sendBoundFarmBulletinReadError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanBulletinNotFoundError) {
        return sendBoundFarmBulletinReadError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanBulletinContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm bulletin read is unavailable");
        return sendBoundFarmBulletinReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm bulletin response could not be verified",
        );
      }
      if (error instanceof FarmHumanBulletinUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm bulletin read is unavailable");
        return sendBoundFarmBulletinReadError(
          reply,
          503,
          "farm_unavailable",
          "The farm bulletin is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/bulletin/ack", async (request, reply) => {
    const parsedBody = boundFarmBulletinAckRequestSchema.safeParse(request.body);
    const idempotencyKey = request.headers["idempotency-key"];
    if (
      !parsedBody.success ||
      typeof idempotencyKey !== "string" ||
      !farmBulletinAckIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmBulletinAckError(
        reply,
        400,
        "invalid_request",
        "Bulletin acknowledgement requires a revision and UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmBulletinAckError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.acknowledgeCurrentFarmBulletin(token, {
        expectedRevision: parsedBody.data.expected_revision,
        idempotencyKey,
      });
      reply.header("cache-control", "no-store");
      return boundFarmBulletinAckSuccessSchema.parse(result);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmBulletinAckError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmBulletinAckError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmBulletinAckError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmBulletinAckError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanBulletinStateConflictError) {
        return sendBoundFarmBulletinAckError(
          reply,
          409,
          "state_conflict",
          "The farm bulletin has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanBulletinIdempotencyConflictError) {
        return sendBoundFarmBulletinAckError(
          reply,
          409,
          "idempotency_conflict",
          "This Idempotency-Key was used for another bulletin acknowledgement",
        );
      }
      if (error instanceof FarmHumanBulletinCredentialInvalidError) {
        return sendBoundFarmBulletinAckError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanBulletinNotFoundError) {
        return sendBoundFarmBulletinAckError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanBulletinContractUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm bulletin acknowledgement is unavailable",
        );
        return sendBoundFarmBulletinAckError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm bulletin acknowledgement could not be verified",
        );
      }
      if (error instanceof FarmHumanBulletinUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm bulletin acknowledgement is unavailable",
        );
        return sendBoundFarmBulletinAckError(
          reply,
          503,
          "farm_unavailable",
          "The farm bulletin acknowledgement is unavailable",
        );
      }
      throw error;
    }
  });

  app.get("/api/farm/kitchen", { exposeHeadRoute: false }, async (request, reply) => {
    if (
      !boundFarmKitchenReadRequestSchema.safeParse(request.query).success ||
      requestHasBody(request)
    ) {
      return sendBoundFarmKitchenReadError(
        reply,
        400,
        "invalid_request",
        "The bound farm kitchen does not accept query parameters or a request body",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmKitchenReadError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const kitchen = await options.registrationAuth.getCurrentFarmKitchen(token);
      reply.header("cache-control", "no-store");
      return boundFarmKitchenReadSuccessSchema.parse(kitchen);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmKitchenReadError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmKitchenReadError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmKitchenReadError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmKitchenReadError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanKitchenCredentialInvalidError) {
        return sendBoundFarmKitchenReadError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanKitchenNotFoundError) {
        return sendBoundFarmKitchenReadError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanKitchenContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen read is unavailable");
        return sendBoundFarmKitchenReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm kitchen response could not be verified",
        );
      }
      if (error instanceof FarmHumanKitchenUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen read is unavailable");
        return sendBoundFarmKitchenReadError(
          reply,
          503,
          "farm_unavailable",
          "The farm kitchen is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/kitchen/purchases", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmKitchenPurchaseRequestSchema.safeParse(request.body);
    if (
      !boundFarmKitchenReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmKitchenPurchaseError(
        reply,
        400,
        "invalid_request",
        "Submit one kitchen cart without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmKitchenPurchaseIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmKitchenPurchaseError(
        reply,
        400,
        "invalid_request",
        "Kitchen purchase requires a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmKitchenPurchaseError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.purchaseCurrentFarmKitchen(token, {
        expectedShopRevision: body.expected_shop_revision,
        idempotencyKey,
        items: body.items.map((item) => ({
          kind: item.kind,
          itemId: item.item_id,
          quantity: item.quantity,
        })),
      });
      const parsedResult = boundFarmKitchenPurchaseSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmKitchenPurchaseError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm kitchen purchase response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmKitchenPurchaseError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmKitchenPurchaseError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmKitchenPurchaseError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmKitchenPurchaseError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanKitchenPurchaseShopChangedError) {
        return sendBoundFarmKitchenPurchaseError(
          reply,
          409,
          "shop_changed",
          "The kitchen shop has changed",
          error.currentShopRevision,
        );
      }
      if (error instanceof FarmHumanKitchenPurchaseStateConflictError) {
        return sendBoundFarmKitchenPurchaseError(
          reply,
          409,
          "state_conflict",
          "The kitchen shop or balance has changed",
          error.currentShopRevision,
        );
      }
      if (error instanceof FarmHumanKitchenPurchaseShopUnavailableError) {
        return sendBoundFarmKitchenPurchaseError(
          reply,
          409,
          "shop_unavailable",
          "The current kitchen shop is unavailable",
        );
      }
      if (error instanceof FarmHumanKitchenPurchaseRejectedError) {
        return sendBoundFarmKitchenPurchaseError(reply, 409, "purchase_rejected", error.message);
      }
      if (error instanceof FarmHumanKitchenPurchaseIdempotencyConflictError) {
        return sendBoundFarmKitchenPurchaseError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanKitchenPurchaseCredentialInvalidError) {
        return sendBoundFarmKitchenPurchaseError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanKitchenPurchaseNotFoundError) {
        return sendBoundFarmKitchenPurchaseError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanKitchenPurchaseContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen purchase is unavailable");
        return sendBoundFarmKitchenPurchaseError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm kitchen purchase response could not be verified",
        );
      }
      if (error instanceof FarmHumanKitchenPurchaseUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen purchase is unavailable");
        return sendBoundFarmKitchenPurchaseError(
          reply,
          503,
          "farm_unavailable",
          "The farm kitchen is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/kitchen/cooks", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmKitchenCookRequestSchema.safeParse(request.body);
    if (
      !boundFarmKitchenReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmKitchenCookError(
        reply,
        400,
        "invalid_request",
        "Submit one kitchen cook without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmKitchenCookIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmKitchenCookError(
        reply,
        400,
        "invalid_request",
        "Kitchen cook requires a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmKitchenCookError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.cookCurrentFarmKitchen(token, {
        expectedKitchenInventoryRevision: body.expected_kitchen_inventory_revision,
        idempotencyKey,
        ...("recipe_id" in body ? { recipeId: body.recipe_id } : { items: body.items }),
      });
      const parsedResult = boundFarmKitchenCookSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmKitchenCookError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm kitchen cook response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmKitchenCookError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmKitchenCookError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmKitchenCookError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmKitchenCookError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanKitchenCookStateConflictError) {
        return sendBoundFarmKitchenCookError(
          reply,
          409,
          "state_conflict",
          "The kitchen inventory has changed",
          error.currentKitchenInventoryRevision,
        );
      }
      if (error instanceof FarmHumanKitchenCookRejectedError) {
        return sendBoundFarmKitchenCookError(reply, 409, "cook_rejected", error.message);
      }
      if (error instanceof FarmHumanKitchenCookIdempotencyConflictError) {
        return sendBoundFarmKitchenCookError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanKitchenCookCredentialInvalidError) {
        return sendBoundFarmKitchenCookError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanKitchenCookNotFoundError) {
        return sendBoundFarmKitchenCookError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanKitchenCookContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen cook is unavailable");
        return sendBoundFarmKitchenCookError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm kitchen cook response could not be verified",
        );
      }
      if (error instanceof FarmHumanKitchenCookUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen cook is unavailable");
        return sendBoundFarmKitchenCookError(
          reply,
          503,
          "farm_unavailable",
          "The farm kitchen is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/kitchen/inventory/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmKitchenInventoryActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmKitchenReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmKitchenInventoryActionError(
        reply,
        400,
        "invalid_request",
        "Submit one kitchen inventory action without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmKitchenInventoryActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmKitchenInventoryActionError(
        reply,
        400,
        "invalid_request",
        "Kitchen inventory action requires a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmKitchenInventoryActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const actionInput = (() => {
        switch (body.action) {
          case "use":
            return {
              action: body.action,
              dishInstanceId: body.dish_instance_id,
              target: body.target,
              expectedInventoryRevision: body.expected_kitchen_inventory_revision,
              idempotencyKey,
            };
          case "recycle":
            return {
              action: body.action,
              itemKind: body.item_kind,
              itemInstanceIds: body.item_instance_ids,
              quantity: body.quantity,
              expectedInventoryRevision: body.expected_kitchen_inventory_revision,
              idempotencyKey,
            };
          case "stall":
            return {
              action: body.action,
              itemInstanceIds: body.item_instance_ids,
              quantity: body.quantity,
              price: body.price,
              expectedInventoryRevision: body.expected_kitchen_inventory_revision,
              idempotencyKey,
            };
          case "sell_fish":
            return {
              action: body.action,
              catchInstanceIds: body.catch_instance_ids,
              quantity: body.quantity,
              expectedInventoryRevision: body.expected_kitchen_inventory_revision,
              idempotencyKey,
            };
          case "sell_treasure":
            return {
              action: body.action,
              treasureItemId: body.treasure_item_id,
              quantity: body.quantity,
              expectedInventoryRevision: body.expected_kitchen_inventory_revision,
              idempotencyKey,
            };
        }
      })();
      const result = await options.registrationAuth.executeCurrentFarmKitchenInventoryAction(
        token,
        actionInput,
      );
      const parsedResult = boundFarmKitchenInventoryActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm kitchen inventory action response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanKitchenInventoryActionStateConflictError) {
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          409,
          "state_conflict",
          "The kitchen inventory has changed",
          error.currentInventoryRevision,
        );
      }
      if (error instanceof FarmHumanKitchenInventoryActionRejectedError) {
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          409,
          "action_rejected",
          error.message,
        );
      }
      if (error instanceof FarmHumanKitchenInventoryActionIdempotencyConflictError) {
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanKitchenInventoryActionCredentialInvalidError) {
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanKitchenInventoryActionNotFoundError) {
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanKitchenInventoryActionContractUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm kitchen inventory action is unavailable",
        );
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm kitchen inventory action response could not be verified",
        );
      }
      if (error instanceof FarmHumanKitchenInventoryActionUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm kitchen inventory action is unavailable",
        );
        return sendBoundFarmKitchenInventoryActionError(
          reply,
          503,
          "farm_unavailable",
          "The farm kitchen inventory action is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/kitchen/shop/refreshes", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmKitchenShopRefreshRequestSchema.safeParse(request.body);
    if (
      !boundFarmKitchenReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmKitchenShopRefreshError(
        reply,
        400,
        "invalid_request",
        "Refresh the current kitchen ingredient shelf without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmKitchenShopRefreshIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmKitchenShopRefreshError(
        reply,
        400,
        "invalid_request",
        "Kitchen shop refresh requires a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmKitchenShopRefreshError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.refreshCurrentFarmKitchenShop(token, {
        expectedShopRevision: parsedBody.data.expected_shop_revision,
        idempotencyKey,
      });
      const parsedResult = boundFarmKitchenShopRefreshSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The kitchen shop refresh response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanKitchenShopRefreshStateConflictError) {
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          409,
          "state_conflict",
          "The kitchen shop or farm balance has changed",
          error.currentShopRevision,
        );
      }
      if (error instanceof FarmHumanKitchenShopRefreshShopUnavailableError) {
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          409,
          "shop_unavailable",
          "The current kitchen shop is unavailable",
        );
      }
      if (error instanceof FarmHumanKitchenShopRefreshRejectedError) {
        return sendBoundFarmKitchenShopRefreshError(reply, 409, error.code, error.message);
      }
      if (error instanceof FarmHumanKitchenShopRefreshIdempotencyConflictError) {
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanKitchenShopRefreshCredentialInvalidError) {
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanKitchenShopRefreshNotFoundError) {
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanKitchenShopRefreshContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen shop refresh is unavailable");
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The kitchen shop refresh response could not be verified",
        );
      }
      if (error instanceof FarmHumanKitchenShopRefreshUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm kitchen shop refresh is unavailable");
        return sendBoundFarmKitchenShopRefreshError(
          reply,
          503,
          "farm_unavailable",
          "The farm kitchen shop is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/codex/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmCropCodexActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmCropCodexActionError(
        reply,
        400,
        "invalid_request",
        "Submit one crop codex action without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmCropCodexActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmCropCodexActionError(
        reply,
        400,
        "invalid_request",
        "Crop codex actions require a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmCropCodexActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.executeCurrentFarmCropCodexAction(token, {
        cropId: body.crop_id,
        action: body.action,
        expectedCodexRevision: body.expected_codex_revision,
        idempotencyKey,
      });
      const parsedResult = boundFarmCropCodexActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmCropCodexActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The crop codex action response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmCropCodexActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmCropCodexActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmCropCodexActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmCropCodexActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanCropCodexActionStateConflictError) {
        return sendBoundFarmCropCodexActionError(
          reply,
          409,
          "state_conflict",
          "The crop codex has changed",
          error.currentCodexRevision,
        );
      }
      if (error instanceof FarmHumanCropCodexActionRejectedError) {
        return sendBoundFarmCropCodexActionError(reply, 409, "action_rejected", error.message);
      }
      if (error instanceof FarmHumanCropCodexActionIdempotencyConflictError) {
        return sendBoundFarmCropCodexActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanCropCodexActionCredentialInvalidError) {
        return sendBoundFarmCropCodexActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanCropCodexActionNotFoundError) {
        return sendBoundFarmCropCodexActionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanCropCodexActionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm crop codex action is unavailable");
        return sendBoundFarmCropCodexActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The crop codex action response could not be verified",
        );
      }
      if (error instanceof FarmHumanCropCodexActionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm crop codex action is unavailable");
        return sendBoundFarmCropCodexActionError(
          reply,
          503,
          "farm_unavailable",
          "The farm crop codex is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/smelting/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmSmeltingActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmSmeltingActionError(
        reply,
        400,
        "invalid_request",
        "Submit exactly three material ids without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmSmeltingActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmSmeltingActionError(
        reply,
        400,
        "invalid_request",
        "Smelting actions require a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmSmeltingActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.executeCurrentFarmSmeltingAction(token, {
        materialIds: body.material_ids,
        expectedSmeltingRevision: body.expected_smelting_revision,
        idempotencyKey,
      });
      const parsedResult = boundFarmSmeltingActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmSmeltingActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The smelting response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmSmeltingActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmSmeltingActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanSmeltingActionStateConflictError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          409,
          "state_conflict",
          "The smelting inventory has changed",
          error.currentSmeltingRevision,
        );
      }
      if (error instanceof FarmHumanSmeltingActionRejectedError) {
        return sendBoundFarmSmeltingActionError(reply, 409, "action_rejected", error.message);
      }
      if (error instanceof FarmHumanSmeltingActionIdempotencyConflictError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanSmeltingActionCredentialInvalidError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanSmeltingActionNotFoundError) {
        return sendBoundFarmSmeltingActionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanSmeltingActionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm smelting action is unavailable");
        return sendBoundFarmSmeltingActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The smelting response could not be verified",
        );
      }
      if (error instanceof FarmHumanSmeltingActionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm smelting action is unavailable");
        return sendBoundFarmSmeltingActionError(
          reply,
          503,
          "farm_unavailable",
          "The farm smelting service is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/original-plant/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmOriginalPlantActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmOriginalPlantActionError(
        reply,
        400,
        "invalid_request",
        "Submit one original plant action without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmOriginalPlantActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmOriginalPlantActionError(
        reply,
        400,
        "invalid_request",
        "Original plant actions require a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmOriginalPlantActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.executeCurrentFarmOriginalPlantAction(token, {
        expectedRevision: body.expected_revision,
        idempotencyKey,
        name: body.name,
        latin: body.latin,
        desc: body.desc,
        plant: body.plant,
        harvest: body.harvest,
      });
      const parsedResult = boundFarmOriginalPlantActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmOriginalPlantActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The original plant action response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmOriginalPlantActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmOriginalPlantActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmOriginalPlantActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmOriginalPlantActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanOriginalPlantActionStateConflictError) {
        return sendBoundFarmOriginalPlantActionError(
          reply,
          409,
          "state_conflict",
          "The original plant catalog has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanOriginalPlantActionRejectedError) {
        return sendBoundFarmOriginalPlantActionError(reply, 409, "action_rejected", error.message);
      }
      if (error instanceof FarmHumanOriginalPlantActionIdempotencyConflictError) {
        return sendBoundFarmOriginalPlantActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanOriginalPlantActionCredentialInvalidError) {
        return sendBoundFarmOriginalPlantActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanOriginalPlantActionNotFoundError) {
        return sendBoundFarmOriginalPlantActionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanOriginalPlantActionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm original plant action is unavailable");
        return sendBoundFarmOriginalPlantActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The original plant action response could not be verified",
        );
      }
      if (error instanceof FarmHumanOriginalPlantActionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm original plant action is unavailable");
        return sendBoundFarmOriginalPlantActionError(
          reply,
          503,
          "farm_unavailable",
          "The original plant action service is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/expedition/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmExpeditionActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmExpeditionActionError(
        reply,
        400,
        "invalid_request",
        "Submit one expedition action without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmExpeditionActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmExpeditionActionError(
        reply,
        400,
        "invalid_request",
        "Expedition actions require a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmExpeditionActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.executeCurrentFarmExpeditionAction(token, {
        expectedRevision: body.expected_revision,
        idempotencyKey,
        action: body.action,
        payload: body.payload,
      });
      const parsedResult = boundFarmExpeditionActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmExpeditionActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The expedition action response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmExpeditionActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmExpeditionActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmExpeditionActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmExpeditionActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanExpeditionActionStateConflictError) {
        return sendBoundFarmExpeditionActionError(
          reply,
          409,
          "state_conflict",
          "The expedition state has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanExpeditionActionRejectedError) {
        return sendBoundFarmExpeditionActionError(reply, 409, "action_rejected", error.message);
      }
      if (error instanceof FarmHumanExpeditionActionIdempotencyConflictError) {
        return sendBoundFarmExpeditionActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanExpeditionActionCredentialInvalidError) {
        return sendBoundFarmExpeditionActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanExpeditionActionNotFoundError) {
        return sendBoundFarmExpeditionActionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanExpeditionActionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm expedition action is unavailable");
        return sendBoundFarmExpeditionActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The expedition action response could not be verified",
        );
      }
      if (error instanceof FarmHumanExpeditionActionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm expedition action is unavailable");
        return sendBoundFarmExpeditionActionError(
          reply,
          503,
          "farm_unavailable",
          "The expedition action service is unavailable",
        );
      }
      throw error;
    }
  });

  app.get("/api/farm/ranch", { exposeHeadRoute: false }, async (request, reply) => {
    if (
      !boundFarmRanchReadRequestSchema.safeParse(request.query).success ||
      requestHasBody(request)
    ) {
      return sendBoundFarmRanchReadError(
        reply,
        400,
        "invalid_request",
        "The bound farm ranch does not accept query parameters or a request body",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmRanchReadError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const ranch = await options.registrationAuth.getCurrentFarmRanch(token);
      reply.header("cache-control", "no-store");
      return boundFarmRanchSuccessSchema.parse(ranch);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmRanchReadError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmRanchReadError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmRanchReadError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmRanchReadError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanRanchCredentialInvalidError) {
        return sendBoundFarmRanchReadError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanRanchNotFoundError) {
        return sendBoundFarmRanchReadError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanRanchContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm ranch read is unavailable");
        return sendBoundFarmRanchReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm ranch response could not be verified",
        );
      }
      if (error instanceof FarmHumanRanchUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm ranch read is unavailable");
        return sendBoundFarmRanchReadError(
          reply,
          503,
          "farm_unavailable",
          "The farm ranch is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/ranch/resident-actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmRanchResidentActionRequestSchema.safeParse(request.body);
    if (!boundFarmRanchReadRequestSchema.safeParse(request.query).success || !parsedBody.success) {
      return sendBoundFarmRanchResidentActionError(
        reply,
        400,
        "invalid_request",
        "Submit one ranch resident action without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmRanchResidentActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmRanchResidentActionError(
        reply,
        400,
        "invalid_request",
        "Ranch resident actions require a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmRanchResidentActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.executeCurrentFarmRanchResidentAction(token, {
        expectedRevision: body.expected_revision,
        idempotencyKey,
        action: body.action,
        residentType: body.resident_type,
        kindId: body.kind_id,
        payload: body.payload,
      });
      const parsedResult = boundFarmRanchResidentActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmRanchResidentActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The ranch resident action response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmRanchResidentActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmRanchResidentActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmRanchResidentActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmRanchResidentActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanRanchResidentActionStateConflictError) {
        return sendBoundFarmRanchResidentActionError(
          reply,
          409,
          "state_conflict",
          "The ranch has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanRanchResidentActionRejectedError) {
        return sendBoundFarmRanchResidentActionError(reply, 409, "action_rejected", error.message);
      }
      if (error instanceof FarmHumanRanchResidentActionIdempotencyConflictError) {
        return sendBoundFarmRanchResidentActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanRanchResidentActionCredentialInvalidError) {
        return sendBoundFarmRanchResidentActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanRanchResidentActionNotFoundError) {
        return sendBoundFarmRanchResidentActionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanRanchResidentActionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm ranch resident action is unavailable");
        return sendBoundFarmRanchResidentActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The ranch resident action response could not be verified",
        );
      }
      if (error instanceof FarmHumanRanchResidentActionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm ranch resident action is unavailable");
        return sendBoundFarmRanchResidentActionError(
          reply,
          503,
          "farm_unavailable",
          "The farm ranch is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/ranch/collect", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmRanchCollectionRequestSchema.safeParse(request.body);
    const expectedRevision = parseIfMatchRevision(request.headers["if-match"]);
    if (
      !boundFarmRanchReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success ||
      expectedRevision === undefined
    ) {
      return sendBoundFarmRanchCollectionError(
        reply,
        400,
        "invalid_request",
        "Ranch collection requires an empty body and an If-Match revision",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmHumanRanchCollectionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmRanchCollectionError(
        reply,
        400,
        "invalid_request",
        "Ranch collection requires a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmRanchCollectionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.collectCurrentFarmRanch(token, {
        expectedRevision,
        idempotencyKey,
      });
      const parsedResult = boundFarmRanchCollectionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmRanchCollectionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The ranch collection response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmRanchCollectionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmRanchCollectionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmRanchCollectionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmRanchCollectionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanRanchCollectionNoCollectableError) {
        return sendBoundFarmRanchCollectionError(
          reply,
          409,
          "no_collectable",
          "There is no pending ranch output to collect",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanRanchCollectionStateConflictError) {
        return sendBoundFarmRanchCollectionError(
          reply,
          409,
          "state_conflict",
          "The ranch has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanRanchCollectionRejectedError) {
        return sendBoundFarmRanchCollectionError(reply, 409, "collection_rejected", error.message);
      }
      if (error instanceof FarmHumanRanchCollectionIdempotencyConflictError) {
        return sendBoundFarmRanchCollectionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanRanchCollectionCredentialInvalidError) {
        return sendBoundFarmRanchCollectionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanRanchCollectionNotFoundError) {
        return sendBoundFarmRanchCollectionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanRanchCollectionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm ranch collection is unavailable");
        return sendBoundFarmRanchCollectionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The ranch collection response could not be verified",
        );
      }
      if (error instanceof FarmHumanRanchCollectionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm ranch collection is unavailable");
        return sendBoundFarmRanchCollectionError(
          reply,
          503,
          "farm_unavailable",
          "The farm ranch is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/ranch/decorations/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmRanchDecorationActionRequestSchema.safeParse(request.body);
    if (!boundFarmRanchReadRequestSchema.safeParse(request.query).success || !parsedBody.success) {
      return sendBoundFarmRanchDecorationActionError(
        reply,
        400,
        "invalid_request",
        "Submit one ranch decoration action without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmRanchDecorationActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmRanchDecorationActionError(
        reply,
        400,
        "invalid_request",
        "Ranch decoration actions require a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmRanchDecorationActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.executeCurrentFarmRanchDecorationAction(token, {
        expectedRevision: body.expected_revision,
        idempotencyKey,
        action: body.action,
        decorationId: body.decoration_id,
      });
      const parsedResult = boundFarmRanchDecorationActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmRanchDecorationActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The ranch decoration action response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmRanchDecorationActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmRanchDecorationActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmRanchDecorationActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmRanchDecorationActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanRanchDecorationActionStateConflictError) {
        return sendBoundFarmRanchDecorationActionError(
          reply,
          409,
          "state_conflict",
          "The ranch has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanRanchDecorationActionRejectedError) {
        return sendBoundFarmRanchDecorationActionError(
          reply,
          409,
          "action_rejected",
          error.message,
        );
      }
      if (error instanceof FarmHumanRanchDecorationActionIdempotencyConflictError) {
        return sendBoundFarmRanchDecorationActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanRanchDecorationActionCredentialInvalidError) {
        return sendBoundFarmRanchDecorationActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanRanchDecorationActionNotFoundError) {
        return sendBoundFarmRanchDecorationActionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanRanchDecorationActionContractUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm ranch decoration action is unavailable",
        );
        return sendBoundFarmRanchDecorationActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The ranch decoration action response could not be verified",
        );
      }
      if (error instanceof FarmHumanRanchDecorationActionUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm ranch decoration action is unavailable",
        );
        return sendBoundFarmRanchDecorationActionError(
          reply,
          503,
          "farm_unavailable",
          "The farm ranch is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/ranch/interaction/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmRanchInteractionActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmRanchInteractionActionError(
        reply,
        400,
        "invalid_request",
        "Submit one ranch interaction action without query parameters",
      );
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmRanchInteractionActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmRanchInteractionActionError(
        reply,
        400,
        "invalid_request",
        "Ranch interaction actions require a UUID Idempotency-Key",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmRanchInteractionActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const body = parsedBody.data;
      const common = {
        expectedRevision: body.expected_revision,
        idempotencyKey,
      };
      const result =
        body.action === "dispatch"
          ? await options.registrationAuth.executeCurrentFarmRanchInteractionAction(token, {
              ...common,
              action: body.action,
              targetFarmDoorplate: body.target_farm_doorplate,
              animalKindId: body.animal_kind_id,
              durationHours: body.duration_hours,
            })
          : body.action === "catch"
            ? await options.registrationAuth.executeCurrentFarmRanchInteractionAction(token, {
                ...common,
                action: body.action,
                raidId: body.raid_id,
              })
            : await options.registrationAuth.executeCurrentFarmRanchInteractionAction(token, {
                ...common,
                action: body.action,
                amount: body.amount,
              });
      const parsedResult = boundFarmRanchInteractionActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmRanchInteractionActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The ranch interaction response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmRanchInteractionActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmRanchInteractionActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmRanchInteractionActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmRanchInteractionActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanRanchInteractionActionStateConflictError) {
        return sendBoundFarmRanchInteractionActionError(
          reply,
          409,
          "state_conflict",
          "The ranch has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanRanchInteractionActionRejectedError) {
        return sendBoundFarmRanchInteractionActionError(
          reply,
          409,
          "action_rejected",
          error.message,
        );
      }
      if (error instanceof FarmHumanRanchInteractionActionIdempotencyConflictError) {
        return sendBoundFarmRanchInteractionActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanRanchInteractionActionCredentialInvalidError) {
        return sendBoundFarmRanchInteractionActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanRanchInteractionActionNotFoundError) {
        return sendBoundFarmRanchInteractionActionError(
          reply,
          404,
          "farm_not_found",
          "The ranch interaction target no longer exists",
        );
      }
      if (error instanceof FarmHumanRanchInteractionActionContractUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm ranch interaction action is unavailable",
        );
        return sendBoundFarmRanchInteractionActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The ranch interaction response could not be verified",
        );
      }
      if (error instanceof FarmHumanRanchInteractionActionUnavailableError) {
        request.log.error(
          { error_name: error.name },
          "Farm ranch interaction action is unavailable",
        );
        return sendBoundFarmRanchInteractionActionError(
          reply,
          503,
          "farm_unavailable",
          "The ranch interaction service is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/settings/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmSettingsActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmSettingsActionError(
        reply,
        400,
        "invalid_request",
        "Submit one farm settings action without query parameters",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmSettingsActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmSettingsActionError(
        reply,
        400,
        "invalid_request",
        "Farm settings actions require a UUID Idempotency-Key",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmSettingsActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.updateCurrentFarmSettings(token, {
        expectedCatalogRevision: body.expected_catalog_revision,
        idempotencyKey,
        field: body.field,
        value: body.value,
      });
      const parsedResult = boundFarmSettingsActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmSettingsActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm settings action response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmSettingsActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmSettingsActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmSettingsActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmSettingsActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanFarmSettingsActionStateConflictError) {
        return sendBoundFarmSettingsActionError(
          reply,
          409,
          "state_conflict",
          "The farm settings have changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanFarmSettingsActionRejectedError) {
        return sendBoundFarmSettingsActionError(reply, 409, "action_rejected", error.message);
      }
      if (error instanceof FarmHumanFarmSettingsActionIdempotencyConflictError) {
        return sendBoundFarmSettingsActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanFarmSettingsActionCredentialInvalidError) {
        return sendBoundFarmSettingsActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanFarmSettingsActionNotFoundError) {
        return sendBoundFarmSettingsActionError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanFarmSettingsActionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm settings action is unavailable");
        return sendBoundFarmSettingsActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm settings action response could not be verified",
        );
      }
      if (error instanceof FarmHumanFarmSettingsActionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm settings action is unavailable");
        return sendBoundFarmSettingsActionError(
          reply,
          503,
          "farm_unavailable",
          "The farm settings are unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/neighborhood/messages", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmNeighborhoodMessageActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmNeighborhoodMessageActionError(
        reply,
        400,
        "invalid_request",
        "Submit one neighborhood message without query parameters",
      );
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmNeighborhoodMessageActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmNeighborhoodMessageActionError(
        reply,
        400,
        "invalid_request",
        "Neighborhood messages require a UUID Idempotency-Key",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmNeighborhoodMessageActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const body = parsedBody.data;
      const result = await options.registrationAuth.sendCurrentFarmNeighborhoodMessage(token, {
        targetFarmDoorplate: body.target_farm_doorplate,
        message: body.body,
        expectedRevision: body.expected_revision,
        idempotencyKey,
      });
      const parsedResult = boundFarmNeighborhoodMessageActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The neighborhood message response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanNeighborhoodMessageActionStateConflictError) {
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          409,
          "state_conflict",
          "The neighborhood has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanNeighborhoodMessageActionRejectedError) {
        return sendBoundFarmNeighborhoodMessageActionError(reply, 409, error.code, error.message);
      }
      if (error instanceof FarmHumanNeighborhoodMessageActionIdempotencyConflictError) {
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanNeighborhoodMessageActionCredentialInvalidError) {
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanNeighborhoodMessageActionNotFoundError) {
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          404,
          "farm_not_found",
          "The target farm no longer exists",
        );
      }
      if (error instanceof FarmHumanNeighborhoodMessageActionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm neighborhood message is unavailable");
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The neighborhood message response could not be verified",
        );
      }
      if (error instanceof FarmHumanNeighborhoodMessageActionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm neighborhood message is unavailable");
        return sendBoundFarmNeighborhoodMessageActionError(
          reply,
          503,
          "farm_unavailable",
          "The neighborhood message service is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/market/actions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsedBody = boundFarmMarketActionRequestSchema.safeParse(request.body);
    if (
      !boundFarmCatalogReadRequestSchema.safeParse(request.query).success ||
      !parsedBody.success
    ) {
      return sendBoundFarmMarketActionError(
        reply,
        400,
        "invalid_request",
        "Submit one market action without query parameters",
      );
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (
      typeof idempotencyKey !== "string" ||
      !farmMarketActionIdempotencyKeySchema.safeParse(idempotencyKey).success
    ) {
      return sendBoundFarmMarketActionError(
        reply,
        400,
        "invalid_request",
        "Market actions require a UUID Idempotency-Key",
      );
    }
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmMarketActionError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    try {
      const body = parsedBody.data;
      const common = { expectedRevision: body.expected_revision, idempotencyKey };
      const result =
        body.action === "browse"
          ? await options.registrationAuth.executeCurrentFarmMarketAction(token, {
              ...common,
              action: body.action,
            })
          : body.action === "list"
            ? await options.registrationAuth.executeCurrentFarmMarketAction(token, {
                ...common,
                action: body.action,
                kind: body.kind,
                itemId: body.item_id,
                quantity: body.qty,
                ...(body.price === undefined ? {} : { price: body.price }),
              })
            : body.action === "buy"
              ? await options.registrationAuth.executeCurrentFarmMarketAction(token, {
                  ...common,
                  action: body.action,
                  sellerDoorplate: body.seller_doorplate,
                  kind: body.kind,
                  itemId: body.item_id,
                  quantity: body.qty,
                })
              : body.action === "unlist"
                ? await options.registrationAuth.executeCurrentFarmMarketAction(token, {
                    ...common,
                    action: body.action,
                    kind: body.kind,
                    itemId: body.item_id,
                  })
                : body.action === "barter-list"
                  ? await options.registrationAuth.executeCurrentFarmMarketAction(token, {
                      ...common,
                      action: body.action,
                      giveKind: body.give_kind,
                      giveItemId: body.give_item_id,
                      giveQuantity: body.give_qty,
                      wantKind: body.want_kind,
                      wantItemId: body.want_item_id,
                      wantQuantity: body.want_qty,
                    })
                  : body.action === "barter-accept"
                    ? await options.registrationAuth.executeCurrentFarmMarketAction(token, {
                        ...common,
                        action: body.action,
                        sellerDoorplate: body.seller_doorplate,
                        listingId: body.listing_id,
                      })
                    : await options.registrationAuth.executeCurrentFarmMarketAction(token, {
                        ...common,
                        action: body.action,
                        listingId: body.listing_id,
                      });
      const parsedResult = boundFarmMarketActionSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendBoundFarmMarketActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The market action response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmMarketActionError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmMarketActionError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmMarketActionError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmMarketActionError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanMarketActionStateConflictError) {
        return sendBoundFarmMarketActionError(
          reply,
          409,
          "state_conflict",
          "The market state has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanMarketActionRejectedError) {
        return sendBoundFarmMarketActionError(reply, 409, "action_rejected", error.message);
      }
      if (error instanceof FarmHumanMarketActionCrossFarmAtomicityUnavailableError) {
        return sendBoundFarmMarketActionError(
          reply,
          503,
          "cross_farm_atomicity_unavailable",
          error.message,
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanMarketActionIdempotencyConflictError) {
        return sendBoundFarmMarketActionError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanMarketActionCredentialInvalidError) {
        return sendBoundFarmMarketActionError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanMarketActionNotFoundError) {
        return sendBoundFarmMarketActionError(
          reply,
          404,
          "farm_not_found",
          "The market target no longer exists",
        );
      }
      if (error instanceof FarmHumanMarketActionContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm market action is unavailable");
        return sendBoundFarmMarketActionError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The market action response could not be verified",
        );
      }
      if (error instanceof FarmHumanMarketActionUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm market action is unavailable");
        return sendBoundFarmMarketActionError(
          reply,
          503,
          "farm_unavailable",
          "The market action service is unavailable",
        );
      }
      throw error;
    }
  });

  app.get("/api/lingye/glimmer", { exposeHeadRoute: false }, async (request, reply) => {
    if (
      !boundGlimmerReadRequestSchema.safeParse(request.query).success ||
      requestHasBody(request)
    ) {
      return sendBoundGlimmerReadError(
        reply,
        400,
        "invalid_request",
        "The structured Glimmer read does not accept query parameters or a request body",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundGlimmerReadError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.getCurrentFarmGlimmer(token);
      const parsed = boundGlimmerReadSuccessSchema.safeParse(result);
      if (!parsed.success) {
        reportFarmLingyeUnavailable(request, new FarmLingyeContractUnavailableError());
        return sendBoundGlimmerReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm Glimmer response could not be verified",
        );
      }
      reply.header("cache-control", "no-store");
      return parsed.data;
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundGlimmerReadError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundGlimmerReadError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundGlimmerReadError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundGlimmerReadError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmLingyeCredentialInvalidError) {
        return sendBoundGlimmerReadError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmLingyeNotFoundError) {
        return sendBoundGlimmerReadError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmLingyeContractUnavailableError) {
        reportFarmLingyeUnavailable(request, error);
        return sendBoundGlimmerReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm Glimmer response could not be verified",
        );
      }
      if (error instanceof FarmLingyeUnavailableError) {
        reportFarmLingyeUnavailable(request, error);
        return sendBoundGlimmerReadError(
          reply,
          503,
          "farm_unavailable",
          "The farm Glimmer service is unavailable",
        );
      }
      throw error;
    }
  });

  app.get("/api/lingye/memorial/qixi-2026", { exposeHeadRoute: false }, async (request, reply) => {
    if (
      !boundQixiMemorialReadRequestSchema.safeParse(request.query).success ||
      requestHasBody(request)
    ) {
      return sendBoundQixiMemorialReadError(
        reply,
        400,
        "invalid_request",
        "The Qixi memorial read does not accept query parameters or a request body",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundQixiMemorialReadError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.getCurrentQixiMemorial(token);
      const parsed = boundQixiMemorialReadSuccessSchema.safeParse({
        data: {
          human_name: result.data.human_name,
          ai_name: result.data.ai_name,
          human: result.data.human,
          ai: result.data.ai,
        },
      });
      if (!parsed.success) {
        request.log.error(
          { error_name: "FarmHumanQixiMemorialContractUnavailableError" },
          "Farm Qixi memorial read is unavailable",
        );
        return sendBoundQixiMemorialReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm Qixi memorial response could not be verified",
        );
      }
      reply.header("cache-control", "no-store");
      return parsed.data;
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundQixiMemorialReadError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundQixiMemorialReadError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundQixiMemorialReadError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundQixiMemorialReadError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanQixiMemorialCredentialInvalidError) {
        return sendBoundQixiMemorialReadError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanQixiMemorialNotFoundError) {
        return sendBoundQixiMemorialReadError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanQixiMemorialContractUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm Qixi memorial read is unavailable");
        return sendBoundQixiMemorialReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm Qixi memorial response could not be verified",
        );
      }
      if (error instanceof FarmHumanQixiMemorialUnavailableError) {
        request.log.error({ error_name: error.name }, "Farm Qixi memorial read is unavailable");
        return sendBoundQixiMemorialReadError(
          reply,
          503,
          "farm_unavailable",
          "The farm Qixi memorial service is unavailable",
        );
      }
      throw error;
    }
  });

  app.get("/api/lingye/together", { exposeHeadRoute: false }, async (request, reply) => {
    if (
      !boundTogetherReadRequestSchema.safeParse(request.query).success ||
      requestHasBody(request)
    ) {
      return sendBoundTogetherReadError(
        reply,
        400,
        "invalid_request",
        "The structured Together read does not accept query parameters or a request body",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundTogetherReadError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.getCurrentFarmTogether(token);
      const parsed = boundTogetherReadSuccessSchema.safeParse(result);
      if (!parsed.success) {
        reportFarmLingyeUnavailable(request, new FarmLingyeContractUnavailableError());
        return sendBoundTogetherReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm Together response could not be verified",
        );
      }
      reply.header("cache-control", "no-store");
      return parsed.data;
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundTogetherReadError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundTogetherReadError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundTogetherReadError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundTogetherReadError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmLingyeCredentialInvalidError) {
        return sendBoundTogetherReadError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmLingyeNotFoundError) {
        return sendBoundTogetherReadError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmLingyeContractUnavailableError) {
        reportFarmLingyeUnavailable(request, error);
        return sendBoundTogetherReadError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm Together response could not be verified",
        );
      }
      if (error instanceof FarmLingyeUnavailableError) {
        reportFarmLingyeUnavailable(request, error);
        return sendBoundTogetherReadError(
          reply,
          503,
          "farm_unavailable",
          "The farm Together service is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/field/harvest-assists", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!boundFarmHarvestAssistRequestSchema.safeParse(request.query).success) {
      return sendHarvestAssistError(
        reply,
        400,
        "invalid_request",
        "The harvest assist does not accept query parameters",
      );
    }
    if (!boundFarmHarvestAssistRequestSchema.safeParse(request.body).success) {
      return sendHarvestAssistError(
        reply,
        400,
        "invalid_request",
        "The harvest assist body must be empty",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    const expectedRevision = parseIfMatchRevision(request.headers["if-match"]);
    if (
      typeof idempotencyKey !== "string" ||
      !farmHumanFieldHarvestAssistIdempotencyKeySchema.safeParse(idempotencyKey).success ||
      expectedRevision === undefined
    ) {
      return sendHarvestAssistError(
        reply,
        400,
        "invalid_request",
        "Harvest assist requires a UUID Idempotency-Key and a valid If-Match revision",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendHarvestAssistError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.harvestCurrentFarmField(token, {
        expectedRevision,
        idempotencyKey,
      });
      const parsedResult = boundFarmHarvestAssistSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendHarvestAssistError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm harvest response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendHarvestAssistError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendHarvestAssistError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendHarvestAssistError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendHarvestAssistError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanHarvestAssistExhaustedError) {
        return sendHarvestAssistError(
          reply,
          409,
          "harvest_assist_exhausted",
          "The daily harvest assist limit has been reached",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanNoRipePlotsError) {
        return sendHarvestAssistError(
          reply,
          409,
          "no_ripe_plots",
          "There are no ripe plots to harvest",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanFieldStateConflictError) {
        return sendHarvestAssistError(
          reply,
          409,
          "state_conflict",
          "The farm field has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanFieldIdempotencyConflictError) {
        return sendHarvestAssistError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanFieldCredentialInvalidError) {
        return sendHarvestAssistError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanFieldNotFoundError) {
        return sendHarvestAssistError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanFieldContractUnavailableError) {
        reportFarmHumanFieldUnavailable(request, error);
        return sendHarvestAssistError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The farm harvest response could not be verified",
        );
      }
      if (error instanceof FarmHumanFieldUnavailableError) {
        reportFarmHumanFieldUnavailable(request, error);
        return sendHarvestAssistError(
          reply,
          503,
          "farm_unavailable",
          "The farm field is unavailable",
        );
      }
      throw error;
    }
  });

  app.post("/api/farm/field/upgrade", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (
      !boundFarmLandUpgradeRequestSchema.safeParse(request.query).success ||
      !boundFarmLandUpgradeRequestSchema.safeParse(request.body).success
    ) {
      return sendLandUpgradeError(
        reply,
        400,
        "invalid_request",
        "The land upgrade does not accept query parameters or body fields",
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    const expectedRevision = parseIfMatchRevision(request.headers["if-match"]);
    if (
      typeof idempotencyKey !== "string" ||
      !farmHumanFieldLandUpgradeIdempotencyKeySchema.safeParse(idempotencyKey).success ||
      expectedRevision === undefined
    ) {
      return sendLandUpgradeError(
        reply,
        400,
        "invalid_request",
        "Land upgrade requires a UUID Idempotency-Key and a valid If-Match revision",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendLandUpgradeError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.upgradeCurrentFarmLand(token, {
        expectedRevision,
        idempotencyKey,
      });
      const parsedResult = boundFarmLandUpgradeSuccessSchema.safeParse(result);
      if (!parsedResult.success) {
        return sendLandUpgradeError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The land upgrade response could not be verified",
        );
      }
      return reply.send(parsedResult.data);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendLandUpgradeError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendLandUpgradeError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendLandUpgradeError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendLandUpgradeError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmHumanLandUpgradeRejectedError) {
        return sendLandUpgradeError(
          reply,
          409,
          "land_upgrade_rejected",
          error.message,
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanFieldStateConflictError) {
        return sendLandUpgradeError(
          reply,
          409,
          "state_conflict",
          "The farm field has changed",
          error.currentRevision,
        );
      }
      if (error instanceof FarmHumanFieldIdempotencyConflictError) {
        return sendLandUpgradeError(
          reply,
          409,
          "idempotency_conflict",
          "This idempotency key was used for a different request",
        );
      }
      if (error instanceof FarmHumanFieldCredentialInvalidError) {
        return sendLandUpgradeError(
          reply,
          409,
          "farm_credential_invalid",
          "The bound farm human credential is no longer valid",
        );
      }
      if (error instanceof FarmHumanFieldNotFoundError) {
        return sendLandUpgradeError(
          reply,
          404,
          "farm_not_found",
          "The bound farm no longer exists",
        );
      }
      if (error instanceof FarmHumanFieldContractUnavailableError) {
        reportFarmHumanFieldUnavailable(request, error);
        return sendLandUpgradeError(
          reply,
          502,
          "upstream_contract_unavailable",
          "The land upgrade response could not be verified",
        );
      }
      if (error instanceof FarmHumanFieldUnavailableError) {
        reportFarmHumanFieldUnavailable(request, error);
        return sendLandUpgradeError(
          reply,
          503,
          "farm_unavailable",
          "The farm field is unavailable",
        );
      }
      throw error;
    }
  });

  app.get("/api/farm/overview", async (request, reply) => {
    if (!boundFarmOverviewRequestSchema.safeParse(request.query).success) {
      return sendBoundFarmError(
        reply,
        400,
        "invalid_request",
        "The bound farm overview does not accept query parameters",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendBoundFarmError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const farm = await options.registrationAuth.getCurrentFarmOverview(token);
      return boundFarmOverviewSuccessSchema.parse({
        farm: {
          farm_doorplate: farm.farmDoorplate,
          farm_name: farm.farmName,
          plots: farm.plots.map((plot) => ({
            plot_id: plot.plotId,
            state: plot.state,
            seed_type: plot.seedType,
            watered: plot.watered,
          })),
        },
      });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return sendBoundFarmError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      if (error instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendBoundFarmError(
          reply,
          403,
          "qq_not_group_member",
          "The session QQ number is no longer a current member of the community group",
        );
      }
      if (error instanceof OneBotUnavailableError) {
        reportOneBotUnavailable(request, error);
        return sendBoundFarmError(
          reply,
          503,
          "onebot_unavailable",
          "QQ group membership could not be verified",
        );
      }
      if (error instanceof RegistrationProfileRequiredError) {
        return sendBoundFarmError(
          reply,
          409,
          "registration_profile_required",
          "A resident, home, and farm binding are required",
        );
      }
      if (error instanceof FarmNotFoundError) {
        return sendBoundFarmError(reply, 404, "farm_not_found", "The bound farm no longer exists");
      }
      if (error instanceof FarmNotPubliclyReadableError) {
        return sendBoundFarmError(
          reply,
          403,
          "farm_not_publicly_readable",
          "The bound farm cannot be read through the current public farm contract",
        );
      }
      if (error instanceof FarmDirectoryUnavailableError) {
        reportFarmUnavailable(request, error);
        return sendBoundFarmError(
          reply,
          503,
          "farm_unavailable",
          "The bound farm could not be queried",
        );
      }
      throw error;
    }
  });

  const sendFarmHumanFailure = (request: FastifyRequest, reply: FastifyReply, error: unknown) => {
    if (error instanceof AuthenticationRequiredError) {
      return sendFarmHumanUiError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }
    if (error instanceof QqNotGroupMemberError) {
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return sendFarmHumanUiError(
        reply,
        403,
        "qq_not_group_member",
        "The session QQ number is no longer a current member of the community group",
      );
    }
    if (error instanceof OneBotUnavailableError) {
      reportOneBotUnavailable(request, error);
      return sendFarmHumanUiError(
        reply,
        503,
        "onebot_unavailable",
        "QQ group membership could not be verified",
      );
    }
    if (error instanceof RegistrationProfileRequiredError) {
      return sendFarmHumanUiError(
        reply,
        409,
        "registration_profile_required",
        "A resident, home, and farm binding are required",
      );
    }
    if (error instanceof FarmHumanCredentialInvalidError) {
      return sendFarmHumanUiError(
        reply,
        409,
        "farm_credential_invalid",
        "The bound farm human credential is no longer valid",
      );
    }
    if (error instanceof FarmUpstreamContractUnavailableError) {
      reportFarmUnavailable(request, error);
      return sendFarmHumanUiError(
        reply,
        502,
        "upstream_contract_unavailable",
        "The farm human UI response could not be safely proxied",
      );
    }
    if (error instanceof FarmDirectoryUnavailableError) {
      reportFarmUnavailable(request, error);
      return sendFarmHumanUiError(
        reply,
        503,
        "farm_unavailable",
        "The farm human UI is unavailable",
      );
    }
    throw error;
  };

  const renderFarmHumanPage = async (
    request: FastifyRequest,
    reply: FastifyReply,
    pagePath: string,
    allowedQueryFields: readonly string[],
  ) => {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendFarmHumanUiError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    const query = new URL(request.raw.url ?? "", "http://doorbell.local").searchParams;
    const validatedQuery = validateParameters(query, allowedQueryFields);
    if (!validatedQuery) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The farm page query does not match the existing farm UI contract",
      );
    }

    try {
      const page = await options.registrationAuth.getCurrentFarmHumanPage(
        token,
        pagePath,
        validatedQuery,
      );
      return reply.type("text/html; charset=utf-8").send(page.html);
    } catch (error) {
      return sendFarmHumanFailure(request, reply, error);
    }
  };

  app.get("/api/farm/ui", async (request, reply) => renderFarmHumanPage(request, reply, "", []));

  app.get("/api/farm/ui/*", async (request, reply) => {
    const pagePath = (request.params as { "*": string })["*"];
    const section = pagePath.split("/", 1)[0]?.toLowerCase();
    if (section && INDEPENDENT_FARM_HUMAN_SECTIONS.has(section)) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The requested farm page has an independent Doorbell entry",
      );
    }
    const allowedQueryFields = FARM_HUMAN_GET_ROUTES.get(pagePath);
    if (!allowedQueryFields) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The requested farm page is not part of the existing human UI contract",
      );
    }
    return renderFarmHumanPage(request, reply, pagePath, allowedQueryFields);
  });

  app.get("/api/lingye-together", async (request, reply) =>
    renderFarmHumanPage(request, reply, "together", []),
  );

  app.get("/api/lingye-glimmer", { exposeHeadRoute: false }, async (request, reply) =>
    renderFarmHumanPage(request, reply, "glimmer", []),
  );

  app.post("/api/farm/ui/*", async (request, reply) => {
    const actionPath = (request.params as { "*": string })["*"];
    const allowedFormFields = FARM_HUMAN_POST_ROUTES.get(actionPath);
    const query = new URL(request.raw.url ?? "", "http://doorbell.local").searchParams;
    if (!allowedFormFields || query.size !== 0 || !(request.body instanceof URLSearchParams)) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The farm action must use the existing form contract",
      );
    }
    const form = validateParameters(request.body, allowedFormFields);
    if (!form) {
      return sendFarmHumanUiError(
        reply,
        400,
        "invalid_request",
        "The farm action fields do not match the existing form contract",
      );
    }

    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendFarmHumanUiError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      const result = await options.registrationAuth.submitCurrentFarmHumanAction(
        token,
        actionPath,
        form,
      );
      return reply.code(303).header("location", result.location).send();
    } catch (error) {
      return sendFarmHumanFailure(request, reply, error);
    }
  });

  app.delete("/api/auth/session", async (request, reply) => {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) {
      return sendAuthenticationError(
        reply,
        401,
        "authentication_required",
        "An active human session is required",
      );
    }

    try {
      options.registrationAuth.logout(token);
      reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
      return humanLogoutSuccessSchema.parse({ logged_out: true });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return sendAuthenticationError(
          reply,
          401,
          "authentication_required",
          "An active human session is required",
        );
      }
      throw error;
    }
  });

  return app;
}
