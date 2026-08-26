import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { getFarm, getGlimmerWorld } from "../../store.js";
import { jsonOut, readJsonBody } from "../http.js";
import { handleHumanExpeditionAction } from "../expedition-action.js";
import { projectHumanGlimmer } from "../glimmer-structured.js";
import { handleHumanMarketAction } from "../market-action.js";
import { handleHumanCrossFarmMarketAction } from "../market-cross-farm-action.js";
import { handleHumanNeighborhoodMessageAction } from "../neighborhood-message-action.js";
import { readHumanTogether } from "../together-structured.js";
import {
    FARM_DOORPLATE_RE,
    humanFieldError,
    isPlainObject,
    requireDoorbellHumanFieldService,
    validateFarmBinding,
} from "./contract.js";

export async function handleDoorbellHumanGlimmerRead(req, res, method) {
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

export async function handleDoorbellHumanTogetherRead(req, res, method) {
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

export async function handleDoorbellHumanExpeditionAction(req, res, method) {
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

export async function handleDoorbellHumanMarketAction(req, res, method) {
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

export async function handleDoorbellHumanNeighborhoodMessageAction(req, res, method) {
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
