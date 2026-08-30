import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundFarmCatalogRead } from "../auth/farm-catalog-client";
import type { BoundRanchRead } from "../auth/ranch-client";

const clients = vi.hoisted(() => ({
  catalog: vi.fn(),
  cook: vi.fn(),
  field: vi.fn(),
  farmPurchaseRequest: vi.fn(),
  harvest: vi.fn(),
  kitchen: vi.fn(),
  market: vi.fn(),
  originalPlant: vi.fn(),
  openFarmShop: vi.fn(),
  purchase: vi.fn(),
  ranch: vi.fn(),
  ranchDecoration: vi.fn(),
  refreshKitchenShop: vi.fn(),
  settings: vi.fn(),
  smelting: vi.fn(),
  upgrade: vi.fn(),
}));

vi.mock("../auth/auth-client", () => ({
  getBoundFarmField: clients.field,
  harvestBoundFarmField: clients.harvest,
  upgradeBoundFarmLand: clients.upgrade,
}));

vi.mock("../auth/farm-catalog-client", () => ({
  farmCatalogIssueMessage: () => "农场目录暂时不可用",
  farmShopOpenIssueMessage: (issue: { serverMessage: string | null }) =>
    issue.serverMessage ?? "农场商店暂时无法刷新",
  getBoundFarmCatalog: clients.catalog,
  openBoundFarmShop: clients.openFarmShop,
  replaceFarmCatalogShop: (
    catalog: { data: Record<string, unknown> },
    opened: { data: { resource: unknown }; server_time: string },
  ) => ({
    ...catalog,
    data: { ...catalog.data, shop: opened.data.resource },
    server_time: opened.server_time,
  }),
}));

vi.mock("../auth/farm-purchase-request-client", () => ({
  createBoundFarmPurchaseRequest: clients.farmPurchaseRequest,
  farmPurchaseRequestIssueMessage: (issue: { serverMessage: string | null }) =>
    issue.serverMessage ?? "现在无法通知 TA",
}));

vi.mock("../auth/kitchen-client", () => ({
  getBoundKitchen: clients.kitchen,
  kitchenIssueMessage: () => "料理台暂时不可用",
}));

vi.mock("../auth/market-action-client", () => ({
  executeBoundMarketAction: clients.market,
  marketActionIssueMessage: (issue: { serverMessage: string | null }) =>
    issue.serverMessage ?? "集市动作暂时不可用",
}));

vi.mock("../auth/kitchen-cook-client", () => ({
  executeBoundKitchenCook: clients.cook,
  kitchenCookIssueMessage: (issue: { serverMessage: string | null }) =>
    issue.serverMessage ?? "料理暂时不可用",
}));

vi.mock("../auth/kitchen-purchase-client", () => ({
  kitchenPurchaseIssueMessage: (issue: { serverMessage: string | null }) =>
    issue.serverMessage ?? "料理购买暂时不可用",
  purchaseBoundKitchenItem: clients.purchase,
}));

vi.mock("../auth/kitchen-shop-refresh-client", () => ({
  kitchenShopRefreshIssueMessage: (issue: { serverMessage: string | null }) =>
    issue.serverMessage ?? "料理食材刷新暂时不可用",
  refreshBoundKitchenShop: clients.refreshKitchenShop,
}));

vi.mock("../auth/original-plant-action-client", () => ({
  executeBoundOriginalPlantAction: clients.originalPlant,
  originalPlantActionIssueMessage: (issue: { serverMessage: string | null }) =>
    issue.serverMessage ?? "原创植物设计失败",
}));

vi.mock("../auth/ranch-client", () => ({
  getBoundRanch: clients.ranch,
  ranchIssueMessage: () => "牧场暂时不可用",
}));

vi.mock("../auth/farm-settings-action-client", () => ({
  executeBoundFarmSettingsAction: clients.settings,
  farmSettingsActionIssueMessage: () => "设置保存失败",
}));

vi.mock("../auth/ranch-action-client", () => ({
  executeBoundRanchResidentAction: vi.fn(),
  ranchResidentActionIssueMessage: () => "牧场操作失败",
}));

vi.mock("../auth/ranch-collection-client", () => ({
  collectBoundRanch: vi.fn(),
  ranchCollectionIssueMessage: () => "牧场收取失败",
}));

vi.mock("../auth/ranch-decoration-action-client", () => ({
  executeBoundRanchDecorationAction: clients.ranchDecoration,
  ranchDecorationActionIssueMessage: (issue: { serverMessage: string | null }) =>
    issue.serverMessage ?? "牧场装饰操作失败",
}));

vi.mock("../auth/smelting-action-client", () => ({
  executeBoundSmeltingAction: clients.smelting,
  smeltingActionIssueMessage: (issue: { serverMessage: string | null }) =>
    issue.serverMessage ?? "熔炼暂时不可用",
}));

import { FarmPage } from "./farm-page";
import {
  type ExpeditionActionExecutor,
  FarmExpeditionPanelContent,
  RanchDispatchPanelContent,
  type RanchInteractionActionExecutor,
} from "./panels/farm-action-panels";

const FIELD_BEFORE = {
  data: {
    farm: {
      farm_doorplate: "3ET3FE",
      farm_name: "渡的小农场",
      welcome_message: "今天也慢慢来。",
      equipped_title: null,
    },
    balance: { farm_coins: 10 },
    season: { id: "summer", name: "夏" },
    weather: { condition: "light_rain" },
    land: {
      tier: 1,
      name: "初土",
      is_max_tier: false,
      next_upgrade: {
        tier: 2,
        name: "熟地",
        plots: 9,
        cost_farm_coins: 3_500,
        can_upgrade: false,
        status_message: "升级到「熟地」还差：金币 10/3500、普通图鉴 0/6 种",
      },
    },
    plots: [
      {
        plot_id: 1,
        seed_type: "common",
        state: "ripe",
        watered: 2,
        progress: { current: 8, total: 8 },
        matures_at: null,
        identity_state: "hidden",
        crop_identity: null,
      },
    ],
    harvest_assist: {
      daily_limit: 3,
      remaining: 2,
      mature_plot_count: 1,
      can_assist: true,
      reset_at: "2026-08-25T00:00:00.000Z",
    },
  },
  revision: "field-v1:before",
  server_time: "2026-08-24T04:00:00.000Z",
} as const;

const FIELD_AFTER = {
  data: {
    ...FIELD_BEFORE.data,
    balance: { farm_coins: 55 },
    plots: [],
    harvest_assist: {
      ...FIELD_BEFORE.data.harvest_assist,
      remaining: 1,
      mature_plot_count: 0,
      can_assist: false,
    },
  },
  revision: "field-v1:after",
  server_time: "2026-08-24T04:01:00.000Z",
} as const;

const FIELD_AFTER_CROSS_MUTATION = {
  data: {
    ...FIELD_BEFORE.data,
    balance: { farm_coins: 12 },
  },
  revision: "field-v1:after-cross-mutation",
  server_time: "2026-08-24T04:00:30.000Z",
} as const;

const FIELD_UPGRADE_AVAILABLE = {
  ...FIELD_BEFORE,
  data: {
    ...FIELD_BEFORE.data,
    balance: { farm_coins: 4_000 },
    land: {
      ...FIELD_BEFORE.data.land,
      next_upgrade: {
        ...FIELD_BEFORE.data.land.next_upgrade,
        can_upgrade: true,
        status_message: null,
      },
    },
  },
  revision: "field-v1:land-upgrade-ready",
} as const;

const LAND_UPGRADE_SUCCESS = {
  ok: true,
  data: {
    data: {
      result: {
        receipt_id: "11111111-2222-4333-8444-555555555556",
        previous_land: { tier: 1, name: "初土", plots: 6 },
        upgraded_land: { tier: 2, name: "熟地", plots: 9 },
        farm_coins_spent: 3_500,
        message: "土地升级为熟地（地块增至 9）",
      },
      resource: {
        ...FIELD_UPGRADE_AVAILABLE.data,
        balance: { farm_coins: 500 },
        land: {
          tier: 2,
          name: "熟地",
          is_max_tier: false,
          next_upgrade: {
            tier: 3,
            name: "沃土",
            plots: 12,
            cost_farm_coins: 20_000,
            can_upgrade: false,
            status_message: "升级到「沃土」还差：金币 500/20000",
          },
        },
        plots: Array.from({ length: 9 }, (_, index) => ({
          plot_id: index + 1,
          seed_type: null,
          state: "empty" as const,
          watered: 0,
          progress: null,
          matures_at: null,
          identity_state: "empty" as const,
          crop_identity: null,
        })),
      },
    },
    revision: "field-v1:land-upgraded",
    server_time: "2026-08-24T04:02:00.000Z",
  },
} as const;

const HARVEST_SUCCESS = {
  ok: true,
  data: {
    data: {
      result: {
        receipt_id: "11111111-2222-4333-8444-555555555555",
        harvested_count: 1,
        farm_coins_gained: 45,
        silver_gained: 0,
        harvests: [
          {
            plot_id: 1,
            crop: { crop_id: "tomato", name: "番茄", category: "common", rarity: "N" },
            quality: { id: "normal", name: "普通" },
            value: 45,
            currency: "gold",
            is_new: true,
            material_drop: null,
            potion_drop: null,
            bonus_value: 0,
          },
        ],
        season_event: null,
        new_titles: [],
      },
      resource: FIELD_AFTER.data,
    },
    revision: FIELD_AFTER.revision,
    server_time: FIELD_AFTER.server_time,
  },
} as const;

const UNAVAILABLE_SECTION = {
  status: "unavailable",
  reason: "no_authoritative_data",
  message: "暂不可用",
} as const;

function catalogResult(itemName: string, farmName: string) {
  return {
    ok: true,
    data: {
      data: {
        farm: { farm_doorplate: "3ET3FE", farm_name: farmName },
        shop: UNAVAILABLE_SECTION,
        backpack: {
          status: "available",
          items: [
            {
              kind: "seed",
              item_id: itemName === "旧种子" ? "old_seed" : "new_seed",
              identity_state: "known",
              name: itemName,
              rarity: "N",
              quantity: itemName === "旧种子" ? 1 : 2,
            },
          ],
        },
        codex: { status: "available", entries: [] },
        settings: {
          status: "available",
          farm_name: farmName,
          ai_name: null,
          human_name: null,
          welcome_message: "欢迎来玩。",
          equipped_title: null,
          unlocked_titles: [],
          social: { visit: null, steal: null, water: null, message: null },
        },
        expedition: UNAVAILABLE_SECTION,
        smelting: UNAVAILABLE_SECTION,
        bulletin: UNAVAILABLE_SECTION,
        neighborhood: UNAVAILABLE_SECTION,
        market: UNAVAILABLE_SECTION,
      },
      // Deliberately unchanged: an explicit initialization key, not only the
      // revision string, must let refreshed authority data replace the draft.
      revision: "farm-catalog-v1:same-revision",
      codex_revision: `farm-crop-codex-v1:${"a".repeat(64)}`,
      original_plant_revision: `farm-original-plant-v1:${"b".repeat(64)}`,
      expedition_revision: `farm-expedition-v1:${"c".repeat(64)}`,
      market_revision: `farm-market-v1:${"d".repeat(64)}`,
      neighborhood_revision: `farm-neighborhood-v1:${"e".repeat(64)}`,
      server_time: "2026-08-24T04:00:00.000Z",
    },
  } as const;
}

