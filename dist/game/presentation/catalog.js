import { codexCountByCategory, collectionPct, kitchenView, nextUpgradeReq } from "../../engine.js";
import { cropById, crops, cropsByCategory, getCrop, materialById, materials, recipes, totalCropCount } from "../../content.js";
import { allUgc } from "../../ugc.js";
import { refPrice } from "../market.js";

const TOT = {
    common: cropsByCategory("common").length,
    fantasy: cropsByCategory("fantasy").length,
    limited: cropsByCategory("limited").length,
};

const matName = (id) => materialById.get(id)?.name ?? id;

export function viewEncyclopedia(f, id) {
    if (id) {
        // 支持中文名 或 英文 id
        const c = getCrop(id) ?? crops.find((x) => x.name === id) ?? allUgc().find((x) => x.name === id);
        if (c) {
            const e = f.codex[c.id];
            const cat = c.category === "common" ? "普通" : c.category === "fantasy" ? "奇幻" : c.category === "ugc" ? `自创（设计者：${c.designer ?? "?"}）` : "限定";
            const lore = c.lore ? `\n${c.lore}` : "";
            return `「${c.name}」${c.latin} · ${c.rarity} · ${cat}\n${c.desc}${lore}\n${e ? `你的纪录：收获 ${e.count} 次` : "（你还没集到它）"}`;
        }
        const m = materialById.get(id) ?? materials.find((x) => x.name === id);
        if (m)
            return `🪨「${m.name}」· ${m.rarity}（素材）\n${m.desc}\n你的库存：×${f.materials[m.id] ?? 0}`;
        return `图鉴里没有这个：${id}（用作物中文名或 id 都行）`;
    }
    const ids = Object.keys(f.codex);
    const cc = codexCountByCategory(f, "common"), fc = codexCountByCategory(f, "fantasy"), lc = codexCountByCategory(f, "limited");
    const lines = [
        `📖 图鉴 官方 ${cc + fc + lc}/${totalCropCount}（${(collectionPct(f) * 100).toFixed(1)}%）`,
        `   普通 ${cc}/${TOT.common} · 奇幻 ${fc}/${TOT.fantasy} · 限定 ${lc}/${TOT.limited}`,
    ];
    const nu = nextUpgradeReq(f);
    lines.push(nu
        ? `🎯 升级到「${nu.next.name}」需 ${nu.req.coins}金 + 普通图鉴 ${nu.req.commonCodex} 种（你 ${f.coins}金 / 普通 ${cc} 种）`
        : "🏆 农场已满级——向集齐全图鉴冲刺！");
    const namesOf = (cat) => ids.map((i) => getCrop(i)).filter((c) => c?.category === cat).map((c) => c.name);
    const grp = (label, arr) => `${label}：${arr.length ? arr.join("、") : "（无）"}`;
    lines.push(grp("普通", namesOf("common")), grp("奇幻", namesOf("fantasy")), grp("限定", namesOf("limited")));
    const ugc = ids.map((i) => getCrop(i)).filter((c) => c?.category === "ugc").map((c) => `${c.name}`);
    if (ugc.length)
        lines.push(grp("🎨自创", ugc));
    lines.push("（查看作物或素材详情：doorbell({\"op\":\"farm.encyclopedia\",\"args\":{\"id\":\"作物或素材名\"}})）");
    return lines.join("\n");
}

// 素材库 + 熔炼台：看手头素材、可种的限定种子、熔炼说明
export function viewBag(f) {
    const mats = Object.entries(f.materials).filter(([, n]) => n > 0)
        .map(([id, n]) => { const m = materialById.get(id); return m ? `${m.name}·${m.rarity}×${n}` : `⚠️未知素材[${id}]×${n}（内容表里没有这个 id，存档或配方写错了）`; });
    const seeds = Object.entries(f.seeds).filter(([, n]) => n > 0)
        .map(([id, n]) => `${getCrop(id)?.name ?? id}×${n}（参考价🪙${refPrice("seed", id)}）`);
    // 已学配方：列组合 + 是否现在能熔（缺哪个料）
    const recipeLines = f.knownRecipes
        .map((out) => recipes.find((r) => r.output === out))
        .filter((r) => !!r)
        .map((r) => {
        const need = {};
        for (const m of r.materials)
            need[m] = (need[m] ?? 0) + 1;
        const missing = Object.entries(need).filter(([id, n]) => (f.materials[id] ?? 0) < n).map(([id]) => matName(id));
        const out = cropById.get(r.output);
        return `   ${r.materials.map(matName).join(" + ")} → ${out?.name ?? r.output}·${out?.rarity ?? ""}  ${missing.length ? "（缺：" + missing.join("、") + "）" : "✓可熔炼"}`;
    });
    return [
        `🪙 银币：${f.silver}（摆摊、卖鱼和料理回收可赚；可买玩家货物、料理食材/食谱，也可投喂生产动物）`,
        `🪨 素材库：${mats.length ? mats.join("、") : "（空，收获有概率掉素材）"}`,
        `🌱 限定种子：${seeds.length ? seeds.join("、") : "（空，熔炼可得）"}`,
        `📜 已学配方（${recipeLines.length}）：${recipeLines.length ? "\n" + recipeLines.join("\n") : "（无，商店第一层有概率刷出配方可买）"}`,
        `⚗️ 熔炼台：投入 ${recipes[0]?.materials.length ?? 3} 个素材 → 出一颗限定种子（任意 ${recipes[0]?.materials.length ?? 3} 个随机素材即可熔出一颗随机限定种子，不必凑配方）。`,
        `   规律：投入素材越稀有，越容易熔出高稀有作物（普通料多出 SR；带 SSR 料常出 SSR、偶尔 SP）；命中隐藏配方则稳出特定作物。`,
        `   熔炼示例（填素材库里的中文名或 id）：doorbell({"op":"farm.craft","args":{"materials":["普通石头","萤石","龙的指甲"]}})`,
        `   播种限定示例：doorbell({"op":"farm.plant","args":{"limited":["星语花"]}})`,
    ].join("\n");
}

