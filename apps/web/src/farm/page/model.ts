import type {
  BoundFarmField,
  BoundFarmHarvestAssist,
  BoundFarmLandUpgrade,
  FarmFieldIssue,
  FarmHarvestAssistIssue,
  FarmLandUpgradeIssue,
} from "../../auth/auth-client";
import type { BoundBulletinRead } from "../../auth/bulletin-client";
import type { BoundFarmCatalogRead } from "../../auth/farm-catalog-client";
import type {
  CreateFarmHarvestRequestInput,
  createBoundFarmHarvestRequest,
  FarmHarvestRequestIssue,
} from "../../auth/farm-harvest-request-client";
import type {
  CreateFarmPlantRequestInput,
  createBoundFarmPlantRequest,
  FarmPlantRequestIssue,
} from "../../auth/farm-plant-request-client";
import type {
  CreateFarmPurchaseRequestInput,
  createBoundFarmPurchaseRequest,
  FarmPurchaseRequestIssue,
} from "../../auth/farm-purchase-request-client";
import type { BoundKitchenRead } from "../../auth/kitchen-client";
import type {
  BoundKitchenCook,
  executeBoundKitchenCook,
  KitchenCookInput,
  KitchenCookIssue,
} from "../../auth/kitchen-cook-client";
import type {
  KitchenPurchaseInput,
  KitchenPurchaseIssue,
  purchaseBoundKitchenItem,
} from "../../auth/kitchen-purchase-client";
import type {
  KitchenShopRefreshInput,
  KitchenShopRefreshIssue,
  refreshBoundKitchenShop,
} from "../../auth/kitchen-shop-refresh-client";
import type {
  executeBoundRanchResidentAction,
  RanchResidentActionInput,
  RanchResidentActionIssue,
} from "../../auth/ranch-action-client";
import type { BoundRanchRead } from "../../auth/ranch-client";
import type {
  collectBoundRanch,
  RanchCollectionInput,
  RanchCollectionIssue,
} from "../../auth/ranch-collection-client";
import type {
  executeBoundRanchDecorationAction,
  RanchDecorationActionInput,
} from "../../auth/ranch-decoration-action-client";
import type { FarmSceneId, FarmToolOption } from "../dev/farm-tool-layouts";

export type FarmPageState =
  | { stage: "loading" }
  | { stage: "error"; issue: FarmFieldIssue }
  | { stage: "ready"; data: BoundFarmField };

type FarmReadResourceState<T> =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "ready"; data: T }
  | { stage: "error"; message: string };

export interface FarmReadResources {
  bulletin: FarmReadResourceState<BoundBulletinRead>;
  farmCatalog: FarmReadResourceState<BoundFarmCatalogRead>;
  kitchen: FarmReadResourceState<BoundKitchenRead>;
  ranch: FarmReadResourceState<BoundRanchRead>;
}

export interface FarmHarvestAttempt {
  expectedRevision: string;
  idempotencyKey: string;
}

export type FarmHarvestActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: FarmHarvestAttempt }
  | {
      stage: "error";
      attempt: FarmHarvestAttempt | null;
      issue: FarmHarvestAssistIssue;
    }
  | { stage: "success"; result: BoundFarmHarvestAssist["data"]["result"] };

export type FarmHarvestRequestResult = Awaited<ReturnType<typeof createBoundFarmHarvestRequest>>;
export type FarmHarvestRequestExecutor = (
  input: CreateFarmHarvestRequestInput,
) => Promise<FarmHarvestRequestResult>;
export type FarmHarvestRequestActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: CreateFarmHarvestRequestInput }
  | {
      stage: "error";
      attempt: CreateFarmHarvestRequestInput | null;
      issue: FarmHarvestRequestIssue;
    }
  | { stage: "success" };

export type FarmPlantRequestResult = Awaited<ReturnType<typeof createBoundFarmPlantRequest>>;
export type FarmPlantRequestExecutor = (
  input: CreateFarmPlantRequestInput,
) => Promise<FarmPlantRequestResult>;
export type FarmPlantRequestActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: CreateFarmPlantRequestInput }
  | {
      stage: "error";
      attempt: CreateFarmPlantRequestInput | null;
      issue: FarmPlantRequestIssue;
    }
  | { stage: "success" };

