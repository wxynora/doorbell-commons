import { type CSSProperties, useState } from "react";
import type { BoundFarmCatalogRead } from "../../auth/farm-catalog-client";
import type { BoundKitchenRead } from "../../auth/kitchen-client";
import type { BoundRanchRead } from "../../auth/ranch-client";
import {
  type FarmAssetKey,
  type FarmAssetManifestEntry,
  getCookingIngredientAsset,
  getCookingRecipeAsset,
  getFarmAssetUrl,
} from "../farm-asset-manifest";
import {
  COOKING_CATALOG_INGREDIENTS,
  COOKING_CATALOG_RECIPES,
  COOKING_INGREDIENT_CATEGORIES,
  COOKING_INGREDIENT_NAME_BY_ID,
  COOKING_RECIPE_PRICES,
  type CookingCatalogRecipe,
  type CookingIngredientCategoryId,
} from "../farm-cooking-catalog";
import {
  getRanchAnimalPlacementStyle,
  getRanchAnimalSpriteStyle,
  RANCH_SHOP_ANIMALS,
  type RanchShopAnimal,
} from "./ranch-animal-data";
import "./shop-panel.css";

type FarmFieldShopSectionId = "seeds-and-potions" | "today";
type CookingShopSectionId = "ingredients" | "recipes" | "tools";
type CookingMethodId =
  | "roast"
  | "stew"
  | "stir-fry"
  | "pan-fry"
  | "deep-fry"
  | "steam"
  | "dessert"
  | "drink";

interface CookingMethod {
  id: CookingMethodId;
  label: string;
  assetKey: FarmAssetKey;
}

interface FarmShopPreviewItem {
  id: string;
  iconKey?: FarmAssetKey | undefined;
  name: string;
  note: string;
  price?: number;
  availableQuantity?: number | null | undefined;
}

export type ShopCartSceneId = "field" | "ranch" | "cooking";
export type ShopCartQuantities = Readonly<Record<string, number>>;
export type ShopCartState = Readonly<Record<ShopCartSceneId, ShopCartQuantities>>;

type ShopCartVisual =
  | { kind: "farm"; iconKey?: FarmAssetKey | undefined }
  | { kind: "ranch"; animalId: string }
  | { kind: "cooking"; entityId: string; catalogKind: "ingredient" | "recipe" };

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
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
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

type LiveFarmShopItem = FarmShopPreviewItem & {
  kind: "seed" | "potion" | "potion_set" | "recipe";
  source: "permanent" | "persisted";
};

type LiveRanchShopItem = {
  id: string;
  name: string;
  section: "animals" | "pets";
  price: number;
  owned: boolean | null;
  availableQuantity: number | null;
  animal: RanchShopAnimal;
};

type LiveCookingIngredient = {
  id: string;
  name: string;
  price: number;
  maxQuantity?: number | undefined;
};

type LiveCookingRecipe = {
  id: string;
  name: string;
  rarity: string | null;
  ingredientNames: readonly string[];
  price: number;
};

const FARM_FIELD_SHOP_SECTIONS: readonly {
  id: FarmFieldShopSectionId;
  label: string;
}[] = [
  { id: "seeds-and-potions", label: "种子与药水" },
  { id: "today", label: "今日商店" },
];

const FARM_FIELD_SHOP_PREVIEW_ITEMS: Readonly<
  Record<FarmFieldShopSectionId, readonly FarmShopPreviewItem[]>
> = {
  "seeds-and-potions": [
    {
      id: "common-seed-preview",
      iconKey: "field.crop.ordinary-growing",
      name: "普通种子",
      note: "常备",
      price: 8,
    },
    {
      id: "fantasy-seed-preview",
      iconKey: "field.crop.fantasy-growing",
      name: "奇幻种子",
      note: "常备",
      price: 40,
    },
    {
      id: "speed-potion-preview",
      iconKey: "field.shop.speed-potion",
      name: "加速药水",
      note: "每日最多 6 瓶",
      price: 50,
    },
  ],
  today: [
    {
      id: "limited-seed-preview",
      iconKey: "field.crop.limited-growing",
      name: "限定种子",
      note: "随机出现 · 实际价格随商品",
    },
    {
      id: "potion-set-preview",
      iconKey: "field.shop.potion-set",
      name: "药水套装",
      note: "6 瓶 · 随机出现",
      price: 250,
    },
    {
      id: "hidden-recipe-preview",
      iconKey: "field.shop.seed-recipe",
      name: "隐藏配方",
      note: "随机出现",
      price: 500,
    },
  ],
};

