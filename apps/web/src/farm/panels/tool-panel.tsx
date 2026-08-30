import { lazy, Suspense } from "react";
import { getFarmAssetUrl } from "../farm-asset-manifest";
import { FarmLazyLoading } from "../page/farm-lazy-boundary";
import { FarmBackpackPanel } from "./tools/backpack-panel";
import { FARM_FEATURE_PANELS, FarmFeaturePanelContent, FarmUnavailablePanel } from "./tools/common";
import { CookingRecipeCatalog } from "./tools/cooking-recipe-catalog";
import { OriginalPlantCreator } from "./tools/original-plant-creator";
import { FarmExpeditionPanel, FarmMarketPanel, RanchDispatchPanel } from "./tools/remote-panels";
import { FarmSettingsPanelContent, farmSettingsDraftFromCatalog } from "./tools/settings-panel";
import { SmeltingPanelContent } from "./tools/smelting-panel";
import type { FarmToolPanelProps } from "./tools/types";
import "./tool-panel.css";

export type {
  CropCodexActionExecutor,
  ExpeditionActionExecutor,
  MarketActionExecutor,
  RanchInteractionActionExecutor,
} from "./farm-action-panels";
export { getFarmBackpackItemsForTab } from "./tools/backpack-panel";
export { FarmUnavailablePanel } from "./tools/common";
export type {
  FarmSceneId,
  FarmSettingsActionExecutor,
  FarmSettingsDraft,
  FarmToolOption,
  FarmToolPanelProps,
  KitchenInventoryActionExecutor,
  OriginalPlantActionExecutor,
  OriginalPlantDraft,
  RanchDecorationActionExecutor,
  SmeltingActionExecutor,
} from "./tools/types";

const FarmShopPanelContent = lazy(async () => {
  const module = await import("./shop-panel");
  return { default: module.FarmShopPanelContent };
});

const FarmCropCodex = lazy(async () => {
  const module = await import("./farm-action-panels");
  return { default: module.FarmCropCodex };
});

export function FarmToolPanel({
  activeScene,
  cart,
  cookingCheckoutFeedback,
  cookingShopRefreshFeedback,
  farmCheckoutFeedback,
  farmCatalog,
  farmShopOpenFeedback,
  kitchen,
  onClose,
  onChangeCartQuantity,
  onCheckoutCookingCart,
  onCheckoutFarmCart,
  onChangeOriginalPlantDraft,
  onChangeSettingsDraft,
  onCropCodexAction,
  onExpeditionAction,
  onFarmSettingsAction,
  onKitchenInventoryAction,
  onKitchenRecipeCook,
  onMarketAction,
  onOriginalPlantAction,
  onRanchDecorationAction,
  onRanchInteractionAction,
  onSmeltingAction,
  onRetryCookingCheckout,
  onRetryFarmCheckout,
  onRetryFarmShopOpen,
  onRefreshCookingShop,
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
        <Suspense fallback={<FarmLazyLoading label="正在打开商店" />}>
          <FarmShopPanelContent
            activeScene={activeScene}
            cart={cart}
            cookingCheckoutFeedback={cookingCheckoutFeedback}
            cookingShopRefreshFeedback={cookingShopRefreshFeedback}
            farmCheckoutFeedback={farmCheckoutFeedback}
            farmCatalog={farmCatalog ?? null}
            farmShopOpenFeedback={farmShopOpenFeedback}
            kitchen={kitchen ?? null}
            onChangeCartQuantity={onChangeCartQuantity}
            onCheckoutCookingCart={onCheckoutCookingCart}
            onCheckoutFarmCart={onCheckoutFarmCart}
            onRetryCookingCheckout={onRetryCookingCheckout}
            onRetryFarmCheckout={onRetryFarmCheckout}
            onRetryFarmShopOpen={onRetryFarmShopOpen}
            onRefreshCookingShop={onRefreshCookingShop}
            preview={preview}
            ranch={ranch ?? null}
          />
        </Suspense>
      ) : activeScene === "field" && tool.id === "crop-codex" ? (
        <Suspense fallback={<FarmLazyLoading label="正在打开作物图鉴" />}>
          <FarmCropCodex
            farmCatalog={farmCatalog ?? null}
            onCropCodexAction={onCropCodexAction}
            preview={preview}
          />
        </Suspense>
      ) : activeScene === "cooking" && tool.id === "recipes" ? (
        <CookingRecipeCatalog
          kitchen={kitchen ?? null}
          onQuickMake={onKitchenRecipeCook}
          preview={preview}
          selectedIngredientIds={selectedCookingIngredientIds}
        />
      ) : activeScene === "field" && tool.id === "smelting" ? (
        <SmeltingPanelContent
          farmCatalog={farmCatalog ?? null}
          onSmeltingAction={onSmeltingAction}
          preview={preview}
        />
      ) : tool.id === "backpack" && activeScene !== "neighborhood" ? (
        <FarmBackpackPanel
          farmCatalog={farmCatalog ?? null}
          kitchen={kitchen ?? null}
          onKitchenInventoryAction={onKitchenInventoryAction}
          onRanchDecorationAction={onRanchDecorationAction}
          preview={preview}
          ranch={ranch ?? null}
          scene={activeScene}
        />
      ) : activeScene === "field" && tool.id === "adventure" ? (
        <FarmExpeditionPanel
          farmCatalog={farmCatalog ?? null}
          onExpeditionAction={onExpeditionAction}
          preview={preview}
        />
      ) : activeScene === "ranch" && tool.id === "dispatch" ? (
        <RanchDispatchPanel
          farmCatalog={farmCatalog ?? null}
          onRanchInteractionAction={onRanchInteractionAction}
          preview={preview}
          ranch={ranch ?? null}
        />
      ) : activeScene === "field" && tool.id === "create" ? (
        <OriginalPlantCreator
          catalogRevision={farmCatalog?.original_plant_revision}
          draft={originalPlantDraft}
          editable={preview || Boolean(onOriginalPlantAction && farmCatalog)}
          onChange={onChangeOriginalPlantDraft}
          onCreate={onOriginalPlantAction}
        />
      ) : tool.id === "market" ? (
        <FarmMarketPanel
          farmCatalog={farmCatalog ?? null}
          onMarketAction={onMarketAction}
          preview={preview}
          tool={tool}
        />
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
