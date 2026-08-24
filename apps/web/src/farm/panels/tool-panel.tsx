import { type CSSProperties, lazy, Suspense, useState } from "react";
import type { ApiResult } from "../../auth/auth-client";
import type { BoundFarmCatalogRead } from "../../auth/farm-catalog-client";
import {
  type BoundFarmSettingsAction,
  type FarmSettingsActionInput,
  type FarmSettingsActionIssue,
  farmSettingsActionIssueMessage,
} from "../../auth/farm-settings-action-client";
import type { BoundKitchenRead } from "../../auth/kitchen-client";
import type { BoundRanchRead } from "../../auth/ranch-client";
import {
  type FarmAssetKey,
  type FarmAssetManifestEntry,
  getCookingRecipeAsset,
  getFarmAssetUrl,
  getSmeltingMaterialAsset,
  type SmeltingMaterialId,
} from "../farm-asset-manifest";
import {
  COOKING_CATALOG_RECIPES,
  COOKING_INGREDIENT_NAME_BY_ID,
  COOKING_RECIPE_CATEGORIES,
  type CookingCatalogRecipe,
} from "../farm-cooking-catalog";
import {
  FARM_CROP_CATALOG,
  FARM_CROP_CATEGORIES,
  FARM_CROP_RARITY_ORDER,
  type FarmCropCategoryId,
} from "../farm-crop-catalog";
import type { ShopCartQuantities } from "./shop-panel";
import "./tool-panel.css";

const FarmShopPanelContent = lazy(async () => {
  const module = await import("./shop-panel");
  return { default: module.FarmShopPanelContent };
});

export type FarmSceneId = "field" | "ranch" | "cooking" | "neighborhood";

export interface FarmToolOption {
  id: string;
  label: string;
  iconKey: FarmAssetKey;
}

export interface FarmSettingsDraft {
  activeTitle: string;
  aiNickname: string;
  farmName: string;
  humanNickname: string;
  messagesAllowed: boolean | null;
  theftAllowed: boolean | null;
  visitsAllowed: boolean | null;
  wateringHelpAllowed: boolean | null;
  welcomeMessage: string;
}

export type FarmSettingsActionExecutor = (
  input: FarmSettingsActionInput,
) => Promise<ApiResult<BoundFarmSettingsAction, FarmSettingsActionIssue>>;

export interface OriginalPlantDraft {
  description: string;
  harvestText: string;
  latinName: string;
  name: string;
  sowingText: string;
}

interface FarmFeaturePanelDefinition {
  emptyLabel: string;
  tabs: readonly string[];
}

type SmeltingMaterialRarity = "N" | "R" | "SR" | "SSR" | "SP";

interface SmeltingMaterial {
  id: SmeltingMaterialId;
  name: string;
  rarity: SmeltingMaterialRarity;
}

export interface FarmToolPanelProps {
  activeScene: FarmSceneId;
  cart: ShopCartQuantities;
  farmCatalog?: BoundFarmCatalogRead | null;
  kitchen?: BoundKitchenRead | null;
  onClose: () => void;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  onChangeOriginalPlantDraft: (draft: OriginalPlantDraft) => void;
  onChangeSettingsDraft: (draft: FarmSettingsDraft) => void;
  onFarmSettingsAction?: FarmSettingsActionExecutor | undefined;
  originalPlantDraft: OriginalPlantDraft;
  preview: boolean;
  selectedCookingIngredientIds: readonly string[];
  ranch?: BoundRanchRead | null;
  settingsDraft: FarmSettingsDraft;
  tool: FarmToolOption;
}

const FARM_FEATURE_PANELS: Readonly<
  Record<FarmSceneId, Readonly<Record<string, FarmFeaturePanelDefinition>>>
> = {
  field: {
    backpack: {
      emptyLabel: "暂无物品",
      tabs: ["种子与药水", "素材", "其他"],
    },
    market: {
      emptyLabel: "集市数据尚未接入",
      tabs: [],
    },
    adventure: {
      emptyLabel: "暂无旅程",
      tabs: ["当前旅程", "故事", "秘境图鉴", "记录"],
    },
  },
  ranch: {
    backpack: {
      emptyLabel: "暂无牧场持有物",
      tabs: ["配饰", "装饰", "其他"],
    },
    dispatch: {
      emptyLabel: "派遣数据尚未接入",
      tabs: [],
    },
    market: {
      emptyLabel: "集市数据尚未接入",
      tabs: [],
    },
  },
  cooking: {
    backpack: {
      emptyLabel: "暂无料理库存",
      tabs: ["食材", "牧场产物", "鱼篓", "料理"],
    },
    recipes: {
      emptyLabel: "食谱数据尚未接入",
      tabs: [],
    },
    market: {
      emptyLabel: "集市数据尚未接入",
      tabs: [],
    },
  },
  neighborhood: {},
};

function getFeatureDefinition(scene: FarmSceneId, toolId: string): FarmFeaturePanelDefinition {
  return FARM_FEATURE_PANELS[scene][toolId] ?? { emptyLabel: "暂无内容", tabs: [] };
}

const SMELTING_MATERIALS = [
  { id: "ordinary_stone", name: "普通石头", rarity: "N" },
  { id: "dry_branch", name: "枯树枝", rarity: "N" },
  { id: "clay_lump", name: "黏土块", rarity: "N" },
  { id: "broken_tile", name: "碎瓦片", rarity: "N" },
  { id: "fluorite", name: "萤石", rarity: "R" },
  { id: "beast_bone", name: "兽骨", rarity: "R" },
  { id: "rusted_iron", name: "锈铁片", rarity: "R" },
  { id: "spider_silk", name: "蛛丝团", rarity: "R" },
  { id: "thunderstruck_wood", name: "雷击木", rarity: "SR" },
  { id: "deepsea_nacre", name: "深海珍珠母", rarity: "SR" },
  { id: "ancient_resin", name: "古树脂", rarity: "SR" },
  { id: "dragon_claw", name: "龙的指甲", rarity: "SSR" },
  { id: "sea_god_scale", name: "海神的鳞片", rarity: "SSR" },
  { id: "phoenix_ember", name: "凤凰的余烬", rarity: "SSR" },
  { id: "world_tree_seed", name: "世界树的籽", rarity: "SP" },
  { id: "crystal_shard", name: "碎晶片", rarity: "N" },
  { id: "old_vine", name: "枯藤", rarity: "N" },
  { id: "rusted_gear", name: "锈齿轮", rarity: "N" },
  { id: "sea_glass", name: "海玻璃", rarity: "N" },
  { id: "phoenix_feather", name: "凤羽", rarity: "R" },
  { id: "shadow_thread", name: "影线", rarity: "R" },
  { id: "echo_stone", name: "回音石", rarity: "R" },
  { id: "stardust_sand", name: "星沙", rarity: "R" },
  { id: "ever_frost", name: "不融冰", rarity: "SR" },
  { id: "dream_cocoon", name: "梦茧", rarity: "SR" },
  { id: "ambergris_fragment", name: "龙涎香", rarity: "SR" },
  { id: "tarnished_lunar_bronze", name: "锈月铜", rarity: "SR" },
  { id: "void_fabric", name: "虚空布片", rarity: "SSR" },
  { id: "time_amber", name: "时光琥珀", rarity: "SSR" },
  { id: "creation_echo", name: "创世余音", rarity: "SP" },
] as const satisfies readonly SmeltingMaterial[];

