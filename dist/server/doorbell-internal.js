import { randomUUID, timingSafeEqual } from "node:crypto";
import { hasDamagedPublicName } from "../game.js";
import {
    allFarms,
    createDoorbellFarm,
    DoorbellFarmCreationError,
    DoorbellWelcomeRewardError,
    findDoorbellFarmCreation,
    getFarm,
    getGlimmerWorld,
    grantDoorbellWelcomeReward,
    playerFarms,
    save,
} from "../store.js";
import {
    MAX_BODY_BYTES,
    MAX_FARMS,
    REGISTRATION_CAP,
    REGISTRATION_CLOSED_TEXT,
    REGISTRATION_FULL_TEXT,
    REGISTRATION_OPEN,
} from "../config.js";
import { PublicSyncError } from "../public-sync.js";
import { jsonOut, readJsonBody } from "./http.js";
import { projectHumanField } from "./human-structured.js";
import { handleHumanHarvestAssist } from "./human-harvest-assist.js";
import { projectHumanFarmCatalog } from "./farm-catalog-structured.js";
import { projectHumanBulletin } from "./bulletin-structured.js";
import { handleHumanCropCodexAction } from "./crop-codex-action.js";
import { handleHumanSmeltingAction } from "./smelting-action.js";
import { handleHumanFarmSettingsAction } from "./farm-settings-action.js";
import { handleHumanExpeditionAction } from "./expedition-action.js";
import { projectHumanGlimmer } from "./glimmer-structured.js";
import { projectHumanKitchen } from "./kitchen-structured.js";
import { handleHumanKitchenPurchase } from "./kitchen-purchase-action.js";
import { handleHumanKitchenCookAction } from "./kitchen-cook-action.js";
import { handleHumanKitchenInventoryAction } from "./kitchen-inventory-action.js";
import { handleHumanKitchenShopRefresh } from "./kitchen-shop-refresh-action.js";
import { handleHumanOriginalPlantAction } from "./original-plant-action.js";
import { handleHumanMarketAction } from "./market-action.js";
import { handleHumanCrossFarmMarketAction } from "./market-cross-farm-action.js";
import { handleHumanNeighborhoodMessageAction } from "./neighborhood-message-action.js";
import { projectHumanRanch } from "./ranch-structured.js";
import { handleHumanRanchCollection } from "./ranch-collection-action.js";
import { handleHumanRanchDecorationAction } from "./ranch-decoration-action.js";
import { handleHumanRanchInteractionAction } from "./ranch-interaction-action.js";
import { handleHumanRanchResidentAction } from "./ranch-resident-action.js";
import { readHumanTogether } from "./together-structured.js";

const DOORBELL_SERVICE_TOKEN = process.env.AIFARM_DOORBELL_SERVICE_TOKEN ?? "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FARM_DOORPLATE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const DOORBELL_EXECUTION_RESERVED_PARAMS = new Set([
    "action",
    "token",
    "by",
    "farm",
    "farmId",
    "farm_id",
    "humanKey",
    "human_key",
    "agentKey",
    "agent_key",
    "detail",
    "verbose",
]);
const DOORBELL_EXECUTION_BLOCKED_ACTIONS = new Set([
    "new-token",
    "npc",
    "hot",
    "ranking",
    "adventure",
    "exp",
]);
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const farmByHumanKey = (humanKey) => playerFarms().find((farm) => farm.humanKey === humanKey);
export const legacyAgentAccessRevoked = (farm) => farm?.doorbellMcpMigration?.legacyMcpRevoked === true;

function migrationReceipt(farm) {
    const migration = farm.doorbellMcpMigration;
    return {
        migration_id: migration.migrationId,
        confirmation_id: migration.confirmationId,
        farm_doorplate: farm.id,
        legacy_mcp_revoked: true,
        revoked_at: migration.revokedAt,
    };
}

export function internalServiceError(res, status, code, message) {
    return jsonOut(res, status, { ok: false, error: { code, message } });
}

function humanFieldError(res, status, code, message) {
    return jsonOut(res, status, { error: { code, message } });
}

function serviceTokenMatches(authorization) {
    const prefix = "Bearer ";
    if (!DOORBELL_SERVICE_TOKEN || typeof authorization !== "string" || !authorization.startsWith(prefix))
        return false;
    const received = Buffer.from(authorization.slice(prefix.length), "utf8");
    const expected = Buffer.from(DOORBELL_SERVICE_TOKEN, "utf8");
    return received.length === expected.length && timingSafeEqual(received, expected);
}

