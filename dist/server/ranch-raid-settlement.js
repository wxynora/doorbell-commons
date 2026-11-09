import { settleRanchRaids } from "../domain/ranch/raids.js";
import { playerFarms, replaceFarmsAtomic } from "../store.js";
import { checkTitles, metricValue } from "../titles.js";
import { titles } from "../content.js";
import { cloneFarmForMutation, snapshotFarmMutation, planFarmMutation } from "../farm-mutation-scope.js";

/** Settle due raids on isolated copies and publish only after the cross-farm commit. */
export function settleDueRanchRaids(now) {
    const currentPlayers = playerFarms();
    if (!currentPlayers.some((farm) => farm.ranch?.raids?.some((raid) => !(raid.endsAt > now))))
        return { settled: 0, gooseCaught: 0 };
    const affected = new Set();
    for (const farm of currentPlayers) {
        for (const raid of farm.ranch?.raids ?? []) {
            if (raid.endsAt > now) continue;
            affected.add(farm.id);
            affected.add(raid.targetFarmId);
        }
        // The old settlement checked every player's titles after a due raid.
        // Preserve that backfill without cloning players with nothing to add.
        if (farm.titles == null || titles.some(title => !title.manual &&
            !farm.titles.includes(title.id) && metricValue(farm, title.field) >= title.min))
            affected.add(farm.id);
    }
    const before = new Map(currentPlayers.filter(farm => affected.has(farm.id))
        .map(farm => [farm.id, snapshotFarmMutation(farm)]));
    const stagedPlayers = currentPlayers.map(farm => affected.has(farm.id) ? cloneFarmForMutation(farm) : farm);
    const settlement = settleRanchRaids(stagedPlayers, now);
    if (settlement.settled > 0) {
        for (const farm of stagedPlayers)
            if (affected.has(farm.id)) checkTitles(farm);
        const replacements = stagedPlayers
            .filter(farm => affected.has(farm.id) && planFarmMutation(farm, before.get(farm.id)).recordChanges.length > 0)
            .map((farm) => ({ id: farm.id, farm }));
        if (replacements.length > 0)
            replaceFarmsAtomic(replacements);
    }
    return settlement;
}
