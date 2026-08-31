import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import type { BoundKitchenRead } from "../../../auth/kitchen-client";
import type { BoundRanchRead } from "../../../auth/ranch-client";
import {
  type FarmAssetKey,
  getCookingIngredientAsset,
  getCookingRecipeAsset,
} from "../../farm-asset-manifest";
import {
  COOKING_CATALOG_INGREDIENTS,
  COOKING_CATALOG_RECIPES,
  COOKING_RECIPE_PRICES,
  type CookingCatalogRecipe,
} from "../../farm-cooking-catalog";
import {
  RANCH_LIMITED_SKINS,
  RANCH_SHOP_ANIMALS,
  type RanchShopAnimal,
  type RanchSkinDefinition,
} from "../ranch-animal-data";

export type FarmFieldShopSectionId = "seeds-and-potions" | "today";
export type CookingShopSectionId = "ingredients" | "recipes" | "tools";
export type CookingMethodId =
  | "roast"
  | "stew"
  | "stir-fry"
  | "pan-fry"
  | "deep-fry"
  | "steam"
  | "dessert"
  | "drink";

export interface CookingMethod {
  id: CookingMethodId;
  label: string;
  assetKey: FarmAssetKey;
}

export interface FarmShopPreviewItem {
  id: string;
  kind: "seed" | "potion" | "potion_set" | "recipe";
  iconKey?: FarmAssetKey | undefined;
  name: string;
  note: string;
  price?: number;
  availableQuantity?: number | null | undefined;
}

export type ShopCartSceneId = "field" | "ranch" | "cooking";
export type ShopCartQuantities = Readonly<Record<string, number>>;
export type ShopCartState = Readonly<Record<ShopCartSceneId, ShopCartQuantities>>;

export interface CookingCartCheckoutLine {
  kind: "ingredient" | "recipe" | "tool";
  itemId: string;
  quantity: number;
}

export interface FarmCartCheckoutLine {
  kind: "seed" | "potion" | "potion_set" | "recipe" | "animal" | "pet" | "item";
  itemId: string;
  quantity: number;
}

export type FarmCartCheckoutFeedback =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "error"; message: string; retryable: boolean }
  | { stage: "success" };

export type FarmShopOpenFeedback =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "error"; message: string }
  | { stage: "success" };

export type CookingCartCheckoutFeedback =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "error"; message: string; retryable: boolean }
  | { stage: "success"; itemCount: number; totalPriceSilver: number };

export type CookingShopRefreshFeedback =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "error"; message: string; retryable: boolean }
  | { stage: "success" };

export type CookingShopOpenFeedback =
  | { stage: "idle" }
  | { stage: "submitting" }
  | { stage: "error"; message: string }
  | { stage: "success" };

export type ShopCartVisual =
  | {
      kind: "farm";
      entityId: string;
      catalogKind: "seed" | "potion" | "potion_set" | "recipe";
      iconKey?: FarmAssetKey | undefined;
    }
  | {
      kind: "ranch";
      animalId: string;
      catalogKind: "animal" | "pet" | "item";
      skinId?: string | undefined;
    }
  | {
      kind: "cooking";
      entityId: string;
      catalogKind: "ingredient" | "recipe" | "tool";
    };

export interface ShopCartItemDefinition {
  cartKey: string;
  name: string;
  price: number;
  currency: "gold" | "silver";
  maxQuantity?: number | undefined;
  visual: ShopCartVisual;
}

export interface FarmShopPanelProps {
  activeScene: ShopCartSceneId;
  cart: Readonly<Record<string, number>>;
  cookingCheckoutFeedback?: CookingCartCheckoutFeedback | undefined;
  cookingShopRefreshFeedback?: CookingShopRefreshFeedback | undefined;
  cookingShopOpenFeedback?: CookingShopOpenFeedback | undefined;
  farmCheckoutFeedback?: FarmCartCheckoutFeedback | undefined;
  farmShopOpenFeedback?: FarmShopOpenFeedback | undefined;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  onCheckoutCookingCart?: ((items: CookingCartCheckoutLine[]) => void) | undefined;
  onCheckoutFarmCart?: ((items: FarmCartCheckoutLine[]) => void) | undefined;
  onRetryFarmCheckout?: (() => void) | undefined;
  onRetryFarmShopOpen?: (() => void) | undefined;
  onRetryCookingCheckout?: (() => void) | undefined;
  onRetryCookingShopOpen?: (() => void) | undefined;
  onRefreshCookingShop?: (() => void) | undefined;
  preview: boolean;
  farmCatalog?: BoundFarmCatalogRead | null | undefined;
  ranch?: BoundRanchRead | null | undefined;
  kitchen?: BoundKitchenRead | null | undefined;
}

