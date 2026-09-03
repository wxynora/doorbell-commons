import { settleRanchRaids } from "../domain/ranch/raids.js";
import { playerFarms, replaceFarmsAtomic } from "../store.js";
import { checkTitles } from "../titles.js";

/** Settle due raids on isolated copies and publish only after the cross-farm commit. */
export function settleDueRanchRaids(now) {
    const currentPlayers = playerFarms();
    if (!currentPlayers.some((farm) => farm.ranch?.raids?.some((raid) => !(raid.endsAt > now))))
        return { settled: 0, gooseCaught: 0 };
    const stagedPlayers = currentPlayers.map((farm) => structuredClone(farm));
    const settlement = settleRanchRaids(stagedPlayers, now);
    if (settlement.settled > 0) {
        for (const farm of stagedPlayers)
            checkTitles(farm);
        const replacements = stagedPlayers
            .filter((farm, index) => JSON.stringify(farm) !== JSON.stringify(currentPlayers[index]))
            .map((farm) => ({ id: farm.id, farm }));
        if (replacements.length > 0)
            replaceFarmsAtomic(replacements);
    }
    return settlement;
}
