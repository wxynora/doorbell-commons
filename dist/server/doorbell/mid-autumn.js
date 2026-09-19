import { MAX_BODY_BYTES } from "../../config.js";
import { MidAutumnError } from "../../mid-autumn-orders/service.js";
import { createMidAutumnRuntime } from "../../mid-autumn-orders/runtime.js";
import { jsonOut, readJsonBody } from "../http.js";
import { isPlainObject, requireDoorbellService, validateFarmBinding } from "./contract.js";

const REQUIRED = ["farm_human_key", "expected_farm_doorplate", "op", "args"];
const KEYS = new Set([...REQUIRED, "request_id"]);
const errorOut = (res, status, code) => jsonOut(res, status, { ok: false, error: { code } });

// This is an internal, service-authenticated endpoint, never a browser endpoint.
export async function handleDoorbellMidAutumn(req, res, method, runtime, side, dependencies = {}) {
    if (!requireDoorbellService(req, res, method)) return;
    let body;
    try {
        body = await readJsonBody(req, MAX_BODY_BYTES);
    } catch {
        return errorOut(res, 400, "invalid_request");
    }
    if (!isPlainObject(body) || REQUIRED.some((key) => !Object.hasOwn(body, key)) ||
        Object.keys(body).some((key) => !KEYS.has(key)) ||
        !["ai", "human"].includes(side) ||
        typeof body.op !== "string" || !body.op.trim() || !isPlainObject(body.args) ||
        (Object.hasOwn(body, "request_id") &&
            (typeof body.request_id !== "string" || !body.request_id.trim()))) {
        return errorOut(res, 400, "invalid_request");
    }
    try {
        const binding = (dependencies.validateFarmBinding ?? validateFarmBinding)(body);
        if (binding.error) return errorOut(res, binding.error.status, binding.error.code);
        const migration = binding.farm.doorbellMcpMigration;
        const resident = migration?.residentId && runtime.database.prepare(
            "SELECT binding_reference FROM residents WHERE resident_id = ?",
        ).get(migration.residentId);
        if (!migration?.migrationId || !resident || resident.binding_reference !== migration.migrationId) {
            return errorOut(res, 401, "farm_binding_unavailable");
        }
        const service = dependencies.createService
            ? dependencies.createService(runtime.database)
            : createMidAutumnRuntime(runtime.database, { opensAt: runtime.opensAt ?? null, backend: runtime.backend });
        const result = service.execute({
            farmId: binding.farm.id, side, op: body.op,
            args: body.args, requestId: body.request_id,
        }, Date.now());
        return jsonOut(res, 200, { ok: true, data: result });
    } catch (error) {
        if (error instanceof MidAutumnError) {
            return errorOut(res, error.status, error.code);
        }
        return errorOut(res, 503, "service_unavailable");
    }
}