export interface FarmShopLiveResources {
  farmCatalog?: BoundFarmCatalogRead | null | undefined;
  ranch?: BoundRanchRead | null | undefined;
  kitchen?: BoundKitchenRead | null | undefined;
}

export type LiveFarmShopItem = FarmShopPreviewItem & {
  kind: "seed" | "potion" | "potion_set" | "recipe";
  source: "permanent" | "persisted";
};

export type LiveRanchShopItem = {
  id: string;
  name: string;
  section: "animals" | "pets";
  price: number;
  owned: boolean | null;
  availableQuantity: number | null;
  animal: RanchShopAnimal;
  skin?: RanchSkinDefinition | undefined;
};

export type LiveCookingIngredient = {
  id: string;
  name: string;
  price: number;
  maxQuantity?: number | undefined;
};

export type LiveCookingRecipe = {
  id: string;
  name: string;
  rarity: string | null;
  price: number;
};

export type LiveCookingTool = {
  id: string;
  name: string;
  price: number;
  owned: boolean | null;
};

export const FARM_FIELD_SHOP_SECTIONS: readonly {
  id: FarmFieldShopSectionId;
  label: string;
}[] = [
  { id: "seeds-and-potions", label: "种子与药水" },
  { id: "today", label: "今日商店" },
];

export const FARM_FIELD_SHOP_PREVIEW_ITEMS: Readonly<
  Record<FarmFieldShopSectionId, readonly FarmShopPreviewItem[]>
> = {
  "seeds-and-potions": [
    {
      id: "common-seed-preview",
      kind: "seed",
      iconKey: "field.crop.ordinary-growing",
      name: "普通种子",
      note: "常备",
      price: 8,
    },
    {
      id: "fantasy-seed-preview",
      kind: "seed",
      iconKey: "field.crop.fantasy-growing",
      name: "奇幻种子",
      note: "常备",
      price: 40,
    },
    {
      id: "speed-potion-preview",
      kind: "potion",
      iconKey: "field.shop.speed-potion",
      name: "加速药水",
      note: "每日最多 6 瓶",
      price: 50,
    },
  ],
  today: [
    {
      id: "limited-seed-preview",
      kind: "seed",
      iconKey: "field.crop.limited-growing",
      name: "限定种子",
      note: "随机出现 · 实际价格随商品",
    },
    {
      id: "potion-set-preview",
      kind: "potion_set",
      iconKey: "field.shop.potion-set",
      name: "药水套装",
      note: "6 瓶 · 随机出现",
      price: 250,
    },
    {
      id: "hidden-recipe-preview",
      kind: "recipe",
      iconKey: "field.shop.seed-recipe",
      name: "隐藏配方",
      note: "随机出现",
      price: 500,
    },
  ],
};

export const COOKING_SHOP_DAILY_RECIPE_COUNT = 2;
export const COOKING_SHOP_PREVIEW_RECIPE_IDS = ["fried_egg", "strawberry_milk"] as const;
export const PAID_COOKING_TOOL_IDS = ["roast", "steam", "deep-fry"] as const;
export const COOKING_PAID_TOOL_PRICES: Readonly<
  Record<(typeof PAID_COOKING_TOOL_IDS)[number], number>
