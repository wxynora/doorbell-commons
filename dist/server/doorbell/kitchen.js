import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import { projectHumanKitchen } from "../kitchen-structured.js";
import { handleHumanKitchenPurchase } from "../kitchen-purchase-action.js";
import { handleHumanKitchenCookAction } from "../kitchen-cook-action.js";
import { handleHumanKitchenInventoryAction } from "../kitchen-inventory-action.js";
import { handleHumanKitchenShopRefresh } from "../kitchen-shop-refresh-action.js";
import { handleHumanKitchenShopOpen } from "../kitchen-shop-open-action.js";
import {
    FARM_DOORPLATE_RE,
    humanFieldError,
    isPlainObject,
    requireDoorbellHumanFieldService,
    validateFarmBinding,
} from "./contract.js";

export async function handleDoorbellHumanKitchenRead(req, res, method, careerBenefitsForFarm) {
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
        return jsonOut(res, 200, projectHumanKitchen(binding.farm, Date.now(), careerBenefitsForFarm?.(binding.farm)));
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-kitchen] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "The farm kitchen could not be read");
    }
}

export async function handleDoorbellHumanKitchenShopOpen(req, res, method, careerBenefitsForFarm) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanKitchenShopOpen(binding.farm, body, Date.now(), careerBenefitsForFarm?.(binding.farm));
        return jsonOut(res, out.status, out.json);
    }
    catch (error) {
        if (error instanceof PublicSyncError) {
            const tooLarge = error.status === 413;
            return humanFieldError(res, tooLarge ? 413 : 400, tooLarge ? "body_too_large" : "invalid_request", tooLarge ? "The request body is too large" : "The request body must be valid JSON");
        }
        return humanFieldError(res, 503, "farm_unavailable", "The kitchen shop could not be opened");
    }
}

export async function handleDoorbellHumanKitchenPurchase(req, res, method, careerBenefitsForFarm) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanKitchenPurchase(binding.farm, body, Date.now(), careerBenefitsForFarm?.(binding.farm));
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

export async function handleDoorbellHumanKitchenCook(req, res, method, careerBenefitsForFarm) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanKitchenCookAction(binding.farm, body, Date.now(), careerBenefitsForFarm?.(binding.farm));
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

export async function handleDoorbellHumanKitchenShopRefresh(req, res, method, careerBenefitsForFarm) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanKitchenShopRefresh(binding.farm, body, Date.now(), careerBenefitsForFarm?.(binding.farm));
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

export async function handleDoorbellHumanKitchenInventoryAction(req, res, method, careerBenefitsForFarm) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!isPlainObject(body))
            return humanFieldError(res, 400, "invalid_request", "The request body must be an object");
        const binding = validateFarmBinding(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const out = handleHumanKitchenInventoryAction(binding.farm, body, Date.now(), careerBenefitsForFarm?.(binding.farm));
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
