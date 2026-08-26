import { ensureKitchen } from "../engine.js";
import { crops, getCrop, materials, materialById, cookingIngredients, cookingIngredientById } from "../content.js";
import { MATERIAL_REF_PRICE, MARKET_FEE, REPORT_THRESHOLD, UGC_VALUE, LIMITED_SEED_REF_DISCOUNT } from "../config.js";
import { allUgc } from "../ugc.js";
import { currentDayIndex } from "../time.js";
import { qixi2026TransferAllowed } from "../qixi-2026.js";

// ——— 2.0 玩家市场：上架素材/种子，串门购买 ———
const invOf = (f, kind) => (kind === "material" ? f.materials : f.seeds);
export const itemName = (kind, id) => kind === "material"
    ? materialById.get(id)?.name ?? id
    : kind === "ingredient"
        ? cookingIngredientById.get(id)?.name ?? id
        : getCrop(id)?.name ?? id;
/** 银币参考价：素材按稀有度；限定种子=成品价×折扣（种子比成品便宜，留种植利润）；UGC 统一价 */
export function refPrice(kind, id) {
    if (kind === "material")
        return MATERIAL_REF_PRICE[materialById.get(id)?.rarity ?? "N"] ?? 10;
    const c = getCrop(id);
    if (c?.category === "ugc")
        return UGC_VALUE; // 自创作物统一市场参考价（与稀有度无关）
    return Math.max(1, Math.round((c?.sellPrice ?? 100) * LIMITED_SEED_REF_DISCOUNT)); // 限定种子打折，不等于成品价
}
/** 把玩家给的「名字或 id」归一成真实 id——玩家看不到 ugc_xxx，默认允许直接用中文名。 */
function resolveMarketId(kind, id) {
    if (kind === "seed")
        return (getCrop(id) ?? allUgc().find((x) => x.name === id) ?? crops.find((x) => x.name === id))?.id ?? id;
    if (kind === "material")
        return (materialById.get(id) ?? materials.find((x) => x.name === id))?.id ?? id;
    if (kind === "ingredient")
        return (cookingIngredientById.get(id) ?? cookingIngredients.find((x) => x.name === id))?.id ?? id;
    return id;
}
export function listForSale(f, kind, id, qty, now = Date.now()) {
    if (kind !== "material" && kind !== "seed")
        return { ok: false, error: "只能上架 material 或 seed" };
    id = resolveMarketId(kind, id); // 允许用中文名上架（玩家看不到 ugc_xxx 的 id）
    if (kind === "material" && !materialById.get(id))
        return { ok: false, error: `没有这种素材: ${id}` };
    if (kind === "seed" && !getCrop(id))
        return { ok: false, error: `没有这种作物: ${id}` };
    if (kind === "seed" && getCrop(id)?.banned)
        return { ok: false, error: "该自创作物已被举报下架，无法上架" };
    if (kind === "seed" && !qixi2026TransferAllowed(f, id, now))
        return { ok: false, error: "完成对应七夕任务后解锁。" };
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    const price = refPrice(kind, id); // 统一售价：一律用参考价，玩家不能自定价（否则可挂天价卖给系统 NPC 套现银币）
    const bag = invOf(f, kind);
    if ((bag[id] ?? 0) < qty)
        return { ok: false, error: `你没有 ${qty} 个${itemName(kind, id)}` };
    bag[id] -= qty;
    if (bag[id] <= 0)
        delete bag[id];
    const e = f.market.find((m) => m.kind === kind && m.id === id);
    if (e) {
        e.qty += qty;
        e.price = price;
    }
    else
        f.market.push({ kind: kind, id, qty, price });
    if (kind === "seed") {
        const c = getCrop(id);
        if (c?.category === "ugc")
            c.listed = true;
    } // 标记已上架过
    return { ok: true, name: itemName(kind, id), qty, price };
}
export function unlistItem(f, kind, id) {
    id = resolveMarketId(kind, id); // 允许用中文名下架
    const e = f.market.find((m) => m.kind === kind && m.id === id);
    if (!e)
        return { ok: false, error: "你没有上架这个" };
    if (kind === "dish") {
        ensureKitchen(f).dishes.push(structuredClone(e.dish));
        f.market = f.market.filter((m) => m !== e);
        return { ok: true, name: e.dish?.name ?? "料理", returned: 1 };
    }
    if (kind === "ingredient") {
        const kitchen = ensureKitchen(f);
        kitchen.ingredients[id] = (kitchen.ingredients[id] ?? 0) + e.qty;
        f.market = f.market.filter((m) => m !== e);
        return { ok: true, name: itemName(kind, id), returned: e.qty };
    }
    invOf(f, kind)[id] = (invOf(f, kind)[id] ?? 0) + e.qty;
    f.market = f.market.filter((m) => m !== e);
    return { ok: true, name: itemName(kind, id), returned: e.qty };
}
export function viewMarket(f, own, viewer, targetRef = f.id) {
    const items = f.market.filter((m) => {
        if (m.kind !== "seed")
            return true;
        const c = getCrop(m.id);
        if (c?.banned)
            return false;
        return true;
    });
    if (!items.length)
        return own
            ? `🧺 你的摊位空着。用 list 上架素材/种子（别人串门可买）。`
            : `🧺 「${f.name}」的摊位空着。`;
    const head = own ? "🧺 你的摊位（银币结算）：" : `🧺 「${f.name}」的摊位（银币结算）：`;
    const lines = items.map((m) => {
        const label = m.kind === "material" ? "素材" : m.kind === "ingredient" ? "食材" : m.kind === "dish" ? `${m.dish?.rarity ?? "N"}料理` : "种子";
        const name = m.kind === "dish" ? m.dish?.name ?? "料理" : itemName(m.kind, m.id);
        const base = `· ${label}「${name}」×${m.qty} @ 🪙${m.price}银`;
        return own
            ? `${base}　→ unlist {"kind":"${m.kind}","id":"${m.id}"}`
            : `${base}　→ buy {"to":"${targetRef}","kind":"${m.kind}","id":"${m.id}","qty":1}`;
    });
    const foot = own ? "\n（别人串门「HTTP」可买你的货；npc 看常驻邻居阿土的铺子、buy 买他刷出的限定种子）" : "";
    return head + "\n" + lines.join("\n") + foot;
}
/** 跨农场购买（server 传入 seller + buyer）。市场用银币结算。 */
export function buyFromMarket(seller, buyer, kind, id, qty, now = Date.now()) {
    if (seller.id === buyer.id)
        return { ok: false, error: "不能买自己摊位上的东西——要拿回直接 unlist 下架（自买会刷销量，已禁止）。" };
    id = resolveMarketId(kind, id); // 允许用中文名购买
    const e = seller.market.find((m) => m.kind === kind && m.id === id);
    if (!e)
        return { ok: false, error: "对方摊位没有这个在售" };
    if (kind === "seed" && getCrop(id)?.banned) {
        seller.market = seller.market.filter((m) => m !== e);
        return { ok: false, error: "该自创作物已被举报下架" };
    }
    if (kind === "seed" && !qixi2026TransferAllowed(buyer, id, now))
        return { ok: false, error: "完成对应七夕任务后解锁。" };
    // 限定种子稀缺化：每种每人每天只能从市场买 1 颗（想多要走熔炼；UGC 不限）
    const isDish = kind === "dish";
    const isIngredient = kind === "ingredient";
    const isLimitedSeed = kind === "seed" && getCrop(id)?.category === "limited";
    if (isLimitedSeed) {
        const day = currentDayIndex(now);
        if (!buyer.limitedSeedBuys || buyer.limitedSeedBuys.day !== day)
            buyer.limitedSeedBuys = { day, ids: [] };
        if (buyer.limitedSeedBuys.ids.includes(id))
            return { ok: false, error: "这种限定种子今天已经买过 1 颗了（每种每天限购 1，想多要去熔炼）。" };
    }
    const n = (isLimitedSeed || isDish) ? 1 : Math.min(Math.max(1, Math.floor(Number(qty) || 1)), e.qty); // 限定/料理一次只买 1 份
    const cost = n * e.price;
    if (buyer.silver < cost)
        return { ok: false, error: `银币不足，买 ${n} 个要 🪙${cost}（银币靠在摊位卖东西给别的玩家赚）` };
    const fee = Math.floor(cost * MARKET_FEE); // 手续费蒸发（银币 sink）
    buyer.silver -= cost;
    seller.silver += cost - fee;
    if (isDish)
        ensureKitchen(buyer).dishes.push(structuredClone(e.dish));
    else if (isIngredient) {
        const kitchen = ensureKitchen(buyer);
        kitchen.ingredients[id] = (kitchen.ingredients[id] ?? 0) + n;
    }
    else
        invOf(buyer, kind)[id] = (invOf(buyer, kind)[id] ?? 0) + n;
    if (isLimitedSeed)
        buyer.limitedSeedBuys.ids.push(id); // 记下今天买过这种限定，挡住再买
    e.qty -= n;
    if (e.qty <= 0)
        seller.market = seller.market.filter((m) => m !== e);
    if (kind === "seed") {
        const c = getCrop(id);
        if (c?.category === "ugc") {
            c.sales = (c.sales ?? 0) + n;
            (c.buyers ??= []);
            if (!c.buyers.includes(buyer.id))
                c.buyers.push(buyer.id);
        }
    } // 热门榜按去重买家数排（防对敲）
    return { ok: true, name: isDish ? e.dish?.name ?? "料理" : itemName(kind, id), qty: n, cost, fee, price: e.price };
}
/** 举报自创作物：达阈值自动下架（去重，同一农场只算一次） */
export function reportUgc(id, by) {
    const c = getCrop(id);
    if (!c || c.category !== "ugc")
        return { ok: false, error: "只能举报自创作物" };
    if (c.designerId && c.designerId === by)
        return { ok: false, error: "不能举报自己的作物" };
    if (c.banned)
        return { ok: false, error: "它已经被下架了" };
    c.reportedBy ??= [];
    if (c.reportedBy.includes(by))
        return { ok: false, error: "你已经举报过它了" };
    c.reportedBy.push(by);
    const count = c.reportedBy.length;
    if (count >= REPORT_THRESHOLD)
        c.banned = true;
    return { ok: true, name: c.name, count, banned: !!c.banned };
}
/** 自创作物热门榜（全局，按「多少人买过」=去重买家数；已下架的不上榜） */
export function viewHot() {
    const buyerCount = (c) => c.buyers?.length ?? 0;
    const ugc = allUgc().filter((c) => !c.banned).sort((a, b) => buyerCount(b) - buyerCount(a)).slice(0, 10);
    if (!ugc.length)
        return "🔥 还没有自创作物——用 design 创造第一个，让它上榜！";
    return "🔥 自创作物热门榜（按多少人买过）：\n" + ugc.map((c, i) => `${i + 1}. 「${c.name}」·${c.rarity}（设计者 ${c.designer ?? "?"}）${buyerCount(c)} 人买过　${c.desc}`).join("\n");
}
