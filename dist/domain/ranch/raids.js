import { randomUUID } from "node:crypto";
import { Rng } from "../../rng.js";
import { currentDayIndex } from "../../time.js";
import {
    RANCH_RAID_COINS_PER_HOUR,
    RANCH_PATROL_GOOSE_CATCH_CHANCE,
    RANCH_PATROL_GOOSE_DAILY_CAP,
} from "../../config.js";
import { animalById } from "../../content.js";
import { pushSocialInbox } from "../shared/notifications.js";
import { pushRanchNotice } from "./notices.js";
import { ensureRanch } from "./state.js";
import { ranchAnimalCurrentProduceValue } from "./value.js";
import { maybeApplyRanchRaidInjury, ranchHealthActionBlocked } from "../../career/p3-world.js";

const HOUR_MS = 60 * 60 * 1000;
export const RANCH_RAID_DAILY_CAP = 1000;

/** 派遣已经潜伏的时长所对应的整数金币；不会超过出发时冻结的保证金。 */
export function ranchRaidCoins(raid, at) {
    const elapsed = Math.max(0, Math.min(raid.endsAt, at) - raid.startedAt);
    return Math.min(raid.reservedCoins, Math.floor(elapsed * RANCH_RAID_COINS_PER_HOUR / HOUR_MS));
}

/** 某只自家动物当前是否已经外出。 */
export function ranchRaidForAnimal(farm, animalKindId) {
    return (farm.ranch?.raids ?? []).find((raid) => raid.animalKindId === animalKindId);
}

function finishRanchRaidHistory(ranch, raid, status, coins, details) {
    const history = ranch.raidHistory;
    if (!history || history.day !== currentDayIndex(raid.startedAt))
        return;
    const entry = history.entries.find((item) => item.raidId === raid.id);
    if (!entry)
        return;
    entry.status = status;
    entry.coins = coins;
    if (details)
        Object.assign(entry, details);
}

/** 人类把自家一只动物派去另一座农场；出发时从牧场钱包冻结最高收益同额保证金。 */
export function dispatchRanchRaid(owner, target, animalIdx, durationHours, now) {
    const ranch = owner.ranch;
    if (!ranch?.animals?.length)
        return { ok: false, error: "牧场还没有可派遣的动物。" };
    if (ranch.raidIncome?.day === currentDayIndex(now) && ranch.raidIncome.n >= RANCH_RAID_DAILY_CAP) {
        return { ok: false, error: `今天偷金币已经达到 ${RANCH_RAID_DAILY_CAP} 金上限，不能再派遣动物。` };
    }
    if (target.id === owner.id)
        return { ok: false, error: "不能派动物来偷自己家。" };
    const idx = Math.floor(Number(animalIdx));
    const animal = ranch.animals[idx];
    if (!animal)
        return { ok: false, error: "选的动物不存在。" };
    if (ranchHealthActionBlocked(animal))
        return { ok: false, error: "OP_REJECTED" };
    if (ranchRaidForAnimal(owner, animal.kindId))
        return { ok: false, error: "这只动物已经在外面潜伏了。" };
    const hours = Number(durationHours);
    if (!Number.isSafeInteger(hours) || hours <= 0)
        return { ok: false, error: "派遣时长要填写正整数小时。" };
    const reservedCoins = hours * RANCH_RAID_COINS_PER_HOUR;
    if (!Number.isSafeInteger(reservedCoins) || !Number.isSafeInteger(now + hours * HOUR_MS))
        return { ok: false, error: "派遣时长太大了。" };
    if (ranch.coins < reservedCoins)
        return { ok: false, error: `牧场金币不足：${hours} 小时需要冻结 ${reservedCoins} 金，现有 ${ranch.coins}。` };
    const raid = {
        id: randomUUID(),
        animalKindId: animal.kindId,
        targetFarmId: target.id,
        startedAt: now,
        endsAt: now + hours * HOUR_MS,
        reservedCoins,
    };
    const animalName = animal.name || animalById.get(animal.kindId)?.name || animal.kindId;
    ranch.coins -= reservedCoins;
    (ranch.raids ??= []).push(raid);
    const day = currentDayIndex(now);
    if (!ranch.raidHistory || ranch.raidHistory.day !== day)
        ranch.raidHistory = { day, entries: [] };
    const historyEntry = {
        raidId: raid.id,
        animalName,
        targetFarmId: target.id,
        targetName: `${target.name}（${target.aiName || "AI"}）`,
        startedAt: now,
        status: "active",
    };
    ranch.raidHistory.entries.push(historyEntry);
    return { ok: true, raid, animal: animalName };
}

