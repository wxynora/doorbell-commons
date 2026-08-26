import {
    affordablePotions,
    buyItem,
    craft,
    designCrop,
    harvest,
    harvestAll,
    plant,
    plantBatch,
    potionDailyLeft,
    ranchRoamLine,
    takeInbox,
    upgradeLand,
    useItem,
    usePotionBatch,
    usePotionPlots,
    water,
    waterAll,
} from "../../engine.js";
import { describeFarm, plantText, waterText } from "../../flavor.js";
import { acceptTask } from "../../tasks.js";
import { rollSeasonHarvest, rollSeasonStatus, seasonHeadline } from "../../season-events.js";
import { fishingStatusLine } from "../../fishing.js";
import { GLIMMER_BUFF_TEXT, glimmerBuffActive, glimmerStatusLine } from "../../glimmer.js";
import { qixi2026CompletionText, qixi2026TaskText, settleQixi2026QuietTask } from "../../qixi-2026.js";
import { POTION_DAILY_CAP } from "../../config.js";
import {
    composeHarvests,
    fmtHarvest,
    potionTargetLine,
    replantReminder,
    summarizePlanted,
    withFooter,
} from "../presentation/farm.js";
import { shopBrief } from "../presentation/shop.js";

/** potion:"auto"：用现有金币买足够药水（享套装折扣）催熟所有生长中的地，买不起就尽量催，并说明。 */
function autoPotion(f, now) {
    const growing = f.plots.filter((p) => p.crop && !p.crop.ripe).length;
    if (!growing)
        return "【加速】没有生长中的作物";
    const have = f.items.speed_potion ?? 0;
    const need = Math.max(0, growing - have);
    let bought = 0, spent = 0;
    if (need > 0) {
        // 官方店每天限购，这里也只买当日还能买的额度（防无限催熟）
        const can = Math.min(need, affordablePotions(f.coins), potionDailyLeft(f, now));
        if (can > 0) {
            const r = buyItem(f, "speed_potion", can, now);
            if (r.ok) {
                bought = r.qty;
                spent = r.cost;
            }
        }
    }
    const u = usePotionBatch(f, { all: true });
    const stillGrowing = growing - u.count;
    const buyMsg = bought > 0 ? `买 ${bought} 瓶(-${spent}金)，` : "";
    const short = stillGrowing > 0 ? `；还有 ${stillGrowing} 块没催（官方店每天限 ${POTION_DAILY_CAP} 瓶，可买药水套装/帮别人浇水/等收获掉落）` : "";
    return `【加速】auto ${buyMsg}催熟 ${u.count} 块${short}（剩 ${u.left} 瓶）`;
}

function doRun(f, b, now) {
    const parts = [];
    // 顺序：（可选 harvestFirst 先收上轮腾地）→ 种 → 浇 → 催 → 收。
    // 收获默认放在最后，这样催熟后能当场揭晓本轮——抽卡的爽点不被推迟到下一次 run。
    if (b.harvestFirst) {
        const se = f.plots.some((p) => p.crop?.ripe) ? rollSeasonHarvest(f, now) : null;
        const hs = harvestAll(f, now, se?.mod);
        if (hs.length)
            parts.push((se ? seasonHeadline(se.hit) + "\n" : "") + `【先收上轮 ${hs.length} 株】\n` + composeHarvests(hs, b.compact !== false, f.id));
    }
    if (b.plant) {
        const pr = plantBatch(f, { common: Number(b.plant.common) || 0, fantasy: Number(b.plant.fantasy) || 0, limited: b.plant.limited }, now);
        if (!pr.ok)
            parts.push(`【补种】${pr.error}`);
        else {
            // leftover 多半是"空地不够"(组合一轮会按总地数请求、已把空地种满)；只有还剩空地却没种下才是金币不够，那时才提示
            const emptyLeft = f.plots.filter((p) => !p.crop).length;
            const note = emptyLeft > 0 && pr.leftover ? `；还有 ${emptyLeft} 块空地没钱种` : "";
            parts.push(`【补种】${summarizePlanted(pr.planted)}（-${pr.spent} 金${note}）`);
        }
    }
    if (b.water) {
        const w = waterAll(f, "主人", true);
        if (w.ok)
            parts.push(`【浇水】${w.count} 块`);
        else if (b.water !== "if-any")
            parts.push("【浇水】没有可浇的");
    }
    if (b.potion != null) {
        if (b.potion === "auto")
            parts.push(autoPotion(f, now));
        else {
            const quiet = b.potion === "all-if-any";
            const u = usePotionBatch(f, b.potion === "all" || quiet ? { all: true } : { count: Number(b.potion) || 0 });
            if (u.ok)
                parts.push(`【加速】催熟 ${u.count} 块（剩 ${u.left} 瓶）`);
            else if (!quiet)
                parts.push("【加速】没有可催熟的，或没药水了");
        }
    }
    // 收在最后：催熟后立刻揭晓本轮（也会顺手收掉真实时间里已成熟的）。harvestAfter 是旧名，等价。
    if (b.harvest || b.harvestAfter) {
        const se = f.plots.some((p) => p.crop?.ripe) ? rollSeasonHarvest(f, now) : null;
        const hs = harvestAll(f, now, se?.mod);
        if (hs.length)
            parts.push((se ? seasonHeadline(se.hit) + "\n" : "") + `【收获 ${hs.length} 株】\n` + composeHarvests(hs, b.compact !== false, f.id));
        else if (b.harvest !== "if-any" && b.harvestAfter !== "if-any") {
            const growing = f.plots.filter((p) => p.crop && !p.crop.ripe).length;
            parts.push(growing > 0
                ? `【收获】本轮还没有可收的——${growing} 块在生长中（刚种下，或药水不足没催熟）。帮别人浇水攒药水/等真实时间长熟后，下次 run 即可收获揭晓。`
                : "【收获】没有成熟的作物（先种下种子，再浇水催熟）。");
        }
    }
    return { ok: true, text: withFooter(f, now, parts.join("\n") || "（这轮 run 没指定动作）") };
}

