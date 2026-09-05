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
import { kitchenToolOffer } from "../../domain/kitchen/tool-catalog.js";

export const KITCHEN_DOMAIN_ERROR_TEXT = Object.freeze({
    anchor_content_unavailable: "料理评分内容暂时不可用，本次没有执行。",
    anchor_mismatch: "料理评分基准不一致，本次没有执行。",
    anchor_source_unavailable: "料理评分基准暂时不可用，本次没有执行。",
    chef_original_recipe_not_unlocked: "还没有解锁这份原创食谱。",
    cook_unavailable: "料理台暂时无法完成这次制作，本次没有执行。",
    cooking_receipt_conflict: "这次原创料理请求与已有记录不一致，本次没有重复制作。",
    culinary_base_unavailable: "料理基础评分暂时不可用，本次没有执行。",
    farm_unavailable: "农场料理状态暂时不可用，本次没有执行。",
    hard_conflict_content_unavailable: "食材冲突规则暂时不可用，本次没有执行。",
    hard_conflict_unavailable: "暂时无法判断食材冲突，本次没有执行。",
    ingredient_content_unavailable: "食材资料暂时不可用，本次没有执行。",
    insufficient_coins: "金币不足，本次没有执行。",
    method_content_unavailable: "料理做法资料暂时不可用，本次没有执行。",
    method_required: "请选择一种料理做法后再制作。",
    method_score_unavailable: "暂时无法计算所选做法的评分，本次没有执行。",
    method_unavailable: "没有这种料理做法，本次没有执行。",
    original_cooking_receipt_unavailable: "暂时无法确认原创料理的登记结果，本次没有完成制作。",
    original_recipe_ingredients_mismatch: "所选食材与这份原创食谱不一致，本次没有执行。",
    pair_score_unavailable: "暂时无法计算这组食材的搭配评分，本次没有执行。",
    quality_content_unavailable: "料理品质规则暂时不可用，本次没有执行。",
    quality_content_version_unavailable: "料理品质规则版本暂时不可用，本次没有执行。",
    quality_version_mismatch: "料理品质规则版本不一致，本次没有执行。",
    quality_version_unavailable: "料理品质规则版本暂时不可用，本次没有执行。",
    recipe_anchor_invalid: "这份食谱的评分基准无效，本次没有执行。",
    recipe_catalog_unavailable: "食谱资料暂时不可用，本次没有执行。",
    recipe_method_mismatch: "所选做法与这份食谱不匹配，本次没有执行。",
    recipe_method_missing: "这份食谱缺少料理做法，暂时不能制作。",
    recipe_shape_invalid: "这份食谱的结构无效，本次没有执行。",
    refresh_exhausted: "今天的食材铺刷新次数已经用完。",
    shop_unavailable: "今天的食材铺暂时不可用，本次没有执行。",
    structure_content_unavailable: "料理结构规则暂时不可用，本次没有执行。",
    structure_score_unavailable: "暂时无法计算料理结构评分，本次没有执行。",
    tool_required: "这种做法需要先购买对应的料理工具。",
});

const TECHNICAL_DOMAIN_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

export function kitchenDomainErrorText(failure, fallback = "料理台暂时无法完成这次操作，本次没有执行。") {
    const direct = typeof failure?.error === "string" ? failure.error.trim() : "";
    if (direct && !TECHNICAL_DOMAIN_CODE.test(direct))
        return direct;
    const code = typeof failure?.code === "string"
        ? failure.code
        : typeof failure === "string" ? failure : "";
    if (code === "tool_required") {
        const tool = kitchenToolOffer(failure.toolId);
        if (tool)
            return `缺少${tool.name}，这次没有消耗食材。\n购买：doorbell({"op":"farm.kitchen.buy","args":{"kind":"tool","id":"${tool.tool_id}"}})`;
    }
    return KITCHEN_DOMAIN_ERROR_TEXT[code] ?? fallback;
}

function originalResearchStatusText(status) {
    if (status === "failed")
        return "没有研发成功，食材已经按本次结果结算";
    if (status === "rejected")
        return "没有通过研发条件，本次没有登记菜谱";
    return "没有登记出新菜谱";
}

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
        return { ok: r.ok, text: r.ok ? withFooter(f, now, `${r.kind === "recipe" ? "📜" : "🧺"} 买下${r.name}${r.qty ? `×${r.qty}` : ""}，-🪙${r.cost}。`) : kitchenDomainErrorText(r) };
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
                        : `🥴 这次原创研发${originalResearchStatusText(researched.status)}。`),
                };
            }
            catch (error) {
                return { ok: false, text: kitchenDomainErrorText(error, "原创菜谱研发失败，本次没有登记菜谱。") };
            }
        }
        const r = b.recipe != null
            ? kitchenCookKnownRecipe(f, b.recipe, now, options)
            : kitchenCook(f, b.items, now, { ...options, methodId: b.method });
        if (!r.ok)
            return { ok: false, text: kitchenDomainErrorText(r) };
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
            return { ok: false, text: '贿赂看家狗需要指定被拦的农场。下一步：doorbell({"op":"farm.kitchen.bribe","args":{"dishId":"料理名","to":"被拦农场编号"}})' };
        const r = kitchenUse(f, String(b.dishId), String(b.target), now);
        if (!r.ok)
            return { ok: false, text: kitchenDomainErrorText(r) };
        const line = r.target === "self"
            ? `🥴 你吃下了微妙的料理：${r.debuff.name}，持续 2 小时。人类伴侣仍可正常操作。`
            : `🍽️ ${r.target === "cat" ? "小猫" : "小狗"}吃下「${r.dish.name}·${r.dish.rarity}」，本次料理加成已替换旧效果，持续到 ${new Date(r.buff.endsAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}。`;
        return { ok: true, text: withFooter(f, now, line) };
    }
    if (op === "sell") {
        const r = kitchenSellSelected(f, String(b.itemId), b.qty ?? 1, String(b.to), b.price, now);
        if (!r.ok)
            return { ok: false, text: kitchenDomainErrorText(r) };
        const line = r.to === "system"
            ? `♻️ 系统回收「${r.name}」×${r.qty}，+${r.value} 牧场金币${r.silver ? ` + ${r.silver} 银` : ""}。`
            : `🧺 「${r.name}」×${r.qty} 已按 🪙${r.price}/份摆上玩家摊位，成交后扣 10% 手续费。`;
        return { ok: true, text: withFooter(f, now, line) };
    }
    return { ok: false, text: '无法识别这项料理操作。下一步：doorbell({"op":"farm.help","args":{"operation":"farm.kitchen.view"}})' };
}
