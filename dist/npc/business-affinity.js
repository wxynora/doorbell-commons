import { LINGYE_NPCS } from "./registry.js";
import { LingyeNpcError, recordLingyeNpcAffinityEvent } from "./service.js";

/** Trusted post-success hook. Call inside the original world transaction. */
export function recordLingyeNpcBusinessAffinity(database, input) {
    if (input.status !== "succeeded")
        return null;
    const npc = LINGYE_NPCS.find((entry) => entry.institutionId === input.institutionId);
    if (!npc)
        throw new LingyeNpcError("lingye_npc_institution_not_active", "Institution has no active NPC");
    if (typeof input.sourceReference !== "string" || !input.sourceReference.trim())
        throw new LingyeNpcError("lingye_npc_business_receipt_required", "A completed business receipt is required");
    const previous = database.prepare(`
      SELECT event_id FROM lingye_npc_affinity_events
      WHERE resident_id = ? AND npc_id = ? AND source_kind = 'business' AND source_reference = ?
    `).get(input.residentId, npc.npcId, input.sourceReference);
    if (!previous) {
        const state = database.prepare(`
          SELECT location_id, work_status FROM lingye_npc_world_events
          WHERE npc_id = ? AND occurred_at <= ?
          ORDER BY occurred_at DESC, resulting_revision DESC LIMIT 1
        `).get(npc.npcId, input.occurredAt);
        if (state?.work_status !== "on_duty" || state.location_id !== npc.homeLocationId)
            return null;
    }
    return recordLingyeNpcAffinityEvent(database, {
        eventId: `npc-business:${npc.npcId}:${input.residentId}:${input.sourceReference}`,
        residentId: input.residentId,
        npcId: npc.npcId,
        sourceKind: "business",
        sourceReference: input.sourceReference,
        delta: 2,
        occurredAt: input.occurredAt,
        recordedAt: input.recordedAt,
    });
}