/** 熔炼/原创成功后的「种下」引导：有空地→鼓励直接种（Agent 页会自动出「🌷 种下「X」」按钮）；
 *  没空地→明确告知收获后再种。原始 JSON 降级成括号里的「接口」提示，别让它看着像后台指令。 */
export function plantHint(f, cropId, cropName) {
    const empty = f.plots.filter((p) => !p.crop).length;
    const json = `plant {"limited":["${cropId}"]}`;
    return empty > 0
        ? `🌷 现在有 ${empty} 块空地，随时可以种下「${cropName}」（种它：${json}）。`
        : `🌱 你的田当前没有空地，收获后可种下「${cropName}」（种它：${json}）。`;
}

export function handleFieldAction(action, f, b, now) {
    switch (action) {
        case "status": {
            const se = rollSeasonStatus(f, now); // 进农场季节事件（10% + 冷却；命中即结算到农场）
            const seLine = se ? seasonHeadline(se) + "\n————————————\n" : "";
            const quiet = settleQixi2026QuietTask(f, now);
            const qixi = [qixi2026CompletionText(quiet), qixi2026TaskText(f, now)].filter(Boolean).join("\n");
            const inbox = takeInbox(f);
            const box = inbox.length ? "📬 新消息：\n" + inbox.join("\n") + "\n————————————\n" : "";
            const roam = ranchRoamLine(f);
            const ptl = potionTargetLine(f, now); // 催熟候选（限定/稀有优先），让 POST AI 也能策略性指定催熟
            return { ok: true, text: withFooter(f, now, seLine + box + describeFarm(f, now) + (qixi ? "\n" + qixi : "") + (roam ? "\n" + roam : "") + (ptl ? "\n" + ptl : "") + "\n" + fishingStatusLine(f, now) + "\n" + glimmerStatusLine(f, now) + (glimmerBuffActive(now) ? "\n" + GLIMMER_BUFF_TEXT : "") + "\n" + shopBrief(f, now)) };
        }
        case "run": return doRun(f, b, now);
        case "plant": {
            if (b.plotId != null) {
                const r = plant(f, Number(b.plotId), b.seedType, b.limitedId, now);
                const lim = b.limitedId ? [String(b.limitedId)] : [];
                return { ok: r.ok, text: r.ok ? withFooter(f, now, plantText(lim)) : r.error };
            }
            const r = plantBatch(f, { common: Number(b.common) || 0, fantasy: Number(b.fantasy) || 0, limited: b.limited }, now);
            const lim = r.limitedIds;
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `${plantText(lim)}\n（种下 ${summarizePlanted(r.planted)}，-${r.spent} 金${r.leftover ? `；${r.leftover} 个没种下（空地不够或买不起）` : ""}）`) : (r.error ?? "种不了") };
        }
        case "water": {
            const isOwner = !b.by;
            if (b.plotId != null) {
                const r = water(f, Number(b.plotId), b.by ?? "主人", isOwner);
                return { ok: r.ok, text: r.ok ? withFooter(f, now, waterText(r.isOwner, r.by) + (r.capped ? "（运气已封顶）" : "")) : r.error };
            }
            const r = waterAll(f, b.by ?? "主人", isOwner);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `${waterText(isOwner, b.by ?? "主人")}（浇了 ${r.count} 块地）`) : "没有可浇水的作物" };
        }
        case "harvest": {
            if (b.plotId != null) {
                const plot = f.plots.find((p) => p.id === Number(b.plotId));
                const se = plot?.crop?.ripe ? rollSeasonHarvest(f, now) : null; // 收获型季节事件（仅在确实有熟可收时掷）
                const r = harvest(f, Number(b.plotId), now, se?.mod);
                if (!r.ok)
                    return { ok: false, text: r.error };
                return { ok: true, text: withFooter(f, now, (se ? seasonHeadline(se.hit) + "\n" : "") + fmtHarvest(r, f.id) + "\n" + replantReminder(1)) };
            }
            const se = f.plots.some((p) => p.crop?.ripe) ? rollSeasonHarvest(f, now) : null;
            const hs = harvestAll(f, now, se?.mod);
            return { ok: hs.length > 0, text: hs.length ? withFooter(f, now, (se ? seasonHeadline(se.hit) + "\n" : "") + `【收获 ${hs.length} 株】\n` + composeHarvests(hs, b.compact !== false, f.id) + "\n" + replantReminder(hs.length)) : "没有成熟的作物" };
        }
        case "ripen": {
            const r = usePotionPlots(f, b.plots);
            return {
                ok: r.ok,
                text: r.ok
                    ? withFooter(f, now, `🧪 催熟了 ${r.plotIds.join("、")} 号地（用了 ${r.count} 瓶，剩 ${r.left} 瓶）`)
                    : r.error,
            };
        }
        case "use": {
            if (b.auto || b.potion === "auto")
                return { ok: true, text: withFooter(f, now, autoPotion(f, now).replace(/^【加速】/, "🧪 ")) };
            if (b.all || b.count != null) {
                const r = usePotionBatch(f, { all: !!b.all, count: Number(b.count) || 0 });
                return { ok: r.ok, text: r.ok ? withFooter(f, now, `🧪 催熟了 ${r.count} 块地（剩 ${r.left} 瓶）`) : "没有可催熟的作物，或没药水了" };
            }
            const r = useItem(f, String(b.item ?? "speed_potion"), Number(b.plotId));
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `🧪 你用${r.name}催熟了 ${r.plotId} 号地，去收吧！（剩 ${r.left} 个）`) : r.error };
        }
        case "craft": {
            const r = craft(f, b.materials ?? [], now);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, [`⚗️ 熔炼成功！得到限定种子【${r.cropName}·${r.rarity}】${r.byRecipe ? "（命中隐藏配方！）" : ""}\n${plantHint(f, r.cropId, r.cropName)}`, qixi2026CompletionText(r.qixi)].filter(Boolean).join("\n")) : r.error };
        }
        case "design": {
            const r = designCrop(f, { name: b.name, desc: b.desc, latin: b.latin, plant: b.plant, harvest: b.harvest });
            const lines = r.ok
                ? [
                    `🎨 你设计出了作物【${r.crop.name}·${r.crop.rarity}】 ${r.crop.latin}`,
                    `「${r.crop.desc}」`,
                    r.crop.plantLine ? `🌱 播种文案：${r.crop.plantLine}` : "",
                    r.crop.lore ? `🌾 收获文案：${r.crop.lore}` : "",
                    `设计费 -${r.fee}金，到手 ${r.seeds} 颗种子。`,
                    plantHint(f, r.crop.id, r.crop.name),
                    `🧺 也能摆摊卖给别的玩家（上架：list {"kind":"seed","id":"${r.crop.id}","qty":1}）。`,
                ].filter(Boolean)
                : [];
            return {
                ok: r.ok,
                text: r.ok ? withFooter(f, now, lines.join("\n")) : r.error,
            };
        }
        case "upgrade-land": {
            const r = upgradeLand(f, now);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, `🌟 ${r.text}`) : r.error };
        }
        case "accept-task": {
            const r = acceptTask(f, now);
            return { ok: r.ok, text: r.ok ? withFooter(f, now, r.text) : r.text };
        }
        default: return undefined;
    }
}
