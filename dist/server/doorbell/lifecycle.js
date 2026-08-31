import { randomUUID } from "node:crypto";
import { hasDamagedPublicName } from "../../game.js";
import {
    allFarms,
    createDoorbellFarm,
    DoorbellFarmCreationError,
    DoorbellWelcomeRewardError,
    findDoorbellFarmCreation,
    grantDoorbellWelcomeReward,
    playerFarms,
    save,
    withWorldCommitContext,
} from "../../store.js";
import {
    MAX_BODY_BYTES,
    MAX_FARMS,
    REGISTRATION_CAP,
    REGISTRATION_CLOSED_TEXT,
    REGISTRATION_FULL_TEXT,
    REGISTRATION_OPEN,
} from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import {
    DOORBELL_SERVICE_TOKEN,
    UUID_RE,
    internalServiceError,
    isPlainObject,
    legacyAgentAccessRevoked,
    requireDoorbellService,
    serviceTokenMatches,
    validateFarmBinding,
} from "./contract.js";

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

export async function handleDoorbellFarmCreation(req, res, method) {
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

export async function handleDoorbellMcpMigration(req, res, method, runtime) {
    if (!requireDoorbellService(req, res, method))
        return;
    if (!runtime?.database || !runtime?.backend)
        return internalServiceError(res, 503, "migration_unavailable", "The farm migration service is unavailable");
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = isPlainObject(body) ? Object.keys(body) : [];
        if (keys.length !== 4 || !keys.includes("migration_id") || !keys.includes("resident_id") || !keys.includes("farm_human_key") || !keys.includes("expected_farm_doorplate") || !UUID_RE.test(String(body.migration_id ?? "")) || !UUID_RE.test(String(body.resident_id ?? "")))
            return internalServiceError(res, 400, "invalid_request", "Submit only a valid migration_id, resident_id, farm_human_key, and expected_farm_doorplate");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return internalServiceError(res, binding.error.status, binding.error.code, binding.error.message);
        const farm = binding.farm;
        const migrationId = String(body.migration_id);
        const residentId = String(body.resident_id);
        const existing = farm.doorbellMcpMigration;
        if (existing) {
            if (existing.migrationId !== migrationId || existing.residentId !== residentId)
                return internalServiceError(res, 409, "migration_conflict", "This farm was migrated by a different operation");
        }
        const legacyGold = existing?.legacyGold ?? farm.coins;
        const legacySilver = existing?.legacySilver ?? farm.silver;
        if (existing) {
            const previousAgentKey = farm.agentKey;
            if (farm.agentKey !== undefined)
                delete farm.agentKey;
            try {
                // Replays still pass through the coordinator so an existing
                // farm migration and its resident/account rows are checked in
                // the same durable transaction.
                withWorldCommitContext({ balanceAuthority: "ledger", actor: "system" }, () => save());
            }
            catch (error) {
                if (previousAgentKey !== undefined)
                    farm.agentKey = previousAgentKey;
                throw error;
            }
            return jsonOut(res, 200, migrationReceipt(farm));
        }
        const hadPreviousAgentKey = Object.hasOwn(farm, "agentKey");
        const previousAgentKey = farm.agentKey;
        delete farm.agentKey;
        farm.doorbellMcpMigration = {
            migrationId,
            residentId,
            legacyGold,
            legacySilver,
            confirmationId: randomUUID(),
            revokedAt: new Date(runtime.now?.() ?? Date.now()).toISOString(),
            legacyMcpRevoked: true,
        };
        try {
            withWorldCommitContext({ balanceAuthority: "ledger", actor: "system" }, () => save());
        }
        catch (error) {
            if (hadPreviousAgentKey)
                farm.agentKey = previousAgentKey;
            else
                delete farm.agentKey;
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

export async function handleDoorbellFarmExecution(req, res, method, executeFarmAction) {
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
        const publicResult = {
            ok: out.json?.ok === true,
            text: typeof out.json?.text === "string" ? out.json.text : "农场没有返回可读取的结果。",
            ...(body.detail === true && isPlainObject(out.json?.farm) ? { farm: out.json.farm } : {}),
        };
        return jsonOut(res, out.status, publicResult);
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return internalServiceError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-farm-execution] action failed");
        return internalServiceError(res, 503, "farm_unavailable", "The farm action could not be completed");
    }
}

export async function handleDoorbellWelcomeReward(req, res, method) {
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
