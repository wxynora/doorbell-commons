// Uses the existing Farm P3 and nature contracts. This is not registered as a
// runtime route: winter events need their own approved authoritative contract.
import { addNatureAnimalCase, currentP3Sources } from "../../career/p3-world.js";
import { beijingDayIndex, registerNatureImpact, resolveNatureImpact } from "../../nature.js";

/** Transfer one newly persisted, positive exposure decision to the P3 case authority. */
export function transferExposureToP3({ world, farm, decision, newlyRecorded, findAnimalIndex, now }) {
    if (!decision || !farm || typeof findAnimalIndex !== "function" || typeof newlyRecorded !== "boolean")
        throw new TypeError("exposure decision, farm and animal resolver required");
    if (!newlyRecorded || !decision.hit) return { world, farm, created: false };
    if (farm.id !== decision.farmId || typeof decision.animalId !== "string" ||
        !decision.animalId || typeof decision.condition !== "string" || !decision.condition ||
        !Number.isSafeInteger(now) || beijingDayIndex(now) !== decision.checkedDay)
        throw new Error("animal_exposure_identity_invalid");
    // Do not consume a new check while another case is active. The caller must
    // roll back the associated check row if this guard fails.
    if (currentP3Sources(farm).animal) throw new Error("animal_exposure_case_already_active");
    const index = findAnimalIndex(farm, decision.animalId);
    if (!Number.isSafeInteger(index) || index < 0 || !farm.ranch?.animals?.[index])
        throw new Error("animal_exposure_target_unavailable");
    const stagedFarm = structuredClone(farm);
    const registered = registerNatureImpact(world, {
        eventId: decision.eventId,
        farmId: farm.id,
        objectId: `animal:${index}`,
        kind: `animal_${decision.condition}`,
        now,
    });
    if (!registered.created) throw new Error("animal_exposure_impact_already_exists");
    const sourceId = `p4:animal:${decision.eventId}:${farm.id}:${index}:${decision.condition}`;
    const created = addNatureAnimalCase(stagedFarm, {
        eventId: decision.eventId,
        impactId: registered.impact.impactId,
        animalIndex: index,
        condition: decision.condition,
        sourceId,
        generatedDay: decision.checkedDay,
        now,
    });
    if (!created) throw new Error("animal_exposure_case_not_created");
    const transferred = resolveNatureImpact(registered.world, {
        eventId: decision.eventId,
        impactId: registered.impact.impactId,
        resolutionKind: "transferred",
        resolutionRef: sourceId,
        now,
    });
    return { world: transferred.world, farm: stagedFarm, created: true };
}
