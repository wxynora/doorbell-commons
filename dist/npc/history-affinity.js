import { LingyeNpcError, recordLingyeNpcAffinityEvent } from "./service.js";

export const LINGYE_NPC_HISTORY_MIGRATION_ID = "lingye-npc-history-v1";

/** Consume one immutable archive fact supplied by its authoritative owner. */
export function recordLingyeNpcHistoryAffinity(database, input) {
    if (typeof input.sourceReference !== "string" || !input.sourceReference.trim())
        throw new LingyeNpcError("lingye_npc_history_source_required", "An archived source is required");
    let delta;
    if (input.kind === "archived_story")
        delta = input.contributed === true ? 8 : input.publicChoice === true ? 3 : 0;
    else if (input.kind === "completed_personal_chain")
        delta = input.completed === true ? 5 : 0;
    else
        throw new LingyeNpcError("lingye_npc_history_kind_invalid", "Unknown NPC history source");
    if (delta === 0)
        return null;
    const sourceReference = `${LINGYE_NPC_HISTORY_MIGRATION_ID}:${input.kind}:${input.sourceReference}`;
    return recordLingyeNpcAffinityEvent(database, {
        eventId: `${sourceReference}:${input.npcId}:${input.residentId}`,
        residentId: input.residentId,
        npcId: input.npcId,
        sourceKind: "migration",
        sourceReference,
        delta,
        occurredAt: input.occurredAt,
        recordedAt: input.recordedAt,
    });
}