> = {
  roast: 800,
  steam: 1_200,
  "deep-fry": 1_600,
};
export const COOKING_PREVIEW_OWNED_PAID_TOOL_IDS = new Set<CookingMethodId>(["roast"]);
export const COOKING_METHODS: readonly CookingMethod[] = [
  { id: "roast", label: "烤", assetKey: "kitchen.method.roast" },
  { id: "stew", label: "炖", assetKey: "kitchen.method.stew" },
  { id: "stir-fry", label: "炒", assetKey: "kitchen.method.wok" },
  { id: "pan-fry", label: "煎", assetKey: "kitchen.method.wok" },
  { id: "deep-fry", label: "油炸", assetKey: "kitchen.method.deep-fry" },
  { id: "steam", label: "蒸", assetKey: "kitchen.method.steam" },
  { id: "dessert", label: "甜品", assetKey: "kitchen.method.dessert" },
  { id: "drink", label: "饮品", assetKey: "kitchen.method.drink" },
];

const COOKING_TOOL_ASSET_KEYS: Readonly<
  Record<(typeof PAID_COOKING_TOOL_IDS)[number], FarmAssetKey>
> = {
  roast: "kitchen.method.roast",
  steam: "kitchen.method.steam",
  "deep-fry": "kitchen.method.deep-fry",
};

export function getCookingToolAssetKey(toolId: string): FarmAssetKey | undefined {
  return COOKING_TOOL_ASSET_KEYS[toolId as keyof typeof COOKING_TOOL_ASSET_KEYS];
}

function getFarmShopIconKey(
  kind: LiveFarmShopItem["kind"],
  itemId: string,
): FarmAssetKey | undefined {
  if (kind === "potion" && itemId === "speed_potion") {
    return "field.shop.speed-potion";
  }
  if (kind === "potion_set" && itemId === "potion_set") {
    return "field.shop.potion-set";
  }
  if (kind === "recipe") {
    return "field.shop.seed-recipe";
  }
  if (kind !== "seed") {
    return undefined;
  }
  if (itemId === "common") {
    return "field.crop.ordinary-growing";
  }
  if (itemId === "fantasy") {
    return "field.crop.fantasy-growing";
  }
  if (itemId === "limited") {
    return "field.crop.limited-growing";
  }
  return undefined;
}

export function getLiveFarmShopItems(
  resource: BoundFarmCatalogRead | null | undefined,
): readonly LiveFarmShopItem[] {
  if (resource?.data.shop.status !== "available") {
    return [];
  }

  return resource.data.shop.items.flatMap((item) => {
    if (
      item.identity_state !== "known" ||
      item.name === null ||
      item.price === null ||
      item.currency !== "gold"
    ) {
      return [];
    }
    const availableQuantity = item.available_quantity;
    return [
      {
        id: item.item_id,
        kind: item.kind,
        source: item.source,
        iconKey: getFarmShopIconKey(item.kind, item.item_id),
        name: item.name,
        note:
          item.condition === "already_owned"
            ? "已拥有"
            : availableQuantity === null
              ? "常备"
              : `剩余 ${availableQuantity}`,
        price: item.price,
        availableQuantity,
      },
    ];
  });
}

export function getLiveRanchShopItems(
  resource: BoundRanchRead | null | undefined,
): readonly LiveRanchShopItem[] {
  if (!resource) {
    return [];
  }

  const sections: readonly ["animals" | "pets", typeof resource.data.shop.animals][] = [
    ["animals", resource.data.shop.animals],
    ["pets", resource.data.shop.pets],
  ];
  const residents = sections.flatMap(([section, shop]) => {
    if (shop.status !== "available") {
      return [];
    }
    return shop.items.flatMap((item) => {
      if (
        item.status !== "known" ||
        item.kind_id === null ||
        item.name === null ||
        item.price === null
      ) {
        return [];
      }
      const animal = RANCH_SHOP_ANIMALS.find((candidate) => candidate.id === item.kind_id);
      return animal
        ? [
            {
              id: item.kind_id,
              name: item.name,
              section,
              price: item.price,
              owned: item.owned,
              availableQuantity: item.available_quantity,
              animal,
            },
          ]
        : [];
    });
  });
  if (resource.data.shop.skins.status !== "available") {
    return residents;
  }
  const skins = resource.data.shop.skins.items.flatMap((item) => {
    if (
      item.status !== "known" ||
      item.skin_id === null ||
      item.name === null ||
      item.target_type === null ||
      item.target_kind_id === null ||
      item.price === null
    ) {
      return [];
    }
    const skin = RANCH_LIMITED_SKINS.find((candidate) => candidate.id === item.skin_id);
    const animal = RANCH_SHOP_ANIMALS.find((candidate) => candidate.id === item.target_kind_id);
    return skin && animal
      ? [
          {
            id: item.skin_id,
            name: item.name,
            section: item.target_type === "animal" ? ("animals" as const) : ("pets" as const),
            price: item.price,
            owned: item.owned,
            availableQuantity: item.available_quantity,
            animal,
            skin,
          },
        ]
      : [];
  });
  return [...residents, ...skins];
}

