import { prepareSmeltingDraw } from "./smelting-rules.js";
import {
    CRAFT_COUNT,
    FUSION_LUCK_DIVISOR,
    FUSION_POINTS,
    FUSION_SOFT_PITY,
    FUSION_SPECIAL_UNLOCKED_RATE,
    LIMITED_BASE_WEIGHT,
    rarityIndex,
} from "../../config.js";
import { cropById, crops, materialById, materials, recipes } from "../../content.js";
import { Rng } from "../../rng.js";
import { onTaskEvent } from "../../tasks.js";
import { isQixi2026CropId, recordQixi2026Progress } from "../../qixi-2026.js";
import { recordMidAutumnSeedProgress, isMidAutumnSeedCropId } from '../../mid-autumn-seeds.js';
import { pushLog } from "../shared/notifications.js";

// —— 熔炼：投 CRAFT_COUNT 个素材 → 出一颗限定种子（混合：命中隐藏配方=固定，否则随机）——
export function craft(farm, materialIds, _now) {
    if (!Array.isArray(materialIds) || materialIds.length !== CRAFT_COUNT)
        return { ok: false, error: `熔炼需要正好 ${CRAFT_COUNT} 个素材` };
    // 接受素材 id 或中文名（bag 只展示中文名，AI 玩家自然照着填）
    const ids = [];
    for (const x of materialIds) {
        const m = materialById.get(x) ?? materials.find((mm) => mm.name === x);
        if (!m)
            return { ok: false, error: `没有这种素材: ${x}` };
        ids.push(m.id);
    }
    // 校验库存（含重复计数）
    const need = {};
    for (const id of ids)
        need[id] = (need[id] ?? 0) + 1;
    for (const [id, n] of Object.entries(need)) {
        if ((farm.materials[id] ?? 0) < n)
            return { ok: false, error: `素材不足: ${materialById.get(id).name}` };
    }
    // 消耗
    for (const [id, n] of Object.entries(need)) {
        farm.materials[id] -= n;
        if (farm.materials[id] <= 0)
            delete farm.materials[id];
    }
    const rng = new Rng(farm.rngState);
    const { cropId, byRecipe } = prepareSmeltingDraw(farm, ids)(rng);
    farm.rngState = rng.state;
    farm.seeds[cropId] = (farm.seeds[cropId] ?? 0) + 1;
    const crop = cropById.get(cropId);
    farm.crafted = (farm.crafted ?? 0) + 1; // 匠人称号累计
    onTaskEvent(farm, "craft", _now); // 随机任务：熔炼一次
    const qixi = recordQixi2026Progress(farm, "craft", 1, _now);
    const midAutumnSeed = recordMidAutumnSeedProgress(farm, "craft", 1, _now);
    pushLog(farm, `熔炼出限定种子：${crop.name}${byRecipe ? "（配方）" : ""}`);
    return { ok: true, cropId, cropName: crop.name, rarity: crop.rarity, byRecipe, qixi, midAutumnSeed };
}