const FIELD_SHOP_REVISION = "field-shop-v1:test";

function fieldShopCatalogResult() {
  const base = catalogResult("普通种子", "渡的小农场");
  return {
    ...base,
    data: {
      ...base.data,
      data: {
        ...base.data.data,
        shop: {
          status: "available",
          initialized: true,
          revision: FIELD_SHOP_REVISION,
          refreshed_at: "2026-08-24T04:00:00.000Z",
          next_refresh_at: null,
          items: [
            {
              kind: "potion",
              item_id: "speed_potion",
              identity_state: "known",
              name: "加速药水",
              rarity: "N",
              price: 50,
              currency: "gold",
              quantity: null,
              available_quantity: 6,
              daily_limit: 6,
              purchased_today: 0,
              condition: null,
              source: "permanent",
            },
          ],
        },
      },
    },
  } as const;
}

function farmPurchaseRequestSuccess(input: {
  idempotencyKey: string;
  shop: "field" | "ranch";
  shopRevision: string;
  items: Array<{ kind: string; itemId: string; quantity: number }>;
}) {
  return {
    ok: true,
    data: {
      data: {
        shop: input.shop,
        shop_revision: input.shopRevision,
        items: input.items.map((item) => ({
          kind: item.kind,
          item_id: item.itemId,
          qty: item.quantity,
        })),
        status: "requested",
        expires_at: "2026-08-26T04:00:00.000Z",
      },
      server_time: "2026-08-25T04:00:00.000Z",
    },
  } as const;
}

const MARKET_BEFORE = `farm-market-v1:${"d".repeat(64)}`;
const MARKET_AFTER = `farm-market-v1:${"e".repeat(64)}`;
const MARKET_BARTER_LISTING_ID = "119ffb01-49cd-7020-84af-3d04fb1ed03d";
const OWN_BARTER_LISTING_ID = "219ffb01-49cd-7020-84af-3d04fb1ed03d";

function marketCatalogResult() {
  const base = catalogResult("普通种子", "渡的小农场");
  return {
    ...base,
    data: {
      ...base.data,
      data: {
        ...base.data.data,
        market: {
          status: "available",
          listings: [
            {
              seller_farm_doorplate: "ABC234",
              kind: "material",
              item_id: "ordinary_stone",
              identity_state: "known",
              name: "普通石头",
              rarity: "N",
              quantity: 4,
              price: null,
            },
            {
              seller_farm_doorplate: "3ET3FE",
              kind: "material",
              item_id: "dry_branch",
              identity_state: "known",
              name: "枯树枝",
              rarity: "N",
              quantity: 2,
              price: null,
            },
          ],
          barter_listings: [
            {
              seller_farm_doorplate: "ABC234",
              listing_id: MARKET_BARTER_LISTING_ID,
              give: {
                kind: "material",
                item_id: "ordinary_stone",
                identity_state: "known",
                name: "普通石头",
                rarity: "N",
                quantity: 1,
              },
              want: {
                kind: "seed",
                item_id: "new_seed",
                identity_state: "known",
                name: "普通种子",
                rarity: "N",
                quantity: 1,
              },
            },
            {
              seller_farm_doorplate: "3ET3FE",
              listing_id: OWN_BARTER_LISTING_ID,
              give: {
                kind: "seed",
                item_id: "new_seed",
                identity_state: "known",
                name: "普通种子",
                rarity: "N",
                quantity: 1,
              },
              want: {
                kind: "material",
                item_id: "dry_branch",
                identity_state: "known",
                name: "枯树枝",
                rarity: "N",
                quantity: 1,
              },
            },
          ],
        },
      },
      market_revision: MARKET_BEFORE,
    },
  } as const;
}

function marketCookingCatalogResult(kind: "ingredient" | "dish") {
  const base = marketCatalogResult();
  const item =
    kind === "ingredient"
      ? { item_id: "salt", name: "盐" }
      : { item_id: "honey_tea", name: "蜂蜜茶" };
  return {
    ...base,
    data: {
      ...base.data,
      data: {
        ...base.data.data,
        market: {
          ...base.data.data.market,
          listings: [
            {
              ...base.data.data.market.listings[0],
              kind,
              item_id: item.item_id,
              name: item.name,
            },
            ...base.data.data.market.listings.slice(1),
          ],
        },
      },
    },
  } as const;
}

function marketBuySuccess(idempotencyKey: string) {
  return {
    ok: true,
    data: {
      data: {
        result: {
          receipt_id: idempotencyKey,
          action: "buy",
          outcome: {
            seller_doorplate: "ABC234",
            kind: "material",
            item_id: "ordinary_stone",
            quantity: 1,
            name: "普通石头",
            cost: 10,
            fee: 1,
            price: 10,
          },
        },
        buyer_doorplate: "3ET3FE",
        seller_doorplate: "ABC234",
      },
      revision: MARKET_AFTER,
      seller_revision: `farm-market-v1:${"f".repeat(64)}`,
      server_time: "2026-08-25T04:01:00.000Z",
    },
  } as const;
}

function marketBarterAcceptSuccess(idempotencyKey: string) {
  return {
    ok: true,
    data: {
      data: {
        result: {
          receipt_id: idempotencyKey,
          action: "barter-accept",
          outcome: {
            seller_doorplate: "ABC234",
            listing_id: MARKET_BARTER_LISTING_ID,
            give: {
              kind: "material",
              item_id: "ordinary_stone",
              quantity: 1,
              name: "普通石头",
            },
            want: {
              kind: "seed",
              item_id: "new_seed",
              quantity: 1,
              name: "普通种子",
            },
          },
        },
        buyer_doorplate: "3ET3FE",
        seller_doorplate: "ABC234",
      },
      revision: MARKET_AFTER,
      seller_revision: `farm-market-v1:${"f".repeat(64)}`,
      server_time: "2026-08-25T04:01:00.000Z",
    },
  } as const;
}

const SMELTING_BEFORE = `farm-smelting-v1:${"a".repeat(64)}`;
const SMELTING_AFTER = `farm-smelting-v1:${"b".repeat(64)}`;
const SMELTING_MATERIAL_IDS = ["ordinary_stone", "ordinary_stone", "ordinary_stone"] as const;

function smeltingCatalogResult() {
  const base = catalogResult("普通种子", "渡的小农场");
  return {
    ...base,
    data: {
      ...base.data,
      data: {
        ...base.data.data,
        smelting: {
          status: "available",
          write_status: "available",
          revision: SMELTING_BEFORE,
          materials: [
            {
              material_id: "ordinary_stone",
              identity_state: "known",
              name: "普通石头",
              rarity: "N",
              quantity: 3,
            },
            {
              material_id: "dry_branch",
              identity_state: "known",
              name: "枯树枝",
              rarity: "N",
              quantity: 1,
            },
            {
              material_id: "clay_lump",
              identity_state: "known",
              name: "黏土块",
              rarity: "N",
              quantity: 1,
            },
          ],
          recipes: [],
        },
      },
    },
  } as const;
}

function smeltingActionSuccess(idempotencyKey: string) {
  const catalog = smeltingCatalogResult();
  return {
    ok: true,
    data: {
      data: {
        result: {
          receipt_id: idempotencyKey,
          material_ids: [...SMELTING_MATERIAL_IDS],
          crop_id: "moon_wheat",
          crop_name: "月光麦",
          rarity: "SR",
          by_recipe: false,
        },
        resource: {
          ...catalog.data.data,
          smelting: {
            ...catalog.data.data.smelting,
            revision: SMELTING_AFTER,
            materials: [],
          },
        },
      },
      revision: `farm-catalog-v1:${"c".repeat(64)}`,
      smelting_revision: SMELTING_AFTER,
      server_time: "2026-08-24T04:02:00.000Z",
    },
  } as const;
}

function settingsActionSuccess(
  idempotencyKey: string,
  field: string,
  settings: Extract<BoundFarmCatalogRead["data"]["settings"], { status: "available" }>,
) {
  const resource = catalogResult("普通种子", settings.farm_name).data.data;
  return {
    ok: true,
    data: {
      data: {
        result: { receipt_id: idempotencyKey, field },
        resource: { ...resource, settings },
      },
      revision: "farm-catalog-v1:settings-updated",
      server_time: "2026-08-24T04:02:00.000Z",
    },
  } as const;
}

const RANCH_RESULT = {
  ok: true,
  data: {
    data: {
      farm: { farm_doorplate: "3ET3FE" },
      balance: { status: "available", ranch_coins: 10, debt_status: "available", debt_coins: 0 },
      residents: { status: "available", animals: [], pets: [], patrol_goose: null },
      collectable: {
        status: "available",
        total_pending_count: 0,
        total_pending_meat_count: 0,
        entries: [],
      },
      wardrobe: { status: "available", items: [] },
      decorations: { status: "available", placed: [], stored: [] },
      dispatch: { status: "available", active: [] },
      shop: {
        animals: { status: "available", shop_day: null, items: [] },
        pets: { status: "available", shop_day: null, items: [] },
        skins: { status: "available", shop_day: null, items: [] },
        accessories: { status: "unavailable", shop_day: null, items: [] },
        decorations: { status: "unavailable", shop_day: null, items: [] },
      },
    },
    revision: "ranch-v1:test",
    server_time: "2026-08-24T04:00:00.000Z",
  },
} as const;

const RANCH_WITH_STORED_DECORATION = {
  ...RANCH_RESULT,
  data: {
    ...RANCH_RESULT.data,
    data: {
      ...RANCH_RESULT.data.data,
      decorations: {
        status: "available",
        placed: [],
        stored: [{ status: "known", decoration_id: "lantern_warm", name: "暖灯" }],
      },
    },
  },
} as const;

function ranchDecorationSuccess(idempotencyKey: string) {
  return {
    ok: true,
    data: {
      data: {
        result: {
          receipt_id: idempotencyKey,
          action: "place",
          decoration_id: "lantern_warm",
          outcome: {
            kind: "place",
            decoration_id: "lantern_warm",
            decoration_name: "暖灯",
          },
        },
        resource: {
          ...RANCH_WITH_STORED_DECORATION.data.data,
          decorations: {
            status: "available",
            placed: [{ status: "known", decoration_id: "lantern_warm", name: "暖灯" }],
            stored: [],
          },
        },
      },
      revision: "ranch-v1:after-decoration",
      server_time: "2026-08-24T04:01:00.000Z",
    },
  } as const;
}

