import {
  type CSSProperties,
  lazy,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type BoundFarmField,
  type BoundFarmHarvestAssist,
  type FarmFieldIssue,
  type FarmHarvestAssistIssue,
  getBoundFarmField,
  harvestBoundFarmField,
} from "../auth/auth-client";
import {
  type BoundFarmCatalogRead,
  farmCatalogIssueMessage,
  getBoundFarmCatalog,
} from "../auth/farm-catalog-client";
import {
  type BoundKitchenRead,
  getBoundKitchen,
  kitchenIssueMessage,
} from "../auth/kitchen-client";
import { type BoundRanchRead, getBoundRanch, ranchIssueMessage } from "../auth/ranch-client";
import {
  type FarmAssetKey,
  type FarmAssetManifestEntry,
  getCookingIngredientAsset,
  getCookingRecipeAsset,
  getFarmAssetUrl,
} from "./farm-asset-manifest";
import {
  COOKING_CATALOG_INGREDIENTS,
  COOKING_CATALOG_RECIPES,
  COOKING_INGREDIENT_CATEGORIES,
  type CookingCatalogRecipe,
  type CookingIngredientCategoryId,
} from "./farm-cooking-catalog";
import { farmFieldIssueMessage, farmHarvestAssistIssueMessage } from "./farm-overview";
import {
  getRanchAnimalPlacementStyle,
  getRanchAnimalSpriteStyle,
  RANCH_SCENE_DEMO_LAYOUTS,
  RANCH_SHOP_ANIMALS,
  type RanchShopAnimal,
} from "./panels/ranch-animal-data";
import type { RanchSceneAnimalDefinition } from "./scenes/ranch/ranch-scene";
import "./farm-page.css";

const FieldScene = lazy(async () => {
  const module = await import("./scenes/field/field-scene");
  return { default: module.FieldScene };
});

const RanchScene = lazy(async () => {
  const module = await import("./scenes/ranch/ranch-scene");
  return { default: module.RanchScene };
});

const CookingScene = lazy(async () => {
  const module = await import("./scenes/cooking/cooking-scene");
  return { default: module.CookingScene };
});

const NeighborhoodScene = lazy(async () => {
  const module = await import("./scenes/neighborhood/neighborhood-scene");
  return { default: module.NeighborhoodScene };
});

const DingdongBulletin = lazy(async () => {
  const module = await import("./panels/bulletin-panel");
  return { default: module.DingdongBulletin };
});

const FarmToolPanel = lazy(async () => {
  const module = await import("./panels/tool-panel");
  return { default: module.FarmToolPanel };
});

type FarmPageState =
  | { stage: "loading" }
  | { stage: "error"; issue: FarmFieldIssue }
  | { stage: "ready"; data: BoundFarmField };

type FarmReadResourceState<T> =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "ready"; data: T }
  | { stage: "error"; message: string };

interface FarmReadResources {
  farmCatalog: FarmReadResourceState<BoundFarmCatalogRead>;
  kitchen: FarmReadResourceState<BoundKitchenRead>;
  ranch: FarmReadResourceState<BoundRanchRead>;
}

interface FarmHarvestAttempt {
  expectedRevision: string;
  idempotencyKey: string;
}

type FarmHarvestActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: FarmHarvestAttempt }
  | {
      stage: "error";
      attempt: FarmHarvestAttempt | null;
      issue: FarmHarvestAssistIssue;
    }
  | { stage: "success"; result: BoundFarmHarvestAssist["data"]["result"] };

type FarmSceneId = "field" | "ranch" | "cooking" | "neighborhood";

type CookingMethodId =
  | "roast"
  | "stew"
  | "stir-fry"
  | "pan-fry"
  | "deep-fry"
  | "steam"
  | "dessert"
  | "drink";

interface FarmPageProps {
  onBack: () => void;
  previewData?: BoundFarmField;
}

interface SceneOption {
  id: FarmSceneId;
  label: string;
  iconKey: FarmAssetKey;
}

interface CookingMethod {
  id: CookingMethodId;
  label: string;
  assetKey: FarmAssetKey;
}

interface CookingToolLayout {
  x: number;
  y: number;
  width: number;
}

type CookingToolLayouts = Record<CookingMethodId, CookingToolLayout>;

interface FarmToolOption {
  id: string;
  label: string;
  iconKey: FarmAssetKey;
}

interface FarmSceneUiState {
  bulletinOpen: boolean;
  selectedTool: FarmToolOption | null;
}

type FarmSceneUiStateMap = Record<FarmSceneId, FarmSceneUiState>;

