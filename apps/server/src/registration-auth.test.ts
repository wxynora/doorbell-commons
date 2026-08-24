import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  boundFarmCatalogReadErrorSchema,
  boundFarmCatalogReadSuccessSchema,
  boundFarmFieldErrorSchema,
  boundFarmFieldSuccessSchema,
  boundFarmHarvestAssistErrorSchema,
  boundFarmHarvestAssistSuccessSchema,
  boundFarmKitchenPurchaseErrorSchema,
  boundFarmKitchenPurchaseSuccessSchema,
  boundFarmKitchenReadErrorSchema,
  boundFarmKitchenReadSuccessSchema,
  boundFarmOverviewErrorSchema,
  boundFarmOverviewSuccessSchema,
  boundFarmRanchCollectionErrorSchema,
  boundFarmRanchCollectionSuccessSchema,
  boundFarmRanchErrorSchema,
  boundFarmRanchResidentActionErrorSchema,
  boundFarmRanchResidentActionSuccessSchema,
  boundFarmRanchSuccessSchema,
  boundFarmSettingsActionErrorSchema,
  boundFarmSettingsActionSuccessSchema,
  boundGlimmerReadErrorSchema,
  boundGlimmerReadSuccessSchema,
  boundTogetherReadErrorSchema,
  boundTogetherReadSuccessSchema,
  createdFarmHumanSessionSuccessSchema,
  currentHumanSessionSuccessSchema,
  type FarmHumanCatalogReadSuccess,
  type FarmHumanFarmSettingsActionSuccess,
  type FarmHumanFieldHarvestAssistSuccess,
  type FarmHumanFieldReadSuccess,
  type FarmHumanGlimmerReadSuccess,
  type FarmHumanKitchenPurchaseSuccess,
  type FarmHumanKitchenReadSuccess,
  type FarmHumanRanchCollectionSuccess,
  type FarmHumanRanchReadSuccess,
  type FarmHumanRanchResidentActionSuccess,
  type FarmHumanTogetherReadSuccess,
  farmHumanUiErrorSchema,
  humanAuthenticationErrorSchema,
  humanLogoutSuccessSchema,
  humanSessionSuccessSchema,
} from "@doorbell/protocol";
import Database from "better-sqlite3";
import { buildApp } from "./app.js";
import { CommunityDatabase } from "./community-database.js";
import { COMMUNITY_QQ_GROUP_ID } from "./config.js";
import {
  FarmHumanCatalogContractUnavailableError,
  FarmHumanCatalogCredentialInvalidError,
  FarmHumanCatalogNotFoundError,
  type FarmHumanCatalogReader,
  type FarmHumanCatalogReadInput,
  FarmHumanCatalogUnavailableError,
} from "./farm-catalog-client.js";
import {
  type FarmCreationInput,
  FarmCreationUnavailableError,
  type FarmCreator,
} from "./farm-creation-client.js";
import {
  type FarmDirectoryReader,
  FarmDirectoryUnavailableError,
  FarmHumanCredentialInvalidError,
  FarmNotFoundError,
  FarmNotPubliclyReadableError,
  FarmUpstreamContractUnavailableError,
} from "./farm-directory-client.js";
import {
  FarmHumanFieldContractUnavailableError,
  FarmHumanFieldCredentialInvalidError,
  type FarmHumanFieldHarvestAssistInput,
  FarmHumanFieldIdempotencyConflictError,
  FarmHumanFieldNotFoundError,
  type FarmHumanFieldReader,
  type FarmHumanFieldReadInput,
  FarmHumanFieldStateConflictError,
  FarmHumanFieldUnavailableError,
  FarmHumanHarvestAssistExhaustedError,
  FarmHumanNoRipePlotsError,
} from "./farm-human-client.js";
import {
  FarmHumanKitchenContractUnavailableError,
  FarmHumanKitchenCredentialInvalidError,
  FarmHumanKitchenNotFoundError,
  type FarmHumanKitchenReader,
  type FarmHumanKitchenReadInput,
  FarmHumanKitchenUnavailableError,
} from "./farm-kitchen-client.js";
import {
  FarmHumanKitchenPurchaseContractUnavailableError,
  FarmHumanKitchenPurchaseCredentialInvalidError,
  FarmHumanKitchenPurchaseIdempotencyConflictError,
  type FarmHumanKitchenPurchaseInput,
  FarmHumanKitchenPurchaseNotFoundError,
  FarmHumanKitchenPurchaseRejectedError,
  type FarmHumanKitchenPurchaser,
  FarmHumanKitchenPurchaseShopChangedError,
  FarmHumanKitchenPurchaseShopUnavailableError,
  FarmHumanKitchenPurchaseStateConflictError,
  FarmHumanKitchenPurchaseUnavailableError,
} from "./farm-kitchen-purchase-client.js";
import {
  FarmLingyeContractUnavailableError,
  FarmLingyeCredentialInvalidError,
  FarmLingyeNotFoundError,
  type FarmLingyeReader,
  type FarmLingyeReadInput,
  FarmLingyeUnavailableError,
} from "./farm-lingye-client.js";
import {
  FarmHumanRanchResidentActionContractUnavailableError,
  FarmHumanRanchResidentActionCredentialInvalidError,
  type FarmHumanRanchResidentActioner,
  FarmHumanRanchResidentActionIdempotencyConflictError,
  type FarmHumanRanchResidentActionInput,
  FarmHumanRanchResidentActionNotFoundError,
  FarmHumanRanchResidentActionRejectedError,
  FarmHumanRanchResidentActionStateConflictError,
  FarmHumanRanchResidentActionUnavailableError,
} from "./farm-ranch-action-client.js";
import {
  FarmHumanRanchContractUnavailableError,
  FarmHumanRanchCredentialInvalidError,
  FarmHumanRanchNotFoundError,
  type FarmHumanRanchReader,
  type FarmHumanRanchReadInput,
  FarmHumanRanchUnavailableError,
} from "./farm-ranch-client.js";
import {
  FarmHumanRanchCollectionContractUnavailableError,
  FarmHumanRanchCollectionCredentialInvalidError,
  FarmHumanRanchCollectionIdempotencyConflictError,
  type FarmHumanRanchCollectionInput,
  FarmHumanRanchCollectionNoCollectableError,
  FarmHumanRanchCollectionNotFoundError,
  FarmHumanRanchCollectionRejectedError,
  FarmHumanRanchCollectionStateConflictError,
  FarmHumanRanchCollectionUnavailableError,
  type FarmHumanRanchCollector,
} from "./farm-ranch-collection-client.js";
import {
  FarmHumanFarmSettingsActionContractUnavailableError,
  FarmHumanFarmSettingsActionCredentialInvalidError,
  type FarmHumanFarmSettingsActioner,
  FarmHumanFarmSettingsActionIdempotencyConflictError,
  type FarmHumanFarmSettingsActionInput,
  FarmHumanFarmSettingsActionNotFoundError,
  FarmHumanFarmSettingsActionRejectedError,
  FarmHumanFarmSettingsActionStateConflictError,
  FarmHumanFarmSettingsActionUnavailableError,
} from "./farm-settings-action-client.js";
import { MailboxService } from "./mailbox-service.js";
import { createHumanPasswordCredential, verifyHumanPassword } from "./password-auth.js";
import { OneBotUnavailableError, type QqGroupMembershipReader } from "./qq-group-membership.js";
import { InvalidRegistrationCodeError, RegistrationAuthService } from "./registration-auth.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const QQ_NUMBER = "3877162412";
const CURRENT_CODE = "DB-ABCD-2345";
const OTHER_CODE = "DB-WXYZ-6789";
const FARM_DOORPLATE = "3ET3FE";
const FARM_NAME = "渡的小农场";
const FARM_AI_NAME = "小渡";
const FARM_HUMAN_KEY = "private-farm-human-key";
const FARM_HUMAN_UI_BASE_URL = "https://doorbellcommons.com/farm";
const FARM_HUMAN_URL = `${FARM_HUMAN_UI_BASE_URL}/ui/${FARM_HUMAN_KEY}`;
const RESIDENT_NAME = " 渡 ";
const RESIDENT_DISPLAY_NAME = `${RESIDENT_NAME} & ${FARM_AI_NAME}`;
const HOME_NAME = " 渡的小家 ";
const PASSWORD = "doorbell password";
const FULL_REGISTRATION_PAYLOAD = {
  qq_number: QQ_NUMBER,
  registration_code: CURRENT_CODE,
  password: PASSWORD,
  resident_name: RESIDENT_NAME,
  home_name: HOME_NAME,
  farm_doorplate: FARM_DOORPLATE,
  farm_human_url: FARM_HUMAN_URL,
  confirmed_farm_name: FARM_NAME,
};
const CREATE_FARM_REGISTRATION_PAYLOAD = {
  qq_number: QQ_NUMBER,
  registration_code: CURRENT_CODE,
  password: PASSWORD,
  resident_name: "辛玥",
  home_name: HOME_NAME,
  farm_name: "辛玥的小农场",
  ai_name: FARM_AI_NAME,
};
const FARM_FIELD_RESULT = {
  data: {
    farm: {
      farm_doorplate: FARM_DOORPLATE,
      farm_name: FARM_NAME,
      welcome_message: null,
      equipped_title: null,
    },
    balance: { farm_coins: 1280 },
    season: { name: "夏" },
    land: { tier: 3, name: "沃野" },
    plots: [
      {
        plot_id: 1,
        state: "ripe",
        seed_type: "common",
        watered: 2,
        progress: { current: 6, total: 6 },
        matures_at: null,
        identity_state: "hidden",
        crop_identity: null,
      },
      {
        plot_id: 2,
        state: "growing",
        seed_type: "limited",
        watered: 1,
        progress: { current: 2, total: 5 },
        matures_at: "2026-08-23T12:30:00.000Z",
        identity_state: "known",
        crop_identity: {
          crop_id: "star-shuttle-wheat",
          name: "星梭麦",
          category: "limited",
        },
      },
      {
        plot_id: 3,
        state: "growing",
        seed_type: "limited",
        watered: 0,
        progress: { current: 1, total: 4 },
        matures_at: "2026-08-23T13:30:00.000Z",
        identity_state: "unavailable",
        crop_identity: null,
      },
    ],
    harvest_assist: {
      daily_limit: 3,
      remaining: 2,
      mature_plot_count: 1,
      can_assist: true,
      reset_at: "2026-08-24T00:00:00.000Z",
    },
  },
  revision: "field:opaque-version",
  server_time: "2026-08-23T10:00:00.000Z",
} satisfies FarmHumanFieldReadSuccess;

const FARM_HARVEST_ASSIST_RESULT = {
  data: {
    result: {
      receipt_id: "019ffb01-49cd-7020-84af-3d04fb1ed03d",
      harvested_count: 1,
      farm_coins_gained: 100,
      silver_gained: 0,
      harvests: [
        {
          plot_id: 1,
          crop: {
            crop_id: "common-wheat",
            name: "小麦",
            category: "common",
            rarity: "N",
          },
          quality: { name: "常品" },
          value: 100,
          currency: "gold",
          is_new: false,
          material_drop: null,
          potion_drop: null,
          bonus_value: 0,
        },
      ],
      season_event: null,
      new_titles: [],
    },
    resource: FARM_FIELD_RESULT.data,
  },
  revision: "field:new-version",
  server_time: "2026-08-23T10:01:00.000Z",
} satisfies FarmHumanFieldHarvestAssistSuccess;

const FARM_GLIMMER_RESULT = {
  subject: { farm_doorplate: FARM_DOORPLATE },
  data: {
    open: true,
    status: "流光原野开放中",
    season: "夏",
    tracks: [
      {
        revealed: true,
        variant: {
          id: "duck_peach",
          name: "蜜桃鸭",
          atlas: "glimmer.variants",
          set: 2,
          sprite_index: 1,
        },
      },
      { revealed: false, variant: null },
    ],
    cooperation: null,
    events: [],
    variants: [],
    encounters: [],
    summary: { encounters: 0, variants: 0, cooperations: 0 },
    achievements: [],
  },
  server_time: "2026-08-24T13:00:00.000Z",
} satisfies FarmHumanGlimmerReadSuccess;

const FARM_TOGETHER_RESULT = {
  subject: { farm_doorplate: FARM_DOORPLATE },
  data: {
    story_id: "river_from_tomorrow",
    title: "河从明天流来",
    round: 1,
    phase: "choice",
    status: "等待第 1/6 次全服选择",
    stage: { index: 1, total: 6, name: "逆流而来的船" },
    art_asset_key: "together.river-from-tomorrow-opening",
    history: [{ kind: "story", title: "逆流而来的船", text: "旧沟里出现了逆流。" }],
    current_task: null,
    current_choice: null,
    cooldown: null,
    ending: null,
    clues: [],
  },
  server_time: "2026-08-24T13:00:00.000Z",
} satisfies FarmHumanTogetherReadSuccess;

