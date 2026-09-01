import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { playerFarms } from "../../store.js";
import { jsonOut, readJsonBody } from "../http.js";
import { projectHumanRanch } from "../ranch-structured.js";
import { handleHumanRanchCollection } from "../ranch-collection-action.js";
import { handleHumanRanchDecorationAction } from "../ranch-decoration-action.js";
import { handleHumanRanchInteractionAction } from "../ranch-interaction-action.js";
import { handleHumanRanchResidentAction } from "../ranch-resident-action.js";
import {
    FARM_DOORPLATE_RE,
    humanFieldError,
    isPlainObject,
    requireDoorbellHumanFieldService,
    validateFarmBinding,
} from "./contract.js";

export async function handleDoorbellHumanRanchRead(req, res, method) {
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
        return jsonOut(res, 200, projectHumanRanch(binding.farm, Date.now(), playerFarms()));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-ranch] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The ranch could not be read");
    }
}

export async function handleDoorbellHumanRanchResidentAction(req, res, method) {
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

export async function handleDoorbellHumanRanchDecorationAction(req, res, method) {
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

export async function handleDoorbellHumanRanchCollection(req, res, method) {
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

export async function handleDoorbellHumanRanchInteractionAction(req, res, method) {
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
