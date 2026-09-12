import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  getBoundFarmField,
  harvestBoundFarmField,
  upgradeBoundFarmLand,
} from "../../auth/auth-client";
import {
  acknowledgeBoundBulletin,
  type BoundBulletinRead,
  type BulletinAcknowledgementScope,
  bulletinIssueMessage,
  getBoundBulletin,
} from "../../auth/bulletin-client";
import { executeBoundCropCodexAction } from "../../auth/crop-codex-action-client";
import { executeBoundExpeditionAction } from "../../auth/expedition-action-client";
import {
  type BoundFarmCatalogRead,
  farmCatalogIssueMessage,
  farmShopOpenIssueMessage,
  getBoundFarmCatalog,
  openBoundFarmShop,
  replaceFarmCatalogShop,
} from "../../auth/farm-catalog-client";
import { createBoundFarmHarvestRequest } from "../../auth/farm-harvest-request-client";
import {
  type BoundFarmDecorationsRead,
  type FarmDecorationLayout,
  farmDecorationIssueMessage,
  getBoundFarmDecorations,
  saveBoundFarmDecorationLayout,
} from "../../auth/farm-decoration-client";
import { createBoundFarmPlantRequest } from "../../auth/farm-plant-request-client";
import { createBoundFarmPurchaseRequest } from "../../auth/farm-purchase-request-client";
import { executeBoundFarmSettingsAction } from "../../auth/farm-settings-action-client";
import {
  type BoundKitchenRead,
  getBoundKitchen,
  kitchenIssueMessage,
  kitchenShopOpenIssueMessage,
  openBoundKitchenShop,
  replaceKitchenAfterShopOpen,
} from "../../auth/kitchen-client";
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
import { type BoundRanchRead, getBoundRanch, ranchIssueMessage } from "../../auth/ranch-client";
import { collectBoundRanch } from "../../auth/ranch-collection-client";
import { executeBoundRanchDecorationAction } from "../../auth/ranch-decoration-action-client";
import { executeBoundRanchInteractionAction } from "../../auth/ranch-interaction-action-client";
import { executeBoundSmeltingAction } from "../../auth/smelting-action-client";
import { farmFieldIssueMessage } from "../farm-overview";
import type { CookingShopOpenFeedback, FarmShopOpenFeedback } from "../panels/shop-panel";
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
import { useRanchReturnRefresh } from "./use-ranch-return-refresh";
import { useFarmVisibility } from "./use-farm-visibility";
import { hasCurrentKitchenShelf, mergeKitchenPurchaseResource } from "./kitchen-shop-state";
import {
  createInitialFarmReadResources,
  type FarmHarvestActionState,
  type FarmHarvestAttempt,
  type FarmHarvestRequestActionState,
  type FarmHarvestRequestExecutor,
  type FarmLandUpgradeActionState,
  type FarmLandUpgradeAttempt,
  type FarmPageProps,
  type FarmPageState,
  type FarmPlantRequestActionState,
  type FarmPlantRequestExecutor,
  type FarmPurchaseRequestExecutor,
  type FarmReadResources,
  type KitchenCookExecutor,
  type KitchenPurchaseExecutor,
  type KitchenShopRefreshExecutor,
  type RanchCollectionExecutor,
  type RanchDecorationActionExecutor,
  type RanchResidentActionResult,
  shouldRetryFarmHarvest,
  shouldRetryFarmHarvestRequest,
  shouldRetryFarmLandUpgrade,
  shouldRetryFarmPlantRequest,
} from "./model";

interface LiveFarmPageProps extends FarmPageProps {
  actionListLauncher?: ReactNode;
}