function originalPlantSuccess(idempotencyKey: string) {
  return {
    ok: true,
    data: {
      data: {
        result: {
          receipt_id: idempotencyKey,
          crop: {
            id: "ugc_1234abcd",
            name: "月光番茄",
            latin: "Solanum luna",
            desc: "在月光里慢慢变甜。",
            category: "ugc",
            rarity: "OR",
            growTicks: 4,
            water: null,
            seedPrice: 20,
            sellPrice: 80,
            family: null,
            unlockTier: null,
            mechanicText: null,
            mechanicStatus: "active",
            mechanicSystem: null,
            unlockType: "craft",
            unlockCond: "自创作物",
            produce: null,
            designer: "渡",
            designerId: "3ET3FE",
            plantLine: "种下一点月光。",
            lore: "收起一颗月亮。",
          },
          fee: 200,
          seeds: 5,
          coins_balance: 800,
        },
      },
      revision: `farm-original-plant-v1:${"c".repeat(64)}`,
      server_time: "2026-08-24T04:01:00.000Z",
    },
  } as const;
}

const KITCHEN_RESULT = {
  ok: true,
  data: {
    data: {
      farm: { farm_doorplate: "3ET3FE", farm_name: "渡的小农场" },
      balance: {
        silver: { status: "available", value: 100, reason: null },
        ranch_coins: { status: "available", value: 10, reason: null },
      },
      tools: { status: "unavailable", items: [], reason: "not_persisted" },
      stacked_ingredients: { status: "unavailable", items: [], reason: "not_initialized" },
      product_instances: { status: "unavailable", items: [], reason: "not_initialized" },
      fish_instances: { status: "unavailable", items: [], reason: "not_initialized" },
      treasure_items: { status: "unavailable", items: [], reason: "not_initialized" },
      dish_instances: { status: "unavailable", items: [], reason: "not_initialized" },
      known_recipes: { status: "unavailable", items: [], reason: "not_initialized" },
      daily_shop: {
        status: "available",
        stored_day_index: 20700,
        current_day_index: 20700,
        is_current_day: true,
        refresh_at: "2026-08-25T00:00:00.000Z",
        refresh_window_id: 20700,
        refresh_used_count: 0,
        refresh_remaining_count: 10,
        refresh_limit: 10,
        next_cost_coins: 100,
        can_refresh: true,
        refresh_reset_at: "2026-08-25T00:00:00.000Z",
        ingredients: [
          {
            status: "available",
            ingredient_id: "salt",
            name: "盐",
            price_silver: 5,
            daily_buy_limit: 10,
            bought_quantity: 0,
            reason: null,
          },
        ],
        recipes: [
          {
            status: "available",
            recipe_id: "honey_tea",
            name: "蜂蜜茶",
            rarity: "R",
            category: "饮品",
            ingredients: [
              {
                status: "available",
                ingredient_id: "honey",
                name: "蜂蜜",
                quantity: 1,
                reason: null,
              },
              {
                status: "available",
                ingredient_id: "tea",
                name: "茶叶",
                quantity: 1,
                reason: null,
              },
            ],
            method: {
              status: "unavailable",
              id: null,
              name: null,
              reason: "not_persisted",
            },
            tool: {
              status: "unavailable",
              id: null,
              name: null,
              reason: "not_persisted",
            },
            reason: null,
            price_silver: 30,
            known: false,
          },
        ],
        reason: null,
      },
    },
    kitchen_inventory_revision: `kitchen-inventory-v1:${"f".repeat(64)}`,
    shop_revision: `kitchen-v1:${"a".repeat(64)}`,
    server_time: "2026-08-24T04:00:00.000Z",
  },
} as const;

const KITCHEN_COOK_BEFORE = `kitchen-inventory-v1:${"1".repeat(64)}`;
const KITCHEN_COOK_AFTER = `kitchen-inventory-v1:${"2".repeat(64)}`;
const KITCHEN_COOK_ITEMS = ["rice", "salt"] as const;

const KITCHEN_COOK_RESULT = {
  ...KITCHEN_RESULT,
  data: {
    ...KITCHEN_RESULT.data,
    data: {
      ...KITCHEN_RESULT.data.data,
      stacked_ingredients: {
        status: "available",
        items: [
          { status: "available", ingredient_id: "rice", name: "大米", quantity: 1, reason: null },
          { status: "available", ingredient_id: "salt", name: "盐", quantity: 1, reason: null },
        ],
        reason: null,
      },
    },
    kitchen_inventory_revision: KITCHEN_COOK_BEFORE,
  },
} as const;

function kitchenCookSuccess(idempotencyKey: string, itemRefs: string[] = [...KITCHEN_COOK_ITEMS]) {
  return {
    ok: true,
    data: {
      data: {
        result: {
          receipt_id: idempotencyKey,
          outcome: {
            kind: "cook",
            item_refs: itemRefs,
            dish_instance_id: "dish-1",
            recipe_id: "odd_dish",
            name: "微妙的料理",
            rarity: "N",
            value_gold: 1,
            recycle_silver: 0,
            odd: true,
            discovered: false,
            qixi: null,
          },
        },
        resource: {
          ...KITCHEN_COOK_RESULT.data.data,
          stacked_ingredients: {
            ...KITCHEN_COOK_RESULT.data.data.stacked_ingredients,
            items: [],
          },
        },
      },
      kitchen_inventory_revision: KITCHEN_COOK_AFTER,
      server_time: "2026-08-25T04:01:00.000Z",
    },
  } as const;
}

function kitchenPurchaseSuccess(idempotencyKey: string) {
  return {
    ok: true,
    data: {
      data: {
        result: {
          receipt_id: idempotencyKey,
          items: [
            {
              kind: "ingredient",
              item_id: "salt",
              quantity: 1,
              total_price_silver: 5,
            },
            {
              kind: "recipe",
              item_id: "honey_tea",
              quantity: 1,
              total_price_silver: 30,
            },
          ],
          total_price_silver: 35,
          silver_balance: 65,
        },
        resource: {
          ...KITCHEN_RESULT.data.data,
          balance: {
            ...KITCHEN_RESULT.data.data.balance,
            silver: { status: "available", value: 65, reason: null },
          },
        },
      },
      shop_revision: `kitchen-v1:${"b".repeat(64)}`,
      server_time: "2026-08-24T04:01:00.000Z",
    },
  } as const;
}

const KITCHEN_TOOL_SHOP_BEFORE = `kitchen-v1:${"3".repeat(64)}`;
const KITCHEN_TOOL_SHOP_AFTER = `kitchen-v1:${"4".repeat(64)}`;

function kitchenToolResource(owned: boolean, silver: number) {
  return {
    ...KITCHEN_RESULT.data.data,
    balance: {
      ...KITCHEN_RESULT.data.data.balance,
      silver: { status: "available", value: silver, reason: null },
    },
    tools: {
      status: "available",
      items: [
        {
          status: "available",
          tool_id: "steam",
          name: "蒸笼",
          price_silver: 1_200,
          owned,
          reason: null,
        },
      ],
      reason: null,
    },
  } as const;
}

const KITCHEN_TOOL_RESULT = {
  ...KITCHEN_RESULT,
  data: {
    ...KITCHEN_RESULT.data,
    data: kitchenToolResource(false, 2_000),
    shop_revision: KITCHEN_TOOL_SHOP_BEFORE,
  },
} as const;

function kitchenToolPurchaseSuccess(idempotencyKey: string) {
  return {
    ok: true,
    data: {
      data: {
        result: {
          receipt_id: idempotencyKey,
          items: [{ kind: "tool", item_id: "steam", quantity: 1, total_price_silver: 1_200 }],
          total_price_silver: 1_200,
          silver_balance: 800,
        },
        resource: kitchenToolResource(true, 800),
      },
      shop_revision: KITCHEN_TOOL_SHOP_AFTER,
      server_time: "2026-08-25T04:01:00.000Z",
    },
  } as const;
}

function kitchenShopRefreshSuccess(idempotencyKey: string) {
  const resource = {
    ...KITCHEN_RESULT.data.data,
    daily_shop: {
      ...KITCHEN_RESULT.data.data.daily_shop,
      refresh_used_count: 1,
      refresh_remaining_count: 9,
      next_cost_coins: 200,
    },
  } as const;
  return {
    ok: true,
    data: {
      data: {
        result: {
          receipt_id: idempotencyKey,
          cost_coins: 100,
          coins_balance: 0,
          refresh_window_id: 20700,
          refresh_used_count: 1,
          refresh_remaining_count: 9,
          refresh_limit: 10,
          next_cost_coins: 200,
          can_refresh: true,
        },
        resource,
      },
      shop_revision: `kitchen-v1:${"b".repeat(64)}`,
      server_time: "2026-08-24T04:01:00.000Z",
    },
  } as const;
}

function kitchenWithoutDailyShopItems(shopRevision: string) {
  return {
    ...KITCHEN_RESULT,
    data: {
      ...KITCHEN_RESULT.data,
      data: {
        ...KITCHEN_RESULT.data.data,
        daily_shop: {
          ...KITCHEN_RESULT.data.data.daily_shop,
          ingredients: [],
          recipes: [],
        },
      },
      shop_revision: shopRevision,
    },
  } as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function renderLiveFarm() {
  render(<FarmPage onBack={() => undefined} />);
  await screen.findByRole("button", { name: "一键帮 TA 收" });
}

async function openFilledCookingCart() {
  fireEvent.click(screen.getByRole("button", { name: "料理台" }));
  await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "商店" }));
  const shop = await screen.findByRole("region", { name: "料理台商店" });
  fireEvent.click(within(shop).getByRole("button", { name: "调味" }));
  fireEvent.click(within(shop).getByRole("button", { name: "将盐加入购物车" }));
  fireEvent.click(within(shop).getByRole("button", { name: "食谱" }));
  fireEvent.click(await within(shop).findByRole("button", { name: "将蜂蜜茶加入购物车" }));
  fireEvent.click(within(shop).getByRole("button", { name: "查看购物车，2件" }));
  await screen.findByRole("region", { name: "购物车" });
}

async function openFilledCookingPrep() {
  fireEvent.click(screen.getByRole("button", { name: "料理台" }));
  await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "放入食材" }));
  const picker = await screen.findByRole("region", { name: "选择食材" });
  fireEvent.click(within(picker).getByRole("button", { name: "放入大米" }));
  fireEvent.click(within(picker).getByRole("button", { name: "调味" }));
  fireEvent.click(within(picker).getByRole("button", { name: "放入盐" }));
  fireEvent.click(within(picker).getByRole("button", { name: "关闭食材选择" }));
}