const FARM_CATALOG_RESULT = {
  data: {
    farm: { farm_doorplate: FARM_DOORPLATE, farm_name: FARM_NAME },
    shop: {
      status: "unavailable",
      reason: "no_authoritative_data",
      message: "catalog shop is not available in the fake reader",
    },
    backpack: {
      status: "unavailable",
      reason: "no_authoritative_data",
      message: "catalog backpack is not available in the fake reader",
    },
    codex: {
      status: "unavailable",
      reason: "no_authoritative_data",
      message: "catalog codex is not available in the fake reader",
    },
    settings: {
      status: "unavailable",
      reason: "no_authoritative_data",
      message: "catalog settings are not available in the fake reader",
    },
    expedition: {
      status: "unavailable",
      reason: "no_authoritative_data",
      message: "catalog expedition is not available in the fake reader",
    },
    smelting: {
      status: "unavailable",
      reason: "no_authoritative_data",
      message: "catalog smelting is not available in the fake reader",
    },
    bulletin: {
      status: "unavailable",
      reason: "no_authoritative_data",
      message: "catalog bulletin is not available in the fake reader",
    },
    neighborhood: {
      status: "unavailable",
      reason: "no_authoritative_data",
      message: "catalog neighborhood is not available in the fake reader",
    },
    market: {
      status: "unavailable",
      reason: "no_authoritative_data",
      message: "catalog market is not available in the fake reader",
    },
  },
  revision: `farm-catalog-v1:${"a".repeat(64)}`,
  server_time: "2026-08-24T13:00:00.000Z",
} satisfies FarmHumanCatalogReadSuccess;

const FARM_SETTINGS_ACTION_KEY = "519ffb01-49cd-7020-84af-3d04fb1ed03d";
const FARM_SETTINGS_ACTION_RESULT = {
  data: {
    result: {
      receipt_id: FARM_SETTINGS_ACTION_KEY,
      field: "farm_name",
    },
    resource: FARM_CATALOG_RESULT.data,
  },
  revision: `farm-catalog-v1:${"e".repeat(64)}`,
  server_time: "2026-08-24T13:00:00.000Z",
} satisfies FarmHumanFarmSettingsActionSuccess;

const unavailableKitchenSection = () => ({
  status: "unavailable" as const,
  items: [],
  reason: "not_initialized" as const,
});

const FARM_KITCHEN_RESULT = {
  data: {
    farm: { farm_doorplate: FARM_DOORPLATE, farm_name: FARM_NAME },
    balance: {
      silver: { status: "unavailable", value: null, reason: "not_initialized" },
      ranch_coins: { status: "unavailable", value: null, reason: "not_initialized" },
    },
    tools: unavailableKitchenSection(),
    stacked_ingredients: unavailableKitchenSection(),
    product_instances: unavailableKitchenSection(),
    fish_instances: unavailableKitchenSection(),
    treasure_items: unavailableKitchenSection(),
    dish_instances: unavailableKitchenSection(),
    known_recipes: unavailableKitchenSection(),
    daily_shop: {
      status: "unavailable",
      stored_day_index: null,
      current_day_index: 0,
      is_current_day: false,
      refresh_at: "2026-08-25T00:00:00.000Z",
      ingredients: [],
      recipes: [],
      reason: "not_initialized",
    },
  },
  shop_revision: `kitchen-v1:${"a".repeat(64)}`,
  server_time: "2026-08-24T13:00:00.000Z",
} satisfies FarmHumanKitchenReadSuccess;

const FARM_KITCHEN_PURCHASE_KEY = "019ffb01-49cd-7020-84af-3d04fb1ed03d";
const FARM_KITCHEN_PURCHASE_RESULT = {
  data: {
    result: {
      receipt_id: FARM_KITCHEN_PURCHASE_KEY,
      kind: "ingredient",
      item_id: "salt",
      quantity: 2,
      total_price_silver: 20,
      silver_balance: 301,
    },
    resource: FARM_KITCHEN_RESULT.data,
  },
  shop_revision: `kitchen-v1:${"b".repeat(64)}`,
  server_time: "2026-08-24T13:00:00.000Z",
} satisfies FarmHumanKitchenPurchaseSuccess;

const unavailableRanchShopSection = () => ({
  status: "unavailable" as const,
  shop_day: null,
  items: [],
});

const FARM_RANCH_RESULT = {
  data: {
    farm: { farm_doorplate: FARM_DOORPLATE },
    balance: {
      status: "unavailable",
      ranch_coins: null,
      debt_status: "unavailable",
      debt_coins: null,
    },
    residents: { status: "unavailable", animals: [], pets: [], patrol_goose: null },
    collectable: {
      status: "unavailable",
      total_pending_count: null,
      total_pending_meat_count: null,
      entries: [],
    },
    wardrobe: { status: "unavailable", items: [] },
    decorations: { status: "unavailable", placed: [], stored: [] },
    dispatch: { status: "unavailable", active: [] },
    shop: {
      animals: unavailableRanchShopSection(),
      pets: unavailableRanchShopSection(),
      accessories: unavailableRanchShopSection(),
      decorations: unavailableRanchShopSection(),
    },
  },
  revision: "ranch:opaque-version",
  server_time: "2026-08-24T13:00:00.000Z",
} satisfies FarmHumanRanchReadSuccess;

const FARM_RANCH_ACTION_KEY = "119ffb01-49cd-7020-84af-3d04fb1ed03d";
const FARM_RANCH_ACTION_RESULT = {
  data: {
    result: {
      receipt_id: FARM_RANCH_ACTION_KEY,
      action: "rename",
      resident_type: "animal",
      kind_id: "chicken",
      outcome: { kind: "rename", name: "新名字" },
    },
    resource: FARM_RANCH_RESULT.data,
  },
  revision: "ranch-v1:after",
  server_time: "2026-08-24T13:00:00.000Z",
} satisfies FarmHumanRanchResidentActionSuccess;

const FARM_RANCH_COLLECTION_KEY = "619ffb01-49cd-7020-84af-3d04fb1ed03d";
const FARM_RANCH_COLLECTION_RESULT = {
  data: {
    result: {
      receipt_id: FARM_RANCH_COLLECTION_KEY,
      items: [],
      gross_value: 0,
      ranch_coins_gained: 0,
      debt_paid: 0,
      stored_count: 0,
      non_cookable_count: 0,
      non_cookable_gain: 0,
      potion_count: 0,
      detail: {},
      non_cookable_detail: {},
    },
    resource: FARM_RANCH_RESULT.data,
  },
  revision: "ranch-v1:after-collection",
  server_time: "2026-08-24T13:00:00.000Z",
} satisfies FarmHumanRanchCollectionSuccess;

class FakeGroupMembership implements QqGroupMembershipReader {
  readonly members = new Set<string>();
  readonly calls: Array<{ groupId: string; qqNumber: string }> = [];
  unavailable = false;

  async isCurrentMember(groupId: string, qqNumber: string): Promise<boolean> {
    this.calls.push({ groupId, qqNumber });
    if (this.unavailable) {
      throw new OneBotUnavailableError("fake OneBot unavailable");
    }
    return this.members.has(qqNumber);
  }
}

class FakeFarmDirectory implements FarmDirectoryReader {
  readonly calls: string[] = [];
  readonly credentialCalls: string[] = [];
  readonly overviewCalls: string[] = [];
  readonly humanPageCalls: Array<{
    farmHumanKey: string;
    pagePath: string;
    query: string;
  }> = [];
  readonly humanActionCalls: Array<{
    actionPath: string;
    farmHumanKey: string;
    form: string;
  }> = [];
  farmName = FARM_NAME;
  aiName = FARM_AI_NAME;
  credentialDoorplate = FARM_DOORPLATE;
  credentialResult: "found" | "invalid" | "unavailable" | "contract" = "found";
  result: "found" | "missing" | "not_public" | "unavailable" = "found";
  humanPageHtml = `<a href="/api/farm/ui/ranch">牧场</a>`;
  humanRedirectLocation = "/api/farm/ui/ranch?flash=done";
  plots = [
    { plotId: 1, state: "ripe" as const, seedType: "common", watered: 2 },
    { plotId: 2, state: "empty" as const, seedType: null, watered: 0 },
  ];

  async lookupFarm(farmDoorplate: string) {
    this.calls.push(farmDoorplate);
    if (this.result === "missing") {
      throw new FarmNotFoundError(farmDoorplate);
    }
    if (this.result === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm directory unavailable");
    }
    if (this.result === "not_public") {
      throw new FarmNotPubliclyReadableError(farmDoorplate);
    }
    return { farmDoorplate, farmName: this.farmName };
  }

  async lookupFarmByHumanKey(farmHumanKey: string) {
    this.credentialCalls.push(farmHumanKey);
    if (this.credentialResult === "invalid") {
      throw new FarmHumanCredentialInvalidError();
    }
    if (this.credentialResult === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm human credential lookup unavailable");
    }
    if (this.credentialResult === "contract") {
      throw new FarmUpstreamContractUnavailableError("fake farm identity contract unavailable");
    }
    return {
      aiName: this.aiName,
      farmDoorplate: this.credentialDoorplate,
      farmName: this.farmName,
    };
  }

  async readFarmOverview(farmDoorplate: string) {
    this.overviewCalls.push(farmDoorplate);
    if (this.result === "missing") {
      throw new FarmNotFoundError(farmDoorplate);
    }
    if (this.result === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm directory unavailable");
    }
    if (this.result === "not_public") {
      throw new FarmNotPubliclyReadableError(farmDoorplate);
    }
    return {
      farmDoorplate,
      farmName: this.farmName,
      plots: this.plots,
    };
  }

  async readFarmHumanPage(farmHumanKey: string, pagePath: string, query: URLSearchParams) {
    this.humanPageCalls.push({ farmHumanKey, pagePath, query: query.toString() });
    if (this.credentialResult === "invalid") {
      throw new FarmHumanCredentialInvalidError();
    }
    if (this.credentialResult === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm human page unavailable");
    }
    if (this.credentialResult === "contract") {
      throw new FarmUpstreamContractUnavailableError("fake farm page contract unavailable");
    }
    return { html: this.humanPageHtml };
  }

  async submitFarmHumanAction(farmHumanKey: string, actionPath: string, form: URLSearchParams) {
    this.humanActionCalls.push({ farmHumanKey, actionPath, form: form.toString() });
    if (this.credentialResult === "invalid") {
      throw new FarmHumanCredentialInvalidError();
    }
    if (this.credentialResult === "unavailable") {
      throw new FarmDirectoryUnavailableError("fake farm human action unavailable");
    }
    if (this.credentialResult === "contract") {
      throw new FarmUpstreamContractUnavailableError("fake farm action contract unavailable");
    }
    return { location: this.humanRedirectLocation };
  }
}

class FakeFarmHumanReader implements FarmHumanFieldReader {
  readonly fieldCalls: FarmHumanFieldReadInput[] = [];
  readonly harvestCalls: FarmHumanFieldHarvestAssistInput[] = [];
  fieldResult: "found" | "credential" | "missing" | "unavailable" | "contract" = "found";
  harvestResult:
    | "found"
    | "exhausted"
    | "no_ripe"
    | "state_conflict"
    | "idempotency_conflict"
    | "credential"
    | "missing"
    | "unavailable"
    | "contract" = "found";

  async readField(input: FarmHumanFieldReadInput): Promise<FarmHumanFieldReadSuccess> {
    this.fieldCalls.push(input);
    if (this.fieldResult === "credential") {
      throw new FarmHumanFieldCredentialInvalidError();
    }
    if (this.fieldResult === "missing") {
      throw new FarmHumanFieldNotFoundError();
    }
    if (this.fieldResult === "unavailable") {
      throw new FarmHumanFieldUnavailableError();
    }
    if (this.fieldResult === "contract") {
      throw new FarmHumanFieldContractUnavailableError();
    }
    return FARM_FIELD_RESULT;
  }

  async harvestAssist(
    input: FarmHumanFieldHarvestAssistInput,
  ): Promise<FarmHumanFieldHarvestAssistSuccess> {
    this.harvestCalls.push(input);
    switch (this.harvestResult) {
      case "exhausted":
        throw new FarmHumanHarvestAssistExhaustedError("field:current");
      case "no_ripe":
        throw new FarmHumanNoRipePlotsError("field:current");
      case "state_conflict":
        throw new FarmHumanFieldStateConflictError("field:current");
      case "idempotency_conflict":
        throw new FarmHumanFieldIdempotencyConflictError();
      case "credential":
        throw new FarmHumanFieldCredentialInvalidError();
      case "missing":
        throw new FarmHumanFieldNotFoundError();
      case "unavailable":
        throw new FarmHumanFieldUnavailableError();
      case "contract":
        throw new FarmHumanFieldContractUnavailableError();
      default:
        return FARM_HARVEST_ASSIST_RESULT;
    }
  }
}

class FakeFarmLingyeReader implements FarmLingyeReader {
  readonly glimmerCalls: Array<{ farmDoorplate: string; farmHumanKey: string }> = [];
  readonly togetherCalls: Array<{ farmDoorplate: string; farmHumanKey: string }> = [];
  glimmerResult: "found" | "credential" | "missing" | "unavailable" | "contract" = "found";
  togetherResult: "found" | "credential" | "missing" | "unavailable" | "contract" = "found";

  async readGlimmer(input: FarmLingyeReadInput): Promise<FarmHumanGlimmerReadSuccess> {
    this.glimmerCalls.push(input);
    switch (this.glimmerResult) {
      case "credential":
        throw new FarmLingyeCredentialInvalidError();
      case "missing":
        throw new FarmLingyeNotFoundError();
      case "unavailable":
        throw new FarmLingyeUnavailableError();
      case "contract":
        throw new FarmLingyeContractUnavailableError();
      default:
        return FARM_GLIMMER_RESULT;
    }
  }

  async readTogether(input: FarmLingyeReadInput): Promise<FarmHumanTogetherReadSuccess> {
    this.togetherCalls.push(input);
    switch (this.togetherResult) {
      case "credential":
        throw new FarmLingyeCredentialInvalidError();
      case "missing":
        throw new FarmLingyeNotFoundError();
      case "unavailable":
        throw new FarmLingyeUnavailableError();
      case "contract":
        throw new FarmLingyeContractUnavailableError();
      default:
        return FARM_TOGETHER_RESULT;
    }
  }
}

