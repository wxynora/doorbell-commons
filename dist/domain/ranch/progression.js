import { Rng } from "../../rng.js";
import { animalById, cooking } from "../../content.js";

/** 只推进既有牧场的动物产出；elapsed 的计算和 lastTickAt 仍由外层负责。 */
export function advanceRanch(farm, elapsed) {
    if (!farm.ranch)
        return;
    for (const a of farm.ranch.animals) {
        const kind = animalById.get(a.kindId);
        if (!kind)
            continue;
        // 不累加：只在「没有未收产出」时推进生产，攒到 1 份就停，伴侣收了才产下一份（挂机不堆积）
        if (a.pending < 1) {
            a.ticksSinceProduce += elapsed;
            if (a.ticksSinceProduce >= kind.produceEveryTicks) {
                a.pending = 1;
                a.pendingBoost = !!a.feedBoostPending;
                a.feedBoostPending = false;
                if (kind.meatId) {
                    const rng = new Rng(farm.rngState ?? 1);
                    a.pendingMeat = rng.next() < cooking.meatDropChance ? 1 : 0;
                    farm.rngState = rng.state;
                }
                a.ticksSinceProduce = 0;
            }
        }
    }
}