beforeEach(() => {
  clients.catalog.mockReset();
  clients.cook
    .mockReset()
    .mockImplementation(async (input: { idempotencyKey: string }) =>
      kitchenCookSuccess(input.idempotencyKey),
    );
  clients.field.mockReset().mockResolvedValue({ ok: true, data: FIELD_BEFORE });
  clients.farmPurchaseRequest
    .mockReset()
    .mockImplementation(async (input) => farmPurchaseRequestSuccess(input));
  clients.harvest.mockReset().mockResolvedValue(HARVEST_SUCCESS);
  clients.kitchen.mockReset().mockResolvedValue(KITCHEN_RESULT);
  clients.market.mockReset();
  clients.originalPlant
    .mockReset()
    .mockImplementation(async (input: { idempotencyKey: string }) =>
      originalPlantSuccess(input.idempotencyKey),
    );
  clients.openFarmShop
    .mockReset()
    .mockImplementation(
      async (input: { expectedShopRevision: string | null; idempotencyKey: string }) => {
        const current = fieldShopCatalogResult().data.data.shop;
        return {
          ok: true,
          data: {
            data: {
              result: { receipt_id: input.idempotencyKey, refreshed: false },
              resource: current,
            },
            shop_revision: current.revision,
            server_time: "2026-08-30T04:00:00.000Z",
          },
        };
      },
    );
  clients.purchase
    .mockReset()
    .mockImplementation(async (input: { idempotencyKey: string }) =>
      kitchenPurchaseSuccess(input.idempotencyKey),
    );
  clients.ranch.mockReset().mockResolvedValue(RANCH_RESULT);
  clients.ranchDecoration
    .mockReset()
    .mockImplementation(async (input: { idempotencyKey: string }) =>
      ranchDecorationSuccess(input.idempotencyKey),
    );
  clients.refreshKitchenShop
    .mockReset()
    .mockImplementation(async (input: { idempotencyKey: string }) =>
      kitchenShopRefreshSuccess(input.idempotencyKey),
    );
  clients.settings.mockReset();
  clients.smelting
    .mockReset()
    .mockImplementation(async (input: { idempotencyKey: string }) =>
      smeltingActionSuccess(input.idempotencyKey),
    );
  clients.upgrade.mockReset().mockResolvedValue(LAND_UPGRADE_SUCCESS);
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
});

describe("Farm expedition Human UI", () => {
  it("switches independent journey sections and submits the hidden stable choice key", async () => {
    const base = catalogResult("普通种子", "渡的小农场").data;
    const farmCatalog = {
      ...base,
      data: {
        ...base.data,
        expedition: {
          status: "available",
          daily_limit: 3,
          used_today: 1,
          remaining_today: 2,
          active: true,
          map_id: "starlight_map_internal",
          map_name: "星砂剧场",
          step: 4,
          hp: 3,
          pending: {
            kind: "choice",
            event_id: "mirror_path_internal",
            identity_state: "known",
            title: "镜子后面的岔路",
            options: [
              { key: "route_star", label: "沿着落下的星光往前走" },
              { key: "route_stream", label: "回到有水声的旧走廊" },
            ],
            foe: null,
            difficulty: null,
          },
          bag: [
            {
              kind: "decor",
              quantity: 1,
              item_id: "moon_chime_internal",
              identity_state: "known",
              name: "月亮风铃",
            },
          ],
          seen_event_ids: ["mirror_path_internal", "lost_ticket_internal"],
          log: [
            {
              event_id: "mirror_path_internal",
              title: "镜子后面的岔路",
              text: "风从两条走廊同时吹了过来。",
              at: "2026-08-30T07:00:00.000Z",
            },
          ],
          journeys: [
            {
              map_id: "mushroom_map_internal",
              map_name: "幻菇林",
              at: "2026-08-29T07:00:00.000Z",
              summary: "从孢子雨里带回了一盏菌灯。",
              log: [],
            },
          ],
        },
      },
    } as unknown as BoundFarmCatalogRead;
    const onExpeditionAction = vi.fn<ExpeditionActionExecutor>(async () => ({
      ok: false as const,
      issue: {
        code: "action_rejected" as const,
        currentRevision: null,
        serverMessage: "暂时不能选择",
      },
    }));

    render(
      <FarmExpeditionPanelContent
        expedition={
          farmCatalog.data.expedition as Extract<
            BoundFarmCatalogRead["data"]["expedition"],
            { status: "available" }
          >
        }
        farmCatalog={farmCatalog}
        onExpeditionAction={onExpeditionAction}
      />,
    );

    expect(screen.getByText("星砂剧场")).toBeTruthy();
    expect(screen.getByText("第 4 格")).toBeTruthy();
    expect(screen.queryByText("route_star")).toBeNull();
    expect(screen.queryByText("mirror_path_internal")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "沿着落下的星光往前走" }));
    await waitFor(() => expect(onExpeditionAction).toHaveBeenCalledTimes(1));
    expect(onExpeditionAction.mock.calls[0]?.[0]).toMatchObject({
      action: "choose",
      payload: { option: "route_star" },
    });

    fireEvent.click(screen.getByRole("button", { name: "行囊" }));
    expect(screen.getByText("月亮风铃")).toBeTruthy();
    expect(screen.queryByText("moon_chime_internal")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "本趟故事" }));
    expect(screen.getByText("风从两条走廊同时吹了过来。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "秘境图鉴" }));
    expect(screen.getByText("已发现 2 个秘境片段")).toBeTruthy();
    expect(screen.queryByText("lost_ticket_internal")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "旅程簿" }));
    expect(screen.getByText("幻菇林")).toBeTruthy();
    expect(screen.getByText("从孢子雨里带回了一盏菌灯。")).toBeTruthy();
  });
});

function dispatchCatalog(
  messageBoards:
    | Array<{
        farm_doorplate: string;
        farm_name: string;
        ai_name?: string | null;
        is_own: boolean;
        status: "open" | "closed";
        messages: [];
      }>
    | undefined,
): BoundFarmCatalogRead {
  const base = catalogResult("普通种子", "渡的小农场").data;
  return {
    ...base,
    data: {
      ...base.data,
      neighborhood: {
        status: "available",
        rankings: {
          harvest: [
            {
              farm_doorplate: "3ET3FE",
              farm_name: "渡的小农场",
              value: 9,
              equipped_title: null,
            },
            {
              farm_doorplate: "352HQ6",
              farm_name: "排行榜里的夏安农场",
              value: 8,
              equipped_title: null,
            },
          ],
          wealth: [
            {
              farm_doorplate: "352HQ6",
              farm_name: "重复的夏安农场",
              value: 7,
              equipped_title: null,
            },
            {
              farm_doorplate: "CD9KVW",
              farm_name: "排行榜里的悬崖边",
              value: 6,
              equipped_title: null,
            },
          ],
        },
        messages: [],
        ...(messageBoards === undefined ? {} : { message_boards: messageBoards }),
        original_crops: [],
      },
    },
  } as unknown as BoundFarmCatalogRead;
}

function dispatchRanch(): BoundRanchRead {
  return {
    ...RANCH_RESULT.data,
    data: {
      ...RANCH_RESULT.data.data,
      residents: {
        status: "available",
        animals: [
          {
            status: "known",
            identity: { status: "known", kind_id: "cow", name: "奶牛", custom_name: "花花" },
            level: 1,
            pinned: false,
            accessories: { status: "available", items: [] },
            produce: null,
            dispatch: { state: "home", raid_id: null },
          },
        ],
        pets: [],
        patrol_goose: null,
      },
    },
  } as unknown as BoundRanchRead;
}

describe("Ranch dispatch target selection", () => {
  it("offers only production animals accepted by the dispatch authority", () => {
    const ranch = dispatchRanch();
    if (ranch.data.dispatch.status !== "available") throw new Error("dispatch fixture");
    ranch.data.residents.pets = [
      {
        status: "known",
        identity: { status: "known", kind_id: "cat", name: "猫", custom_name: "星夜" },
        level: 1,
        pinned: false,
        accessories: { status: "available", items: [] },
        produce: null,
        dispatch: { state: "home", raid_id: null },
      },
    ];
    ranch.data.residents.patrol_goose = {
      status: "known",
      identity: {
        status: "known",
        kind_id: "patrol_goose",
        name: "巡逻鹅",
        custom_name: "鹅警长",
      },
      level: 1,
      pinned: false,
      accessories: { status: "available", items: [] },
      produce: null,
      dispatch: { state: "home", raid_id: null },
    };

    render(
      <RanchDispatchPanelContent
        dispatch={ranch.data.dispatch}
        farmCatalog={dispatchCatalog(undefined)}
        onRanchInteractionAction={vi.fn()}
        ranch={ranch}
      />,
    );

    const animalSelect = screen.getByRole("combobox", { name: "动物" });
    expect(
      within(animalSelect)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["花花"]);
    expect(within(animalSelect).queryByRole("option", { name: "星夜" })).toBeNull();
    expect(within(animalSelect).queryByRole("option", { name: "鹅警长" })).toBeNull();
  });

  it("offers every real non-own message board and submits the selected original doorplate", async () => {
    const farmCatalog = dispatchCatalog([
      {
        farm_doorplate: "3ET3FE",
        farm_name: "渡的小农场",
        is_own: true,
        status: "open",
        messages: [],
      },
      {
        farm_doorplate: "352HQ6",
        farm_name: "夏安农场",
        ai_name: "夏知",
        is_own: false,
        status: "open",
        messages: [],
      },
      {
        farm_doorplate: "CD9KVW",
        farm_name: "悬崖边",
        ai_name: "Cliffside",
        is_own: false,
        status: "closed",
        messages: [],
      },
    ]);
    const ranch = dispatchRanch();
    if (ranch.data.dispatch.status !== "available") throw new Error("dispatch fixture");
    const onAction = vi.fn(async (_input: Parameters<RanchInteractionActionExecutor>[0]) => ({
      ok: false as const,
      issue: {
        code: "network_unavailable" as const,
        currentRevision: null,
        serverMessage: null,
      },
    }));

    render(
      <RanchDispatchPanelContent
        dispatch={ranch.data.dispatch}
        farmCatalog={farmCatalog}
        onRanchInteractionAction={onAction}
        ranch={ranch}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "目标农场门牌" })).toBeNull();
    const target = screen.getByRole("combobox", { name: "目标农场" });
    expect(within(target).getByRole("option", { name: "夏安农场（夏知）" })).toBeTruthy();
    expect(within(target).getByRole("option", { name: "悬崖边（Cliffside）" })).toBeTruthy();
    expect(within(target).queryByRole("option", { name: /排行榜里的/ })).toBeNull();

    fireEvent.change(target, { target: { value: "CD9KVW" } });
    fireEvent.click(screen.getByRole("button", { name: "派遣" }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction.mock.calls[0]?.[0]).toMatchObject({
      action: "dispatch",
      animalKindId: "cow",
      durationHours: 1,
      expectedRevision: ranch.revision,
      targetFarmDoorplate: "CD9KVW",
    });
  });

  it("deduplicates ranking farms only when an older catalog omits message boards", () => {
    const ranch = dispatchRanch();
    if (ranch.data.dispatch.status !== "available") throw new Error("dispatch fixture");

    render(
      <RanchDispatchPanelContent
        dispatch={ranch.data.dispatch}
        farmCatalog={dispatchCatalog(undefined)}
        onRanchInteractionAction={vi.fn()}
        ranch={ranch}
      />,
    );

    const options = within(screen.getByRole("combobox", { name: "目标农场" })).getAllByRole(
      "option",
    );
    expect(options.map((option) => option.textContent)).toEqual([
      "排行榜里的夏安农场",
      "排行榜里的悬崖边",
    ]);
  });
});