export interface FarmLandUpgradeAttempt {
  expectedRevision: string;
  idempotencyKey: string;
}

export type FarmLandUpgradeActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: FarmLandUpgradeAttempt }
  | {
      stage: "error";
      attempt: FarmLandUpgradeAttempt | null;
      issue: FarmLandUpgradeIssue;
    }
  | { stage: "success"; result: BoundFarmLandUpgrade["data"]["result"] };

export type RanchResidentActionResult = Awaited<ReturnType<typeof executeBoundRanchResidentAction>>;
export type RanchResidentActionOutcome = Extract<
  RanchResidentActionResult,
  { ok: true }
>["data"]["data"]["result"]["outcome"];
export type RanchResidentActionExecutor = (
  input: RanchResidentActionInput,
) => Promise<RanchResidentActionResult>;

export interface RanchResidentActionAttempt {
  input: RanchResidentActionInput;
  label: string;
}

export type RanchResidentActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: RanchResidentActionAttempt }
  | {
      stage: "error";
      attempt: RanchResidentActionAttempt | null;
      issue: RanchResidentActionIssue;
    }
  | { stage: "success"; outcome: RanchResidentActionOutcome };

export type RanchCollectionResult = Awaited<ReturnType<typeof collectBoundRanch>>;
export type RanchCollectionExecutor = (
  input: RanchCollectionInput,
) => Promise<RanchCollectionResult>;
type RanchDecorationActionResult = Awaited<ReturnType<typeof executeBoundRanchDecorationAction>>;
export type RanchDecorationActionExecutor = (
  input: RanchDecorationActionInput,
) => Promise<RanchDecorationActionResult>;

export interface RanchCollectionAttempt {
  expectedRevision: string;
  idempotencyKey: string;
}

export type RanchCollectionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: RanchCollectionAttempt }
  | {
      stage: "error";
      attempt: RanchCollectionAttempt | null;
      issue: RanchCollectionIssue;
    }
  | {
      stage: "success";
      result: Extract<RanchCollectionResult, { ok: true }>["data"]["data"]["result"];
    };

export type KitchenPurchaseResult = Awaited<ReturnType<typeof purchaseBoundKitchenItem>>;
export type KitchenPurchaseExecutor = (
  input: KitchenPurchaseInput,
) => Promise<KitchenPurchaseResult>;

export type KitchenPurchaseActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: KitchenPurchaseInput }
  | {
      stage: "error";
      attempt: KitchenPurchaseInput | null;
      issue: KitchenPurchaseIssue;
    }
  | {
      stage: "success";
      result: Extract<KitchenPurchaseResult, { ok: true }>["data"]["data"]["result"];
    };

export type FarmPurchaseRequestResult = Awaited<ReturnType<typeof createBoundFarmPurchaseRequest>>;
export type FarmPurchaseRequestExecutor = (
  input: CreateFarmPurchaseRequestInput,
) => Promise<FarmPurchaseRequestResult>;

export type FarmPurchaseRequestActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: CreateFarmPurchaseRequestInput }
  | {
      stage: "error";
      attempt: CreateFarmPurchaseRequestInput | null;
      issue: FarmPurchaseRequestIssue;
    }
  | { stage: "success" };

export type KitchenShopRefreshResult = Awaited<ReturnType<typeof refreshBoundKitchenShop>>;
export type KitchenShopRefreshExecutor = (
  input: KitchenShopRefreshInput,
) => Promise<KitchenShopRefreshResult>;

export type KitchenShopRefreshActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: KitchenShopRefreshInput }
  | {
      stage: "error";
      attempt: KitchenShopRefreshInput | null;
      issue: KitchenShopRefreshIssue;
    }
  | { stage: "success" };