function requireDoorbellService(req, res, method) {
    if (!DOORBELL_SERVICE_TOKEN) {
        internalServiceError(res, 503, "service_not_configured", "Doorbell farm service is not configured");
        return false;
    }
    if (!serviceTokenMatches(req.headers.authorization)) {
        internalServiceError(res, 401, "authentication_required", "A valid Doorbell service credential is required");
        return false;
    }
    if (method !== "POST") {
        internalServiceError(res, 405, "method_not_allowed", "Use POST for this service endpoint");
        return false;
    }
    return true;
}

function requireDoorbellHumanFieldService(req, res, method) {
    if (!DOORBELL_SERVICE_TOKEN) {
        humanFieldError(res, 503, "farm_unavailable", "Doorbell farm service is not configured");
        return false;
    }
    if (!serviceTokenMatches(req.headers.authorization)) {
        humanFieldError(res, 401, "authentication_required", "A valid Doorbell service credential is required");
        return false;
    }
    if (method !== "POST") {
        humanFieldError(res, 405, "invalid_request", "Use POST for this service endpoint");
        return false;
    }
    return true;
}

function validateFarmBinding(body) {
    const humanKey = typeof body?.farm_human_key === "string" ? body.farm_human_key : "";
    const expectedDoorplate = typeof body?.expected_farm_doorplate === "string" ? body.expected_farm_doorplate : "";
    if (!humanKey)
        return { error: { status: 400, code: "invalid_request", message: "farm_human_key is required" } };
    if (!FARM_DOORPLATE_RE.test(expectedDoorplate))
        return { error: { status: 400, code: "invalid_request", message: "expected_farm_doorplate is invalid" } };
    const farm = farmByHumanKey(humanKey);
    if (!farm)
        return { error: { status: 404, code: "farm_credential_not_found", message: "The farm human credential is invalid" } };
    if (farm.id !== expectedDoorplate)
        return { error: { status: 409, code: "farm_doorplate_mismatch", message: "The farm human credential does not match the expected doorplate" } };
    return { farm };
}

function doorbellFarmCreationReceipt(creationId, result) {
    const farm = result.farm;
    return {
        creation_id: creationId,
        created: result.created,
        farm_doorplate: farm.id,
        farm_name: farm.name,
        ai_name: farm.aiName,
        human_name: farm.humanName,
        farm_human_key: farm.humanKey,
        created_at: new Date(farm.createdAt).toISOString(),
    };
}

async function handleDoorbellHumanFieldRead(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (!isPlainObject(body)
            || keys.length !== 2
            || !keys.includes("farm_human_key")
            || !keys.includes("expected_farm_doorplate")
            || typeof body.farm_human_key !== "string"
            || !body.farm_human_key
            || typeof body.expected_farm_doorplate !== "string"
            || !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate))
            return humanFieldError(res, 400, "invalid_request", "Submit only farm_human_key and expected_farm_doorplate");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return jsonOut(res, 200, projectHumanField(binding.farm, Date.now()));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-field] field read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The farm field could not be read");
    }
}

async function handleDoorbellHumanCatalogRead(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (!isPlainObject(body)
            || keys.length !== 2
            || !keys.includes("farm_human_key")
            || !keys.includes("expected_farm_doorplate")
            || typeof body.farm_human_key !== "string"
            || !body.farm_human_key
            || typeof body.expected_farm_doorplate !== "string"
            || !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate))
            return humanFieldError(res, 400, "invalid_request", "Submit only farm_human_key and expected_farm_doorplate");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return jsonOut(res, 200, projectHumanFarmCatalog(binding.farm, Date.now()));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-catalog] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The farm catalog could not be read");
    }
}

async function handleDoorbellHumanBulletinRead(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (!isPlainObject(body)
            || keys.length !== 2
            || !keys.includes("farm_human_key")
            || !keys.includes("expected_farm_doorplate")
            || typeof body.farm_human_key !== "string"
            || !body.farm_human_key
            || typeof body.expected_farm_doorplate !== "string"
            || !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate))
            return humanFieldError(res, 400, "invalid_request", "Submit only farm_human_key and expected_farm_doorplate");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return jsonOut(res, 200, projectHumanBulletin(binding.farm, Date.now()));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-bulletin] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The farm bulletin could not be read");
    }
}

