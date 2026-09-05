import { LAND_UPGRADE_REQ } from "../../config.js";
import { crops, landTiers } from "../../content.js";
import { pushLog } from "../shared/notifications.js";
import { bumpDaily } from "../../daily.js";
import { codexCountByCategory, collectionPct } from "./codex.js";

/** 某品阶新解锁的作物种类数（升级提示用） */
export function newVarietiesAtTier(tier) {
    return crops.filter((c) => (c.category === "common" || c.category === "fantasy") && c.unlockTier === tier).length;
}

// —— 土地升级（门槛：金币 + 普通图鉴种类数 + 高阶加奇幻/收集度；牵制普通作物）——
export function nextUpgradeReq(farm) {
    const next = landTiers.find((t) => t.tier === farm.landTier + 1);
    if (!next)
        return null;
    return { next, req: LAND_UPGRADE_REQ[next.tier] };
}

export function upgradeLand(farm, now) {
    const nu = nextUpgradeReq(farm);
    if (!nu)
        return { ok: false, error: "已是最高品阶，无需升级" };
    const { next, req } = nu;
    const cc = codexCountByCategory(farm, "common");
    const fc = codexCountByCategory(farm, "fantasy");
    const pct = collectionPct(farm) * 100;
    const miss = [];
    if (farm.coins < req.coins)
        miss.push(`金币 ${farm.coins}/${req.coins}`);
    if (cc < req.commonCodex)
        miss.push(`普通图鉴 ${cc}/${req.commonCodex} 种`);
    if (req.fantasyCodex && fc < req.fantasyCodex)
        miss.push(`奇幻图鉴 ${fc}/${req.fantasyCodex} 种`);
    if (req.codexPct && pct < req.codexPct)
        miss.push(`总收集度 ${pct.toFixed(1)}/${req.codexPct}%`);
    if (miss.length)
        return { ok: false, error: `升级到「${next.name}」还差：${miss.join("、")}` };
    farm.coins -= req.coins;
    bumpDaily(farm, now, "coinSpend", req.coins);
    farm.landTier = next.tier;
    farm.lastLandExpandedAt = now;
    for (let id = farm.plots.length + 1; id <= next.plots; id++)
        farm.plots.push({ id, crop: null });
    pushLog(farm, `土地升级为 ${next.name}`);
    const unlocked = newVarietiesAtTier(next.tier);
    const gains = [unlocked > 0 ? `解锁 ${unlocked} 种新作物` : "", `地块增至 ${next.plots}`].filter(Boolean).join("；");
    return { ok: true, tier: next.tier, name: next.name, text: `${next.achieveText}\n（${gains}）` };
}
