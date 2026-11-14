import { getFarm } from "../../store.js";
import { acceptCommittedFarmRecords } from "../../farm-mutation-scope.js";
import { writeFarmStatePaths } from "../../farm-state-records.js";
import { EconomyService } from "../../economy/economy-service.js";
import { runLingyeWorldTransaction } from "../../lingye-world-database.js";

const EVENT = "lingye-grudge-ledger-20261115";
const CLOSES_AT = Date.parse("2026-11-16T23:59:00+08:00");
const REWARDS = new Map([
    ["support", { silver: 5, titleId: null }],
    ["entry", { silver: 20, titleId: "moments_ledger_exhibition_entry" }],
    ["winner", { silver: 50, titleId: "moments_ledger_exhibition_winner" }],
]);

export class LedgerExhibitionGrantError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function createLedgerExhibitionGrants({ database, economyRules, farmById = getFarm, now = Date.now }) {
    const economy = new EconomyService(database, { rules: economyRules, now });
    return {
        grant(input) {
            if (!input || typeof input !== "object" ||
                Object.keys(input).sort().join(",") !== "eventId,farmDoorplate,residentId,tier" ||
                input.eventId !== EVENT || typeof input.residentId !== "string" || !input.residentId.trim() ||
                typeof input.farmDoorplate !== "string" || !input.farmDoorplate.trim() || !REWARDS.has(input.tier)) {
                throw new LedgerExhibitionGrantError("invalid_request");
            }
            if (now() < CLOSES_AT) throw new LedgerExhibitionGrantError("exhibition_open");
            const { eventId, residentId, farmDoorplate, tier } = input;
            const { silver, titleId } = REWARDS.get(tier);
            const farm = farmById(farmDoorplate);
            if (!farm || farm.id !== farmDoorplate || farm.doorbellMcpMigration?.residentId !== residentId) {
                throw new LedgerExhibitionGrantError("farm_binding_mismatch");
            }
            // In-memory farm records must only be updated after the outer commit.
            if (database.isTransaction) throw new Error("Nested ledger exhibition grant");
            const key = `${eventId}:${farmDoorplate}:${tier}`;
            let committed;
            const journalId = runLingyeWorldTransaction(database, () => {
                const binding = database.prepare("SELECT resident_id FROM farm_states WHERE farm_id=?").get(farm.id);
                if (binding?.resident_id !== residentId) throw new LedgerExhibitionGrantError("farm_binding_mismatch");
                const findJournal = database.prepare("SELECT journal_id FROM economy_commands WHERE idempotency_key=?");
                const previous = findJournal.get(key);
                const wallet = economy.creditFromSystem({
                    residentId, currency: "silver", amount: silver, businessType: "moments_ledger_exhibition",
                    businessRef: key, idempotencyKey: key,
                });
                if (previous) return previous.journal_id;

                const journal = findJournal.get(key);
                if (!journal?.journal_id) throw new Error("Missing ledger exhibition journal");
                const projection = { authority: "ledger", operationId: key, gold: wallet.availableGold, silver: wallet.availableSilver };
                const titles = titleId ? [...new Set([...(farm.titles ?? []), titleId])] : undefined;
                const writes = [
                    { path: ["coins"], value: projection.gold },
                    { path: ["silver"], value: projection.silver },
                    { path: ["doorbellMcpMigration", "balanceProjection"], value: projection },
                ];
                if (titles) writes.push({ path: ["titles"], value: titles });
                const { recordChanges } = writeFarmStatePaths(database, farm.id, writes);
                committed = { projection, titles, recordChanges };
                return journal.journal_id;
            });
            if (committed) {
                const { projection, titles, recordChanges } = committed;
                farm.coins = projection.gold;
                farm.silver = projection.silver;
                if (titles) farm.titles = titles;
                farm.doorbellMcpMigration.balanceProjection = projection;
                acceptCommittedFarmRecords(farm, recordChanges);
            }
            return { eventId, residentId, farmDoorplate, tier, silver, titleId, journalId };
        },
    };
}
