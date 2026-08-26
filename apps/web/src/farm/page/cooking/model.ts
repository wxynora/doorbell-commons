import type { BoundKitchenRead } from "../../../auth/kitchen-client";
import type { FarmAssetKey } from "../../farm-asset-manifest";
import { getCookingIngredientAsset } from "../../farm-asset-manifest";
import {
  COOKING_CATALOG_RECIPES,
  COOKING_INGREDIENT_CATEGORIES,
  type CookingIngredientCategoryId,
} from "../../farm-cooking-catalog";

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

export interface CookingToolLayout {
  x: number;
  y: number;
  width: number;
}

export type CookingToolLayouts = Record<CookingMethodId, CookingToolLayout>;

export const COOKING_RESULT_STYLE_PREVIEW =
  COOKING_CATALOG_RECIPES.find((recipe) => recipe.id === "tomato_beef_stew") ??
  COOKING_CATALOG_RECIPES[0];
export const PAID_COOKING_TOOL_IDS = ["roast", "steam", "deep-fry"] as const;
const COOKING_PREVIEW_OWNED_PAID_TOOL_IDS = new Set<CookingMethodId>(["roast"]);
export const COOKING_PREP_SLOT_IDS = [
  "ingredient-slot-1",
  "ingredient-slot-2",
  "ingredient-slot-3",
  "ingredient-slot-4",
  "ingredient-slot-5",
] as const;
export type CookingPrepCategoryId = CookingIngredientCategoryId | "ranch-products" | "fish";
export const COOKING_PREP_CATEGORIES: readonly {
  id: CookingPrepCategoryId;
  label: string;
}[] = [
  ...COOKING_INGREDIENT_CATEGORIES.map(({ id, label }) => ({ id, label })),
  { id: "ranch-products", label: "牧场" },
  { id: "fish", label: "鱼获" },
];
export const COOKING_SHOP_INGREDIENT_CATEGORY_BY_ID = new Map<string, CookingIngredientCategoryId>(
  COOKING_INGREDIENT_CATEGORIES.flatMap((category) =>
    category.ingredientIds.map((ingredientId) => [ingredientId, category.id] as const),
  ),
);

export const DEFAULT_COOKING_METHOD: CookingMethod = {
  id: "stew",
  label: "炖",
  assetKey: "kitchen.method.stew",
};

export const COOKING_METHODS: readonly CookingMethod[] = [
  { id: "roast", label: "烤", assetKey: "kitchen.method.roast" },
  DEFAULT_COOKING_METHOD,
  { id: "stir-fry", label: "炒", assetKey: "kitchen.method.wok" },
  { id: "pan-fry", label: "煎", assetKey: "kitchen.method.wok" },
  { id: "deep-fry", label: "油炸", assetKey: "kitchen.method.deep-fry" },
  { id: "steam", label: "蒸", assetKey: "kitchen.method.steam" },
  { id: "dessert", label: "甜品", assetKey: "kitchen.method.dessert" },
  { id: "drink", label: "饮品", assetKey: "kitchen.method.drink" },
];

export function getVisibleCookingMethods(
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

export const COOKING_TOOL_LAYOUTS: Readonly<CookingToolLayouts> = {
  roast: { x: 49.39713550883651, y: 66.69322842368047, width: 64.5 },
  stew: { x: 49.229278975741245, y: 67.18072408991446, width: 45.5 },
  "stir-fry": { x: 48.85234164420485, y: 68.54087925203899, width: 46.5 },
  "pan-fry": { x: 48.85234164420485, y: 68.54087925203899, width: 46.5 },
  "deep-fry": { x: 50.44958726415094, y: 66.1706783369803, width: 50 },
  steam: { x: 48.95447270889488, y: 67.35378953650289, width: 63.5 },
  dessert: { x: 50.42642351752021, y: 66.61279092898349, width: 52 },
  drink: { x: 51.07922001347709, y: 68.60751939526557, width: 51 },
};

export function getCookingToolLayoutId(methodId: CookingMethodId): CookingMethodId {
  return methodId === "pan-fry" ? "stir-fry" : methodId;
}

export interface CookingIngredientPickerOption {
  categoryId: CookingPrepCategoryId;
  entityId: string;
  name: string;
  quantity: number | null;
  selectionIds: readonly string[];
}

export function getLiveCookingIngredientOptions(
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

export function toRawKitchenCookItemRef(selectionId: string): string {
  if (selectionId.startsWith("product:") || selectionId.startsWith("fish:")) {
    return selectionId.slice(selectionId.indexOf(":") + 1);
  }
  return selectionId;
}
