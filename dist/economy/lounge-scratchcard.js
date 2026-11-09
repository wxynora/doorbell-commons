import { randomInt } from "node:crypto";
import { materialById, titles as titleCatalog } from "../content.js";
import { clearCommittedFarmBalanceProjections } from "../farm-balance-projection.js";
import { writeFarmStatePaths } from "../farm-state-writer.js";

const PRICE_GOLD = 5_000;
const DAILY_LIMIT = 100;
const WEIGHT_TOTAL = 10_000;
const JACKPOT_TITLE_ID = "lounge_scratchcard_jackpot";
const jackpotTitle = titleCatalog.find(title => title.id === JACKPOT_TITLE_ID && title.manual);
if (!jackpotTitle) throw new Error("scratchcard_jackpot_title_missing");
const JACKPOT_TITLE = Object.freeze({ id: jackpotTitle.id, name: jackpotTitle.name });
const JUNK_PRIZES = ["ordinary_stone", "dry_branch", "clay_lump"].map(id =>
    Object.freeze({ id, name: materialById.get(id).name, quantity: 1 }));
const PRIZES = Object.freeze([
    Object.freeze({ gold: 5_000, weight: 2_820 }),
    Object.freeze({ gold: 10_000, weight: 700 }),
    Object.freeze({ gold: 20_000, weight: 300 }),
    Object.freeze({ gold: 50_000, weight: 70 }),
    Object.freeze({ gold: 100_000, weight: 9 }),
    Object.freeze({ gold: 1_000_000, weight: 1, title: JACKPOT_TITLE }),
    ...JUNK_PRIZES.map(item => Object.freeze({ gold: 0, weight: 100, item })),
    Object.freeze({ gold: 0, weight: 5_800 }),
]);

const beijingDate = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

function persistPurchaseFields(database, farm, account, operationId, material, titles) {
    const gold = account.availableGold;
    const silver = account.availableSilver;
    const projection = { authority: "ledger", operationId, gold, silver };
    const updates = [
        { path: ["coins"], value: gold },
        { path: ["silver"], value: silver },
        { path: ["doorbellMcpMigration", "balanceProjection"], value: projection },
    ];
    if (material) updates.push({ path: ["materials", material.id], value: material.count });
    if (titles) updates.push({ path: ["titles"], value: titles });
    writeFarmStatePaths(database, farm.id, updates);
    clearCommittedFarmBalanceProjections(database, [{
        id: farm.id, coins: gold, silver, doorbellMcpMigration: farm.doorbellMcpMigration,
    }], new Set([farm.id]));
    return projection;
}

export class ScratchcardError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

function prizeFor(draw) {
    if (!Number.isSafeInteger(draw) || draw < 0 || draw >= WEIGHT_TOTAL) {
        throw new ScratchcardError("random_unavailable");
    }
    for (const prize of PRIZES) {
        if (draw < prize.weight) return prize;
        draw -= prize.weight;
    }
    throw new ScratchcardError("random_unavailable");
}

export function createLoungeScratchcardService({ database, commands, transact, now = Date.now, random = randomInt }) {
    const lastTicket = database.prepare(`SELECT purchase_number FROM lounge_scratchcard_tickets
        WHERE resident_id = ? AND purchase_day = ? ORDER BY purchase_number DESC LIMIT 1`);
    const wallet = database.prepare(`SELECT available_gold
        FROM economy_accounts WHERE resident_id = ?`);
    const receipt = database.prepare(`SELECT request_id, cost_gold, prize_gold, prize_item_id, prize_title_id FROM lounge_scratchcard_tickets
        WHERE resident_id = ? AND request_id = ?`);
    const insert = database.prepare(`INSERT INTO lounge_scratchcard_tickets
        (resident_id, request_id, purchase_day, purchase_number, cost_gold, prize_gold, prize_item_id, prize_title_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    function accountFor(residentId) {
        const account = wallet.get(residentId);
        if (!account) throw new ScratchcardError("binding_unavailable");
        return account;
    }

    function countFor(residentId, day) {
        return lastTicket.get(residentId, day)?.purchase_number ?? 0;
    }

    function findTicket(residentId, requestId) {
        const row = receipt.get(residentId, requestId);
        if (!row) return null;
        const { prize_item_id, prize_title_id, ...ticket } = row;
        return {
            ...ticket,
            prize_item: JUNK_PRIZES.find(item => item.id === prize_item_id) ?? null,
            prize_title: prize_title_id === JACKPOT_TITLE.id ? JACKPOT_TITLE : null,
        };
    }

    function statusFor(farm, day, count, gold) {
        return {
            farm_doorplate: farm.id, price_gold: PRICE_GOLD, limit: DAILY_LIMIT,
            day, count, remaining_today: DAILY_LIMIT - count, gold,
            prizes: PRIZES, total_weight: WEIGHT_TOTAL,
        };
    }

    function currentStatus(farm, residentId, day) {
        return statusFor(farm, day, countFor(residentId, day), accountFor(residentId).available_gold);
    }

    function read(farm, residentId, requestId) {
        const day = beijingDate(now());
        return {
            ok: true,
            status: currentStatus(farm, residentId, day),
            ticket: requestId ? findTicket(residentId, requestId) : null,
            replayed: false,
        };
    }

    function buy(farm, residentId, requestId, actor) {
        const purchase = transact(() => {
            const day = beijingDate(now());
            const previous = findTicket(residentId, requestId);
            if (previous) {
                return { result: { ok: true, status: currentStatus(farm, residentId, day), ticket: previous, replayed: true } };
            }
            const count = countFor(residentId, day);
            if (count >= DAILY_LIMIT) throw new ScratchcardError("quota_exceeded");

            const reference = `lounge-scratchcard:${residentId}:${requestId}`;
            let account = commands.chargeToSystem({
                residentId, currency: "gold", amount: PRICE_GOLD, actor,
                businessType: "lounge_scratchcard", businessRef: reference,
                idempotencyKey: `${reference}:cost`,
            });
            const prize = prizeFor(random(WEIGHT_TOTAL));
            if (prize.gold > 0) {
                account = commands.creditFromSystem({
                    residentId, currency: "gold", amount: prize.gold, actor: "system",
                    businessType: "lounge_scratchcard_prize", businessRef: reference,
                    idempotencyKey: `${reference}:prize`,
                });
            }
            const material = prize.item && { id: prize.item.id, count: (farm.materials?.[prize.item.id] ?? 0) + prize.item.quantity };
            const titles = prize.title && !farm.titles?.includes(prize.title.id) ? [...(farm.titles ?? []), prize.title.id] : undefined;
            const projection = persistPurchaseFields(database, farm, account, requestId, material, titles);
            insert.run(residentId, requestId, day, count + 1, PRICE_GOLD, prize.gold, prize.item?.id ?? null, prize.title?.id ?? null);
            return {
                result: {
                    ok: true,
                    status: statusFor(farm, day, count + 1, account.availableGold),
                    ticket: {
                        request_id: requestId, cost_gold: PRICE_GOLD, prize_gold: prize.gold,
                        prize_item: prize.item ?? null, prize_title: prize.title ?? null,
                    },
                    replayed: false,
                },
                projection,
                material,
                titles,
            };
        });
        if (purchase.projection) {
            farm.coins = purchase.projection.gold;
            farm.silver = purchase.projection.silver;
            farm.doorbellMcpMigration.balanceProjection = purchase.projection;
        }
        if (purchase.material) (farm.materials ??= {})[purchase.material.id] = purchase.material.count;
        if (purchase.titles) farm.titles = purchase.titles;
        return purchase.result;
    }

    return { read, buy };
}