const SMELTING_RARITY_ORDER = {
  N: 0,
  R: 1,
  SR: 2,
  SSR: 3,
  SP: 4,
} as const satisfies Record<SmeltingMaterialRarity, number>;

const SORTED_SMELTING_MATERIALS = [...SMELTING_MATERIALS].sort(
  (left, right) => SMELTING_RARITY_ORDER[left.rarity] - SMELTING_RARITY_ORDER[right.rarity],
);

function FarmFeaturePanelContent({
  definition,
  tool,
}: {
  definition: FarmFeaturePanelDefinition;
  tool: FarmToolOption;
}) {
  const [activeTab, setActiveTab] = useState<string | null>(definition.tabs[0] ?? null);

  return (
    <section aria-label={tool.label} className="farm-feature">
      {definition.tabs.length > 0 ? (
        <nav aria-label={`${tool.label}分类`} className="farm-feature__tabs">
          {definition.tabs.map((tab) => (
            <button
              aria-pressed={activeTab === tab}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </nav>
      ) : null}
      <div className="farm-feature__empty">
        <img alt="" aria-hidden="true" src={getFarmAssetUrl(tool.iconKey)} />
        <strong>{activeTab ? `${activeTab}暂无内容` : definition.emptyLabel}</strong>
        {activeTab ? <span>{definition.emptyLabel}</span> : null}
      </div>
    </section>
  );
}

function FarmUnavailablePanel({ iconKey, label }: { iconKey?: FarmAssetKey; label: string }) {
  return (
    <div className="farm-feature__empty" role="status">
      {iconKey ? <img alt="" aria-hidden="true" src={getFarmAssetUrl(iconKey)} /> : null}
      <strong>{label}</strong>
    </div>
  );
}

type FarmCatalogBackpackItems = Extract<
  BoundFarmCatalogRead["data"]["backpack"],
  { status: "available" }
>["items"];

export function getFarmBackpackItemsForTab(
  items: FarmCatalogBackpackItems,
  tab: string,
): FarmCatalogBackpackItems {
  if (tab === "种子与药水") {
    return items.filter(
      (item) => item.kind === "seed" || (item.kind === "item" && item.item_id === "speed_potion"),
    );
  }
  if (tab === "素材") {
    return items.filter((item) => item.kind === "material");
  }
  return items.filter((item) => item.kind === "item" && item.item_id !== "speed_potion");
}

function CatalogInventoryRows({
  items,
  emptyLabel,
}: {
  items: FarmCatalogBackpackItems;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <div className="farm-feature__empty" role="status">
        <strong>{emptyLabel}</strong>
      </div>
    );
  }

  return (
    <ul className="farm-crop-codex__list" aria-label="真实库存">
      {items.map((item) => (
        <li key={`${item.kind}:${item.item_id}`}>
          <span>{item.identity_state === "known" && item.name ? item.name : "身份不可用"}</span>
          <small>{item.quantity}</small>
        </li>
      ))}
    </ul>
  );
}

function FarmBackpackPanel({
  kitchen,
  preview,
  ranch,
  farmCatalog,
  scene,
}: {
  kitchen?: BoundKitchenRead | null;
  preview: boolean;
  ranch?: BoundRanchRead | null;
  farmCatalog?: BoundFarmCatalogRead | null;
  scene: Exclude<FarmSceneId, "neighborhood">;
}) {
  const tabs = FARM_FEATURE_PANELS[scene].backpack?.tabs ?? [];
  const [activeTab, setActiveTab] = useState(tabs[0] ?? "");

  if (preview) {
    return (
      <FarmFeaturePanelContent
        definition={getFeatureDefinition(scene, "backpack")}
        tool={{ id: "backpack", label: "背包", iconKey: "panel.tool.backpack" }}
      />
    );
  }

  if (scene === "field") {
    const section = farmCatalog?.data.backpack;
    if (!section || section.status === "unavailable") {
      return (
        <FarmUnavailablePanel
          iconKey="panel.tool.backpack"
          label={section?.message ?? "背包数据尚未接入"}
        />
      );
    }
    return (
      <section aria-label="农场背包" className="farm-feature">
        <nav aria-label="背包分类" className="farm-feature__tabs">
          {tabs.map((tab) => (
            <button
              aria-pressed={activeTab === tab}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </nav>
        <CatalogInventoryRows
          emptyLabel="当前分类没有真实物品"
          items={getFarmBackpackItemsForTab(section.items, activeTab)}
        />
      </section>
    );
  }

  if (scene === "ranch") {
    if (!ranch) {
      return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="牧场背包数据尚未接入" />;
    }
    const wardrobe = ranch.data.wardrobe;
    const decorations = ranch.data.decorations;
    if (activeTab === "配饰") {
      if (wardrobe.status === "unavailable") {
        return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="配饰库存暂不可用" />;
      }
      return (
        <section aria-label="牧场配饰库存" className="farm-feature">
          <nav aria-label="背包分类" className="farm-feature__tabs">
            {tabs.map((tab) => (
              <button
                aria-pressed={activeTab === tab}
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </nav>
          <ul className="farm-crop-codex__list">
            {wardrobe.items.length > 0 ? (
              wardrobe.items.map((item) => (
                <li key={`${item.accessory_id ?? "unavailable"}-${item.name ?? "item"}`}>
                  <span>{item.status === "known" && item.name ? item.name : "身份不可用"}</span>
                </li>
              ))
            ) : (
              <li>
                <span>当前没有真实配饰</span>
              </li>
            )}
          </ul>
        </section>
      );
    }
    if (activeTab === "装饰") {
      if (decorations.status === "unavailable") {
        return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="装饰库存暂不可用" />;
      }
      const items = [...decorations.stored, ...decorations.placed];
      return (
        <section aria-label="牧场装饰库存" className="farm-feature">
          <nav aria-label="背包分类" className="farm-feature__tabs">
            {tabs.map((tab) => (
              <button
                aria-pressed={activeTab === tab}
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </nav>
          <ul className="farm-crop-codex__list">
            {items.length > 0 ? (
              items.map((item) => (
                <li key={`${item.decoration_id ?? "unavailable"}-${item.name ?? "item"}`}>
                  <span>{item.status === "known" && item.name ? item.name : "身份不可用"}</span>
                </li>
              ))
            ) : (
              <li>
                <span>当前没有真实装饰</span>
              </li>
            )}
          </ul>
        </section>
      );
    }
    return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="其他牧场库存暂无真实数据" />;
  }

  if (!kitchen) {
    return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="料理库存数据尚未接入" />;
  }
  const kitchenData = kitchen.data;
  const items: Array<{
    available: boolean;
    id: string;
    name: string | null;
    quantity: number | null;
  }> = [];
  let sectionAvailable = false;

  if (activeTab === "食材" && kitchenData.stacked_ingredients.status === "available") {
    sectionAvailable = true;
    items.push(
      ...kitchenData.stacked_ingredients.items.map((item) => ({
        available: item.status === "available",
        id: `ingredient:${item.ingredient_id}`,
        name: item.name,
        quantity: item.quantity,
      })),
    );
  } else if (activeTab === "牧场产物" && kitchenData.product_instances.status === "available") {
    sectionAvailable = true;
    items.push(
      ...kitchenData.product_instances.items.map((item) => ({
        available: item.status === "available",
        id: `product:${item.product_instance_id}`,
        name: item.name,
        quantity: null,
      })),
    );
  } else if (activeTab === "鱼篓") {
    if (kitchenData.fish_instances.status === "available") {
      sectionAvailable = true;
      items.push(
        ...kitchenData.fish_instances.items.map((item) => ({
          available: item.status === "available",
          id: `fish:${item.catch_instance_id}`,
          name: item.name,
          quantity: null,
        })),
      );
    }
    if (kitchenData.treasure_items.status === "available") {
      sectionAvailable = true;
      items.push(
        ...kitchenData.treasure_items.items.map((item) => ({
          available: item.status === "available",
          id: `treasure:${item.item_id}`,
          name: item.name,
          quantity: item.quantity,
        })),
      );
    }
  } else if (activeTab === "料理" && kitchenData.dish_instances.status === "available") {
    sectionAvailable = true;
    items.push(
      ...kitchenData.dish_instances.items.map((item) => ({
        available: item.status === "available",
        id: `dish:${item.dish_instance_id}`,
        name: item.name,
        quantity: null,
      })),
    );
  }

  if (!sectionAvailable) {
    return <FarmUnavailablePanel iconKey="panel.tool.backpack" label="该料理库存暂不可用" />;
  }
  return (
    <section aria-label="料理背包" className="farm-feature">
      <nav aria-label="料理库存分类" className="farm-feature__tabs">
        {tabs.map((tab) => (
          <button
            aria-pressed={activeTab === tab}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </nav>
      <ul className="farm-crop-codex__list">
        {items.length > 0 ? (
          items.map((item) => (
            <li key={item.id}>
              <span>{item.available && item.name ? item.name : "身份不可用"}</span>
              {item.quantity !== null ? <small>{item.quantity}</small> : null}
            </li>
          ))
        ) : (
          <li>
            <span>当前分类没有真实物品</span>
          </li>
        )}
      </ul>
    </section>
  );
}

function FarmMarketPanel({
  farmCatalog,
  preview,
  tool,
}: {
  farmCatalog?: BoundFarmCatalogRead | null;
  preview: boolean;
  tool: FarmToolOption;
}) {
  if (preview) {
    return (
      <FarmFeaturePanelContent definition={getFeatureDefinition("field", "market")} tool={tool} />
    );
  }

  const market = farmCatalog?.data.market;
  if (!market || market.status === "unavailable") {
    return (
      <FarmUnavailablePanel
        iconKey="panel.tool.market"
        label={market?.message ?? "集市数据尚未接入"}
      />
    );
  }

  const listings = market.listings.filter(
    (listing) => listing.identity_state === "known" && listing.name !== null,
  );
  return (
    <section aria-label="真实集市" className="farm-feature">
      <ul aria-label="真实集市商品" className="farm-crop-codex__list">
        {listings.length > 0 ? (
          listings.map((listing, index) => (
            <li
              key={`${listing.seller_farm_doorplate}:${listing.kind}:${listing.item_id ?? index}`}
            >
              <span>{listing.name}</span>
              <small>
                ×{listing.quantity}
                {listing.price === null ? "" : ` · 价格 ${listing.price}`}
              </small>
            </li>
          ))
        ) : (
          <li>
            <span>当前没有真实摊位</span>
          </li>
        )}
      </ul>
    </section>
  );
}

function FarmCropCodex({
  farmCatalog,
  preview,
}: {
  farmCatalog?: BoundFarmCatalogRead | null;
  preview: boolean;
}) {
  const [categoryId, setCategoryId] = useState<FarmCropCategoryId | "all">("common");

  if (!preview) {
    const codex = farmCatalog?.data.codex;
    if (!codex || codex.status === "unavailable") {
      return <FarmUnavailablePanel label={codex?.message ?? "作物图鉴数据尚未接入"} />;
    }

    const categories = [
      { id: "all" as const, label: "全部", count: codex.entries.length },
      ...FARM_CROP_CATEGORIES.map((category) => ({
        id: category.id,
        label: category.label,
        count: codex.entries.filter((entry) => entry.category === category.id).length,
      })),
    ];
    const entries = codex.entries
      .filter((entry) => categoryId === "all" || entry.category === categoryId)
      .sort((left, right) => {
        const leftRarity = left.rarity
          ? (FARM_CROP_RARITY_ORDER[left.rarity as keyof typeof FARM_CROP_RARITY_ORDER] ?? 99)
          : 99;
        const rightRarity = right.rarity
          ? (FARM_CROP_RARITY_ORDER[right.rarity as keyof typeof FARM_CROP_RARITY_ORDER] ?? 99)
          : 99;
        return leftRarity - rightRarity;
      });

    return (
      <section aria-label="真实作物图鉴文字目录" className="farm-crop-codex">
        <nav aria-label="作物类型" className="farm-crop-codex__categories">
          {categories.map((category) => (
            <button
              aria-pressed={categoryId === category.id}
              key={category.id}
              onClick={() => setCategoryId(category.id)}
              type="button"
            >
              <span>{category.label}</span>
              <small>{category.count}</small>
            </button>
          ))}
        </nav>
        <ul className="farm-crop-codex__list">
          {entries.length > 0 ? (
            entries.map((entry) => (
              <li key={entry.crop_id}>
                <span>
                  {entry.identity_state === "known" && entry.name ? entry.name : "身份不可用"}
                </span>
                <small data-rarity={entry.rarity ?? undefined}>
                  {entry.rarity ?? (entry.discovered ? "已发现" : "未发现")}
                </small>
              </li>
            ))
          ) : (
            <li>
              <span>当前分类没有真实条目</span>
            </li>
          )}
        </ul>
      </section>
    );
  }

  const categoryCrops = FARM_CROP_CATALOG.filter((crop) => crop.category === categoryId).sort(
    (left, right) => FARM_CROP_RARITY_ORDER[left.rarity] - FARM_CROP_RARITY_ORDER[right.rarity],
  );

  return (
    <section aria-label="作物图鉴文字目录" className="farm-crop-codex">
      <nav aria-label="作物类型" className="farm-crop-codex__categories">
        {FARM_CROP_CATEGORIES.map((category) => {
          const cropCount = FARM_CROP_CATALOG.filter(
            (crop) => crop.category === category.id,
          ).length;
          return (
            <button
              aria-pressed={categoryId === category.id}
              key={category.id}
              onClick={() => setCategoryId(category.id)}
              type="button"
            >
              <span>{category.label}</span>
              <small>{cropCount}</small>
            </button>
          );
        })}
      </nav>
      <ul className="farm-crop-codex__list">
        {categoryCrops.map((crop) => (
          <li key={crop.id}>
            <span>{crop.name}</span>
            <small data-rarity={crop.rarity}>{crop.rarity}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FarmExpeditionPanel({
  farmCatalog,
  preview,
}: {
  farmCatalog?: BoundFarmCatalogRead | null;
  preview: boolean;
}) {
  if (preview) {
    return (
      <FarmFeaturePanelContent
        definition={getFeatureDefinition("field", "adventure")}
        tool={{ id: "adventure", label: "探险", iconKey: "panel.tool.adventure" }}
      />
    );
  }
  const expedition = farmCatalog?.data.expedition;
  if (!expedition || expedition.status === "unavailable") {
    return (
      <FarmUnavailablePanel
        iconKey="panel.tool.adventure"
        label={expedition?.message ?? "探险数据尚未接入"}
      />
    );
  }
  return (
    <section aria-label="真实探险" className="farm-feature">
      <div className="farm-feature__empty" role="status">
        <strong>
          {expedition.active ? (expedition.map_name ?? "地图身份不可用") : "当前没有进行中的旅程"}
        </strong>
        <span>
          今日剩余 {expedition.remaining_today}/{expedition.daily_limit}
          {expedition.step === null ? "" : ` · 进度 ${expedition.step}`}
        </span>
        {expedition.pending ? <span>{expedition.pending.title ?? "事件身份不可用"}</span> : null}
      </div>
      {expedition.log.length > 0 ? (
        <ul className="farm-crop-codex__list" aria-label="探险记录">
          {expedition.log.map((entry) => (
            <li key={`${entry.event_id ?? "entry"}-${entry.at ?? entry.text}`}>
              <span>{entry.title ?? entry.text}</span>
              {entry.title ? <small>{entry.text}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RanchDispatchPanel({
  ranch,
  preview,
}: {
  ranch?: BoundRanchRead | null;
  preview: boolean;
}) {
  if (preview) {
    return (
      <FarmFeaturePanelContent
        definition={getFeatureDefinition("ranch", "dispatch")}
        tool={{ id: "dispatch", label: "派遣", iconKey: "panel.tool.dispatch" }}
      />
    );
  }
  const dispatch = ranch?.data.dispatch;
  if (!dispatch || dispatch.status === "unavailable") {
    return <FarmUnavailablePanel iconKey="panel.tool.dispatch" label="派遣数据尚未接入" />;
  }
  return (
    <section aria-label="真实派遣" className="farm-feature">
      <ul className="farm-crop-codex__list">
        {dispatch.active.length > 0 ? (
          dispatch.active.map((entry) => (
            <li key={`${entry.raid_id ?? "dispatch"}-${entry.animal_kind_id ?? "animal"}`}>
              <span>
                {entry.status === "known" && entry.animal_name ? entry.animal_name : "身份不可用"}
              </span>
              <small>
                {entry.state === "active"
                  ? "进行中"
                  : entry.state === "pending_settlement"
                    ? "待结算"
                    : "不可用"}
              </small>
            </li>
          ))
        ) : (
          <li>
            <span>当前没有真实派遣</span>
          </li>
        )}
      </ul>
    </section>
  );
}

function getSmeltingMaterialSpriteStyle(asset: FarmAssetManifestEntry): CSSProperties {
  const viewport = asset.atlasViewport;

  if (!viewport) {
    return {};
  }

  return {
    aspectRatio: `${viewport.width} / ${viewport.height}`,
    backgroundImage: `url("${asset.url}")`,
    backgroundPosition: `${(viewport.x * 100) / (asset.pixelWidth - viewport.width)}% ${(viewport.y * 100) / (asset.pixelHeight - viewport.height)}%`,
    backgroundSize: `${(asset.pixelWidth * 100) / viewport.width}% ${(asset.pixelHeight * 100) / viewport.height}%`,
  };
}

function SmeltingMaterialSprite({ material }: { material: { id: string; name: string } }) {
  const asset = getSmeltingMaterialAsset(material.id);

  return asset?.atlasViewport ? (
    <span
      aria-label={`${material.name}素材图标`}
      className="smelting-catalog__sprite"
      role="img"
      style={getSmeltingMaterialSpriteStyle(asset)}
    />
  ) : (
    <span aria-hidden="true" className="smelting-catalog__sprite" />
  );
}

function SmeltingPanelContent({
  farmCatalog,
  preview,
}: {
  farmCatalog?: BoundFarmCatalogRead | null;
  preview: boolean;
}) {
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [showUnavailableNotice, setShowUnavailableNotice] = useState(false);
  const liveSmelting = farmCatalog?.data.smelting;

  if (!preview && (!liveSmelting || liveSmelting.status === "unavailable")) {
    return (
      <FarmUnavailablePanel
        iconKey="panel.tool.smelting"
        label={liveSmelting?.message ?? "熔炼素材数据尚未接入"}
      />
    );
  }

  const selectedMaterials = preview
    ? selectedMaterialIds
        .map((materialId) => SMELTING_MATERIALS.find((material) => material.id === materialId))
        .filter((material) => material !== undefined)
        .map((material) => material.name)
    : liveSmelting?.status === "available"
      ? liveSmelting.materials
          .filter((material) => selectedMaterialIds.includes(material.material_id))
          .map((material) =>
            material.identity_state === "known" && material.name ? material.name : "身份不可用",
          )
      : [];

  if (showUnavailableNotice) {
    return (
      <section aria-label="熔炼提示" className="smelting-catalog smelting-catalog--notice">
        <div aria-live="polite" className="smelting-catalog__notice" role="status">
          <img alt="" aria-hidden="true" src={getFarmAssetUrl("panel.tool.smelting")} />
          <span>已选素材</span>
          <p className="smelting-catalog__selection">{selectedMaterials.join("、")}</p>
          <strong>熔炼暂未开放</strong>
          <p>当前不会消耗素材。</p>
          <button onClick={() => setShowUnavailableNotice(false)} type="button">
            返回选材
          </button>
        </div>
      </section>
    );
  }

  const toggleMaterial = (materialId: string) => {
    setSelectedMaterialIds((current) => {
      if (current.includes(materialId)) {
        return current.filter((selectedId) => selectedId !== materialId);
      }
      return current.length < 3 ? [...current, materialId] : [...current.slice(1), materialId];
    });
  };

  return (
    <section aria-label="熔炼素材选择" className="smelting-catalog">
      <ul className="smelting-catalog__grid" aria-label="熔炼素材列表">
        {(preview
          ? SORTED_SMELTING_MATERIALS.map((material) => ({
              id: material.id,
              name: material.name,
              rarity: material.rarity,
              quantity: null as number | null,
              known: true,
            }))
          : liveSmelting?.status === "available"
            ? liveSmelting.materials.map((material) => ({
                id: material.material_id,
                name: material.identity_state === "known" ? material.name : null,
                rarity: material.rarity,
                quantity: material.quantity,
                known: material.identity_state === "known" && material.name !== null,
              }))
            : []
        ).map((material) => {
          const selected = selectedMaterialIds.includes(material.id);
          return (
            <li key={material.id}>
              <button
                aria-label={`${selected ? "取消选择" : "选择"}${material.name ?? "身份不可用素材"}`}
                aria-pressed={selected}
                onClick={() => toggleMaterial(material.id)}
                type="button"
              >
                <SmeltingMaterialSprite
                  material={{ id: material.id, name: material.name ?? "身份不可用素材" }}
                />
                <span className="smelting-catalog__quantity">
                  ×{material.quantity === null ? "—" : material.quantity}
                </span>
                <strong>{material.name ?? "身份不可用"}</strong>
                {material.rarity ? (
                  <small data-rarity={material.rarity}>{material.rarity}</small>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="smelting-catalog__footer">
        <button
          aria-label="查看熔炼提示"
          disabled={selectedMaterialIds.length === 0}
          onClick={() => setShowUnavailableNotice(true)}
          type="button"
        >
          开始熔炼
        </button>
      </footer>
    </section>
  );
}

interface FarmSettingsActionAttempt {
  input: FarmSettingsActionInput;
  label: string;
}

type FarmSettingsActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: FarmSettingsActionAttempt }
  | { stage: "success"; message: string }
  | {
      stage: "error";
      attempt: FarmSettingsActionAttempt | null;
      issue: FarmSettingsActionIssue;
    };

function shouldRetryFarmSettingsAction(issue: FarmSettingsActionIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

function FarmSettingsPanelContent({
  availableTitles = [],
  baseline,
  catalogRevision,
  draft,
  editable,
  onChange,
  onSave,
}: {
  availableTitles?: readonly { id: string; name: string }[];
  baseline?: FarmSettingsDraft | undefined;
  catalogRevision?: string | undefined;
  draft: FarmSettingsDraft;
  editable: boolean;
  onChange: (draft: FarmSettingsDraft) => void;
  onSave?: FarmSettingsActionExecutor | undefined;
}) {
  const [actionState, setActionState] = useState<FarmSettingsActionState>({ stage: "idle" });
  const busy = actionState.stage === "submitting";
  const liveEditable = editable && Boolean(onSave && catalogRevision);
  const previewEditable = editable && !onSave;

  const submitSetting = async (
    field: FarmSettingsActionInput["field"],
    value: FarmSettingsActionInput["value"],
    label: string,
    retryAttempt?: FarmSettingsActionAttempt,
  ) => {
    if (!onSave || !catalogRevision) return;
    const attempt =
      retryAttempt ??
      ({
        input: {
          expectedCatalogRevision: catalogRevision,
          field,
          idempotencyKey: crypto.randomUUID(),
          value,
        },
        label,
      } satisfies FarmSettingsActionAttempt);
    setActionState({ stage: "submitting", attempt });
    const result = await onSave(attempt.input);
    if (result.ok) {
      const settings = result.data.data.resource.settings;
      if (settings.status === "available") onChange(farmSettingsDraftFromCatalog(settings));
      setActionState({ stage: "success", message: `${label}已保存` });
      return;
    }
    setActionState({
      stage: "error",
      attempt: shouldRetryFarmSettingsAction(result.issue) ? attempt : null,
      issue: result.issue,
    });
  };

  return (
    <form
      aria-label="设置内容"
      className="farm-settings"
      onSubmit={(event) => event.preventDefault()}
    >
      {actionState.stage === "success" ? (
        <p className="farm-settings__status" role="status">
          {actionState.message}
        </p>
      ) : actionState.stage === "error" ? (
        <p className="farm-settings__status farm-settings__status--error" role="alert">
          <span>{farmSettingsActionIssueMessage(actionState.issue)}</span>
          {actionState.attempt ? (
            <button
              disabled={busy}
              onClick={() => {
                const attempt = actionState.attempt;
                if (attempt) {
                  void submitSetting(
                    attempt.input.field,
                    attempt.input.value,
                    attempt.label,
                    attempt,
                  );
                }
              }}
              type="button"
            >
              重试
            </button>
          ) : null}
        </p>
      ) : null}
      <fieldset className="farm-settings__group">
        <legend>农场名和称呼</legend>
        <div className="farm-settings__item">
          <label htmlFor="farm-name">农场名</label>
          <div className="farm-settings__control">
            <input
              disabled={!editable || busy}
              id="farm-name"
              maxLength={12}
              name="farm-name"
              onChange={(event) => onChange({ ...draft, farmName: event.currentTarget.value })}
              type="text"
              value={draft.farmName}
            />
            {onSave ? (
              <button
                className="farm-settings__save"
                disabled={
                  !liveEditable ||
                  busy ||
                  !draft.farmName.trim() ||
                  draft.farmName === baseline?.farmName
                }
                onClick={() => void submitSetting("farm_name", draft.farmName, "农场名")}
                type="button"
              >
                保存
              </button>
            ) : null}
          </div>
        </div>
        <label className="farm-settings__item">
          <span>小机昵称</span>
          <input
            disabled={!previewEditable}
            name="ai-nickname"
            onChange={(event) => onChange({ ...draft, aiNickname: event.currentTarget.value })}
            type="text"
            value={draft.aiNickname}
          />
        </label>
        <label className="farm-settings__item">
          <span>你的昵称</span>
          <input
            disabled={!previewEditable}
            name="human-nickname"
            onChange={(event) => onChange({ ...draft, humanNickname: event.currentTarget.value })}
            type="text"
            value={draft.humanNickname}
          />
        </label>
      </fieldset>
      <div className="farm-settings__item farm-settings__item--welcome">
        <label htmlFor="welcome-message">欢迎语</label>
        <div className="farm-settings__control">
          <textarea
            disabled={!editable || busy}
            id="welcome-message"
            maxLength={60}
            name="welcome-message"
            onChange={(event) => onChange({ ...draft, welcomeMessage: event.currentTarget.value })}
            rows={2}
            value={draft.welcomeMessage}
          />
          {onSave ? (
            <button
              className="farm-settings__save"
              disabled={
                !liveEditable ||
                busy ||
                !draft.welcomeMessage.trim() ||
                draft.welcomeMessage === baseline?.welcomeMessage
              }
              onClick={() => void submitSetting("welcome_message", draft.welcomeMessage, "欢迎语")}
              type="button"
            >
              保存
            </button>
          ) : null}
        </div>
      </div>
      <div className="farm-settings__item">
        <label htmlFor="active-title">佩戴称号</label>
        <div className="farm-settings__control">
          <select
            disabled={!editable || busy}
            id="active-title"
            name="active-title"
            onChange={(event) => onChange({ ...draft, activeTitle: event.currentTarget.value })}
            value={draft.activeTitle}
          >
            <option value="" />
            {availableTitles.map((title) => (
              <option key={title.id} value={title.id}>
                {title.name}
              </option>
            ))}
          </select>
          {onSave ? (
            <button
              className="farm-settings__save"
              disabled={!liveEditable || busy || draft.activeTitle === baseline?.activeTitle}
              onClick={() =>
                void submitSetting("equip_title", draft.activeTitle || null, "佩戴称号")
              }
              type="button"
            >
              保存
            </button>
          ) : null}
        </div>
      </div>
      <fieldset className="farm-settings__group">
        <legend>社交开关</legend>
        <FarmSettingsSwitch
          editable={previewEditable}
          label="来访"
          offLabel="谢绝来访"
          onChange={(visitsAllowed) => onChange({ ...draft, visitsAllowed })}
          onLabel="访问"
          value={draft.visitsAllowed}
        />
        <FarmSettingsSwitch
          editable={previewEditable}
          label="偷菜"
          onChange={(theftAllowed) => onChange({ ...draft, theftAllowed })}
          value={draft.theftAllowed}
        />
        <FarmSettingsSwitch
          editable={previewEditable}
          label="帮浇水"
          onChange={(wateringHelpAllowed) => onChange({ ...draft, wateringHelpAllowed })}
          value={draft.wateringHelpAllowed}
        />
        <FarmSettingsSwitch
          editable={previewEditable}
          label="留言"
          onChange={(messagesAllowed) => onChange({ ...draft, messagesAllowed })}
          value={draft.messagesAllowed}
        />
      </fieldset>
    </form>
  );
}

function farmSettingsDraftFromCatalog(
  settings: Extract<BoundFarmCatalogRead["data"]["settings"], { status: "available" }>,
): FarmSettingsDraft {
  return {
    activeTitle:
      settings.equipped_title?.identity_state === "known" ? settings.equipped_title.title_id : "",
    aiNickname: settings.ai_name ?? "",
    farmName: settings.farm_name,
    humanNickname: settings.human_name ?? "",
    messagesAllowed: settings.social.message,
    theftAllowed: settings.social.steal,
    visitsAllowed: settings.social.visit,
    wateringHelpAllowed: settings.social.water,
    welcomeMessage: settings.welcome_message ?? "",
  };
}

function FarmSettingsSwitch({
  editable,
  label,
  offLabel = "关闭",
  onChange,
  onLabel = "允许",
  value,
}: {
  editable: boolean;
  label: string;
  offLabel?: string;
  onChange: (value: boolean) => void;
  onLabel?: string;
  value: boolean | null;
}) {
  const stateLabel = value === null ? "未设置" : value ? onLabel : offLabel;
  const visualState = value === true ? "on" : "off";
  return (
    <div className="farm-settings__item">
      <span>{label}</span>
      <button
        aria-checked={value === true}
        aria-label={`${label}：${stateLabel}`}
        className="farm-settings__switch"
        data-state={visualState}
        disabled={!editable}
        onClick={() => onChange(value !== true)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="farm-settings__switch-track">
          <span className="farm-settings__switch-thumb" />
        </span>
      </button>
    </div>
  );
}

function OriginalPlantCreator({
  draft,
  editable,
  onChange,
}: {
  draft: OriginalPlantDraft;
  editable: boolean;
  onChange: (draft: OriginalPlantDraft) => void;
}) {
  return (
    <form
      aria-label="原创植物设计"
      className="original-plant-creator"
      onSubmit={(event) => event.preventDefault()}
    >
      <p className="original-plant-creator__intro">设计一株属于这座农场的原创植物。</p>
      <div className="original-plant-creator__fields">
        <label>
          <span>名称</span>
          <input
            disabled={!editable}
            name="original-plant-name"
            onChange={(event) => onChange({ ...draft, name: event.currentTarget.value })}
            placeholder="给植物起个名字"
            type="text"
            value={draft.name}
          />
        </label>
        <label>
          <span>
            拉丁名 <small>选填</small>
          </span>
          <input
            disabled={!editable}
            name="original-plant-latin-name"
            onChange={(event) => onChange({ ...draft, latinName: event.currentTarget.value })}
            placeholder="—"
            type="text"
            value={draft.latinName}
          />
        </label>
        <label className="original-plant-creator__wide">
          <span>描述</span>
          <textarea
            disabled={!editable}
            name="original-plant-description"
            onChange={(event) => onChange({ ...draft, description: event.currentTarget.value })}
            placeholder="写下它的样子和故事"
            rows={3}
            value={draft.description}
          />
        </label>
        <label className="original-plant-creator__wide">
          <span>播种文案</span>
          <textarea
            disabled={!editable}
            name="original-plant-sowing-text"
            onChange={(event) => onChange({ ...draft, sowingText: event.currentTarget.value })}
            placeholder="播种时显示的文字"
            rows={2}
            value={draft.sowingText}
          />
        </label>
        <label className="original-plant-creator__wide">
          <span>收获文案</span>
          <textarea
            disabled={!editable}
            name="original-plant-harvest-text"
            onChange={(event) => onChange({ ...draft, harvestText: event.currentTarget.value })}
            placeholder="收获时显示的文字"
            rows={2}
            value={draft.harvestText}
          />
        </label>
      </div>
      <button className="original-plant-creator__submit" disabled type="submit">
        完成设计
      </button>
    </form>
  );
}

function getCookingCatalogSpriteStyle(asset: FarmAssetManifestEntry): CSSProperties {
  const frame = asset.atlasFrame;
  if (!frame) {
    return {};
  }

  return {
    backgroundImage: `url("${asset.url}")`,
    backgroundPosition: `${(frame.column * 100) / (frame.columns - 1)}% ${(frame.row * 100) / (frame.rows - 1)}%`,
    backgroundSize: `${frame.columns * 100}% ${frame.rows * 100}%`,
  };
}

function CookingCatalogSprite({ entityId, name }: { entityId: string; name: string }) {
  const asset = getCookingRecipeAsset(entityId);

  return asset ? (
    <span
      aria-label={`${name}料理小图`}
      className="cooking-catalog__sprite"
      role="img"
      style={getCookingCatalogSpriteStyle(asset)}
    />
  ) : (
    <span aria-hidden="true" className="cooking-catalog__sprite cooking-catalog__sprite--missing" />
  );
}

function cookingRecipeIngredientText(ingredientIds: readonly string[]) {
  return ingredientIds
    .map((ingredientId) =>
      ingredientId === "fish:any"
        ? "鲜鱼"
        : (COOKING_INGREDIENT_NAME_BY_ID[ingredientId] ?? "食材"),
    )
    .join("、");
}

function hasSelectedCookingRecipeIngredients(
  recipe: CookingCatalogRecipe,
  selectedIngredientIds: readonly string[],
) {
  const availableCounts = new Map<string, number>();
  for (const ingredientId of selectedIngredientIds) {
    availableCounts.set(ingredientId, (availableCounts.get(ingredientId) ?? 0) + 1);
  }

  for (const ingredientId of recipe.ingredients) {
    if (ingredientId === "fish:any") {
      return false;
    }
    const availableCount = availableCounts.get(ingredientId) ?? 0;
    if (availableCount === 0) {
      return false;
    }
    availableCounts.set(ingredientId, availableCount - 1);
  }

  return true;
}

interface CookingRecipeDisplay {
  id: string;
  name: string;
  rarity: string | null;
  ingredientText: string;
}

function CookingRecipeRow({
  canQuickMake = false,
  recipe,
}: {
  canQuickMake?: boolean;
  recipe: CookingRecipeDisplay;
}) {
  return (
    <li>
      <CookingCatalogSprite entityId={recipe.id} name={recipe.name} />
      <span className="cooking-recipe-catalog__copy">
        <span className="cooking-recipe-catalog__head">
          <strong>{recipe.name}</strong>
          {recipe.rarity ? <small data-rarity={recipe.rarity}>{recipe.rarity}</small> : null}
        </span>
        <span className="cooking-recipe-catalog__ingredients">{recipe.ingredientText}</span>
      </span>
      {canQuickMake ? (
        <span className="cooking-recipe-catalog__actions">
          <button
            aria-label={`${recipe.name}一键制作暂未接入`}
            className="cooking-recipe-catalog__quick-make"
            disabled
            type="button"
          >
            一键制作
          </button>
        </span>
      ) : null}
    </li>
  );
}

function CookingRecipeCatalog({
  kitchen,
  preview,
  selectedIngredientIds,
}: {
  kitchen?: BoundKitchenRead | null;
  preview: boolean;
  selectedIngredientIds: readonly string[];
}) {
  const [category, setCategory] = useState<string>("主食小吃");

  if (!preview) {
    const recipes = kitchen?.data.known_recipes;
    if (!recipes || recipes.status === "unavailable") {
      return (
        <FarmUnavailablePanel label={recipes?.reason ? "真实食谱暂不可用" : "食谱数据尚未接入"} />
      );
    }
    const categories = [
      ...new Set(
        recipes.items
          .map((recipe) => recipe.category)
          .filter((value): value is string => value !== null),
      ),
    ];
    const activeCategory = categories.includes(category) ? category : (categories[0] ?? "");
    const categoryRecipes = recipes.items.filter(
      (recipe) => activeCategory === "" || recipe.category === activeCategory,
    );
    return (
      <section aria-label="料理台真实食谱" className="cooking-recipe-catalog">
        <nav aria-label="食谱分类" className="cooking-recipe-catalog__categories">
          {categories.map((recipeCategory) => (
            <button
              aria-pressed={activeCategory === recipeCategory}
              key={recipeCategory}
              onClick={() => setCategory(recipeCategory)}
              type="button"
            >
              {recipeCategory}
            </button>
          ))}
        </nav>
        <ul className="cooking-recipe-catalog__list">
          {categoryRecipes.length > 0 ? (
            categoryRecipes.map((recipe) => (
              <CookingRecipeRow
                key={recipe.recipe_id}
                recipe={{
                  id: recipe.recipe_id,
                  name: recipe.status === "available" && recipe.name ? recipe.name : "身份不可用",
                  rarity: recipe.rarity,
                  ingredientText: recipe.ingredients
                    .map((ingredient) =>
                      ingredient.status === "available" && ingredient.name
                        ? `${ingredient.name}${ingredient.quantity ? `×${ingredient.quantity}` : ""}`
                        : "身份不可用",
                    )
                    .join("、"),
                }}
              />
            ))
          ) : (
            <li>
              <span className="cooking-recipe-catalog__ingredients">当前分类没有真实食谱</span>
            </li>
          )}
        </ul>
      </section>
    );
  }

  const categoryRecipes = COOKING_CATALOG_RECIPES.filter((recipe) => recipe.category === category);

  return (
    <section aria-label="料理台食谱" className="cooking-recipe-catalog">
      <nav aria-label="食谱分类" className="cooking-recipe-catalog__categories">
        {COOKING_RECIPE_CATEGORIES.map((recipeCategory) => (
          <button
            aria-pressed={category === recipeCategory}
            key={recipeCategory}
            onClick={() => setCategory(recipeCategory)}
            type="button"
          >
            {recipeCategory}
          </button>
        ))}
      </nav>
      <ul className="cooking-recipe-catalog__list">
        {categoryRecipes.map((recipe) => (
          <CookingRecipeRow
            canQuickMake={hasSelectedCookingRecipeIngredients(recipe, selectedIngredientIds)}
            key={recipe.id}
            recipe={{
              id: recipe.id,
              name: recipe.name,
              rarity: recipe.rarity,
              ingredientText: cookingRecipeIngredientText(recipe.ingredients),
            }}
          />
        ))}
      </ul>
    </section>
  );
}

export function FarmToolPanel({
  activeScene,
  cart,
  farmCatalog,
  kitchen,
  onClose,
  onChangeCartQuantity,
  onChangeOriginalPlantDraft,
  onChangeSettingsDraft,
  onFarmSettingsAction,
  originalPlantDraft,
  preview,
  selectedCookingIngredientIds,
  ranch,
  settingsDraft,
  tool,
}: FarmToolPanelProps) {
  const titleId = `farm-tool-panel-${activeScene}-${tool.id}`;
  const featureDefinition = FARM_FEATURE_PANELS[activeScene][tool.id];
  const liveSettings =
    !preview && farmCatalog?.data.settings.status === "available"
      ? farmCatalog.data.settings
      : null;
  const baselineSettingsDraft = liveSettings
    ? farmSettingsDraftFromCatalog(liveSettings)
    : undefined;
  const availableTitles = liveSettings
    ? liveSettings.unlocked_titles
        .filter((title) => title.identity_state === "known")
        .map((title) => ({ id: title.title_id, name: title.name }))
    : [];
  const settingsUnavailableMessage =
    farmCatalog?.data.settings.status === "unavailable"
      ? farmCatalog.data.settings.message
      : undefined;

  return (
    <aside aria-labelledby={titleId} className="farm-tool-panel" role="dialog">
      <h2 className="farm-tool-panel__tab" id={titleId}>
        {tool.label}
      </h2>
      <button
        aria-label={`关闭${tool.label}`}
        className="farm-tool-panel__close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>
      {tool.id === "shop" && activeScene !== "neighborhood" ? (
        <Suspense fallback={null}>
          <FarmShopPanelContent
            activeScene={activeScene}
            cart={cart}
            farmCatalog={farmCatalog ?? null}
            kitchen={kitchen ?? null}
            onChangeCartQuantity={onChangeCartQuantity}
            preview={preview}
            ranch={ranch ?? null}
          />
        </Suspense>
      ) : activeScene === "field" && tool.id === "crop-codex" ? (
        <FarmCropCodex farmCatalog={farmCatalog ?? null} preview={preview} />
      ) : activeScene === "cooking" && tool.id === "recipes" ? (
        <CookingRecipeCatalog
          kitchen={kitchen ?? null}
          preview={preview}
          selectedIngredientIds={selectedCookingIngredientIds}
        />
      ) : activeScene === "field" && tool.id === "smelting" ? (
        <SmeltingPanelContent farmCatalog={farmCatalog ?? null} preview={preview} />
      ) : tool.id === "backpack" && activeScene !== "neighborhood" ? (
        <FarmBackpackPanel
          farmCatalog={farmCatalog ?? null}
          kitchen={kitchen ?? null}
          preview={preview}
          ranch={ranch ?? null}
          scene={activeScene}
        />
      ) : activeScene === "field" && tool.id === "adventure" ? (
        <FarmExpeditionPanel farmCatalog={farmCatalog ?? null} preview={preview} />
      ) : activeScene === "ranch" && tool.id === "dispatch" ? (
        <RanchDispatchPanel preview={preview} ranch={ranch ?? null} />
      ) : activeScene === "field" && tool.id === "create" ? (
        <OriginalPlantCreator
          draft={originalPlantDraft}
          editable={preview}
          onChange={onChangeOriginalPlantDraft}
        />
      ) : tool.id === "market" ? (
        <FarmMarketPanel farmCatalog={farmCatalog ?? null} preview={preview} tool={tool} />
      ) : tool.id === "settings" ? (
        !preview && !liveSettings ? (
          <FarmUnavailablePanel label={settingsUnavailableMessage ?? "设置数据尚未接入"} />
        ) : (
          <FarmSettingsPanelContent
            availableTitles={availableTitles}
            baseline={baselineSettingsDraft}
            catalogRevision={farmCatalog?.revision}
            draft={settingsDraft}
            editable={preview || Boolean(onFarmSettingsAction)}
            onChange={onChangeSettingsDraft}
            onSave={onFarmSettingsAction}
          />
        )
      ) : featureDefinition ? (
        <FarmFeaturePanelContent definition={featureDefinition} tool={tool} />
      ) : (
        <div className="farm-tool-panel__empty">
          <img alt="" aria-hidden="true" src={getFarmAssetUrl(tool.iconKey)} />
          <p>暂无可显示内容</p>
          <span>{tool.label}的真实数据接入后会显示在这里。</span>
        </div>
      )}
    </aside>
  );
}