async function handleDoorbellHumanKitchenRead(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (!isPlainObject(body)
            || keys.length !== 2
            || !keys.includes("farm_human_key")
            || !keys.includes("expected_farm_doorplate")
            || typeof body.farm_human_key !== "string"
            || !body.farm_human_key
            || typeof body.expected_farm_doorplate !== "string"
            || !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate))
            return humanFieldError(res, 400, "invalid_request", "Submit only farm_human_key and expected_farm_doorplate");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return jsonOut(res, 200, projectHumanKitchen(binding.farm, Date.now()));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-kitchen] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The farm kitchen could not be read");
    }
}

async function handleDoorbellHumanRanchRead(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (!isPlainObject(body)
            || keys.length !== 2
            || !keys.includes("farm_human_key")
            || !keys.includes("expected_farm_doorplate")
            || typeof body.farm_human_key !== "string"
            || !body.farm_human_key
            || typeof body.expected_farm_doorplate !== "string"
            || !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate))
            return humanFieldError(res, 400, "invalid_request", "Submit only farm_human_key and expected_farm_doorplate");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return jsonOut(res, 200, projectHumanRanch(binding.farm, Date.now()));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-ranch] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The ranch could not be read");
    }
}
async function handleDoorbellHumanKitchenPurchase(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanKitchenPurchase(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The kitchen purchase could not be completed");
    }
}
async function handleDoorbellHumanKitchenCook(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanKitchenCookAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The kitchen cook could not be completed");
    }
}
async function handleDoorbellHumanKitchenShopRefresh(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanKitchenShopRefresh(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The kitchen shop refresh could not be completed");
    }
}
async function handleDoorbellHumanRanchResidentAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanRanchResidentAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The ranch resident action could not be completed");
    }
}
async function handleDoorbellHumanRanchDecorationAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanRanchDecorationAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The ranch decoration action could not be completed");
    }
}
async function handleDoorbellHumanRanchCollection(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanRanchCollection(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The ranch collection could not be completed");
    }
}
async function handleDoorbellHumanFarmSettingsAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanFarmSettingsAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The farm settings could not be saved");
    }
}
async function handleDoorbellHumanOriginalPlantAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanOriginalPlantAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The original plant design could not be completed");
    }
}
async function handleDoorbellHumanCropCodexAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanCropCodexAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The crop codex action could not be completed");
    }
}
async function handleDoorbellHumanSmeltingAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanSmeltingAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The smelting action could not be completed");
    }
}
async function handleDoorbellHumanKitchenInventoryAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanKitchenInventoryAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The kitchen inventory action could not be completed");
    }
}
async function handleDoorbellHumanExpeditionAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanExpeditionAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The expedition action could not be completed");
    }
}
async function handleDoorbellHumanRanchInteractionAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanRanchInteractionAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The ranch interaction could not be completed");
    }
}
async function handleDoorbellHumanMarketAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = body.action === "buy" || body.action === "barter-accept"
            ? handleHumanCrossFarmMarketAction(binding.farm, getFarm(body.seller_doorplate), body)
            : handleHumanMarketAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The market action could not be completed");
    }
}
async function handleDoorbellHumanNeighborhoodMessageAction(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanNeighborhoodMessageAction(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The neighborhood message could not be sent");
    }
}
async function handleDoorbellHumanHarvestAssist(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method)) return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        const allowedKeys = ["farm_human_key", "expected_farm_doorplate", "idempotency_key", "expected_revision", "payload"];
        if (!isPlainObject(body)
            || keys.length !== allowedKeys.length
            || !keys.every((key) => allowedKeys.includes(key))
            || typeof body.farm_human_key !== "string"
            || !body.farm_human_key.trim()
            || typeof body.idempotency_key !== "string"
            || !body.idempotency_key.trim()
            || typeof body.expected_revision !== "string"
            || !body.expected_revision.trim()
            || !isPlainObject(body.payload)
            || Object.keys(body.payload).length)
            return humanFieldError(res, 400, "invalid_request", "Submit exactly the five harvest-assist fields");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanHarvestAssist(binding.farm, body);
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The harvest could not be completed");
    }
}

