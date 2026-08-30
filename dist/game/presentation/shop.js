import { nextLockedAnimal, nextLockedPet, potionDailyLeft, ranchSkinShop, refreshShop, shopAnimals, shopOffer, shopPets } from "../../engine.js";
import { statusFooter } from "../../flavor.js";
import { animalById, cropById, getCrop, petById } from "../../content.js";
import { ITEMS, POTION_CAP_LINE, POTION_DAILY_CAP, RANCH_PATROL_GOOSE_BUY_COST, RANCH_PATROL_GOOSE_NAME } from "../../config.js";
import { qixi2026ShopRows } from "../../qixi-2026.js";
import { itemName } from "../market.js";
import { humanDisplay } from "./farm.js";

/** 精简商店（进农场/巡视时附带，免得单独查店）；完整两层见 viewShop */
export function shopBrief(f, now) {
    refreshShop(f, now);
    const s = shopOffer(f, now);
    const qixi = qixi2026ShopRows(f, now);
    let line = `🏪 商店：普通种子${s.common.price}金 · 奇幻种子${s.fantasy.price}金 · 🧪加速药水${ITEMS.speed_potion.price}金/瓶(今日已购${POTION_DAILY_CAP - potionDailyLeft(f, now)}/${POTION_DAILY_CAP})`;
    if (s.limited.length)
        line += ` · 🎏限定刷出:${s.limited.map((l) => `${l.name}(${l.price}金)`).join("/")}（购买：doorbell({"op":"farm.buy","args":{"source":"shop","kind":"seed","id":"作物id"}})，每种每天限1）`;
    if (f.shop.potionSet)
        line += `\n🎁 药水套装在售（${f.shop.potionSet.qty}瓶 ${f.shop.potionSet.price}金，限购1）→ doorbell({"op":"farm.buy","args":{"source":"farm-shop","kind":"potion-set"}})`;
    if (f.shop.recipe)
        line += `\n📜 配方在售【${cropById.get(f.shop.recipe)?.name ?? f.shop.recipe}】（500金）→ doorbell({"op":"farm.buy","args":{"source":"shop","kind":"recipe"}})`;
    if (qixi.length)
        line += `\n🎋 七夕限定种子：${qixi.map((item) => `${item.name}(${item.price}金·今日剩${item.left})`).join("、")} → doorbell({"op":"farm.buy","args":{"source":"shop","kind":"seed","id":"作物名"}})`;
    return line + "（查看完整两层商店：doorbell({\"op\":\"farm.shop\",\"args\":{}})）";
}

export function viewShop(f, now) {
    refreshShop(f, now);
    const s = shopOffer(f, now);
    const qixi = qixi2026ShopRows(f, now);
    const lim = s.limited.length ? "\n🎏 限定种子刷出：" + s.limited.map((l) => `${l.name}(${l.price}金)`).join("、") + "　→ 购买：doorbell({\"op\":\"farm.buy\",\"args\":{\"source\":\"shop\",\"kind\":\"seed\",\"id\":\"作物id\"}})（金币结算，每种每天限 1 颗；解锁的限定靠商店随机刷，没有常驻上架）" : "";
    const qixiLine = qixi.length ? `\n🎋 七夕限定种子：${qixi.map((item) => `${item.name}·${item.rarity} ${item.price}金（今日 ${item.bought}/5）`).join("、")}　→ 逐颗购买：doorbell({"op":"farm.buy","args":{"source":"shop","kind":"seed","id":"作物名"}})` : "";
    const potion = ITEMS.speed_potion;
    // 第一层：官方商店
    let recipeLine = "📜 配方：（暂无，每隔几小时刷新，看缘分）";
    if (f.shop.recipe) {
        const out = cropById.get(f.shop.recipe);
        if (out)
            recipeLine = `📜 配方上架：一张能熔出【${out.name}·${out.rarity}】的配方（具体素材组合，买下才揭晓）　500金 → doorbell({"op":"farm.buy","args":{"source":"shop","kind":"recipe"}})`;
    }
    const setLine = f.shop.potionSet
        ? `🎁 药水套装上架：${f.shop.potionSet.qty} 瓶加速药水 ${f.shop.potionSet.price} 金（限购 1）　→ doorbell({"op":"farm.buy","args":{"source":"farm-shop","kind":"potion-set"}})`
        : "🎁 药水套装：（暂无，每次刷新随机上架，看缘分；别人店里刷出的，串门也能买一份）";
    const layer1 = [
        "🏪 第一层 · 种子铺",
        `普通种子 ${s.common.price}金 · 奇幻种子 ${s.fantasy.price}金${lim}${qixiLine}`,
        potionDailyLeft(f, now) > 0
            ? `🧪 ${potion.name} ${potion.price}金/瓶（官方店每天限 ${POTION_DAILY_CAP} 瓶/农场，今日已购 ${POTION_DAILY_CAP - potionDailyLeft(f, now)}/${POTION_DAILY_CAP}）`
            : `🧪 ${potion.name}：🌙 官方药水今日已购满 ${POTION_DAILY_CAP}/${POTION_DAILY_CAP}——${POTION_CAP_LINE}`,
        setLine,
        recipeLine,
    ].join("\n");
    // 第二层：玩家市场——你自己的摊位
    const layer2 = [
        "🧺 第二层 · 你的摊位（银币结算，别人串门能买）",
        (() => {
            const items = f.market.filter((m) => !(m.kind === "seed" && getCrop(m.id)?.banned));
            return items.length ? items.map((m) => `· ${m.kind === "material" ? "素材" : "种子"}「${itemName(m.kind, m.id)}」×${m.qty} @ 🪙${m.price}银`).join("\n") : "（空）";
        })(),
        "上架素材：doorbell({\"op\":\"farm.list\",\"args\":{\"kind\":\"material\",\"id\":\"素材id\",\"qty\":1}})（统一参考价，不能自定价）　撤摊：doorbell({\"op\":\"farm.unlist\",\"args\":{\"kind\":\"material\",\"id\":\"素材id\"}})",
    ].join("\n");
    return `${layer1}\n────────────────────\n${ranchShopSection(f, now)}\n────────────────────\n${layer2}\n${statusFooter(f, now)}`;
}

