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
import { isQixi2026CropId, recordQixi2026Progress } from "../../qixi-2026.js";
import { recordMidAutumnSeedProgress, isMidAutumnSeedCropId } from '../../mid-autumn-seeds.js';

export function prepareSmeltingDraw(farm, ids) {
    const sortedKey = [...ids].sort().join("+");
    const recipe = recipes.find(r => [...r.materials].sort().join("+") === sortedKey);
    if (recipe && cropById.get(recipe.output) && (!recipe.requiresCodex || !!farm.codex?.[recipe.output])) {
        return () => ({ cropId: recipe.output, byRecipe: true });
    }

        // 随机产出：按投入素材总点数决定运气，往高稀有限定抬。节日限定保持节日专属，不参与熔炼。
        const points = ids.reduce((s, id) => s + (FUSION_POINTS[materialById.get(id).rarity] ?? 0), 0);
        const luck = points / FUSION_LUCK_DIVISOR;
        // 熔炼基础池=「纯熔炼组」：没有任何商店上架途径（非节日、无结构化解锁规则、非图鉴%解锁）的限定。
        // 这类作物的唯一发现来源就是熔炼，所以允许未收获就炼出（软保底帮你出没集齐的）。
        const normalPool = crops.filter((c) => c.category === "limited" && c.craftable !== false
            && c.unlockType !== "festival" && c.unlockType !== "codex" && !c.unlockRule && !isQixi2026CropId(c.id) && !isMidAutumnSeedCropId(c.id));
        // 软保底：本农场还没集齐的限定，权重 ×FUSION_SOFT_PITY（避免随机长尾让人一直撞重复；SP 仍要努力，没集齐的更易出）
        const normalWeights = normalPool.map((c) => {
            const base = (LIMITED_BASE_WEIGHT[c.rarity] ?? 1) * Math.pow(1 + luck, rarityIndex(c.rarity) - rarityIndex("SR"));
            return farm.codex[c.id] ? base : base * FUSION_SOFT_PITY;
        });
        // 节日 / 图鉴%/ 条件解锁 这三类（首获只能靠商店随机刷）——「本农场收获过 1 次(进图鉴)」之后，
        // 才以极低权重涓流进熔炼池：每个 ≈ FUSION_SPECIAL_UNLOCKED_RATE 概率。没收获过的永远不会被熔出。
        const specialPool = crops.filter((c) => c.category === "limited"
            && !isQixi2026CropId(c.id)
            && !isMidAutumnSeedCropId(c.id)
            && (c.unlockType === "festival" || c.unlockType === "codex" || !!c.unlockRule) && farm.codex[c.id]);
        const normalSum = normalWeights.reduce((s, w) => s + w, 0);
        const specialWeights = specialPool.map(() => normalSum * FUSION_SPECIAL_UNLOCKED_RATE);
        const pool = [...normalPool, ...specialPool];
        const weights = [...normalWeights, ...specialWeights];
        return rng => ({ cropId: pool[rng.weighted(weights)].id, byRecipe: false });

}