export function getLiveCookingIngredients(
  resource: BoundKitchenRead | null | undefined,
): readonly LiveCookingIngredient[] {
  if (
    resource?.data.daily_shop.status !== "available" ||
    resource.data.daily_shop.is_current_day !== true
  ) {
    return [];
  }
  return resource.data.daily_shop.ingredients.flatMap((item) => {
    if (item.status !== "available" || item.name === null || item.price_silver === null) {
      return [];
    }
    if (!getCookingIngredientAsset(item.ingredient_id)) {
      return [];
    }
    const remaining =
      item.daily_buy_limit === null || item.bought_quantity === null
        ? undefined
        : Math.max(0, item.daily_buy_limit - item.bought_quantity);
    return remaining === undefined
      ? [{ id: item.ingredient_id, name: item.name, price: item.price_silver }]
      : [
          {
            id: item.ingredient_id,
            name: item.name,
            price: item.price_silver,
            maxQuantity: remaining,
          },
        ];
  });
}

export function getLiveCookingRecipes(
  resource: BoundKitchenRead | null | undefined,
): readonly LiveCookingRecipe[] {
  if (
    resource?.data.daily_shop.status !== "available" ||
    resource.data.daily_shop.is_current_day !== true
  ) {
    return [];
  }
  return resource.data.daily_shop.recipes
    .flatMap((item) => {
      if (item.status !== "available" || item.name === null || item.price_silver === null) {
        return [];
      }
      if (!getCookingRecipeAsset(item.recipe_id)) {
        return [];
      }
      return [
        {
          id: item.recipe_id,
          name: item.name,
          rarity: item.rarity,
          price: item.price_silver,
        },
      ];
    })
    .slice(0, COOKING_SHOP_DAILY_RECIPE_COUNT);
}

export function getLiveCookingTools(
  resource: BoundKitchenRead | null | undefined,
): readonly LiveCookingTool[] {
  if (resource?.data.tools.status !== "available") {
    return [];
  }
  return resource.data.tools.items.flatMap((item) => {
    if (item.status !== "available" || item.name === null || item.price_silver === null) {
      return [];
    }
    return [
      {
        id: item.tool_id,
        name: item.name,
        price: item.price_silver,
        owned: item.owned,
      },
    ];
  });
}

export const EMPTY_SHOP_CART: ShopCartQuantities = {};

export function createEmptyShopCarts(): ShopCartState {
  return {
    field: {},
    ranch: {},
    cooking: {},
  };
}

export function getShopCartKey(
  kind: "farm" | "ranch" | "ingredient" | "recipe" | "tool",
  itemId: string,
) {
  return `${kind}:${itemId}`;
}