/** 商店里的「牧场动物」区：图鉴解锁后自动上架，买下送给伴侣（每种限 1 只，伴侣养+升级）。 */
export function ranchShopSection(f, now = Date.now()) {
    const owned = new Set((f.ranch?.animals ?? []).map((a) => a.kindId));
    const avail = shopAnimals(f).filter((a) => !owned.has(a.id));
    const officialCount = Object.keys(f.codex).filter((id) => cropById.has(id)).length;
    const partner = humanDisplay(f);
    const lines = [`🐾 牧场动物（图鉴解锁后买给${partner}养；每种限 1 只，产出归${partner}、${partner}自己升级提产出）`];
    if (!avail.length) {
        const nx = nextLockedAnimal(f);
        lines.push(nx ? `（没有可买的新动物——再集 ${nx.unlockCodex - officialCount} 种图鉴解锁【${nx.name}】）` : "（没有可买的新动物）");
    }
    else {
        for (const a of avail)
            lines.push(`· ${a.emoji ? a.emoji + " " : ""}${a.name}（${a.buyCost}金）产${a.produce}　→ doorbell({"op":"farm.buy-companion","args":{"kind":"animal","id":"${a.id}"}})`);
        const nx = nextLockedAnimal(f);
        if (nx)
            lines.push(`（下一种【${nx.name}】需图鉴 ${nx.unlockCodex} 种）`);
    }
    // 宠物区：买给伴侣养、不产出，只陪着 + 给农场一份温和加成
    const ownedPets = new Set((f.ranch?.pets ?? []).map((p) => p.kindId));
    const availPets = shopPets(f).filter((p) => !ownedPets.has(p.id));
    if (availPets.length) {
        lines.push(`──── 🐱 宠物（买给${partner}养，不产出；陪着你 + 给农场一份温和加成，${partner}可改名/打扮）────`);
        for (const p of availPets)
            lines.push(`· ${p.emoji} ${p.name}（${p.buyCost}金）${p.tag}　→ doorbell({"op":"farm.buy-companion","args":{"kind":"pet","id":"${p.id}"}})`);
    }
    else {
        const np = nextLockedPet(f);
        if (np)
            lines.push(`──── 🐱 宠物：再集 ${np.unlockCodex - officialCount} 种图鉴解锁【${np.name}】（${np.buyCost}金·${np.tag}）────`);
    }
    if (!f.ranch?.patrolGoose)
        lines.push(`──── 🪿 独立牧场守卫（无图鉴门槛）────\n· ${RANCH_PATROL_GOOSE_NAME}（${RANCH_PATROL_GOOSE_BUY_COST}金）25% 自动赶走未被人类先抓住的偷金币动物，每天最多成功 3 次　→ doorbell({"op":"farm.buy-companion","args":{"kind":"patrol-goose"}})`);
    else
        lines.push(`──── 🪿 ${RANCH_PATROL_GOOSE_NAME}：它会常驻牧场巡逻。────`);
    const skinOffers = ranchSkinShop(f, now).filter((skin) => !skin.owned);
    if (skinOffers.length) {
        lines.push("──── 🎨 限定皮肤（08月30日—09月29日）────");
        for (const skin of skinOffers)
            lines.push(`· ${skin.name}（${skin.price}金）`);
    }
    return lines.join("\n");
}

/** Agent 页（只能点链接的 AI）的牧场区：买得起的已解锁动物→交给 selfActions 生成按钮；
 *  买不起 / 未解锁 / 已送养→文字说明；showLedger=是否给「看账本」入口（买过动物或有往来才显示）。 */