class FakeFarmCatalogReader implements FarmHumanCatalogReader {
  readonly calls: FarmHumanCatalogReadInput[] = [];
  result: "found" | "credential" | "missing" | "unavailable" | "contract" = "found";

  async readCatalog(input: FarmHumanCatalogReadInput): Promise<FarmHumanCatalogReadSuccess> {
    this.calls.push(input);
    switch (this.result) {
      case "credential":
        throw new FarmHumanCatalogCredentialInvalidError();
      case "missing":
        throw new FarmHumanCatalogNotFoundError();
      case "unavailable":
        throw new FarmHumanCatalogUnavailableError();
      case "contract":
        throw new FarmHumanCatalogContractUnavailableError();
      default:
        return FARM_CATALOG_RESULT;
    }
  }
}

class FakeFarmKitchenReader implements FarmHumanKitchenReader {
  readonly calls: FarmHumanKitchenReadInput[] = [];
  result: "found" | "credential" | "missing" | "unavailable" | "contract" = "found";

  async readKitchen(input: FarmHumanKitchenReadInput): Promise<FarmHumanKitchenReadSuccess> {
    this.calls.push(input);
    switch (this.result) {
      case "credential":
        throw new FarmHumanKitchenCredentialInvalidError();
      case "missing":
        throw new FarmHumanKitchenNotFoundError();
      case "unavailable":
        throw new FarmHumanKitchenUnavailableError();
      case "contract":
        throw new FarmHumanKitchenContractUnavailableError();
      default:
        return FARM_KITCHEN_RESULT;
    }
  }
}

class FakeFarmKitchenPurchaser implements FarmHumanKitchenPurchaser {
  readonly calls: FarmHumanKitchenPurchaseInput[] = [];
  result:
    | "found"
    | "credential"
    | "missing"
    | "unavailable"
    | "contract"
    | "shop_changed"
    | "state_conflict"
    | "shop_unavailable"
    | "rejected"
    | "idempotency_conflict" = "found";

  async purchaseKitchen(
    input: FarmHumanKitchenPurchaseInput,
  ): Promise<FarmHumanKitchenPurchaseSuccess> {
    this.calls.push(input);
    switch (this.result) {
      case "credential":
        throw new FarmHumanKitchenPurchaseCredentialInvalidError();
      case "missing":
        throw new FarmHumanKitchenPurchaseNotFoundError();
      case "unavailable":
        throw new FarmHumanKitchenPurchaseUnavailableError();
      case "contract":
        throw new FarmHumanKitchenPurchaseContractUnavailableError();
      case "shop_changed":
        throw new FarmHumanKitchenPurchaseShopChangedError(`kitchen-v1:${"c".repeat(64)}`);
      case "state_conflict":
        throw new FarmHumanKitchenPurchaseStateConflictError(`kitchen-v1:${"d".repeat(64)}`);
      case "shop_unavailable":
        throw new FarmHumanKitchenPurchaseShopUnavailableError();
      case "rejected":
        throw new FarmHumanKitchenPurchaseRejectedError("银币不足");
      case "idempotency_conflict":
        throw new FarmHumanKitchenPurchaseIdempotencyConflictError();
      default:
        return FARM_KITCHEN_PURCHASE_RESULT;
    }
  }
}

class FakeFarmRanchReader implements FarmHumanRanchReader {
  readonly calls: FarmHumanRanchReadInput[] = [];
  result: "found" | "credential" | "missing" | "unavailable" | "contract" = "found";

  async readRanch(input: FarmHumanRanchReadInput): Promise<FarmHumanRanchReadSuccess> {
    this.calls.push(input);
    switch (this.result) {
      case "credential":
        throw new FarmHumanRanchCredentialInvalidError();
      case "missing":
        throw new FarmHumanRanchNotFoundError();
      case "unavailable":
        throw new FarmHumanRanchUnavailableError();
      case "contract":
        throw new FarmHumanRanchContractUnavailableError();
      default:
        return FARM_RANCH_RESULT;
    }
  }
}

class FakeFarmRanchResidentActioner implements FarmHumanRanchResidentActioner {
  readonly calls: FarmHumanRanchResidentActionInput[] = [];
  result:
    | "found"
    | "credential"
    | "missing"
    | "unavailable"
    | "contract"
    | "state_conflict"
    | "rejected"
    | "idempotency_conflict" = "found";

  async executeRanchResidentAction(
    input: FarmHumanRanchResidentActionInput,
  ): Promise<FarmHumanRanchResidentActionSuccess> {
    this.calls.push(input);
    switch (this.result) {
      case "credential":
        throw new FarmHumanRanchResidentActionCredentialInvalidError();
      case "missing":
        throw new FarmHumanRanchResidentActionNotFoundError();
      case "unavailable":
        throw new FarmHumanRanchResidentActionUnavailableError();
      case "contract":
        throw new FarmHumanRanchResidentActionContractUnavailableError();
      case "state_conflict":
        throw new FarmHumanRanchResidentActionStateConflictError("ranch-v1:current");
      case "rejected":
        throw new FarmHumanRanchResidentActionRejectedError("这只动物正在派遣");
      case "idempotency_conflict":
        throw new FarmHumanRanchResidentActionIdempotencyConflictError();
      default:
        return FARM_RANCH_ACTION_RESULT;
    }
  }
}

class FakeFarmRanchCollector implements FarmHumanRanchCollector {
  readonly calls: FarmHumanRanchCollectionInput[] = [];
  result:
    | "found"
    | "credential"
    | "missing"
    | "unavailable"
    | "contract"
    | "state_conflict"
    | "no_collectable"
    | "rejected"
    | "idempotency_conflict" = "found";

  async collectRanch(
    input: FarmHumanRanchCollectionInput,
  ): Promise<FarmHumanRanchCollectionSuccess> {
    this.calls.push(input);
    switch (this.result) {
      case "credential":
        throw new FarmHumanRanchCollectionCredentialInvalidError();
      case "missing":
        throw new FarmHumanRanchCollectionNotFoundError();
      case "unavailable":
        throw new FarmHumanRanchCollectionUnavailableError();
      case "contract":
        throw new FarmHumanRanchCollectionContractUnavailableError();
      case "state_conflict":
        throw new FarmHumanRanchCollectionStateConflictError("ranch-v1:current");
      case "no_collectable":
        throw new FarmHumanRanchCollectionNoCollectableError("ranch-v1:current");
      case "rejected":
        throw new FarmHumanRanchCollectionRejectedError("牧场拒绝收取");
      case "idempotency_conflict":
        throw new FarmHumanRanchCollectionIdempotencyConflictError();
      default:
        return FARM_RANCH_COLLECTION_RESULT;
    }
  }
}

class FakeFarmSettingsActioner implements FarmHumanFarmSettingsActioner {
  readonly calls: FarmHumanFarmSettingsActionInput[] = [];
  result:
    | "found"
    | "credential"
    | "missing"
    | "unavailable"
    | "contract"
    | "state_conflict"
    | "rejected"
    | "idempotency_conflict" = "found";

  async updateFarmSettings(
    input: FarmHumanFarmSettingsActionInput,
  ): Promise<FarmHumanFarmSettingsActionSuccess> {
    this.calls.push(input);
    switch (this.result) {
      case "credential":
        throw new FarmHumanFarmSettingsActionCredentialInvalidError();
      case "missing":
        throw new FarmHumanFarmSettingsActionNotFoundError();
      case "unavailable":
        throw new FarmHumanFarmSettingsActionUnavailableError();
      case "contract":
        throw new FarmHumanFarmSettingsActionContractUnavailableError();
      case "state_conflict":
        throw new FarmHumanFarmSettingsActionStateConflictError("farm-catalog-v1:current");
      case "rejected":
        throw new FarmHumanFarmSettingsActionRejectedError("设置值不符合农场规则");
      case "idempotency_conflict":
        throw new FarmHumanFarmSettingsActionIdempotencyConflictError();
      default:
        return FARM_SETTINGS_ACTION_RESULT;
    }
  }
}

class FakeFarmCreator implements FarmCreator {
  readonly calls: FarmCreationInput[] = [];
  unavailableOnce = false;

  async createFarm(input: FarmCreationInput) {
    this.calls.push(input);
    if (this.unavailableOnce) {
      this.unavailableOnce = false;
      throw new FarmCreationUnavailableError();
    }
    return {
      creation_id: input.creationId,
      created: this.calls.length === 1,
      farm_doorplate: FARM_DOORPLATE,
      farm_name: CREATE_FARM_REGISTRATION_PAYLOAD.farm_name,
      ai_name: FARM_AI_NAME,
      human_name: CREATE_FARM_REGISTRATION_PAYLOAD.resident_name,
      farm_human_key: FARM_HUMAN_KEY,
      created_at: "2026-08-14T00:00:00.000Z",
    };
  }
}

interface AuthHarness {
  app: ReturnType<typeof buildApp>;
  database: CommunityDatabase;
  databasePath: string;
  directory: string;
  membership: FakeGroupMembership;
  farmDirectory: FakeFarmDirectory;
  farmHumanReader: FakeFarmHumanReader;
  farmCatalogReader: FakeFarmCatalogReader;
  farmKitchenReader: FakeFarmKitchenReader;
  farmKitchenPurchaser: FakeFarmKitchenPurchaser;
  farmRanchReader: FakeFarmRanchReader;
  farmRanchResidentActioner: FakeFarmRanchResidentActioner;
  farmRanchCollector: FakeFarmRanchCollector;
  farmSettingsActioner: FakeFarmSettingsActioner;
  farmLingyeReader: FakeFarmLingyeReader;
  farmCreator: FakeFarmCreator;
  now: { value: number };
  revokedResidentIds: string[];
  close(): Promise<void>;
}

function createHarness(secureCookies = false): AuthHarness {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-auth-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const now = { value: Date.UTC(2026, 7, 1, 0, 0, 0) };
  let sessionNumber = 0;
  const database = new CommunityDatabase(databasePath, {
    generateRegistrationCode: () => CURRENT_CODE,
    generateSessionToken: () => {
      sessionNumber += 1;
      return `opaque-session-token-${sessionNumber}`;
    },
    generateAccountId: () => "a60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    generateResidentId: () => "b60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    generateHomeId: () => "c60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    generateFarmCreationId: () => "019ffb01-49cd-7020-84af-3d04fb1ed03d",
  });
  const membership = new FakeGroupMembership();
  const farmDirectory = new FakeFarmDirectory();
  const farmHumanReader = new FakeFarmHumanReader();
  const farmCatalogReader = new FakeFarmCatalogReader();
  const farmKitchenReader = new FakeFarmKitchenReader();
  const farmKitchenPurchaser = new FakeFarmKitchenPurchaser();
  const farmRanchReader = new FakeFarmRanchReader();
  const farmRanchResidentActioner = new FakeFarmRanchResidentActioner();
  const farmRanchCollector = new FakeFarmRanchCollector();
  const farmSettingsActioner = new FakeFarmSettingsActioner();
  const farmLingyeReader = new FakeFarmLingyeReader();
  const farmCreator = new FakeFarmCreator();
  const revokedResidentIds: string[] = [];
  const registrationAuth = new RegistrationAuthService({
    database,
    farmDirectory,
    farmCreator,
    farmHumanReader,
    farmCatalogReader,
    farmKitchenReader,
    farmKitchenPurchaser,
    farmRanchReader,
    farmRanchResidentActioner,
    farmRanchCollector,
    farmSettingsActioner,
    farmLingyeReader,
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    farmHumanUiBaseUrl: FARM_HUMAN_UI_BASE_URL,
    now: () => now.value,
    onMembershipRevoked: (residentId) => revokedResidentIds.push(residentId),
  });
  const mailboxService = new MailboxService({ database, now: () => now.value });
  const app = buildApp({
    groupId: COMMUNITY_QQ_GROUP_ID,
    groupMembership: membership,
    registrationAuth,
    mailboxService,
    secureCookies,
    logger: false,
  });
  return {
    app,
    database,
    databasePath,
    directory,
    farmDirectory,
    farmHumanReader,
    farmCatalogReader,
    farmKitchenReader,
    farmKitchenPurchaser,
    farmRanchReader,
    farmRanchResidentActioner,
    farmRanchCollector,
    farmSettingsActioner,
    farmLingyeReader,
    farmCreator,
    membership,
    now,
    revokedResidentIds,
    async close() {
      await app.close();
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers["set-cookie"];
  assert.ok(typeof value === "string");
  return value.split(";", 1)[0] ?? "";
}

function queryScalar(databasePath: string, sql: string): unknown {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database.prepare(sql).get() as { value: unknown };
    return row.value;
  } finally {
    database.close();
  }
}

test("current code and current group member create an account and opaque browser session", async () => {
  const harness = createHarness(true);
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);

    const first = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    assert.equal(first.statusCode, 200);
    const firstBody = humanSessionSuccessSchema.parse(first.json());
    assert.equal(firstBody.account_created, true);
    assert.equal(firstBody.account.qq_number, QQ_NUMBER);
    assert.equal(firstBody.account.membership_status, "active");
    assert.deepEqual(firstBody.resident, {
      resident_id: "b60a5f78-9e87-4bc4-a06f-50df4e23d42d",
      resident_name: RESIDENT_DISPLAY_NAME,
    });
    assert.deepEqual(firstBody.home, {
      home_id: "c60a5f78-9e87-4bc4-a06f-50df4e23d42d",
      home_name: HOME_NAME,
    });
    assert.deepEqual(firstBody.farm_binding, { farm_doorplate: FARM_DOORPLATE });
    assert.deepEqual(harness.farmDirectory.credentialCalls, [FARM_HUMAN_KEY]);
    assert.deepEqual(harness.membership.calls, [
      { groupId: COMMUNITY_QQ_GROUP_ID, qqNumber: QQ_NUMBER },
    ]);

    const setCookie = first.headers["set-cookie"];
    assert.ok(typeof setCookie === "string");
    assert.match(setCookie, /^doorbell_session=opaque-session-token-1;/);
    assert.match(setCookie, /; HttpOnly/);
    assert.match(setCookie, /; SameSite=Lax/);
    assert.match(setCookie, /; Path=\/api(?:;|$)/);
    assert.doesNotMatch(setCookie, /; Path=\/(?:;|$)/);
    assert.match(setCookie, /; Secure/);
    assert.doesNotMatch(setCookie, /Max-Age/i);
    assert.doesNotMatch(setCookie, /Expires=/i);

    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      1,
    );
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM residents"), 1);
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM homes"), 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM mailbox_letters"),
      1,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT farm_human_key AS value FROM farm_bindings LIMIT 1",
      ),
      FARM_HUMAN_KEY,
    );
    assert.doesNotMatch(first.body, new RegExp(FARM_HUMAN_KEY));
    assert.equal(
      queryScalar(harness.databasePath, "SELECT resident_name AS value FROM residents"),
      RESIDENT_DISPLAY_NAME,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT home_name AS value FROM homes"),
      HOME_NAME,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT membership_status AS value FROM human_accounts LIMIT 1",
      ),
      "active",
    );
    assert.equal(statSync(harness.databasePath).mode & 0o777, 0o600);
    const storedHash = queryScalar(
      harness.databasePath,
      "SELECT token_hash AS value FROM human_sessions LIMIT 1",
    );
    assert.equal(typeof storedHash, "string");
    assert.notEqual(storedHash, "opaque-session-token-1");
    assert.doesNotMatch(
      readFileSync(harness.databasePath).toString("latin1"),
      /opaque-session-token/,
    );
    const storedPasswordCredential = queryScalar(
      harness.databasePath,
      "SELECT password_credential AS value FROM human_accounts LIMIT 1",
    );
    assert.equal(typeof storedPasswordCredential, "string");
    assert.match(String(storedPasswordCredential), /^scrypt-v1\$/);
    assert.equal(await verifyHumanPassword(PASSWORD, String(storedPasswordCredential)), true);
    assert.doesNotMatch(
      readFileSync(harness.databasePath).toString("latin1"),
      new RegExp(PASSWORD),
    );

    const returning = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(returning.statusCode, 200);
    const returningBody = humanSessionSuccessSchema.parse(returning.json());
    assert.equal(returningBody.account_created, false);
    assert.equal(returningBody.account.account_id, firstBody.account.account_id);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM mailbox_letters"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      2,
    );
  } finally {
    await harness.close();
  }
});

