import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { allFarms } from "../../store.js";
import { jsonOut, readJsonBody } from "../http.js";
import {
    FARM_DOORPLATE_RE,
    UUID_RE,
    humanFieldError,
    isPlainObject,
    requireDoorbellHumanFieldService,
    validateFarmBinding,
} from "./contract.js";

function validIdentityBody(body, includeLikeRef) {
    const expectedKeys = new Set([
        "farm_human_key",
        "expected_farm_doorplate",
        "human_actor_key",
        "related_resident_ids",
        ...(includeLikeRef ? ["like_ref"] : []),
    ]);
    return isPlainObject(body) &&
        Object.keys(body).length === expectedKeys.size &&
        Object.keys(body).every((key) => expectedKeys.has(key)) &&
        typeof body.farm_human_key === "string" && body.farm_human_key.length > 0 &&
        typeof body.expected_farm_doorplate === "string" &&
        FARM_DOORPLATE_RE.test(body.expected_farm_doorplate) &&
        typeof body.human_actor_key === "string" && UUID_RE.test(body.human_actor_key) &&
        Array.isArray(body.related_resident_ids) &&
        body.related_resident_ids.length > 0 &&
        new Set(body.related_resident_ids).size === body.related_resident_ids.length &&
        body.related_resident_ids.every((residentId) =>
            typeof residentId === "string" && UUID_RE.test(residentId)) &&
        (!includeLikeRef || (typeof body.like_ref === "string" && body.like_ref.length > 0));
}

function authorFacts(residentId) {
    const farm = allFarms().find((candidate) =>
        candidate.doorbellMcpMigration?.residentId === residentId);
    return farm
        ? { authorName: farm.aiName || farm.name, authorFarmName: farm.name }
        : { authorName: "社区记者", authorFarmName: null };
}

function projectPublications(backend, body, now) {
    return backend.trustedQueries.listReporterPublicationsForHuman({
        humanActorKey: body.human_actor_key,
        relatedResidentIds: body.related_resident_ids,
        now,
    }).map(({ authorResidentId, ...publication }) => ({
        ...publication,
        ...authorFacts(authorResidentId),
    }));
}

function validateBoundHuman(body) {
    const binding = validateFarmBinding(body);
    if (binding.error)
        return binding;
    const residentId = binding.farm.doorbellMcpMigration?.residentId;
    if (!residentId || !body.related_resident_ids.includes(residentId)) {
        return {
            error: {
                status: 409,
                code: "farm_doorplate_mismatch",
                message: "The active Human profiles do not include the bound farm resident",
            },
        };
    }
    return { ...binding, residentId };
}

export async function handleDoorbellHumanReporterRead(req, res, method, runtime) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!validIdentityBody(body, false))
            return humanFieldError(res, 400, "invalid_request", "The reporter read request is invalid");
        const binding = validateBoundHuman(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        return jsonOut(res, 200, {
            ok: true,
            subject: { farm_doorplate: binding.farm.id },
            publications: projectPublications(runtime.backend, body, runtime.now?.() ?? Date.now()),
        });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        console.error("[doorbell-human-reporter] read failed");
        return humanFieldError(res, 503, "farm_unavailable", "Reporter publications could not be read");
    }
}

export async function handleDoorbellHumanReporterLike(req, res, method, runtime) {
    if (!requireDoorbellHumanFieldService(req, res, method))
        return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (!validIdentityBody(body, true))
            return humanFieldError(res, 400, "invalid_request", "The reporter like request is invalid");
        const binding = validateBoundHuman(body);
        if (binding.error)
            return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        const result = runtime.backend.trustedSystemCommands.recordReporterHumanLike({
            humanActorKey: body.human_actor_key,
            viaResidentId: binding.residentId,
            relatedResidentIds: body.related_resident_ids,
            likeRef: body.like_ref,
            now: runtime.now?.() ?? Date.now(),
        });
        return jsonOut(res, 200, {
            ok: true,
            subject: { farm_doorplate: binding.farm.id },
            result,
            publications: projectPublications(runtime.backend, body, runtime.now?.() ?? Date.now()),
        });
    }
    catch (error) {
        if (error instanceof PublicSyncError)
            return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (error?.code === "reporter_author_like_forbidden")
            return humanFieldError(res, 409, "author_like_forbidden", "The reporter household cannot like its own article");
        if (error?.code === "reporter_evaluation_window_closed")
            return humanFieldError(res, 409, "evaluation_closed", "The evaluation window is closed");
        console.error("[doorbell-human-reporter] like failed");
        return humanFieldError(res, 503, "farm_unavailable", "The reporter like could not be recorded");
    }
}