const COOKING_SHOP_DAILY_RECIPE_COUNT = 2;
const COOKING_SHOP_PREVIEW_RECIPE_IDS = ["fried_egg", "strawberry_milk"] as const;
const PAID_COOKING_TOOL_IDS = ["roast", "steam", "deep-fry"] as const;
const COOKING_PAID_TOOL_PRICES: Readonly<Record<(typeof PAID_COOKING_TOOL_IDS)[number], number>> = {
  roast: 800,
  steam: 1_200,
  "deep-fry": 1_600,
};
const COOKING_PREVIEW_OWNED_PAID_TOOL_IDS = new Set<CookingMethodId>(["roast"]);
const COOKING_METHODS: readonly CookingMethod[] = [
  { id: "roast", label: "烤", assetKey: "kitchen.method.roast" },
  { id: "stew", label: "炖", assetKey: "kitchen.method.stew" },
  { id: "stir-fry", label: "炒", assetKey: "kitchen.method.wok" },
  { id: "pan-fry", label: "煎", assetKey: "kitchen.method.wok" },
  { id: "deep-fry", label: "油炸", assetKey: "kitchen.method.deep-fry" },
  { id: "steam", label: "蒸", assetKey: "kitchen.method.steam" },
  { id: "dessert", label: "甜品", assetKey: "kitchen.method.dessert" },
  { id: "drink", label: "饮品", assetKey: "kitchen.method.drink" },
];

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
  return sections.flatMap(([section, shop]) => {
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
          ingredientNames: item.ingredients.flatMap((ingredient) =>
            ingredient.status === "available" &&
            ingredient.name !== null &&
            ingredient.quantity !== null
              ? [`${ingredient.name} ×${ingredient.quantity}`]
              : [],
          ),
          price: item.price_silver,
        },
      ];
    })
    .slice(0, COOKING_SHOP_DAILY_RECIPE_COUNT);
}

export const EMPTY_SHOP_CART: ShopCartQuantities = {};

export function createEmptyShopCarts(): ShopCartState {
  return {
    field: {},
    ranch: {},
    cooking: {},
  };
}