test("password failures from different IPs share one QQ lock and recover after 30 minutes", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const registered = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(registered.statusCode, 200);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const failed = await harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        headers: { "x-forwarded-for": attempt < 5 ? "198.51.100.10" : "203.0.113.20" },
        payload: { qq_number: QQ_NUMBER, password: "wrong password" },
      });
      assert.equal(failed.statusCode, 401);
      assert.deepEqual(humanAuthenticationErrorSchema.parse(failed.json()), {
        error: {
          code: "invalid_credentials",
          message: "The QQ number or password is incorrect",
        },
      });
    }

    const lockedCorrectPassword = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(lockedCorrectPassword.statusCode, 401);
    assert.deepEqual(humanAuthenticationErrorSchema.parse(lockedCorrectPassword.json()), {
      error: {
        code: "invalid_credentials",
        message: "The QQ number or password is incorrect",
      },
    });

    harness.now.value += 30 * MINUTE_MS;
    const recovered = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(recovered.statusCode, 200);
  } finally {
    await harness.close();
  }
});

test("password failure window resets after 15 minutes and a successful login clears prior failures", async () => {
  const harness = createHarness();
  const failNineTimes = async () => {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const failed = await harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: { qq_number: QQ_NUMBER, password: "wrong password" },
      });
      assert.equal(failed.statusCode, 401);
    }
  };
  try {
    harness.membership.members.add(QQ_NUMBER);
    assert.equal(
      (
        await harness.app.inject({
          method: "POST",
          url: "/api/auth/session",
          payload: FULL_REGISTRATION_PAYLOAD,
        })
      ).statusCode,
      200,
    );

    await failNineTimes();
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_failures"),
      9,
    );
    const clearingSuccess = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(clearingSuccess.statusCode, 200);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_failures"),
      0,
    );

    await failNineTimes();
    harness.now.value += 15 * MINUTE_MS + 1;
    assert.equal(
      (
        await harness.app.inject({
          method: "POST",
          url: "/api/auth/session",
          payload: { qq_number: QQ_NUMBER, password: "wrong password" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_failures"),
      1,
    );
    for (let attempt = 0; attempt < 8; attempt += 1) {
      assert.equal(
        (
          await harness.app.inject({
            method: "POST",
            url: "/api/auth/session",
            payload: { qq_number: QQ_NUMBER, password: "wrong password" },
          })
        ).statusCode,
        401,
      );
    }
    const afterNewWindow = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(afterNewWindow.statusCode, 200);
  } finally {
    await harness.close();
  }
});

test("unknown QQ login keeps dummy password work without persisting login-security garbage", async () => {
  const harness = createHarness();
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const failed = await harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: { qq_number: "1000000000", password: "wrong password" },
      });
      assert.equal(failed.statusCode, 401);
      assert.equal(
        humanAuthenticationErrorSchema.parse(failed.json()).error.code,
        "invalid_credentials",
      );
    }
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      0,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_failures"),
      0,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_login_locks"),
      0,
    );
  } finally {
    await harness.close();
  }
});

test("welcome-letter conflicts cannot turn an already-created returning session into a failed login", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    assert.equal(
      (
        await harness.app.inject({
          method: "POST",
          url: "/api/auth/session",
          payload: FULL_REGISTRATION_PAYLOAD,
        })
      ).statusCode,
      200,
    );
    const inspection = new Database(harness.databasePath);
    try {
      inspection
        .prepare("UPDATE mailbox_letters SET body = ? WHERE idempotency_key = ?")
        .run("旧版本欢迎信正文", `system:welcome:c60a5f78-9e87-4bc4-a06f-50df4e23d42d`);
    } finally {
      inspection.close();
    }

    const returning = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(returning.statusCode, 200);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      2,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT body AS value FROM mailbox_letters WHERE idempotency_key = 'system:welcome:c60a5f78-9e87-4bc4-a06f-50df4e23d42d'",
      ),
      "旧版本欢迎信正文",
    );
  } finally {
    await harness.close();
  }
});

test("qualified first registration creates and binds one authoritative farm with one-time Human URL delivery", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);

    const response = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    const body = createdFarmHumanSessionSuccessSchema.parse(response.json());
    assert.equal(body.account_created, true);
    assert.equal(body.resident.resident_name, `辛玥 & ${FARM_AI_NAME}`);
    assert.equal(body.farm_binding.farm_doorplate, FARM_DOORPLATE);
    assert.deepEqual(body.created_farm, {
      farm_doorplate: FARM_DOORPLATE,
      farm_name: CREATE_FARM_REGISTRATION_PAYLOAD.farm_name,
      ai_name: FARM_AI_NAME,
      farm_human_url: FARM_HUMAN_URL,
    });
    assert.equal("farm_human_key" in body.created_farm, false);
    assert.equal("agent_key" in body.created_farm, false);
    assert.equal("token" in body.created_farm, false);
    assert.equal(harness.farmCreator.calls.length, 1);
    assert.equal(harness.farmCreator.calls[0]?.creationId, "019ffb01-49cd-7020-84af-3d04fb1ed03d");
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT farm_human_key AS value FROM farm_bindings LIMIT 1",
      ),
      FARM_HUMAN_KEY,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT farm_human_key AS value FROM farm_creation_requests LIMIT 1",
      ),
      null,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM farm_creation_requests WHERE completed_at IS NOT NULL",
      ),
      1,
    );

    const current = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie: cookieFrom(response) },
    });
    assert.equal(current.statusCode, 200);
    assert.equal("created_farm" in current.json(), false);
    assert.doesNotMatch(current.body, /farm_human_url|private-farm-human-key/);

    const replay = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(replay.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(replay.json()).error.code,
      "account_already_registered",
    );
    assert.doesNotMatch(replay.body, /farm_human_url|private-farm-human-key/);
    assert.equal(harness.farmCreator.calls.length, 1);
  } finally {
    await harness.close();
  }
});

test("farm creation persists one stable ID before upstream and recovers the same attempt", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);

    const notMember = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(notMember.statusCode, 403);
    assert.equal(harness.farmCreator.calls.length, 0);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_creation_requests"),
      0,
    );

    harness.membership.members.add(QQ_NUMBER);
    harness.farmCreator.unavailableOnce = true;
    const lostResponse = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(lostResponse.statusCode, 503);
    assert.equal(
      humanAuthenticationErrorSchema.parse(lostResponse.json()).error.code,
      "farm_creation_unavailable",
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_creation_requests"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      0,
    );

    const conflictingRetry = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...CREATE_FARM_REGISTRATION_PAYLOAD, farm_name: "另一座农场" },
    });
    assert.equal(conflictingRetry.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(conflictingRetry.json()).error.code,
      "farm_creation_conflict",
    );
    assert.equal(harness.farmCreator.calls.length, 1);

    const recovered = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: CREATE_FARM_REGISTRATION_PAYLOAD,
    });
    assert.equal(recovered.statusCode, 200);
    assert.equal(harness.farmCreator.calls.length, 2);
    assert.equal(
      harness.farmCreator.calls[0]?.creationId,
      harness.farmCreator.calls[1]?.creationId,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
  } finally {
    await harness.close();
  }
});

test("concurrent create submissions share one creation ID and produce one Doorbell identity", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    const responses = await Promise.all([
      harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: CREATE_FARM_REGISTRATION_PAYLOAD,
      }),
      harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: CREATE_FARM_REGISTRATION_PAYLOAD,
      }),
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 409]);
    assert.equal(new Set(harness.farmCreator.calls.map((call) => call.creationId)).size, 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM residents"), 1);
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM homes"), 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
  } finally {
    await harness.close();
  }
});

test("trusted farm Human URL child paths and query fragments still bind only the extracted key", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    const submittedUrl = `${FARM_HUMAN_URL}/together?view=human#current`;
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, farm_human_url: submittedUrl },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(harness.farmDirectory.credentialCalls, [FARM_HUMAN_KEY]);
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT farm_human_key AS value FROM farm_bindings LIMIT 1",
      ),
      FARM_HUMAN_KEY,
    );
    assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
    assert.doesNotMatch(response.body, /farm\.example/);
  } finally {
    await harness.close();
  }
});

test("invalid farm Human URLs are rejected before any farm request or identity write", async () => {
  const harness = createHarness();
  const invalidUrls = [
    "",
    "not-a-url",
    `ftp://farm.example/farm/ui/${FARM_HUMAN_KEY}`,
    `https://other.example/farm/ui/${FARM_HUMAN_KEY}`,
    `https://farm.example/other/ui/${FARM_HUMAN_KEY}`,
    "https://farm.example/farm/ui/",
    `https://user@farm.example/farm/ui/${FARM_HUMAN_KEY}`,
    "https://farm.example/farm/ui/key%2Fwith-slash",
    `https://farm.example\\farm\\ui\\${FARM_HUMAN_KEY}`,
  ];
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    for (const farmHumanUrl of invalidUrls) {
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: { ...FULL_REGISTRATION_PAYLOAD, farm_human_url: farmHumanUrl },
      });
      assert.equal(response.statusCode, 400);
      assert.equal(
        humanAuthenticationErrorSchema.parse(response.json()).error.code,
        "invalid_farm_human_url",
      );
      assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
      assert.doesNotMatch(response.body, /other\.example|user@/);
    }

    const legacyBareKey = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: {
        ...FULL_REGISTRATION_PAYLOAD,
        farm_human_url: undefined,
        farm_human_key: FARM_HUMAN_KEY,
      },
    });
    assert.equal(legacyBareKey.statusCode, 400);
    assert.equal(
      humanAuthenticationErrorSchema.parse(legacyBareKey.json()).error.code,
      "invalid_request",
    );
    assert.deepEqual(harness.farmDirectory.credentialCalls, []);
    for (const table of [
      "human_accounts",
      "human_sessions",
      "residents",
      "homes",
      "farm_bindings",
    ]) {
      assert.equal(queryScalar(harness.databasePath, `SELECT COUNT(*) AS value FROM ${table}`), 0);
    }
  } finally {
    await harness.close();
  }
});

test("human and home names keep their submitted text while resident display adds the farm AI", async () => {
  const harness = createHarness();
  const longResidentName = `  ${"居民".repeat(3000)}  `;
  const longHomeName = `\n${"家园".repeat(3000)}\t`;
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: {
        ...FULL_REGISTRATION_PAYLOAD,
        resident_name: longResidentName,
        home_name: longHomeName,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = humanSessionSuccessSchema.parse(response.json());
    const combinedResidentName = `${longResidentName} & ${FARM_AI_NAME}`;
    assert.equal(body.resident.resident_name, combinedResidentName);
    assert.equal(body.home.home_name, longHomeName);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT resident_name AS value FROM residents"),
      combinedResidentName,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT home_name AS value FROM homes"),
      longHomeName,
    );
  } finally {
    await harness.close();
  }
});

