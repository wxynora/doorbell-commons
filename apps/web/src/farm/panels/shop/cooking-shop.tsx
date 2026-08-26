import { useState } from "react";
import type { BoundKitchenRead } from "../../../auth/kitchen-client";
import { getFarmAssetUrl } from "../../farm-asset-manifest";
import {
  COOKING_CATALOG_INGREDIENTS,
  COOKING_CATALOG_RECIPES,
  COOKING_INGREDIENT_CATEGORIES,
  COOKING_INGREDIENT_NAME_BY_ID,
  COOKING_RECIPE_PRICES,
  type CookingCatalogRecipe,
  type CookingIngredientCategoryId,
} from "../../farm-cooking-catalog";
import {
  COOKING_METHODS,
  COOKING_PAID_TOOL_PRICES,
  COOKING_PREVIEW_OWNED_PAID_TOOL_IDS,
  COOKING_SHOP_DAILY_RECIPE_COUNT,
  COOKING_SHOP_PREVIEW_RECIPE_IDS,
  type CookingCartCheckoutFeedback,
  type CookingCartCheckoutLine,
  type CookingShopRefreshFeedback,
  type CookingShopSectionId,
  getCookingToolAssetKey,
  getLiveCookingIngredients,
  getLiveCookingRecipes,
  getLiveCookingTools,
  getShopCartKey,
  type LiveCookingIngredient,
  PAID_COOKING_TOOL_IDS,
  type ShopCartQuantities,
} from "./model";
import {
  CookingCatalogSprite,
  CookingSilverPrice,
  ShopCartAddButton,
  ShopCartPanelContent,
  ShopCartShortcut,
} from "./shared";

