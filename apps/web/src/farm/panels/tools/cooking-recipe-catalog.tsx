import { type CSSProperties, useState } from "react";
import type { BoundKitchenRead } from "../../../auth/kitchen-client";
import { type FarmAssetManifestEntry, getCookingRecipeAsset } from "../../farm-asset-manifest";
import {
  COOKING_CATALOG_RECIPES,
  COOKING_INGREDIENT_NAME_BY_ID,
  COOKING_RECIPE_CATEGORIES,
  type CookingCatalogRecipe,
} from "../../farm-cooking-catalog";
import { FarmUnavailablePanel } from "./common";

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
  onQuickMake,
  recipe,
}: {
  canQuickMake?: boolean;
  onQuickMake?: ((recipeId: string) => void) | undefined;
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
            aria-label={`${recipe.name}一键制作`}
            className="cooking-recipe-catalog__quick-make"
            disabled={!onQuickMake}
            onClick={() => onQuickMake?.(recipe.id)}
            type="button"
          >
            一键制作
          </button>
        </span>
      ) : null}
    </li>
  );
}

export function CookingRecipeCatalog({
  kitchen,
  onQuickMake,
  preview,
  selectedIngredientIds,
}: {
  kitchen?: BoundKitchenRead | null;
  onQuickMake?: ((recipeId: string) => void) | undefined;
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
                canQuickMake={recipe.status === "available"}
                key={recipe.recipe_id}
                onQuickMake={onQuickMake}
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