test("registration rejects malformed input, other codes, non-members, and OneBot failures distinctly", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);

    const invalidRequest = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: CURRENT_CODE, extra: true },
    });
    assert.equal(invalidRequest.statusCode, 400);
    assert.equal(
      humanAuthenticationErrorSchema.parse(invalidRequest.json()).error.code,
      "invalid_request",
    );

    const partialProfile = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: {
        qq_number: QQ_NUMBER,
        registration_code: CURRENT_CODE,
        resident_name: RESIDENT_NAME,
      },
    });
    assert.equal(partialProfile.statusCode, 400);
    assert.equal(
      humanAuthenticationErrorSchema.parse(partialProfile.json()).error.code,
      "invalid_request",
    );

    const whitespaceName = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, home_name: " \n\t " },
    });
    assert.equal(whitespaceName.statusCode, 400);
    assert.equal(
      humanAuthenticationErrorSchema.parse(whitespaceName.json()).error.code,
      "invalid_request",
    );
    assert.equal(harness.membership.calls.length, 0);
    assert.equal(harness.farmDirectory.calls.length, 0);
    assert.equal(harness.farmDirectory.credentialCalls.length, 0);

    const invalidCode = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: OTHER_CODE },
    });
    assert.equal(invalidCode.statusCode, 403);
    assert.equal(
      humanAuthenticationErrorSchema.parse(invalidCode.json()).error.code,
      "invalid_registration_code",
    );
    assert.equal(harness.membership.calls.length, 0);

    harness.membership.members.clear();
    const notMember = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: CURRENT_CODE },
    });
    assert.equal(notMember.statusCode, 403);
    assert.equal(
      humanAuthenticationErrorSchema.parse(notMember.json()).error.code,
      "qq_not_group_member",
    );

    harness.membership.unavailable = true;
    const unavailable = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, registration_code: CURRENT_CODE },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(
      humanAuthenticationErrorSchema.parse(unavailable.json()).error.code,
      "onebot_unavailable",
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      0,
    );
  } finally {
    await harness.close();
  }
});

test("farm credential failures, mismatched doorplates, and changed confirmation create no rows", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);

    harness.farmDirectory.credentialResult = "invalid";
    const invalidKey = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(invalidKey.statusCode, 403);
    assert.equal(
      humanAuthenticationErrorSchema.parse(invalidKey.json()).error.code,
      "invalid_farm_human_key",
    );
    assert.doesNotMatch(invalidKey.body, new RegExp(FARM_HUMAN_KEY));

    harness.farmDirectory.credentialResult = "unavailable";
    const unavailable = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(
      humanAuthenticationErrorSchema.parse(unavailable.json()).error.code,
      "farm_unavailable",
    );

    harness.farmDirectory.credentialResult = "contract";
    const contractUnavailable = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(contractUnavailable.statusCode, 502);
    assert.equal(
      humanAuthenticationErrorSchema.parse(contractUnavailable.json()).error.code,
      "upstream_contract_unavailable",
    );

    harness.farmDirectory.credentialResult = "found";
    harness.farmDirectory.credentialDoorplate = "ABC234";
    const wrongDoorplate = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(wrongDoorplate.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(wrongDoorplate.json()).error.code,
      "farm_human_key_mismatch",
    );

    const unknownDoorplate = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, farm_doorplate: "ZZZZZZ" },
    });
    assert.equal(unknownDoorplate.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(unknownDoorplate.json()).error.code,
      "farm_human_key_mismatch",
    );

    harness.farmDirectory.credentialDoorplate = FARM_DOORPLATE;
    harness.farmDirectory.farmName = "已经改名的农场";
    const changed = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(changed.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(changed.json()).error.code,
      "farm_confirmation_mismatch",
    );

    for (const table of [
      "human_accounts",
      "human_sessions",
      "residents",
      "homes",
      "farm_bindings",
    ]) {
      assert.equal(queryScalar(harness.databasePath, `SELECT COUNT(*) AS value FROM ${table}`), 0);
    }
    assert.deepEqual(harness.farmDirectory.credentialCalls, [
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
      FARM_HUMAN_KEY,
    ]);
  } finally {
    await harness.close();
  }
});

test("existing registration rejects registration-code replay and accepts only the saved password", async () => {
  const harness = createHarness();
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);

    const first = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(first.statusCode, 200);

    const exactReplay = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(exactReplay.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(exactReplay.json()).error.code,
      "account_already_registered",
    );

    const wrongPassword = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: "wrong password" },
    });
    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(
      humanAuthenticationErrorSchema.parse(wrongPassword.json()).error.code,
      "invalid_credentials",
    );

    const returning = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(returning.statusCode, 200);
    assert.equal(humanSessionSuccessSchema.parse(returning.json()).account_created, false);

    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM residents"), 1);
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM homes"), 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM farm_bindings"),
      1,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      2,
    );
  } finally {
    await harness.close();
  }
});

test("one farm doorplate cannot be bound to a second human account", async () => {
  const harness = createHarness();
  const secondQqNumber = "12345678";
  try {
    harness.database.getCurrentRegistrationCode(harness.now.value);
    harness.membership.members.add(QQ_NUMBER);
    harness.membership.members.add(secondQqNumber);

    const first = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    assert.equal(first.statusCode, 200);

    const duplicate = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: {
        ...FULL_REGISTRATION_PAYLOAD,
        qq_number: secondQqNumber,
        resident_name: "另一台小机",
        home_name: "另一座家",
      },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(
      humanAuthenticationErrorSchema.parse(duplicate.json()).error.code,
      "farm_already_bound",
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      1,
    );
    assert.equal(queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM residents"), 1);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      1,
    );
  } finally {
    await harness.close();
  }
});

test("eligibility query cannot bypass the registration code or create a session", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/registration/qq-group-eligibility",
      payload: { qq_number: QQ_NUMBER },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["set-cookie"], undefined);
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_accounts"),
      0,
    );
    assert.equal(
      queryScalar(harness.databasePath, "SELECT COUNT(*) AS value FROM human_sessions"),
      0,
    );
  } finally {
    await harness.close();
  }
});

test("GET session preserves state on outage and confirmed departure revokes every account session", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const secondCreated = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    const secondCookie = cookieFrom(secondCreated);

    const current = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(current.statusCode, 200);
    const currentBody = currentHumanSessionSuccessSchema.parse(current.json());
    assert.equal(currentBody.account.qq_number, QQ_NUMBER);
    assert.equal(currentBody.resident.resident_name, RESIDENT_DISPLAY_NAME);
    assert.equal(currentBody.home.home_name, HOME_NAME);
    assert.equal(currentBody.farm_binding.farm_doorplate, FARM_DOORPLATE);
    assert.doesNotMatch(current.body, new RegExp(FARM_HUMAN_KEY));
    assert.equal(harness.membership.calls.length, 3);

    harness.membership.unavailable = true;
    const unavailable = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(
      humanAuthenticationErrorSchema.parse(unavailable.json()).error.code,
      "onebot_unavailable",
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT membership_status AS value FROM human_accounts LIMIT 1",
      ),
      "active",
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM human_sessions WHERE revoked_at IS NULL",
      ),
      2,
    );

    harness.membership.unavailable = false;
    const afterOutage = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(afterOutage.statusCode, 200);

    harness.membership.members.clear();
    harness.database.replaceConnectorCredential(
      currentBody.resident.resident_id,
      "connector-credential-before-departure",
      "a".repeat(64),
      harness.now.value,
    );
    harness.database.replaceFirstActiveBellCredential(
      "bell-credential-before-departure",
      "b".repeat(64),
      harness.now.value,
    );
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(
      humanAuthenticationErrorSchema.parse(departed.json()).error.code,
      "qq_not_group_member",
    );
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT membership_status AS value FROM human_accounts LIMIT 1",
      ),
      "inactive",
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM human_sessions WHERE revoked_at IS NULL",
      ),
      0,
    );
    assert.deepEqual(harness.revokedResidentIds, [currentBody.resident.resident_id]);
    assert.equal(
      harness.database.getConnectorBindingState(currentBody.resident.resident_id).configured,
      false,
    );
    assert.equal(
      harness.database.getBellBindingState(currentBody.resident.resident_id).configured,
      false,
    );

    harness.membership.members.add(QQ_NUMBER);
    const afterDeparture = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie: secondCookie },
    });
    assert.equal(afterDeparture.statusCode, 401);
    assert.equal(
      humanAuthenticationErrorSchema.parse(afterDeparture.json()).error.code,
      "authentication_required",
    );

    const restored = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(restored.statusCode, 200);
    assert.equal(
      humanSessionSuccessSchema.parse(restored.json()).account.membership_status,
      "active",
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT membership_inactive_at AS value FROM human_accounts LIMIT 1",
      ),
      null,
    );
  } finally {
    await harness.close();
  }
});

test("bound farm field derives both private credentials from the authenticated binding", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);

    const response = await harness.app.inject({
      method: "GET",
      url: "/api/farm/field",
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(boundFarmFieldSuccessSchema.parse(response.json()), FARM_FIELD_RESULT);
    assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmHumanReader.fieldCalls, [
      { farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY },
    ]);

    const overrideAttempt = await harness.app.inject({
      method: "GET",
      url: "/api/farm/field?farm_doorplate=ZZZZZZ",
      headers: { cookie },
    });
    assert.equal(overrideAttempt.statusCode, 400);
    assert.equal(overrideAttempt.headers["cache-control"], "no-store");
    assert.equal(
      boundFarmFieldErrorSchema.parse(overrideAttempt.json()).error.code,
      "invalid_request",
    );
    assert.equal(harness.farmHumanReader.fieldCalls.length, 1);
  } finally {
    await harness.close();
  }
});

test("bound farm field maps authentication, membership, and upstream failures without fallback", async () => {
  const harness = createHarness();
  try {
    const unauthenticated = await harness.app.inject({
      method: "GET",
      url: "/api/farm/field",
    });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      boundFarmFieldErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);

    harness.membership.unavailable = true;
    const oneBotUnavailable = await harness.app.inject({
      method: "GET",
      url: "/api/farm/field",
      headers: { cookie },
    });
    assert.equal(oneBotUnavailable.statusCode, 503);
    assert.equal(
      boundFarmFieldErrorSchema.parse(oneBotUnavailable.json()).error.code,
      "onebot_unavailable",
    );
    assert.equal(harness.farmHumanReader.fieldCalls.length, 0);

    harness.membership.unavailable = false;
    const cases = [
      ["credential", 409, "farm_credential_invalid"],
      ["missing", 404, "farm_not_found"],
      ["contract", 502, "upstream_contract_unavailable"],
      ["unavailable", 503, "farm_unavailable"],
    ] as const;
    for (const [fieldResult, statusCode, errorCode] of cases) {
      harness.farmHumanReader.fieldResult = fieldResult;
      const response = await harness.app.inject({
        method: "GET",
        url: "/api/farm/field",
        headers: { cookie },
      });
      assert.equal(response.statusCode, statusCode);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(boundFarmFieldErrorSchema.parse(response.json()).error.code, errorCode);
    }

    const fieldCallsBeforeDeparture = harness.farmHumanReader.fieldCalls.length;
    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/farm/field",
      headers: { cookie },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(
      boundFarmFieldErrorSchema.parse(departed.json()).error.code,
      "qq_not_group_member",
    );
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
    assert.equal(harness.farmHumanReader.fieldCalls.length, fieldCallsBeforeDeparture);
  } finally {
    await harness.close();
  }
});

test("bound farm harvest assist derives the binding and field revision without a plot selector", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const idempotencyKey = "019ffb01-49cd-7020-84af-3d04fb1ed03d";

    const response = await harness.app.inject({
      method: "POST",
      url: "/api/farm/field/harvest-assists",
      headers: {
        cookie,
        "idempotency-key": idempotencyKey,
        "if-match": '"field:opaque-version"',
      },
      payload: {},
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(
      boundFarmHarvestAssistSuccessSchema.parse(response.json()),
      FARM_HARVEST_ASSIST_RESULT,
    );
    assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmHumanReader.harvestCalls, [
      {
        farmDoorplate: FARM_DOORPLATE,
        farmHumanKey: FARM_HUMAN_KEY,
        expectedRevision: "field:opaque-version",
        idempotencyKey,
      },
    ]);

    const plotBody = await harness.app.inject({
      method: "POST",
      url: "/api/farm/field/harvest-assists",
      headers: {
        cookie,
        "idempotency-key": "019ffb01-49cd-7020-84af-3d04fb1ed03e",
        "if-match": "field:opaque-version",
      },
      payload: { plot_id: 1 },
    });
    assert.equal(plotBody.statusCode, 400);
    assert.equal(
      boundFarmHarvestAssistErrorSchema.parse(plotBody.json()).error.code,
      "invalid_request",
    );
    assert.equal(harness.farmHumanReader.harvestCalls.length, 1);

    const missingRevision = await harness.app.inject({
      method: "POST",
      url: "/api/farm/field/harvest-assists",
      headers: {
        cookie,
        "idempotency-key": "019ffb01-49cd-7020-84af-3d04fb1ed03f",
      },
      payload: {},
    });
    assert.equal(missingRevision.statusCode, 400);
    assert.equal(
      boundFarmHarvestAssistErrorSchema.parse(missingRevision.json()).error.code,
      "invalid_request",
    );
    assert.equal(harness.farmHumanReader.harvestCalls.length, 1);
  } finally {
    await harness.close();
  }
});