function CookingIngredientCatalog({
  liveIngredients,
  onChangeCartQuantity,
  onRefreshCookingShop,
  refreshFeedback,
  refreshState,
}: {
  liveIngredients?: readonly LiveCookingIngredient[] | undefined;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  onRefreshCookingShop?: (() => void) | undefined;
  refreshFeedback?: CookingShopRefreshFeedback | undefined;
  refreshState?: BoundKitchenRead["data"]["daily_shop"] | undefined;
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
  const liveRefresh = refreshState?.status === "available" ? refreshState : null;
  const refreshSubmitting = refreshFeedback?.stage === "submitting";

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
      {!liveIngredients || liveRefresh ? (
        <fieldset className="cooking-ingredient-catalog__refresh">
          <legend className="farm-visually-hidden">食材商店刷新状态</legend>
          <span>
            今日刷新{" "}
            <strong>
              {liveRefresh?.refresh_used_count ?? "—"} / {liveRefresh?.refresh_limit ?? 10}
            </strong>
          </span>
          <span className="cooking-ingredient-catalog__refresh-cost">
            <span className="farm-visually-hidden">下次刷新金币</span>
            <i aria-hidden="true" />
            {liveRefresh?.next_cost_coins ?? "—"}
          </span>
          <button
            className="cooking-ingredient-catalog__refresh-button"
            disabled={!onRefreshCookingShop || !liveRefresh?.can_refresh || refreshSubmitting}
            onClick={onRefreshCookingShop}
            type="button"
          >
            {refreshSubmitting
              ? "刷新中"
              : liveRefresh?.refresh_remaining_count === 0
                ? "已用完"
                : "刷新"}
          </button>
          {refreshFeedback?.stage === "error" ? (
            <span className="cooking-ingredient-catalog__refresh-feedback" role="alert">
              {refreshFeedback.message}
              {refreshFeedback.retryable ? " 再点一次会继续同一笔刷新。" : ""}
            </span>
          ) : null}
        </fieldset>
      ) : null}
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
  onChangeCartQuantity,
}: {
  kitchen?: BoundKitchenRead | null | undefined;
  live?: boolean | undefined;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
}) {
  if (live) {
    if (kitchen?.data.tools.status !== "available") {
      return (
        <div className="farm-shop__unavailable">
          <strong>料理工具数据暂不可用</strong>
          <span>当前不会显示示例工具或模拟购买。</span>
        </div>
      );
    }
    const tools = getLiveCookingTools(kitchen);
    return (
      <section aria-label="料理台商店工具" className="cooking-tool-shop">
        <ul className="cooking-tool-shop__grid">
          {tools.map((tool) => {
            const assetKey = getCookingToolAssetKey(tool.id);
            const canPurchase = tool.owned === false;
            const content = (
              <>
                <span className="cooking-tool-shop__portrait">
                  {assetKey ? (
                    <img alt="" aria-hidden="true" src={getFarmAssetUrl(assetKey)} />
                  ) : null}
                </span>
                <strong>{tool.name}</strong>
                {tool.owned === true ? (
                  <span className="cooking-tool-shop__owned">已拥有</span>
                ) : tool.owned === false ? (
                  <span className="cooking-tool-shop__price">
                    <span className="farm-visually-hidden">银币</span>
                    <i aria-hidden="true" className="cooking-catalog__silver-coin" />
                    {tool.price.toLocaleString("zh-CN")}
                  </span>
                ) : (
                  <span className="cooking-tool-shop__owned">持有状态未知</span>
                )}
              </>
            );
            return (
              <li data-owned={tool.owned === true} key={tool.id}>
                {canPurchase ? (
                  <button
                    aria-label={`将${tool.name}加入购物车`}
                    onClick={() => onChangeCartQuantity(getShopCartKey("tool", tool.id), 1, 1)}
                    style={{ display: "contents" }}
                    type="button"
                  >
                    {content}
                  </button>
                ) : (
                  content
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
        {PAID_COOKING_TOOL_IDS.map((methodId) => {
          const method = COOKING_METHODS.find((candidate) => candidate.id === methodId);
          if (!method) {
            return null;
          }

          const owned = COOKING_PREVIEW_OWNED_PAID_TOOL_IDS.has(methodId);
          const price = COOKING_PAID_TOOL_PRICES[methodId];
          const content = (
            <>
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
            </>
          );
          return (
            <li data-owned={owned} key={methodId}>
              {owned ? (
                content
              ) : (
                <button
                  aria-label={`将${method.label}加入购物车`}
                  onClick={() => onChangeCartQuantity(getShopCartKey("tool", methodId), 1, 1)}
                  style={{ display: "contents" }}
                  type="button"
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CookingShopPanelContent({
  cart,
  cookingCheckoutFeedback,
  cookingShopRefreshFeedback,
  kitchen,
  live,
  onChangeCartQuantity,
  onCheckoutCookingCart,
  onRetryCookingCheckout,
  onRefreshCookingShop,
}: {
  cart: ShopCartQuantities;
  cookingCheckoutFeedback?: CookingCartCheckoutFeedback | undefined;
  cookingShopRefreshFeedback?: CookingShopRefreshFeedback | undefined;
  kitchen?: BoundKitchenRead | null | undefined;
  live?: boolean;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  onCheckoutCookingCart?: ((items: CookingCartCheckoutLine[]) => void) | undefined;
  onRetryCookingCheckout?: (() => void) | undefined;
  onRefreshCookingShop?: (() => void) | undefined;
}) {
  const [sectionId, setSectionId] = useState<CookingShopSectionId>("ingredients");
  const [cartOpen, setCartOpen] = useState(false);

  if (cartOpen) {
    return (
      <ShopCartPanelContent
        cart={cart}
        cookingCheckoutFeedback={cookingCheckoutFeedback}
        liveResources={live ? { kitchen } : undefined}
        onBack={() => setCartOpen(false)}
        onChangeQuantity={onChangeCartQuantity}
        onCheckoutCookingCart={onCheckoutCookingCart}
        onRetryCookingCheckout={onRetryCookingCheckout}
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
          onRefreshCookingShop={onRefreshCookingShop}
          refreshFeedback={cookingShopRefreshFeedback}
          refreshState={live ? kitchen?.data.daily_shop : undefined}
        />
      ) : sectionId === "recipes" ? (
        live ? (
          <CookingLiveRecipeShop kitchen={kitchen} onChangeCartQuantity={onChangeCartQuantity} />
        ) : (
          <CookingRecipeShop onChangeCartQuantity={onChangeCartQuantity} />
        )
      ) : (
        <CookingToolShop
          kitchen={live ? kitchen : undefined}
          live={live}
          onChangeCartQuantity={onChangeCartQuantity}
        />
      )}
      <ShopCartShortcut cart={cart} onOpen={() => setCartOpen(true)} />
    </section>
  );
}