async function handleDoorbellHumanGlimmerRead(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (!isPlainObject(body)
            || keys.length !== 2
            || !keys.includes("farm_human_key")
            || !keys.includes("expected_farm_doorplate")
            || typeof body.farm_human_key !== "string"
            || !body.farm_human_key
            || typeof body.expected_farm_doorplate !== "string"
            || !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate))
            return humanFieldError(res, 400, "invalid_request", "Submit only farm_human_key and expected_farm_doorplate");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return jsonOut(res, 200, projectHumanGlimmer(binding.farm, getGlimmerWorld(), Date.now()));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-glimmer] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The Glimmer field could not be read");
    }
}

async function handleDoorbellHumanTogetherRead(req, res, method) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (!isPlainObject(body)
            || keys.length !== 2
            || !keys.includes("farm_human_key")
            || !keys.includes("expected_farm_doorplate")
            || typeof body.farm_human_key !== "string"
            || !body.farm_human_key
            || typeof body.expected_farm_doorplate !== "string"
            || !FARM_DOORPLATE_RE.test(body.expected_farm_doorplate))
            return humanFieldError(res, 400, "invalid_request", "Submit only farm_human_key and expected_farm_doorplate");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return jsonOut(res, 200, readHumanTogether(binding.farm, Date.now()));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-together] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The Together story could not be read");
    }
}

async function handleDoorbellFarmCreation(req, res, method) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (keys.length !== 4 || !keys.includes("creation_id") || !keys.includes("farm_name") || !keys.includes("ai_name") || !keys.includes("human_name") || !UUID_RE.test(String(body?.creation_id ?? "")))
            return internalServiceError(res, 400, "invalid_request", "Submit only a valid creation_id, farm_name, ai_name, and human_name");
        const farmName = typeof body.farm_name === "string" ? body.farm_name : "";
        const aiName = typeof body.ai_name === "string" ? body.ai_name : "";
        const humanName = typeof body.human_name === "string" ? body.human_name : "";
        if (!farmName.trim() || !aiName.trim() || !humanName.trim() || hasDamagedPublicName(farmName) || hasDamagedPublicName(aiName) || hasDamagedPublicName(humanName))
            return internalServiceError(res, 400, "invalid_request", "Farm creation names are invalid");
        const creationId = String(body.creation_id);
        let result = findDoorbellFarmCreation(creationId, farmName, { aiName, humanName });
        if (!result) {
            if (!REGISTRATION_OPEN)
                return internalServiceError(res, 503, "registration_unavailable", REGISTRATION_CLOSED_TEXT);
            if (REGISTRATION_CAP > 0 && playerFarms().length >= REGISTRATION_CAP)
                return internalServiceError(res, 503, "registration_unavailable", REGISTRATION_FULL_TEXT);
            if (allFarms().length >= MAX_FARMS)
                return internalServiceError(res, 503, "registration_unavailable", "Farm capacity is full");
            result = createDoorbellFarm(creationId, farmName, { aiName, humanName });
        }
        return jsonOut(res, result.created ? 201 : 200, doorbellFarmCreationReceipt(creationId, result));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (error instanceof DoorbellFarmCreationError) {
            if (error.code === "creation_conflict")
                return internalServiceError(res, 409, error.code, error.message);
            return internalServiceError(res, 500, error.code, error.message);
        }
        console.error("[doorbell-farm-creation] farm creation failed");
        return internalServiceError(res, 503, "farm_creation_unavailable", "The farm could not be created");
    }
}

async function handleDoorbellMcpMigration(req, res, method) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (keys.length !== 3 || !keys.includes("migration_id") || !keys.includes("farm_human_key") || !keys.includes("expected_farm_doorplate") || !UUID_RE.test(String(body.migration_id ?? "")))
            return internalServiceError(res, 400, "invalid_request", "Submit only a valid migration_id, farm_human_key, and expected_farm_doorplate");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return internalServiceError(res, binding.error.status, binding.error.code, binding.error.message);
        const farm = binding.farm;
        const migrationId = String(body.migration_id);
        const existing = farm.doorbellMcpMigration;
        if (existing) {
            if (existing.migrationId !== migrationId)
                return internalServiceError(res, 409, "migration_conflict", "This farm was migrated by a different operation");
            if (farm.agentKey !== undefined) {
                const previousAgentKey = farm.agentKey;
                farm.agentKey = undefined;
                try {
                    save();
                }
                catch (error) {
                    farm.agentKey = previousAgentKey;
                    throw error;
                }
            }
            return jsonOut(res, 200, migrationReceipt(farm));
        }
        const previousAgentKey = farm.agentKey;
        farm.agentKey = undefined;
        farm.doorbellMcpMigration = {
            migrationId,
            confirmationId: randomUUID(),
            revokedAt: new Date().toISOString(),
            legacyMcpRevoked: true,
        };
        try {
            save();
        }
        catch (error) {
            farm.agentKey = previousAgentKey;
            delete farm.doorbellMcpMigration;
            throw error;
        }
        return jsonOut(res, 200, migrationReceipt(farm));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-mcp-migration] farm access revocation failed");
        return internalServiceError(res, 503, "migration_unavailable", "The farm migration could not be completed");
    }
}

