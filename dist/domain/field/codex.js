import { cropById, getCrop, totalCropCount } from "../../content.js";

// 领域内部：收获与偷菜落图鉴时复用；不从 field/index.js 暴露。
export function addCodex(farm, cropId, qualityTier, now) {
    const prev = farm.codex[cropId];
    if (!prev) {
        farm.codex[cropId] = { count: 1, bestQuality: qualityTier, firstAt: now };
        return true;
    }
    prev.count += 1;
    prev.bestQuality = Math.max(prev.bestQuality, qualityTier);
    return false;
}

/** 已解锁的官方作物图鉴种类数（UGC 不计）。 */
export function officialCodexCount(farm) {
    return Object.keys(farm.codex).filter((id) => cropById.has(id)).length;
}

export function collectionPct(farm) {
    // 只算官方作物（UGC 自创不计入官方收集度）
    return officialCodexCount(farm) / totalCropCount;
}

/** 图鉴星标：切换某作物的收藏态。返回 { ok, on, name }；on=切换后是否已收藏。 */
export function toggleStar(farm, id) {
    const crop = getCrop(id);
    if (!crop)
        return { ok: false, on: false };
    farm.starred ??= [];
    const i = farm.starred.indexOf(id);
    if (i >= 0) {
        farm.starred.splice(i, 1);
        return { ok: true, on: false, name: crop.name };
    }
    farm.starred.push(id);
    return { ok: true, on: true, name: crop.name };
}

/** 某作物是否被伴侣星标收藏。 */
export function isStarred(farm, id) {
    return !!farm.starred?.includes(id);
}

/** 已集齐的某类别作物种类数（升级牵制用） */
export function codexCountByCategory(farm, cat) {
    return Object.keys(farm.codex).filter((id) => cropById.get(id)?.category === cat).length;
}
