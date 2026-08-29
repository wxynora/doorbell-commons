import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { BoundFarmField } from "../../auth/auth-client";
import {
  type CreateFarmPurchaseRequestInput,
  farmPurchaseRequestIssueMessage,
} from "../../auth/farm-purchase-request-client";
import type { KitchenCookInput } from "../../auth/kitchen-cook-client";
import {
  type KitchenPurchaseInput,
  kitchenPurchaseIssueMessage,
} from "../../auth/kitchen-purchase-client";
import {
  type KitchenShopRefreshInput,
  kitchenShopRefreshIssueMessage,
} from "../../auth/kitchen-shop-refresh-client";
import { type FarmSceneId, NEIGHBORHOOD_OPTIONS } from "../dev/farm-tool-layouts";
import { getFarmAssetUrl, getFarmEnvironmentAssetUrl } from "../farm-asset-manifest";
import {
  getRanchAnimalPlacementStyle,
  getRanchAnimalSpriteStyle,
  getRanchSkinPlacementStyle,
  getRanchSkinSpriteStyle,
  RANCH_LIMITED_SKINS,
  RANCH_SCENE_DEMO_LAYOUTS,
  RANCH_SHOP_ANIMALS,
} from "../panels/ranch-animal-data";
import type {
  CookingCartCheckoutFeedback,
  CookingCartCheckoutLine,
  CookingShopRefreshFeedback,
  FarmCartCheckoutFeedback,
  FarmCartCheckoutLine,
} from "../panels/shop-panel";
import type {
  CropCodexActionExecutor,
  ExpeditionActionExecutor,
  FarmSettingsActionExecutor,
  KitchenInventoryActionExecutor,
  MarketActionExecutor,
  OriginalPlantActionExecutor,
  RanchInteractionActionExecutor,
  SmeltingActionExecutor,
} from "../panels/tool-panel";
import type { NeighborhoodMessageActionExecutor } from "../scenes/neighborhood/neighborhood-scene";
import type { RanchSceneAnimalDefinition } from "../scenes/ranch/ranch-scene";
import {
  FarmHarvestNotice,
  FarmHarvestReceipt,
  FieldSceneOverlay,
  RanchCollectionControl,
  RanchCollectionNotice,
  RanchCollectionReceipt,
} from "./action-feedback";
import {
  FarmEnvironmentStatus,
  FarmIdentityPlaque,
  FarmToolBar,
  NEIGHBORHOOD_EMPTY_LABELS,
  SCENE_OPTIONS,
  SceneBalance,
  SceneTabs,
} from "./chrome";
import {
  COOKING_PREP_SLOT_IDS,
  COOKING_TOOL_LAYOUTS,
  type CookingMethodId,
  DEFAULT_COOKING_METHOD,
  getCookingToolLayoutId,
  getVisibleCookingMethods,
  toRawKitchenCookItemRef,
} from "./cooking/model";
import { CookingPrepOverlay } from "./cooking/prep-overlay";
import {
  createEmptyShopCarts,
  createInitialFarmReadResources,
  createInitialSceneUiStates,
  EMPTY_SHOP_CART,
  FARM_READ_RESOURCE_LABELS,
  type FarmHarvestActionState,
  type FarmPurchaseRequestActionState,
  type FarmPurchaseRequestExecutor,
  type FarmPurchaseRequestResult,
  type FarmReadResources,
  type FarmSceneUiState,
  type FarmSceneUiStateMap,
  type FarmSettingsDraft,
  getSceneReadResource,
  getToolReadResource,
  type KitchenCookActionState,
  type KitchenCookExecutor,
  type KitchenPurchaseActionState,
  type KitchenPurchaseExecutor,
  type KitchenPurchaseResult,
  type KitchenShopRefreshActionState,
  type KitchenShopRefreshExecutor,
  type KitchenShopRefreshResult,
  type OriginalPlantDraft,
  type RanchCollectionAttempt,
  type RanchCollectionExecutor,
  type RanchCollectionResult,
  type RanchCollectionState,
  type RanchDecorationActionExecutor,
  type ShopCartSceneId,
  type ShopCartState,
  shouldRetryFarmPurchaseRequest,
  shouldRetryKitchenCook,
  shouldRetryKitchenPurchase,
  shouldRetryKitchenShopRefresh,
  shouldRetryRanchCollection,
} from "./model";
import {
  getLiveRanchResidents,
  getLiveRanchSceneLayout,
  type LiveRanchResidentView,
  type RanchResidentActionExecutor,
  RanchResidentDetail,
} from "./ranch-resident-detail";