test("bound farm harvest assist maps business, binding, and availability failures", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const cases = [
      ["exhausted", 409, "harvest_assist_exhausted", "field:current"],
      ["no_ripe", 409, "no_ripe_plots", "field:current"],
      ["state_conflict", 409, "state_conflict", "field:current"],
      ["idempotency_conflict", 409, "idempotency_conflict", undefined],
      ["credential", 409, "farm_credential_invalid", undefined],
      ["missing", 404, "farm_not_found", undefined],
      ["contract", 502, "upstream_contract_unavailable", undefined],
      ["unavailable", 503, "farm_unavailable", undefined],
    ] as const;

    for (const [result, statusCode, errorCode, currentRevision] of cases) {
      harness.farmHumanReader.harvestResult = result;
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/farm/field/harvest-assists",
        headers: {
          cookie,
          "idempotency-key": "019ffb01-49cd-7020-84af-3d04fb1ed04e",
          "if-match": "field:opaque-version",
        },
        payload: {},
      });
      assert.equal(response.statusCode, statusCode);
      assert.equal(response.headers["cache-control"], "no-store");
      const parsed = boundFarmHarvestAssistErrorSchema.parse(response.json());
      assert.equal(parsed.error.code, errorCode);
      assert.equal(parsed.error.current_revision, currentRevision);
    }

    const beforeDeparture = harness.farmHumanReader.harvestCalls.length;
    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "POST",
      url: "/api/farm/field/harvest-assists",
      headers: {
        cookie,
        "idempotency-key": "019ffb01-49cd-7020-84af-3d04fb1ed0ff",
        "if-match": "field:opaque-version",
      },
      payload: {},
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(
      boundFarmHarvestAssistErrorSchema.parse(departed.json()).error.code,
      "qq_not_group_member",
    );
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
    assert.equal(harness.farmHumanReader.harvestCalls.length, beforeDeparture);
  } finally {
    await harness.close();
  }
});

test("bound farm overview uses the authenticated session binding and returns only public farm facts", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);

    const response = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(boundFarmOverviewSuccessSchema.parse(response.json()), {
      farm: {
        farm_doorplate: FARM_DOORPLATE,
        farm_name: FARM_NAME,
        plots: [
          { plot_id: 1, state: "ripe", seed_type: "common", watered: 2 },
          { plot_id: 2, state: "empty", seed_type: null, watered: 0 },
        ],
      },
    });
    assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmDirectory.overviewCalls, [FARM_DOORPLATE]);
    assert.deepEqual(harness.membership.calls, [
      { groupId: COMMUNITY_QQ_GROUP_ID, qqNumber: QQ_NUMBER },
      { groupId: COMMUNITY_QQ_GROUP_ID, qqNumber: QQ_NUMBER },
    ]);

    const overrideAttempt = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview?farm_doorplate=ZZZZZZ",
      headers: { cookie },
    });
    assert.equal(overrideAttempt.statusCode, 400);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(overrideAttempt.json()).error.code,
      "invalid_request",
    );
    assert.deepEqual(harness.farmDirectory.overviewCalls, [FARM_DOORPLATE]);
    assert.equal(harness.membership.calls.length, 2);
  } finally {
    await harness.close();
  }
});

test("bound farm overview keeps membership, farm privacy, and upstream failures distinct", async () => {
  const harness = createHarness();
  try {
    const unauthenticated = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
    });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);

    harness.membership.unavailable = true;
    const oneBotUnavailable = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });
    assert.equal(oneBotUnavailable.statusCode, 503);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(oneBotUnavailable.json()).error.code,
      "onebot_unavailable",
    );
    assert.equal(harness.farmDirectory.overviewCalls.length, 0);

    harness.membership.unavailable = false;
    harness.farmDirectory.result = "not_public";
    const notPublic = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });
    assert.equal(notPublic.statusCode, 403);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(notPublic.json()).error.code,
      "farm_not_publicly_readable",
    );

    harness.farmDirectory.result = "unavailable";
    const farmUnavailable = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });
    assert.equal(farmUnavailable.statusCode, 503);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(farmUnavailable.json()).error.code,
      "farm_unavailable",
    );

    const farmCallsBeforeDeparture = harness.farmDirectory.overviewCalls.length;
    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/farm/overview",
      headers: { cookie },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(
      boundFarmOverviewErrorSchema.parse(departed.json()).error.code,
      "qq_not_group_member",
    );
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
    assert.equal(harness.farmDirectory.overviewCalls.length, farmCallsBeforeDeparture);
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM human_sessions WHERE revoked_at IS NULL",
      ),
      0,
    );
  } finally {
    await harness.close();
  }
});

test("farm human UI proxy derives the credential and keeps independent pages exclusive", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    const cookie = cookieFrom(created);
    harness.farmDirectory.humanPageHtml =
      '<a href="/api/farm/ui/ranch">牧场</a><form action="/api/farm/ui/ranch/feed"></form>';

    const page = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui",
      headers: { cookie },
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.headers["content-type"] ?? "", /^text\/html/);
    assert.doesNotMatch(page.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmDirectory.humanPageCalls, [
      { farmHumanKey: FARM_HUMAN_KEY, pagePath: "", query: "" },
    ]);

    const targetOverride = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui?farm_doorplate=ABC234",
      headers: { cookie },
    });
    assert.equal(targetOverride.statusCode, 400);
    assert.equal(farmHumanUiErrorSchema.parse(targetOverride.json()).error.code, "invalid_request");
    assert.equal(harness.farmDirectory.humanPageCalls.length, 1);

    const pathOverride = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui/another-human-key/ranch",
      headers: { cookie },
    });
    assert.equal(pathOverride.statusCode, 400);
    assert.equal(harness.farmDirectory.humanPageCalls.length, 1);

    for (const section of ["glimmer", "together"]) {
      const independentPathOverride = await harness.app.inject({
        method: "GET",
        url: `/api/farm/ui/${section}`,
        headers: { cookie },
      });
      assert.equal(independentPathOverride.statusCode, 400);
      assert.equal(
        farmHumanUiErrorSchema.parse(independentPathOverride.json()).error.code,
        "invalid_request",
      );
      assert.equal(harness.farmDirectory.humanPageCalls.length, 1);
    }

    const action = await harness.app.inject({
      method: "POST",
      url: "/api/farm/ui/ranch/feed",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      payload: "animal=cow",
    });
    assert.equal(action.statusCode, 303);
    assert.equal(action.headers.location, "/api/farm/ui/ranch?flash=done");
    assert.doesNotMatch(action.headers.location ?? "", new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmDirectory.humanActionCalls, [
      { farmHumanKey: FARM_HUMAN_KEY, actionPath: "ranch/feed", form: "animal=cow" },
    ]);

    const formOverride = await harness.app.inject({
      method: "POST",
      url: "/api/farm/ui/ranch/feed",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      payload: "animal=cow&farm_doorplate=ABC234",
    });
    assert.equal(formOverride.statusCode, 400);
    assert.equal(harness.farmDirectory.humanActionCalls.length, 1);

    const glimmer = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-glimmer",
      headers: { cookie },
    });
    assert.equal(glimmer.statusCode, 200);
    assert.doesNotMatch(glimmer.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmDirectory.humanPageCalls.at(-1), {
      farmHumanKey: FARM_HUMAN_KEY,
      pagePath: "glimmer",
      query: "",
    });

    const callsAfterGlimmer = harness.farmDirectory.humanPageCalls.length;
    for (const method of ["HEAD", "POST", "PUT"] as const) {
      const rejectedMethod = await harness.app.inject({
        method,
        url: "/api/lingye-glimmer",
        headers: { cookie },
      });
      assert.equal(rejectedMethod.statusCode, 404);
      assert.equal(harness.farmDirectory.humanPageCalls.length, callsAfterGlimmer);
    }

    const together = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-together",
      headers: { cookie },
    });
    assert.equal(together.statusCode, 200);
    assert.deepEqual(harness.farmDirectory.humanPageCalls.at(-1), {
      farmHumanKey: FARM_HUMAN_KEY,
      pagePath: "together",
      query: "",
    });

    const callsBeforeDeparture = harness.farmDirectory.humanPageCalls.length;
    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-glimmer",
      headers: { cookie },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(farmHumanUiErrorSchema.parse(departed.json()).error.code, "qq_not_group_member");
    assert.equal(harness.farmDirectory.humanPageCalls.length, callsBeforeDeparture);
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
  } finally {
    await harness.close();
  }
});

test("structured Lingye reads derive the bound farm and reject browser query/body overrides", async () => {
  const harness = createHarness();
  try {
    const unauthenticated = await harness.app.inject({
      method: "GET",
      url: "/api/lingye/glimmer",
    });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      boundGlimmerReadErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    harness.membership.members.add(QQ_NUMBER);
    harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    const cookie = cookieFrom(created);

    const glimmer = await harness.app.inject({
      method: "GET",
      url: "/api/lingye/glimmer",
      headers: { cookie },
    });
    assert.equal(glimmer.statusCode, 200);
    assert.equal(glimmer.headers["cache-control"], "no-store");
    assert.deepEqual(boundGlimmerReadSuccessSchema.parse(glimmer.json()), FARM_GLIMMER_RESULT);

    const together = await harness.app.inject({
      method: "GET",
      url: "/api/lingye/together",
      headers: { cookie },
    });
    assert.equal(together.statusCode, 200);
    assert.equal(together.headers["cache-control"], "no-store");
    assert.deepEqual(boundTogetherReadSuccessSchema.parse(together.json()), FARM_TOGETHER_RESULT);
    assert.deepEqual(harness.farmLingyeReader.glimmerCalls, [
      { farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY },
    ]);
    assert.deepEqual(harness.farmLingyeReader.togetherCalls, [
      { farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY },
    ]);

    for (const url of ["/api/lingye/glimmer?farm_doorplate=ABC234", "/api/lingye/together?x=1"]) {
      const queryOverride = await harness.app.inject({
        method: "GET",
        url,
        headers: { cookie },
      });
      assert.equal(queryOverride.statusCode, 400);
      assert.equal(
        url.includes("glimmer")
          ? boundGlimmerReadErrorSchema.parse(queryOverride.json()).error.code
          : boundTogetherReadErrorSchema.parse(queryOverride.json()).error.code,
        "invalid_request",
      );
    }

    const callsBeforeBodyOverride = harness.farmLingyeReader.glimmerCalls.length;
    const bodyOverride = await harness.app.inject({
      method: "GET",
      url: "/api/lingye/glimmer",
      headers: { cookie },
      payload: { farm_human_key: FARM_HUMAN_KEY, expected_farm_doorplate: FARM_DOORPLATE },
    });
    assert.equal(bodyOverride.statusCode, 400);
    assert.equal(
      boundGlimmerReadErrorSchema.parse(bodyOverride.json()).error.code,
      "invalid_request",
    );
    assert.equal(harness.farmLingyeReader.glimmerCalls.length, callsBeforeBodyOverride);

    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "GET",
      url: "/api/lingye/together",
      headers: { cookie },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(
      boundTogetherReadErrorSchema.parse(departed.json()).error.code,
      "qq_not_group_member",
    );
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
  } finally {
    await harness.close();
  }
});

test("structured Lingye routes keep credential, farm, contract, and availability errors separate", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    const cookie = cookieFrom(created);
    const cases = [
      ["credential", 409, "farm_credential_invalid"],
      ["missing", 404, "farm_not_found"],
      ["contract", 502, "upstream_contract_unavailable"],
      ["unavailable", 503, "farm_unavailable"],
    ] as const;

    for (const [result, statusCode, errorCode] of cases) {
      harness.farmLingyeReader.glimmerResult = result;
      const response = await harness.app.inject({
        method: "GET",
        url: "/api/lingye/glimmer",
        headers: { cookie },
      });
      assert.equal(response.statusCode, statusCode);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(boundGlimmerReadErrorSchema.parse(response.json()).error.code, errorCode);
    }
    harness.farmLingyeReader.togetherResult = "contract";
    const together = await harness.app.inject({
      method: "GET",
      url: "/api/lingye/together",
      headers: { cookie },
    });
    assert.equal(together.statusCode, 502);
    assert.equal(
      boundTogetherReadErrorSchema.parse(together.json()).error.code,
      "upstream_contract_unavailable",
    );
  } finally {
    await harness.close();
  }
});

