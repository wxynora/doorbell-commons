import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBoundFarmField,
  harvestBoundFarmField,
  upgradeBoundFarmLand,
} from "../../auth/auth-client";
import {
  type BoundBulletinRead,
  bulletinIssueMessage,
  getBoundBulletin,
} from "../../auth/bulletin-client";
import { executeBoundCropCodexAction } from "../../auth/crop-codex-action-client";
import { executeBoundExpeditionAction } from "../../auth/expedition-action-client";
import { farmCatalogIssueMessage, getBoundFarmCatalog } from "../../auth/farm-catalog-client";
import { createBoundFarmPurchaseRequest } from "../../auth/farm-purchase-request-client";
import { executeBoundFarmSettingsAction } from "../../auth/farm-settings-action-client";
import { getBoundKitchen, kitchenIssueMessage } from "../../auth/kitchen-client";
import { executeBoundKitchenCook } from "../../auth/kitchen-cook-client";
import { executeBoundKitchenInventoryAction } from "../../auth/kitchen-inventory-action-client";
import { purchaseBoundKitchenItem } from "../../auth/kitchen-purchase-client";
import { refreshBoundKitchenShop } from "../../auth/kitchen-shop-refresh-client";
import { executeBoundMarketAction } from "../../auth/market-action-client";
import { executeBoundNeighborhoodMessage } from "../../auth/neighborhood-message-action-client";
import { executeBoundOriginalPlantAction } from "../../auth/original-plant-action-client";
import {
  executeBoundRanchResidentAction,
  type RanchResidentActionInput,
} from "../../auth/ranch-action-client";
import { getBoundRanch, ranchIssueMessage } from "../../auth/ranch-client";
import { collectBoundRanch } from "../../auth/ranch-collection-client";
import { executeBoundRanchDecorationAction } from "../../auth/ranch-decoration-action-client";
import { executeBoundRanchInteractionAction } from "../../auth/ranch-interaction-action-client";
import { executeBoundSmeltingAction } from "../../auth/smelting-action-client";
import { farmFieldIssueMessage } from "../farm-overview";
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
import { BackIcon, RefreshIcon } from "./chrome";
import { FarmFieldContent } from "./farm-field-content";
import {
  createInitialFarmReadResources,
  type FarmHarvestActionState,
  type FarmHarvestAttempt,
  type FarmLandUpgradeActionState,
  type FarmLandUpgradeAttempt,
  type FarmPageProps,
  type FarmPageState,
  type FarmPurchaseRequestExecutor,
  type FarmReadResources,
  type KitchenCookExecutor,
  type KitchenPurchaseExecutor,
  type KitchenShopRefreshExecutor,
  type RanchCollectionExecutor,
  type RanchDecorationActionExecutor,
  type RanchResidentActionResult,
  shouldRetryFarmHarvest,
  shouldRetryFarmLandUpgrade,
} from "./model";

