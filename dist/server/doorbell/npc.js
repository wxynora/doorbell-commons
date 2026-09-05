import { allFarms } from "../../store.js";
import { createHash } from "node:crypto";
import { MAX_BODY_BYTES } from "../../config.js";
import { PublicSyncError } from "../../public-sync.js";
import { jsonOut, readJsonBody } from "../http.js";
import { humanFieldError, isPlainObject, requireDoorbellHumanFieldService, validateFarmBinding } from "./contract.js";
import { installLingyeNpcDialogueSchema } from "../../npc/dialogue-schema.js";
import { createLingyeNpcDialogueService } from "../../npc/dialogue-service.js";
import { createLingyeNpcGiftAdapter } from "../../npc/gift-adapter.js";
import { getLingyeNpcWorldState, listResidentLingyeNpcViews } from "../../npc/service.js";
import { advanceLingyeNpcWorld, nextLingyeNpcWorldTransitionAt } from "../../npc/world-schedule.js";
import { isLingyeNpcChatAvailable } from "../../npc/shift-policy.js";

const LOCATION_OPERATIONS = Object.freeze({
    bank: "go.bank.choose",
    "vocational-school": "go.school.choose",
    "animal-hospital": "go.hospital.commission",
    "lingye-daily": "go.newsroom.commission",
    "lingye-public-security-office": "go.security.commission",
});
const actionOperation = (op) => op === "go.bank.view" ? "go.bank.choose"
    : op === "go.school.view" ? "go.school.choose" : op;
const locationOperation = (locationId) => LOCATION_OPERATIONS[locationId] ?? "go.farm.commission";
const part = encodeURIComponent;

export function isLingyeNpcInternalOption(value) {
    return typeof value === "string" && value.startsWith("npc:");
}

function parseNpcOption(value) {
    if (!isLingyeNpcInternalOption(value)) throw new Error("lingye_npc_option_invalid");
    const fields = value.split(":");
    if (!["open", "answer"].includes(fields[1]) ||
        fields.length !== (fields[1] === "open" ? 5 : 6) || !/^\d+$/u.test(fields[4]))
        throw new Error("lingye_npc_option_invalid");
    return { kind: fields[1], npcId: decodeURIComponent(fields[2]),
        sessionId: decodeURIComponent(fields[3]), revision: Number(fields[4]),
        ...(fields.length === 6 ? { choiceId: decodeURIComponent(fields[5]) } : {}) };
}

function farmForResident(database, residentId) {
    const identity = database.prepare("SELECT binding_reference FROM residents WHERE resident_id = ?").get(residentId);
    const matches = allFarms().filter((farm) => farm.doorbellMcpMigration?.residentId === residentId &&
        farm.doorbellMcpMigration?.migrationId === identity?.binding_reference);
    if (matches.length !== 1) throw new Error("lingye_npc_farm_binding_unavailable");
    return matches[0];
}

/** Shared Human/MCP coordinator. Options use the existing resident+operation-bound
 * short handle store; neither channel owns separate NPC or conversation state. */
