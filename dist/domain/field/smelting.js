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
    const sortedKey = [...ids].sort().join("+");
    const recipe = recipes.find((r) => [...r.materials].sort().join("+") === sortedKey);
    let cropId;
    let byRecipe = false;
    if (recipe && cropById.get(recipe.output)) {
        cropId = recipe.output;
        byRecipe = true;
    }
    else {
        // 随机产出：按投入素材总点数决定运气，往高稀有限定抬。节日限定保持节日专属，不参与熔炼。
        const points = ids.reduce((s, id) => s + (FUSION_POINTS[materialById.get(id).rarity] ?? 0), 0);
        const luck = points / FUSION_LUCK_DIVISOR;
        // 熔炼基础池=「纯熔炼组」：没有任何商店上架途径（非节日、无结构化解锁规则、非图鉴%解锁）的限定。
        // 这类作物的唯一发现来源就是熔炼，所以允许未收获就炼出（软保底帮你出没集齐的）。
        const normalPool = crops.filter((c) => c.category === "limited" && c.craftable !== false
            && c.unlockType !== "festival" && c.unlockType !== "codex" && !c.unlockRule && !isQixi2026CropId(c.id));
        // 软保底：本农场还没集齐的限定，权重 ×FUSION_SOFT_PITY（避免随机长尾让人一直撞重复；SP 仍要努力，没集齐的更易出）
        const normalWeights = normalPool.map((c) => {
            const base = (LIMITED_BASE_WEIGHT[c.rarity] ?? 1) * Math.pow(1 + luck, rarityIndex(c.rarity) - rarityIndex("SR"));
            return farm.codex[c.id] ? base : base * FUSION_SOFT_PITY;
        });
        // 节日 / 图鉴%/ 条件解锁 这三类（首获只能靠商店随机刷）——「本农场收获过 1 次(进图鉴)」之后，
        // 才以极低权重涓流进熔炼池：每个 ≈ FUSION_SPECIAL_UNLOCKED_RATE 概率。没收获过的永远不会被熔出。
        const specialPool = crops.filter((c) => c.category === "limited"
            && !isQixi2026CropId(c.id)
            && (c.unlockType === "festival" || c.unlockType === "codex" || !!c.unlockRule) && farm.codex[c.id]);
        const normalSum = normalWeights.reduce((s, w) => s + w, 0);
        const specialWeights = specialPool.map(() => normalSum * FUSION_SPECIAL_UNLOCKED_RATE);
        const pool = [...normalPool, ...specialPool];
        const weights = [...normalWeights, ...specialWeights];
        cropId = pool[rng.weighted(weights)].id;
    }
    farm.rngState = rng.state;
    farm.seeds[cropId] = (farm.seeds[cropId] ?? 0) + 1;
    const crop = cropById.get(cropId);
    farm.crafted = (farm.crafted ?? 0) + 1; // 匠人称号累计
    onTaskEvent(farm, "craft", _now); // 随机任务：熔炼一次
    const qixi = recordQixi2026Progress(farm, "craft", 1, _now);
    pushLog(farm, `熔炼出限定种子：${crop.name}${byRecipe ? "（配方）" : ""}`);
    return { ok: true, cropId, cropName: crop.name, rarity: crop.rarity, byRecipe, qixi };
}