async function handleDoorbellFarmExecution(req, res, method, executeFarmAction) {
    if (!requireDoorbellService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        const allowedKeys = new Set(["farm_human_key", "expected_farm_doorplate", "action", "params", "detail"]);
        if (!isPlainObject(body) || keys.some((key) => !allowedKeys.has(key)) || keys.some((key) => key !== "detail" && body[key] === undefined))
            return internalServiceError(res, 400, "invalid_request", "Submit only farm_human_key, expected_farm_doorplate, action, params, and optional detail");
        if (typeof body.action !== "string" || !body.action.trim() || !isPlainObject(body.params) || (body.detail !== undefined && typeof body.detail !== "boolean"))
            return internalServiceError(res, 400, "invalid_request", "action, params, or detail is invalid");
        if (DOORBELL_EXECUTION_BLOCKED_ACTIONS.has(body.action))
            return internalServiceError(res, 400, "unsupported_action", "This legacy farm action is not available through Doorbell");
        const forbidden = Object.keys(body.params).find((key) => DOORBELL_EXECUTION_RESERVED_PARAMS.has(key));
        if (forbidden)
            return internalServiceError(res, 400, "invalid_request", `params.${forbidden} is reserved`);
        const binding = validateFarmBinding(body);
        if (binding.error)
            return internalServiceError(res, binding.error.status, binding.error.code, binding.error.message);
        if (!legacyAgentAccessRevoked(binding.farm))
            return internalServiceError(res, 409, "farm_migration_required", "Legacy farm access must be revoked before Doorbell execution is enabled");
        const out = executeFarmAction(binding.farm, body.action, body.params, body.detail === true, Date.now());
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-farm-execution] action failed");
        return internalServiceError(res, 503, "farm_unavailable", "The farm action could not be completed");
    }
}

async function handleDoorbellWelcomeReward(req, res, method) {
    if (!DOORBELL_SERVICE_TOKEN)
        return jsonOut(res, 503, { ok: false, error: { code: "service_not_configured", message: "Doorbell reward service is not configured" } });
    if (!serviceTokenMatches(req.headers.authorization))
        return jsonOut(res, 401, { ok: false, error: { code: "authentication_required", message: "A valid Doorbell service credential is required" } });
    if (method !== "POST")
        return jsonOut(res, 405, { ok: false, error: { code: "method_not_allowed", message: "Use POST for this service endpoint" } });
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
        if (keys.length !== 2 || !keys.includes("grant_id") || !keys.includes("human_key"))
            throw new DoorbellWelcomeRewardError(400, "invalid_request", "Submit only grant_id and human_key");
        const result = grantDoorbellWelcomeReward(body.human_key, body.grant_id);
        return jsonOut(res, 200, {
            ok: true,
            applied: result.applied,
            grant_id: result.grantId,
            farm_doorplate: result.farmId,
            reward: {
                seed: { id: result.seedId, name: result.seedName, rarity: "SSR", quantity: 1 },
                silver: 200,
            },
        });
    }
    catch (error) {
        if (error instanceof DoorbellWelcomeRewardError)
            return jsonOut(res, error.status, { ok: false, error: { code: error.code, message: error.message } });
        if (error instanceof PublicSyncError)
            return jsonOut(res, 400, { ok: false, error: { code: "invalid_request", message: "The request body must be valid JSON" } });
        console.error("[doorbell-reward] grant failed");
        return jsonOut(res, 503, { ok: false, error: { code: "reward_unavailable", message: "The farm reward could not be granted" } });
    }
}

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
