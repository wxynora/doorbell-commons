import { buyItem, buyPotionSet, buyRecipe, potionDailyLeft } from "../../engine.js";
import { POTION_DAILY_CAP, REPORT_THRESHOLD } from "../../config.js";
import { buyAllQixi2026Seeds, buyQixi2026Seed } from "../../qixi-2026.js";
import { listForSale, reportUgc, unlistItem, viewHot, viewMarket } from "../market.js";
import { buyNpcSeed, makeNpcFarm, viewNpc } from "../visit-npc.js";
import { viewBag, viewEncyclopedia } from "../presentation/catalog.js";
import { withFooter } from "../presentation/farm.js";
import { viewShop } from "../presentation/shop.js";
import { plantHint } from "./field.js";

export function handleCommerceAction(action, f, b, now) {
    switch (action) {
        case "shop": return { ok: true, text: viewShop(f, now) };
        case "encyclopedia": return { ok: true, text: viewEncyclopedia(f, b.id) };
        case "bag": return { ok: true, text: viewBag(f) };
        case "buy-recipe": {
            const r = buyRecipe(f, now);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `📜 学会了配方【${r.name}】！配方组合见 bag。`) : r.error };
        }
        case "list": {
            const r = listForSale(f, String(b.kind), String(b.id), b.qty, now);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `🧺 上架「${r.name}」×${r.qty} @ 🪙${r.price}银（别人串门可买）`) : r.error };
        }
        case "unlist": {
            const r = unlistItem(f, String(b.kind), String(b.id));
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `已下架「${r.name}」，退回 ${r.returned} 个`) : r.error };
        }
        case "market": return { ok: true, text: viewMarket(f, true) };
        case "npc": return { ok: true, text: viewNpc(makeNpcFarm()) };
        case "buy": { // 单机：从杂货郎阿土买他随机刷出的限定种子（金币结算；联网买别人摊位走 HTTP POST /farms/:id/buy）
            const r = buyNpcSeed(makeNpcFarm(), f, String(b.id), now);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `🛒 从阿土买下限定种子「${r.name}」×${r.qty}，-💰${r.cost}金`) : r.error };
        }
        case "buy-seed": { // 买自己店当前刷出的限定种子（金币结算，每种每天限购 1；不填 id 默认买当前刷出的那颗）
            if (b.allin === true) {
                const all = buyAllQixi2026Seeds(f, now);
                const details = all.ok ? all.items.map((item) => `${item.name}×${item.qty}`).join("、") : "";
                return { ok: all.ok, text: all.ok ? withFooter(f, now, `🛒 七夕限定种子已全部买满：${details}，共花费 ${all.cost} 金。`) : all.error };
            }
            const qixi = buyQixi2026Seed(f, b.id ?? f.shop.npcSeed?.id, now, b.qty ?? 1);
            if (qixi.handled) {
                if (qixi.ok && f.shop.npcSeed?.id === qixi.id)
                    f.shop.npcSeed = null;
                return { ok: qixi.ok, text: qixi.ok ? withFooter(f, now, `🛒 买下七夕限定种子「${qixi.name}」×${qixi.qty}，-💰${qixi.cost}金（今日还可购买 ${qixi.left} 颗）\n${plantHint(f, qixi.id, qixi.name)}`) : qixi.error };
            }
            // 注意：这里不调 refreshShop——否则正好跨过 4h 刷新窗口时会在购买瞬间重 roll，把玩家正要买的那颗换掉。
            // 商店刷新只在查看(status/shop/agent 页)时发生；购买只认当前已刷出的 shop.npcSeed。
            if (!f.shop.npcSeed)
                return { ok: false, text: "你店里现在没刷出限定种子（每隔几小时随机刷一次，看缘分；想要稳定来源就去熔炼）。" };
            const id = String(b.id ?? f.shop.npcSeed?.id ?? "");
            const r = buyNpcSeed(f, f, id, now);
            if (r.ok)
                f.shop.npcSeed = null; // 买走就清掉这次的刷出（每天限购由 limitedSeedBuys 兜底）
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `🛒 买下店里刷出的限定种子「${r.name}」×${r.qty}，-💰${r.cost}金\n${plantHint(f, id, r.name)}`) : r.error };
        }
        case "hot": return { ok: true, text: viewHot() };
        case "report": {
            const r = reportUgc(String(b.id), f.id);
            return { ok: r.ok, text: r.ok ? (r.banned ? `🚫 举报已记录，「${r.name}」累计 ${r.count} 次举报，已下架（隐藏+禁止交易）。` : `🚩 举报已记录（「${r.name}」${r.count}/${REPORT_THRESHOLD}）。`) : r.error };
        }
        case "buy-item": {
            const r = buyItem(f, String(b.item), Number(b.qty ?? 1), now);
            if (!r.ok)
                return { ok: false, text: r.error };
            const cap = String(b.item) === "speed_potion" ? `（官方店今日已购 ${POTION_DAILY_CAP - potionDailyLeft(f, now)}/${POTION_DAILY_CAP}）` : "";
            return { ok: true, text: withFooter(f, now, `买下 ${r.qty} 个${r.name}，-${r.cost}金。（现有 ${r.left} 个）${cap}`) };
        }
        case "buy-potion-set": { // 买自家商店随机刷出的药水套装（串门买别家的走 HTTP，by+token）
            const r = buyPotionSet(f, f, now);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `🎁 买下药水套装：+${r.qty} 瓶加速药水，-${r.cost}金（限购 1）。`) : r.error };
        }
        default: return { ok: false, text: `没有这个动作：${action ?? "(空)"}` };
    }
}
