import { allFarms, replaceFarm, withWorldCommitContext } from "../../store.js";
import { stageChampionHarvestGrant, validateChampionHarvestGrant } from "../../domain/champion-harvest.js";

export function createTournamentHarvestService({ farms = allFarms, commit = replaceFarm, checkpoint = withWorldCommitContext, now = Date.now } = {}) {
    return {
        grant(input) {
            validateChampionHarvestGrant(input);
            const matches = farms().filter(farm => farm.doorbellMcpMigration?.residentId === input.resident_id);
            if (matches.length !== 1)
                throw new Error("champion_harvest_binding_unavailable");
            const farm = matches[0];
            const { working, receipt } = stageChampionHarvestGrant(farm, input, now());
            if (working)
                checkpoint({ balanceAuthority: "ledger", actor: "system" }, () => commit(farm.id, working));
            return receipt;
        },
    };
}

export async function handleTournamentHarvest(req, res, method, io) {
    if (!io.authorize(req, res, method))
        return;
    try {
        const input = await io.readBody(req);
        return io.jsonOut(res, 200, createTournamentHarvestService().grant(input));
    } catch (error) {
        if (["invalid_champion_harvest_grant", "invalid_json"].includes(error?.message))
            return io.error(res, 400, "invalid_request", "invalid_request");
        return io.error(res, 503, "service_unavailable", "service_unavailable");
    }
}
