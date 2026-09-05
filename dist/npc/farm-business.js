import { AsyncLocalStorage } from "node:async_hooks";
import { NPC_ID } from "../config.js";
import { buyNpcSeed } from "../game/visit-npc.js";
import { farmResidentId } from "../career/farm-benefits.js";
import { recordLingyeNpcBusinessAffinity } from "./business-affinity.js";
import { advanceLingyeNpcWorld } from "./world-schedule.js";

const npcPurchaseContext = new AsyncLocalStorage();

/** This is the real existing vendor purchase, not a notification after save. */
export function buyAndPersistLingyeNpcSeed({ npc, buyer, seedId, now, persist }) {
    if (npc?.id !== NPC_ID || typeof persist !== "function")
        throw new TypeError("A real NPC seed purchase and synchronous persistence are required");
    const before = structuredClone(buyer);
    const result = buyNpcSeed(npc, buyer, seedId, now);
    if (!result.ok)
        return result;
    const fact = Object.freeze({
        buyerFarmId: buyer.id, seedId, occurredAt: now,
        cost: result.cost, quantity: result.qty,
        coinsBefore: before.coins, seedsBefore: before.seeds[seedId] ?? 0,
    });
    try {
        return npcPurchaseContext.run(fact, () => {
            persist();
            return result;
        });
    }
    catch (error) {
        for (const key of Object.keys(buyer))
            delete buyer[key];
        Object.assign(buyer, before);
        throw error;
    }
}

/** Called only by the existing balance coordinator, inside its original SQL commit. */
export function recordPendingLingyeNpcFarmBusiness(database, { world, balanceOperation }) {
    const fact = npcPurchaseContext.getStore();
    if (!fact || !balanceOperation || !database.isTransaction)
        return null;
    const buyer = world.farms.find((farm) => farm.id === fact.buyerFarmId);
    const npc = world.farms.find((farm) => farm.id === NPC_ID);
    if (!buyer || npc?.shop?.npcSeed?.id !== fact.seedId || npc.shop.npcSeed.price !== fact.cost ||
        fact.coinsBefore - buyer.coins !== fact.cost ||
        (buyer.seeds?.[fact.seedId] ?? 0) - fact.seedsBefore !== fact.quantity ||
        !buyer.limitedSeedBuys?.ids?.includes(fact.seedId))
        throw new Error("NPC purchase does not match the committing farm state");
    const residentId = farmResidentId(database, buyer);
    if (!residentId)
        return null;
    const reference = `farm-balance:${balanceOperation.operationId}`;
    const journal = database.prepare(`
      SELECT journal.journal_id FROM economy_commands command
      JOIN economy_journals journal ON journal.journal_id = command.journal_id
        AND journal.command_type = command.command_type AND journal.payload_hash = command.payload_hash
      JOIN economy_ledger_entries entry ON entry.journal_id = journal.journal_id
      WHERE command.idempotency_key = ? AND command.command_type = 'farm.balance.apply'
        AND journal.business_ref = ? AND entry.resident_id = ?
        AND entry.currency = 'gold' AND entry.partition_name = 'available'
        AND entry.balance_after = ?
      LIMIT 1
    `).get(reference, reference, residentId, buyer.coins);
    if (!journal)
        throw new Error("NPC purchase is missing its committing gold ledger entry");
    advanceLingyeNpcWorld(database, { now: fact.occurredAt });
    return recordLingyeNpcBusinessAffinity(database, {
        residentId, institutionId: "farm", sourceReference: reference,
        occurredAt: fact.occurredAt, recordedAt: fact.occurredAt, status: "succeeded",
    });
}