export function ranchAgentSection(f) {
    const owned = new Set((f.ranch?.animals ?? []).map((a) => a.kindId));
    const officialCount = Object.keys(f.codex).filter((id) => cropById.has(id)).length;
    const partner = humanDisplay(f);
    const buttons = [];
    const lines = [];
    for (const a of shopAnimals(f)) {
        if (owned.has(a.id))
            continue; // 每种限 1 只，已送养的不再上架
        const tag = a.emoji ? a.emoji + " " : "";
        if (f.coins >= a.buyCost)
            buttons.push({ id: a.id, label: `🎁 买给${partner}养｜${tag}${a.name} · ${a.buyCost}金（产${a.produce}）` });
        else
            lines.push(`· ${tag}${a.name}（${a.buyCost}金）已解锁——你还差 ${a.buyCost - f.coins} 金`);
    }
    const nx = nextLockedAnimal(f);
    if (nx)
        lines.push(`· 🔒 ${nx.name}：再集 ${nx.unlockCodex - officialCount} 种图鉴解锁（需 ${nx.unlockCodex} 种·你 ${officialCount} 种）`);
    if (owned.size)
        lines.push(`· ✅ 已送养：${[...owned].map((id) => { const k = animalById.get(id); return (k?.emoji ?? "") + (k?.name ?? id); }).join("、")}（${partner}在牧场替你养着）`);
    // 宠物：买给伴侣养、不产出，给农场温和加成（招财猫/看家狗）
    const ownedPets = new Set((f.ranch?.pets ?? []).map((p) => p.kindId));
    for (const p of shopPets(f)) {
        if (ownedPets.has(p.id))
            continue; // 每种限 1 只
        const tag = p.emoji + " ";
        if (f.coins >= p.buyCost)
            buttons.push({ id: `pet:${p.id}`, label: `🎁 买宠物送${partner}｜${tag}${p.name} · ${p.buyCost}金（${p.tag}）` });
        else
            lines.push(`· ${tag}${p.name}（${p.buyCost}金·${p.tag}）已解锁——你还差 ${p.buyCost - f.coins} 金`);
    }
    const np = nextLockedPet(f);
    if (np)
        lines.push(`· 🔒 ${np.emoji}${np.name}（宠物·${np.tag}）：再集 ${np.unlockCodex - officialCount} 种图鉴解锁`);
    if (ownedPets.size)
        lines.push(`· ✅ 已养宠物：${[...ownedPets].map((id) => { const k = petById.get(id); return (k?.emoji ?? "") + (k?.name ?? id); }).join("、")}（${partner}在牧场替你养着、可改名打扮）`);
    if (!f.ranch?.patrolGoose) {
        if (f.coins >= RANCH_PATROL_GOOSE_BUY_COST)
            buttons.push({ id: "patrol-goose", label: `🎁 给${partner}的牧场请巡逻鹅｜🪿 ${RANCH_PATROL_GOOSE_BUY_COST}金（25%自动赶走偷金币动物·每天最多成功3次）` });
        else
            lines.push(`· 🪿 ${RANCH_PATROL_GOOSE_NAME}（${RANCH_PATROL_GOOSE_BUY_COST}金·独立常驻牧场守卫）——你还差 ${RANCH_PATROL_GOOSE_BUY_COST - f.coins} 金`);
    }
    else {
        lines.push(`· ✅ 🪿 ${RANCH_PATROL_GOOSE_NAME}：它会常驻牧场巡逻。`);
    }
    const showLedger = owned.size > 0 || ownedPets.size > 0 || !!f.ranch?.patrolGoose || (f.ledger ?? []).length > 0;
    const text = lines.length ? `🐾 牧场（买动物/宠物送${partner}养，${partner}收获时可能掉药水进你仓库）：\n` + lines.join("\n") : "";
    return { buttons, text, showLedger };
}

/** 机⇄人往来流水（AI 唯一能看到的牧场信息：买动物支出 / 双向转账 / 药水入库）。 */
export function viewLedger(f) {
    const ranch = f.ranch;
    const partner = humanDisplay(f);
    const head = ranch
        ? `🐮 牧场往来（${partner}在养 ${ranch.animals.length} 只动物；牧场内部你看不到，只看这本账）`
        : `🐮 牧场往来（还没开张——购买动物送${partner}就开始了：doorbell({"op":"farm.buy-companion","args":{"kind":"animal","id":"chicken"}})）`;
    const log = (f.ledger ?? []);
    if (!log.length)
        return `${head}\n（暂无往来。买动物送${partner} / 等${partner}回传金币、收获掉药水入库，都会记在这里。）`;
    const rows = log.slice(0, 12).map((e) => {
        const icon = (e.type === "buy-animal" || e.type === "buy-pet" || e.type === "buy-patrol-goose") ? "🐾 -" : e.type === "remit" ? "💰 +" : e.type === "send-ranch" ? "💰 -" : "🧪 +";
        const unit = e.type === "potion" ? "瓶" : "金";
        return `· ${icon}${e.amount}${unit}　${e.note}`;
    });
    return `${head}\n${rows.join("\n")}`;
}
