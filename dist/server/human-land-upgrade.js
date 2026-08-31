import { createHash } from "node:crypto";

import { landTierByLevel } from "../content.js";
import { advance, upgradeLand } from "../engine.js";
import { replaceFarm } from "../store.js";
import { projectHumanField } from "./human-structured.js";
import {
    createMinimalHumanActionReceipt,
    replayMinimalHumanActionReceipt,
} from "../minimal-action-receipt.js";

function responseFor(farm, now, result) {
    const resource = projectHumanField(farm, now);
    return {
        data: { result, resource: resource.data },
        revision: resource.revision,
        server_time: resource.server_time,
    };
}

function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value && typeof value === "object") {
        const sorted = {};
        for (const key of Object.keys(value).sort())
            sorted[key] = canonicalize(value[key]);
        return sorted;
    }
    return value;
}

function fingerprint(body) {
    return createHash("sha256")
        .update(JSON.stringify(canonicalize({
        farm_human_key: body.farm_human_key,
        expected_farm_doorplate: body.expected_farm_doorplate,
        expected_revision: body.expected_revision,
        payload: body.payload,
    })))
        .digest("hex");
}

function errorResponse(code, message, currentRevision) {
    const error = { code, message };
    if (currentRevision)
        error.current_revision = currentRevision;
    return { status: 409, json: { error } };
}

function landSnapshot(farm) {
    const land = landTierByLevel(farm.landTier);
    if (land.tier !== farm.landTier)
        throw new Error("Farm land tier is unavailable");
    return {
        tier: farm.landTier,
        name: land.name,
        plots: farm.plots.length,
    };
}

/**
 * Execute the existing land upgrade authority on a clone and persist it once.
 * This adapter owns only the Human idempotency/revision boundary; all costs,
 * requirements, plot creation, and result wording remain owned by upgradeLand.
 */
export function handleHumanLandUpgrade(farm, body, now = Date.now()) {
    const receipts = farm.doorbellHumanLandUpgradeReceipts ?? {};
    const key = body.idempotency_key;
    const fp = fingerprint(body);
    if (Object.prototype.hasOwnProperty.call(receipts, key)) {
        const old = receipts[key];
        if (old?.fingerprint !== fp)
            return errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
        try {
            const response = replayMinimalHumanActionReceipt(old, fp, responseFor(farm, now, null));
            return response
                ? { status: 200, json: response }
                : errorResponse("idempotency_conflict", "This idempotency key was used for a different request");
        }
        catch {
            return { status: 503, json: { error: { code: "farm_unavailable", message: "The farm field could not be read" } } };
        }
    }

    let current;
    try {
        current = projectHumanField(farm, now);
    }
    catch {
        return { status: 503, json: { error: { code: "farm_unavailable", message: "The farm field could not be read" } } };
    }
    if (current.revision !== body.expected_revision)
        return errorResponse("state_conflict", "The farm field has changed", current.revision);

    const working = structuredClone(farm);
    try {
        advance(working, now);
        const previousLand = landSnapshot(working);
        const coinsBefore = working.coins;
        const upgraded = upgradeLand(working, now);
        if (!upgraded.ok)
            return errorResponse("land_upgrade_rejected", upgraded.error, current.revision);

        const upgradedLand = landSnapshot(working);
        const result = {
            receipt_id: key,
            previous_land: previousLand,
            upgraded_land: upgradedLand,
            farm_coins_spent: coinsBefore - working.coins,
            message: upgraded.text,
        };
        const response = responseFor(working, now, result);
        working.doorbellHumanLandUpgradeReceipts = {
            ...(working.doorbellHumanLandUpgradeReceipts ?? {}),
            [key]: createMinimalHumanActionReceipt(fp, response),
        };
        replaceFarm(farm.id, working);
        return { status: 200, json: response };
    }
    catch {
        return { status: 503, json: { error: { code: "farm_unavailable", message: "The land upgrade could not be saved" } } };
    }
}