export type KitchenCookExecutor = (
  input: KitchenCookInput,
) => Promise<Awaited<ReturnType<typeof executeBoundKitchenCook>>>;
export type KitchenCookOutcome = BoundKitchenCook["data"]["result"]["outcome"];
export type KitchenCookActionState =
  | { stage: "idle" }
  | { stage: "submitting"; attempt: KitchenCookInput }
  | {
      stage: "error";
      attempt: KitchenCookInput | null;
      issue: KitchenCookIssue;
    }
  | { stage: "success"; outcome: KitchenCookOutcome };

export interface FarmPageProps {
  onBack: () => void;
  previewData?: BoundFarmField;
}

export interface FarmSceneUiState {
  bulletinOpen: boolean;
  selectedTool: FarmToolOption | null;
}

export type FarmSceneUiStateMap = Record<FarmSceneId, FarmSceneUiState>;

export interface FarmSettingsDraft {
  activeTitle: string;
  aiNickname: string;
  farmName: string;
  humanNickname: string;
  messagesAllowed: boolean | null;
  theftAllowed: boolean | null;
  visitsAllowed: boolean | null;
  wateringHelpAllowed: boolean | null;
  welcomeMessage: string;
}

export interface OriginalPlantDraft {
  description: string;
  harvestText: string;
  latinName: string;
  name: string;
  sowingText: string;
}

export type ShopCartSceneId = Exclude<FarmSceneId, "neighborhood">;
type ShopCartQuantities = Readonly<Record<string, number>>;
export type ShopCartState = Readonly<Record<ShopCartSceneId, ShopCartQuantities>>;

export const EMPTY_SHOP_CART: ShopCartQuantities = {};

export function createEmptyShopCarts(): ShopCartState {
  return {
    field: {},
    ranch: {},
    cooking: {},
  };
}

export function createInitialSceneUiStates(): FarmSceneUiStateMap {
  return {
    field: { bulletinOpen: false, selectedTool: null },
    ranch: { bulletinOpen: false, selectedTool: null },
    cooking: { bulletinOpen: false, selectedTool: null },
    neighborhood: { bulletinOpen: false, selectedTool: null },
  };
}

export function createInitialFarmReadResources(): FarmReadResources {
  return {
    bulletin: { stage: "idle" },
    farmCatalog: { stage: "idle" },
    kitchen: { stage: "idle" },
    ranch: { stage: "idle" },
  };
}

export function getSceneReadResource(sceneId: FarmSceneId): keyof FarmReadResources | null {
  if (sceneId === "ranch") return "ranch";
  if (sceneId === "cooking") return "kitchen";
  if (sceneId === "neighborhood") return "farmCatalog";
  return null;
}

export function getToolReadResource(
  sceneId: FarmSceneId,
  toolId: string,
): keyof FarmReadResources | null {
  if (toolId === "market" || toolId === "settings") return "farmCatalog";
  if (sceneId === "field") return "farmCatalog";
  if (sceneId === "ranch") return "ranch";
  if (sceneId === "cooking") return "kitchen";
  return null;
}

export const FARM_READ_RESOURCE_LABELS: Readonly<Record<keyof FarmReadResources, string>> = {
  bulletin: "叮咚播报",
  farmCatalog: "农场目录",
  kitchen: "料理数据",
  ranch: "牧场数据",
};

export function shouldRetryFarmHarvest(issue: FarmHarvestAssistIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function shouldRetryFarmLandUpgrade(issue: FarmLandUpgradeIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function shouldRetryFarmPurchaseRequest(issue: FarmPurchaseRequestIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "onebot_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function shouldRetryFarmHarvestRequest(issue: FarmHarvestRequestIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "onebot_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function shouldRetryFarmPlantRequest(issue: FarmPlantRequestIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "onebot_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function shouldRetryRanchResidentAction(issue: RanchResidentActionIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function shouldRetryRanchCollection(issue: RanchCollectionIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function shouldRetryKitchenPurchase(issue: KitchenPurchaseIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function shouldRetryKitchenShopRefresh(issue: KitchenShopRefreshIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}

export function shouldRetryKitchenCook(issue: KitchenCookIssue): boolean {
  return (
    issue.code === "network_unavailable" ||
    issue.code === "farm_unavailable" ||
    issue.code === "upstream_contract_unavailable" ||
    issue.code === "unexpected_response"
  );
}