interface FarmSettingsDraft {
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

interface OriginalPlantDraft {
  description: string;
  harvestText: string;
  latinName: string;
  name: string;
  sowingText: string;
}

type ShopCartSceneId = Exclude<FarmSceneId, "neighborhood">;
type ShopCartQuantities = Readonly<Record<string, number>>;
type ShopCartState = Readonly<Record<ShopCartSceneId, ShopCartQuantities>>;

const FARM_SCENE_BALANCES: Readonly<
  Record<ShopCartSceneId, { currency: "gold" | "silver"; label: string }>
> = {
  field: { currency: "gold", label: "农场金币" },
  ranch: { currency: "gold", label: "牧场金币" },
  cooking: { currency: "silver", label: "银币" },
};

interface FarmToolEditorLayout {
  iconX: number;
  iconY: number;
  iconSize: number;
  textX: number;
  textY: number;
  textSize: number;
}

type FarmToolEditorLayouts = Record<string, FarmToolEditorLayout>;
type FarmToolEditorLayer = "icon" | "text";

const SCENE_OPTIONS: readonly SceneOption[] = [
  { id: "field", label: "农场", iconKey: "shell.scene.field" },
  { id: "ranch", label: "牧场", iconKey: "shell.scene.ranch" },
  { id: "cooking", label: "料理台", iconKey: "shell.scene.cooking" },
  { id: "neighborhood", label: "邻里", iconKey: "shell.scene.neighborhood" },
];

const FARM_TOOL_OPTIONS: Readonly<Record<FarmSceneId, readonly FarmToolOption[]>> = {
  field: [
    { id: "shop", label: "商店", iconKey: "panel.tool.shop" },
    { id: "backpack", label: "背包", iconKey: "panel.tool.backpack" },
    { id: "crop-codex", label: "作物图鉴", iconKey: "panel.tool.crop-codex" },
    { id: "create", label: "创造", iconKey: "panel.tool.create" },
    { id: "market", label: "集市", iconKey: "panel.tool.market" },
    { id: "adventure", label: "探险", iconKey: "panel.tool.adventure" },
    { id: "smelting", label: "熔炼", iconKey: "panel.tool.smelting" },
    { id: "settings", label: "设置", iconKey: "panel.tool.settings" },
  ],
  ranch: [
    { id: "shop", label: "商店", iconKey: "panel.tool.shop" },
    { id: "backpack", label: "背包", iconKey: "panel.tool.backpack" },
    { id: "dispatch", label: "派遣", iconKey: "panel.tool.dispatch" },
    { id: "market", label: "集市", iconKey: "panel.tool.market" },
    { id: "settings", label: "设置", iconKey: "panel.tool.settings" },
  ],
  cooking: [
    { id: "shop", label: "商店", iconKey: "panel.tool.shop" },
    { id: "backpack", label: "背包", iconKey: "panel.tool.backpack" },
    { id: "recipes", label: "食谱", iconKey: "panel.tool.recipes" },
    { id: "market", label: "集市", iconKey: "panel.tool.market" },
    { id: "settings", label: "设置", iconKey: "panel.tool.settings" },
  ],
  neighborhood: [],
};

const NEIGHBORHOOD_OPTIONS = [
  { id: "ranking", label: "排行榜", iconKey: "neighborhood.ranking" },
  { id: "message-board", label: "留言板", iconKey: "neighborhood.message-board" },
  { id: "original-crops", label: "原创作物", iconKey: "neighborhood.original-crops" },
] as const satisfies readonly FarmToolOption[];

type NeighborhoodSectionId = (typeof NEIGHBORHOOD_OPTIONS)[number]["id"];

const NEIGHBORHOOD_EMPTY_LABELS: Readonly<Record<NeighborhoodSectionId, string>> = {
  ranking: "暂无可显示的排行榜数据。",
  "message-board": "暂无可显示的留言。",
  "original-crops": "暂无可显示的原创作物。",
};

const FARM_TOOL_EDITOR_BULLETIN_OPTION: FarmToolOption = {
  id: "bulletin",
  label: "叮咚播报",
  iconKey: "shell.bulletin",
};

const FARM_TOOL_EDITOR_OPTIONS: readonly FarmToolOption[] = [
  FARM_TOOL_EDITOR_BULLETIN_OPTION,
  ...Array.from(
    new Map(
      [...Object.values(FARM_TOOL_OPTIONS).flat(), ...NEIGHBORHOOD_OPTIONS]
        .flat()
        .map((tool) => [tool.id, tool]),
    ).values(),
  ),
];

const FARM_TOOL_EDITOR_CANVAS_SIZE = 192;
const FARM_TOOL_EDITOR_HASH_PREFIX = "#farmTools=";
const DEFAULT_FARM_TOOL_EDITOR_LAYOUT: FarmToolEditorLayout = {
  iconX: 96,
  iconY: 82,
  iconSize: 138,
  textX: 96,
  textY: 154,
  textSize: 24,
};

const COOKING_RESULT_STYLE_PREVIEW =
  COOKING_CATALOG_RECIPES.find((recipe) => recipe.id === "tomato_beef_stew") ??
  COOKING_CATALOG_RECIPES[0];
const PAID_COOKING_TOOL_IDS = ["roast", "steam", "deep-fry"] as const;
const COOKING_PREVIEW_OWNED_PAID_TOOL_IDS = new Set<CookingMethodId>(["roast"]);
const COOKING_PREP_SLOT_IDS = [
  "ingredient-slot-1",
  "ingredient-slot-2",
  "ingredient-slot-3",
  "ingredient-slot-4",
  "ingredient-slot-5",
] as const;
type CookingPrepCategoryId = CookingIngredientCategoryId | "ranch-products" | "fish";
const COOKING_PREP_CATEGORIES: readonly {
  id: CookingPrepCategoryId;
  label: string;
}[] = [
  ...COOKING_INGREDIENT_CATEGORIES.map(({ id, label }) => ({ id, label })),
  { id: "ranch-products", label: "牧场" },
  { id: "fish", label: "鱼获" },
];
const COOKING_SHOP_INGREDIENT_CATEGORY_BY_ID = new Map<string, CookingIngredientCategoryId>(
  COOKING_INGREDIENT_CATEGORIES.flatMap((category) =>
    category.ingredientIds.map((ingredientId) => [ingredientId, category.id] as const),
  ),
);
const EMPTY_SHOP_CART: ShopCartQuantities = {};

function createEmptyShopCarts(): ShopCartState {
  return {
    field: {},
    ranch: {},
    cooking: {},
  };
}

function createInitialSceneUiStates(): FarmSceneUiStateMap {
  return {
    field: { bulletinOpen: false, selectedTool: null },
    ranch: { bulletinOpen: false, selectedTool: null },
    cooking: { bulletinOpen: false, selectedTool: null },
    neighborhood: { bulletinOpen: false, selectedTool: null },
  };
}

function createInitialFarmReadResources(): FarmReadResources {
  return {
    farmCatalog: { stage: "idle" },
    kitchen: { stage: "idle" },
    ranch: { stage: "idle" },
  };
}

function getSceneReadResource(sceneId: FarmSceneId): keyof FarmReadResources | null {
  if (sceneId === "ranch") return "ranch";
  if (sceneId === "cooking") return "kitchen";
  if (sceneId === "neighborhood") return "farmCatalog";
  return null;
}

function getToolReadResource(sceneId: FarmSceneId, toolId: string): keyof FarmReadResources | null {
  if (toolId === "market" || toolId === "settings") return "farmCatalog";
  if (sceneId === "field") return toolId === "create" ? null : "farmCatalog";
  if (sceneId === "ranch") return "ranch";
  if (sceneId === "cooking") return "kitchen";
  return null;
}

const FARM_READ_RESOURCE_LABELS: Readonly<Record<keyof FarmReadResources, string>> = {
  farmCatalog: "农场目录",
  kitchen: "料理数据",
  ranch: "牧场数据",
};

const FARM_TOOL_LAYOUTS: Readonly<Record<string, FarmToolEditorLayout>> = {
  bulletin: {
    iconX: 91.953125,
    iconY: 77.484375,
    iconSize: 211.2,
    textX: 97.7265625,
    textY: 143.6640625,
    textSize: 35.52,
  },
  shop: {
    iconX: 97.625,
    iconY: 85.6328125,
    iconSize: 218.88,
    textX: 99.46875,
    textY: 143.6171875,
    textSize: 35.52,
  },
  backpack: {
    iconX: 90.84375,
    iconY: 88.6953125,
    iconSize: 163.2,
    textX: 94.33984375,
    textY: 151.046875,
    textSize: 35.52,
  },
  "crop-codex": {
    iconX: 96,
    iconY: 82,
    iconSize: 182.4,
    textX: 94.69140625,
    textY: 132.9140625,
    textSize: 35.52,
  },
  create: {
    iconX: 96,
    iconY: 82,
    iconSize: 182.4,
    textX: 94.69140625,
    textY: 132.9140625,
    textSize: 35.52,
  },
  market: {
    iconX: 96,
    iconY: 82,
    iconSize: 218.88,
    textX: 96.75,
    textY: 143.3203125,
    textSize: 35.52,
  },
  adventure: {
    iconX: 94.01953125,
    iconY: 81.8203125,
    iconSize: 201.6,
    textX: 95.35546875,
    textY: 144.15625,
    textSize: 35.52,
  },
  ranking: {
    iconX: 95.74609375,
    iconY: 86.55078125,
    iconSize: 168.96,
    textX: 96.609375,
    textY: 134.96875,
    textSize: 35.52,
  },
  "message-board": {
    iconX: 95.1796875,
    iconY: 83.44921875,
    iconSize: 186.24,
    textX: 95.6875,
    textY: 145.46875,
    textSize: 35.52,
  },
  settings: {
    iconX: 97.1796875,
    iconY: 90.6953125,
    iconSize: 168,
    textX: 98.6171875,
    textY: 139.16015625,
    textSize: 35.52,
  },
  dispatch: {
    iconX: 96,
    iconY: 82,
    iconSize: 183.36,
    textX: 94.25,
    textY: 133.71484375,
    textSize: 35.52,
  },
  recipes: {
    iconX: 96.47265625,
    iconY: 86.0546875,
    iconSize: 147.84,
    textX: 92.6171875,
    textY: 138.58984375,
    textSize: 35.52,
  },
  smelting: {
    iconX: 95.8203125,
    iconY: 91.18359375,
    iconSize: 173.76,
    textX: 93.3203125,
    textY: 141.98828125,
    textSize: 35.52,
  },
};

const DEFAULT_COOKING_METHOD: CookingMethod = {
  id: "stew",
  label: "炖",
  assetKey: "kitchen.method.stew",
};

const COOKING_METHODS: readonly CookingMethod[] = [
  { id: "roast", label: "烤", assetKey: "kitchen.method.roast" },
  DEFAULT_COOKING_METHOD,
  { id: "stir-fry", label: "炒", assetKey: "kitchen.method.wok" },
  { id: "pan-fry", label: "煎", assetKey: "kitchen.method.wok" },
  { id: "deep-fry", label: "油炸", assetKey: "kitchen.method.deep-fry" },
  { id: "steam", label: "蒸", assetKey: "kitchen.method.steam" },
  { id: "dessert", label: "甜品", assetKey: "kitchen.method.dessert" },
  { id: "drink", label: "饮品", assetKey: "kitchen.method.drink" },
];

function getVisibleCookingMethods(
  preview: boolean,
  kitchen: BoundKitchenRead | null = null,
): readonly CookingMethod[] {
  const ownedToolIds = new Set(
    kitchen?.data.tools.status === "available"
      ? kitchen.data.tools.items.flatMap((tool) =>
          tool.status === "available" && tool.owned === true ? [tool.tool_id] : [],
        )
      : [],
  );
  return COOKING_METHODS.filter(
    (method) =>
      !PAID_COOKING_TOOL_IDS.includes(method.id as (typeof PAID_COOKING_TOOL_IDS)[number]) ||
      (preview && COOKING_PREVIEW_OWNED_PAID_TOOL_IDS.has(method.id)) ||
      ownedToolIds.has(method.id),
  );
}
const COOKING_TOOL_LAYOUTS: Readonly<CookingToolLayouts> = {
  roast: { x: 49.39713550883651, y: 66.69322842368047, width: 64.5 },
  stew: { x: 49.229278975741245, y: 67.18072408991446, width: 45.5 },
  "stir-fry": { x: 48.85234164420485, y: 68.54087925203899, width: 46.5 },
  "pan-fry": { x: 48.85234164420485, y: 68.54087925203899, width: 46.5 },
  "deep-fry": { x: 50.44958726415094, y: 66.1706783369803, width: 50 },
  steam: { x: 48.95447270889488, y: 67.35378953650289, width: 63.5 },
  dessert: { x: 50.42642351752021, y: 66.61279092898349, width: 52 },
  drink: { x: 51.07922001347709, y: 68.60751939526557, width: 51 },
};

function getCookingToolLayoutId(methodId: CookingMethodId): CookingMethodId {
  return methodId === "pan-fry" ? "stir-fry" : methodId;
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function FarmIdentityPlaque({
  equippedTitle,
  farmDoorplate,
  farmName,
  landName,
  landTier,
  seasonName,
  welcomeMessage,
}: {
  equippedTitle: string | null;
  farmDoorplate: string;
  farmName: string;
  landName: string;
  landTier: number;
  seasonName: string;
  welcomeMessage: string | null;
}) {
  return (
    <aside aria-label="农场资料" className="farm-field-plaque">
      <img
        alt=""
        aria-hidden="true"
        className="farm-field-plaque__art"
        src={getFarmAssetUrl("field.identity-plaque")}
      />
      <span className="farm-field-plaque__copy">
        {equippedTitle ? <small>{equippedTitle}</small> : null}
        <strong>{farmName}</strong>
        <span>
          门牌 <b>{farmDoorplate}</b>
        </span>
        <small>
          {seasonName} · 土地 {landTier} {landName}
        </small>
        {welcomeMessage ? <em>{welcomeMessage}</em> : null}
      </span>
    </aside>
  );
}

function RanchShopAnimalSprite({ animal }: { animal: RanchShopAnimal }) {
  return (
    <span
      aria-hidden="true"
      className="ranch-shop__animal-sprite"
      style={getRanchAnimalSpriteStyle(animal)}
    />
  );
}

type FarmRanchResident = BoundRanchRead["data"]["residents"]["animals"][number];

interface LiveRanchResidentView {
  category: "动物" | "宠物" | "巡逻鹅";
  id: string;
  resident: FarmRanchResident;
  spriteAnimal: RanchShopAnimal;
}

function getLiveRanchResidents(ranch: BoundRanchRead | null): readonly LiveRanchResidentView[] {
  if (ranch?.data.residents.status !== "available") {
    return [];
  }

  const candidates: Array<{
    category: LiveRanchResidentView["category"];
    resident: FarmRanchResident;
  }> = [
    ...ranch.data.residents.animals.map((resident) => ({ category: "动物" as const, resident })),
    ...ranch.data.residents.pets.map((resident) => ({ category: "宠物" as const, resident })),
    ...(ranch.data.residents.patrol_goose
      ? [{ category: "巡逻鹅" as const, resident: ranch.data.residents.patrol_goose }]
      : []),
  ];

  return candidates.flatMap(({ category, resident }) => {
    const kindId = resident.identity.kind_id;
    const name = resident.identity.custom_name ?? resident.identity.name;
    const spriteId = kindId === "patrol_goose" ? "goose" : kindId;
    const spriteAnimal = RANCH_SHOP_ANIMALS.find((animal) => animal.id === spriteId);
    return resident.status === "known" &&
      resident.identity.status === "known" &&
      kindId !== null &&
      name !== null &&
      spriteAnimal
      ? [
          {
            category,
            id: `${category}:${kindId}`,
            resident,
            spriteAnimal,
          },
        ]
      : [];
  });
}

function getLiveRanchSceneLayout(index: number, total: number) {
  const columns = total > 9 ? 4 : 3;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rowCount = Math.max(1, Math.ceil(total / columns));
  return {
    x: 18 + (column * 64) / Math.max(1, columns - 1),
    y: 42 + (row * 32) / Math.max(1, rowCount - 1),
    size: total > 12 ? 12 : total > 6 ? 15 : 18,
    roam: { minX: 10, maxX: 88, minY: 32, maxY: 79 },
  };
}

function RanchResidentDetail({
  view,
  onClose,
}: {
  view:
    | { kind: "preview"; animal: RanchShopAnimal }
    | { kind: "live"; resident: LiveRanchResidentView };
  onClose: () => void;
}) {
  const animal = view.kind === "preview" ? view.animal : view.resident.spriteAnimal;
  const liveResident = view.kind === "live" ? view.resident : null;
  const residentData = liveResident?.resident ?? null;
  const name =
    view.kind === "preview"
      ? animal.name
      : (residentData?.identity.custom_name ?? residentData?.identity.name ?? "");
  const titleId = `ranch-resident-detail-${view.kind === "preview" ? animal.id : liveResident?.id}`;

  return (
    <section
      aria-labelledby={titleId}
      aria-modal="true"
      className="ranch-resident-detail"
      data-animal-id={animal.id}
      role="dialog"
    >
      <div className="ranch-resident-detail__paper">
        <button
          aria-label={`关闭${name}详情`}
          className="ranch-resident-detail__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <header className="ranch-resident-detail__head">
          <span className="ranch-resident-detail__portrait">
            <RanchShopAnimalSprite animal={animal} />
          </span>
          <span className="ranch-resident-detail__identity">
            <small>{liveResident?.category ?? animal.category}</small>
            <strong id={titleId}>{name}</strong>
            {view.kind === "preview" && animal.description ? <p>{animal.description}</p> : null}
          </span>
        </header>
        <dl className="ranch-resident-detail__facts">
          {view.kind === "live" && residentData?.level !== null ? (
            <div>
              <dt>等级</dt>
              <dd>{residentData?.level}</dd>
            </div>
          ) : null}
          {view.kind === "live" && residentData?.produce?.item.status === "known" ? (
            <div>
              <dt>产物</dt>
              <dd>
                {residentData.produce.item.name}
                {residentData.produce.item.pending_count !== null
                  ? ` ×${residentData.produce.item.pending_count}`
                  : ""}
              </dd>
            </div>
          ) : null}
          {view.kind === "live" && residentData?.produce?.meat?.status === "known" ? (
            <div>
              <dt>肉类</dt>
              <dd>
                {residentData.produce.meat.name}
                {residentData.produce.meat.pending_count !== null
                  ? ` ×${residentData.produce.meat.pending_count}`
                  : ""}
              </dd>
            </div>
          ) : null}
          {view.kind === "live" && residentData?.dispatch ? (
            <div>
              <dt>状态</dt>
              <dd>
                {residentData.dispatch.state === "home"
                  ? "在牧场"
                  : residentData.dispatch.state === "active"
                    ? "派遣中"
                    : residentData.dispatch.state === "pending_settlement"
                      ? "等待结算"
                      : "暂不可用"}
              </dd>
            </div>
          ) : null}
          {view.kind === "live" && residentData?.accessories.status === "available" ? (
            <div>
              <dt>配饰</dt>
              <dd>
                {residentData.accessories.items
                  .flatMap((accessory) =>
                    accessory.status === "known" && accessory.name ? [accessory.name] : [],
                  )
                  .join("、") || "未佩戴"}
              </dd>
            </div>
          ) : null}
          {view.kind === "preview" && animal.produce ? (
            <div>
              <dt>产物</dt>
              <dd>{animal.produce}</dd>
            </div>
          ) : null}
          {view.kind === "preview" && animal.produceEveryTicks ? (
            <div>
              <dt>产出周期</dt>
              <dd>{animal.produceEveryTicks} 个农场周期</dd>
            </div>
          ) : null}
          {view.kind === "preview" && animal.effectLabel ? (
            <div>
              <dt>作用</dt>
              <dd>{animal.effectLabel}</dd>
            </div>
          ) : null}
          {view.kind === "preview" && animal.effectText ? (
            <div className="ranch-resident-detail__fact-description">
              <dt>效果</dt>
              <dd>{animal.effectText}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}

function FieldSceneOverlay({
  harvestAssist,
  onHarvestAssist,
  submitting,
}: {
  harvestAssist: BoundFarmField["data"]["harvest_assist"];
  onHarvestAssist?: (() => void) | undefined;
  submitting: boolean;
}) {
  const enabled = harvestAssist.can_assist && Boolean(onHarvestAssist) && !submitting;
  return (
    <aside aria-label="农场帮收" className="farm-scene-action-dock farm-scene-action-dock--field">
      <dl>
        <div>
          <dt>成熟</dt>
          <dd>{harvestAssist.mature_plot_count}</dd>
        </div>
        <div>
          <dt>今日帮收</dt>
          <dd>
            {harvestAssist.remaining}/{harvestAssist.daily_limit}
          </dd>
        </div>
      </dl>
      <button disabled={!enabled} onClick={onHarvestAssist} type="button">
        {submitting ? "正在帮收…" : "一键帮 TA 收"}
      </button>
    </aside>
  );
}

function FarmHarvestReceipt({
  onClose,
  result,
}: {
  onClose: () => void;
  result: BoundFarmHarvestAssist["data"]["result"];
}) {
  return (
    <section aria-label="帮收结果" aria-modal="true" className="farm-harvest-receipt" role="dialog">
      <button
        aria-label="关闭帮收结果"
        className="farm-harvest-receipt__close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>
      <header>
        <span>一键帮收</span>
        <strong>收获完成</strong>
        <small>共收获 {result.harvested_count} 块</small>
      </header>
      <ul className="farm-harvest-receipt__list">
        {result.harvests.map((harvest, index) => (
          <li key={`${harvest.plot_id ?? `crop-${index}`}-${harvest.crop.crop_id}`}>
            <span>
              <strong>{harvest.crop.name}</strong>
              <small>
                {harvest.crop.rarity}
                {harvest.quality ? ` · ${harvest.quality.name}` : ""}
                {harvest.is_new ? " · 新图鉴" : ""}
              </small>
              {harvest.material_drop || harvest.potion_drop ? (
                <small>
                  {harvest.material_drop
                    ? `${harvest.material_drop.name} ×${harvest.material_drop.quantity}`
                    : ""}
                  {harvest.material_drop && harvest.potion_drop ? " · " : ""}
                  {harvest.potion_drop
                    ? `${harvest.potion_drop.name} ×${harvest.potion_drop.quantity}`
                    : ""}
                </small>
              ) : null}
            </span>
            <b>
              {harvest.currency === "silver" ? "银币" : "金币"} +{harvest.value}
              {harvest.bonus_value > 0 ? <small>金币 +{harvest.bonus_value}</small> : null}
            </b>
          </li>
        ))}
      </ul>
      <footer className="farm-harvest-receipt__summary">
        {result.farm_coins_gained > 0 ? <span>金币 +{result.farm_coins_gained}</span> : null}
        {result.silver_gained > 0 ? <span>银币 +{result.silver_gained}</span> : null}
        {result.season_event ? <span>{result.season_event.label}</span> : null}
        {result.new_titles.map((title) => (
          <span key={title.title_id}>新称号：{title.name}</span>
        ))}
      </footer>
    </section>
  );
}

function FarmHarvestNotice({
  action,
  onClose,
  onReload,
  onRetry,
}: {
  action: Extract<FarmHarvestActionState, { stage: "error" }>;
  onClose: () => void;
  onReload: () => void;
  onRetry: () => void;
}) {
  return (
    <aside className="farm-harvest-notice" role="alert">
      <button aria-label="关闭帮收提示" onClick={onClose} type="button">
        ×
      </button>
      <p>{farmHarvestAssistIssueMessage(action.issue)}</p>
      {action.attempt ? (
        <button className="farm-harvest-notice__action" onClick={onRetry} type="button">
          重试同一次帮收
        </button>
      ) : (
        <button className="farm-harvest-notice__action" onClick={onReload} type="button">
          重新读取农场
        </button>
      )}
    </aside>
  );
}

function getLiveCookingIngredientOptions(
  kitchen: BoundKitchenRead | null,
): readonly CookingIngredientPickerOption[] {
  if (!kitchen) {
    return [];
  }

  const options: CookingIngredientPickerOption[] = [];
  if (kitchen.data.stacked_ingredients.status === "available") {
    for (const ingredient of kitchen.data.stacked_ingredients.items) {
      const categoryId = COOKING_SHOP_INGREDIENT_CATEGORY_BY_ID.get(ingredient.ingredient_id);
      if (
        ingredient.status !== "available" ||
        ingredient.name === null ||
        ingredient.quantity === null ||
        ingredient.quantity <= 0 ||
        !categoryId ||
        !getCookingIngredientAsset(ingredient.ingredient_id)
      ) {
        continue;
      }
      options.push({
        categoryId,
        entityId: ingredient.ingredient_id,
        name: ingredient.name,
        quantity: ingredient.quantity,
        selectionIds: [ingredient.ingredient_id],
      });
    }
  }

  if (kitchen.data.product_instances.status === "available") {
    const products = new Map<string, CookingIngredientPickerOption>();
    for (const product of kitchen.data.product_instances.items) {
      if (
        product.status !== "available" ||
        product.name === null ||
        !getCookingIngredientAsset(product.product_id)
      ) {
        continue;
      }
      const selectionId = `product:${product.product_instance_id}`;
      const existing = products.get(product.product_id);
      if (existing) {
        products.set(product.product_id, {
          ...existing,
          quantity: (existing.quantity ?? 0) + 1,
          selectionIds: [...existing.selectionIds, selectionId],
        });
      } else {
        products.set(product.product_id, {
          categoryId: "ranch-products",
          entityId: product.product_id,
          name: product.name,
          quantity: 1,
          selectionIds: [selectionId],
        });
      }
    }
    options.push(...products.values());
  }

  if (kitchen.data.fish_instances.status === "available") {
    const fish = new Map<string, CookingIngredientPickerOption>();
    for (const catchItem of kitchen.data.fish_instances.items) {
      if (catchItem.status !== "available" || catchItem.name === null) {
        continue;
      }
      const selectionId = `fish:${catchItem.catch_instance_id}`;
      const existing = fish.get(catchItem.fish_id);
      if (existing) {
        fish.set(catchItem.fish_id, {
          ...existing,
          quantity: (existing.quantity ?? 0) + 1,
          selectionIds: [...existing.selectionIds, selectionId],
        });
      } else {
        fish.set(catchItem.fish_id, {
          categoryId: "fish",
          entityId: `fish:${catchItem.fish_id}`,
          name: catchItem.name,
          quantity: 1,
          selectionIds: [selectionId],
        });
      }
    }
    options.push(...fish.values());
  }

  return options;
}

function CookingPrepOverlay({
  ingredientPickerOpen,
  onCloseIngredientPicker,
  onOpenIngredientPicker,
  onRemoveIngredient,
  onSelectIngredient,
  selectedMethodId,
  selectedIngredientIds,
  onSelectMethod,
  kitchen,
  preview,
}: {
  ingredientPickerOpen: boolean;
  onCloseIngredientPicker: () => void;
  onOpenIngredientPicker: () => void;
  onRemoveIngredient: (slotIndex: number) => void;
  onSelectIngredient: (ingredientId: string) => void;
  selectedMethodId: CookingMethodId;
  selectedIngredientIds: readonly string[];
  onSelectMethod: (methodId: CookingMethodId) => void;
  kitchen: BoundKitchenRead | null;
  preview: boolean;
}) {
  const [resultPreviewOpen, setResultPreviewOpen] = useState(false);
  const visibleMethods = getVisibleCookingMethods(preview, kitchen);
  const ingredientOptions: readonly CookingIngredientPickerOption[] = preview
    ? COOKING_CATALOG_INGREDIENTS.map((ingredient) => ({
        categoryId: COOKING_SHOP_INGREDIENT_CATEGORY_BY_ID.get(ingredient.id) ?? "grains",
        entityId: ingredient.id,
        name: ingredient.name,
        quantity: null,
        selectionIds: [ingredient.id],
      }))
    : getLiveCookingIngredientOptions(kitchen);
  const ingredientOptionsBySelectionId = new Map(
    ingredientOptions.flatMap((ingredient) =>
      ingredient.selectionIds.map((selectionId) => [selectionId, ingredient] as const),
    ),
  );
  const selectedMethod =
    visibleMethods.find((method) => method.id === selectedMethodId) ?? DEFAULT_COOKING_METHOD;
  const selectedMethodIndex = visibleMethods.findIndex((method) => method.id === selectedMethod.id);
  const previousMethod =
    visibleMethods[(selectedMethodIndex - 1 + visibleMethods.length) % visibleMethods.length] ??
    DEFAULT_COOKING_METHOD;
  const nextMethod =
    visibleMethods[(selectedMethodIndex + 1) % visibleMethods.length] ?? DEFAULT_COOKING_METHOD;

  return (
    <>
      <aside aria-label="料理准备" className="farm-cooking-prep">
        <ol aria-label="五个食材位置" className="farm-cooking-prep__slots">
          {COOKING_PREP_SLOT_IDS.map((slotId, index) => {
            const selectionId = selectedIngredientIds[index];
            const ingredient = selectionId
              ? ingredientOptionsBySelectionId.get(selectionId)
              : undefined;

            return (
              <li key={slotId}>
                {selectionId && ingredient ? (
                  <button
                    aria-label={`移除第 ${index + 1} 格的${ingredient.name}`}
                    onClick={() => onRemoveIngredient(index)}
                    type="button"
                  >
                    <CookingCatalogSprite
                      entityId={ingredient.entityId}
                      kind="ingredient"
                      name={ingredient.name}
                    />
                  </button>
                ) : (
                  <span className="farm-visually-hidden">第 {index + 1} 个食材位置为空</span>
                )}
              </li>
            );
          })}
        </ol>
      </aside>
      <nav aria-label="切换料理方式" className="farm-cooking-selector">
        <button
          aria-label={`上一种料理方式：${previousMethod.label}`}
          className="farm-cooking__cycle farm-cooking__cycle--previous"
          onClick={() => onSelectMethod(previousMethod.id)}
          type="button"
        >
          ‹
        </button>
        <p aria-live="polite" className="farm-cooking__method-label">
          {selectedMethod.label}
        </p>
        <fieldset className="farm-cooking__actions">
          <legend className="farm-visually-hidden">料理操作</legend>
          <button onClick={onOpenIngredientPicker} type="button">
            放入食材
          </button>
          <button
            disabled={!preview || selectedIngredientIds.length === 0}
            onClick={() => setResultPreviewOpen(true)}
            type="button"
          >
            烹饪
          </button>
        </fieldset>
        <button
          aria-label={`下一种料理方式：${nextMethod.label}`}
          className="farm-cooking__cycle farm-cooking__cycle--next"
          onClick={() => onSelectMethod(nextMethod.id)}
          type="button"
        >
          ›
        </button>
      </nav>
      {ingredientPickerOpen ? (
        <CookingIngredientPicker
          ingredients={ingredientOptions}
          onClose={onCloseIngredientPicker}
          onSelect={onSelectIngredient}
          selectedIngredientIds={selectedIngredientIds}
          selectionFull={selectedIngredientIds.length >= COOKING_PREP_SLOT_IDS.length}
        />
      ) : null}
      {preview && resultPreviewOpen ? (
        <CookingResultStylePreview
          onClose={() => setResultPreviewOpen(false)}
          result={COOKING_RESULT_STYLE_PREVIEW}
        />
      ) : null}
    </>
  );
}

interface CookingIngredientPickerOption {
  categoryId: CookingPrepCategoryId;
  entityId: string;
  name: string;
  quantity: number | null;
  selectionIds: readonly string[];
}

function CookingIngredientPickerItem({
  ingredient,
  onSelect,
  selectedIngredientIds,
  selectionFull,
}: {
  ingredient: CookingIngredientPickerOption;
  onSelect: (ingredientId: string) => void;
  selectedIngredientIds: readonly string[];
  selectionFull: boolean;
}) {
  const selectedCount = selectedIngredientIds.filter((selectionId) =>
    ingredient.selectionIds.includes(selectionId),
  ).length;
  const nextSelectionId =
    ingredient.selectionIds.length === 1
      ? ingredient.selectionIds[0]
      : ingredient.selectionIds.find((selectionId) => !selectedIngredientIds.includes(selectionId));
  const exhausted = ingredient.quantity !== null && selectedCount >= ingredient.quantity;

  return (
    <li>
      <button
        aria-label={`放入${ingredient.name}`}
        disabled={selectionFull || exhausted || !nextSelectionId}
        onClick={() => {
          if (nextSelectionId) onSelect(nextSelectionId);
        }}
        type="button"
      >
        <span aria-hidden="true" className="farm-cooking-picker__quantity">
          ×{ingredient.quantity ?? "—"}
        </span>
        <CookingCatalogSprite
          entityId={ingredient.entityId}
          kind="ingredient"
          name={ingredient.name}
        />
        <strong>{ingredient.name}</strong>
      </button>
    </li>
  );
}

function CookingIngredientPicker({
  ingredients,
  onClose,
  onSelect,
  selectedIngredientIds,
  selectionFull,
}: {
  ingredients: readonly CookingIngredientPickerOption[];
  onClose: () => void;
  onSelect: (ingredientId: string) => void;
  selectedIngredientIds: readonly string[];
  selectionFull: boolean;
}) {
  const [categoryId, setCategoryId] = useState<CookingPrepCategoryId>("grains");
  const categoryIngredients = ingredients.filter(
    (ingredient) => ingredient.categoryId === categoryId,
  );

  return (
    <section aria-label="选择食材" className="farm-cooking-picker">
      <header>
        <strong>选择食材</strong>
        <button aria-label="关闭食材选择" onClick={onClose} type="button">
          ×
        </button>
      </header>
      <nav aria-label="备料食材分类" className="farm-cooking-picker__categories">
        {COOKING_PREP_CATEGORIES.map((ingredientCategory) => (
          <button
            aria-pressed={categoryId === ingredientCategory.id}
            className="farm-cooking-picker__category"
            key={ingredientCategory.id}
            onClick={() => setCategoryId(ingredientCategory.id)}
            type="button"
          >
            {ingredientCategory.label}
          </button>
        ))}
      </nav>
      {categoryIngredients.length > 0 ? (
        <ul>
          {categoryIngredients.map((ingredient) => (
            <CookingIngredientPickerItem
              ingredient={ingredient}
              key={`${ingredient.categoryId}:${ingredient.entityId}`}
              onSelect={onSelect}
              selectedIngredientIds={selectedIngredientIds}
              selectionFull={selectionFull}
            />
          ))}
        </ul>
      ) : (
        <p>当前还没有可选择的真实食材。</p>
      )}
    </section>
  );
}

function CookingResultStylePreview({
  onClose,
  result,
}: {
  onClose: () => void;
  result: Pick<CookingCatalogRecipe, "id" | "name" | "rarity">;
}) {
  return (
    <section
      aria-label="料理结果样式预览"
      aria-modal="true"
      className="farm-cooking-result-preview"
      role="dialog"
    >
      <div className="farm-cooking-result-preview__paper" data-rarity={result.rarity}>
        <button
          aria-label="关闭料理结果预览"
          className="farm-cooking-result-preview__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <div className="farm-cooking-result-preview__main">
          <span className="farm-cooking-result-preview__visual">
            <CookingCatalogSprite entityId={result.id} kind="recipe" name={result.name} />
          </span>
          <span className="farm-cooking-result-preview__copy">
            <small data-rarity={result.rarity}>{result.rarity}</small>
            <strong>{result.name}</strong>
            <span>新食谱已解锁</span>
          </span>
        </div>
        <section aria-label="锁定系统回收价" className="farm-cooking-result-preview__value">
          <span aria-label="牧场金币暂未接入" role="img">
            <i aria-hidden="true" data-currency="gold" />
            <strong>—</strong>
          </span>
          <em aria-hidden="true">+</em>
          <span aria-label="银币暂未接入" role="img">
            <i aria-hidden="true" data-currency="silver" />
            <strong>—</strong>
          </span>
        </section>
        <button className="farm-cooking-result-preview__collect" onClick={onClose} type="button">
          收进料理柜
        </button>
      </div>
    </section>
  );
}

function SceneTabs({
  activeScene,
  onChange,
}: {
  activeScene: FarmSceneId;
  onChange: (sceneId: FarmSceneId) => void;
}) {
  return (
    <nav aria-label="农场场景" className="farm-scene-tabs">
      {SCENE_OPTIONS.map((scene) => (
        <button
          aria-current={activeScene === scene.id ? "page" : undefined}
          key={scene.id}
          onClick={() => onChange(scene.id)}
          type="button"
        >
          <img alt="" aria-hidden="true" src={getFarmAssetUrl(scene.iconKey)} />
          <span>{scene.label}</span>
        </button>
      ))}
    </nav>
  );
}

function SceneBalance({
  farmCoins,
  ranchCoins,
  sceneId,
  silver,
}: {
  farmCoins: number;
  ranchCoins: number | null;
  sceneId: ShopCartSceneId;
  silver: number | null;
}) {
  const balance = FARM_SCENE_BALANCES[sceneId];
  const value = sceneId === "field" ? farmCoins : sceneId === "ranch" ? ranchCoins : silver;

  return (
    <div
      aria-label={value === null ? `${balance.label}余额暂未接入` : `${balance.label}余额 ${value}`}
      className={`farm-scene-balance farm-scene-balance--${balance.currency}`}
      role="status"
    >
      <i aria-hidden="true" />
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

function FarmToolBar({
  activeScene,
  onOpenBulletin,
  onSelect,
}: {
  activeScene: FarmSceneId;
  onOpenBulletin: () => void;
  onSelect: (tool: FarmToolOption) => void;
}) {
  const tools = FARM_TOOL_OPTIONS[activeScene];
  const bulletinLayout = FARM_TOOL_LAYOUTS.bulletin ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT;

  return (
    <aside className="farm-tool-menu">
      <button
        aria-label="打开叮咚播报"
        className="farm-tool-menu__toggle"
        onClick={onOpenBulletin}
        type="button"
      >
        <img
          alt=""
          aria-hidden="true"
          src={getFarmAssetUrl(FARM_TOOL_EDITOR_BULLETIN_OPTION.iconKey)}
          style={getFarmToolIconStyle(bulletinLayout)}
        />
        <span style={getFarmToolTextStyle(bulletinLayout)}>叮咚播报</span>
      </button>

      {tools.length > 0 ? (
        <nav
          aria-label={`${SCENE_OPTIONS.find((scene) => scene.id === activeScene)?.label}工具`}
          className="farm-tools"
          id="farm-scene-tools"
        >
          {tools.map((tool) => {
            const layout = FARM_TOOL_LAYOUTS[tool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT;

            return (
              <button key={tool.id} onClick={() => onSelect(tool)} type="button">
                <img
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  src={getFarmAssetUrl(tool.iconKey)}
                  style={getFarmToolIconStyle(layout)}
                />
                <span style={getFarmToolTextStyle(layout)}>{tool.label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}
    </aside>
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

function CookingCatalogSprite({
  entityId,
  kind,
  name,
}: {
  entityId: string;
  kind: "ingredient" | "recipe";
  name: string;
}) {
  const asset =
    kind === "ingredient" ? getCookingIngredientAsset(entityId) : getCookingRecipeAsset(entityId);

  return asset ? (
    <span
      aria-label={`${name}${kind === "ingredient" ? "食材" : "料理"}小图`}
      className="cooking-catalog__sprite"
      role="img"
      style={getCookingCatalogSpriteStyle(asset)}
    />
  ) : (
    <span aria-hidden="true" className="cooking-catalog__sprite cooking-catalog__sprite--missing" />
  );
}

function getFarmToolIconStyle(layout: FarmToolEditorLayout): CSSProperties {
  return {
    height: `${(layout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
    left: `${(layout.iconX / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
    top: `${(layout.iconY / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
    width: `${(layout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
  };
}

function getFarmToolTextStyle(layout: FarmToolEditorLayout): CSSProperties {
  return {
    fontSize: `${(layout.textSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 13.7}cqw`,
    left: `${(layout.textX / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
    top: `${(layout.textY / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
  };
}

function clampFarmToolEditorValue(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createDefaultFarmToolEditorLayouts(): FarmToolEditorLayouts {
  return Object.fromEntries(
    FARM_TOOL_EDITOR_OPTIONS.map((tool) => [
      tool.id,
      { ...(FARM_TOOL_LAYOUTS[tool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT) },
    ]),
  );
}

function readFarmToolEditorLayouts(): FarmToolEditorLayouts {
  const defaults = createDefaultFarmToolEditorLayouts();
  if (
    typeof window === "undefined" ||
    !window.location.hash.startsWith(FARM_TOOL_EDITOR_HASH_PREFIX)
  ) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(
      decodeURIComponent(window.location.hash.slice(FARM_TOOL_EDITOR_HASH_PREFIX.length)),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;
    for (const tool of FARM_TOOL_EDITOR_OPTIONS) {
      const candidate = record[tool.id];
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        continue;
      }
      const values = candidate as Record<keyof FarmToolEditorLayout, unknown>;
      const fallback = defaults[tool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT;
      defaults[tool.id] = {
        iconX:
          typeof values.iconX === "number" && Number.isFinite(values.iconX)
            ? clampFarmToolEditorValue(values.iconX, 0, FARM_TOOL_EDITOR_CANVAS_SIZE)
            : fallback.iconX,
        iconY:
          typeof values.iconY === "number" && Number.isFinite(values.iconY)
            ? clampFarmToolEditorValue(values.iconY, 0, FARM_TOOL_EDITOR_CANVAS_SIZE)
            : fallback.iconY,
        iconSize:
          typeof values.iconSize === "number" && Number.isFinite(values.iconSize)
            ? clampFarmToolEditorValue(values.iconSize, 24, 220)
            : fallback.iconSize,
        textX:
          typeof values.textX === "number" && Number.isFinite(values.textX)
            ? clampFarmToolEditorValue(values.textX, 0, FARM_TOOL_EDITOR_CANVAS_SIZE)
            : fallback.textX,
        textY:
          typeof values.textY === "number" && Number.isFinite(values.textY)
            ? clampFarmToolEditorValue(values.textY, 0, FARM_TOOL_EDITOR_CANVAS_SIZE)
            : fallback.textY,
        textSize:
          typeof values.textSize === "number" && Number.isFinite(values.textSize)
            ? clampFarmToolEditorValue(values.textSize, 9.6, 61.44)
            : fallback.textSize,
      };
    }
    return defaults;
  } catch {
    return defaults;
  }
}

function isFarmToolEditorEnabled() {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("editor") === "farm-tools"
  );
}

function FarmToolEditor({ onBack }: Pick<FarmPageProps, "onBack">) {
  const [selectedToolId, setSelectedToolId] = useState(FARM_TOOL_EDITOR_BULLETIN_OPTION.id);
  const [layouts, setLayouts] = useState<FarmToolEditorLayouts>(readFarmToolEditorLayouts);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ layer: FarmToolEditorLayer; pointerId: number } | null>(null);
  const selectedTool =
    FARM_TOOL_EDITOR_OPTIONS.find((tool) => tool.id === selectedToolId) ??
    FARM_TOOL_EDITOR_BULLETIN_OPTION;
  const selectedLayout = layouts[selectedTool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT;

  useEffect(() => {
    const encodedLayouts = encodeURIComponent(JSON.stringify(layouts));
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${FARM_TOOL_EDITOR_HASH_PREFIX}${encodedLayouts}`,
    );
  }, [layouts]);

  const updateSelectedLayout = useCallback(
    (update: Partial<FarmToolEditorLayout>) => {
      setLayouts((current) => ({
        ...current,
        [selectedTool.id]: {
          ...(current[selectedTool.id] ?? DEFAULT_FARM_TOOL_EDITOR_LAYOUT),
          ...update,
        },
      }));
    },
    [selectedTool.id],
  );

  const updateLayerPosition = useCallback(
    (layer: FarmToolEditorLayer, clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      const x = clampFarmToolEditorValue(
        ((clientX - bounds.left) / bounds.width) * FARM_TOOL_EDITOR_CANVAS_SIZE,
        0,
        FARM_TOOL_EDITOR_CANVAS_SIZE,
      );
      const y = clampFarmToolEditorValue(
        ((clientY - bounds.top) / bounds.height) * FARM_TOOL_EDITOR_CANVAS_SIZE,
        0,
        FARM_TOOL_EDITOR_CANVAS_SIZE,
      );
      updateSelectedLayout(layer === "icon" ? { iconX: x, iconY: y } : { textX: x, textY: y });
    },
    [updateSelectedLayout],
  );

  const startLayerDrag = (
    layer: FarmToolEditorLayer,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { layer, pointerId: event.pointerId };
    updateLayerPosition(layer, event.clientX, event.clientY);
  };

  const moveLayer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    updateLayerPosition(drag.layer, event.clientX, event.clientY);
  };

  const stopLayerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <main className="farm-game farm-tool-editor" data-testid="farm-tool-editor">
      <div className="farm-game__shell farm-tool-editor__shell">
        <button
          aria-label="返回铃野地图"
          className="farm-game__round-button farm-tool-editor__back"
          onClick={onBack}
          type="button"
        >
          <BackIcon />
        </button>

        <section className="farm-tool-editor__panel">
          <header>
            <h1>工具图标调位</h1>
            <p>点选工具后，直接拖动图标或文字；大小用下面两条滑杆调整。</p>
          </header>

          <nav aria-label="选择要调整的工具" className="farm-tool-editor__tools">
            {FARM_TOOL_EDITOR_OPTIONS.map((tool) => (
              <button
                aria-pressed={tool.id === selectedTool.id}
                key={tool.id}
                onClick={() => setSelectedToolId(tool.id)}
                type="button"
              >
                {tool.label}
              </button>
            ))}
          </nav>

          <div className="farm-tool-editor__preview-row">
            <div
              className="farm-tool-editor__canvas"
              onPointerCancel={stopLayerDrag}
              onPointerMove={moveLayer}
              onPointerUp={stopLayerDrag}
              ref={canvasRef}
            >
              <button
                aria-label={`拖动${selectedTool.label}图标`}
                className="farm-tool-editor__layer farm-tool-editor__icon"
                onPointerDown={(event) => startLayerDrag("icon", event)}
                style={{
                  height: `${selectedLayout.iconSize}px`,
                  left: `${selectedLayout.iconX}px`,
                  top: `${selectedLayout.iconY}px`,
                  width: `${selectedLayout.iconSize}px`,
                }}
                type="button"
              >
                <img alt="" aria-hidden="true" src={getFarmAssetUrl(selectedTool.iconKey)} />
              </button>
              <button
                aria-label={`拖动${selectedTool.label}文字`}
                className="farm-tool-editor__layer farm-tool-editor__text"
                onPointerDown={(event) => startLayerDrag("text", event)}
                style={{
                  fontSize: `${selectedLayout.textSize}px`,
                  left: `${selectedLayout.textX}px`,
                  top: `${selectedLayout.textY}px`,
                }}
                type="button"
              >
                {selectedTool.label}
              </button>
            </div>

            <aside className="farm-tool-editor__actual-preview">
              <span>实页大小</span>
              <div
                aria-label={`${selectedTool.label}实页比例预览`}
                className="farm-tool-editor__actual-cell"
                role="img"
              >
                <img
                  alt=""
                  aria-hidden="true"
                  src={getFarmAssetUrl(selectedTool.iconKey)}
                  style={{
                    height: `${(selectedLayout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                    left: `${(selectedLayout.iconX / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                    top: `${(selectedLayout.iconY / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                    width: `${(selectedLayout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                  }}
                />
                <strong
                  style={{
                    fontSize: `${(selectedLayout.textSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 13.7}cqw`,
                    left: `${(selectedLayout.textX / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                    top: `${(selectedLayout.textY / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}%`,
                  }}
                >
                  {selectedTool.label}
                </strong>
              </div>
            </aside>
          </div>

          <div className="farm-tool-editor__sliders">
            <label>
              <span>图标大小</span>
              <output>
                {Math.round((selectedLayout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 1000) / 10}%
              </output>
              <input
                max="115"
                min="12.5"
                onInput={(event) =>
                  updateSelectedLayout({
                    iconSize:
                      (Number(event.currentTarget.value) / 100) * FARM_TOOL_EDITOR_CANVAS_SIZE,
                  })
                }
                step="0.5"
                type="range"
                value={(selectedLayout.iconSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}
              />
            </label>
            <label>
              <span>文字大小</span>
              <output>
                {Math.round((selectedLayout.textSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 1000) / 10}%
              </output>
              <input
                max="32"
                min="5"
                onInput={(event) =>
                  updateSelectedLayout({
                    textSize:
                      (Number(event.currentTarget.value) / 100) * FARM_TOOL_EDITOR_CANVAS_SIZE,
                  })
                }
                step="0.5"
                type="range"
                value={(selectedLayout.textSize / FARM_TOOL_EDITOR_CANVAS_SIZE) * 100}
              />
            </label>
          </div>

          <button
            className="farm-tool-editor__reset"
            onClick={() =>
              setLayouts((current) => ({
                ...current,
                [selectedTool.id]: { ...DEFAULT_FARM_TOOL_EDITOR_LAYOUT },
              }))
            }
            type="button"
          >
            重置当前工具
          </button>
        </section>
      </div>
    </main>
  );
}

export function FarmFieldContent({
  data,
  harvestAction = { stage: "idle" },
  onCloseHarvestAction,
  onHarvestAssist,
  onReloadAfterHarvestError,
  onRequireResource,
  onRetryHarvestAssist,
  preview = false,
  resources = createInitialFarmReadResources(),
}: {
  data: BoundFarmField;
  harvestAction?: FarmHarvestActionState;
  onCloseHarvestAction?: () => void;
  onHarvestAssist?: (() => void) | undefined;
  onReloadAfterHarvestError?: () => void;
  onRequireResource?: (resource: keyof FarmReadResources) => void;
  onRetryHarvestAssist?: () => void;
  preview?: boolean;
  resources?: FarmReadResources;
}) {
  const field = data.data;
  const farmCatalog = resources.farmCatalog.stage === "ready" ? resources.farmCatalog.data : null;
  const kitchen = resources.kitchen.stage === "ready" ? resources.kitchen.data : null;
  const ranch = resources.ranch.stage === "ready" ? resources.ranch.data : null;
  const [activeScene, setActiveScene] = useState<FarmSceneId>("field");
  const [visitedScenes, setVisitedScenes] = useState<ReadonlySet<FarmSceneId>>(
    () => new Set<FarmSceneId>(["field"]),
  );
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);
  const [selectedCookingMethodId, setSelectedCookingMethodId] = useState<CookingMethodId>("stew");
  const [selectedCookingIngredientIds, setSelectedCookingIngredientIds] = useState<string[]>([]);
  const [cookingIngredientPickerOpen, setCookingIngredientPickerOpen] = useState(false);
  const [selectedRanchAnimalId, setSelectedRanchAnimalId] = useState<string | null>(null);
  const [sceneUiStates, setSceneUiStates] = useState<FarmSceneUiStateMap>(() =>
    createInitialSceneUiStates(),
  );
  const [shopCarts, setShopCarts] = useState<ShopCartState>(() => createEmptyShopCarts());
  const [originalPlantDraft, setOriginalPlantDraft] = useState<OriginalPlantDraft>(() => ({
    description: "",
    harvestText: "",
    latinName: "",
    name: "",
    sowingText: "",
  }));
  const [settingsDraft, setSettingsDraft] = useState<FarmSettingsDraft>(() => ({
    activeTitle: field.farm.equipped_title?.name ?? "",
    aiNickname: "",
    farmName: field.farm.farm_name,
    humanNickname: "",
    messagesAllowed: null,
    theftAllowed: null,
    visitsAllowed: null,
    wateringHelpAllowed: null,
    welcomeMessage: field.farm.welcome_message ?? "",
  }));
  const settingsInitializedFromCatalog = useRef(false);
  useEffect(() => {
    const settings = farmCatalog?.data.settings;
    if (preview || settingsInitializedFromCatalog.current || settings?.status !== "available") {
      return;
    }
    settingsInitializedFromCatalog.current = true;
    setSettingsDraft({
      activeTitle:
        settings.equipped_title?.identity_state === "known" ? settings.equipped_title.name : "",
      aiNickname: settings.ai_name ?? "",
      farmName: settings.farm_name,
      humanNickname: settings.human_name ?? "",
      messagesAllowed: settings.social.message,
      theftAllowed: settings.social.steal,
      visitsAllowed: settings.social.visit,
      wateringHelpAllowed: settings.social.water,
      welcomeMessage: settings.welcome_message ?? "",
    });
  }, [farmCatalog, preview]);
  const selectedPlot = field.plots.find((plot) => plot.plot_id === selectedPlotId) ?? null;
  const liveRanchResidents = getLiveRanchResidents(ranch);
  const selectedRanchAnimal = preview
    ? (RANCH_SHOP_ANIMALS.find((animal) => animal.id === selectedRanchAnimalId) ?? null)
    : null;
  const selectedLiveRanchResident = preview
    ? null
    : (liveRanchResidents.find((resident) => resident.id === selectedRanchAnimalId) ?? null);
  const activeSceneUiState = sceneUiStates[activeScene];
  const activeResourceKey = activeSceneUiState.bulletinOpen
    ? "farmCatalog"
    : activeSceneUiState.selectedTool
      ? getToolReadResource(activeScene, activeSceneUiState.selectedTool.id)
      : getSceneReadResource(activeScene);
  const activeResourceState = activeResourceKey ? resources[activeResourceKey] : null;
  const ranchSceneAnimals: readonly RanchSceneAnimalDefinition[] = preview
    ? RANCH_SHOP_ANIMALS.filter((animal) => animal.demoOwned).flatMap((animal) => {
        const layout = RANCH_SCENE_DEMO_LAYOUTS[animal.id];
        return layout
          ? [
              {
                id: animal.id,
                layout,
                name: animal.name,
                placementStyle: getRanchAnimalPlacementStyle(animal),
                spriteStyle: getRanchAnimalSpriteStyle(animal),
              },
            ]
          : [];
      })
    : liveRanchResidents.map((resident, index) => ({
        id: resident.id,
        layout: getLiveRanchSceneLayout(index, liveRanchResidents.length),
        name: resident.resident.identity.custom_name ?? resident.resident.identity.name ?? "",
        placementStyle: getRanchAnimalPlacementStyle(resident.spriteAnimal),
        spriteStyle: getRanchAnimalSpriteStyle(resident.spriteAnimal),
      }));
  const visibleCookingMethods = getVisibleCookingMethods(preview, kitchen);
  const selectedCookingMethod =
    visibleCookingMethods.find((method) => method.id === selectedCookingMethodId) ??
    DEFAULT_COOKING_METHOD;
  const selectedCookingLayout =
    COOKING_TOOL_LAYOUTS[getCookingToolLayoutId(selectedCookingMethod.id)];

  const updateSceneUiState = useCallback(
    (sceneId: FarmSceneId, update: Partial<FarmSceneUiState>) => {
      setSceneUiStates((current) => ({
        ...current,
        [sceneId]: { ...current[sceneId], ...update },
      }));
    },
    [],
  );

  const changeShopCartQuantity = useCallback(
    (sceneId: ShopCartSceneId, cartKey: string, delta: number, maxQuantity?: number) => {
      setShopCarts((current) => {
        const currentQuantity = current[sceneId][cartKey] ?? 0;
        const nextQuantity = Math.min(
          maxQuantity ?? Number.POSITIVE_INFINITY,
          Math.max(0, currentQuantity + delta),
        );
        if (nextQuantity === currentQuantity) {
          return current;
        }

        const nextSceneCart: Record<string, number> = { ...current[sceneId] };
        if (nextQuantity === 0) {
          delete nextSceneCart[cartKey];
        } else {
          nextSceneCart[cartKey] = nextQuantity;
        }

        return {
          ...current,
          [sceneId]: nextSceneCart,
        };
      });
    },
    [],
  );

  const changeScene = (sceneId: FarmSceneId) => {
    if (!preview) {
      if (sceneId === "ranch") {
        onRequireResource?.("ranch");
      } else if (sceneId === "cooking") {
        onRequireResource?.("kitchen");
      } else if (sceneId === "neighborhood") {
        onRequireResource?.("farmCatalog");
      }
    }
    setVisitedScenes((current) =>
      current.has(sceneId) ? current : new Set<FarmSceneId>([...current, sceneId]),
    );
    setActiveScene(sceneId);
  };

  return (
    <div className="farm-game__ready">
      {SCENE_OPTIONS.map((scene) =>
        visitedScenes.has(scene.id) ? (
          <div className="farm-scene-state" hidden={scene.id !== activeScene} key={scene.id}>
            <Suspense fallback={null}>
              {scene.id === "field" ? (
                <FieldScene
                  onClosePlot={() => setSelectedPlotId(null)}
                  onSelectPlot={setSelectedPlotId}
                  plots={field.plots}
                  selectedPlot={selectedPlot}
                />
              ) : null}
              {scene.id === "ranch" ? (
                <RanchScene
                  active={activeScene === "ranch"}
                  animals={ranchSceneAnimals}
                  onSelectAnimal={setSelectedRanchAnimalId}
                />
              ) : null}
              {scene.id === "cooking" ? (
                <CookingScene
                  assetUrl={getFarmAssetUrl(selectedCookingMethod.assetKey)}
                  label={selectedCookingMethod.label}
                  toolStyle={{
                    left: `${selectedCookingLayout.x}%`,
                    top: `${selectedCookingLayout.y}%`,
                    width: `${selectedCookingLayout.width}%`,
                  }}
                />
              ) : null}
              {scene.id === "neighborhood" ? (
                <NeighborhoodScene
                  emptyLabels={NEIGHBORHOOD_EMPTY_LABELS}
                  farmCatalog={farmCatalog}
                  options={NEIGHBORHOOD_OPTIONS}
                  preview={preview}
                  shellUrl={getFarmAssetUrl("neighborhood.shell")}
                />
              ) : null}
            </Suspense>
          </div>
        ) : null,
      )}
      {activeScene === "field" ? (
        <FarmIdentityPlaque
          equippedTitle={field.farm.equipped_title?.name ?? null}
          farmDoorplate={field.farm.farm_doorplate}
          farmName={field.farm.farm_name}
          landName={field.land.name}
          landTier={field.land.tier}
          seasonName={field.season.name}
          welcomeMessage={field.farm.welcome_message}
        />
      ) : null}
      {activeScene !== "neighborhood" ? (
        <SceneBalance
          farmCoins={field.balance.farm_coins}
          ranchCoins={
            ranch?.data.balance.status === "available" ? ranch.data.balance.ranch_coins : null
          }
          sceneId={activeScene}
          silver={
            kitchen?.data.balance.silver.status === "available"
              ? kitchen.data.balance.silver.value
              : null
          }
        />
      ) : null}
      {!activeSceneUiState.selectedTool &&
      !activeSceneUiState.bulletinOpen &&
      activeScene === "field" ? (
        <FieldSceneOverlay
          harvestAssist={field.harvest_assist}
          onHarvestAssist={onHarvestAssist}
          submitting={harvestAction.stage === "submitting"}
        />
      ) : null}
      {activeScene === "field" && harvestAction.stage === "success" && onCloseHarvestAction ? (
        <FarmHarvestReceipt onClose={onCloseHarvestAction} result={harvestAction.result} />
      ) : null}
      {activeScene === "field" &&
      harvestAction.stage === "error" &&
      onCloseHarvestAction &&
      onReloadAfterHarvestError &&
      onRetryHarvestAssist ? (
        <FarmHarvestNotice
          action={harvestAction}
          onClose={onCloseHarvestAction}
          onReload={onReloadAfterHarvestError}
          onRetry={onRetryHarvestAssist}
        />
      ) : null}

      <div
        className="farm-page-state-layer"
        hidden={
          activeScene !== "cooking" ||
          Boolean(sceneUiStates.cooking.selectedTool) ||
          sceneUiStates.cooking.bulletinOpen
        }
      >
        <CookingPrepOverlay
          ingredientPickerOpen={cookingIngredientPickerOpen}
          kitchen={kitchen}
          onCloseIngredientPicker={() => setCookingIngredientPickerOpen(false)}
          onOpenIngredientPicker={() => setCookingIngredientPickerOpen(true)}
          onRemoveIngredient={(slotIndex) =>
            setSelectedCookingIngredientIds((current) =>
              current.filter((_, index) => index !== slotIndex),
            )
          }
          onSelectIngredient={(ingredientId) =>
            setSelectedCookingIngredientIds((current) =>
              current.length >= COOKING_PREP_SLOT_IDS.length ? current : [...current, ingredientId],
            )
          }
          onSelectMethod={setSelectedCookingMethodId}
          preview={preview}
          selectedIngredientIds={selectedCookingIngredientIds}
          selectedMethodId={selectedCookingMethodId}
        />
      </div>

      {activeScene === "ranch" && (selectedRanchAnimal || selectedLiveRanchResident) ? (
        <RanchResidentDetail
          view={
            selectedRanchAnimal
              ? { kind: "preview", animal: selectedRanchAnimal }
              : { kind: "live", resident: selectedLiveRanchResident as LiveRanchResidentView }
          }
          onClose={() => setSelectedRanchAnimalId(null)}
        />
      ) : null}

      {SCENE_OPTIONS.map((scene) => {
        const sceneState = sceneUiStates[scene.id];
        return (
          <div
            className="farm-page-state-layer"
            hidden={scene.id !== activeScene}
            key={`farm-page-state-${scene.id}`}
          >
            <Suspense fallback={null}>
              {sceneState.bulletinOpen ? (
                <DingdongBulletin
                  farmCatalog={farmCatalog}
                  onClose={() => updateSceneUiState(scene.id, { bulletinOpen: false })}
                  preview={preview}
                  sceneId={scene.id}
                />
              ) : null}
              {sceneState.selectedTool ? (
                <FarmToolPanel
                  activeScene={scene.id}
                  cart={scene.id === "neighborhood" ? EMPTY_SHOP_CART : shopCarts[scene.id]}
                  farmCatalog={farmCatalog}
                  kitchen={kitchen}
                  key={`${scene.id}-${sceneState.selectedTool.id}`}
                  onClose={() => updateSceneUiState(scene.id, { selectedTool: null })}
                  onChangeCartQuantity={(cartKey, delta, maxQuantity) => {
                    if (scene.id !== "neighborhood") {
                      changeShopCartQuantity(scene.id, cartKey, delta, maxQuantity);
                    }
                  }}
                  onChangeOriginalPlantDraft={setOriginalPlantDraft}
                  onChangeSettingsDraft={setSettingsDraft}
                  originalPlantDraft={originalPlantDraft}
                  preview={preview}
                  ranch={ranch}
                  selectedCookingIngredientIds={selectedCookingIngredientIds}
                  settingsDraft={settingsDraft}
                  tool={sceneState.selectedTool}
                />
              ) : null}
            </Suspense>
          </div>
        );
      })}

      <FarmToolBar
        activeScene={activeScene}
        onOpenBulletin={() => {
          if (activeScene === "cooking") {
            setCookingIngredientPickerOpen(false);
          }
          if (!preview) {
            onRequireResource?.("farmCatalog");
          }
          updateSceneUiState(activeScene, { bulletinOpen: true, selectedTool: null });
        }}
        onSelect={(tool) => {
          if (activeScene === "cooking") {
            setCookingIngredientPickerOpen(false);
          }
          if (!preview) {
            const resource = getToolReadResource(activeScene, tool.id);
            if (resource) onRequireResource?.(resource);
          }
          updateSceneUiState(activeScene, { bulletinOpen: false, selectedTool: tool });
        }}
      />
      <div className="farm-game__bottom">
        {activeResourceKey && activeResourceState?.stage === "error" ? (
          <div className="farm-tool-notice" role="alert">
            <span>{activeResourceState.message}</span>
            <button
              aria-label={`重新读取${FARM_READ_RESOURCE_LABELS[activeResourceKey]}`}
              onClick={() => onRequireResource?.(activeResourceKey)}
              type="button"
            >
              ↻
            </button>
          </div>
        ) : null}
        <SceneTabs activeScene={activeScene} onChange={changeScene} />
      </div>
    </div>
  );
}

function shouldRetryFarmHarvest(issue: FarmHarvestAssistIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

function LiveFarmPage({ onBack, previewData }: FarmPageProps) {
  const [state, setState] = useState<FarmPageState>(
    previewData ? { stage: "ready", data: previewData } : { stage: "loading" },
  );
  const [resources, setResources] = useState<FarmReadResources>(() =>
    createInitialFarmReadResources(),
  );
  const [harvestAction, setHarvestAction] = useState<FarmHarvestActionState>({ stage: "idle" });
  const requestControllerRef = useRef<AbortController | null>(null);
  const resourceControllersRef = useRef<Partial<Record<keyof FarmReadResources, AbortController>>>(
    {},
  );
  const requestedResourcesRef = useRef<Set<keyof FarmReadResources>>(new Set());

  const requireResource = useCallback(
    (resource: keyof FarmReadResources) => {
      if (previewData || requestedResourcesRef.current.has(resource)) {
        return;
      }
      requestedResourcesRef.current.add(resource);
      resourceControllersRef.current[resource]?.abort();
      const controller = new AbortController();
      resourceControllersRef.current[resource] = controller;
      setResources((current) => ({ ...current, [resource]: { stage: "loading" } }));

      if (resource === "ranch") {
        void getBoundRanch({ signal: controller.signal }).then((result) => {
          if (controller.signal.aborted) return;
          if (!result.ok) requestedResourcesRef.current.delete(resource);
          setResources((current) => ({
            ...current,
            ranch: result.ok
              ? { stage: "ready", data: result.data }
              : { stage: "error", message: ranchIssueMessage(result.issue) },
          }));
        });
        return;
      }

      if (resource === "kitchen") {
        void getBoundKitchen({ signal: controller.signal }).then((result) => {
          if (controller.signal.aborted) return;
          if (!result.ok) requestedResourcesRef.current.delete(resource);
          setResources((current) => ({
            ...current,
            kitchen: result.ok
              ? { stage: "ready", data: result.data }
              : { stage: "error", message: kitchenIssueMessage(result.issue) },
          }));
        });
        return;
      }

      void getBoundFarmCatalog({ signal: controller.signal }).then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) requestedResourcesRef.current.delete(resource);
        setResources((current) => ({
          ...current,
          farmCatalog: result.ok
            ? { stage: "ready", data: result.data }
            : { stage: "error", message: farmCatalogIssueMessage(result.issue) },
        }));
      });
    },
    [previewData],
  );

  const reload = useCallback(() => {
    setHarvestAction({ stage: "idle" });
    if (previewData) {
      setState({ stage: "ready", data: previewData });
      return;
    }
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setState({ stage: "loading" });
    void getBoundFarmField({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      setState(
        result.ok ? { stage: "ready", data: result.data } : { stage: "error", issue: result.issue },
      );
    });
  }, [previewData]);

  const submitHarvestAssist = useCallback(
    async (retryAttempt?: FarmHarvestAttempt) => {
      if (previewData || state.stage !== "ready") {
        return;
      }
      const attempt =
        retryAttempt ??
        ({
          expectedRevision: state.data.revision,
          idempotencyKey: crypto.randomUUID(),
        } satisfies FarmHarvestAttempt);
      setHarvestAction({ stage: "submitting", attempt });
      const result = await harvestBoundFarmField(attempt);
      if (result.ok) {
        setState({
          stage: "ready",
          data: {
            data: result.data.data.resource,
            revision: result.data.revision,
            server_time: result.data.server_time,
          },
        });
        setHarvestAction({ stage: "success", result: result.data.data.result });
        return;
      }
      setHarvestAction({
        stage: "error",
        attempt: shouldRetryFarmHarvest(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [previewData, state],
  );

  useEffect(() => {
    if (previewData) {
      return;
    }
    reload();
    return () => {
      requestControllerRef.current?.abort();
      for (const controller of Object.values(resourceControllersRef.current)) {
        controller?.abort();
      }
    };
  }, [previewData, reload]);

  return (
    <main className="farm-game" data-testid="farm-page">
      <div className="farm-game__shell">
        <div className="farm-game__controls">
          <button
            aria-label="返回铃野地图"
            className="farm-game__round-button"
            onClick={onBack}
            type="button"
          >
            <BackIcon />
          </button>
          <button
            aria-label="重新读取农场数据"
            className="farm-game__round-button"
            disabled={state.stage === "loading"}
            onClick={reload}
            type="button"
          >
            <RefreshIcon />
          </button>
        </div>

        {state.stage === "loading" ? (
          <section className="farm-game__state" role="status">
            <span className="farm-game__loader" aria-hidden="true" />
            <h1>正在打开农场</h1>
            <p>正在读取当前账号绑定的农场。</p>
          </section>
        ) : null}

        {state.stage === "error" ? (
          <section className="farm-game__state farm-game__state--error" role="alert">
            <span aria-hidden="true" className="farm-game__wilted">
              ⌁
            </span>
            <h1>农场暂时没有打开</h1>
            <p>{farmFieldIssueMessage(state.issue)}</p>
            <button onClick={reload} type="button">
              重新读取
            </button>
          </section>
        ) : null}

        {state.stage === "ready" ? (
          <FarmFieldContent
            data={state.data}
            harvestAction={harvestAction}
            onCloseHarvestAction={() => setHarvestAction({ stage: "idle" })}
            onHarvestAssist={previewData ? undefined : () => void submitHarvestAssist()}
            onReloadAfterHarvestError={reload}
            onRequireResource={requireResource}
            onRetryHarvestAssist={() => {
              if (harvestAction.stage === "error" && harvestAction.attempt) {
                void submitHarvestAssist(harvestAction.attempt);
              }
            }}
            preview={Boolean(previewData)}
            resources={resources}
          />
        ) : null}
      </div>
    </main>
  );
}

export function FarmPage(props: FarmPageProps) {
  return isFarmToolEditorEnabled() ? (
    <FarmToolEditor onBack={props.onBack} />
  ) : (
    <LiveFarmPage {...props} />
  );
}