test("structured farm catalog, kitchen, and ranch routes keep the binding and failure boundary", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    let cookie = cookieFrom(created);
    const routes = [
      {
        path: "/api/farm/catalog",
        successSchema: boundFarmCatalogReadSuccessSchema,
        errorSchema: boundFarmCatalogReadErrorSchema,
        expected: FARM_CATALOG_RESULT,
        reader: harness.farmCatalogReader,
      },
      {
        path: "/api/farm/kitchen",
        successSchema: boundFarmKitchenReadSuccessSchema,
        errorSchema: boundFarmKitchenReadErrorSchema,
        expected: FARM_KITCHEN_RESULT,
        reader: harness.farmKitchenReader,
      },
      {
        path: "/api/farm/ranch",
        successSchema: boundFarmRanchSuccessSchema,
        errorSchema: boundFarmRanchErrorSchema,
        expected: FARM_RANCH_RESULT,
        reader: harness.farmRanchReader,
      },
    ] as const;

    for (const route of routes) {
      const response = await harness.app.inject({
        method: "GET",
        url: route.path,
        headers: { cookie },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.deepEqual(route.successSchema.parse(response.json()), route.expected);
      assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
      assert.deepEqual(route.reader.calls, [
        { farmDoorplate: FARM_DOORPLATE, farmHumanKey: FARM_HUMAN_KEY },
      ]);

      const queryOverride = await harness.app.inject({
        method: "GET",
        url: `${route.path}?farm_doorplate=ZZZZZZ&farm_human_key=override`,
        headers: { cookie },
      });
      assert.equal(queryOverride.statusCode, 400);
      assert.equal(queryOverride.headers["cache-control"], "no-store");
      assert.equal(route.errorSchema.parse(queryOverride.json()).error.code, "invalid_request");
      assert.equal(route.reader.calls.length, 1);

      const bodyOverride = await harness.app.inject({
        method: "GET",
        url: route.path,
        headers: { cookie },
        payload: { farm_doorplate: "ZZZZZZ", farm_human_key: FARM_HUMAN_KEY },
      });
      assert.equal(bodyOverride.statusCode, 400);
      assert.equal(bodyOverride.headers["cache-control"], "no-store");
      assert.equal(route.errorSchema.parse(bodyOverride.json()).error.code, "invalid_request");
      assert.equal(route.reader.calls.length, 1);
    }

    const errorCases = [
      ["credential", 409, "farm_credential_invalid"],
      ["contract", 502, "upstream_contract_unavailable"],
      ["unavailable", 503, "farm_unavailable"],
    ] as const;
    for (const route of routes) {
      for (const [result, statusCode, errorCode] of errorCases) {
        route.reader.result = result;
        const response = await harness.app.inject({
          method: "GET",
          url: route.path,
          headers: { cookie },
        });
        assert.equal(response.statusCode, statusCode);
        assert.equal(response.headers["cache-control"], "no-store");
        assert.equal(route.errorSchema.parse(response.json()).error.code, errorCode);
        assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
      }
      route.reader.result = "found";
    }

    for (const route of routes) {
      const callsBeforeDeparture = route.reader.calls.length;
      harness.membership.members.clear();
      const departed = await harness.app.inject({
        method: "GET",
        url: route.path,
        headers: { cookie },
      });
      assert.equal(departed.statusCode, 403);
      assert.equal(route.errorSchema.parse(departed.json()).error.code, "qq_not_group_member");
      assert.equal(route.reader.calls.length, callsBeforeDeparture);
      assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);

      harness.membership.members.add(QQ_NUMBER);
      const restored = await harness.app.inject({
        method: "POST",
        url: "/api/auth/session",
        payload: { qq_number: QQ_NUMBER, password: PASSWORD },
      });
      assert.equal(restored.statusCode, 200);
      cookie = cookieFrom(restored);
    }
  } finally {
    await harness.close();
  }
});

test("bound kitchen purchase derives farm identity and rejects browser authority overrides", async () => {
  const harness = createHarness();
  try {
    const unauthenticated = await harness.app.inject({
      method: "POST",
      url: "/api/farm/kitchen/purchases",
      headers: { "idempotency-key": FARM_KITCHEN_PURCHASE_KEY },
      payload: {
        expected_shop_revision: FARM_KITCHEN_RESULT.shop_revision,
        kind: "ingredient",
        item_id: "salt",
        quantity: 2,
      },
    });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      boundFarmKitchenPurchaseErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const payload = {
      expected_shop_revision: FARM_KITCHEN_RESULT.shop_revision,
      kind: "ingredient",
      item_id: "salt",
      quantity: 2,
    } as const;

    const response = await harness.app.inject({
      method: "POST",
      url: "/api/farm/kitchen/purchases",
      headers: { cookie, "idempotency-key": FARM_KITCHEN_PURCHASE_KEY },
      payload,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(
      boundFarmKitchenPurchaseSuccessSchema.parse(response.json()),
      FARM_KITCHEN_PURCHASE_RESULT,
    );
    assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmKitchenPurchaser.calls, [
      {
        farmDoorplate: FARM_DOORPLATE,
        farmHumanKey: FARM_HUMAN_KEY,
        expectedShopRevision: FARM_KITCHEN_RESULT.shop_revision,
        idempotencyKey: FARM_KITCHEN_PURCHASE_KEY,
        kind: "ingredient",
        itemId: "salt",
        quantity: 2,
      },
    ]);

    const invalidRequests = [
      {
        url: "/api/farm/kitchen/purchases?farm_human_key=override",
        headers: { cookie, "idempotency-key": FARM_KITCHEN_PURCHASE_KEY },
        payload,
      },
      {
        url: "/api/farm/kitchen/purchases",
        headers: { cookie, "idempotency-key": FARM_KITCHEN_PURCHASE_KEY },
        payload: { ...payload, farm_doorplate: "ZZZZZZ", price: 1 },
      },
      {
        url: "/api/farm/kitchen/purchases",
        headers: { cookie },
        payload,
      },
    ];
    for (const invalidRequest of invalidRequests) {
      const invalid = await harness.app.inject({
        method: "POST",
        ...invalidRequest,
      });
      assert.equal(invalid.statusCode, 400);
      assert.equal(
        boundFarmKitchenPurchaseErrorSchema.parse(invalid.json()).error.code,
        "invalid_request",
      );
    }
    assert.equal(harness.farmKitchenPurchaser.calls.length, 1);
  } finally {
    await harness.close();
  }
});

test("bound kitchen purchase keeps business conflicts and upstream failures distinct", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const cases = [
      ["shop_changed", 409, "shop_changed", `kitchen-v1:${"c".repeat(64)}`],
      ["state_conflict", 409, "state_conflict", `kitchen-v1:${"d".repeat(64)}`],
      ["shop_unavailable", 409, "shop_unavailable", undefined],
      ["rejected", 409, "purchase_rejected", undefined],
      ["idempotency_conflict", 409, "idempotency_conflict", undefined],
      ["credential", 409, "farm_credential_invalid", undefined],
      ["missing", 404, "farm_not_found", undefined],
      ["contract", 502, "upstream_contract_unavailable", undefined],
      ["unavailable", 503, "farm_unavailable", undefined],
    ] as const;

    for (const [result, statusCode, errorCode, currentShopRevision] of cases) {
      harness.farmKitchenPurchaser.result = result;
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/farm/kitchen/purchases",
        headers: { cookie, "idempotency-key": FARM_KITCHEN_PURCHASE_KEY },
        payload: {
          expected_shop_revision: FARM_KITCHEN_RESULT.shop_revision,
          kind: "ingredient",
          item_id: "salt",
          quantity: 2,
        },
      });
      assert.equal(response.statusCode, statusCode);
      assert.equal(response.headers["cache-control"], "no-store");
      const parsed = boundFarmKitchenPurchaseErrorSchema.parse(response.json());
      assert.equal(parsed.error.code, errorCode);
      assert.equal(parsed.error.current_shop_revision, currentShopRevision);
      assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
    }

    const callsBeforeDeparture = harness.farmKitchenPurchaser.calls.length;
    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "POST",
      url: "/api/farm/kitchen/purchases",
      headers: { cookie, "idempotency-key": FARM_KITCHEN_PURCHASE_KEY },
      payload: {
        expected_shop_revision: FARM_KITCHEN_RESULT.shop_revision,
        kind: "ingredient",
        item_id: "salt",
        quantity: 2,
      },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(
      boundFarmKitchenPurchaseErrorSchema.parse(departed.json()).error.code,
      "qq_not_group_member",
    );
    assert.equal(harness.farmKitchenPurchaser.calls.length, callsBeforeDeparture);
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
  } finally {
    await harness.close();
  }
});

test("bound ranch resident action derives identity and rejects browser authority overrides", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const payload = {
      expected_revision: FARM_RANCH_RESULT.revision,
      action: "rename",
      resident_type: "animal",
      kind_id: "chicken",
      payload: { name: "小太阳" },
    } as const;

    const response = await harness.app.inject({
      method: "POST",
      url: "/api/farm/ranch/resident-actions",
      headers: { cookie, "idempotency-key": FARM_RANCH_ACTION_KEY },
      payload,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(
      boundFarmRanchResidentActionSuccessSchema.parse(response.json()),
      FARM_RANCH_ACTION_RESULT,
    );
    assert.doesNotMatch(response.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmRanchResidentActioner.calls, [
      {
        farmDoorplate: FARM_DOORPLATE,
        farmHumanKey: FARM_HUMAN_KEY,
        expectedRevision: FARM_RANCH_RESULT.revision,
        idempotencyKey: FARM_RANCH_ACTION_KEY,
        action: "rename",
        residentType: "animal",
        kindId: "chicken",
        payload: { name: "小太阳" },
      },
    ]);

    const invalidRequests = [
      {
        url: "/api/farm/ranch/resident-actions?farm_human_key=override",
        headers: { cookie, "idempotency-key": FARM_RANCH_ACTION_KEY },
        payload,
      },
      {
        url: "/api/farm/ranch/resident-actions",
        headers: { cookie, "idempotency-key": FARM_RANCH_ACTION_KEY },
        payload: { ...payload, farm_doorplate: "ZZZZZZ" },
      },
      {
        url: "/api/farm/ranch/resident-actions",
        headers: { cookie },
        payload,
      },
    ];
    for (const invalidRequest of invalidRequests) {
      const invalid = await harness.app.inject({ method: "POST", ...invalidRequest });
      assert.equal(invalid.statusCode, 400);
      assert.equal(
        boundFarmRanchResidentActionErrorSchema.parse(invalid.json()).error.code,
        "invalid_request",
      );
    }
    assert.equal(harness.farmRanchResidentActioner.calls.length, 1);
  } finally {
    await harness.close();
  }
});

test("bound ranch resident action keeps conflicts and upstream failures distinct", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const cases = [
      ["state_conflict", 409, "state_conflict", "ranch-v1:current"],
      ["rejected", 409, "action_rejected", undefined],
      ["idempotency_conflict", 409, "idempotency_conflict", undefined],
      ["credential", 409, "farm_credential_invalid", undefined],
      ["missing", 404, "farm_not_found", undefined],
      ["contract", 502, "upstream_contract_unavailable", undefined],
      ["unavailable", 503, "farm_unavailable", undefined],
    ] as const;

    for (const [result, statusCode, errorCode, currentRevision] of cases) {
      harness.farmRanchResidentActioner.result = result;
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/farm/ranch/resident-actions",
        headers: { cookie, "idempotency-key": FARM_RANCH_ACTION_KEY },
        payload: {
          expected_revision: FARM_RANCH_RESULT.revision,
          action: "rename",
          resident_type: "animal",
          kind_id: "chicken",
          payload: { name: "小太阳" },
        },
      });
      assert.equal(response.statusCode, statusCode);
      const parsed = boundFarmRanchResidentActionErrorSchema.parse(response.json());
      assert.equal(parsed.error.code, errorCode);
      assert.equal(parsed.error.current_revision, currentRevision);
    }

    const callsBeforeDeparture = harness.farmRanchResidentActioner.calls.length;
    harness.membership.members.clear();
    const departed = await harness.app.inject({
      method: "POST",
      url: "/api/farm/ranch/resident-actions",
      headers: { cookie, "idempotency-key": FARM_RANCH_ACTION_KEY },
      payload: {
        expected_revision: FARM_RANCH_RESULT.revision,
        action: "rename",
        resident_type: "animal",
        kind_id: "chicken",
        payload: { name: "小太阳" },
      },
    });
    assert.equal(departed.statusCode, 403);
    assert.equal(
      boundFarmRanchResidentActionErrorSchema.parse(departed.json()).error.code,
      "qq_not_group_member",
    );
    assert.equal(harness.farmRanchResidentActioner.calls.length, callsBeforeDeparture);
    assert.match(String(departed.headers["set-cookie"]), /Max-Age=0/);
  } finally {
    await harness.close();
  }
});

test("bound ranch collection derives identity from the session and keeps UUID/revision errors distinct", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const headers = {
      cookie,
      "idempotency-key": FARM_RANCH_COLLECTION_KEY,
      "if-match": `"${FARM_RANCH_RESULT.revision}"`,
    };

    const success = await harness.app.inject({
      method: "POST",
      url: "/api/farm/ranch/collect",
      headers,
      payload: {},
    });
    assert.equal(success.statusCode, 200);
    assert.equal(success.headers["cache-control"], "no-store");
    assert.deepEqual(
      boundFarmRanchCollectionSuccessSchema.parse(success.json()),
      FARM_RANCH_COLLECTION_RESULT,
    );
    assert.doesNotMatch(success.body, new RegExp(FARM_HUMAN_KEY));
    assert.deepEqual(harness.farmRanchCollector.calls, [
      {
        farmDoorplate: FARM_DOORPLATE,
        farmHumanKey: FARM_HUMAN_KEY,
        expectedRevision: FARM_RANCH_RESULT.revision,
        idempotencyKey: FARM_RANCH_COLLECTION_KEY,
      },
    ]);

    const invalidRequests = [
      {
        headers,
        payload: { unexpected: true },
        url: "/api/farm/ranch/collect",
      },
      {
        headers: { cookie, "if-match": `"${FARM_RANCH_RESULT.revision}"` },
        payload: {},
        url: "/api/farm/ranch/collect",
      },
      {
        headers: {
          cookie,
          "idempotency-key": "not-a-uuid",
          "if-match": `"${FARM_RANCH_RESULT.revision}"`,
        },
        payload: {},
        url: "/api/farm/ranch/collect",
      },
      {
        headers,
        payload: {},
        url: "/api/farm/ranch/collect?farm_human_key=override",
      },
    ] as const;
    for (const invalidRequest of invalidRequests) {
      const invalid = await harness.app.inject({
        method: "POST",
        url: invalidRequest.url,
        headers: invalidRequest.headers,
        payload: invalidRequest.payload,
      });
      assert.equal(invalid.statusCode, 400);
      assert.equal(
        boundFarmRanchCollectionErrorSchema.parse(invalid.json()).error.code,
        "invalid_request",
      );
    }
    assert.equal(harness.farmRanchCollector.calls.length, 1);

    const cases = [
      ["no_collectable", 409, "no_collectable", "ranch-v1:current"],
      ["state_conflict", 409, "state_conflict", "ranch-v1:current"],
      ["rejected", 409, "collection_rejected", undefined],
      ["idempotency_conflict", 409, "idempotency_conflict", undefined],
      ["credential", 409, "farm_credential_invalid", undefined],
      ["missing", 404, "farm_not_found", undefined],
      ["contract", 502, "upstream_contract_unavailable", undefined],
      ["unavailable", 503, "farm_unavailable", undefined],
    ] as const;
    for (const [result, statusCode, errorCode, currentRevision] of cases) {
      harness.farmRanchCollector.result = result;
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/farm/ranch/collect",
        headers,
        payload: {},
      });
      assert.equal(response.statusCode, statusCode);
      const parsed = boundFarmRanchCollectionErrorSchema.parse(response.json());
      assert.equal(parsed.error.code, errorCode);
      assert.equal(parsed.error.current_revision, currentRevision);
    }
  } finally {
    await harness.close();
  }
});

