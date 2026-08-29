import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import { projectHumanField } from "../human-structured.js";
import { handleHumanHarvestAssist } from "../human-harvest-assist.js";
import { handleHumanLandUpgrade } from "../human-land-upgrade.js";
import { projectHumanFarmCatalog } from "../farm-catalog-structured.js";
import { projectHumanBulletin } from "../bulletin-structured.js";
import { handleHumanCropCodexAction } from "../crop-codex-action.js";
import { handleHumanSmeltingAction } from "../smelting-action.js";
import { handleHumanFarmSettingsAction } from "../farm-settings-action.js";
import { handleHumanOriginalPlantAction } from "../original-plant-action.js";
import { projectQixiMemorial } from "../qixi-memorial-structured.js";
import {
    FARM_DOORPLATE_RE,
    humanFieldError,
    isPlainObject,
    requireDoorbellHumanFieldService,
    validateFarmBinding,
} from "./contract.js";

export async function handleDoorbellHumanFieldRead(req, res, method) {
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

export async function handleDoorbellHumanCatalogRead(req, res, method) {
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

export async function handleDoorbellHumanBulletinRead(req, res, method) {
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

export async function handleDoorbellHumanQixiMemorialRead(req, res, method) {
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
        return jsonOut(res, 200, projectQixiMemorial(binding.farm, Date.now()));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-qixi-memorial] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The Qixi memorial could not be read");
    }
}

export async function handleDoorbellHumanFarmSettingsAction(req, res, method) {
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

export async function handleDoorbellHumanOriginalPlantAction(req, res, method) {
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

export async function handleDoorbellHumanCropCodexAction(req, res, method) {
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

export async function handleDoorbellHumanSmeltingAction(req, res, method) {
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

export async function handleDoorbellHumanHarvestAssist(req, res, method, careerBenefitsForFarm) {
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
        const out = handleHumanHarvestAssist(binding.farm, body, Date.now(), careerBenefitsForFarm?.(binding.farm));
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

export async function handleDoorbellHumanLandUpgrade(req, res, method) {
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
            return humanFieldError(res, 400, "invalid_request", "Submit exactly the five land-upgrade fields");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanLandUpgrade(binding.farm, body, Date.now());
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The land upgrade could not be completed");
    }
}
