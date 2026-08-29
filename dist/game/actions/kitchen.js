import {
    dishSystemRecycleSilver,
    kitchenBuy,
    kitchenCook,
    kitchenCookKnownRecipe,
    kitchenSellSelected,
    kitchenUse,
} from "../../engine.js";
import { qixi2026CompletionText } from "../../qixi-2026.js";
import { viewKitchen } from "../presentation/catalog.js";
import { withFooter } from "../presentation/farm.js";

export function handleKitchenAction(action, f, b, now, options = {}) {
    if (action !== "kitchen")
        return undefined;
    const op = String(b.op ?? "view");
    if (op === "view")
        return { ok: true, text: viewKitchen(f, now, String(b.view ?? "overview"), options) };
    if (op === "buy") {
        const kind = String(b.kind);
        const id = String(b.id);
        let r;
        if (kind === "tool" && typeof options.purchaseKitchenTool === "function") {
            r = options.purchaseKitchenTool(id);
        }
        else {
            r = kitchenBuy(f, kind, id, b.qty, now, options);
        }
        return { ok: r.ok, text: r.ok ? withFooter(f, now, `${r.kind === "recipe" ? "📜" : "🧺"} 买下${r.name}${r.qty ? `×${r.qty}` : ""}，-🪙${r.cost}。`) : r.error };
    }
    if (op === "cook") {
        if (b.name != null) {
            if (typeof options.researchOriginalRecipe !== "function")
                return { ok: false, text: "只有已绑定并持有料理师资格的居民可以研发原创菜谱。" };
            try {
                const researched = options.researchOriginalRecipe({
                    items: b.items,
                    methodId: String(b.method ?? ""),
                    recipeName: String(b.name),
                });
                const recipe = researched.recipe ?? null;
                return {
                    ok: true,
                    text: withFooter(f, now, recipe
                        ? `📜 原创菜谱「${recipe.name}·${recipe.rarity}」已经登记。`
                        : `🥴 这次原创研发结果是${researched.status}。`),
                };
            }
            catch (error) {
                return { ok: false, text: error?.code ?? "原创菜谱研发失败。" };
            }
        }
        const r = b.recipe != null
            ? kitchenCookKnownRecipe(f, b.recipe, now, options)
            : kitchenCook(f, b.items, now, { ...options, methodId: b.method });
        if (!r.ok)
            return { ok: false, text: r.error };
        if (r.qixi) {
            const submitted = `黄油曲奇 ×1 已提交至七夕任务。`;
            return { ok: true, text: withFooter(f, now, [submitted, qixi2026CompletionText(r.qixi)].filter(Boolean).join("\n")) };
        }
        const line = r.odd
            ? `🥴 锅里端出了一份「微妙的料理」：只能 1 金系统回收，或由你自己吃下并随机承受 2 小时负面效果。`
            : `🍲 做出了【${r.dish.name}·${r.dish.rarity}】！系统回收价已锁定为 ${r.dish.value} 牧场金币 + ${dishSystemRecycleSilver(r.dish)} 银。${r.discovered ? "还通过这次正确试做解锁了食谱。" : ""}`;
        return { ok: true, text: withFooter(f, now, line) };
    }
    if (op === "use") {
        if (String(b.target) === "guard-dog")
            return { ok: false, text: "贿赂看家狗要带上被拦农场的 to，由联网农场服务继续同一次偷菜。" };
        const r = kitchenUse(f, String(b.dishId), String(b.target), now);
        if (!r.ok)
            return { ok: false, text: r.error };
        const line = r.target === "self"
            ? `🥴 你吃下了微妙的料理：${r.debuff.name}，持续 2 小时。人类伴侣仍可正常操作。`
            : `🍽️ ${r.target === "cat" ? "小猫" : "小狗"}吃下「${r.dish.name}·${r.dish.rarity}」，本次料理加成已替换旧效果，持续到 ${new Date(r.buff.endsAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}。`;
        return { ok: true, text: withFooter(f, now, line) };
    }
    if (op === "sell") {
        const r = kitchenSellSelected(f, String(b.itemId), b.qty ?? 1, String(b.to), b.price, now);
        if (!r.ok)
            return { ok: false, text: r.error };
        const line = r.to === "system"
            ? `♻️ 系统回收「${r.name}」×${r.qty}，+${r.value} 牧场金币${r.silver ? ` + ${r.silver} 银` : ""}。`
            : `🧺 「${r.name}」×${r.qty} 已按 🪙${r.price}/份摆上玩家摊位，成交后扣 10% 手续费。`;
        return { ok: true, text: withFooter(f, now, line) };
    }
    return { ok: false, text: "kitchen op 只能是 view、buy、cook、use 或 sell。" };
}
