import { type CSSProperties, useState } from "react";
import type { BoundKitchenRead } from "../../../auth/kitchen-client";
import { kitchenCookIssueMessage } from "../../../auth/kitchen-cook-client";
import {
  type FarmAssetManifestEntry,
  getCookingIngredientAsset,
  getCookingRecipeAsset,
} from "../../farm-asset-manifest";
import { COOKING_CATALOG_INGREDIENTS, type CookingCatalogRecipe } from "../../farm-cooking-catalog";
import type { KitchenCookActionState, KitchenCookOutcome } from "../model";
import {
  COOKING_PREP_CATEGORIES,
  COOKING_PREP_SLOT_IDS,
  COOKING_RESULT_STYLE_PREVIEW,
  COOKING_SHOP_INGREDIENT_CATEGORY_BY_ID,
  type CookingIngredientPickerOption,
  type CookingMethodId,
  type CookingPrepCategoryId,
  DEFAULT_COOKING_METHOD,
  getLiveCookingIngredientOptions,
  getVisibleCookingMethods,
} from "./model";

export type { KitchenCookActionState } from "../model";

export function CookingPrepOverlay({
  cookAction,
  ingredientPickerOpen,
  onCloseIngredientPicker,
  onCloseCookResult,
  onCook,
  onOpenIngredientPicker,
  onRemoveIngredient,
  onRetryCook,
  onSelectIngredient,
  selectedMethodId,
  selectedIngredientIds,
  onSelectMethod,
  kitchen,
  preview,
}: {
  cookAction: KitchenCookActionState;
  ingredientPickerOpen: boolean;
  onCloseIngredientPicker: () => void;
  onCloseCookResult: () => void;
  onCook: () => void;
  onOpenIngredientPicker: () => void;
  onRemoveIngredient: (slotIndex: number) => void;
  onRetryCook: () => void;
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
  const liveCookEnabled =
    !preview &&
    kitchen !== null &&
    selectedIngredientIds.length >= 2 &&
    selectedIngredientIds.length <= 5 &&
    cookAction.stage === "idle";

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
            disabled={preview ? selectedIngredientIds.length === 0 : !liveCookEnabled}
            onClick={() => {
              if (preview) {
                setResultPreviewOpen(true);
              } else {
                onCook();
              }
            }}
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
      {!preview && cookAction.stage === "success" ? (
        <CookingResultReceipt onClose={onCloseCookResult} outcome={cookAction.outcome} />
      ) : null}
      {!preview && cookAction.stage === "error" ? (
        <CookingCookNotice action={cookAction} onClose={onCloseCookResult} onRetry={onRetryCook} />
      ) : null}
    </>
  );
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

function CookingResultReceipt({
  onClose,
  outcome,
}: {
  onClose: () => void;
  outcome: KitchenCookOutcome;
}) {
  return (
    <section
      aria-label="料理结果"
      aria-modal="true"
      className="farm-cooking-result-preview"
      role="dialog"
    >
      <div className="farm-cooking-result-preview__paper" data-rarity={outcome.rarity}>
        <button
          aria-label="关闭料理结果"
          className="farm-cooking-result-preview__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <div className="farm-cooking-result-preview__main">
          <span className="farm-cooking-result-preview__visual">
            <CookingCatalogSprite entityId={outcome.recipe_id} kind="recipe" name={outcome.name} />
          </span>
          <span className="farm-cooking-result-preview__copy">
            <small data-rarity={outcome.rarity}>{outcome.rarity}</small>
            <strong>{outcome.name}</strong>
            <span>{outcome.discovered ? "新食谱已解锁" : "料理已入柜"}</span>
          </span>
        </div>
        <section aria-label="锁定系统回收价" className="farm-cooking-result-preview__value">
          <span aria-label={`牧场金币 ${outcome.value_gold}`} role="img">
            <i aria-hidden="true" data-currency="gold" />
            <strong>{outcome.value_gold}</strong>
          </span>
          <em aria-hidden="true">+</em>
          <span aria-label={`银币 ${outcome.recycle_silver}`} role="img">
            <i aria-hidden="true" data-currency="silver" />
            <strong>{outcome.recycle_silver}</strong>
          </span>
        </section>
        <button className="farm-cooking-result-preview__collect" onClick={onClose} type="button">
          收进料理柜
        </button>
      </div>
    </section>
  );
}

function CookingCookNotice({
  action,
  onClose,
  onRetry,
}: {
  action: Extract<KitchenCookActionState, { stage: "error" }>;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <aside className="farm-harvest-notice" role="alert">
      <button aria-label="关闭料理失败提示" onClick={onClose} type="button">
        ×
      </button>
      <p>{kitchenCookIssueMessage(action.issue)}</p>
      {action.attempt ? (
        <button className="farm-harvest-notice__action" onClick={onRetry} type="button">
          重试同一次料理
        </button>
      ) : null}
    </aside>
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