describe("FarmPage authority resource lifecycle", () => {
  it("reloads an opened backpack after harvest and reinitializes settings from authority data", async () => {
    clients.catalog
      .mockResolvedValueOnce(catalogResult("旧种子", "旧目录农场"))
      .mockResolvedValueOnce(catalogResult("新种子", "新目录农场"));
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "背包" }));
    expect(await screen.findByText("旧种子")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭背包" }));

    fireEvent.click(screen.getByRole("button", { name: "一键帮 TA 收" }));
    await screen.findByRole("dialog", { name: "帮收结果" });
    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "关闭帮收结果" }));

    fireEvent.click(screen.getByRole("button", { name: "背包" }));
    expect(await screen.findByText("新种子")).toBeTruthy();
    expect(screen.queryByText("旧种子")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭背包" }));

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    await waitFor(() =>
      expect((screen.getByLabelText("农场名") as HTMLInputElement).value).toBe("新目录农场"),
    );
  });

  it("refreshes field and every authority resource that the player already loaded", async () => {
    clients.catalog.mockResolvedValue(catalogResult("旧种子", "旧目录农场"));
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "背包" }));
    await screen.findByText("旧种子");
    fireEvent.click(screen.getByRole("button", { name: "关闭背包" }));
    fireEvent.click(screen.getByRole("button", { name: "牧场" }));
    await waitFor(() => expect(clients.ranch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "料理台" }));
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "重新读取农场数据" }));

    await waitFor(() => {
      expect(clients.field).toHaveBeenCalledTimes(2);
      expect(clients.catalog).toHaveBeenCalledTimes(2);
      expect(clients.ranch).toHaveBeenCalledTimes(2);
      expect(clients.kitchen).toHaveBeenCalledTimes(2);
    });
  });

  it("uses the refreshed field revision for harvest after a kitchen mutation", async () => {
    clients.field
      .mockResolvedValueOnce({ ok: true, data: FIELD_BEFORE })
      .mockResolvedValueOnce({ ok: true, data: FIELD_AFTER_CROSS_MUTATION });
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "料理台" }));
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("region", { name: "料理台商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(clients.field).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "农场" }));
    fireEvent.click(await screen.findByRole("button", { name: "一键帮 TA 收" }));
    await waitFor(() => expect(clients.harvest).toHaveBeenCalledTimes(1));
    expect(clients.harvest.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: FIELD_AFTER_CROSS_MUTATION.revision,
    });
  });

  it("reuses the same idempotency key when a network-unknown harvest is retried", async () => {
    clients.harvest
      .mockResolvedValueOnce({
        ok: false,
        issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
      })
      .mockResolvedValueOnce(HARVEST_SUCCESS);
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "一键帮 TA 收" }));
    fireEvent.click(await screen.findByRole("button", { name: "重试同一次帮收" }));

    await waitFor(() => expect(clients.harvest).toHaveBeenCalledTimes(2));
    expect(clients.harvest.mock.calls[1]?.[0]).toEqual(clients.harvest.mock.calls[0]?.[0]);
  });

  it("submits the current field revision and replaces the page with the land upgrade receipt", async () => {
    clients.field.mockResolvedValue({ ok: true, data: FIELD_UPGRADE_AVAILABLE });
    await renderLiveFarm();

    const upgradeButton = screen.getByRole("button", { name: "升级土地" });
    expect((upgradeButton as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("下一阶 · 熟地")).toBeTruthy();
    expect(screen.getByText("9 块地 · 3,500 金币")).toBeTruthy();
    fireEvent.click(upgradeButton);

    await waitFor(() => expect(clients.upgrade).toHaveBeenCalledTimes(1));
    expect(clients.upgrade.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: FIELD_UPGRADE_AVAILABLE.revision,
    });
    const receipt = await screen.findByRole("status", { name: "土地升级结果" });
    expect(within(receipt).getByText("土地升级完成")).toBeTruthy();
    expect(within(receipt).getByText(/初土 → 熟地 · 地块 6 → 9 · 金币 -3,500/)).toBeTruthy();
    expect(screen.getByText("土地 2 · 熟地")).toBeTruthy();
    expect(screen.getByText("下一阶 · 沃土")).toBeTruthy();
  });

  it("shows Farm's blocking upgrade fact and does not submit a disabled action", async () => {
    await renderLiveFarm();

    const upgradeButton = screen.getByRole("button", { name: "升级土地" });
    expect((upgradeButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/金币 10\/3500、普通图鉴 0\/6 种/)).toBeTruthy();
    fireEvent.click(upgradeButton);
    expect(clients.upgrade).not.toHaveBeenCalled();
  });

  it("does not let an aborted older catalog request overwrite a newer refresh", async () => {
    const older = deferred<ReturnType<typeof catalogResult>>();
    const newer = deferred<ReturnType<typeof catalogResult>>();
    clients.catalog
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "背包" }));
    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "重新读取农场数据" }));
    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(2));

    await act(async () => {
      newer.resolve(catalogResult("新种子", "新目录农场"));
    });
    await screen.findByRole("button", { name: "一键帮 TA 收" });
    fireEvent.click(screen.getByRole("button", { name: "背包" }));
    expect(await screen.findByText("新种子")).toBeTruthy();

    await act(async () => {
      older.resolve(catalogResult("旧种子", "旧目录农场"));
    });
    expect(screen.queryByText("旧种子")).toBeNull();
    expect(screen.getByText("新种子")).toBeTruthy();
  });

  it("does not let an older field response overwrite a newer manual refresh", async () => {
    const older = deferred<{ ok: true; data: typeof FIELD_AFTER_CROSS_MUTATION }>();
    const newer = deferred<{ ok: true; data: typeof FIELD_AFTER }>();
    clients.field
      .mockResolvedValueOnce({ ok: true, data: FIELD_BEFORE })
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "料理台" }));
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("region", { name: "料理台商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(clients.field).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "重新读取农场数据" }));
    await waitFor(() => expect(clients.field).toHaveBeenCalledTimes(3));
    await act(async () => {
      newer.resolve({ ok: true, data: FIELD_AFTER });
    });
    await screen.findByRole("button", { name: "一键帮 TA 收" });
    expect(screen.getByRole("status", { name: "农场金币余额 55" })).toBeTruthy();

    await act(async () => {
      older.resolve({ ok: true, data: FIELD_AFTER_CROSS_MUTATION });
    });
    expect(screen.getByRole("status", { name: "农场金币余额 55" })).toBeTruthy();
  });
});

describe("FarmPage cross-farm market actions", () => {
  it.each(["ingredient", "dish"] as const)(
    "reloads an opened cooking inventory after buying a %s at the market",
    async (kind) => {
      clients.catalog.mockResolvedValue(marketCookingCatalogResult(kind));
      clients.market.mockResolvedValue(marketBuySuccess("00000000-0000-4000-8000-000000000000"));
      await renderLiveFarm();

      fireEvent.click(screen.getByRole("button", { name: "料理台" }));
      await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole("button", { name: "农场" }));
      fireEvent.click(screen.getByRole("button", { name: "集市" }));
      const market = await screen.findByRole("region", { name: "真实集市" });
      fireEvent.click(within(market).getByRole("button", { name: "购买" }));

      await waitFor(() => expect(clients.market).toHaveBeenCalledTimes(1));
      expect(clients.market.mock.calls[0]?.[0]).toMatchObject({ kind });
      await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(2));
    },
  );

  it("buys another farm's ordinary listing, accepts its barter listing, and keeps own listings removable", async () => {
    clients.catalog.mockResolvedValue(marketCatalogResult());
    clients.market.mockImplementation(async (input: { action: string; idempotencyKey: string }) =>
      input.action === "buy"
        ? marketBuySuccess(input.idempotencyKey)
        : marketBarterAcceptSuccess(input.idempotencyKey),
    );
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "集市" }));
    const market = await screen.findByRole("region", { name: "真实集市" });
    expect(within(market).getByRole("button", { name: "购买" })).toBeTruthy();
    expect(within(market).getByRole("button", { name: "接受换物" })).toBeTruthy();
    expect(within(market).getByRole("button", { name: "下架" })).toBeTruthy();
    expect(within(market).getByRole("button", { name: "撤下" })).toBeTruthy();
    expect(within(market).queryByText(/跨农场购买与接受换物/)).toBeNull();

    fireEvent.click(within(market).getByRole("button", { name: "购买" }));
    await waitFor(() => expect(clients.market).toHaveBeenCalledTimes(1));
    expect(clients.market.mock.calls[0]?.[0]).toMatchObject({
      action: "buy",
      sellerDoorplate: "ABC234",
      kind: "material",
      itemId: "ordinary_stone",
      quantity: 1,
      expectedRevision: MARKET_BEFORE,
    });
    expect(clients.market.mock.calls[0]?.[0].idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(2));

    fireEvent.click(within(market).getByRole("button", { name: "接受换物" }));
    await waitFor(() => expect(clients.market).toHaveBeenCalledTimes(2));
    expect(clients.market.mock.calls[1]?.[0]).toMatchObject({
      action: "barter-accept",
      sellerDoorplate: "ABC234",
      listingId: MARKET_BARTER_LISTING_ID,
      expectedRevision: MARKET_BEFORE,
    });
    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(3));
  });

  it("retries a network-unknown market action with the same payload and UUID", async () => {
    clients.catalog.mockResolvedValue(marketCatalogResult());
    clients.market
      .mockResolvedValueOnce({
        ok: false,
        issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
      })
      .mockImplementationOnce(async (input: { idempotencyKey: string }) =>
        marketBuySuccess(input.idempotencyKey),
      );
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "集市" }));
    const market = await screen.findByRole("region", { name: "真实集市" });
    fireEvent.click(within(market).getByRole("button", { name: "购买" }));
    fireEvent.click(await within(market).findByRole("button", { name: "重试" }));

    await waitFor(() => expect(clients.market).toHaveBeenCalledTimes(2));
    expect(clients.market.mock.calls[1]?.[0]).toEqual(clients.market.mock.calls[0]?.[0]);
    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(2));
  });

  it("refreshes the market catalog after a state conflict without offering a replay", async () => {
    clients.catalog.mockResolvedValue(marketCatalogResult());
    clients.market.mockResolvedValue({
      ok: false,
      issue: {
        code: "state_conflict",
        currentRevision: MARKET_AFTER,
        serverMessage: "集市状态已变化",
      },
    });
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "集市" }));
    const market = await screen.findByRole("region", { name: "真实集市" });
    fireEvent.click(within(market).getByRole("button", { name: "购买" }));

    await waitFor(() => {
      expect(clients.market).toHaveBeenCalledTimes(1);
      expect(clients.catalog).toHaveBeenCalledTimes(2);
    });
    expect(within(market).queryByRole("button", { name: "重试" })).toBeNull();
  });
});

