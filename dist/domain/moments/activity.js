import { randomUUID } from "node:crypto";
import { allFarms } from "../../store.js";

// Only explicit settlement fields are copied. Neither action arguments nor
// whole farm snapshots are public activity facts.
export function plantActivity(result) {
    if (!result?.ok) return null;
    const counts = result.planted ?? {
        common: Number(result.seedType === "common"),
        fantasy: Number(result.seedType === "fantasy"),
        limited: Number(result.seedType === "limited"),
    };
    return { kind: "plant", data: {
        counts: { common: counts.common ?? 0, fantasy: counts.fantasy ?? 0, limited: counts.limited ?? 0 },
        limitedIds: result.limitedIds ?? (result.limitedId ? [result.limitedId] : []),
    } };
}

export function waterActivity(result) {
    if (!result?.ok) return null;
    return { kind: "water", data: { mode: "own", count: result.count, helped: result.helped } };
}

export function visitorWaterActivity(result, target) {
    if (!result?.ok) return null;
    return { kind: "water", data: { mode: "visitor", target, plotId: result.plotId, ripened: result.ripened } };
}

export function titleActivities(titles) {
    return titles.map((title) => ({ kind: "title-earned", data: { id: title.id, name: title.name } }));
}

export function mergeGlimmerTitleActivities(activities, titles) {
    const freshIds = new Set(titles.map((title) => title.id));
    const achievementIds = new Set();
    const merged = (activities ?? []).map((event) => {
        if (event.kind !== "glimmer" || event.data.action !== "achievement") return event;
        achievementIds.add(event.data.id);
        return freshIds.has(event.data.id) ? {...event, data:{...event.data, titleEarned:true}} : event;
    });
    return [...merged, ...titleActivities(titles.filter((title) => !achievementIds.has(title.id)))];
}

// Build a public service-commission snapshot only from the authoritative
// completed/published/accepted job and, where applicable, its ledger receipts.
export function publicCommissionActivity(database, {residentId, career, action, actionKey, originalAt}, response) {
    const job = response?.data?.result;
    if (!response?.ok || !["publish", "accept", "complete"].includes(action) ||
        !["agronomist", "veterinarian"].includes(career) || !job?.serviceCommission ||
        job.serviceAudience !== "public" || (action === "complete" && job.status !== "completed") ||
        (action === "publish" ? job.ownerResidentId !== residentId : job.workerResidentId !== residentId)) return null;
    const occurredAt = action === "complete" ? job.endedAt : originalAt;
    if (!Number.isSafeInteger(occurredAt) || occurredAt < 0) return null;
    const rewards = [];
    if (action === "complete" && career === "agronomist") {
        const silver = database.prepare(`SELECT amount FROM economy_silver_escrow_receipts
          WHERE receipt_id = ? AND kind = 'silver_escrow_settle' AND payee_resident_id = ?`)
            .get(job.paymentReference, residentId);
        const gold = database.prepare(`SELECT amount FROM economy_financial_receipts
          WHERE resident_id = ? AND kind = 'system_gold_credit' AND currency = 'gold' AND business_reference = ?`)
            .get(residentId, `career-service:${job.sourceId}:agronomy-reward`);
        if (silver) rewards.push({currency:"silver", amount:silver.amount});
        if (gold) rewards.push({currency:"gold", amount:gold.amount});
    }
    return {id:actionKey, residentId, occurredAt, kind:"commission",
        data:{action, result:response.text, ...(rewards.length ? {rewards} : {})}};
}

export function harvestActivity(results) {
    if (!results?.length) return null;
    return { kind: "harvest", data: { crops: results.map((r) => ({
        cropId: r.crop.id, name: r.crop.name, rarity: r.crop.rarity,
        qualityTier: r.quality.tier, qualityName: r.quality.name,
        value: r.value, currency: r.currency, first: r.isNew === true,
        extra: r.extraYield > 0, drop: Boolean(r.drop || r.potionDrop),
    })) } };
}

export function cookingActivity(result) {
    if (!result?.ok || !result.dish || result.alreadyCooked === true) return null;
    return { kind: "cooking", data: {
        recipeId: result.dish.recipeId, name: result.dish.name, rarity: result.dish.rarity,
        odd: result.odd === true, discovered: result.discovered === true,
        submitted: Boolean(result.qixi || result.midAutumnSeed?.submitted),
    } };
}

export function cookingResearchActivity(result) {
    if (result?.status !== "succeeded" || result.momentsNewlySucceeded !== true || !result.recipe) return null;
    return { kind: "cooking-research", data: {
        recipeId: result.recipe.recipeId, name: result.recipe.name, rarity: result.recipe.rarity,
    } };
}

export function ranchActivity(action, result) {
    if (!result?.ok) return null;
    if (action === "buy") return { kind: "ranch", data: { action, name: result.name, cost: result.cost } };
    if (action === "feed") return { kind: "ranch", data: { action, name: result.animal, cost: result.cost } };
    if (action === "harvest") return { kind: "ranch", data: {
        action, products: Object.entries(result.detail).map(([name, quantity]) => ({ name, quantity })),
        gross: result.gross, gain: result.gain, debtPaid: result.debtPaid,
        storedCount: result.storedCount, nonCookableCount: result.nonCookableCount,
    } };
    return null;
}

// Called before the same save which commits the original action. The Farm's
// migrated identity is captured now, so a later rebind cannot inherit events.
export function recordMomentsActivities(farm, drafts, now) {
    const residentId = farm.doorbellMcpMigration?.residentId;
    if (typeof residentId !== "string" || !residentId || !Array.isArray(drafts)) return [];
    const events = drafts.filter(Boolean).map((draft) => ({
        id: randomUUID(), residentId, occurredAt: now,
        kind: draft.kind, data: structuredClone(draft.data),
    }));
    if (!events.length) return [];
    farm.doorbellMomentsActivityReceipts ??= {};
    for (const event of events) farm.doorbellMomentsActivityReceipts[event.id] = event;
    return events;
}

export function listMomentsActivities({ residentId, farmDoorplate, from, until, latest }, farms = allFarms(), database) {
    if (typeof residentId !== "string" || !residentId || typeof farmDoorplate !== "string" || !farmDoorplate ||
        !Number.isSafeInteger(until) || (latest !== true && (!Number.isSafeInteger(from) || from > until)))
        throw new Error("invalid_request");
    const matches = farms.filter((farm) => farm.doorbellMcpMigration?.residentId === residentId);
    if (matches.length !== 1 || matches[0].id !== farmDoorplate) throw new Error("farm_binding_mismatch");
    if (!database || typeof database.prepare !== "function") throw new Error("activity_unavailable");
    const commissionRows = database.prepare(`SELECT action_key, result_json FROM lingye_commission_action_receipts
      WHERE resident_id = ? AND career IN ('agronomist', 'veterinarian')`).all(residentId);
    const commissions = [];
    for (const row of commissionRows) {
        const snapshot = JSON.parse(row.result_json)?.moment_activities;
        if (!Array.isArray(snapshot)) continue;
        for (const event of snapshot) {
            if (event?.id === row.action_key && event.residentId === residentId && event.kind === "commission" &&
                Number.isSafeInteger(event.occurredAt) && event.occurredAt >= 0) commissions.push(event);
        }
    }
    const activities = [...Object.values(matches[0].doorbellMomentsActivityReceipts ?? {}), ...commissions]
        .filter((event) => event.residentId === residentId && (latest === true || event.occurredAt >= from) && event.occurredAt < until)
        .sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id))
        .map((event) => structuredClone(event));
    return latest === true ? activities.slice(-1) : activities;
}