/** 目标人类主动抓住仍在潜伏的外来动物；按实际潜伏时长收取等额赔偿，未用保证金退回。 */
export function catchRanchRaid(target, owners, raidId, now) {
    for (const owner of owners) {
        const raids = owner.ranch?.raids ?? [];
        const idx = raids.findIndex((raid) => raid.id === String(raidId));
        if (idx < 0)
            continue;
        const raid = raids[idx];
        if (raid.targetFarmId !== target.id)
            return { ok: false, error: "这只动物不在你家。" };
        if (now >= raid.endsAt)
            return { ok: false, error: "它已经结束潜伏、跑回自己家了。" };
        const compensation = ranchRaidCoins(raid, now);
        owner.ranch.coins += raid.reservedCoins - compensation;
        if (compensation > 0) {
            const day = currentDayIndex(now);
            if (!owner.ranch.raidLoss || owner.ranch.raidLoss.day !== day)
                owner.ranch.raidLoss = { day, n: 0 };
            owner.ranch.raidLoss.n += compensation;
        }
        ensureRanch(target).coins += compensation;
        finishRanchRaidHistory(owner.ranch, raid, "caught", compensation);
        raids.splice(idx, 1);
        const animal = owner.ranch.animals.find((a) => a.kindId === raid.animalKindId);
        maybeApplyRanchRaidInjury(owner, animal, raid.id, now);
        const animalName = animal?.name || animalById.get(raid.animalKindId)?.name || raid.animalKindId;
        const ownerLabel = `${owner.name}（${owner.aiName || "AI"}）`;
        const targetLabel = `${target.name}（${target.aiName || "AI"}）`;
        const caughtText = `🚨 你的${animalName}在「${targetLabel}」被人类抓住，赔给对方 ${compensation} 金`;
        pushSocialInbox(owner, caughtText, now);
        pushRanchNotice(owner, caughtText, now);
        pushSocialInbox(target, `🚨 抓住了「${ownerLabel}」家的${animalName}，收到 ${compensation} 金赔偿`, now);
        return {
            ok: true,
            owner: ownerLabel,
            animal: animalName,
            compensation,
        };
    }
    return { ok: false, error: "这只外来动物已经不在了。" };
}

/** 到期派遣的巡逻鹅判定：每天只限制实际成功次数，未命中不占次数。 */
function patrolGooseCatchesRaid(target, now) {
    const ranch = target.ranch;
    if (!ranch?.patrolGoose)
        return false;
    const day = currentDayIndex(now);
    const catches = (ranch.patrolGooseCatches ??= { day, n: 0 });
    if (catches.day !== day) {
        catches.day = day;
        catches.n = 0;
    }
    if (catches.n >= RANCH_PATROL_GOOSE_DAILY_CAP)
        return false;
    const rng = new Rng(target.rngState ?? 1);
    const caught = rng.next() < RANCH_PATROL_GOOSE_CATCH_CHANCE;
    target.rngState = rng.state;
    if (caught)
        catches.n += 1;
    return caught;
}