const FieldScene = lazy(async () => {
  const module = await import("../scenes/field/field-scene");
  return { default: module.FieldScene };
});

const RanchScene = lazy(async () => {
  const module = await import("../scenes/ranch/ranch-scene");
  return { default: module.RanchScene };
});

const CookingScene = lazy(async () => {
  const module = await import("../scenes/cooking/cooking-scene");
  return { default: module.CookingScene };
});

const NeighborhoodScene = lazy(async () => {
  const module = await import("../scenes/neighborhood/neighborhood-scene");
  return { default: module.NeighborhoodScene };
});

const DingdongBulletin = lazy(async () => {
  const module = await import("../panels/bulletin-panel");
  return { default: module.DingdongBulletin };
});

const FarmToolPanel = lazy(async () => {
  const module = await import("../panels/tool-panel");
  return { default: module.FarmToolPanel };
});

export function FarmFieldContent({
  data,
  harvestAction = { stage: "idle" },
  onCloseHarvestAction,
  onCropCodexAction,
  onExpeditionAction,
  onFarmPurchaseRequest,
  onHarvestAssist,
  onFarmSettingsAction,
  onKitchenInventoryAction,
  onKitchenCook,
  onKitchenPurchase,
  onKitchenShopRefresh,
  onMarketAction,
  onNeighborhoodMessageAction,
  onOriginalPlantAction,
  onRanchCollection,
  onRanchDecorationAction,
  onRanchInteractionAction,
  onRanchResidentAction,
  onSmeltingAction,
  onReloadAfterHarvestError,
  onReloadRanch,
  onRequireResource,
  onRetryHarvestAssist,
  preview = false,
  resources = createInitialFarmReadResources(),
  settingsInitializationKey = 0,
}: {
  data: BoundFarmField;
  harvestAction?: FarmHarvestActionState;
  onCloseHarvestAction?: () => void;
  onCropCodexAction?: CropCodexActionExecutor | undefined;
  onExpeditionAction?: ExpeditionActionExecutor | undefined;
  onFarmPurchaseRequest?: FarmPurchaseRequestExecutor | undefined;
  onHarvestAssist?: (() => void) | undefined;
  onFarmSettingsAction?: FarmSettingsActionExecutor | undefined;
  onKitchenInventoryAction?: KitchenInventoryActionExecutor | undefined;
  onKitchenCook?: KitchenCookExecutor | undefined;
  onKitchenPurchase?: KitchenPurchaseExecutor | undefined;
  onKitchenShopRefresh?: KitchenShopRefreshExecutor | undefined;
  onMarketAction?: MarketActionExecutor | undefined;
  onNeighborhoodMessageAction?: NeighborhoodMessageActionExecutor | undefined;
  onOriginalPlantAction?: OriginalPlantActionExecutor | undefined;
  onRanchCollection?: RanchCollectionExecutor | undefined;
  onRanchDecorationAction?: RanchDecorationActionExecutor | undefined;
  onRanchInteractionAction?: RanchInteractionActionExecutor | undefined;
  onRanchResidentAction?: RanchResidentActionExecutor | undefined;
  onSmeltingAction?: SmeltingActionExecutor | undefined;
  onReloadAfterHarvestError?: () => void;
  onReloadRanch?: (() => void) | undefined;
  onRequireResource?: (resource: keyof FarmReadResources) => void;
  onRetryHarvestAssist?: () => void;
  preview?: boolean;
  resources?: FarmReadResources;
  settingsInitializationKey?: number;
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
  const [ranchCollectionAction, setRanchCollectionAction] = useState<RanchCollectionState>({
    stage: "idle",
  });
  const [sceneUiStates, setSceneUiStates] = useState<FarmSceneUiStateMap>(() =>
    createInitialSceneUiStates(),
  );
  const [shopCarts, setShopCarts] = useState<ShopCartState>(() => createEmptyShopCarts());
  const [kitchenPurchaseAction, setKitchenPurchaseAction] = useState<KitchenPurchaseActionState>({
    stage: "idle",
  });
  const [farmPurchaseRequestActions, setFarmPurchaseRequestActions] = useState<
    Record<"field" | "ranch", FarmPurchaseRequestActionState>
  >({ field: { stage: "idle" }, ranch: { stage: "idle" } });
  const [kitchenShopRefreshAction, setKitchenShopRefreshAction] =
    useState<KitchenShopRefreshActionState>({ stage: "idle" });
  const [kitchenCookAction, setKitchenCookAction] = useState<KitchenCookActionState>({
    stage: "idle",
  });
  const hasRetryableKitchenPurchaseAttempt =
    kitchenPurchaseAction.stage === "error" && kitchenPurchaseAction.attempt !== null;
  const isKitchenPurchaseCartLocked =
    kitchenPurchaseAction.stage === "submitting" || hasRetryableKitchenPurchaseAttempt;
  const [originalPlantDraft, setOriginalPlantDraft] = useState<OriginalPlantDraft>(() => ({
    description: "",
    harvestText: "",
    latinName: "",
    name: "",
    sowingText: "",
  }));
  const [settingsDraft, setSettingsDraft] = useState<FarmSettingsDraft>(() => ({
    activeTitle: field.farm.equipped_title?.title_id ?? "",
    aiNickname: "",
    farmName: field.farm.farm_name,
    humanNickname: "",
    messagesAllowed: null,
    theftAllowed: null,
    visitsAllowed: null,
    wateringHelpAllowed: null,
    welcomeMessage: field.farm.welcome_message ?? "",
  }));
  const settingsCatalogInitializationRef = useRef<{
    key: number;
    revision: string;
  } | null>(null);
  useEffect(() => {
    const settings = farmCatalog?.data.settings;
    if (
      preview ||
      settings?.status !== "available" ||
      !farmCatalog ||
      (settingsCatalogInitializationRef.current?.key === settingsInitializationKey &&
        settingsCatalogInitializationRef.current.revision === farmCatalog.revision)
    ) {
      return;
    }
    settingsCatalogInitializationRef.current = {
      key: settingsInitializationKey,
      revision: farmCatalog.revision,
    };
    setSettingsDraft({
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
    });
  }, [farmCatalog, preview, settingsInitializationKey]);
  const selectedPlot = field.plots.find((plot) => plot.plot_id === selectedPlotId) ?? null;
  const liveRanchResidents = getLiveRanchResidents(ranch);
  const selectedRanchAnimal = preview
    ? (RANCH_SHOP_ANIMALS.find((animal) => animal.id === selectedRanchAnimalId) ?? null)
    : null;
  const selectedLiveRanchResident = preview
    ? null
    : (liveRanchResidents.find((resident) => resident.id === selectedRanchAnimalId) ?? null);
  const ranchCollectableCount =
    ranch?.data.collectable.status === "available"
      ? (ranch.data.collectable.total_pending_count ?? 0) +
        (ranch.data.collectable.total_pending_meat_count ?? 0)
      : 0;
  const activeSceneUiState = sceneUiStates[activeScene];
  const activeResourceKey = activeSceneUiState.bulletinOpen
    ? "bulletin"
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
    : liveRanchResidents.map((resident, index) => {
        const skinId = RANCH_LIMITED_SKINS.find(
          (skin) => skin.id === resident.resident.variants?.current_variant_id,
        )?.id;
        return {
          id: resident.id,
          layout: getLiveRanchSceneLayout(index, liveRanchResidents.length),
          name: resident.resident.identity.custom_name ?? resident.resident.identity.name ?? "",
          placementStyle: skinId
            ? getRanchSkinPlacementStyle()
            : getRanchAnimalPlacementStyle(resident.spriteAnimal),
          spriteStyle: skinId
            ? getRanchSkinSpriteStyle(skinId)
            : getRanchAnimalSpriteStyle(resident.spriteAnimal),
          staticSprite: skinId !== undefined,
        };
      });
  const visibleCookingMethods = getVisibleCookingMethods(preview, kitchen);
  const selectedCookingMethod =
    visibleCookingMethods.find((method) => method.id === selectedCookingMethodId) ??
    DEFAULT_COOKING_METHOD;
  const selectedCookingLayout =
    COOKING_TOOL_LAYOUTS[getCookingToolLayoutId(selectedCookingMethod.id)];
  const cookingCheckoutFeedback: CookingCartCheckoutFeedback =
    kitchenPurchaseAction.stage === "submitting"
      ? { stage: "submitting" }
      : kitchenPurchaseAction.stage === "success"
        ? {
            stage: "success",
            itemCount: kitchenPurchaseAction.result.items.reduce(
              (sum, item) => sum + item.quantity,
              0,
            ),
            totalPriceSilver: kitchenPurchaseAction.result.total_price_silver,
          }
        : kitchenPurchaseAction.stage === "error"
          ? {
              stage: "error",
              message: kitchenPurchaseIssueMessage(kitchenPurchaseAction.issue),
              retryable: hasRetryableKitchenPurchaseAttempt,
            }
          : { stage: "idle" };
  const cookingShopRefreshFeedback: CookingShopRefreshFeedback =
    kitchenShopRefreshAction.stage === "submitting"
      ? { stage: "submitting" }
      : kitchenShopRefreshAction.stage === "error"
        ? {
            stage: "error",
            message: kitchenShopRefreshIssueMessage(kitchenShopRefreshAction.issue),
            retryable: kitchenShopRefreshAction.attempt !== null,
          }
        : kitchenShopRefreshAction.stage === "success"
          ? { stage: "success" }
          : { stage: "idle" };

  const getFarmCheckoutFeedback = (sceneId: "field" | "ranch"): FarmCartCheckoutFeedback => {
    const action = farmPurchaseRequestActions[sceneId];
    if (action.stage === "submitting") return { stage: "submitting" };
    if (action.stage === "error") {
      return {
        stage: "error",
        message: farmPurchaseRequestIssueMessage(action.issue),
        retryable: action.attempt !== null,
      };
    }
    if (action.stage === "success") return { stage: "success" };
    return { stage: "idle" };
  };

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
      if (sceneId === "cooking") {
        if (isKitchenPurchaseCartLocked) {
          return;
        }
        setKitchenPurchaseAction({ stage: "idle" });
      } else {
        const requestAction = farmPurchaseRequestActions[sceneId];
        if (
          requestAction.stage === "submitting" ||
          (requestAction.stage === "error" && requestAction.attempt !== null)
        ) {
          return;
        }
        setFarmPurchaseRequestActions((current) => ({
          ...current,
          [sceneId]: { stage: "idle" },
        }));
      }
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
    [farmPurchaseRequestActions, isKitchenPurchaseCartLocked],
  );

  const submitFarmPurchaseRequest = useCallback(
    async (
      sceneId: "field" | "ranch",
      items: FarmCartCheckoutLine[],
      retryAttempt?: CreateFarmPurchaseRequestInput,
    ): Promise<void> => {
      if (preview || !onFarmPurchaseRequest) return;
      const shopRevision =
        sceneId === "field"
          ? farmCatalog?.data.shop.status === "available"
            ? farmCatalog.data.shop.revision
            : null
          : (ranch?.revision ?? null);
      if (!shopRevision) return;
      const attempt =
        retryAttempt ??
        ({
          idempotencyKey: crypto.randomUUID(),
          shop: sceneId,
          shopRevision,
          items: items.map((item) => ({ ...item })),
        } satisfies CreateFarmPurchaseRequestInput);
      if (attempt.items.length === 0) return;

      setFarmPurchaseRequestActions((current) => ({
        ...current,
        [sceneId]: { stage: "submitting", attempt },
      }));
      let result: FarmPurchaseRequestResult;
      try {
        result = await onFarmPurchaseRequest(attempt);
      } catch {
        setFarmPurchaseRequestActions((current) => ({
          ...current,
          [sceneId]: {
            stage: "error",
            attempt,
            issue: {
              code: "unexpected_response",
              currentShopRevision: null,
              serverMessage: null,
            },
          },
        }));
        return;
      }

      if (result.ok) {
        setShopCarts((current) => ({ ...current, [sceneId]: {} }));
        setFarmPurchaseRequestActions((current) => ({
          ...current,
          [sceneId]: { stage: "success" },
        }));
        return;
      }
      if (result.issue.code === "shop_changed" || result.issue.code === "state_conflict") {
        setShopCarts((current) => ({ ...current, [sceneId]: {} }));
        setFarmPurchaseRequestActions((current) => ({
          ...current,
          [sceneId]: { stage: "idle" },
        }));
        return;
      }
      setFarmPurchaseRequestActions((current) => ({
        ...current,
        [sceneId]: {
          stage: "error",
          attempt: shouldRetryFarmPurchaseRequest(result.issue) ? attempt : null,
          issue: result.issue,
        },
      }));
    },
    [farmCatalog, onFarmPurchaseRequest, preview, ranch],
  );

  const submitKitchenPurchase = useCallback(
    async (
      items: CookingCartCheckoutLine[],
      retryAttempt?: KitchenPurchaseInput,
    ): Promise<void> => {
      if (preview || !kitchen || !onKitchenPurchase) return;
      const attempt =
        retryAttempt ??
        ({
          expectedShopRevision: kitchen.shop_revision,
          idempotencyKey: crypto.randomUUID(),
          items: items.map((item) => ({ ...item })),
        } satisfies KitchenPurchaseInput);
      if (attempt.items.length === 0) return;

      setKitchenPurchaseAction({ stage: "submitting", attempt });
      let result: KitchenPurchaseResult;
      try {
        result = await onKitchenPurchase(attempt);
      } catch {
        setKitchenPurchaseAction({
          stage: "error",
          attempt,
          issue: {
            code: "unexpected_response",
            currentShopRevision: null,
            serverMessage: null,
          },
        });
        return;
      }

      if (result.ok) {
        setShopCarts((current) => ({ ...current, cooking: {} }));
        setKitchenPurchaseAction({ stage: "success", result: result.data.data.result });
        return;
      }
      if (result.issue.code === "shop_changed" || result.issue.code === "state_conflict") {
        setShopCarts((current) => ({ ...current, cooking: {} }));
        setKitchenPurchaseAction({ stage: "idle" });
        return;
      }
      setKitchenPurchaseAction({
        stage: "error",
        attempt: shouldRetryKitchenPurchase(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [kitchen, onKitchenPurchase, preview],
  );

  const submitKitchenShopRefresh = useCallback(
    async (retryAttempt?: KitchenShopRefreshInput): Promise<void> => {
      if (
        preview ||
        !kitchen ||
        kitchen.data.daily_shop.status !== "available" ||
        !onKitchenShopRefresh
      ) {
        return;
      }
      const attempt =
        retryAttempt ??
        ({
          expectedShopRevision: kitchen.shop_revision,
          idempotencyKey: crypto.randomUUID(),
        } satisfies KitchenShopRefreshInput);
      setKitchenShopRefreshAction({ stage: "submitting", attempt });
      let result: KitchenShopRefreshResult;
      try {
        result = await onKitchenShopRefresh(attempt);
      } catch {
        setKitchenShopRefreshAction({
          stage: "error",
          attempt,
          issue: {
            code: "unexpected_response",
            currentShopRevision: null,
            serverMessage: null,
          },
        });
        return;
      }
      if (result.ok) {
        setKitchenShopRefreshAction({ stage: "success" });
        return;
      }
      setKitchenShopRefreshAction({
        stage: "error",
        attempt: shouldRetryKitchenShopRefresh(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [kitchen, onKitchenShopRefresh, preview],
  );

  const submitKitchenCook = useCallback(
    async (retryAttempt?: KitchenCookInput): Promise<void> => {
      if (preview || !kitchen || !onKitchenCook) return;
      const attempt =
        retryAttempt ??
        ({
          expectedFarmDoorplate: field.farm.farm_doorplate,
          expectedKitchenInventoryRevision: kitchen.kitchen_inventory_revision,
          idempotencyKey: crypto.randomUUID(),
          items: selectedCookingIngredientIds.map(toRawKitchenCookItemRef),
        } satisfies KitchenCookInput);
      if (attempt.items.length < 2 || attempt.items.length > 5) return;

      setKitchenCookAction({ stage: "submitting", attempt });
      let result: Awaited<ReturnType<KitchenCookExecutor>>;
      try {
        result = await onKitchenCook(attempt);
      } catch {
        setKitchenCookAction({
          stage: "error",
          attempt,
          issue: {
            code: "unexpected_response",
            currentKitchenInventoryRevision: null,
            serverMessage: null,
          },
        });
        return;
      }
      if (result.ok) {
        setSelectedCookingIngredientIds([]);
        setKitchenCookAction({
          stage: "success",
          outcome: result.data.data.result.outcome,
        });
        return;
      }
      setKitchenCookAction({
        stage: "error",
        attempt: shouldRetryKitchenCook(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [field.farm.farm_doorplate, kitchen, onKitchenCook, preview, selectedCookingIngredientIds],
  );

  const submitRanchCollection = useCallback(
    async (retryAttempt?: RanchCollectionAttempt) => {
      if (preview || !ranch || !onRanchCollection) return;
      const attempt =
        retryAttempt ??
        ({
          expectedRevision: ranch.revision,
          idempotencyKey: crypto.randomUUID(),
        } satisfies RanchCollectionAttempt);
      setRanchCollectionAction({ stage: "submitting", attempt });
      let result: RanchCollectionResult;
      try {
        result = await onRanchCollection(attempt);
      } catch {
        setRanchCollectionAction({
          stage: "error",
          attempt,
          issue: { code: "unexpected_response", currentRevision: null, serverMessage: null },
        });
        return;
      }
      if (result.ok) {
        setRanchCollectionAction({ stage: "success", result: result.data.data.result });
        return;
      }
      setRanchCollectionAction({
        stage: "error",
        attempt: shouldRetryRanchCollection(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [onRanchCollection, preview, ranch],
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
                  backgroundUrl={getFarmEnvironmentAssetUrl(
                    "field",
                    field.season.id,
                    field.weather?.condition ?? null,
                  )}
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
                  backgroundUrl={getFarmEnvironmentAssetUrl(
                    "ranch",
                    field.season.id,
                    field.weather?.condition ?? null,
                  )}
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
                  onMessageAction={onNeighborhoodMessageAction}
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
        <>
          <FarmIdentityPlaque
            farmDoorplate={field.farm.farm_doorplate}
            farmName={field.farm.farm_name}
          />
          <FarmEnvironmentStatus
            landName={field.land.name}
            landTier={field.land.tier}
            seasonName={field.season.name}
          />
        </>
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
      {activeScene === "ranch" &&
      !activeSceneUiState.selectedTool &&
      !activeSceneUiState.bulletinOpen &&
      !selectedLiveRanchResident &&
      ranchCollectableCount > 0 &&
      onRanchCollection ? (
        <RanchCollectionControl
          count={ranchCollectableCount}
          onCollect={() => void submitRanchCollection()}
          submitting={ranchCollectionAction.stage === "submitting"}
        />
      ) : null}
      {activeScene === "ranch" && ranchCollectionAction.stage === "success" ? (
        <RanchCollectionReceipt
          onClose={() => setRanchCollectionAction({ stage: "idle" })}
          result={ranchCollectionAction.result}
        />
      ) : null}
      {activeScene === "ranch" && ranchCollectionAction.stage === "error" ? (
        <RanchCollectionNotice
          action={ranchCollectionAction}
          onClose={() => setRanchCollectionAction({ stage: "idle" })}
          onReload={() => onReloadRanch?.()}
          onRetry={() => {
            if (ranchCollectionAction.attempt) {
              void submitRanchCollection(ranchCollectionAction.attempt);
            }
          }}
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
          cookAction={kitchenCookAction}
          ingredientPickerOpen={cookingIngredientPickerOpen}
          kitchen={kitchen}
          onCloseIngredientPicker={() => setCookingIngredientPickerOpen(false)}
          onCloseCookResult={() => setKitchenCookAction({ stage: "idle" })}
          onCook={() => void submitKitchenCook()}
          onOpenIngredientPicker={() => setCookingIngredientPickerOpen(true)}
          onRemoveIngredient={(slotIndex) =>
            setSelectedCookingIngredientIds((current) =>
              current.filter((_, index) => index !== slotIndex),
            )
          }
          onRetryCook={() => {
            if (kitchenCookAction.stage === "error" && kitchenCookAction.attempt) {
              void submitKitchenCook(kitchenCookAction.attempt);
            }
          }}
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
          onAction={onRanchResidentAction}
          onClose={() => setSelectedRanchAnimalId(null)}
          onReload={onReloadRanch}
          ranch={ranch}
          view={
            selectedRanchAnimal
              ? { kind: "preview", animal: selectedRanchAnimal }
              : { kind: "live", resident: selectedLiveRanchResident as LiveRanchResidentView }
          }
        />
      ) : null}

      {SCENE_OPTIONS.map((scene) => {
        const sceneState = sceneUiStates[scene.id];
        const purchaseSceneId = scene.id === "field" || scene.id === "ranch" ? scene.id : null;
        return (
          <div
            className="farm-page-state-layer"
            hidden={scene.id !== activeScene}
            key={`farm-page-state-${scene.id}`}
          >
            <Suspense fallback={null}>
              {sceneState.bulletinOpen ? (
                <DingdongBulletin
                  bulletin={resources.bulletin.stage === "ready" ? resources.bulletin.data : null}
                  onClose={() => updateSceneUiState(scene.id, { bulletinOpen: false })}
                  preview={preview}
                  sceneId={scene.id}
                />
              ) : null}
              {sceneState.selectedTool ? (
                <FarmToolPanel
                  activeScene={scene.id}
                  cart={scene.id === "neighborhood" ? EMPTY_SHOP_CART : shopCarts[scene.id]}
                  cookingCheckoutFeedback={cookingCheckoutFeedback}
                  cookingShopRefreshFeedback={cookingShopRefreshFeedback}
                  farmCheckoutFeedback={
                    purchaseSceneId ? getFarmCheckoutFeedback(purchaseSceneId) : undefined
                  }
                  farmCatalog={farmCatalog}
                  kitchen={kitchen}
                  key={`${scene.id}-${sceneState.selectedTool.id}`}
                  onClose={() => updateSceneUiState(scene.id, { selectedTool: null })}
                  onChangeCartQuantity={(cartKey, delta, maxQuantity) => {
                    if (scene.id !== "neighborhood") {
                      changeShopCartQuantity(scene.id, cartKey, delta, maxQuantity);
                    }
                  }}
                  onCheckoutCookingCart={
                    onKitchenPurchase
                      ? (items) => {
                          void submitKitchenPurchase(items);
                        }
                      : undefined
                  }
                  onCheckoutFarmCart={
                    purchaseSceneId && onFarmPurchaseRequest
                      ? (items) => {
                          void submitFarmPurchaseRequest(purchaseSceneId, items);
                        }
                      : undefined
                  }
                  onChangeOriginalPlantDraft={setOriginalPlantDraft}
                  onChangeSettingsDraft={setSettingsDraft}
                  onCropCodexAction={onCropCodexAction}
                  onExpeditionAction={onExpeditionAction}
                  onFarmSettingsAction={onFarmSettingsAction}
                  onKitchenInventoryAction={onKitchenInventoryAction}
                  onMarketAction={onMarketAction}
                  onOriginalPlantAction={onOriginalPlantAction}
                  onRanchDecorationAction={onRanchDecorationAction}
                  onRanchInteractionAction={onRanchInteractionAction}
                  onSmeltingAction={onSmeltingAction}
                  onRetryCookingCheckout={() => {
                    if (kitchenPurchaseAction.stage === "error" && kitchenPurchaseAction.attempt) {
                      void submitKitchenPurchase([], kitchenPurchaseAction.attempt);
                    }
                  }}
                  onRetryFarmCheckout={
                    purchaseSceneId
                      ? () => {
                          const action = farmPurchaseRequestActions[purchaseSceneId];
                          if (action.stage !== "error") return;
                          if (action.attempt) {
                            void submitFarmPurchaseRequest(purchaseSceneId, [], action.attempt);
                          }
                        }
                      : undefined
                  }
                  onRefreshCookingShop={() => {
                    if (
                      kitchenShopRefreshAction.stage === "error" &&
                      kitchenShopRefreshAction.attempt
                    ) {
                      void submitKitchenShopRefresh(kitchenShopRefreshAction.attempt);
                      return;
                    }
                    void submitKitchenShopRefresh();
                  }}
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
            onRequireResource?.("bulletin");
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
