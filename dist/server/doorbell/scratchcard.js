import { MAX_BODY_BYTES } from "../../config.js";
import { createLoungeScratchcardService } from "../../economy/lounge-scratchcard.js";
import { EconomyService } from "../../economy/economy-service.js";
import { runLingyeWorldTransaction } from "../../lingye-world-database.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import { humanFieldError, isPlainObject, requireDoorbellHumanFieldService, UUID_RE, validateFarmBinding } from "./contract.js";

const READ_FIELDS = new Set(["farm_human_key", "expected_farm_doorplate", "idempotency_key"]);
const BUY_FIELDS = new Set([...READ_FIELDS, "actor"]);

export function createDoorbellScratchcardRuntime(database, economyRules) {
    return createLoungeScratchcardService({
        database,
        commands: new EconomyService(database, { rules: economyRules }),
        transact: operation => runLingyeWorldTransaction(database, operation),
    });
}

export async function handleDoorbellScratchcard(req, res, method, runtime, action) {
    if (!requireDoorbellHumanFieldService(req, res, method)) return;
    if (!runtime) return humanFieldError(res, 503, "farm_unavailable", "Scratchcards are unavailable");
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const buying = action === "buy";
        const fields = buying ? BUY_FIELDS : READ_FIELDS;
        if (!isPlainObject(body) || Object.keys(body).some(key => !fields.has(key))) {
            return humanFieldError(res, 400, "invalid_request", "Invalid scratchcard request fields");
        }
        const key = body.idempotency_key;
        if (((buying || Object.hasOwn(body, "idempotency_key")) && (typeof key !== "string" || !UUID_RE.test(key))) ||
            (buying && body.actor !== "human" && body.actor !== "agent")) {
            return humanFieldError(res, 400, "invalid_request", "Invalid scratchcard purchase identity");
        }
        const binding = validateFarmBinding(body);
        if (binding.error) {
            const { status, code, message } = binding.error;
            return humanFieldError(res, status, code, message);
        }
        const farm = binding.farm;
        const residentId = farm.doorbellMcpMigration?.residentId;
        if (!residentId) return humanFieldError(res, 409, "binding_unavailable", "The farm has no bound resident");
        const result = buying ? runtime.buy(farm, residentId, key, body.actor) : runtime.read(farm, residentId, key);
        return jsonOut(res, 200, result);
    } catch (error) {
        if (error instanceof PublicSyncError) {
            return humanFieldError(res, error.status === 413 ? 413 : 400, "invalid_request", "Invalid scratchcard request body");
        }
        switch (error?.code) {
            case "quota_exceeded":
                return humanFieldError(res, 409, "quota_exceeded", "The daily scratchcard limit was reached");
            case "BALANCE_INSUFFICIENT":
                return humanFieldError(res, 409, "insufficient_gold", "The gold balance is insufficient");
            case "SPEND_LIMIT_EXCEEDED":
            case "DAILY_LIMIT_NOT_CONFIGURED":
                return humanFieldError(res, 409, "spend_limit_exceeded", "The account spending limit was reached");
            case "ACCOUNT_NOT_FOUND":
            case "RESIDENT_NOT_FOUND":
            case "binding_unavailable":
                return humanFieldError(res, 409, "binding_unavailable", "The bound economy account is unavailable");
            default:
                console.error("[doorbell-scratchcard] request failed");
                return humanFieldError(res, 503, "farm_unavailable", "Scratchcards are unavailable");
        }
    }
}