describe("FarmPage original plant and ranch decoration actions", () => {
  it("submits three copies of the same material to the existing Human smelting action", async () => {
    clients.catalog.mockResolvedValue(smeltingCatalogResult());
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "熔炼" }));
    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(1));
    const smeltingPanel = await screen.findByRole("region", { name: "熔炼素材选择" });
    fireEvent.click(within(smeltingPanel).getByRole("button", { name: "选择普通石头" }));
    fireEvent.click(within(smeltingPanel).getByRole("button", { name: "选择普通石头，已选 1 份" }));
    expect(
      within(smeltingPanel).getByRole("button", { name: "减少一份普通石头" }).textContent,
    ).toBe("2");
    fireEvent.click(within(smeltingPanel).getByRole("button", { name: "选择普通石头，已选 2 份" }));
    fireEvent.click(within(smeltingPanel).getByRole("button", { name: "开始熔炼" }));

    await waitFor(() => expect(clients.smelting).toHaveBeenCalledTimes(1));
    expect(clients.smelting.mock.calls[0]?.[0]).toMatchObject({
      expectedFarmDoorplate: "3ET3FE",
      expectedSmeltingRevision: SMELTING_BEFORE,
      materialIds: [...SMELTING_MATERIAL_IDS],
    });
    expect(clients.smelting.mock.calls[0]?.[0].idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(await screen.findByRole("region", { name: "熔炼结果" })).toBeTruthy();
    expect(screen.getByText("月光麦")).toBeTruthy();
    expect(screen.getByText("SR")).toBeTruthy();
  });

  it("submits an original plant with the catalog authority revision and shows only the receipt", async () => {
    clients.catalog.mockResolvedValue(catalogResult("普通种子", "渡的小农场"));
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "创造" }));
    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "月光番茄" } });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "在月光里慢慢变甜。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成设计" }));

    await waitFor(() => expect(clients.originalPlant).toHaveBeenCalledTimes(1));
    expect(clients.originalPlant.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: `farm-original-plant-v1:${"b".repeat(64)}`,
      name: "月光番茄",
      desc: "在月光里慢慢变甜。",
      latin: "",
      plant: "",
      harvest: "",
    });
    expect(clients.originalPlant.mock.calls[0]?.[0].idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(await screen.findByText("月光番茄")).toBeTruthy();
    expect(screen.getByText(/消耗 200 农场金币 · 获得 5 颗起步种子/)).toBeTruthy();
    await waitFor(() => {
      expect(clients.catalog).toHaveBeenCalledTimes(2);
      expect(clients.field).toHaveBeenCalledTimes(2);
    });
  });

  it("retries a network-unknown original plant action with the same payload and key", async () => {
    clients.catalog.mockResolvedValue(catalogResult("普通种子", "渡的小农场"));
    clients.originalPlant
      .mockResolvedValueOnce({
        ok: false,
        issue: { code: "network_unavailable", currentRevision: null, serverMessage: null },
      })
      .mockImplementationOnce(async (input: { idempotencyKey: string }) =>
        originalPlantSuccess(input.idempotencyKey),
      );
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "创造" }));
    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "月光番茄" } });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "在月光里慢慢变甜。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成设计" }));
    fireEvent.click(await screen.findByRole("button", { name: "重试设计" }));

    await waitFor(() => expect(clients.originalPlant).toHaveBeenCalledTimes(2));
    expect(clients.originalPlant.mock.calls[1]?.[0]).toEqual(
      clients.originalPlant.mock.calls[0]?.[0],
    );
  });

  it("places a stored ranch decoration and replaces the ranch resource", async () => {
    clients.ranch.mockResolvedValueOnce(RANCH_WITH_STORED_DECORATION).mockResolvedValue({
      ...RANCH_WITH_STORED_DECORATION,
      data: {
        ...RANCH_WITH_STORED_DECORATION.data,
        data: {
          ...RANCH_WITH_STORED_DECORATION.data.data,
          decorations: {
            status: "available",
            placed: [{ status: "known", decoration_id: "lantern_warm", name: "暖灯" }],
            stored: [],
          },
        },
      },
    });
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "牧场" }));
    await waitFor(() => expect(clients.ranch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "背包" }));
    fireEvent.click(await screen.findByRole("button", { name: "装饰" }));
    fireEvent.click(screen.getByRole("button", { name: "摆放" }));

    await waitFor(() => expect(clients.ranchDecoration).toHaveBeenCalledTimes(1));
    expect(clients.ranchDecoration.mock.calls[0]?.[0]).toMatchObject({
      action: "place",
      decorationId: "lantern_warm",
      expectedRevision: RANCH_WITH_STORED_DECORATION.data.revision,
    });
    expect(await screen.findByRole("button", { name: "收回" })).toBeTruthy();
    expect(screen.getByText("暖灯已摆放")).toBeTruthy();
  });
});

