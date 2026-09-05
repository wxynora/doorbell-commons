export const THEFT_REPORT_REWARD_GOLD = 2_000;

// Called only after the owner's authoritative complaint was published, inside
// the existing commission registration/receipt transaction.
export function rewardSuccessfulTheftReport(backend, source, reporterResidentId) {
    if (source.career !== "constable" || source.sourceType !== "farm_interaction_complaint")
        return;
    const event = source.fact?.event;
    if (source.ownerResidentId !== reporterResidentId || event?.kind !== "stolen" ||
        typeof event.eventId !== "string" || event.eventId.length === 0 ||
        source.sourceId !== `p3:security:trail:${event.eventId}`) {
        throw new Error("commission_source_not_available");
    }
    const reference = `security-theft-report:${source.sourceId}:reward`;
    backend.trustedSystemCommands.creditFromSystem({
        residentId: reporterResidentId,
        currency: "gold",
        amount: THEFT_REPORT_REWARD_GOLD,
        businessType: "theft_report_reward",
        businessRef: reference,
        idempotencyKey: reference,
    });
}
