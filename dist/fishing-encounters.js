import { randomUUID } from "node:crypto";
import { fishingEventById } from "./content.js";

export const LOST_ROD_BLOCKED = "鱼竿被河神收走了，今天不能再钓鱼；北京时间0点后恢复。";
const INVALID_OPTION = "这个奇遇选项已经失效，没有消耗鱼饵或发放奖励。";

// day沿用currentDayIndex(now)。余额、鱼饵、待选均由原Farm动作事务一起提交。
export function fishingEncounterStatus(farm, day) {
    if (farm.fishing?.lostRodBlockedDay === day)
        return { kind: "blocked" };
    const pending = farm.fishing?.pendingEncounter;
    if (!pending)
        return { kind: "available" };
    return {
        kind: "pending",
        options: pending.options.map(({ option, label }) => ({ option, label })),
    };
}

export function beginFishingEncounter(farm, day, eventId) {
    const current = fishingEncounterStatus(farm, day);
    if (current.kind !== "available")
        return current;
    const event = fishingEventById.get(eventId);
    const state = (farm.fishing ??= {});
    state.pendingEncounter = {
        eventId,
        options: event.choices.map(({ id, label }) => ({ choiceId: id, label, option: randomUUID() })),
    };
    return fishingEncounterStatus(farm, day);
}

export function answerFishingEncounter(farm, option, day) {
    const state = farm.fishing;
    const pending = state?.pendingEncounter;
    const selected = pending?.options.find((item) => item.option === option);
    const event = pending && fishingEventById.get(pending.eventId);
    const choice = selected && event?.choices.find((item) => item.id === selected.choiceId);
    if (!choice)
        return { ok: false, kind: "invalid_option", text: INVALID_OPTION };
    const cost = choice.costGold ?? 0;
    if (farm.coins < cost)
        return { ok: false, kind: "insufficient_coins", text: event.insufficientFundsText };
    farm.coins += (choice.coins ?? 0) - cost;
    farm.silver += choice.silver ?? 0;
    for (const [baitId, count] of Object.entries(choice.bait ?? {})) {
        state.baitInventory ??= {};
        state.baitInventory[baitId] = (state.baitInventory[baitId] ?? 0) + count;
    }
    if (choice.confiscateRod) {
        state.lostRodBlockedDay = day;
        state.activeUntil = 0;
    }
    delete state.pendingEncounter;
    return { ok: true, kind: "settled", text: choice.text };
}

export function fishingEncounterOptionsText(farm, day, remind = true) {
    const status = fishingEncounterStatus(farm, day);
    if (status.kind !== "pending")
        return "";
    const event = fishingEventById.get(farm.fishing.pendingEncounter.eventId);
    const options = status.options.map(({ label, option }) =>
        `${label}（option ${option}）\n${JSON.stringify({ op: "farm.fish.cast", args: { option } })}`
    ).join("\n");
    return [remind ? (event.pendingText ?? event.intro) : "", options].filter(Boolean).join("\n");
}