const kitchenValueRange = (items, valueOf) => {
    const values = items.map(valueOf);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? String(min) : `${min}–${max}`;
};

const kitchenGroups = (items, keyOf) => {
    const groups = [];
    for (const item of items) {
        const key = keyOf(item);
        let group = groups.find((entry) => entry.key === key);
        if (!group) {
            group = { key, items: [] };
            groups.push(group);
        }
        group.items.push(item);
    }
    return groups;
};

export function viewKitchen(f, now, section = "overview", options = {}) {
    const view = kitchenView(f, now, options);
    const products = view.products.length
        ? kitchenGroups(view.products, (item) => item.source === "fish" ? `fish:${item.fishId}` : `product:${item.itemId}`).map((group) => {
            const item = group.items[0];
            const label = `${item.emoji ?? ""}${item.emoji ? " " : ""}${item.name} ×${group.items.length}`;
            return item.source === "fish"
                ? `${label} · 入菜估值 ${kitchenValueRange(group.items, (entry) => entry.value)} 金/份（直接卖鱼 🪙${kitchenValueRange(group.items, (entry) => entry.sellSilver)}/份）`
                : `${label} · 回收 ${kitchenValueRange(group.items, (entry) => entry.value)} 金/份`;
        }).join("\n  ")
        : "（空；去牧场收取动物产出）";
    const ingredients = view.ingredients.map((item) => `${item.emoji}${item.name}〔${item.id}〕 🪙${item.price}·有 ${item.owned}·今日已买 ${item.bought}/${item.dailyBuyLimit}`).join("\n  ");
    const ownedIngredients = view.ownedIngredients.length
        ? view.ownedIngredients.map((item) => `${item.emoji}${item.name}〔${item.id}〕×${item.qty}`).join("、")
        : "（空）";
    const dishes = view.dishes.length
        ? kitchenGroups(view.dishes, (dish) => dish.recipeId || dish.name).map((group) => {
            const dish = group.items[0];
            return `${dish.name}·${dish.rarity} ×${group.items.length} · 系统回收 ${kitchenValueRange(group.items, (entry) => entry.value)} 金${dish.recipeId === "odd_dish" ? "" : ` + 🪙${kitchenValueRange(group.items, (entry) => entry.recycleSilver)}/份`}`;
        }).join("\n  ")
        : "（空）";
    const offers = view.recipeOffers.length
        ? view.recipeOffers.map((recipe) => `${recipe.name}·${recipe.rarity}〔${recipe.id}〕 🪙${recipe.price}${recipe.known ? "（已会）" : ""}`).join("\n  ")
        : "（今天没有未知食谱可卖）";
    const recipeLine = (recipe) => `${recipe.name}·${recipe.rarity}${recipe.canCook ? " ✓可做" : "（缺料）"}`;
    const recipeCategories = ["主食小吃", "热菜", "汤羹", "甜品点心", "饮品"];
    const known = !view.knownRecipes.length
        ? "（还没解锁；买食谱或用正确组合试做都能解锁）"
        : view.knownRecipes.length <= 40
            ? view.knownRecipes.map(recipeLine).join("、")
            : recipeCategories.map((category) => {
                const rows = view.knownRecipes.filter((recipe) => recipe.category === category);
                return rows.length ? `【${category}】${rows.map(recipeLine).join("、")}` : "";
            }).filter(Boolean).join("\n  ");
    if (section === "recipes")
        return `📖 全部已解锁食谱（${view.knownRecipes.length}）：\n  ${known}\n\n制作：\n· doorbell({"op":"farm.kitchen.cook","args":{"recipe":"食谱名"}})`;
    const cookable = view.knownRecipes.filter((recipe) => recipe.canCook);
    const cookableText = cookable.length
        ? cookable.map((recipe) => `${recipe.name}·${recipe.rarity}`).join("、")
        : "（当前没有材料齐全的食谱）";
    const debuff = view.debuff ? `\n🥴 当前效果：${view.debuff.name}` : "";
    return `🍳 料理台 · 🪙${f.silver} · 牧场金币 ${f.ranch?.coins ?? 0}${debuff}\n\n🥚 动物产物／渔获：\n  ${products}\n\n🧂 已有商店食材：\n  ${ownedIngredients}\n\n🧺 今日食材铺：\n  ${ingredients}\n\n📜 今日食谱铺：\n  ${offers}\n\n🍲 料理柜：\n  ${dishes}\n\n📖 现在可做：\n  ${cookableText}\n\n全部已解锁食谱：\n· doorbell({"op":"farm.kitchen.view","args":{"section":"recipes"}})\n\n常用操作：\n· 购买：doorbell({"op":"farm.kitchen.buy","args":{"kind":"ingredient","id":"食材id","qty":1}})\n· 制作：doorbell({"op":"farm.kitchen.cook","args":{"recipe":"食谱名"}})\n· 使用：doorbell({"op":"farm.kitchen.use","args":{"dishId":"料理名","target":"self"}})\n· 回收：doorbell({"op":"farm.kitchen.sell","args":{"destination":"system","itemId":"名称","qty":1}})\n· 摆摊：doorbell({"op":"farm.kitchen.sell","args":{"destination":"market","itemId":"名称","qty":1,"price":25}})`;
}