export function getShopCartItemDefinition(
  sceneId: ShopCartSceneId,
  cartKey: string,
  liveResources?: FarmShopLiveResources,
): ShopCartItemDefinition | null {
  const separatorIndex = cartKey.indexOf(":");
  const kind = separatorIndex >= 0 ? cartKey.slice(0, separatorIndex) : "";
  const itemId = separatorIndex >= 0 ? cartKey.slice(separatorIndex + 1) : "";

  if (sceneId === "field" && kind === "farm") {
    const item = liveResources
      ? getLiveFarmShopItems(liveResources.farmCatalog).find((candidate) => candidate.id === itemId)
      : Object.values(FARM_FIELD_SHOP_PREVIEW_ITEMS)
          .flat()
          .find((candidate) => candidate.id === itemId);
    if (!item || item.price === undefined || item.note === "已拥有") {
      return null;
    }
    return {
      cartKey,
      name: item.name,
      price: item.price,
      currency: "gold",
      visual: {
        kind: "farm",
        catalogKind: item.kind,
        entityId: item.id,
        iconKey: item.iconKey,
      },
    };
  }

  if (sceneId === "ranch" && kind === "ranch") {
    const liveAnimal = liveResources
      ? getLiveRanchShopItems(liveResources.ranch).find((candidate) => candidate.id === itemId)
      : undefined;
    const animal = liveResources
      ? liveAnimal?.animal
      : RANCH_SHOP_ANIMALS.find((candidate) => candidate.id === itemId);
    if (
      !animal ||
      (liveResources
        ? liveAnimal?.owned !== false ||
          liveAnimal.availableQuantity === null ||
          liveAnimal.availableQuantity <= 0
        : animal.demoOwned)
    ) {
      return null;
    }
    return {
      cartKey,
      name: liveAnimal?.name ?? animal.name,
      price: liveAnimal?.price ?? animal.buyCost,
      currency: "gold",
      maxQuantity: 1,
      visual: {
        kind: "ranch",
        animalId: liveAnimal?.skin?.id ?? animal.id,
        catalogKind: liveAnimal?.skin
          ? "item"
          : (liveAnimal?.section ?? animal.shopSection) === "animals"
            ? "animal"
            : "pet",
        skinId: liveAnimal?.skin?.id,
      },
    };
  }

  if (sceneId === "cooking" && kind === "ingredient") {
    const liveIngredient = liveResources
      ? getLiveCookingIngredients(liveResources.kitchen).find(
          (candidate) => candidate.id === itemId,
        )
      : undefined;
    const ingredient = liveResources
      ? liveIngredient
      : COOKING_CATALOG_INGREDIENTS.find((candidate) => candidate.id === itemId);
    return ingredient
      ? {
          cartKey,
          name: ingredient.name,
          price: ingredient.price,
          currency: "silver",
          maxQuantity: liveIngredient?.maxQuantity,
          visual: { kind: "cooking", entityId: ingredient.id, catalogKind: "ingredient" },
        }
      : null;
  }

  if (sceneId === "cooking" && kind === "tool") {
    const liveTool = liveResources
      ? getLiveCookingTools(liveResources.kitchen).find((candidate) => candidate.id === itemId)
      : undefined;
    const previewToolId = liveResources
      ? undefined
      : PAID_COOKING_TOOL_IDS.find((candidate) => candidate === itemId);
    const previewTool = previewToolId
      ? COOKING_METHODS.find((candidate) => candidate.id === previewToolId)
      : undefined;
    if (liveResources ? liveTool?.owned !== false : previewTool === undefined) {
      return null;
    }
    const price =
      liveTool?.price ?? (previewToolId ? COOKING_PAID_TOOL_PRICES[previewToolId] : undefined);
    if (price === undefined) {
      return null;
    }
    return {
      cartKey,
      name: liveTool?.name ?? previewTool?.label ?? itemId,
      price,
      currency: "silver",
      maxQuantity: 1,
      visual: { kind: "cooking", entityId: itemId, catalogKind: "tool" },
    };
  }

  if (sceneId === "cooking" && kind === "recipe") {
    const liveRecipe = liveResources
      ? getLiveCookingRecipes(liveResources.kitchen).find((candidate) => candidate.id === itemId)
      : undefined;
    const recipe = liveResources
      ? liveRecipe
      : COOKING_CATALOG_RECIPES.find((candidate) => candidate.id === itemId);
    return recipe
      ? {
          cartKey,
          name: recipe.name,
          price:
            liveRecipe?.price ??
            COOKING_RECIPE_PRICES[recipe.rarity as CookingCatalogRecipe["rarity"]],
          currency: "silver",
          maxQuantity: 1,
          visual: { kind: "cooking", entityId: recipe.id, catalogKind: "recipe" },
        }
      : null;
  }

  return null;
}