function getShopCartKey(kind: "farm" | "ranch" | "ingredient" | "recipe", itemId: string) {
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
      visual: { kind: "farm", iconKey: item.iconKey },
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
      visual: { kind: "ranch", animalId: animal.id },
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

function shopCartItemCount(cart: ShopCartQuantities) {
  return Object.values(cart).reduce((total, quantity) => total + quantity, 0);
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

function RanchShopAnimalSprite({ animal }: { animal: RanchShopAnimal }) {
  return (
    <span
      aria-hidden="true"
      className="ranch-shop__animal-sprite"
      style={getRanchAnimalSpriteStyle(animal)}
    />
  );
}

function ShopCartAddButton({
  disabled = false,
  itemName,
  onAdd,
}: {
  disabled?: boolean;
  itemName: string;
  onAdd: () => void;
}) {
  return (
    <button
      aria-label={`将${itemName}加入购物车`}
      className="shop-cart__add"
      disabled={disabled}
      onClick={onAdd}
      type="button"
    >
      +
    </button>
  );
}

function ShopCartShortcut({ cart, onOpen }: { cart: ShopCartQuantities; onOpen: () => void }) {
  const itemCount = shopCartItemCount(cart);

  return (
    <button
      aria-label={`查看购物车，${itemCount}件`}
      className="shop-cart__shortcut"
      onClick={onOpen}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3 4h2l2.2 9.2a2 2 0 0 0 2 1.55h7.9a2 2 0 0 0 1.94-1.5L21 7H6" />
        <circle cx="9" cy="19" r="1.25" />
        <circle cx="18" cy="19" r="1.25" />
      </svg>
      <span className="farm-visually-hidden">购物车</span>
      <strong>{itemCount}</strong>
    </button>
  );
}

function ShopCartItemVisual({ item }: { item: ShopCartItemDefinition }) {
  if (item.visual.kind === "farm") {
    return item.visual.iconKey ? (
      <img alt="" aria-hidden="true" src={getFarmAssetUrl(item.visual.iconKey)} />
    ) : null;
  }

  if (item.visual.kind === "ranch") {
    const visual = item.visual;
    const animal = RANCH_SHOP_ANIMALS.find((candidate) => candidate.id === visual.animalId);
    return animal ? <RanchShopAnimalSprite animal={animal} /> : null;
  }

  return (
    <CookingCatalogSprite
      entityId={item.visual.entityId}
      kind={item.visual.catalogKind}
      name={item.name}
    />
  );
}

function ShopCartPrice({
  amount,
  currency,
}: {
  amount: number;
  currency: ShopCartItemDefinition["currency"];
}) {
  return (
    <span className={`shop-cart__price shop-cart__price--${currency}`}>
      <span className="farm-visually-hidden">{currency === "silver" ? "银币" : "金币"}</span>
      <i aria-hidden="true" />
      {amount.toLocaleString("zh-CN")}
    </span>
  );
}

function ShopCartPanelContent({
  cart,
  liveResources,
  onBack,
  onChangeQuantity,
  sceneId,
}: {
  cart: ShopCartQuantities;
  liveResources?: FarmShopLiveResources | undefined;
  onBack: () => void;
  onChangeQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  sceneId: ShopCartSceneId;
}) {
  const items = Object.entries(cart).flatMap(([cartKey, quantity]) => {
    const item = getShopCartItemDefinition(sceneId, cartKey, liveResources);
    return item && quantity > 0 ? [{ item, quantity }] : [];
  });
  const total = items.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const currency = sceneId === "cooking" ? "silver" : "gold";
  const actionLabel = sceneId === "cooking" ? "确认购买" : "喊 TA 来买";

  return (
    <section aria-label="购物车" className="shop-cart">
      <header className="shop-cart__header">
        <button aria-label="返回商店" className="shop-cart__back" onClick={onBack} type="button">
          ‹
        </button>
        <h3>购物车</h3>
        <span>{shopCartItemCount(cart)} 件</span>
      </header>
      {items.length > 0 ? (
        <ul className="shop-cart__items">
          {items.map(({ item, quantity }) => (
            <li key={item.cartKey}>
              <span className="shop-cart__visual">
                <ShopCartItemVisual item={item} />
              </span>
              <span className="shop-cart__item-copy">
                <strong>{item.name}</strong>
                <ShopCartPrice amount={item.price} currency={item.currency} />
              </span>
              <span className="shop-cart__quantity">
                <button
                  aria-label={`减少${item.name}数量`}
                  onClick={() => onChangeQuantity(item.cartKey, -1, item.maxQuantity)}
                  type="button"
                >
                  −
                </button>
                <strong>
                  <span className="farm-visually-hidden">{item.name}数量</span>
                  {quantity}
                </strong>
                <button
                  aria-label={`增加${item.name}数量`}
                  disabled={item.maxQuantity !== undefined && quantity >= item.maxQuantity}
                  onClick={() => onChangeQuantity(item.cartKey, 1, item.maxQuantity)}
                  type="button"
                >
                  +
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="shop-cart__empty" role="status">
          <strong>购物车还是空的</strong>
          <span>返回商店，选择商品加入。</span>
        </div>
      )}
      <footer className="shop-cart__footer">
        <span>合计</span>
        <ShopCartPrice amount={total} currency={currency} />
        <button disabled type="button">
          {actionLabel}
        </button>
      </footer>
    </section>
  );
}

function CookingIngredientCatalog({
  liveIngredients,
  onChangeCartQuantity,
}: {
  liveIngredients?: readonly LiveCookingIngredient[] | undefined;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
}) {
  const [categoryId, setCategoryId] = useState<CookingIngredientCategoryId>("grains");
  const category =
    COOKING_INGREDIENT_CATEGORIES.find((candidate) => candidate.id === categoryId) ??
    COOKING_INGREDIENT_CATEGORIES[0];
  const categoryIngredientIds = new Set<string>(category.ingredientIds);
  const categoryIngredients: readonly {
    id: string;
    name: string;
    price: number;
    maxQuantity?: number | undefined;
  }[] = liveIngredients
    ? liveIngredients.filter((ingredient) => categoryIngredientIds.has(ingredient.id))
    : COOKING_CATALOG_INGREDIENTS.filter((ingredient) => categoryIngredientIds.has(ingredient.id));

  return (
    <section aria-label="料理台商店食材" className="cooking-ingredient-catalog">
      <nav aria-label="食材分类" className="cooking-ingredient-catalog__categories">
        {COOKING_INGREDIENT_CATEGORIES.map((ingredientCategory) => (
          <button
            aria-pressed={categoryId === ingredientCategory.id}
            key={ingredientCategory.id}
            onClick={() => setCategoryId(ingredientCategory.id)}
            type="button"
          >
            {ingredientCategory.label}
          </button>
        ))}
      </nav>
      {liveIngredients ? null : (
        <fieldset className="cooking-ingredient-catalog__refresh">
          <legend className="farm-visually-hidden">食材商店刷新状态</legend>
          <span>
            今日刷新 <strong>— / 10</strong>
          </span>
          <span className="cooking-ingredient-catalog__refresh-cost">
            <span className="farm-visually-hidden">下次刷新金币</span>
            <i aria-hidden="true" />—
          </span>
          <button className="cooking-ingredient-catalog__refresh-button" disabled type="button">
            刷新
          </button>
        </fieldset>
      )}
      <ul className="cooking-ingredient-catalog__grid">
        {categoryIngredients.map((ingredient) => (
          <li key={ingredient.id}>
            <button
              aria-label={`将${ingredient.name}加入购物车`}
              className="cooking-ingredient-catalog__portrait"
              disabled={ingredient.maxQuantity === 0}
              onClick={() =>
                onChangeCartQuantity(
                  getShopCartKey("ingredient", ingredient.id),
                  1,
                  ingredient.maxQuantity,
                )
              }
              type="button"
            >
              <CookingCatalogSprite
                entityId={ingredient.id}
                kind="ingredient"
                name={ingredient.name}
              />
              <strong>{ingredient.name}</strong>
            </button>
            <span className="cooking-ingredient-catalog__meta">
              <CookingSilverPrice amount={ingredient.price} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CookingSilverPrice({ amount }: { amount: number }) {
  return (
    <span className="cooking-catalog__price">
      <span className="farm-visually-hidden">银币价格</span>
      <i aria-hidden="true" className="cooking-catalog__silver-coin" />
      {amount}
    </span>
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

function CookingRecipeRow({ onAdd, recipe }: { onAdd: () => void; recipe: CookingCatalogRecipe }) {
  return (
    <li>
      <CookingCatalogSprite entityId={recipe.id} kind="recipe" name={recipe.name} />
      <span className="cooking-recipe-catalog__copy">
        <span className="cooking-recipe-catalog__head">
          <strong>{recipe.name}</strong>
          <small data-rarity={recipe.rarity}>{recipe.rarity}</small>
        </span>
        <span className="cooking-recipe-catalog__ingredients">
          {cookingRecipeIngredientText(recipe.ingredients)}
        </span>
      </span>
      <span className="cooking-recipe-catalog__actions">
        <CookingSilverPrice amount={COOKING_RECIPE_PRICES[recipe.rarity]} />
        <ShopCartAddButton itemName={recipe.name} onAdd={onAdd} />
      </span>
    </li>
  );
}

function CookingRecipeShop({
  onChangeCartQuantity,
}: {
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
}) {
  const recipeOffers = COOKING_SHOP_PREVIEW_RECIPE_IDS.flatMap((recipeId) => {
    const recipe = COOKING_CATALOG_RECIPES.find((candidate) => candidate.id === recipeId);
    return recipe ? [recipe] : [];
  }).slice(0, COOKING_SHOP_DAILY_RECIPE_COUNT);

  return (
    <section aria-label="料理台商店今日食谱" className="cooking-recipe-catalog cooking-recipe-shop">
      <p className="cooking-recipe-shop__refresh">每日 2 道 · 北京时间 00:00 刷新</p>
      <ul className="cooking-recipe-catalog__list cooking-recipe-catalog__list--shop">
        {recipeOffers.map((recipe) => (
          <CookingRecipeRow
            key={recipe.id}
            onAdd={() => onChangeCartQuantity(getShopCartKey("recipe", recipe.id), 1, 1)}
            recipe={recipe}
          />
        ))}
      </ul>
    </section>
  );
}

function formatCookingShopRefreshAt(refreshAt: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(new Date(refreshAt));
}

function CookingLiveRecipeShop({
  kitchen,
  onChangeCartQuantity,
}: {
  kitchen: BoundKitchenRead | null | undefined;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
}) {
  const recipeOffers = getLiveCookingRecipes(kitchen);

  return (
    <section aria-label="料理台商店今日食谱" className="cooking-recipe-catalog cooking-recipe-shop">
      <ul className="cooking-recipe-catalog__list cooking-recipe-catalog__list--shop">
        {recipeOffers.map((recipe) => (
          <li key={recipe.id}>
            <button
              aria-label={`将${recipe.name}加入购物车`}
              onClick={() => onChangeCartQuantity(getShopCartKey("recipe", recipe.id), 1, 1)}
              style={{ display: "contents" }}
              type="button"
            >
              <CookingCatalogSprite entityId={recipe.id} kind="recipe" name={recipe.name} />
              <span className="cooking-recipe-catalog__copy">
                <span className="cooking-recipe-catalog__head">
                  <strong>{recipe.name}</strong>
                  {recipe.rarity ? (
                    <small data-rarity={recipe.rarity}>{recipe.rarity}</small>
                  ) : null}
                </span>
                <span className="cooking-recipe-catalog__ingredients">
                  {recipe.ingredientNames.join("、")}
                </span>
              </span>
              <span className="cooking-recipe-catalog__actions">
                <CookingSilverPrice amount={recipe.price} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CookingToolShop({
  kitchen,
  live = false,
}: {
  kitchen?: BoundKitchenRead | null | undefined;
  live?: boolean | undefined;
}) {
  const toolIds = ["roast", "steam", "deep-fry"] as const;

  if (live) {
    if (kitchen?.data.tools.status !== "available") {
      return (
        <div className="farm-shop__unavailable">
          <strong>料理工具价格数据尚未提供</strong>
          <span>当前不会显示示例工具或模拟购买。</span>
        </div>
      );
    }
    const tools = kitchen.data.tools.items.filter(
      (tool) => tool.status === "available" && tool.name !== null,
    );
    return (
      <section aria-label="料理台商店工具" className="cooking-tool-shop">
        <ul className="cooking-tool-shop__grid">
          {tools.map((tool) => {
            const method = COOKING_METHODS.find((candidate) => candidate.id === tool.tool_id);
            return (
              <li data-owned={tool.owned === true} key={tool.tool_id}>
                <span className="cooking-tool-shop__portrait">
                  {method ? (
                    <img alt="" aria-hidden="true" src={getFarmAssetUrl(method.assetKey)} />
                  ) : null}
                </span>
                <strong>{tool.name}</strong>
                {tool.owned === true ? (
                  <span className="cooking-tool-shop__owned">已拥有</span>
                ) : (
                  <span className="cooking-tool-shop__owned">价格未提供，暂不可购买</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section aria-label="料理台商店工具" className="cooking-tool-shop">
      <ul className="cooking-tool-shop__grid">
        {toolIds.map((methodId) => {
          const method = COOKING_METHODS.find((candidate) => candidate.id === methodId);
          if (!method) {
            return null;
          }

          const owned = COOKING_PREVIEW_OWNED_PAID_TOOL_IDS.has(methodId);
          const price = COOKING_PAID_TOOL_PRICES[methodId];
          return (
            <li data-owned={owned} key={methodId}>
              <span className="cooking-tool-shop__portrait">
                <img alt="" aria-hidden="true" src={getFarmAssetUrl(method.assetKey)} />
              </span>
              <strong>{method.label}</strong>
              {owned ? (
                <span className="cooking-tool-shop__owned">已拥有</span>
              ) : (
                <span className="cooking-tool-shop__price">
                  <span className="farm-visually-hidden">银币</span>
                  <i aria-hidden="true" className="cooking-catalog__silver-coin" />
                  {price.toLocaleString("zh-CN")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CookingShopPanelContent({
  cart,
  kitchen,
  live,
  onChangeCartQuantity,
}: {
  cart: ShopCartQuantities;
  kitchen?: BoundKitchenRead | null | undefined;
  live?: boolean;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
}) {
  const [sectionId, setSectionId] = useState<CookingShopSectionId>("ingredients");
  const [cartOpen, setCartOpen] = useState(false);

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        liveResources={live ? { kitchen } : undefined}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        sceneId="cooking"
      />
    );
  }

  const liveShopUnavailable =
    live &&
    (kitchen?.data.daily_shop.status !== "available" ||
      kitchen?.data.daily_shop.is_current_day !== true);

  return (
    <section aria-label="料理台商店" className="cooking-shop">
      <nav aria-label="料理台商店分类" className="farm-shop__categories">
        {(
          [
            ["ingredients", "食材"],
            ["recipes", "食谱"],
            ["tools", "工具"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-pressed={sectionId === id}
            key={id}
            onClick={() => setSectionId(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      {live && !liveShopUnavailable && sectionId !== "tools" && kitchen ? (
        <p className="cooking-recipe-shop__refresh">
          {sectionId === "recipes" ? "每日 2 道 · " : null}
          下次刷新{" "}
          <time dateTime={kitchen.data.daily_shop.refresh_at}>
            {formatCookingShopRefreshAt(kitchen.data.daily_shop.refresh_at)}
          </time>
        </p>
      ) : null}
      {sectionId !== "tools" && liveShopUnavailable ? (
        <div className="farm-shop__unavailable" role="status">
          <strong>
            {kitchen?.data.daily_shop.is_current_day === false
              ? "料理商店货架已过期"
              : "料理商店数据暂不可用"}
          </strong>
          <span>当前不会显示旧货架或示例商品。</span>
        </div>
      ) : sectionId === "ingredients" ? (
        <CookingIngredientCatalog
          liveIngredients={live ? getLiveCookingIngredients(kitchen) : undefined}
          onChangeCartQuantity={onChangeCartQuantity}
        />
      ) : sectionId === "recipes" ? (
        live ? (
          <CookingLiveRecipeShop kitchen={kitchen} onChangeCartQuantity={onChangeCartQuantity} />
        ) : (
          <CookingRecipeShop onChangeCartQuantity={onChangeCartQuantity} />
        )
      ) : (
        <CookingToolShop kitchen={live ? kitchen : undefined} live={live} />
      )}
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}

function RanchLiveShopPanelContent({
  cart,
  onChangeCartQuantity,
  ranch,
}: {
  cart: ShopCartQuantities;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  ranch?: BoundRanchRead | null | undefined;
}) {
  const [shopSection, setShopSection] = useState<"animals" | "pets">("animals");
  const [cartOpen, setCartOpen] = useState(false);
  const items = getLiveRanchShopItems(ranch).filter((item) => item.section === shopSection);

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        liveResources={{ ranch }}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        sceneId="ranch"
      />
    );
  }

  if (
    !ranch ||
    (ranch.data.shop.animals.status !== "available" && ranch.data.shop.pets.status !== "available")
  ) {
    return (
      <div className="farm-shop__unavailable">
        <img alt="" aria-hidden="true" src={getFarmAssetUrl("panel.tool.shop")} />
        <strong>牧场商店数据尚未接入</strong>
        <span>当前页面不会显示示例动物。</span>
      </div>
    );
  }

  return (
    <section aria-label="牧场商店" className="ranch-shop">
      <nav aria-label="牧场商店分类" className="farm-shop__categories">
        {(
          [
            ["animals", "动物"],
            ["pets", "宠物"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-pressed={shopSection === id}
            key={id}
            onClick={() => setShopSection(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      <ul className="ranch-shop__grid">
        {items.map((item) => {
          const purchasable =
            item.owned === false && item.availableQuantity !== null && item.availableQuantity > 0;
          const unavailableLabel =
            item.owned === null || item.availableQuantity === null
              ? "购买状态不可用"
              : "暂不可购买";
          return (
            <li key={item.id}>
              <button
                aria-label={
                  item.owned === true
                    ? `${item.name}已拥有`
                    : purchasable
                      ? `将${item.name}加入购物车`
                      : `${item.name}${unavailableLabel}`
                }
                className="ranch-shop__product-button"
                disabled={!purchasable}
                onClick={() =>
                  onChangeCartQuantity(
                    getShopCartKey("ranch", item.id),
                    1,
                    Math.min(1, item.availableQuantity ?? 0),
                  )
                }
                type="button"
              >
                <span className="ranch-shop__portrait">
                  <span
                    className="ranch-shop__portrait-sprite"
                    style={getRanchAnimalPlacementStyle(item.animal)}
                  >
                    <RanchShopAnimalSprite animal={item.animal} />
                  </span>
                  <strong>{item.name}</strong>
                </span>
              </button>
              <span className="ranch-shop__price">
                {item.owned === true ? (
                  "已拥有"
                ) : purchasable ? (
                  <>
                    <i aria-hidden="true" />
                    {item.price.toLocaleString("zh-CN")}
                  </>
                ) : (
                  unavailableLabel
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}

function RanchShopPanelContent({
  cart,
  onChangeCartQuantity,
  preview,
  ranch,
}: {
  cart: ShopCartQuantities;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  preview: boolean;
  ranch?: BoundRanchRead | null | undefined;
}) {
  const [shopSection, setShopSection] = useState<"animals" | "pets">("animals");
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const selectedAnimal = RANCH_SHOP_ANIMALS.find((animal) => animal.id === selectedAnimalId);
  const sectionAnimals = RANCH_SHOP_ANIMALS.filter((animal) => animal.shopSection === shopSection);

  if (!preview) {
    return (
      <RanchLiveShopPanelContent
        cart={cart}
        onChangeCartQuantity={onChangeCartQuantity}
        ranch={ranch}
      />
    );
  }

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        sceneId="ranch"
      />
    );
  }

  if (selectedAnimal) {
    return (
      <section aria-label={`${selectedAnimal.name}详情`} className="ranch-shop ranch-shop--detail">
        <button
          aria-label="返回牧场商店"
          className="ranch-shop__back"
          onClick={() => setSelectedAnimalId(null)}
          type="button"
        >
          ‹
        </button>
        <div className="ranch-shop__detail-head">
          <RanchShopAnimalSprite animal={selectedAnimal} />
          <div>
            <h3>{selectedAnimal.name}</h3>
            <span className="ranch-shop__category">{selectedAnimal.category}</span>
            {selectedAnimal.description ? <p>{selectedAnimal.description}</p> : null}
          </div>
        </div>
        <dl className="ranch-shop__facts">
          {selectedAnimal.produce ? (
            <div className="ranch-shop__fact">
              <dt>产物</dt>
              <dd>{selectedAnimal.produce}</dd>
            </div>
          ) : null}
          {selectedAnimal.produceEveryTicks ? (
            <div className="ranch-shop__fact">
              <dt>产出周期</dt>
              <dd>{selectedAnimal.produceEveryTicks} 个农场周期</dd>
            </div>
          ) : null}
          {selectedAnimal.producePrice ? (
            <div className="ranch-shop__fact">
              <dt>回收价</dt>
              <dd>{selectedAnimal.producePrice.toLocaleString("zh-CN")} 金币／份</dd>
            </div>
          ) : null}
          {selectedAnimal.effectLabel ? (
            <div className="ranch-shop__fact">
              <dt>作用</dt>
              <dd>{selectedAnimal.effectLabel}</dd>
            </div>
          ) : null}
          {selectedAnimal.effectText ? (
            <div className="ranch-shop__fact ranch-shop__fact--description">
              <dt>效果</dt>
              <dd>{selectedAnimal.effectText}</dd>
            </div>
          ) : null}
          {!selectedAnimal.demoOwned ? (
            <div className="ranch-shop__fact">
              <dt>入手成本</dt>
              <dd>{selectedAnimal.buyCost.toLocaleString("zh-CN")} 金币</dd>
            </div>
          ) : null}
          <div className="ranch-shop__fact">
            <dt>解锁条件</dt>
            <dd>{selectedAnimal.unlockCondition}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section aria-label="牧场商店" className="ranch-shop">
      <nav aria-label="牧场商店分类" className="farm-shop__categories">
        {(
          [
            ["animals", "动物"],
            ["pets", "宠物"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-pressed={shopSection === id}
            key={id}
            onClick={() => {
              setShopSection(id);
              setSelectedAnimalId(null);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      <ul className="ranch-shop__grid">
        {sectionAnimals.map((animal) => (
          <li key={animal.id}>
            <button
              aria-label={
                animal.demoOwned ? `查看${animal.name}详情` : `将${animal.name}加入购物车`
              }
              className="ranch-shop__product-button"
              onClick={() => {
                if (animal.demoOwned) {
                  setSelectedAnimalId(animal.id);
                  return;
                }
                onChangeCartQuantity(getShopCartKey("ranch", animal.id), 1, 1);
              }}
              type="button"
            >
              <span className="ranch-shop__portrait">
                <span
                  className="ranch-shop__portrait-sprite"
                  style={getRanchAnimalPlacementStyle(animal)}
                >
                  <RanchShopAnimalSprite animal={animal} />
                </span>
                <strong>{animal.name}</strong>
              </span>
            </button>
            <span className="ranch-shop__price">
              {animal.demoOwned ? (
                "已拥有"
              ) : (
                <>
                  <i aria-hidden="true" />
                  {animal.buyCost.toLocaleString("zh-CN")}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}

function FarmLiveShopPanelContent({
  cart,
  farmCatalog,
  onChangeCartQuantity,
}: {
  cart: ShopCartQuantities;
  farmCatalog?: BoundFarmCatalogRead | null | undefined;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
}) {
  const [sectionId, setSectionId] = useState<FarmFieldShopSectionId>("seeds-and-potions");
  const [cartOpen, setCartOpen] = useState(false);
  const items = getLiveFarmShopItems(farmCatalog).filter((item) =>
    sectionId === "today" ? item.source === "persisted" : item.source === "permanent",
  );

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        liveResources={{ farmCatalog }}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        sceneId="field"
      />
    );
  }

  if (farmCatalog?.data.shop.status !== "available") {
    return (
      <div className="farm-shop__unavailable">
        <img alt="" aria-hidden="true" src={getFarmAssetUrl("panel.tool.shop")} />
        <strong>商店数据尚未接入</strong>
        <span>当前页面不会显示示例商品。</span>
      </div>
    );
  }

  return (
    <section aria-label="农场商店" className="farm-shop">
      <nav aria-label="商店分类" className="farm-shop__categories">
        {FARM_FIELD_SHOP_SECTIONS.map((section) => (
          <button
            aria-pressed={section.id === sectionId}
            key={section.id}
            onClick={() => setSectionId(section.id)}
            type="button"
          >
            {section.label}
          </button>
        ))}
      </nav>
      <ul className="farm-shop__items">
        {items.map((item) => {
          const disabled = item.note === "已拥有" || item.availableQuantity === 0;
          const addToCart = () => {
            if (disabled) {
              return;
            }
            onChangeCartQuantity(
              getShopCartKey("farm", item.id),
              1,
              item.availableQuantity ?? undefined,
            );
          };
          return (
            <li key={item.id}>
              <button
                aria-label={`将${item.name}加入购物车`}
                disabled={disabled}
                onClick={addToCart}
                style={{ display: "contents" }}
                type="button"
              >
                {item.iconKey ? (
                  <img alt="" aria-hidden="true" src={getFarmAssetUrl(item.iconKey)} />
                ) : null}
                <span className="farm-shop__item-copy">
                  <strong>{item.name}</strong>
                  <small>{item.note}</small>
                </span>
              </button>
              <span className="farm-shop__price">
                <span className="farm-visually-hidden">价格</span>
                <i aria-hidden="true" />
                {item.price}
              </span>
            </li>
          );
        })}
      </ul>
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}

export function FarmShopPanelContent({
  activeScene,
  cart,
  farmCatalog,
  kitchen,
  onChangeCartQuantity,
  preview,
  ranch,
}: FarmShopPanelProps) {
  const [sectionId, setSectionId] = useState<FarmFieldShopSectionId>("seeds-and-potions");
  const [cartOpen, setCartOpen] = useState(false);
  const previewItems = FARM_FIELD_SHOP_PREVIEW_ITEMS[sectionId];

  if (activeScene === "ranch") {
    return (
      <RanchShopPanelContent
        cart={cart}
        onChangeCartQuantity={onChangeCartQuantity}
        preview={preview}
        ranch={ranch}
      />
    );
  }

  if (activeScene === "cooking") {
    return preview ? (
      <CookingShopPanelContent cart={cart} onChangeCartQuantity={onChangeCartQuantity} />
    ) : (
      <CookingShopPanelContent
        cart={cart}
        kitchen={kitchen}
        live
        onChangeCartQuantity={onChangeCartQuantity}
      />
    );
  }

  if (!preview) {
    return (
      <FarmLiveShopPanelContent
        cart={cart}
        farmCatalog={farmCatalog}
        onChangeCartQuantity={onChangeCartQuantity}
      />
    );
  }

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        liveResources={undefined}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        sceneId="field"
      />
    );
  }

  return (
    <section aria-label="农场商店" className="farm-shop">
      <nav aria-label="商店分类" className="farm-shop__categories">
        {FARM_FIELD_SHOP_SECTIONS.map((section) => (
          <button
            aria-pressed={section.id === sectionId}
            key={section.id}
            onClick={() => setSectionId(section.id)}
            type="button"
          >
            {section.label}
          </button>
        ))}
      </nav>
      <ul className="farm-shop__items">
        {previewItems.map((item) => (
          <li key={item.id}>
            {item.iconKey ? (
              <img alt="" aria-hidden="true" src={getFarmAssetUrl(item.iconKey)} />
            ) : null}
            <span className="farm-shop__item-copy">
              <strong>{item.name}</strong>
              <small>{item.note}</small>
            </span>
            {item.price === undefined ? (
              <span className="farm-shop__price farm-shop__price--variable">随机</span>
            ) : (
              <span className="farm-shop__price">
                <span className="farm-visually-hidden">价格</span>
                <i aria-hidden="true" />
                {item.price}
              </span>
            )}
            <ShopCartAddButton
              disabled={item.price === undefined}
              itemName={item.name}
              onAdd={() => onChangeCartQuantity(getShopCartKey("farm", item.id), 1)}
            />
          </li>
        ))}
      </ul>
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}
