import type { ApiResult } from "../../../auth/auth-client";
import type { BoundFarmCatalogRead } from "../../../auth/farm-catalog-client";
import type {
  BoundFarmSettingsAction,
  FarmSettingsActionInput,
  FarmSettingsActionIssue,
} from "../../../auth/farm-settings-action-client";
import type { BoundKitchenRead } from "../../../auth/kitchen-client";
import type {
  BoundKitchenInventoryAction,
  KitchenInventoryActionInput,
  KitchenInventoryActionIssue,
} from "../../../auth/kitchen-inventory-action-client";
import type {
  BoundOriginalPlantAction,
  OriginalPlantActionInput,
  OriginalPlantActionIssue,
} from "../../../auth/original-plant-action-client";
import type { BoundRanchRead } from "../../../auth/ranch-client";
import type {
  BoundRanchDecorationAction,
  RanchDecorationActionInput,
  RanchDecorationActionIssue,
} from "../../../auth/ranch-decoration-action-client";
import type {
  BoundSmeltingAction,
  SmeltingActionInput,
  SmeltingActionIssue,
} from "../../../auth/smelting-action-client";
import type { FarmAssetKey } from "../../farm-asset-manifest";
import type {
  CropCodexActionExecutor,
  ExpeditionActionExecutor,
  MarketActionExecutor,
  RanchInteractionActionExecutor,
} from "../farm-action-panels";
import type {
  CookingCartCheckoutFeedback,
  CookingCartCheckoutLine,
  CookingShopRefreshFeedback,
  FarmCartCheckoutFeedback,
  FarmCartCheckoutLine,
  FarmShopOpenFeedback,
  ShopCartQuantities,
} from "../shop-panel";

export type FarmSceneId = "field" | "ranch" | "cooking" | "neighborhood";

export interface FarmToolOption {
  id: string;
  label: string;
  iconKey: FarmAssetKey;
}

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

export type FarmSettingsActionExecutor = (
  input: FarmSettingsActionInput,
) => Promise<ApiResult<BoundFarmSettingsAction, FarmSettingsActionIssue>>;

export type RanchDecorationActionExecutor = (
  input: RanchDecorationActionInput,
) => Promise<ApiResult<BoundRanchDecorationAction, RanchDecorationActionIssue>>;

export type OriginalPlantActionExecutor = (
  input: OriginalPlantActionInput,
) => Promise<ApiResult<BoundOriginalPlantAction, OriginalPlantActionIssue>>;

export type KitchenInventoryActionExecutor = (
  input: KitchenInventoryActionInput,
) => Promise<ApiResult<BoundKitchenInventoryAction, KitchenInventoryActionIssue>>;

export type SmeltingActionExecutor = (
  input: SmeltingActionInput,
) => Promise<ApiResult<BoundSmeltingAction, SmeltingActionIssue>>;

export interface OriginalPlantDraft {
  description: string;
  harvestText: string;
  latinName: string;
  name: string;
  sowingText: string;
}

export interface FarmToolPanelProps {
  activeScene: FarmSceneId;
  cart: ShopCartQuantities;
  cookingCheckoutFeedback?: CookingCartCheckoutFeedback | undefined;
  cookingShopRefreshFeedback?: CookingShopRefreshFeedback | undefined;
  farmCheckoutFeedback?: FarmCartCheckoutFeedback | undefined;
  farmShopOpenFeedback?: FarmShopOpenFeedback | undefined;
  farmCatalog?: BoundFarmCatalogRead | null;
  kitchen?: BoundKitchenRead | null;
  onClose: () => void;
  onChangeCartQuantity: (cartKey: string, delta: number, maxQuantity?: number) => void;
  onCheckoutCookingCart?: ((items: CookingCartCheckoutLine[]) => void) | undefined;
  onCheckoutFarmCart?: ((items: FarmCartCheckoutLine[]) => void) | undefined;
  onChangeOriginalPlantDraft: (draft: OriginalPlantDraft) => void;
  onChangeSettingsDraft: (draft: FarmSettingsDraft) => void;
  onCropCodexAction?: CropCodexActionExecutor | undefined;
  onFarmSettingsAction?: FarmSettingsActionExecutor | undefined;
  onExpeditionAction?: ExpeditionActionExecutor | undefined;
  onKitchenInventoryAction?: KitchenInventoryActionExecutor | undefined;
  onKitchenRecipeCook?: ((recipeId: string) => void) | undefined;
  onMarketAction?: MarketActionExecutor | undefined;
  onOriginalPlantAction?: OriginalPlantActionExecutor | undefined;
  onRanchDecorationAction?: RanchDecorationActionExecutor | undefined;
  onRanchInteractionAction?: RanchInteractionActionExecutor | undefined;
  onSmeltingAction?: SmeltingActionExecutor | undefined;
  onRetryCookingCheckout?: (() => void) | undefined;
  onRetryFarmCheckout?: (() => void) | undefined;
  onRetryFarmShopOpen?: (() => void) | undefined;
  onRefreshCookingShop?: (() => void) | undefined;
  originalPlantDraft: OriginalPlantDraft;
  preview: boolean;
  selectedCookingIngredientIds: readonly string[];
  ranch?: BoundRanchRead | null;
  settingsDraft: FarmSettingsDraft;
  tool: FarmToolOption;
}
