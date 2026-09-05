import { currentDayIndex } from "../../time.js";
import {
    RANCH_FEED_BONUS_RATE,
    RANCH_FEED_COST_RATE,
    RANCH_FEED_DAILY_CAP,
} from "../../config.js";
import { animalById } from "../../content.js";
import { ranchRaidForAnimal } from "./raids.js";
import { ensureRanch } from "./state.js";
import { ranchAnimalCurrentProduceValue } from "./value.js";
import { ranchHealthActionBlocked } from "../../career/p3-world.js";

function ranchAnimalByRef(ranch, animalRef) {
    const ref = typeof animalRef === "string" ? animalRef.trim() : animalRef;
    const index = typeof ref === "number"
        ? ref
        : typeof ref === "string" && /^\d+$/.test(ref)
            ? Number(ref)
            : Number.NaN;
    if (Number.isSafeInteger(index) && index >= 0)
        return ranch.animals[index];
    if (typeof ref !== "string" || !ref)
        return undefined;
    return ranch.animals.find((animal) => animal.kindId === ref
        || animal.name === ref
        || animalById.get(animal.kindId)?.name === ref);
}

/** 每天三次银币投喂：可按下标、动物 id、正式名称或本户昵称选择，只给下一份普通产物 +10%。 */
export function ranchFeedAnimal(farm, animalRef, now) {
    const ranch = ensureRanch(farm);
    const animal = ranchAnimalByRef(ranch, animalRef);
    if (!animal)
        return { ok: false, error: "选的动物不存在。" };
    if (ranchHealthActionBlocked(animal)) {
        const state = { open: "生病", treating: "治疗", recovering: "恢复" }[animal.lingyeHealth.status];
        return { ok: false, error: `这只动物正在${state}，暂时不能投喂；本次没有消耗银币。` };
    }
    if (ranchRaidForAnimal(farm, animal.kindId))
        return { ok: false, error: "这只动物正在外面派遣，回来后再投喂。" };
    if ((animal.pending ?? 0) > 0 || (animal.pendingMeat ?? 0) > 0)
        return { ok: false, error: "它已经有产出可收，先收进食材柜再投喂。" };
    if (animal.feedBoostPending)
        return { ok: false, error: "这只动物的下一份 +10% 已经登记，不能叠加。" };
    const day = currentDayIndex(now);
    if (!ranch.feedDaily || ranch.feedDaily.day !== day)
        ranch.feedDaily = { day, n: 0 };
    if (ranch.feedDaily.n >= RANCH_FEED_DAILY_CAP)
        return { ok: false, error: `今天已经投喂 ${RANCH_FEED_DAILY_CAP} 次了，明天零点刷新。` };
    const value = ranchAnimalCurrentProduceValue(animal);
    const cost = Math.max(1, Math.round(value * RANCH_FEED_COST_RATE));
    if (farm.silver < cost)
        return { ok: false, error: `银币不足，这次投喂要 🪙${cost}（你有 ${farm.silver}）。` };
    farm.silver -= cost;
    animal.feedBoostPending = true;
    ranch.feedDaily.n += 1;
    return { ok: true, animal: animal.name || animalById.get(animal.kindId)?.name || animal.kindId, cost, bonus: RANCH_FEED_BONUS_RATE, left: RANCH_FEED_DAILY_CAP - ranch.feedDaily.n };
}
