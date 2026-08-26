import {
    RANCH_ANIMAL_MAX_LEVEL,
    RANCH_LEVEL_INCOME_STEP,
    RANCH_UPGRADE_COST_FACTOR,
} from "../../config.js";
import { animalById } from "../../content.js";
import { glimmerAnimalVariantMultiplier, glimmerBuffMultiplier } from "../../glimmer.js";

/** 动物当前等级的一次完整产出折现金额；与牧场收获、页面展示使用同一取整顺序。 */
export function ranchAnimalCurrentProduceValue(animal, now = Date.now()) {
    const kind = animalById.get(animal?.kindId);
    if (!kind)
        return 0;
    const level = Math.min(RANCH_ANIMAL_MAX_LEVEL, Math.max(1, Math.floor(Number(animal.level) || 1)));
    let value = Math.round(kind.producePrice * (1 + (level - 1) * RANCH_LEVEL_INCOME_STEP));
    value = Math.round(value * glimmerAnimalVariantMultiplier(animal));
    return Math.round(value * glimmerBuffMultiplier("ranchValue", now));
}

/** 把某动物升到下一级要花多少牧场金币（cost = buyCost ×(当前等级+1)× 系数）。 */
export function animalUpgradeCost(kind, level) {
    return Math.round(kind.buyCost * (level + 1) * RANCH_UPGRADE_COST_FACTOR);
}