export function LiveFarmPage({ onBack, previewData }: FarmPageProps) {
  const [state, setState] = useState<FarmPageState>(
    previewData ? { stage: "ready", data: previewData } : { stage: "loading" },
  );
  const [resources, setResources] = useState<FarmReadResources>(() =>
    createInitialFarmReadResources(),
  );
  const [settingsInitializationKey, setSettingsInitializationKey] = useState(0);
  const [harvestAction, setHarvestAction] = useState<FarmHarvestActionState>({ stage: "idle" });
  const [landUpgradeAction, setLandUpgradeAction] = useState<FarmLandUpgradeActionState>({
    stage: "idle",
  });
  const fieldDoorplateRef = useRef(previewData?.data.farm.farm_doorplate ?? null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const fieldRequestGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const resourceControllersRef = useRef<Partial<Record<keyof FarmReadResources, AbortController>>>(
    {},
  );
  const requestedResourcesRef = useRef<Set<keyof FarmReadResources>>(new Set());

  const requireResource = useCallback(
    (resource: keyof FarmReadResources, force = false) => {
      if (previewData || (!force && requestedResourcesRef.current.has(resource))) {
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

      if (resource === "bulletin") {
        const expectedFarmDoorplate = fieldDoorplateRef.current;
        if (!expectedFarmDoorplate) {
          requestedResourcesRef.current.delete(resource);
          return;
        }
        void getBoundBulletin({
          expectedFarmDoorplate,
          signal: controller.signal,
        }).then((result) => {
          if (controller.signal.aborted) return;
          if (!result.ok) requestedResourcesRef.current.delete(resource);
          setResources((current) => ({
            ...current,
            bulletin: result.ok
              ? { stage: "ready", data: result.data satisfies BoundBulletinRead }
              : { stage: "error", message: bulletinIssueMessage(result.issue) },
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

  const refreshField = useCallback(
    async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
      if (previewData) return;
      requestControllerRef.current?.abort();
      const controller = new AbortController();
      const generation = fieldRequestGenerationRef.current + 1;
      fieldRequestGenerationRef.current = generation;
      requestControllerRef.current = controller;
      if (showLoading) setState({ stage: "loading" });

      const result = await getBoundFarmField({ signal: controller.signal });
      if (
        controller.signal.aborted ||
        generation !== fieldRequestGenerationRef.current ||
        !mountedRef.current
      ) {
        return;
      }
      if (result.ok) {
        fieldDoorplateRef.current = result.data.data.farm.farm_doorplate;
      }
      setState(
        result.ok ? { stage: "ready", data: result.data } : { stage: "error", issue: result.issue },
      );
    },
    [previewData],
  );

  const refreshRequestedResources = useCallback(() => {
    const requestedResources = [...requestedResourcesRef.current];
    if (requestedResources.includes("farmCatalog")) {
      setSettingsInitializationKey((current) => current + 1);
    }
    for (const resource of requestedResources) {
      requireResource(resource, true);
    }
  }, [requireResource]);

  const invalidateAfterFarmMutation = useCallback(async () => {
    await refreshField();
    refreshRequestedResources();
  }, [refreshField, refreshRequestedResources]);

  const submitRanchResidentAction = useCallback(
    async (input: RanchResidentActionInput): Promise<RanchResidentActionResult> => {
      const result = await executeBoundRanchResidentAction(input);
      if (result.ok) {
        setResources((current) => ({
          ...current,
          ranch: {
            stage: "ready",
            data: {
              data: result.data.data.resource,
              revision: result.data.revision,
              server_time: result.data.server_time,
            },
          },
        }));
        await invalidateAfterFarmMutation();
      }
      return result;
    },
    [invalidateAfterFarmMutation],
  );

  const submitRanchCollectionAction = useCallback<RanchCollectionExecutor>(
    async (input) => {
      const result = await collectBoundRanch(input);
      if (result.ok) {
        setResources((current) => ({
          ...current,
          ranch: {
            stage: "ready",
            data: {
              data: result.data.data.resource,
              revision: result.data.revision,
              server_time: result.data.server_time,
            },
          },
        }));
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("ranch", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitRanchDecorationAction = useCallback<RanchDecorationActionExecutor>(
    async (input) => {
      const result = await executeBoundRanchDecorationAction(input);
      if (result.ok) {
        setResources((current) => ({
          ...current,
          ranch: {
            stage: "ready",
            data: {
              data: result.data.data.resource,
              revision: result.data.revision,
              server_time: result.data.server_time,
            },
          },
        }));
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("ranch", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitExpeditionAction = useCallback<ExpeditionActionExecutor>(
    async (input) => {
      const result = await executeBoundExpeditionAction(input);
      if (result.ok) {
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitCropCodexAction = useCallback<CropCodexActionExecutor>(
    async (input) => {
      const result = await executeBoundCropCodexAction(input);
      if (result.ok) {
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitSmeltingAction = useCallback<SmeltingActionExecutor>(
    async (input) => {
      const result = await executeBoundSmeltingAction(input);
      if (result.ok) {
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitMarketAction = useCallback<MarketActionExecutor>(
    async (input) => {
      const result = await executeBoundMarketAction(input);
      if (result.ok) {
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitRanchInteractionAction = useCallback<RanchInteractionActionExecutor>(
    async (input) => {
      const result = await executeBoundRanchInteractionAction(input);
      if (result.ok) {
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("ranch", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitOriginalPlantAction = useCallback<OriginalPlantActionExecutor>(
    async (input) => {
      const result = await executeBoundOriginalPlantAction(input);
      if (result.ok) {
        setState((current) =>
          current.stage === "ready"
            ? {
                stage: "ready",
                data: {
                  ...current.data,
                  data: {
                    ...current.data.data,
                    balance: { farm_coins: result.data.data.result.coins_balance },
                  },
                },
              }
            : current,
        );
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitNeighborhoodMessageAction = useCallback<NeighborhoodMessageActionExecutor>(
    async (input) => {
      const result = await executeBoundNeighborhoodMessage(input);
      if (result.ok || result.issue.code === "state_conflict") {
        if (result.ok) {
          await invalidateAfterFarmMutation();
        } else {
          requireResource("farmCatalog", true);
        }
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitKitchenInventoryAction = useCallback<KitchenInventoryActionExecutor>(
    async (input) => {
      const result = await executeBoundKitchenInventoryAction(input);
      if (result.ok) {
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("kitchen", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitFarmSettingsAction = useCallback<FarmSettingsActionExecutor>(
    async (input) => {
      const result = await executeBoundFarmSettingsAction(input);
      if (result.ok) {
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitFarmPurchaseRequestAction = useCallback<FarmPurchaseRequestExecutor>(
    async (input) => {
      const result = await createBoundFarmPurchaseRequest(input);
      if (
        !result.ok &&
        (result.issue.code === "shop_changed" || result.issue.code === "state_conflict")
      ) {
        requireResource(input.shop === "field" ? "farmCatalog" : "ranch", true);
      }
      return result;
    },
    [requireResource],
  );

  const submitKitchenPurchaseAction = useCallback<KitchenPurchaseExecutor>(
    async (input) => {
      const result = await purchaseBoundKitchenItem(input);
      if (result.ok) {
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "shop_changed" || result.issue.code === "state_conflict") {
        requireResource("kitchen", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitKitchenShopRefreshAction = useCallback<KitchenShopRefreshExecutor>(
    async (input) => {
      const result = await refreshBoundKitchenShop(input);
      if (result.ok) {
        setState((current) =>
          current.stage === "ready"
            ? {
                stage: "ready",
                data: {
                  ...current.data,
                  data: {
                    ...current.data.data,
                    balance: {
                      farm_coins: result.data.data.result.coins_balance,
                    },
                  },
                },
              }
            : current,
        );
        await invalidateAfterFarmMutation();
      } else if (
        result.issue.code === "state_conflict" ||
        result.issue.code === "shop_unavailable"
      ) {
        requireResource("kitchen", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const submitKitchenCookAction = useCallback<KitchenCookExecutor>(
    async (input) => {
      const result = await executeBoundKitchenCook(input);
      if (result.ok) {
        setResources((current) => {
          if (current.kitchen.stage !== "ready") return current;
          return {
            ...current,
            kitchen: {
              stage: "ready",
              data: {
                data: result.data.data.resource,
                kitchen_inventory_revision: result.data.kitchen_inventory_revision,
                shop_revision: current.kitchen.data.shop_revision,
                server_time: result.data.server_time,
              },
            },
          };
        });
        await invalidateAfterFarmMutation();
      } else if (result.issue.code === "state_conflict") {
        requireResource("kitchen", true);
      }
      return result;
    },
    [invalidateAfterFarmMutation, requireResource],
  );

  const reload = useCallback(() => {
    setHarvestAction({ stage: "idle" });
    setLandUpgradeAction({ stage: "idle" });
    if (previewData) {
      setState({ stage: "ready", data: previewData });
      return;
    }
    refreshRequestedResources();
    void refreshField({ showLoading: true });
  }, [previewData, refreshField, refreshRequestedResources]);

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
        refreshRequestedResources();
        return;
      }
      setHarvestAction({
        stage: "error",
        attempt: shouldRetryFarmHarvest(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [previewData, refreshRequestedResources, state],
  );

  const submitLandUpgrade = useCallback(
    async (retryAttempt?: FarmLandUpgradeAttempt) => {
      if (previewData || state.stage !== "ready") {
        return;
      }
      const attempt =
        retryAttempt ??
        ({
          expectedRevision: state.data.revision,
          idempotencyKey: crypto.randomUUID(),
        } satisfies FarmLandUpgradeAttempt);
      setLandUpgradeAction({ stage: "submitting", attempt });
      const result = await upgradeBoundFarmLand(attempt);
      if (result.ok) {
        setState({
          stage: "ready",
          data: {
            data: result.data.data.resource,
            revision: result.data.revision,
            server_time: result.data.server_time,
          },
        });
        setLandUpgradeAction({ stage: "success", result: result.data.data.result });
        refreshRequestedResources();
        return;
      }
      setLandUpgradeAction({
        stage: "error",
        attempt: shouldRetryFarmLandUpgrade(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [previewData, refreshRequestedResources, state],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (previewData) {
      return;
    }
    reload();
    return () => {
      mountedRef.current = false;
      fieldRequestGenerationRef.current += 1;
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
            landUpgradeAction={landUpgradeAction}
            onCloseHarvestAction={() => setHarvestAction({ stage: "idle" })}
            onCloseLandUpgradeAction={() => setLandUpgradeAction({ stage: "idle" })}
            onCropCodexAction={previewData ? undefined : submitCropCodexAction}
            onExpeditionAction={previewData ? undefined : submitExpeditionAction}
            onFarmPurchaseRequest={previewData ? undefined : submitFarmPurchaseRequestAction}
            onHarvestAssist={previewData ? undefined : () => void submitHarvestAssist()}
            onLandUpgrade={previewData ? undefined : () => void submitLandUpgrade()}
            onFarmSettingsAction={previewData ? undefined : submitFarmSettingsAction}
            onKitchenInventoryAction={previewData ? undefined : submitKitchenInventoryAction}
            onKitchenCook={previewData ? undefined : submitKitchenCookAction}
            onKitchenPurchase={previewData ? undefined : submitKitchenPurchaseAction}
            onKitchenShopRefresh={previewData ? undefined : submitKitchenShopRefreshAction}
            onMarketAction={previewData ? undefined : submitMarketAction}
            onNeighborhoodMessageAction={previewData ? undefined : submitNeighborhoodMessageAction}
            onOriginalPlantAction={previewData ? undefined : submitOriginalPlantAction}
            onRanchCollection={previewData ? undefined : submitRanchCollectionAction}
            onRanchDecorationAction={previewData ? undefined : submitRanchDecorationAction}
            onRanchInteractionAction={previewData ? undefined : submitRanchInteractionAction}
            onRanchResidentAction={previewData ? undefined : submitRanchResidentAction}
            onSmeltingAction={previewData ? undefined : submitSmeltingAction}
            onReloadAfterHarvestError={reload}
            onReloadAfterLandUpgradeError={reload}
            onReloadRanch={previewData ? undefined : () => requireResource("ranch", true)}
            onRequireResource={requireResource}
            onRetryHarvestAssist={() => {
              if (harvestAction.stage === "error" && harvestAction.attempt) {
                void submitHarvestAssist(harvestAction.attempt);
              }
            }}
            onRetryLandUpgrade={() => {
              if (landUpgradeAction.stage === "error" && landUpgradeAction.attempt) {
                void submitLandUpgrade(landUpgradeAction.attempt);
              }
            }}
            preview={Boolean(previewData)}
            resources={resources}
            settingsInitializationKey={settingsInitializationKey}
          />
        ) : null}
      </div>
    </main>
  );
}