export function createLingyeNpcRuntime({ database, backend, issueOption, now = Date.now,
    dialogueRandom, getFarmForResident = (residentId) => farmForResident(database, residentId) }) {
    installLingyeNpcDialogueSchema(database);
    let inventoryAdapter;
    const giftAdapter = { prepareGift(input) {
        inventoryAdapter ??= createLingyeNpcGiftAdapter({ database,
            economyCommands: backend.trustedSystemCommands, getFarmForResident });
        return inventoryAdapter.prepareGift(input);
    } };
    const dialogue = createLingyeNpcDialogueService({ database, now,
        ...(dialogueRandom ? { random: dialogueRandom } : {}),
        giftAdapter,
    });
    const detained = (residentId) => backend.forResident(residentId)
        .listOwnDetentions({ at: now(), activeOnly: true }).length > 0;
    const issue = (residentId, operation, internalOption, label) => ({
        option: issueOption(residentId, actionOperation(operation), internalOption, now()), label,
    });
    const advance = () => advanceLingyeNpcWorld(database, { now: now() });
    const view = (residentId, npc) => {
        const sessionId = dialogue.prepare({ residentId, npcId: npc.npcId });
        const talk = !sessionId || !isLingyeNpcChatAvailable(npc.npcId, npc.workStatus) || detained(residentId) ? null : issue(residentId,
            locationOperation(npc.locationId),
            `npc:open:${part(npc.npcId)}:${part(sessionId)}:${npc.worldRevision}`,
            `和${npc.name}聊聊`);
        return {
            npc_id: npc.npcId, name: npc.name, species: npc.species, role: npc.role,
            institution_id: npc.institutionId, location_id: npc.locationId,
            work_status: npc.workStatus, world_revision: npc.worldRevision,
            affinity_stage: npc.affinityStage, affinity_revision: npc.affinityRevision,
            talk_option: talk?.option ?? null,
        };
    };
    const list = (residentId) => {
        advance();
        return listResidentLingyeNpcViews(database, residentId).map((npc) => view(residentId, npc));
    };
    const optionRow = (residentId, handle, operation) => {
        if (typeof handle !== "string" || !/^opt_[A-Za-z0-9_-]{12}$/u.test(handle)) return null;
        return operation
            ? database.prepare("SELECT operation, internal_option FROM lingye_option_handles WHERE handle = ? AND resident_id = ? AND operation = ?")
                .get(handle, residentId, actionOperation(operation))
            : database.prepare("SELECT operation, internal_option FROM lingye_option_handles WHERE handle = ? AND resident_id = ?")
                .get(handle, residentId);
    };
    const chooseInternal = (residentId, operation, internalOption) => {
        const selected = parseNpcOption(internalOption);
        advance();
        const world = getLingyeNpcWorldState(database, selected.npcId);
        const previous = dialogue.read({ residentId, npcId: selected.npcId, sessionId: selected.sessionId });
        // A completed receipt remains readable after the NPC has moved. It cannot
        // award anything twice or authorise a new choice at the previous place.
        if (previous?.status !== "completed" && (detained(residentId) || !isLingyeNpcChatAvailable(selected.npcId, world.workStatus) ||
            world.revision !== selected.revision || actionOperation(operation) !== locationOperation(world.locationId)))
            throw new Error("lingye_npc_option_stale");
        const result = selected.kind === "open"
            ? dialogue.open({ residentId, npcId: selected.npcId, sessionId: selected.sessionId })
            : dialogue.answer({ residentId, npcId: selected.npcId, sessionId: selected.sessionId, choiceId: selected.choiceId });
        const npc = view(residentId, listResidentLingyeNpcViews(database, residentId)
            .find((entry) => entry.npcId === selected.npcId));
        const options = result.choices.map((choice) => issue(residentId, operation,
            `npc:answer:${part(selected.npcId)}:${part(selected.sessionId)}:${world.revision}:${part(choice.choiceId)}`,
            choice.label));
        return { npc, dialogue: {
            npc_id: selected.npcId, status: result.status, lines: result.lines, options,
            affinity_change: result.status === "completed" && result.affinity?.appliedDelta > 0
                ? { delta: result.affinity.appliedDelta, revision: result.affinity.revision } : null,
            gift: result.gift ? { receipt_id: "gift_" + createHash("sha256").update(result.gift.receiptId).digest("base64url").slice(0, 22),
                name: result.gift.name, quantity: result.gift.quantity,
                unit: result.gift.kind === "gold" ? "金币" : "份" } : null,
        } };
    };
    return Object.freeze({
        advance,
        nextTransitionAt: () => nextLingyeNpcWorldTransitionAt(database),
        list,
        isAction(input) {
            return isLingyeNpcInternalOption(optionRow(input.residentId, input.args?.option, input.op)?.internal_option);
        },
        chooseInternal,
        interact(residentId, npcId, handle) {
            const row = optionRow(residentId, handle);
            if (!row || !isLingyeNpcInternalOption(row.internal_option) || parseNpcOption(row.internal_option).npcId !== npcId)
                throw new Error("lingye_npc_option_invalid");
            return chooseInternal(residentId, row.operation, row.internal_option);
        },
        decorate(residentId, op, args, result) {
            if (!result.ok || Object.keys(args).length !== 0 || op === "go.newsroom.like" || detained(residentId)) return result;
            const npcs = list(residentId).filter((npc) => locationOperation(npc.location_id) === actionOperation(op));
            if (npcs.length === 0) return result;
            return { ...result, data: { ...result.data, npcs,
                options: [...(result.data?.options ?? []), ...npcs.filter((npc) => npc.talk_option)
                    .map((npc) => ({ option: npc.talk_option, label: `和${npc.name}聊聊`, requires: [] }))],
            } };
        },
        validateBinding(residentId, farm) {
            const identity = database.prepare("SELECT binding_reference FROM residents WHERE resident_id = ?").get(residentId);
            return !!identity && farm.doorbellMcpMigration?.residentId === residentId &&
                farm.doorbellMcpMigration?.migrationId === identity.binding_reference;
        },
    });
}

async function humanNpc(req, res, method, runtime, action) {
    if (!requireDoorbellHumanFieldService(req, res, method)) return;
    try {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        const keys = action ? ["resident_id", "farm_human_key", "expected_farm_doorplate", "npc_id", "option"]
            : ["resident_id", "farm_human_key", "expected_farm_doorplate"];
        if (!isPlainObject(body) || Object.keys(body).length !== keys.length ||
            keys.some((key) => typeof body[key] !== "string" || !body[key].trim()))
            return humanFieldError(res, 400, "invalid_request", "The NPC request is invalid");
        const binding = validateFarmBinding(body);
        if (binding.error) return humanFieldError(res, binding.error.status, binding.error.code, binding.error.message);
        if (!runtime?.validateBinding(body.resident_id, binding.farm))
            return humanFieldError(res, 409, "farm_doorplate_mismatch", "The bound farm has no matching resident");
        const subject = { farm_doorplate: binding.farm.id };
        return jsonOut(res, 200, action
            ? { ok: true, subject, ...runtime.interact(body.resident_id, body.npc_id, body.option) }
            : { ok: true, subject, npcs: runtime.list(body.resident_id) });
    }
    catch (error) {
        if (error instanceof PublicSyncError) return humanFieldError(res, 400, "invalid_request", "The request body must be valid JSON");
        if (error instanceof Error && /^lingye_npc_(option|dialogue_choice|dialogue_resident|dialogue_answer_conflict)/u.test(error.message))
            return humanFieldError(res, 409, "npc_action_rejected", "当前选项已失效或不适用于这项业务；请重新查看当前事实与 option。");
        return humanFieldError(res, 503, "farm_unavailable", "暂时无法读取，请稍后再试。");
    }
}

export const handleDoorbellHumanNpcRead = (req, res, method, runtime) => humanNpc(req, res, method, runtime, false);
export const handleDoorbellHumanNpcInteract = (req, res, method, runtime) => humanNpc(req, res, method, runtime, true);
