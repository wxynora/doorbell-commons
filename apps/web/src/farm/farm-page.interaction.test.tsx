import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => ({
  catalog: vi.fn(),
  field: vi.fn(),
  harvest: vi.fn(),
  kitchen: vi.fn(),
  ranch: vi.fn(),
}));

vi.mock("../auth/auth-client", () => ({
  getBoundFarmField: clients.field,
  harvestBoundFarmField: clients.harvest,
}));

vi.mock("../auth/farm-catalog-client", () => ({
  farmCatalogIssueMessage: () => "农场目录暂时不可用",
  getBoundFarmCatalog: clients.catalog,
}));

vi.mock("../auth/kitchen-client", () => ({
  getBoundKitchen: clients.kitchen,
  kitchenIssueMessage: () => "料理台暂时不可用",
}));

vi.mock("../auth/ranch-client", () => ({
  getBoundRanch: clients.ranch,
  ranchIssueMessage: () => "牧场暂时不可用",
}));

vi.mock("../auth/farm-settings-action-client", () => ({
  executeBoundFarmSettingsAction: vi.fn(),
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

import { FarmPage } from "./farm-page";

const FIELD_BEFORE = {
  data: {
    farm: {
      farm_doorplate: "3ET3FE",
      farm_name: "渡的小农场",
      welcome_message: "今天也慢慢来。",
      equipped_title: null,
    },
    balance: { farm_coins: 10 },
    season: { name: "夏" },
    land: { tier: 1, name: "初土" },
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
      server_time: "2026-08-24T04:00:00.000Z",
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
        accessories: { status: "unavailable", shop_day: null, items: [] },
        decorations: { status: "unavailable", shop_day: null, items: [] },
      },
    },
    revision: "ranch-v1:test",
    server_time: "2026-08-24T04:00:00.000Z",
  },
} as const;

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
        status: "unavailable",
        stored_day_index: null,
        current_day_index: 20700,
        is_current_day: false,
        refresh_at: "2026-08-25T00:00:00.000Z",
        ingredients: [],
        recipes: [],
        reason: "not_initialized",
      },
    },
    shop_revision: "kitchen-v1:test",
    server_time: "2026-08-24T04:00:00.000Z",
  },
} as const;

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

beforeEach(() => {
  clients.catalog.mockReset();
  clients.field.mockReset().mockResolvedValue({ ok: true, data: FIELD_BEFORE });
  clients.harvest.mockReset().mockResolvedValue(HARVEST_SUCCESS);
  clients.kitchen.mockReset().mockResolvedValue(KITCHEN_RESULT);
  clients.ranch.mockReset().mockResolvedValue(RANCH_RESULT);
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
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
});