describe("FarmPage authority settings actions", () => {
  it("saves both nicknames through one-field authority actions, including clearing a nickname", async () => {
    const initialBase = catalogResult("普通种子", "渡的小农场");
    const initial = {
      ...initialBase,
      data: {
        ...initialBase.data,
        data: {
          ...initialBase.data.data,
          settings: { ...initialBase.data.data.settings, human_name: "辛玥" },
        },
      },
    };
    const updatedSettings: Extract<
      BoundFarmCatalogRead["data"]["settings"],
      { status: "available" }
    > = {
      ...initial.data.data.settings,
      ai_name: "小渡",
      human_name: null,
      social: { ...initial.data.data.settings.social },
      unlocked_titles: [...initial.data.data.settings.unlocked_titles],
    };
    clients.catalog.mockResolvedValue(initial);
    clients.settings.mockImplementation(
      async (input: { field: string; idempotencyKey: string; value: unknown }) =>
        settingsActionSuccess(input.idempotencyKey, input.field, {
          ...updatedSettings,
          human_name: input.field === "human_name" ? null : "辛玥",
        }),
    );
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    const aiInput = (await screen.findByLabelText("小机昵称")) as HTMLInputElement;
    fireEvent.change(aiInput, { target: { value: "小渡" } });
    const aiItem = aiInput.closest<HTMLElement>(".farm-settings__item");
    expect(aiItem).not.toBeNull();
    fireEvent.click(within(aiItem as HTMLElement).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(clients.settings).toHaveBeenCalledTimes(1));
    expect(clients.settings.mock.calls[0]?.[0]).toMatchObject({ field: "ai_name", value: "小渡" });
    expect(clients.settings.mock.calls[0]?.[0].idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    await waitFor(() => expect(clients.catalog).toHaveBeenCalledTimes(2));
    const humanInput = screen.getByLabelText("你的昵称") as HTMLInputElement;
    expect(humanInput.value).toBe("辛玥");
    fireEvent.change(humanInput, { target: { value: "" } });
    const humanItem = humanInput.closest<HTMLElement>(".farm-settings__item");
    expect(humanItem).not.toBeNull();
    fireEvent.click(within(humanItem as HTMLElement).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(clients.settings).toHaveBeenCalledTimes(2));
    expect(clients.settings.mock.calls[1]?.[0]).toMatchObject({ field: "human_name", value: "" });
  });

  it("submits a social switch directly instead of keeping a local-only toggle", async () => {
    const initial = catalogResult("普通种子", "渡的小农场");
    const updatedSettings: Extract<
      BoundFarmCatalogRead["data"]["settings"],
      { status: "available" }
    > = {
      ...initial.data.data.settings,
      social: { ...initial.data.data.settings.social, visit: true },
      unlocked_titles: [...initial.data.data.settings.unlocked_titles],
    };
    clients.catalog.mockResolvedValue(initial);
    clients.settings.mockImplementation(async (input: { field: string; idempotencyKey: string }) =>
      settingsActionSuccess(input.idempotencyKey, input.field, updatedSettings),
    );
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    fireEvent.click(await screen.findByRole("switch", { name: "来访：未设置" }));

    await waitFor(() => expect(clients.settings).toHaveBeenCalledTimes(1));
    expect(clients.settings.mock.calls[0]?.[0]).toMatchObject({
      field: "social.visit",
      value: true,
    });
  });
});

describe("FarmPage current field shop opening", () => {
  it("opens the existing authority and replaces only the returned catalog shop", async () => {
    const initial = fieldShopCatalogResult();
    clients.catalog.mockResolvedValue(initial);
    clients.openFarmShop.mockImplementation(
      async (input: { idempotencyKey: string; expectedShopRevision: string | null }) => ({
        ok: true,
        data: {
          data: {
            result: { receipt_id: input.idempotencyKey, refreshed: true },
            resource: {
              ...initial.data.data.shop,
              revision: "field-shop-v1:opened",
              items: [
                ...initial.data.data.shop.items,
                {
                  kind: "recipe",
                  item_id: "tomato",
                  identity_state: "known",
                  name: "番茄配方",
                  rarity: "N",
                  price: 500,
                  currency: "gold",
                  quantity: 1,
                  available_quantity: 1,
                  daily_limit: 1,
                  purchased_today: 0,
                  condition: null,
                  source: "persisted",
                },
              ],
            },
          },
          shop_revision: "field-shop-v1:opened",
          server_time: "2026-08-30T04:00:00.000Z",
        },
      }),
    );
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    await waitFor(() => expect(clients.openFarmShop).toHaveBeenCalledTimes(1));
    expect(clients.openFarmShop.mock.calls[0]?.[0]).toMatchObject({
      expectedShopRevision: FIELD_SHOP_REVISION,
    });
    const shop = await screen.findByRole("region", { name: "农场商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "今日商店" }));
    expect(await within(shop).findByText("番茄配方")).toBeTruthy();
  });

  it("retries a failed open with the same idempotency key", async () => {
    const initial = fieldShopCatalogResult();
    clients.catalog.mockResolvedValue(initial);
    clients.openFarmShop
      .mockResolvedValueOnce({
        ok: false,
        issue: {
          code: "network_unavailable",
          currentShopRevision: null,
          serverMessage: "现在连不上农场商店",
        },
      })
      .mockImplementationOnce(
        async (input: { idempotencyKey: string; expectedShopRevision: string | null }) => ({
          ok: true,
          data: {
            data: {
              result: { receipt_id: input.idempotencyKey, refreshed: false },
              resource: initial.data.data.shop,
            },
            shop_revision: initial.data.data.shop.revision,
            server_time: "2026-08-30T04:00:00.000Z",
          },
        }),
      );
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    expect(await screen.findByText("现在连不上农场商店")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(clients.openFarmShop).toHaveBeenCalledTimes(2));
    expect(clients.openFarmShop.mock.calls[1]?.[0]).toEqual(
      clients.openFarmShop.mock.calls[0]?.[0],
    );
  });
});

describe("FarmPage Bell shopping request", () => {
  it("retries the same request once after a network failure and only confirms that TA was notified", async () => {
    clients.catalog.mockResolvedValue(fieldShopCatalogResult());
    clients.farmPurchaseRequest
      .mockResolvedValueOnce({
        ok: false,
        issue: {
          code: "network_unavailable",
          currentShopRevision: null,
          serverMessage: null,
        },
      })
      .mockImplementationOnce(async (input) => farmPurchaseRequestSuccess(input));
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("region", { name: "农场商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "将加速药水加入购物车" }));
    fireEvent.click(within(shop).getByRole("button", { name: "查看购物车，1件" }));
    fireEvent.click(screen.getByRole("button", { name: "喊 TA 来买" }));
    fireEvent.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => expect(clients.farmPurchaseRequest).toHaveBeenCalledTimes(2));
    expect(clients.farmPurchaseRequest.mock.calls[0]?.[0]).toMatchObject({
      shop: "field",
      shopRevision: FIELD_SHOP_REVISION,
      items: [{ kind: "potion", itemId: "speed_potion", quantity: 1 }],
    });
    expect(clients.farmPurchaseRequest.mock.calls[1]?.[0]).toEqual(
      clients.farmPurchaseRequest.mock.calls[0]?.[0],
    );
    expect(await screen.findByText("购物车还是空的")).toBeTruthy();
    expect(screen.getByText("已通知 TA")).toBeTruthy();
    expect(screen.queryByText("刷新结果")).toBeNull();
  });

  it("treats an expired replay as terminal and sends the next checkout with a new key", async () => {
    clients.catalog.mockResolvedValue(fieldShopCatalogResult());
    clients.farmPurchaseRequest.mockResolvedValueOnce({
      ok: false,
      issue: {
        code: "purchase_request_expired",
        currentShopRevision: null,
        serverMessage: "之前的购物请求已过期，请重新发送。",
      },
    });
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("region", { name: "农场商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "将加速药水加入购物车" }));
    fireEvent.click(within(shop).getByRole("button", { name: "查看购物车，1件" }));
    fireEvent.click(screen.getByRole("button", { name: "喊 TA 来买" }));

    expect(await screen.findByText("之前的购物请求已过期，请重新发送。")).toBeTruthy();
    expect(screen.queryByText("已通知 TA")).toBeNull();
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
    const firstKey = clients.farmPurchaseRequest.mock.calls[0]?.[0].idempotencyKey;

    fireEvent.click(screen.getByRole("button", { name: "喊 TA 来买" }));
    await waitFor(() => expect(clients.farmPurchaseRequest).toHaveBeenCalledTimes(2));
    expect(clients.farmPurchaseRequest.mock.calls[1]?.[0].idempotencyKey).not.toBe(firstKey);
  });

  it("unlocks the cart after a failed replay", async () => {
    clients.catalog.mockResolvedValue(fieldShopCatalogResult());
    clients.farmPurchaseRequest.mockResolvedValueOnce({
      ok: false,
      issue: {
        code: "purchase_request_failed",
        currentShopRevision: null,
        serverMessage: "TA 没能处理之前的请求，请重新发送。",
      },
    });
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("region", { name: "农场商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "将加速药水加入购物车" }));
    fireEvent.click(within(shop).getByRole("button", { name: "查看购物车，1件" }));
    fireEvent.click(screen.getByRole("button", { name: "喊 TA 来买" }));

    expect(await screen.findByText("TA 没能处理之前的请求，请重新发送。")).toBeTruthy();
    expect(screen.queryByText("已通知 TA")).toBeNull();
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "减少加速药水数量" }));
    expect(await screen.findByText("购物车还是空的")).toBeTruthy();
  });
});

describe("FarmPage kitchen cart checkout", () => {
  it("makes one unlocked recipe through the existing authority without selecting materials", async () => {
    clients.kitchen.mockResolvedValue({
      ...KITCHEN_RESULT,
      data: {
        ...KITCHEN_RESULT.data,
        data: {
          ...KITCHEN_RESULT.data.data,
          known_recipes: {
            status: "available",
            items: [
              {
                status: "available",
                recipe_id: "fried_egg",
                name: "香煎蛋",
                rarity: "N",
                category: "主食小吃",
                ingredients: [
                  {
                    status: "available",
                    ingredient_id: "chicken_egg",
                    name: "鸡蛋",
                    quantity: 1,
                    reason: null,
                  },
                  {
                    status: "available",
                    ingredient_id: "salt",
                    name: "盐",
                    quantity: 1,
                    reason: null,
                  },
                ],
                method: { status: "available", id: "pan-fry", name: "煎", reason: null },
                tool: { status: "available", id: "wok", name: "炒锅", reason: null },
                reason: null,
              },
            ],
            reason: null,
          },
        },
      },
    });
    clients.cook.mockImplementationOnce(async (input: { idempotencyKey: string }) => ({
      ...kitchenCookSuccess(input.idempotencyKey, ["egg-instance", "salt"]),
      data: {
        ...kitchenCookSuccess(input.idempotencyKey, ["egg-instance", "salt"]).data,
        data: {
          ...kitchenCookSuccess(input.idempotencyKey, ["egg-instance", "salt"]).data.data,
          result: {
            ...kitchenCookSuccess(input.idempotencyKey, ["egg-instance", "salt"]).data.data.result,
            outcome: {
              ...kitchenCookSuccess(input.idempotencyKey, ["egg-instance", "salt"]).data.data.result
                .outcome,
              recipe_id: "fried_egg",
              name: "香煎蛋",
              odd: false,
            },
          },
        },
      },
    }));

    await renderLiveFarm();
    fireEvent.click(screen.getByRole("button", { name: "料理台" }));
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "食谱" }));
    fireEvent.click(await screen.findByRole("button", { name: "香煎蛋一键制作" }));

    await waitFor(() => expect(clients.cook).toHaveBeenCalledTimes(1));
    expect(clients.cook.mock.calls[0]?.[0]).toMatchObject({
      expectedFarmDoorplate: "3ET3FE",
      expectedKitchenInventoryRevision: KITCHEN_RESULT.data.kitchen_inventory_revision,
      recipeId: "fried_egg",
    });
    expect(clients.cook.mock.calls[0]?.[0]).not.toHaveProperty("items");
    expect(await screen.findByText("香煎蛋")).toBeTruthy();
  });

  it("shows a repeatable shop item's selected count and lets the badge remove one", async () => {
    await renderLiveFarm();
    fireEvent.click(screen.getByRole("button", { name: "料理台" }));
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("region", { name: "料理台商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "调味" }));

    const salt = within(shop).getByRole("button", { name: "将盐加入购物车" });
    fireEvent.click(salt);
    fireEvent.click(salt);

    const selectedCount = within(shop).getByRole("button", {
      name: "从购物车减少一份盐",
    });
    expect(selectedCount.textContent).toBe("2");
    expect(within(shop).getByRole("button", { name: "查看购物车，2件" })).toBeTruthy();

    fireEvent.click(selectedCount);
    expect(within(shop).getByRole("button", { name: "从购物车减少一份盐" }).textContent).toBe("1");
    expect(within(shop).getByRole("button", { name: "查看购物车，1件" })).toBeTruthy();
  });

  it("refreshes the live ingredient shelf with the authority revision and replaces its counters", async () => {
    const refreshed = kitchenShopRefreshSuccess("00000000-0000-4000-8000-000000000000");
    clients.kitchen.mockResolvedValueOnce(KITCHEN_RESULT).mockResolvedValue({
      ok: true,
      data: {
        data: refreshed.data.data.resource,
        kitchen_inventory_revision: KITCHEN_RESULT.data.kitchen_inventory_revision,
        shop_revision: refreshed.data.shop_revision,
        server_time: refreshed.data.server_time,
      },
    });
    await renderLiveFarm();
    fireEvent.click(screen.getByRole("button", { name: "料理台" }));
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("region", { name: "料理台商店" });

    fireEvent.click(within(shop).getByRole("button", { name: "刷新" }));

    await waitFor(() => expect(clients.refreshKitchenShop).toHaveBeenCalledTimes(1));
    expect(clients.refreshKitchenShop.mock.calls[0]?.[0]).toMatchObject({
      expectedShopRevision: KITCHEN_RESULT.data.shop_revision,
    });
    expect(clients.refreshKitchenShop.mock.calls[0]?.[0].idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(2));
    expect(await within(shop).findByText("1 / 10")).toBeTruthy();
    expect(within(shop).getByText("200")).toBeTruthy();
  });

  it("retries a network-unknown ingredient refresh with the same idempotency key", async () => {
    clients.refreshKitchenShop
      .mockResolvedValueOnce({
        ok: false,
        issue: {
          code: "network_unavailable",
          currentShopRevision: null,
          serverMessage: null,
        },
      })
      .mockImplementationOnce(async (input: { idempotencyKey: string }) =>
        kitchenShopRefreshSuccess(input.idempotencyKey),
      );
    await renderLiveFarm();
    fireEvent.click(screen.getByRole("button", { name: "料理台" }));
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("region", { name: "料理台商店" });

    fireEvent.click(within(shop).getByRole("button", { name: "刷新" }));
    expect(await within(shop).findByRole("alert")).toBeTruthy();
    fireEvent.click(within(shop).getByRole("button", { name: "刷新" }));

    await waitFor(() => expect(clients.refreshKitchenShop).toHaveBeenCalledTimes(2));
    expect(clients.refreshKitchenShop.mock.calls[1]?.[0]).toEqual(
      clients.refreshKitchenShop.mock.calls[0]?.[0],
    );
  });

  it("submits the whole cart once, replaces kitchen authority data, and clears the cart", async () => {
    const purchased = kitchenPurchaseSuccess("00000000-0000-4000-8000-000000000000");
    clients.kitchen.mockResolvedValueOnce(KITCHEN_RESULT).mockResolvedValue({
      ok: true,
      data: {
        data: purchased.data.data.resource,
        kitchen_inventory_revision: KITCHEN_RESULT.data.kitchen_inventory_revision,
        shop_revision: purchased.data.shop_revision,
        server_time: purchased.data.server_time,
      },
    });
    await renderLiveFarm();
    await openFilledCookingCart();

    fireEvent.click(screen.getByRole("button", { name: "确认购买" }));

    await waitFor(() => expect(clients.purchase).toHaveBeenCalledTimes(1));
    expect(clients.purchase.mock.calls[0]?.[0]).toMatchObject({
      expectedShopRevision: KITCHEN_RESULT.data.shop_revision,
      items: [
        { kind: "ingredient", itemId: "salt", quantity: 1 },
        { kind: "recipe", itemId: "honey_tea", quantity: 1 },
      ],
    });
    expect(clients.purchase.mock.calls[0]?.[0].idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("购物车还是空的")).toBeTruthy();
    expect(await screen.findByText(/已购 2 件，支付35 银币/)).toBeTruthy();
    expect(screen.getByRole("status", { name: "银币余额 65" })).toBeTruthy();
  });

  it("buys an unowned cooking tool from the live shop and replaces the authority kitchen resource", async () => {
    const purchased = kitchenToolPurchaseSuccess("00000000-0000-4000-8000-000000000000");
    clients.kitchen.mockResolvedValueOnce(KITCHEN_TOOL_RESULT).mockResolvedValueOnce({
      ok: true,
      data: {
        data: purchased.data.data.resource,
        kitchen_inventory_revision: KITCHEN_TOOL_RESULT.data.kitchen_inventory_revision,
        shop_revision: purchased.data.shop_revision,
        server_time: purchased.data.server_time,
      },
    });
    clients.purchase.mockImplementationOnce(async (input: { idempotencyKey: string }) =>
      kitchenToolPurchaseSuccess(input.idempotencyKey),
    );

    await renderLiveFarm();
    fireEvent.click(screen.getByRole("button", { name: "料理台" }));
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "商店" }));
    const shop = await screen.findByRole("region", { name: "料理台商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "工具" }));
    fireEvent.click(await within(shop).findByRole("button", { name: "将蒸笼加入购物车" }));
    fireEvent.click(within(shop).getByRole("button", { name: "查看购物车，1件" }));
    fireEvent.click(screen.getByRole("button", { name: "确认购买" }));

    await waitFor(() => expect(clients.purchase).toHaveBeenCalledTimes(1));
    expect(clients.purchase.mock.calls[0]?.[0]).toMatchObject({
      expectedShopRevision: KITCHEN_TOOL_SHOP_BEFORE,
      items: [{ kind: "tool", itemId: "steam", quantity: 1 }],
    });
    expect(clients.purchase.mock.calls[0]?.[0].idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("购物车还是空的")).toBeTruthy();
    expect(screen.getByText(/已购 1 件，支付1,200 银币/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "返回商店" }));
    fireEvent.click(
      within(await screen.findByRole("region", { name: "料理台商店" })).getByRole("button", {
        name: "工具",
      }),
    );
    expect(await screen.findByText("已拥有")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "将蒸笼加入购物车" })).toBeNull();
  });

  it("retries a network-unknown checkout with the exact same cart and idempotency key", async () => {
    clients.purchase
      .mockResolvedValueOnce({
        ok: false,
        issue: {
          code: "network_unavailable",
          currentShopRevision: null,
          serverMessage: null,
        },
      })
      .mockImplementationOnce(async (input: { idempotencyKey: string }) =>
        kitchenPurchaseSuccess(input.idempotencyKey),
      );
    await renderLiveFarm();
    await openFilledCookingCart();

    fireEvent.click(screen.getByRole("button", { name: "确认购买" }));
    const confirmButton = screen.getByRole("button", { name: "确认购买" }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    const decreaseSaltButton = screen.getByRole("button", {
      name: "减少盐数量",
    }) as HTMLButtonElement;
    const increaseSaltButton = screen.getByRole("button", {
      name: "增加盐数量",
    }) as HTMLButtonElement;
    expect(decreaseSaltButton.disabled).toBe(true);
    expect(increaseSaltButton.disabled).toBe(true);
    fireEvent.click(decreaseSaltButton);
    expect(
      within(screen.getByRole("region", { name: "购物车" })).getAllByRole("listitem"),
    ).toHaveLength(2);
    expect(await screen.findByRole("button", { name: "重试" })).toBeTruthy();
    fireEvent.click(confirmButton);
    expect(clients.purchase).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "返回商店" }));
    const shop = await screen.findByRole("region", { name: "料理台商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "将蜂蜜茶加入购物车" }));
    expect(within(shop).getByRole("button", { name: "查看购物车，2件" })).toBeTruthy();
    expect(within(shop).queryByRole("button", { name: "查看购物车，3件" })).toBeNull();
    fireEvent.click(within(shop).getByRole("button", { name: "查看购物车，2件" }));
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(clients.purchase).toHaveBeenCalledTimes(2));
    expect(clients.purchase.mock.calls[1]?.[0]).toEqual(clients.purchase.mock.calls[0]?.[0]);
    expect(await screen.findByText(/已购 2 件，支付35 银币/)).toBeTruthy();
  });

  it("keeps directory cart additions locked while checkout is in flight", async () => {
    const pendingPurchase = deferred<ReturnType<typeof kitchenPurchaseSuccess>>();
    clients.purchase.mockReturnValueOnce(pendingPurchase.promise);
    await renderLiveFarm();
    await openFilledCookingCart();

    fireEvent.click(screen.getByRole("button", { name: "确认购买" }));
    await waitFor(() => expect(clients.purchase).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "返回商店" }));
    const shop = await screen.findByRole("region", { name: "料理台商店" });
    fireEvent.click(within(shop).getByRole("button", { name: "将蜂蜜茶加入购物车" }));
    expect(within(shop).getByRole("button", { name: "查看购物车，2件" })).toBeTruthy();
    expect(within(shop).queryByRole("button", { name: "查看购物车，3件" })).toBeNull();

    fireEvent.click(within(shop).getByRole("button", { name: "查看购物车，2件" }));
    expect(await screen.findByText("正在确认购买…")).toBeTruthy();

    const input = clients.purchase.mock.calls[0]?.[0] as { idempotencyKey: string };
    await act(async () => {
      pendingPurchase.resolve(kitchenPurchaseSuccess(input.idempotencyKey));
    });
    expect(await screen.findByText("购物车还是空的")).toBeTruthy();
  });

  it.each(["shop_changed", "state_conflict"] as const)(
    "clears the cart and stale checkout state when %s refreshes the kitchen resource",
    async (issueCode) => {
      clients.kitchen
        .mockReset()
        .mockResolvedValueOnce(KITCHEN_RESULT)
        .mockResolvedValueOnce(kitchenWithoutDailyShopItems(`kitchen-v1:${"c".repeat(64)}`));
      clients.purchase.mockResolvedValueOnce({
        ok: false,
        issue: {
          code: issueCode,
          currentShopRevision: `kitchen-v1:${"c".repeat(64)}`,
          serverMessage: "料理台货架已经变化",
        },
      });

      await renderLiveFarm();
      await openFilledCookingCart();

      fireEvent.click(screen.getByRole("button", { name: "确认购买" }));

      await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(2));
      expect(await screen.findByText("购物车还是空的")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
      expect(
        screen.getByRole("button", { name: "确认购买" }).getAttribute("disabled"),
      ).not.toBeNull();
    },
  );
});