/** 惰性结算所有已经到期、且没有被目标抓住的派遣。 */
export function settleRanchRaids(farms, now) {
    const byId = new Map(farms.map((farm) => [farm.id, farm]));
    let settled = 0;
    let gooseCaught = 0;
    for (const owner of farms) {
        const ranch = owner.ranch;
        if (!ranch?.raids?.length)
            continue;
        const active = [];
        for (const raid of ranch.raids) {
            if (raid.endsAt > now) {
                active.push(raid);
                continue;
            }
            ranch.coins += raid.reservedCoins; // 未被抓：保证金全额解冻
            let resultCoins = 0;
            const target = byId.get(raid.targetFarmId);
            if (target && target.id !== owner.id) {
                const animal = ranch.animals.find((entry) => entry.kindId === raid.animalKindId);
                const animalKind = animalById.get(raid.animalKindId);
                const animalName = animal?.name || animalKind?.name || raid.animalKindId;
                const ownerLabel = `${owner.name}（${owner.aiName || "AI"}）`;
                const targetLabel = `${target.name}（${target.aiName || "AI"}）`;
                if (animal && animalKind && patrolGooseCatchesRaid(target, now)) {
                    maybeApplyRanchRaidInjury(owner, animal, raid.id, now);
                    const currentProduceValue = ranchAnimalCurrentProduceValue(animal);
                    const rewardCoins = Math.round(currentProduceValue * 0.5);
                    const produce = animalKind.produce;
                    ensureRanch(target).coins += rewardCoins;
                    finishRanchRaidHistory(ranch, raid, "goose-caught", 0, {
                        produce,
                        rewardCoins,
                        reservedCoins: raid.reservedCoins,
                    });
                    const defenderText = `🪿 巡逻鹅赶走了「${ownerLabel}」派来的${animalName}，阻止了本次偷金币；它带回了部分「${produce}」（已折算 ${rewardCoins} 金），由系统额外发放到牧场钱包。`;
                    const attackerText = `🪿 你的${animalName}在「${targetLabel}」被巡逻鹅赶回，本次偷金币失败；动物已返回，${raid.reservedCoins} 金保证金已全额退回，没有罚款或新增欠款。对方巡逻鹅带走了部分「${produce}」（已折算 ${rewardCoins} 金），奖励由系统额外发放。`;
                    pushSocialInbox(target, defenderText, now);
                    pushSocialInbox(owner, attackerText, now);
                    pushRanchNotice(target, defenderText.replace("发放到牧场钱包", "发放到你的牧场钱包"), now, "ranch");
                    pushRanchNotice(owner, attackerText, now, "ranch");
                    gooseCaught += 1;
                    settled += 1;
                    continue;
                }
                const day = currentDayIndex(now);
                if (!ranch.raidIncome || ranch.raidIncome.day !== day)
                    ranch.raidIncome = { day, n: 0 };
                const stolenCoins = Math.min(raid.reservedCoins, Math.max(0, RANCH_RAID_DAILY_CAP - ranch.raidIncome.n));
                resultCoins = stolenCoins;
                const targetRanch = ensureRanch(target);
                const paidFromRanch = Math.min(targetRanch.coins, stolenCoins);
                targetRanch.coins -= paidFromRanch;
                const paidFromFarm = Math.min(target.coins, stolenCoins - paidFromRanch);
                target.coins -= paidFromFarm;
                const paidNow = paidFromRanch + paidFromFarm;
                ranch.coins += stolenCoins; // 只结算今日剩余额度；目标两处余额都不足的部分记隐形负债
                ranch.raidIncome.n += stolenCoins;
                if (stolenCoins > 0) {
                    if (!targetRanch.raidLoss || targetRanch.raidLoss.day !== day)
                        targetRanch.raidLoss = { day, n: 0 };
                    targetRanch.raidLoss.n += stolenCoins;
                }
                const debt = stolenCoins - paidNow;
                if (debt > 0)
                    (targetRanch.raidDebts ??= []).push({ creditorFarmId: owner.id, coins: debt });
                if (stolenCoins > 0) {
                    const capLine = stolenCoins < raid.reservedCoins ? `（今日累计已达 ${RANCH_RAID_DAILY_CAP} 金上限）` : "";
                    pushSocialInbox(owner, `🥷 你的${animalName}从「${targetLabel}」带回 ${stolenCoins} 金，已进入牧场钱包${capLine}`, now);
                    pushSocialInbox(target, `🥷 「${ownerLabel}」家的${animalName}从你的牧场拿走 ${stolenCoins} 金（现扣 ${paidNow}${debt > 0 ? `，另记欠款 ${debt}` : ""}）`, now);
                }
                else {
                    pushSocialInbox(owner, `🥷 你的${animalName}结束潜伏，但今天偷金币已达 ${RANCH_RAID_DAILY_CAP} 金上限，空手回来；保证金已全部退回`, now);
                }
            }
            finishRanchRaidHistory(ranch, raid, "returned", resultCoins);
            settled += 1;
        }
        ranch.raids = active;
    }
    return { settled, gooseCaught };
}

/** 目标以后收牧场产出时先按欠款产生顺序扣除；偷方已经到账，不再重复入账。 */
export function creditRanchHarvestAfterDebts(farm, _farms, gross) {
    const ranch = ensureRanch(farm);
    let remaining = gross;
    let debtPaid = 0;
    const debts = ranch.raidDebts ?? [];
    const left = [];
    for (const debt of debts) {
        if (remaining <= 0) {
            left.push(debt);
            continue;
        }
        if (debt.coins <= 0)
            continue;
        const paid = Math.min(remaining, debt.coins);
        remaining -= paid;
        debtPaid += paid;
        debt.coins -= paid;
        if (debt.coins > 0)
            left.push(debt);
    }
    ranch.raidDebts = left;
    ranch.coins += remaining;
    return { gain: remaining, debtPaid };
}

export function ranchRaidDebtTotal(farm) {
    return (farm.ranch?.raidDebts ?? []).reduce((sum, debt) => sum + Math.max(0, debt.coins), 0);
}
