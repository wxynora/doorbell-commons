// 称号系统：纯数据驱动（content/titles.json）。
// 普通称号按累计/即时指标达到阈值自动解锁；manual 称号只认明确发放；人类前端可佩戴任意一个已解锁的称号，
// 佩戴后作为「名字前缀」展示在串门页和排行榜上。名字/flavor 在 titles.json 里改，不动引擎。
import { titles, cropById } from "./content.js";
import { pushLog } from "./engine.js";
import { qixi2026CollectionComplete } from "./qixi-2026.js";
/** 称号阈值判定用的指标值：把 field 名映射到农场当前数值。 */
export function metricValue(f, field) {
    switch (field) {
        case "harvested": return f.harvested ?? 0;
        case "coins": return f.coins ?? 0;
        case "stolen": return f.stolen ?? 0;
        case "watered": return f.watered ?? 0;
        case "codexCount": return Object.keys(f.codex ?? {}).filter((id) => cropById.has(id)).length; // 官方图鉴种数（UGC 不计）
        case "crafted": return f.crafted ?? 0;
        case "designCount": return f.designCount ?? 0;
        case "expRuns": return f.expRuns ?? 0;
        case "visitedCount": return f.visitedIds?.length ?? 0;
        case "gotStolen": return f.gotStolen ?? 0;
        case "tasksDone": return f.tasksDone ?? 0;
        case "expConcord": return Math.min(100, f.expConcord ?? 0); // 默契度（封顶 100）
        case "cookingRecipeCount": return f.ranch?.kitchen?.knownRecipes?.length ?? 0;
        case "fishingCaught": return f.fishing?.stats?.totalCaught ?? 0;
        case "ranchAnimalCount": return f.ranch?.animals?.length ?? 0;
        case "patrolGooseCatchesDaily": return f.ranch?.patrolGooseCatches?.n ?? 0;
        case "humanHarvestDaily": return f.humanHarvestDaily?.n ?? 0;
        case "raidIncomeDaily": return f.ranch?.raidIncome?.n ?? 0;
        case "glimmerEncounters": return f.glimmer?.stats?.encounters ?? 0;
        case "glimmerVariants": return f.glimmer?.stats?.variants ?? f.glimmer?.unlocked?.length ?? 0;
        case "glimmerCoops": return f.glimmer?.stats?.coops ?? 0;
        case "togetherSecondHome": return f.publicExpeditionRewards?.endings?.includes("second_home") ? 1 : 0;
        case "togetherQuietHarvest": return f.publicExpeditionRewards?.endings?.includes("quiet_harvest") ? 1 : 0;
        case "togetherTenThousandBottles": return f.publicExpeditionRewards?.endings?.includes("ten_thousand_bottles") ? 1 : 0;
        case "togetherNoAddress": return f.publicExpeditionRewards?.endings?.includes("no_address") ? 1 : 0;
        case "togetherSameKitchenOneSign": return f.publicExpeditionRewards?.endings?.includes("one_sign") ? 1 : 0;
        case "togetherSameKitchenNextDoor": return f.publicExpeditionRewards?.endings?.includes("next_door") ? 1 : 0;
        case "togetherSameKitchenPublicKitchen": return f.publicExpeditionRewards?.endings?.includes("public_kitchen") ? 1 : 0;
        case "qixi2026Collection": return qixi2026CollectionComplete(f) ? 1 : 0;
        default: return 0;
    }
}
export const titleById = (id) => titles.find((t) => t.id === id);
/** 已解锁？普通称号看阈值，manual 称号看明确持有记录。 */
export const isUnlocked = (f, id) => {
    const t = titleById(id);
    if (!t)
        return false;
    if (t.manual)
        return (f.titles ?? []).includes(id);
    return metricValue(f, t.field) >= t.min;
};
/**
 * 重新结算称号：把当前已达阈值、但还没登记进 farm.titles 的称号补登，返回本次新解锁的称号定义。
 * 纯派生、幂等——任何时候调用都安全；调用方负责 save()。新解锁会往农场日志记一行。
 */
export function checkTitles(f) {
    f.titles ??= [];
    const fresh = [];
    for (const t of titles) {
        if (t.manual)
            continue;
        if (f.titles.includes(t.id))
            continue;
        if (metricValue(f, t.field) >= t.min) {
            f.titles.push(t.id);
            fresh.push(t);
            pushLog(f, `🎖️ 解锁称号「${t.name}」——可让 ${f.humanName || "伴侣"} 帮你佩戴`);
        }
    }
    return fresh;
}
/**
 * 默契度等级名（与 content 里「默契」类称号同源；0=尚需磨合，没到任何阈值）。
 * 秘境页的默契标签复用它，保证"显示等级"和"可佩戴称号"永远是同一套词。
 */
export function concordTierName(n) {
    const v = Math.min(100, Math.max(0, n ?? 0));
    const bands = titles.filter((t) => t.field === "expConcord").sort((a, b) => b.min - a.min);
    for (const t of bands)
        if (v >= t.min)
            return t.name;
    return "尚需磨合";
}
/** 当前佩戴的称号（必须仍在已解锁列表里，否则视为未佩戴）。 */
export function equippedTitle(f) {
    if (!f.titleEquipped)
        return undefined;
    if (!(f.titles ?? []).includes(f.titleEquipped))
        return undefined;
    return titleById(f.titleEquipped);
}
/** 名字前缀：佩戴了称号就返回「✧称号✧」，否则空串。 */
export function titlePrefix(f) {
    const t = equippedTitle(f);
    return t ? `✧${t.name}✧` : "";
}
/** 农场名（含佩戴的称号前缀）——排行榜/串门页统一用它。 */
export const nameWithTitle = (f) => `${titlePrefix(f)}${f.name}`;
/**
 * 佩戴 / 卸下称号。id 为空串=卸下；id 必须是已解锁的称号。返回结果文案。
 * 注意：只改 titleEquipped，不发奖、不解锁。
 */
export function equipTitle(f, id) {
    checkTitles(f); // 先把刚达标的补登，免得"明明够了却选不了"
    if (!id) {
        f.titleEquipped = undefined;
        return { ok: true, text: "已卸下称号。" };
    }
    const t = titleById(id);
    if (!t)
        return { ok: false, text: "没有这个称号。" };
    if (!(f.titles ?? []).includes(id))
        return { ok: false, text: `还没解锁「${t.name}」，达成条件才能佩戴。` };
    f.titleEquipped = id;
    return { ok: true, text: `🎖️ 已佩戴称号「${t.name}」——串门和排行榜上会显示在名字前。` };
}
//# sourceMappingURL=titles.js.map