export function LiveFarmPage({ active = true, actionListLauncher, onBack, previewData }: LiveFarmPageProps) {
  const visible = useFarmVisibility(active);
  const wasVisibleRef = useRef(visible);
  const [state, setState] = useState<FarmPageState>(
    previewData ? { stage: "ready", data: previewData } : { stage: "loading" },
  );
  const [resources, setResources] = useState<FarmReadResources>(() =>
    createInitialFarmReadResources(),
  );
  const [settingsInitializationKey, setSettingsInitializationKey] = useState(0);
  const [harvestAction, setHarvestAction] = useState<FarmHarvestActionState>({ stage: "idle" });
  const [harvestRequestAction, setHarvestRequestAction] = useState<FarmHarvestRequestActionState>({
    stage: "idle",
  });
  const [plantRequestAction, setPlantRequestAction] = useState<FarmPlantRequestActionState>({
    stage: "idle",
  });
  const [landUpgradeAction, setLandUpgradeAction] = useState<FarmLandUpgradeActionState>({
    stage: "idle",
  });
  const [farmShopOpenFeedback, setFarmShopOpenFeedback] = useState<FarmShopOpenFeedback>({
    stage: "idle",
  });
  const [cookingShopOpenFeedback, setCookingShopOpenFeedback] = useState<CookingShopOpenFeedback>({
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
  const bulletinAckKeysRef = useRef<Map<string, string>>(new Map());
  const farmCatalogRef = useRef<BoundFarmCatalogRead | null>(null);
  const farmDecorationsRef = useRef<BoundFarmDecorationsRead | null>(null);
  const decorationSaveAttemptRef = useRef<{
    expectedRevision: string;
    idempotencyKey: string;
    layout: FarmDecorationLayout;
  } | null>(null);
  const farmShopOpenAttemptRef = useRef<{
    expectedShopRevision: string | null;
    idempotencyKey: string;
  } | null>(null);
  const farmShopOpenInFlightRef = useRef(false);
  const kitchenRef = useRef<BoundKitchenRead | null>(null);
  const kitchenReadInFlightRef = useRef<{
    controller: AbortController;
    promise: ReturnType<typeof getBoundKitchen>;
  } | null>(null);
  const cookingShopOpenAttemptRef = useRef<{
    expectedShopRevision: string;
    idempotencyKey: string;
  } | null>(null);
  const cookingShopOpenInFlightRef = useRef(false);

  const requireResource = useCallback(
    function readResource(
      resource: keyof FarmReadResources,
      force = false,
      showLoading = true,
      preserveReadyOnError = false,
    ) {
      if (previewData || (!force && requestedResourcesRef.current.has(resource))) {
        return;
      }
      requestedResourcesRef.current.add(resource);
      resourceControllersRef.current[resource]?.abort();
      const controller = new AbortController();
      resourceControllersRef.current[resource] = controller;
      if (showLoading) {
        setResources((current) => ({
          ...current,
          [resource]:
            current[resource].stage === "ready"
              ? current[resource]
              : { stage: "loading" },
        }));
      }

      if (resource === "ranch") {
        void getBoundRanch({ signal: controller.signal }).then((result) => {
          if (controller.signal.aborted) return;
          if (!result.ok && preserveReadyOnError) return;
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

      if (resource === "farmDecorations") {
        void getBoundFarmDecorations({ signal: controller.signal }).then((result) => {
          if (controller.signal.aborted) return;
          if (!result.ok && preserveReadyOnError) return;
          if (!result.ok) requestedResourcesRef.current.delete(resource);
          if (result.ok) farmDecorationsRef.current = result.data;
          setResources((current) => ({
            ...current,
            farmDecorations: result.ok
              ? { stage: "ready", data: result.data }
              : { stage: "error", message: farmDecorationIssueMessage(result.issue) },
          }));
        });
        return;
      }

      if (resource === "kitchen") {
        const pending = { controller, promise: getBoundKitchen({ signal: controller.signal }) };
        kitchenReadInFlightRef.current = pending;
        void pending.promise.then((result) => {
          if (controller.signal.aborted) return;
          if (!result.ok && preserveReadyOnError) return;
          if (!result.ok) requestedResourcesRef.current.delete(resource);
          if (result.ok) kitchenRef.current = result.data;
          setResources((current) => ({
            ...current,
            kitchen: result.ok
              ? { stage: "ready", data: result.data }
              : { stage: "error", message: kitchenIssueMessage(result.issue) },
          }));
        }).finally(() => {
          if (kitchenReadInFlightRef.current === pending) kitchenReadInFlightRef.current = null;
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
          if (!result.ok && preserveReadyOnError) return;
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
        if (!result.ok && preserveReadyOnError) return;
        if (!result.ok) requestedResourcesRef.current.delete(resource);
        if (result.ok) farmCatalogRef.current = result.data;
        if (result.ok && !showLoading) {
          setSettingsInitializationKey((current) => current + 1);
        }
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

  const refreshRanchReturn = useCallback(() => requireResource("ranch", true), [requireResource]);
  const saveDecorationLayout = useCallback(
    async (layout: FarmDecorationLayout) => {
      const current = farmDecorationsRef.current;
      if (!current) throw new Error("装饰数据尚未读取，请刷新后再保存。");
      const previous = decorationSaveAttemptRef.current;
      const attempt =
        previous && JSON.stringify(previous.layout) === JSON.stringify(layout)
          ? previous
          : { layout, expectedRevision: current.revision, idempotencyKey: crypto.randomUUID() };
      decorationSaveAttemptRef.current = attempt;
      const result = await saveBoundFarmDecorationLayout(attempt);
      if (!result.ok) {
        if (result.issue.code === "state_conflict") {
          decorationSaveAttemptRef.current = null;
          requireResource("farmDecorations", true);
        }
        throw new Error(farmDecorationIssueMessage(result.issue));
      }
      decorationSaveAttemptRef.current = null;
      resourceControllersRef.current.farmDecorations?.abort();
      const next: BoundFarmDecorationsRead = {
        ...current,
        data: result.data.data.resource,
        revision: result.data.revision,
        server_time: result.data.server_time,
      };
      farmDecorationsRef.current = next;
      setResources((resources) => ({
        ...resources,
        farmDecorations: { stage: "ready", data: next },
      }));
    },
    [requireResource],
  );
  useRanchReturnRefresh(
    !previewData && resources.ranch.stage === "ready" ? resources.ranch.data : null,
    refreshRanchReturn,
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
        setState({ stage: "ready", data: result.data });
      } else if (showLoading) {
        setState({ stage: "error", issue: result.issue });
      }
    },
    [previewData],
  );

  const refreshRequestedResources = useCallback((background = false) => {
    const requestedResources = [...requestedResourcesRef.current];
    if (requestedResources.includes("farmCatalog")) {
      setSettingsInitializationKey((current) => current + 1);
    }
    for (const resource of requestedResources) {
      requireResource(resource, true, !background, background);
    }
  }, [requireResource]);

  const refreshResourceInBackground = useCallback(
    (resource: keyof FarmReadResources) => {
      if (!requestedResourcesRef.current.has(resource)) return;
      requireResource(resource, true, false, true);
    },
    [requireResource],
  );

  const requestVisibleResource = useCallback((resource: keyof FarmReadResources, refresh = false) => {
    requireResource(resource, refresh, true, refresh);
  }, [requireResource]);

  const refreshFieldScene = useCallback(() => {
    void refreshField();
    refreshResourceInBackground("farmDecorations");
  }, [refreshField, refreshResourceInBackground]);

  useEffect(() => {
    const resumed = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (!resumed || previewData) return;
    void refreshField();
    refreshRequestedResources(true);
  }, [previewData, refreshField, refreshRequestedResources, visible]);

  const openCurrentFarmShop = useCallback(
    async (retry = false) => {
      if (previewData || farmShopOpenInFlightRef.current) return;
      farmShopOpenInFlightRef.current = true;
      setFarmShopOpenFeedback({ stage: "submitting" });
      try {
        let catalog = farmCatalogRef.current;
        if (!catalog) {
          const read = await getBoundFarmCatalog();
          if (!read.ok) {
            setFarmShopOpenFeedback({
              stage: "error",
              message: farmCatalogIssueMessage(read.issue),
            });
            return;
          }
          catalog = read.data;
          farmCatalogRef.current = catalog;
          requestedResourcesRef.current.add("farmCatalog");
          setResources((current) => ({
            ...current,
            farmCatalog: { stage: "ready", data: read.data },
          }));
        }

        const expectedShopRevision =
          catalog.data.shop.status === "available" ? catalog.data.shop.revision : null;
        const priorAttempt = retry ? farmShopOpenAttemptRef.current : null;
        const attempt =
          priorAttempt?.expectedShopRevision === expectedShopRevision
            ? priorAttempt
            : { expectedShopRevision, idempotencyKey: crypto.randomUUID() };
        farmShopOpenAttemptRef.current = attempt;
        const result = await openBoundFarmShop(attempt);
        if (!result.ok) {
          if (result.issue.code === "state_conflict") {
            farmShopOpenAttemptRef.current = null;
            const reread = await getBoundFarmCatalog();
            if (reread.ok) {
              catalog = reread.data;
              farmCatalogRef.current = reread.data;
              setResources((current) => ({
                ...current,
                farmCatalog: { stage: "ready", data: reread.data },
              }));
            }
          }
          setFarmShopOpenFeedback({
            stage: "error",
            message: farmShopOpenIssueMessage(result.issue),
          });
          return;
        }

        farmShopOpenAttemptRef.current = null;
        resourceControllersRef.current.farmCatalog?.abort();
        const updatedCatalog = replaceFarmCatalogShop(catalog, result.data);
        farmCatalogRef.current = updatedCatalog;
        setResources((current) => ({
          ...current,
          farmCatalog: { stage: "ready", data: updatedCatalog },
        }));
        setFarmShopOpenFeedback({ stage: "success" });
      } finally {
        farmShopOpenInFlightRef.current = false;
      }
    },
    [previewData],
  );

  const openCurrentKitchenShop = useCallback(
    async (retry = false) => {
      if (previewData || cookingShopOpenInFlightRef.current) return;
      if (!retry && hasCurrentKitchenShelf(kitchenRef.current)) {
        setCookingShopOpenFeedback({ stage: "idle" });
        return;
      }
      cookingShopOpenInFlightRef.current = true;
      setCookingShopOpenFeedback({ stage: "submitting" });
      try {
        let kitchen = kitchenRef.current;
        if (!kitchen) {
          if (!kitchenReadInFlightRef.current || kitchenReadInFlightRef.current.controller.signal.aborted) {
            requireResource("kitchen", true);
          }
          const pending = kitchenReadInFlightRef.current;
          if (!pending) return;
          const read = await pending.promise;
          if (!mountedRef.current) return;
          if (pending.controller.signal.aborted) {
            setCookingShopOpenFeedback({ stage: "idle" });
            return;
          }
          if (!read.ok) {
            setCookingShopOpenFeedback({
              stage: "error",
              message: kitchenIssueMessage(read.issue),
            });
            return;
          }
          kitchen = read.data;
        }
        if (!retry && hasCurrentKitchenShelf(kitchen)) {
          setCookingShopOpenFeedback({ stage: "idle" });
          return;
        }

        const priorAttempt = retry ? cookingShopOpenAttemptRef.current : null;
        const attempt =
          priorAttempt?.expectedShopRevision === kitchen.shop_revision
            ? priorAttempt
            : {
                expectedShopRevision: kitchen.shop_revision,
                idempotencyKey: crypto.randomUUID(),
              };
        cookingShopOpenAttemptRef.current = attempt;
        const result = await openBoundKitchenShop(attempt);
        if (!mountedRef.current) return;
        if (!result.ok) {
          if (result.issue.code === "state_conflict") {
            cookingShopOpenAttemptRef.current = null;
            const reread = await getBoundKitchen();
            if (reread.ok) {
              kitchen = reread.data;
              kitchenRef.current = reread.data;
              setResources((current) => ({
                ...current,
                kitchen: { stage: "ready", data: reread.data },
              }));
            }
          }
          setCookingShopOpenFeedback({
            stage: "error",
            message: kitchenShopOpenIssueMessage(result.issue),
          });
          return;
        }

        cookingShopOpenAttemptRef.current = null;
        resourceControllersRef.current.kitchen?.abort();
        const updatedKitchen = replaceKitchenAfterShopOpen(result.data);
        kitchenRef.current = updatedKitchen;
        setResources((current) => ({
          ...current,
          kitchen: { stage: "ready", data: updatedKitchen },
        }));
        setCookingShopOpenFeedback({ stage: "success" });
      } finally {
        cookingShopOpenInFlightRef.current = false;
      }
    },
    [previewData, requireResource],
  );

  const acknowledgeDisplayedBulletin = useCallback(
    async (bulletin: BoundBulletinRead, acknowledge: BulletinAcknowledgementScope) => {
      const expectedFarmDoorplate = fieldDoorplateRef.current;
      if (!expectedFarmDoorplate) return;
      const acknowledgementIdentity = `${bulletin.revision}:${acknowledge}`;
      const idempotencyKey =
        bulletinAckKeysRef.current.get(acknowledgementIdentity) ?? crypto.randomUUID();
      bulletinAckKeysRef.current.set(acknowledgementIdentity, idempotencyKey);
      const result = await acknowledgeBoundBulletin({
        humanNoticeIds: bulletin.humanNotices?.map((notice) => notice.id) ?? [],
        acknowledge,
        expectedFarmDoorplate,
        expectedRevision: bulletin.revision,
        idempotencyKey,
      });
      if (result.ok) {
        bulletinAckKeysRef.current.delete(acknowledgementIdentity);
        setResources((current) => ({
          ...current,
          bulletin: {
            stage: "ready",
            data: {
              subject: result.data.subject,
              data: result.data.data.resource,
              revision: result.data.revision,
              server_time: result.data.server_time,
              humanNotices: result.data.humanNotices ?? bulletin.humanNotices ?? [],
            },
          },
        }));
        return;
      }
      if (result.issue.code === "state_conflict") {
        bulletinAckKeysRef.current.delete(acknowledgementIdentity);
        requireResource("bulletin", true);
      }
    },
    [requireResource],
  );

  const applyRanchMutationResource = useCallback((response: {
    data: { resource: BoundRanchRead["data"] };
    revision: string;
    server_time: string;
  }) => {
    resourceControllersRef.current.ranch?.abort();
    setResources((current) => ({ ...current, ranch: { stage: "ready", data: {
      data: response.data.resource,
      revision: response.revision,
      server_time: response.server_time,
    } } }));
  }, []);

  const applyKitchenMutationResource = useCallback((response: {
    data: { resource: BoundKitchenRead["data"] };
    kitchen_inventory_revision: string;
    shop_revision: string;
    server_time: string;
  }, preserveUnchanged = false) => {
    resourceControllersRef.current.kitchen?.abort();
    setResources((current) => {
      if (current.kitchen.stage !== "ready") return current;
      const nextKitchen: BoundKitchenRead = {
        data: preserveUnchanged
          ? mergeKitchenPurchaseResource(current.kitchen.data.data, response.data.resource)
          : response.data.resource,
        kitchen_inventory_revision: response.kitchen_inventory_revision,
        shop_revision: response.shop_revision,
        server_time: response.server_time,
      };
      kitchenRef.current = nextKitchen;
      return { ...current, kitchen: { stage: "ready", data: nextKitchen } };
    });
  }, []);

  const applyCatalogMutationResource = useCallback((response: {
    resource: BoundFarmCatalogRead["data"];
    revisions?: Partial<Pick<BoundFarmCatalogRead,
      "revision" | "codex_revision" | "original_plant_revision" |
      "expedition_revision" | "market_revision" | "neighborhood_revision">>;
    server_time: string;
  }) => {
    resourceControllersRef.current.farmCatalog?.abort();
    setResources((current) => {
      if (current.farmCatalog.stage !== "ready") return current;
      const nextCatalog: BoundFarmCatalogRead = {
        ...current.farmCatalog.data,
        data: response.resource,
        ...response.revisions,
        server_time: response.server_time,
      };
      farmCatalogRef.current = nextCatalog;
      return { ...current, farmCatalog: { stage: "ready", data: nextCatalog } };
    });
  }, []);

  const applyCatalogNeighborhoodResource = useCallback((response: {
    resource: BoundFarmCatalogRead["data"]["neighborhood"];
    revision: string;
    server_time: string;
  }) => {
    resourceControllersRef.current.farmCatalog?.abort();
    setResources((current) => {
      if (current.farmCatalog.stage !== "ready") return current;
      const nextCatalog: BoundFarmCatalogRead = {
        ...current.farmCatalog.data,
        data: { ...current.farmCatalog.data.data, neighborhood: response.resource },
        neighborhood_revision: response.revision,
        server_time: response.server_time,
      };
      farmCatalogRef.current = nextCatalog;
      return { ...current, farmCatalog: { stage: "ready", data: nextCatalog } };
    });
  }, []);

  const submitRanchResidentAction = useCallback(
    async (input: RanchResidentActionInput): Promise<RanchResidentActionResult> => {
      const result = await executeBoundRanchResidentAction(input);
      if (result.ok) {
        applyRanchMutationResource(result.data);
        if (result.data.data.result.outcome.kind === "feed") {
          refreshResourceInBackground("kitchen");
        }
      }
      return result;
    },
    [applyRanchMutationResource, refreshResourceInBackground],
  );

  const submitRanchCollectionAction = useCallback<RanchCollectionExecutor>(
    async (input) => {
      const result = await collectBoundRanch(input);
      if (result.ok) {
        applyRanchMutationResource(result.data);
        if (result.data.data.result.items.some(({ destination }) => destination === "kitchen")) {
          refreshResourceInBackground("kitchen");
        }
      } else if (result.issue.code === "state_conflict") {
        requireResource("ranch", true);
      }
      return result;
    },
    [applyRanchMutationResource, refreshResourceInBackground, requireResource],
  );

  const submitRanchDecorationAction = useCallback<RanchDecorationActionExecutor>(
    async (input) => {
      const result = await executeBoundRanchDecorationAction(input);
      if (result.ok) {
        applyRanchMutationResource(result.data);
      } else if (result.issue.code === "state_conflict") {
        requireResource("ranch", true);
      }
      return result;
    },
    [applyRanchMutationResource, requireResource],
  );

  const submitExpeditionAction = useCallback<ExpeditionActionExecutor>(
    async (input) => {
      const result = await executeBoundExpeditionAction(input);
      if (result.ok) {
        applyCatalogMutationResource({ resource: result.data.data.resource,
          revisions: { expedition_revision: result.data.revision }, server_time: result.data.server_time });
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [applyCatalogMutationResource, requireResource],
  );

  const submitCropCodexAction = useCallback<CropCodexActionExecutor>(
    async (input) => {
      const result = await executeBoundCropCodexAction(input);
      if (result.ok) {
        applyCatalogMutationResource({ resource: result.data.data.resource,
          revisions: { revision: result.data.revision, codex_revision: result.data.codex_revision },
          server_time: result.data.server_time });
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [applyCatalogMutationResource, requireResource],
  );

  const submitSmeltingAction = useCallback<SmeltingActionExecutor>(
    async (input) => {
      const result = await executeBoundSmeltingAction(input);
      if (result.ok) {
        resourceControllersRef.current.farmCatalog?.abort();
        const currentCatalog = farmCatalogRef.current;
        if (currentCatalog) {
          const resource = result.data.data.resource;
          const nextCatalog: BoundFarmCatalogRead = {
            ...currentCatalog,
            data: {
              ...currentCatalog.data,
              ...resource,
              smelting:
                resource.smelting.status === "available" &&
                resource.smelting.write_status === "available"
                  ? { ...resource.smelting, revision: result.data.smelting_revision }
                  : resource.smelting,
            },
            server_time: result.data.server_time,
          };
          farmCatalogRef.current = nextCatalog;
          setResources((current) => ({
            ...current,
            farmCatalog: { stage: "ready", data: nextCatalog },
          }));
        }
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [requireResource],
  );

  const submitMarketAction = useCallback<MarketActionExecutor>(
    async (input) => {
      const result = await executeBoundMarketAction(input);
      if (result.ok) {
        const usesKitchenInventory = (kind: string) => kind === "ingredient" || kind === "dish";
        if ("seller_revision" in result.data || "order_owner_revision" in result.data) {
          refreshResourceInBackground("farmCatalog");
          if (
            input.action === "buy" ||
            input.action === "purchase-order-fulfill" ||
            (input.action === "barter-accept" &&
              result.data.data.result.action === "barter-accept" &&
              (usesKitchenInventory(result.data.data.result.outcome.give.kind) ||
                usesKitchenInventory(result.data.data.result.outcome.want.kind)))
          ) {
            refreshResourceInBackground("kitchen");
          }
        } else {
          applyCatalogMutationResource({
            resource: result.data.data.resource,
            revisions: { market_revision: result.data.revision },
            server_time: result.data.server_time,
          });
          if (
            (input.action === "list" && usesKitchenInventory(input.kind)) ||
            (input.action === "unlist" && usesKitchenInventory(input.kind)) ||
            (input.action === "barter-list" && usesKitchenInventory(input.giveKind)) ||
            (result.data.data.result.action === "barter-unlist" &&
              usesKitchenInventory(result.data.data.result.outcome.give.kind)) ||
            input.action === "purchase-order-list" ||
            input.action === "purchase-order-unlist" ||
            (result.data.data.result.action === "mystery-merchant-buy" &&
              (result.data.data.result.outcome.costs.silver > 0 ||
                result.data.data.result.outcome.items.some(({ kind }) => usesKitchenInventory(kind))))
          ) {
            refreshResourceInBackground("kitchen");
          }
          if (result.data.data.result.action === "mystery-merchant-buy" &&
              result.data.data.result.outcome.costs.gold > 0) {
            void refreshField();
          }
        }
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [applyCatalogMutationResource, refreshField, refreshResourceInBackground, requireResource],
  );

  const submitRanchInteractionAction = useCallback<RanchInteractionActionExecutor>(
    async (input) => {
      const result = await executeBoundRanchInteractionAction(input);
      if (result.ok) {
        applyRanchMutationResource(result.data);
        if (result.data.data.result.outcome.kind === "send") {
          const farmCoinsRemaining = result.data.data.result.outcome.farm_coins_remaining;
          setState((current) => current.stage === "ready" ? { ...current, data: {
            ...current.data, data: { ...current.data.data, balance: { farm_coins: farmCoinsRemaining } },
          } } : current);
        }
        if (result.data.data.result.outcome.kind === "send" ||
            result.data.data.result.outcome.kind === "remit") {
          void refreshField();
        }
      } else if (result.issue.code === "state_conflict") {
        requireResource("ranch", true);
      }
      return result;
    },
    [applyRanchMutationResource, refreshField, requireResource],
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
        void refreshField();
        refreshResourceInBackground("farmCatalog");
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [refreshField, refreshResourceInBackground, requireResource],
  );

  const submitNeighborhoodMessageAction = useCallback<NeighborhoodMessageActionExecutor>(
    async (input) => {
      const result = await executeBoundNeighborhoodMessage(input);
      if (result.ok || result.issue.code === "state_conflict") {
        if (result.ok) {
          applyCatalogNeighborhoodResource({
            resource: result.data.data.resource,
            revision: result.data.revision,
            server_time: result.data.server_time,
          });
        } else {
          requireResource("farmCatalog", true);
        }
      }
      return result;
    },
    [applyCatalogNeighborhoodResource, requireResource],
  );

  const submitKitchenInventoryAction = useCallback<KitchenInventoryActionExecutor>(
    async (input) => {
      const result = await executeBoundKitchenInventoryAction(input);
      if (result.ok) {
        applyKitchenMutationResource(result.data);
        if (result.data.data.result.outcome.kind === "stall") {
          refreshResourceInBackground("farmCatalog");
        }
        if (result.data.data.result.outcome.kind === "use" &&
            result.data.data.result.outcome.target !== "self") {
          refreshResourceInBackground("ranch");
        }
      } else if (result.issue.code === "state_conflict") {
        requireResource("kitchen", true);
      }
      return result;
    },
    [applyKitchenMutationResource, refreshResourceInBackground, requireResource],
  );

  const submitFarmSettingsAction = useCallback<FarmSettingsActionExecutor>(
    async (input) => {
      const result = await executeBoundFarmSettingsAction(input);
      if (result.ok) {
        applyCatalogMutationResource({
          resource: result.data.data.resource,
          revisions: { revision: result.data.revision },
          server_time: result.data.server_time,
        });
        const settings = result.data.data.resource.settings;
        if (settings.status === "available" &&
            (input.field === "farm_name" || input.field === "welcome_message" ||
             input.field === "equip_title")) {
          setState((current) => current.stage === "ready" &&
            current.data.data.farm.farm_doorplate === result.data.data.resource.farm.farm_doorplate
            ? { ...current, data: { ...current.data, data: { ...current.data.data, farm: {
              ...current.data.data.farm,
              ...(input.field === "farm_name" ? { farm_name: settings.farm_name } : {}),
              ...(input.field === "welcome_message" ? { welcome_message: settings.welcome_message } : {}),
              ...(input.field === "equip_title" ? { equipped_title:
                settings.equipped_title?.identity_state === "known"
                  ? { title_id: settings.equipped_title.title_id, name: settings.equipped_title.name }
                  : null } : {}),
            } } } } : current);
          void refreshField();
        }
      } else if (result.issue.code === "state_conflict") {
        requireResource("farmCatalog", true);
      }
      return result;
    },
    [applyCatalogMutationResource, refreshField, requireResource],
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
        applyKitchenMutationResource(result.data, true);
      } else if (result.issue.code === "shop_changed" || result.issue.code === "state_conflict") {
        requireResource("kitchen", true);
      }
      return result;
    },
    [applyKitchenMutationResource, requireResource],
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
        applyKitchenMutationResource(result.data);
        void refreshField();
      } else if (
        result.issue.code === "state_conflict" ||
        result.issue.code === "shop_unavailable"
      ) {
        requireResource("kitchen", true);
      }
      return result;
    },
    [applyKitchenMutationResource, refreshField, requireResource],
  );

  const submitKitchenCookAction = useCallback<KitchenCookExecutor>(
    async (input) => {
      const result = await executeBoundKitchenCook(input);
      if (result.ok) {
        applyKitchenMutationResource(result.data);
      } else if (result.issue.code === "state_conflict") {
        requireResource("kitchen", true);
      }
      return result;
    },
    [applyKitchenMutationResource, requireResource],
  );

  const reload = useCallback(() => {
    setHarvestAction({ stage: "idle" });
    setHarvestRequestAction({ stage: "idle" });
    setPlantRequestAction({ stage: "idle" });
    setLandUpgradeAction({ stage: "idle" });
    setFarmShopOpenFeedback({ stage: "idle" });
    setCookingShopOpenFeedback({ stage: "idle" });
    farmCatalogRef.current = null;
    farmShopOpenAttemptRef.current = null;
    kitchenRef.current = null;
    cookingShopOpenAttemptRef.current = null;
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
        requestControllerRef.current?.abort();
        fieldRequestGenerationRef.current += 1;
        setState({
          stage: "ready",
          data: {
            data: result.data.data.resource,
            revision: result.data.revision,
            server_time: result.data.server_time,
          },
        });
        setHarvestAction({ stage: "success", result: result.data.data.result });
        const harvestResult = result.data.data.result;
        if (harvestResult.new_titles.length > 0 || harvestResult.harvests.some(
          ({ is_new, material_drop, potion_drop }) =>
            is_new || material_drop !== null || potion_drop !== null,
        )) {
          refreshResourceInBackground("farmCatalog");
        }
        if (harvestResult.silver_gained > 0) {
          refreshResourceInBackground("kitchen");
        }
        return;
      }
      setHarvestAction({
        stage: "error",
        attempt: shouldRetryFarmHarvest(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [previewData, refreshResourceInBackground, state],
  );

  const submitHarvestRequest = useCallback<FarmHarvestRequestExecutor>(
    async (attempt) => {
      const result = await createBoundFarmHarvestRequest(attempt);
      if (!result.ok && result.issue.code === "field_changed") {
        void refreshField({ showLoading: false });
      }
      return result;
    },
    [refreshField],
  );

  const requestHarvest = useCallback(
    async (retryAttempt?: Parameters<FarmHarvestRequestExecutor>[0]) => {
      if (previewData || state.stage !== "ready") return;
      const attempt =
        retryAttempt ??
        ({
          fieldRevision: state.data.revision,
          idempotencyKey: crypto.randomUUID(),
        } satisfies Parameters<FarmHarvestRequestExecutor>[0]);
      setHarvestRequestAction({ stage: "submitting", attempt });
      const result = await submitHarvestRequest(attempt);
      if (result.ok) {
        setHarvestRequestAction({ stage: "success" });
        return;
      }
      setHarvestRequestAction({
        stage: "error",
        attempt: shouldRetryFarmHarvestRequest(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [previewData, state, submitHarvestRequest],
  );

  const submitPlantRequest = useCallback<FarmPlantRequestExecutor>(
    async (attempt) => {
      const result = await createBoundFarmPlantRequest(attempt);
      if (!result.ok && result.issue.code === "field_changed") {
        void refreshField({ showLoading: false });
      }
      return result;
    },
    [refreshField],
  );

  const requestPlant = useCallback(
    async (retryAttempt?: Parameters<FarmPlantRequestExecutor>[0]) => {
      if (previewData || state.stage !== "ready") return;
      const attempt =
        retryAttempt ??
        ({
          fieldRevision: state.data.revision,
          idempotencyKey: crypto.randomUUID(),
        } satisfies Parameters<FarmPlantRequestExecutor>[0]);
      setPlantRequestAction({ stage: "submitting", attempt });
      const result = await submitPlantRequest(attempt);
      if (result.ok) {
        setPlantRequestAction({ stage: "success" });
        return;
      }
      setPlantRequestAction({
        stage: "error",
        attempt: shouldRetryFarmPlantRequest(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [previewData, state, submitPlantRequest],
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
        requestControllerRef.current?.abort();
        fieldRequestGenerationRef.current += 1;
        setState({
          stage: "ready",
          data: {
            data: result.data.data.resource,
            revision: result.data.revision,
            server_time: result.data.server_time,
          },
        });
        setLandUpgradeAction({ stage: "success", result: result.data.data.result });
        return;
      }
      setLandUpgradeAction({
        stage: "error",
        attempt: shouldRetryFarmLandUpgrade(result.issue) ? attempt : null,
        issue: result.issue,
      });
    },
    [previewData, state],
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

        {actionListLauncher}

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
            active={visible}
            cookingShopOpenFeedback={cookingShopOpenFeedback}
            data={state.data}
            farmShopOpenFeedback={farmShopOpenFeedback}
            harvestAction={harvestAction}
            harvestRequestAction={harvestRequestAction}
            plantRequestAction={plantRequestAction}
            onAcknowledgeBulletin={previewData ? undefined : acknowledgeDisplayedBulletin}
            landUpgradeAction={landUpgradeAction}
            onCloseHarvestAction={() => setHarvestAction({ stage: "idle" })}
            onCloseLandUpgradeAction={() => setLandUpgradeAction({ stage: "idle" })}
            onCropCodexAction={previewData ? undefined : submitCropCodexAction}
            onExpeditionAction={previewData ? undefined : submitExpeditionAction}
            onFarmPurchaseRequest={previewData ? undefined : submitFarmPurchaseRequestAction}
            onSaveDecorationLayout={previewData ? undefined : saveDecorationLayout}
            onHarvestAssist={previewData ? undefined : () => void submitHarvestAssist()}
            onHarvestRequest={previewData ? undefined : () => void requestHarvest()}
            onPlantRequest={previewData ? undefined : () => void requestPlant()}
            onLandUpgrade={previewData ? undefined : () => void submitLandUpgrade()}
            onOpenFarmShop={previewData ? undefined : () => void openCurrentFarmShop()}
            onOpenKitchenShop={previewData ? undefined : () => void openCurrentKitchenShop()}
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
            onRequireResource={requestVisibleResource}
            onRefreshField={refreshFieldScene}
            onRetryHarvestAssist={() => {
              if (harvestAction.stage === "error" && harvestAction.attempt) {
                void submitHarvestAssist(harvestAction.attempt);
              }
            }}
            onRetryHarvestRequest={() => {
              if (harvestRequestAction.stage === "error" && harvestRequestAction.attempt) {
                void requestHarvest(harvestRequestAction.attempt);
              }
            }}
            onRetryPlantRequest={() => {
              if (plantRequestAction.stage === "error" && plantRequestAction.attempt) {
                void requestPlant(plantRequestAction.attempt);
              }
            }}
            onRetryFarmShopOpen={previewData ? undefined : () => void openCurrentFarmShop(true)}
            onRetryCookingShopOpen={
              previewData ? undefined : () => void openCurrentKitchenShop(true)
            }
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
