import {
    handleDoorbellHumanBulletinRead,
    handleDoorbellHumanCatalogRead,
    handleDoorbellHumanCropCodexAction,
    handleDoorbellHumanFarmSettingsAction,
    handleDoorbellHumanFieldRead,
    handleDoorbellHumanHarvestAssist,
    handleDoorbellHumanOriginalPlantAction,
    handleDoorbellHumanSmeltingAction,
} from "./human-farm.js";
import {
    handleDoorbellHumanKitchenCook,
    handleDoorbellHumanKitchenInventoryAction,
    handleDoorbellHumanKitchenPurchase,
    handleDoorbellHumanKitchenRead,
    handleDoorbellHumanKitchenShopRefresh,
} from "./kitchen.js";
import {
    handleDoorbellHumanRanchCollection,
    handleDoorbellHumanRanchDecorationAction,
    handleDoorbellHumanRanchInteractionAction,
    handleDoorbellHumanRanchRead,
    handleDoorbellHumanRanchResidentAction,
} from "./ranch.js";
import {
    handleDoorbellHumanExpeditionAction,
    handleDoorbellHumanGlimmerRead,
    handleDoorbellHumanMarketAction,
    handleDoorbellHumanNeighborhoodMessageAction,
    handleDoorbellHumanTogetherRead,
} from "./world-social.js";
import {
    handleDoorbellFarmCreation,
    handleDoorbellFarmExecution,
    handleDoorbellMcpMigration,
    handleDoorbellWelcomeReward,
} from "./lifecycle.js";

export function createDoorbellInternalHandler(executeFarmAction) {
    return async function handleDoorbellInternal(req, res, parts, method) {
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "catalog" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanCatalogRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "bulletin" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanBulletinRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanKitchenRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "purchase" && parts.length === 5) {
            await handleDoorbellHumanKitchenPurchase(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "cook" && parts.length === 5) {
            await handleDoorbellHumanKitchenCook(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "shop" && parts[5] === "refresh" && parts.length === 6) {
            await handleDoorbellHumanKitchenShopRefresh(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "inventory" && parts[5] === "action" && parts.length === 6) {
            await handleDoorbellHumanKitchenInventoryAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "glimmer" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanGlimmerRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "together" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanTogetherRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "field" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanFieldRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanRanchRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "resident-action" && parts.length === 5) {
            await handleDoorbellHumanRanchResidentAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "decoration-action" && parts.length === 5) {
            await handleDoorbellHumanRanchDecorationAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "collect" && parts.length === 5) {
            await handleDoorbellHumanRanchCollection(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "settings" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanFarmSettingsAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "original-plant" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanOriginalPlantAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "codex" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanCropCodexAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "smelting" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanSmeltingAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "expedition" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanExpeditionAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "interaction" && parts[5] === "action" && parts.length === 6) {
            await handleDoorbellHumanRanchInteractionAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "market" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanMarketAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "neighborhood" && parts[4] === "message" && parts[5] === "action" && parts.length === 6) {
            await handleDoorbellHumanNeighborhoodMessageAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "field" && parts[4] === "harvest-assist" && parts.length === 5) { await handleDoorbellHumanHarvestAssist(req, res, method); return true; }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "welcome-reward" && parts.length === 3) {
            await handleDoorbellWelcomeReward(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "farm-creation" && parts.length === 3) {
            await handleDoorbellFarmCreation(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "mcp-migrations" && parts[3] === "revoke-farm-access" && parts.length === 4) {
            await handleDoorbellMcpMigration(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "farm-actions" && parts[3] === "execute" && parts.length === 4) {
            await handleDoorbellFarmExecution(req, res, method, executeFarmAction);
            return true;
        }
        return false;
    };
}
