export const CHAMPION_HARVEST_PERCENT = 15;
export const CHAMPION_HARVEST_MS = 7 * 24 * 60 * 60 * 1000;

export function validateChampionHarvestGrant(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).sort().join(",") !== "edition_id,grant_id,resident_id" ||
        typeof input.resident_id !== "string" || !input.resident_id ||
        typeof input.edition_id !== "string" || !/^snow-tournament:\d{4}-(0[1-9]|1[0-2])$/.test(input.edition_id) ||
        input.grant_id !== JSON.stringify(["snow-tournament", input.edition_id, "harvest", input.resident_id]))
        throw new Error("invalid_champion_harvest_grant");
}

export function stageChampionHarvestGrant(farm, input, now) {
    validateChampionHarvestGrant(input);
    const previous = farm.snowTournamentHarvest?.[input.grant_id];
    if (previous)
        return { working: null, receipt: structuredClone(previous.receipt) };
    const receipt = {
        ok: true, ...input, bonus_percent: CHAMPION_HARVEST_PERCENT,
        granted_at: now, expires_at: now + CHAMPION_HARVEST_MS,
    };
    const working = structuredClone(farm);
    (working.snowTournamentHarvest ??= {})[input.grant_id] = {
        receipt, fishing: 0, ranch: 0,
    };
    return { working, receipt };
}

function harvestAt(farm, at) {
    let active = null;
    for (const grant of Object.values(farm.snowTournamentHarvest ?? {})) {
        const { granted_at, expires_at } = grant.receipt;
        if (granted_at <= at && at < expires_at && (!active || granted_at > active.receipt.granted_at))
            active = grant;
    }
    return active;
}

export function championCropBonus(farm, base, at) {
    return harvestAt(farm, at) ? Math.round(base * CHAMPION_HARVEST_PERCENT / 100) : 0;
}

/** Called once for a real base item, in the same world write as the item. */
export function championBonusItem(farm, source, at) {
    const active = harvestAt(farm, at);
    if (!active)
        return 0;
    const total = active[source] + CHAMPION_HARVEST_PERCENT;
    active[source] = total % 100;
    return Math.floor(total / 100);
}