test("bound farm settings action derives identity and keeps failures distinct", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);
    const payload = {
      expected_catalog_revision: `farm-catalog-v1:${"a".repeat(64)}`,
      field: "farm_name",
      value: "新农场名",
    } as const;

    const success = await harness.app.inject({
      method: "POST",
      url: "/api/farm/settings/actions",
      headers: { cookie, "idempotency-key": FARM_SETTINGS_ACTION_KEY },
      payload,
    });
    assert.equal(success.statusCode, 200);
    assert.equal(success.headers["cache-control"], "no-store");
    assert.deepEqual(
      boundFarmSettingsActionSuccessSchema.parse(success.json()),
      FARM_SETTINGS_ACTION_RESULT,
    );
    assert.deepEqual(harness.farmSettingsActioner.calls, [
      {
        farmDoorplate: FARM_DOORPLATE,
        farmHumanKey: FARM_HUMAN_KEY,
        expectedCatalogRevision: payload.expected_catalog_revision,
        idempotencyKey: FARM_SETTINGS_ACTION_KEY,
        field: "farm_name",
        value: "新农场名",
      },
    ]);
    assert.doesNotMatch(success.body, new RegExp(FARM_HUMAN_KEY));

    const invalid = await harness.app.inject({
      method: "POST",
      url: "/api/farm/settings/actions?farm_human_key=override",
      headers: { cookie, "idempotency-key": FARM_SETTINGS_ACTION_KEY },
      payload,
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(
      boundFarmSettingsActionErrorSchema.parse(invalid.json()).error.code,
      "invalid_request",
    );

    const cases = [
      ["state_conflict", 409, "state_conflict", "farm-catalog-v1:current"],
      ["rejected", 409, "action_rejected", undefined],
      ["idempotency_conflict", 409, "idempotency_conflict", undefined],
      ["credential", 409, "farm_credential_invalid", undefined],
      ["missing", 404, "farm_not_found", undefined],
      ["contract", 502, "upstream_contract_unavailable", undefined],
      ["unavailable", 503, "farm_unavailable", undefined],
    ] as const;
    for (const [result, statusCode, errorCode, currentRevision] of cases) {
      harness.farmSettingsActioner.result = result;
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/farm/settings/actions",
        headers: { cookie, "idempotency-key": FARM_SETTINGS_ACTION_KEY },
        payload,
      });
      assert.equal(response.statusCode, statusCode);
      const parsed = boundFarmSettingsActionErrorSchema.parse(response.json());
      assert.equal(parsed.error.code, errorCode);
      assert.equal(parsed.error.current_revision, currentRevision);
    }
  } finally {
    await harness.close();
  }
});

test("farm human UI proxy separates invalid credentials, outage, contract failure, and no binding", async () => {
  const harness = createHarness();
  try {
    const unauthenticated = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-glimmer",
    });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(
      farmHumanUiErrorSchema.parse(unauthenticated.json()).error.code,
      "authentication_required",
    );

    harness.membership.members.add(QQ_NUMBER);
    harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    const cookie = cookieFrom(created);

    harness.farmDirectory.credentialResult = "invalid";
    const invalid = await harness.app.inject({
      method: "GET",
      url: "/api/lingye-glimmer",
      headers: { cookie },
    });
    assert.equal(invalid.statusCode, 409);
    assert.equal(
      farmHumanUiErrorSchema.parse(invalid.json()).error.code,
      "farm_credential_invalid",
    );
    assert.doesNotMatch(invalid.body, new RegExp(FARM_HUMAN_KEY));

    harness.farmDirectory.credentialResult = "unavailable";
    const unavailable = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui",
      headers: { cookie },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(farmHumanUiErrorSchema.parse(unavailable.json()).error.code, "farm_unavailable");
    assert.doesNotMatch(unavailable.body, new RegExp(FARM_HUMAN_KEY));

    harness.farmDirectory.credentialResult = "contract";
    const contractUnavailable = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui",
      headers: { cookie },
    });
    assert.equal(contractUnavailable.statusCode, 502);
    assert.equal(
      farmHumanUiErrorSchema.parse(contractUnavailable.json()).error.code,
      "upstream_contract_unavailable",
    );
    assert.doesNotMatch(contractUnavailable.body, new RegExp(FARM_HUMAN_KEY));

    const unbindDatabase = new Database(harness.databasePath);
    try {
      unbindDatabase.prepare("DELETE FROM farm_bindings").run();
    } finally {
      unbindDatabase.close();
    }
    harness.farmDirectory.credentialResult = "found";
    const unbound = await harness.app.inject({
      method: "GET",
      url: "/api/farm/ui",
      headers: { cookie },
    });
    assert.equal(unbound.statusCode, 409);
    assert.equal(
      farmHumanUiErrorSchema.parse(unbound.json()).error.code,
      "registration_profile_required",
    );
  } finally {
    await harness.close();
  }
});

test("logout revokes only the presented session and clears its cookie", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const code = harness.database.getCurrentRegistrationCode(harness.now.value);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { ...FULL_REGISTRATION_PAYLOAD, registration_code: code.code },
    });
    const cookie = cookieFrom(created);

    const logout = await harness.app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(logout.statusCode, 200);
    assert.deepEqual(humanLogoutSuccessSchema.parse(logout.json()), { logged_out: true });
    assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/);
    assert.match(String(logout.headers["set-cookie"]), /; Path=\/api(?:;|$)/);
    assert.doesNotMatch(String(logout.headers["set-cookie"]), /; Path=\/(?:;|$)/);

    const current = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(current.statusCode, 401);
    assert.equal(
      humanAuthenticationErrorSchema.parse(current.json()).error.code,
      "authentication_required",
    );
  } finally {
    await harness.close();
  }
});

test("administrator password reset replaces the credential and revokes every active session", async () => {
  const harness = createHarness();
  try {
    harness.membership.members.add(QQ_NUMBER);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: FULL_REGISTRATION_PAYLOAD,
    });
    const cookie = cookieFrom(created);
    const replacement = await createHumanPasswordCredential("replacement password");

    assert.equal(
      harness.database.resetHumanPassword(QQ_NUMBER, replacement, harness.now.value + 1),
      true,
    );
    assert.equal(
      queryScalar(
        harness.databasePath,
        "SELECT COUNT(*) AS value FROM human_sessions WHERE revoked_at IS NULL",
      ),
      0,
    );
    const oldSession = await harness.app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    assert.equal(oldSession.statusCode, 401);
    const oldPassword = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: PASSWORD },
    });
    assert.equal(oldPassword.statusCode, 401);
    const replacementPassword = await harness.app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { qq_number: QQ_NUMBER, password: "replacement password" },
    });
    assert.equal(replacementPassword.statusCode, 200);
    assert.equal(
      harness.database.resetHumanPassword("987654321", replacement, harness.now.value),
      false,
    );
  } finally {
    await harness.close();
  }
});

test("session persistence failure rolls back the new account, resident, home, and farm binding", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-registration-rollback-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const accountIds = [
    "a60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    "a70a5f78-9e87-4bc4-a06f-50df4e23d42d",
  ];
  const residentIds = [
    "b60a5f78-9e87-4bc4-a06f-50df4e23d42d",
    "b70a5f78-9e87-4bc4-a06f-50df4e23d42d",
  ];
  const homeIds = ["c60a5f78-9e87-4bc4-a06f-50df4e23d42d", "c70a5f78-9e87-4bc4-a06f-50df4e23d42d"];
  const database = new CommunityDatabase(databasePath, {
    generateSessionToken: () => "same-session-token",
    generateAccountId: () => accountIds.shift() ?? "",
    generateResidentId: () => residentIds.shift() ?? "",
    generateHomeId: () => homeIds.shift() ?? "",
  });
  try {
    database.createHumanSession("10001", 1, {
      residentName: "第一台小机",
      homeName: "第一座家",
      farmDoorplate: "3ET3FE",
      farmHumanKey: "first-private-key",
    });

    assert.throws(
      () =>
        database.createHumanSession("10002", 2, {
          residentName: "第二台小机",
          homeName: "第二座家",
          farmDoorplate: "ABC234",
          farmHumanKey: "second-private-key",
        }),
      /UNIQUE constraint failed: human_sessions.token_hash/,
    );

    for (const table of [
      "human_accounts",
      "human_sessions",
      "residents",
      "homes",
      "farm_bindings",
    ]) {
      assert.equal(queryScalar(databasePath, `SELECT COUNT(*) AS value FROM ${table}`), 1);
    }
    assert.equal(
      queryScalar(
        databasePath,
        "SELECT COUNT(*) AS value FROM human_accounts WHERE qq_number = '10002'",
      ),
      0,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("registration code expires at the exact 24-hour boundary and restart cannot extend it", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-code-window-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const start = Date.UTC(2026, 7, 1, 0, 0, 0);
  let database = new CommunityDatabase(databasePath, {
    generateRegistrationCode: () => CURRENT_CODE,
  });
  try {
    const first = database.getCurrentRegistrationCode(start);
    assert.deepEqual(first, {
      code: CURRENT_CODE,
      generatedAt: start,
      expiresAt: start + DAY_MS,
    });
    database.close();

    database = new CommunityDatabase(databasePath, {
      generateRegistrationCode: () => OTHER_CODE,
    });
    assert.deepEqual(database.getCurrentRegistrationCode(start + DAY_MS - 1), first);
    assert.equal(database.isCurrentRegistrationCode(CURRENT_CODE, start + DAY_MS), false);
    assert.deepEqual(database.getCurrentRegistrationCode(start + DAY_MS), {
      code: OTHER_CODE,
      generatedAt: start + DAY_MS,
      expiresAt: start + 2 * DAY_MS,
    });
    database.close();

    database = new CommunityDatabase(databasePath, {
      generateRegistrationCode: () => "DB-9999-ZZZZ",
    });
    assert.equal(database.isCurrentRegistrationCode(CURRENT_CODE, start + DAY_MS + 1), false);
    assert.equal(database.getCurrentRegistrationCode(start + DAY_MS + 1).code, OTHER_CODE);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("registration code rotation never keeps the expired code when the generator collides", () => {
  const start = Date.UTC(2026, 7, 1, 0, 0, 0);
  const database = new CommunityDatabase(":memory:", {
    generateRegistrationCode: () => CURRENT_CODE,
  });
  try {
    assert.equal(database.getCurrentRegistrationCode(start).code, CURRENT_CODE);
    const rotated = database.getCurrentRegistrationCode(start + DAY_MS);
    assert.notEqual(rotated.code, CURRENT_CODE);
    assert.equal(database.isCurrentRegistrationCode(CURRENT_CODE, start + DAY_MS), false);
  } finally {
    database.close();
  }
});

test("administrator CLI returns the same persisted current code and window without OneBot", () => {
  const directory = mkdtempSync(join(tmpdir(), "doorbell-code-cli-test-"));
  const databasePath = join(directory, "doorbell.sqlite");
  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  try {
    const runCli = () =>
      spawnSync(process.execPath, ["--import", "tsx", "apps/server/src/registration-code-cli.ts"], {
        cwd: repositoryRoot,
        env: { ...process.env, DOORBELL_DATABASE_PATH: databasePath },
        encoding: "utf8",
      });
    const first = runCli();
    const second = runCli();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, first.stdout);
    assert.match(
      first.stdout,
      /^code=DB-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}\n/,
    );

    const fields = Object.fromEntries(
      first.stdout
        .trim()
        .split("\n")
        .map((line) => line.split("=", 2)),
    );
    assert.equal(
      new Date(fields.expires_at ?? 0).getTime() - new Date(fields.generated_at ?? 0).getTime(),
      DAY_MS,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("expired code is rejected by the authentication service before membership lookup", async () => {
  const database = new CommunityDatabase(":memory:", {
    generateRegistrationCode: (() => {
      const codes = [CURRENT_CODE, OTHER_CODE];
      return () => codes.shift() ?? "DB-9999-ZZZZ";
    })(),
  });
  const membership = new FakeGroupMembership();
  const farmDirectory = new FakeFarmDirectory();
  const now = { value: Date.UTC(2026, 7, 1, 0, 0, 0) };
  const auth = new RegistrationAuthService({
    database,
    farmDirectory,
    groupMembership: membership,
    groupId: COMMUNITY_QQ_GROUP_ID,
    now: () => now.value,
  });
  try {
    database.getCurrentRegistrationCode(now.value);
    now.value += DAY_MS;
    await assert.rejects(
      auth.createSession({ qqNumber: QQ_NUMBER, registrationCode: CURRENT_CODE }),
      InvalidRegistrationCodeError,
    );
    assert.equal(membership.calls.length, 0);
    assert.equal(farmDirectory.calls.length, 0);
    assert.equal(farmDirectory.credentialCalls.length, 0);
  } finally {
    database.close();
  }
});