describe("FarmPage authoritative kitchen cooking", () => {
  it("submits two raw item refs, replaces kitchen data, clears prep, and shows the authority outcome", async () => {
    const cookedKitchen = kitchenCookSuccess("00000000-0000-4000-8000-000000000000");
    clients.kitchen.mockResolvedValueOnce(KITCHEN_COOK_RESULT).mockResolvedValue({
      ok: true,
      data: {
        data: cookedKitchen.data.data.resource,
        kitchen_inventory_revision: cookedKitchen.data.kitchen_inventory_revision,
        shop_revision: KITCHEN_COOK_RESULT.data.shop_revision,
        server_time: cookedKitchen.data.server_time,
      },
    });
    await renderLiveFarm();

    fireEvent.click(screen.getByRole("button", { name: "料理台" }));
    await waitFor(() => expect(clients.kitchen).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "烹饪" }) as HTMLButtonElement).disabled).toBe(true);
    await openFilledCookingPrep();

    const cookButton = screen.getByRole("button", { name: "烹饪" });
    expect((cookButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cookButton);

    await waitFor(() => expect(clients.cook).toHaveBeenCalledTimes(1));
    expect(clients.cook.mock.calls[0]?.[0]).toMatchObject({
      expectedFarmDoorplate: "3ET3FE",
      expectedKitchenInventoryRevision: KITCHEN_COOK_BEFORE,
      items: [...KITCHEN_COOK_ITEMS],
    });
    expect(clients.cook.mock.calls[0]?.[0]).not.toHaveProperty("methodId");
    expect(await screen.findByRole("dialog", { name: "料理结果" })).toBeTruthy();
    expect(screen.getByText("微妙的料理")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /移除第/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "关闭料理结果" }));
    fireEvent.click(screen.getByRole("button", { name: "放入食材" }));
    expect(await screen.findByText("当前还没有可选择的真实食材。")).toBeTruthy();
  });

  it("keeps the same UUID and raw refs for a retryable cook failure", async () => {
    clients.kitchen.mockResolvedValue(KITCHEN_COOK_RESULT);
    clients.cook
      .mockResolvedValueOnce({
        ok: false,
        issue: {
          code: "network_unavailable",
          currentKitchenInventoryRevision: null,
          serverMessage: null,
        },
      })
      .mockImplementationOnce(async (input: { idempotencyKey: string; items: string[] }) =>
        kitchenCookSuccess(input.idempotencyKey, input.items),
      );
    await renderLiveFarm();
    await openFilledCookingPrep();

    fireEvent.click(screen.getByRole("button", { name: "烹饪" }));
    const retryButton = await screen.findByRole("button", { name: "重试同一次料理" });
    const firstAttempt = clients.cook.mock.calls[0]?.[0];
    fireEvent.click(retryButton);

    await waitFor(() => expect(clients.cook).toHaveBeenCalledTimes(2));
    expect(clients.cook.mock.calls[1]?.[0]).toEqual(firstAttempt);
    expect(await screen.findByRole("dialog", { name: "料理结果" })).toBeTruthy();
  });
});
