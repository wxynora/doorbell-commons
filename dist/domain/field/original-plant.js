import { randomUUID } from "node:crypto";
import {
    MAX_UGC,
    UGC_DESC_MAX,
    UGC_DESIGN_FEE,
    UGC_GROW_TICKS,
    UGC_HARVEST_MAX,
    UGC_HARVEST_VALUE,
    UGC_NAME_MAX,
    UGC_PLANT_MAX,
    UGC_RARITY,
    UGC_SEED_YIELD,
    UGC_VALUE,
} from "../../config.js";
import { registerUgc, ugcCount } from "../../ugc.js";
import { pushLog } from "../shared/notifications.js";

// —— UGC：设计自己的作物（付金币设计费 → 注册作物 + 送一批种子）——
export function designCrop(farm, opts) {
    const name = String(opts.name ?? "").trim();
    const desc = String(opts.desc ?? "").trim();
    // 可选自定义文案：播种文案(plantLine) / 收获文案(lore)；空则各自回落到通用演出
    const plant = String(opts.plant ?? "").trim();
    const harvest = String(opts.harvest ?? "").trim();
    if (!name || !desc)
        return { ok: false, error: "要给作物起名字 name 和写描述 desc" };
    if (name.length > UGC_NAME_MAX)
        return { ok: false, error: `名字最多 ${UGC_NAME_MAX} 字` };
    if (desc.length > UGC_DESC_MAX)
        return { ok: false, error: `描述最多 ${UGC_DESC_MAX} 字` };
    if (plant.length > UGC_PLANT_MAX)
        return { ok: false, error: `播种文案最多 ${UGC_PLANT_MAX} 字` };
    if (harvest.length > UGC_HARVEST_MAX)
        return { ok: false, error: `收获文案最多 ${UGC_HARVEST_MAX} 字` };
    if (ugcCount() >= MAX_UGC)
        return { ok: false, error: "全服自创作物已达上限，暂不能再设计新作物。" };
    if (farm.coins < UGC_DESIGN_FEE)
        return { ok: false, error: `设计自创作物要 ${UGC_DESIGN_FEE} 金，你只有 ${farm.coins}` };
    farm.coins -= UGC_DESIGN_FEE;
    const id = "ugc_" + randomUUID().replace(/-/g, "").slice(0, 8);
    const crop = {
        id, name, latin: String(opts.latin ?? "").trim() || `Creatio ${id.slice(4, 9)}`, desc,
        category: "ugc", rarity: UGC_RARITY, growTicks: UGC_GROW_TICKS, water: null,
        seedPrice: UGC_VALUE, sellPrice: UGC_HARVEST_VALUE, family: null, unlockTier: null,
        mechanicText: null, mechanicStatus: "active", mechanicSystem: null,
        unlockType: "craft", unlockCond: "自创作物", produce: null, designer: farm.aiName || farm.name, designerId: farm.id,
        ...(plant ? { plantLine: plant } : {}),
        ...(harvest ? { lore: harvest } : {}),
    };
    registerUgc(crop);
    farm.seeds[id] = (farm.seeds[id] ?? 0) + UGC_SEED_YIELD;
    farm.designCount = (farm.designCount ?? 0) + 1; // 创作称号累计
    pushLog(farm, `设计了作物「${name}」（${UGC_RARITY}），获得 ${UGC_SEED_YIELD} 颗种子`);
    return { ok: true, crop, fee: UGC_DESIGN_FEE, seeds: UGC_SEED_YIELD };
}
