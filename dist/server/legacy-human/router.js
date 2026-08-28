import { randomUUID } from "node:crypto";

import {
    advance,
    catchRanchRaid,
    craft,
    designCrop,
    dishSystemRecycleSilver,
    dispatchRanchRaid,
    humanBarterAccept,
    humanBarterList,
    humanBarterUnlist,
    humanHarvestAll,
    humanHarvestLeft,
    kitchenBuy,
    kitchenCook,
    kitchenSellMany,
    kitchenSellSelected,
    kitchenUse,
    pushSocialInbox,
    ranchBuyAccessory,
    ranchBuyDecoration,
    ranchCollect,
    ranchFeedAnimal,
    ranchNameAnimal,
    ranchNamePatrolGoose,
    ranchNamePet,
    ranchPlaceDecoration,
    ranchRemit,
    ranchTakeOffAccessory,
    ranchTogglePin,
    ranchUnplaceDecoration,
    ranchUpgradeAnimal,
    ranchWearAccessory,
    settleRanchRaids,
    takeRanchNotices,
    toggleStar,
} from "../../engine.js";
import { buyFromMarket, dispatch } from "../../game.js";
import {
    allFarms,
    getFarm,
    getGlimmerWorld,
    getPublicExpeditionWorld,
    getQixiLantern2026World,
    playerFarms,
    save,
} from "../../store.js";
import { BASE, HUMAN_HARVEST_DAILY_CAP, WELCOME_MAX } from "../../config.js";
import {
    uiCodex,
    uiCooking,
    uiExpedition,
    uiGlimmer,
    uiHome,
    uiHumanNotices,
    uiInvalid,
    uiLeaderboard,
    uiMarket,
    uiMessages,
    uiQixiLantern,
    uiRanch,
    uiTa,
    uiTogether,
} from "../../web.js";
import { expRoll, expSetCharm } from "../../expedition.js";
import { onTaskEvent } from "../../tasks.js";
import { checkTitles, equipTitle } from "../../titles.js";
import { rollSeasonHarvest } from "../../season-events.js";
import { sellFishingCatchIds, sellFishingTreasure } from "../../fishing.js";
import { setGlimmerVariant } from "../../glimmer.js";
import { advancePublicExpedition, findPublicDish, takePublicDish } from "../../public-expedition.js";
import { qixi2026CompletionText, settleQixi2026QuietTask } from "../../qixi-2026.js";
import {
    acknowledgeQixiLantern2026Reward,
    answerQixiLantern2026Quiz,
    catchQixiLantern2026,
    isQixiLantern2026Active,
    reconcileQixiLantern2026Farm,
    recordQixiLantern2026Answers,
    releaseQixiLantern2026,
    returnQixiLantern2026Object,
    saveQixiLantern2026Draft,
    submitQixiLantern2026Dish,
} from "../../qixi-lantern-2026.js";
import { htmlGenLink } from "../../agent.js";
import { AGENT_HEADERS, readFormBody } from "../http.js";
import { internalServiceError } from "../doorbell/contract.js";
import {
    applyHumanFarmNames,
    applyHumanFarmSocialSetting,
    validateHumanFarmNames,
} from "../farm-settings-authority.js";
import {
    handleHumanNeighborhoodMessageAction,
    neighborhoodMessageActionRevision,
} from "../neighborhood-message-action.js";

// Legacy Human HTML routes stay isolated from the Doorbell internal API. Errors are
// intentionally allowed to escape so server.js retains ownership of the outer catch.
export async function handleLegacyHumanRoute({
    req,
    res,
    url,
    parts,
    sp,
    method,
    now,
    ensureAgentKey,
    farmByNumber,
    farmLabel,
    careerBenefitsForFarm,
}) {
    const key = parts[1] ?? "";
    const f = key ? allFarms().find((x) => x.humanKey === key) : undefined;
    if (!f) {
        res.writeHead(404, AGENT_HEADERS);
        return res.end(uiInvalid());
    }
    const raidSettlement = settleRanchRaids(playerFarms(), now);
    if (raidSettlement.settled > 0)
        for (const farm of playerFarms())
            checkTitles(farm);
    advance(f, now);
    if (!f.humanFrontendSeen) {
        f.humanFrontendSeen = true;
        save();
    } // 伴侣已打开前端 → Agent 页"先发链接"新手任务可撤掉
    else if (raidSettlement.settled > 0)
        save();
    const section = parts[2];
    const renderHuman = (html) => {
        if (method !== "GET")
            return html;
        const publicWorld = getPublicExpeditionWorld();
        const publicFarms = playerFarms();
        advancePublicExpedition(publicWorld, publicFarms, now);
        const notices = takeRanchNotices(f, section);
        if (notices.length)
            save();
        return uiHumanNotices(html, notices);
    };
    // 🌾 人类帮自己的 AI 一键收完当时全部成熟作物：只认本页 humanKey，成功一批才消耗每日 1 次额度。
    if (section === "harvest" && method === "POST") {
        const canRollSeason = f.plots.some((p) => p.crop?.ripe) && humanHarvestLeft(f, now) > 0;
        const se = canRollSeason ? rollSeasonHarvest(f, now) : null;
        const r = humanHarvestAll(f, now, se?.mod, careerBenefitsForFarm?.(f));
        let flash;
        if (!r.ok) {
            flash = `⚠️ ${r.error}`;
        }
        else {
            const cropCounts = new Map();
            for (const item of r.results)
                cropCounts.set(item.crop.name, (cropCounts.get(item.crop.name) ?? 0) + 1);
            const crops = [...cropCounts].map(([name, n]) => `「${name}」${n > 1 ? `×${n}` : ""}`).join("、");
            const gold = r.results.reduce((sum, item) => sum + (item.currency === "silver" ? 0 : item.value) + (item.codexReward ?? 0) + (item.bonus?.extraCoins ?? 0), 0);
            const silver = r.results.reduce((sum, item) => sum + (item.currency === "silver" ? item.value : 0), 0);
            const newCount = r.results.filter((item) => item.isNew).length;
            const drops = r.results.flatMap((item) => item.drop ? [item.drop.name] : []);
            const potionCount = r.results.filter((item) => item.potionDrop).length;
            const extras = `${newCount ? ` · 新图鉴×${newCount}` : ""}${drops.length ? ` · 掉落${drops.join("、")}` : ""}${potionCount ? ` · 加速药水×${potionCount}` : ""}${se ? ` · ${se.hit.name}` : ""}`;
            const gain = [gold ? `+${gold} 金` : "", silver ? `+${silver} 银` : ""].filter(Boolean).join(" · ");
            const qixi = [...new Set(r.results.map((item) => qixi2026CompletionText(item.qixi)).filter(Boolean))].join("\n");
            flash = [`🌾 一键帮${f.aiName || f.name || "TA"}收下 ${r.count} 株：${crops}，共 ${gain}${extras}；今日已帮收 ${r.used}/${HUMAN_HARVEST_DAILY_CAP} 次`, qixi].filter(Boolean).join("\n");
            pushSocialInbox(f, `🌾 ${f.humanName || "你的伴侣"}刚帮你一键收了 ${r.count} 株，空出了 ${r.count} 块地。`, now);
            checkTitles(f);
        }
        save();
        res.writeHead(303, { ...AGENT_HEADERS, Location: `${BASE}/ui/${key}?flash=${encodeURIComponent(flash)}` });
        return res.end();
    }
    // 🎖️ 佩戴称号：主页名字旁的下拉提交到这里。POST /ui/<key>/title → 存 titleEquipped → 303 跳回主页。
    if (section === "title" && method === "POST") {
        const form = await readFormBody(req);
        checkTitles(f); // 佩戴前补结算解锁
        equipTitle(f, String(form.id ?? "").trim());
        save();
        res.writeHead(303, { ...AGENT_HEADERS, Location: `${BASE}/ui/${key}` });
        return res.end();
    }
    // 🧺 人类集市：浏览现有银币摊位；换物单只走 humanKey 页面，不进入 AI market/list/buy 工具。
    if (section === "market") {
        const act = parts[3];
        if (method === "POST" && ["buy", "list", "trade", "unlist"].includes(act)) {
            const form = await readFormBody(req);
            const splitRef = (raw) => {
                const value = String(raw ?? "");
                const at = value.indexOf(":");
                return at > 0 ? { kind: value.slice(0, at), id: value.slice(at + 1) } : { kind: "", id: "" };
            };
            let flash;
            if (act === "buy") {
                const seller = getFarm(String(form.seller ?? ""));
                if (!seller) {
                    flash = "⚠️ 这家摊位已经不存在了。";
                }
                else {
                    const r = buyFromMarket(seller, f, String(form.kind), String(form.id), form.qty, now);
                    if (r.ok) {
                        if (form.kind === "seed" && String(form.id).startsWith("ugc_"))
                            onTaskEvent(f, "buy_ugc", now);
                        checkTitles(f);
                        flash = `🛒 从「${seller.name}」买到「${r.name}」×${r.qty}，-🪙${r.cost} 银`;
                    }
                    else
                        flash = `⚠️ ${r.error}`;
                }
            }
            else if (act === "list") {
                const give = splitRef(form.give);
                const want = splitRef(form.want);
                const r = humanBarterList(f, give.kind, give.id, form.giveQty, want.kind, want.id, form.wantQty, now);
                flash = r.ok
                    ? `🔁 已摆上：${r.give.name}×${r.giveQty} ⇄ ${r.want.name}×${r.wantQty}`
                    : `⚠️ ${r.error}`;
            }
            else if (act === "trade") {
                const seller = getFarm(String(form.seller ?? ""));
                if (!seller) {
                    flash = "⚠️ 这张换物单已经不存在了。";
                }
                else {
                    const r = humanBarterAccept(seller, f, String(form.listing ?? ""), now);
                    flash = r.ok
                        ? `🔁 已用${r.want.name}×${r.wantQty}换到${r.give.name}×${r.giveQty}`
                        : `⚠️ ${r.error}`;
                }
            }
            else {
                const r = humanBarterUnlist(f, String(form.listing ?? ""));
                flash = r.ok ? `📦 已下架并取回${r.give.name}×${r.giveQty}` : `⚠️ ${r.error}`;
            }
            save();
            res.writeHead(303, { ...AGENT_HEADERS, Location: `${BASE}/ui/${key}/market?flash=${encodeURIComponent(flash)}` });
            return res.end();
        }
        res.writeHead(200, AGENT_HEADERS);
        return res.end(renderHuman(uiMarket(f, playerFarms(), now, key, url.searchParams.get("flash") ?? undefined)));
    }
    // 🍳 料理台：食材铺、配方、下锅动画结算、料理柜使用/回收/摆摊。
    if (section === "cooking") {
        const act = parts[3];
        if (method === "POST" && ["buy-ingredient", "buy-recipe", "cook", "use", "sell", "sell-fish", "sell-treasure"].includes(act)) {
            const form = await readFormBody(req);
            let flash;
            let result;
            if (act === "buy-ingredient") {
                const r = kitchenBuy(f, "ingredient", String(form.id), form.qty, now, careerBenefitsForFarm?.(f));
                flash = r.ok ? `🧺 买下${r.name}×${r.qty}（-🪙${r.cost}）` : r.error;
            }
            else if (act === "buy-recipe") {
                const r = kitchenBuy(f, "recipe", String(form.id), 1, now, careerBenefitsForFarm?.(f));
                flash = r.ok ? `📜 学会了「${r.name}·${r.rarity}」（-🪙${r.cost}）` : r.error;
            }
            else if (act === "cook") {
                let items = [];
                try {
                    items = JSON.parse(String(form.items ?? "[]"));
                }
                catch { /* 引擎给出数量提示 */ }
                const r = kitchenCook(f, items, now, careerBenefitsForFarm?.(f));
                if (r.ok) {
                    flash = r.qixi
                        ? "黄油曲奇 ×1 已提交至七夕任务。"
                        : r.odd
                        ? "🥴 没有命中固定配方，食材已全部消耗，得到一份微妙的料理"
                        : `🍲 做出「${r.dish.name}·${r.dish.rarity}」，锁定系统回收价 ${r.dish.value} 金 + ${dishSystemRecycleSilver(r.dish)} 银${r.discovered ? "；正确试做同时解锁了食谱" : ""}`;
                    result = JSON.stringify({ id: r.dish.id, recipeId: r.dish.recipeId, name: r.dish.name, rarity: r.dish.rarity, value: r.dish.value, recycleSilver: dishSystemRecycleSilver(r.dish), image: r.dish.image, odd: r.odd, discovered: r.discovered, qixi: r.qixi });
                }
                else
                    flash = r.error;
            }
            else if (act === "use") {
                const r = kitchenUse(f, String(form.dishId), String(form.target), now);
                if (r.ok && r.target === "self") {
                    r.debuff.fedBy = f.humanName || "你的伴侣";
                    r.debuff.dishName = r.dish.name;
                }
                flash = r.ok
                    ? r.target === "self"
                        ? `🥴 吃下微妙的料理：${r.debuff.name}，持续 2 小时；只影响 AI 工具，人类操作不受影响`
                        : `🍽️ ${r.target === "cat" ? "小猫" : "小狗"}吃下「${r.dish.name}」，${Math.round(r.buff.bonus * 100)}% 加成已替换旧效果`
                    : r.error;
            }
            else if (act === "sell-fish") {
                let itemIds;
                try {
                    itemIds = JSON.parse(String(form.itemIds ?? "[]"));
                }
                catch { /* 批量引擎给出数量提示 */ }
                const r = sellFishingCatchIds(f, itemIds, form.qty ?? 1);
                flash = r.ok ? `♻️ 卖出「${r.name}」×${r.qty}，+${r.silver} 银` : r.error;
            }
            else if (act === "sell-treasure") {
                const r = sellFishingTreasure(f, form.itemId, form.qty ?? 1);
                flash = r.ok ? `♻️ 卖出「${r.name}」×${r.qty}，+${r.silver} 银` : r.error;
            }
            else {
                let r;
                if (form.itemIds !== undefined) {
                    let itemIds;
                    try {
                        itemIds = JSON.parse(String(form.itemIds ?? "[]"));
                    }
                    catch { /* 批量引擎给出数量提示 */ }
                    if (!Array.isArray(itemIds) || itemIds.length === 0)
                        itemIds = [String(form.itemId ?? "")];
                    r = kitchenSellMany(f, itemIds, form.qty ?? 1, String(form.to), form.price, now);
                }
                else {
                    r = kitchenSellSelected(f, String(form.itemId ?? ""), form.qty ?? 1, String(form.to), form.price, now);
                }
                flash = r.ok
                    ? r.to === "system" ? `♻️ 系统回收「${r.name}」×${r.qty}，+${r.value} 牧场金币${r.silver ? ` + ${r.silver} 银` : ""}` : `🧺 「${r.name}」×${r.qty} 已按 🪙${r.price}/份摆上摊位`
                    : r.error;
            }
            checkTitles(f);
            save();
            const suffix = result ? `&result=${encodeURIComponent(result)}` : "";
            res.writeHead(303, { ...AGENT_HEADERS, Location: `${BASE}/ui/${key}/cooking?flash=${encodeURIComponent(flash)}${suffix}` });
            return res.end();
        }
        res.writeHead(200, AGENT_HEADERS);
        return res.end(renderHuman(uiCooking(f, now, key, url.searchParams.get("flash") ?? undefined, url.searchParams.get("result") ?? undefined, careerBenefitsForFarm?.(f))));
    }
    // 🐮 牧场：人类主要经营页。POST 收获/回传 → 做完 303 跳回（PRG，刷新不会重复提交）。
    if (section === "glimmer") {
        res.writeHead(200, AGENT_HEADERS);
        return res.end(renderHuman(uiGlimmer(f, getGlimmerWorld(), now, key)));
    }
    if (section === "qixi") {
        if (!isQixiLantern2026Active(now)) {
            res.writeHead(404, AGENT_HEADERS);
            return res.end(uiInvalid());
        }
        const world = getQixiLantern2026World();
        const reconciled = reconcileQixiLantern2026Farm(f, world, now);
        if (method === "POST") {
            const form = await readFormBody(req);
            const act = parts[3];
            let changed = false;
            let showLetter = false;
            let selectedObjectId;
            let flash = "这次没有执行。";
            if (act === "compatibility") {
                selectedObjectId = "copper-bell";
                const result = recordQixiLantern2026Answers(f, world, "human", [form.answer1, form.answer2, form.answer3], now);
                changed = result.applied === true;
                flash = result.ok
                    ? result.complete ? result.result.reaction : "三块木牌已经交给翘翘。小机一侧答完后，她会一起翻开。"
                    : result.code === "stage_locked" ? "这次没有执行。" : result.code === "object_not_found" ? "先从河里找到旧铜铃，翘翘才会拿出这三块木牌。" : "三道题都要选择 A、B 或 C。";
            }
            else if (act === "dish") {
                selectedObjectId = "qiaoguo-mold";
                const dish = findPublicDish(f, "蜂蜜茶", form.dishId);
                const result = submitQixiLantern2026Dish(f, world, dish, now);
                if (result.ok && result.applied) {
                    takePublicDish(f, dish);
                    changed = true;
                }
                flash = result.ok ? result.text : result.code === "stage_locked" ? "这次没有执行。" : result.code === "object_not_found" ? "先在收获时找到断角木模。" : "料理柜里没有蜂蜜茶，这次没有消耗料理。";
            }
            else if (act === "quiz") {
                selectedObjectId = "mailbag-buckle";
                const result = answerQixiLantern2026Quiz(f, world, form.answer, now);
                changed = result.applied === true;
                flash = result.ok ? result.text : result.code === "stage_locked" ? "这次没有执行。" : result.code === "object_not_found" ? "先照顾牧场伙伴，从芦苇里找到黄铜搭扣。" : "请选择 A、B 或 C。";
            }
            else if (act === "return") {
                selectedObjectId = String(form.item ?? "");
                const result = returnQixiLantern2026Object(f, world, form.item, form.owner, now);
                changed = result.applied === true;
                if (result.correct === true && result.allReturned === true)
                    selectedObjectId = undefined;
                flash = !result.ok
                    ? result.code === "stage_locked" ? "这次没有执行。" : result.code === "clues_incomplete" ? "这件旧物的必要线索还没有齐。" : "这件旧物或主人不在失物架上。"
                    : result.correct === false ? "物件特征和这位主人对不上，旧物还在失物架上。" : `${result.text}\n获得灯材「${result.material.name}」。`;
            }
            else if (act === "decorate") {
                const result = saveQixiLantern2026Draft(f, "human", {
                    shape: form.shape,
                    color: form.color,
                    pattern: form.pattern,
                    ornament: form.ornament,
                    seal: form.seal,
                }, now);
                changed = result.applied === true;
                flash = result.ok ? result.applied ? "装扮已经收好，灯河开放前还可以继续换。" : "这套装扮已经保存。" : "灯型、颜色或装饰不在当前可选范围内。";
            }
            else if (act === "release") {
                const result = releaseQixiLantern2026(f, world, "human", {
                    text: form.text,
                    appearance: { shape: form.shape, color: form.color, pattern: form.pattern, ornament: form.ornament, seal: form.seal },
                }, now);
                changed = result.applied === true;
                flash = result.ok
                    ? result.applied ? `灯已经放进河里，正在漂向小机。${result.reward?.applied ? " 同时获得 1314 金币、520 银币、限定称号「灯河有信」和限定成就「终会抵达」。" : ""}` : "你的灯已经放出，不能覆盖原来的灯笺。"
                    : result.code === "final_stage_locked" ? "灯河还没有开放；今晚 20:00 开放放灯和捞灯。" : result.code === "empty_lamp_text" ? "灯笺正文不能为空。" : "灯的纸、挂饰或封口不在当前已取得的选择里。";
            }
            else if (act === "reward-seen") {
                const result = acknowledgeQixiLantern2026Reward(f, now);
                changed = result.applied === true;
                if (reconciled || changed)
                    save();
                res.writeHead(result.ok ? 204 : 409, AGENT_HEADERS);
                return res.end();
            }
            else if (act === "catch") {
                const result = catchQixiLantern2026(f, world, "human", now, false);
                changed = result.applied === true || (!result.delivered && !result.waiting);
                showLetter = Boolean(result.npcLamp || (result.delivered && result.lamp));
                const aiName = String(f.aiName ?? "").trim() || "小机";
                flash = !result.ok ? "灯河还没有开放。" : result.waiting ? "小机的灯还没有放出，可以晚一点再来河边。" : !result.delivered ? result.npcLamp ? `这一回捞到的是${result.npcLamp.authorName}的路过灯。属于你的那盏还在水路上。` : "这一回捞到的是一盏路过的灯。属于你的那盏还在水路上。" : result.applied ? `你捞到了${aiName}的灯。` : `你已经收好${aiName}的灯。`;
            }
            if (reconciled || changed)
                save();
            res.writeHead(303, { ...AGENT_HEADERS, Location: `${BASE}/ui/${key}/qixi?flash=${encodeURIComponent(flash)}${selectedObjectId ? `&item=${encodeURIComponent(selectedObjectId)}` : ""}${showLetter ? "&letter=latest" : ""}` });
            return res.end();
        }
        if (reconciled)
            save();
        res.writeHead(200, AGENT_HEADERS);
        return res.end(renderHuman(uiQixiLantern(f, world, now, key, url.searchParams.get("flash") ?? undefined, url.searchParams.get("letter") === "latest", url.searchParams.get("item") ?? undefined)));
    }
    if (section === "ranch") {
        const act = parts[3];
        if (method === "POST" && (act === "collect" || act === "sell-product" || act === "feed" || act === "remit" || act === "dress" || act === "decorate" || act === "wear" || act === "takeoff" || act === "place" || act === "unplace" || act === "upgrade" || act === "name-animal" || act === "name-pet" || act === "name-goose" || act === "pin" || act === "variant" || act === "dispatch-raid" || act === "catch-raid")) {
            const form = await readFormBody(req);
            let flash;
            const ai = f.aiName || f.name || "对方";
            if (act === "dispatch-raid") {
                const number = Number(form.to);
                const target = Number.isSafeInteger(number) && number > 0 ? farmByNumber(number) : undefined;
                if (!target || target.id === f.id)
                    flash = "找不到这个农场编号。";
                else {
                    const r = dispatchRanchRaid(f, target, Number(form.animal), Number(form.hours), now);
                    flash = r.ok
                        ? `🥷 ${r.animal}已去 ${number} 号「${farmLabel(target)}」潜伏，${Math.round((r.raid.endsAt - r.raid.startedAt) / 3600000)} 小时后回来；冻结 ${r.raid.reservedCoins} 金保证金`
                        : r.error;
                }
            }
            else if (act === "catch-raid") {
                const r = catchRanchRaid(f, playerFarms(), String(form.raid ?? ""), now);
                flash = r.ok ? `🚨 抓住了${r.owner}家的${r.animal}，收到 ${r.compensation} 金赔偿` : r.error;
            }
            else if (act === "upgrade") {
                const r = ranchUpgradeAnimal(f, Number(form.animal));
                flash = r.ok ? `⬆ ${r.name}升到 Lv.${r.level}（-${r.cost}金）——每份产出更值钱了` : r.error;
            }
            else if (act === "collect") {
                const r = ranchCollect(f, playerFarms(), now);
                flash = r.ok
                    ? `📦 收获：${Object.entries(r.detail).map(([k, v]) => `${v} 份${k}`).join("、")}；${r.storedCount ? `${r.storedCount} 份已锁定当前价值并放进料理台食材柜` : ""}${r.nonCookableCount ? `${r.storedCount ? "；" : ""}${Object.entries(r.nonCookableDetail).map(([k, v]) => `${v} 份${k}`).join("、")}不能下锅，已自动回收 +${r.nonCookableGain} 牧场金币` : ""}${r.autoRecycled.length ? `${r.storedCount || r.nonCookableCount ? "；" : ""}${r.autoRecycled.length} 份因欠款自动整份回收` : ""}${r.debtPaid ? `，偿还欠款 ${r.debtPaid} 金` : ""}${r.gain ? `，回收余款 +${r.gain} 牧场金币` : ""}${r.potion ? `；还掉了 ${r.potion} 瓶加速药水进${ai}的仓库 🧪` : ""}`
                    : r.error;
            }
            else if (act === "sell-product") {
                let itemIds;
                try {
                    itemIds = JSON.parse(String(form.itemIds ?? "[]"));
                }
                catch { /* 批量引擎给出数量提示 */ }
                const r = kitchenSellMany(f, itemIds, form.qty ?? 1, "system", undefined, now);
                flash = r.ok ? `♻️ 系统回收「${r.name}」×${r.qty}，+${r.value} 牧场金币` : r.error;
                if (r.ok)
                    checkTitles(f);
            }
            else if (act === "feed") {
                const r = ranchFeedAnimal(f, Number(form.animal), now);
                flash = r.ok ? `🥣 给${r.animal}投喂成功（-🪙${r.cost}），下一份正常产物 +10%；今天还可投喂 ${r.left} 次` : r.error;
            }
            else if (act === "remit") {
                const r = ranchRemit(f, Number(form.amount), now);
                flash = r.ok ? `↗ 已回传 ${r.amount} 金给${ai}（牧场还剩 ${r.left}）` : r.error;
            }
            else if (act === "dress") {
                const r = ranchBuyAccessory(f, String(form.acc ?? ""), now);
                flash = r.ok ? `🛍️ 买下了${r.name}（-${r.cost}金），已放进🧰仓库——去仓库给动物/宠物戴上吧` : r.error;
            }
            else if (act === "wear") {
                const [tgt, ix] = String(form.who ?? "").split(":");
                const target = tgt === "goose" ? "goose" : tgt === "pet" ? "pet" : "animal";
                const r = ranchWearAccessory(f, target, Number(ix), String(form.acc ?? ""));
                flash = r.ok ? `👗 给${r.wearer}戴上了${r.name}——${ai}下次打开农场就能看见啦` : r.error;
            }
            else if (act === "takeoff") {
                const target = form.target === "goose" ? "goose" : form.target === "pet" ? "pet" : "animal";
                const r = ranchTakeOffAccessory(f, target, Number(form.idx), String(form.acc ?? ""));
                flash = r.ok ? `🧷 把${r.wearer}的${r.name}脱下，收回🧰仓库了` : r.error;
            }
            else if (act === "place") {
                const r = ranchPlaceDecoration(f, String(form.decor ?? ""));
                flash = r.ok ? `🏡 把「${r.name}」摆进了${ai}的田——别人来串门能看到` : r.error;
            }
            else if (act === "unplace") {
                const r = ranchUnplaceDecoration(f, String(form.decor ?? ""));
                flash = r.ok ? `📦 把「${r.name}」收回🧰仓库了` : r.error;
            }
            else if (act === "name-animal") {
                const r = ranchNameAnimal(f, Number(form.animal), String(form.name ?? ""));
                flash = r.ok ? `🏷️ 把${r.kind}的名字改成了「${r.name}」` : r.error;
            }
            else if (act === "name-pet") {
                const r = ranchNamePet(f, Number(form.pet), String(form.name ?? ""));
                flash = r.ok ? `🏷️ 把${r.kind}的名字改成了「${r.name}」` : r.error;
            }
            else if (act === "name-goose") {
                const r = ranchNamePatrolGoose(f, String(form.name ?? ""));
                flash = r.ok ? `🏷️ 把${r.kind}的名字改成了「${r.name}」` : r.error;
            }
            else if (act === "pin") {
                const r = ranchTogglePin(f, String(form.kind ?? ""));
                flash = r.ok ? (r.pinned ? `📌 已 pin「${r.name}」——它会出现在${ai}农场的氛围里` : `已取消 pin「${r.name}」`) : r.error;
            }
            else if (act === "variant") {
                const r = setGlimmerVariant(f, String(form.type ?? ""), String(form.kind ?? ""), String(form.variant ?? ""));
                flash = r.ok ? `🌈 已换成「${r.name}」外观` : r.error;
            }
            else {
                const r = ranchBuyDecoration(f, String(form.decor ?? ""), now);
                flash = r.ok ? `🛍️ 买下了「${r.name}」（-${r.cost}金），已放进🧰仓库——去仓库摆出来吧` : r.error;
            }
            save();
            res.writeHead(303, { ...AGENT_HEADERS, Location: `${BASE}/ui/${key}/ranch?flash=${encodeURIComponent(flash)}` });
            return res.end();
        }
        res.writeHead(200, AGENT_HEADERS);
        return res.end(renderHuman(uiRanch(f, now, key, url.searchParams.get("flash") ?? undefined)));
    }
    // ✍️ TA 的农场：替 AI 做「要打字」的动作（称呼/设计原创作物/给邻居留言/指定组合熔炼），都作用在 AI 主农场上。
    if (section === "ta") {
        const act = parts[3];
        if (method === "POST" && (act === "names" || act === "welcome" || act === "design" || act === "message" || act === "craft" || act === "social")) {
            const form = await readFormBody(req);
            let flash;
            const ai = f.aiName || f.name || "小克";
            if (act === "names") {
                const farmName = String(form.farmName ?? "").trim();
                const aiName = String(form.aiName ?? "").trim();
                const humanName = String(form.humanName ?? "").trim();
                const names = validateHumanFarmNames({ farmName, aiName, humanName });
                if (!names.ok) {
                    flash = `⚠️ ${names.error}`;
                }
                else {
                    const renamed = dispatch(f, { action: "rename", name: farmName }, now);
                    if (!renamed.ok) {
                        flash = `⚠️ ${renamed.text}`;
                    }
                    else {
                        const updated = applyHumanFarmNames(f, names.value);
                        if (!updated.ok) {
                            flash = `⚠️ ${updated.error}`;
                        }
                        else {
                            save();
                            flash = `✅ 农场名已更新为「${f.name}」；称呼：AI「${f.aiName ?? "未设"}」· 你「${f.humanName ?? "未设"}」`;
                        }
                    }
                }
            }
            else if (act === "welcome") {
                const text = String(form.text ?? "").trim().slice(0, WELCOME_MAX);
                f.welcome = text || undefined; // 清空 → 恢复默认句
                save();
                flash = text ? `✅ 串门欢迎语已更新：${text}` : `✅ 已清空欢迎语，恢复默认句`;
            }
            else if (act === "design") {
                const r = designCrop(f, { name: form.name, desc: form.desc, plant: form.plant, harvest: form.harvest, latin: form.latin });
                save();
                flash = r.ok
                    ? `🎨 替${ai}设计出原创作物【${r.crop.name}·${r.crop.rarity}】，设计费 -${r.fee} 金，到手 ${r.seeds} 颗种子（可在 TA 的田里种、或上架卖给别的玩家）。`
                    : `⚠️ ${r.error}`;
            }
            else if (act === "craft") {
                const ids = [form.m1, form.m2, form.m3].map((s) => String(s ?? "").trim()).filter(Boolean);
                const r = craft(f, ids, now);
                save();
                flash = r.ok
                    ? `⚗️ 熔炼成功！替${ai}熔出限定种子【${r.cropName}·${r.rarity}】${r.byRecipe ? "（命中隐藏配方！）" : ""}——可在 TA 的田里种下。`
                    : `⚠️ ${r.error}`;
            }
            else if (act === "social") {
                const k = String(form.key ?? "");
                const on = String(form.on ?? "") === "1" || String(form.on ?? "") === "true";
                const updated = applyHumanFarmSocialSetting(f, k, on);
                if (!updated.ok) {
                    flash = `⚠️ ${updated.error}`;
                }
                else {
                    save();
                    flash = on ? `✅ 已开放「${updated.label}」（双向）` : `🚫 已谢绝「${updated.label}」（双向）${k === "visit" ? "——别人搜不到你、你也不能出门，且偷菜/浇水/留言一并封闭" : ""}`;
                }
            }
            else {
                // 留言：以本农场名义复用 Human 邻里权威；旧页面只补齐内部严格字段。
                const target = String(form.target ?? "").trim();
                const out = handleHumanNeighborhoodMessageAction(f, {
                    farm_human_key: f.humanKey,
                    expected_farm_doorplate: f.id,
                    target_farm_doorplate: target,
                    message: String(form.text ?? ""),
                    expected_neighborhood_revision: neighborhoodMessageActionRevision(f, now),
                    idempotency_key: randomUUID(),
                }, now);
                if (out.status === 200) {
                    flash = `💬 已在「${getFarm(target)?.name ?? target}」的留言板留言。`;
                }
                else {
                    flash = `⚠️ ${out.json?.error?.message ?? "留言失败"}`;
                }
            }
            res.writeHead(303, { ...AGENT_HEADERS, Location: `${BASE}/ui/${key}/ta?flash=${encodeURIComponent(flash)}` });
            return res.end();
        }
        // 🔗 「生成链接」：把伴侣填好的内容拼成一条 AI 用的 compose 链接（不直接执行），让 AI 自己点、看到结果。
        if (method === "GET" && typeof act === "string" && act.startsWith("link-")) {
            const action = act.slice(5);
            if (["design", "message", "craft", "visit"].includes(action)) {
                const agentKey = ensureAgentKey(f);
                if (!agentKey)
                    return internalServiceError(res, 409, "legacy_agent_access_revoked", "Legacy agent access has been migrated to Doorbell");
                const q = Object.fromEntries(sp);
                const params = new URLSearchParams();
                params.set("a", action);
                if (action === "craft") {
                    const mats = [q.m1, q.m2, q.m3].map((s) => String(s ?? "").trim()).filter(Boolean);
                    params.set("materials", mats.join(","));
                }
                else if (action === "design") {
                    for (const k of ["name", "desc", "plant", "harvest", "latin"])
                        if (q[k])
                            params.set(k, String(q[k]));
                }
                else if (action === "visit") {
                    if (q.target)
                        params.set("target", String(q.target).trim()); // 串门：只需目标门牌号
                }
                else {
                    for (const k of ["target", "text"])
                        if (q[k])
                            params.set(k, String(q[k]));
                }
                const composeUrl = `${BASE}/agent/${agentKey}/compose?${params.toString()}`;
                res.writeHead(200, AGENT_HEADERS);
                return res.end(htmlGenLink(action, composeUrl, f.aiName || f.name || "对方"));
            }
        }
        res.writeHead(200, AGENT_HEADERS);
        return res.end(renderHuman(uiTa(f, now, key, url.searchParams.get("flash") ?? undefined)));
    }
    // 🧭 铃野共行：独立于个人探险的全服公共副本，只读展示共享剧情、任务、结局与往期故事。
    if (section === "together") {
        const world = getPublicExpeditionWorld();
        advancePublicExpedition(world, playerFarms(), now);
        save();
        res.writeHead(200, AGENT_HEADERS);
        return res.end(renderHuman(uiTogether(f, world, now, key)));
    }
    // 🗺️ 探险页：摇骰（伴侣替 AI 摇，同心+1）/ 出门前祈福。其余推进(explore/choose/retreat)是 AI 自己发，这页只看+摇骰+祈福。
    if (section === "expedition") {
        const act = parts[3];
        if (method === "POST" && (act === "roll" || act === "charm")) {
            const form = await readFormBody(req);
            let flash;
            if (act === "roll") {
                flash = expRoll(f, true, now).text;
                checkTitles(f); // 默契称号：伴侣摇骰赢一场战斗会 +1 默契度
            }
            else {
                const kind = form.kind === "check" || form.kind === "hp" ? form.kind : undefined;
                flash = expSetCharm(f, kind, String(form.blessing ?? ""), now).text;
            }
            save();
            res.writeHead(303, { ...AGENT_HEADERS, Location: `${BASE}/ui/${key}/expedition?flash=${encodeURIComponent(flash)}` });
            return res.end();
        }
        res.writeHead(200, AGENT_HEADERS);
        return res.end(renderHuman(uiExpedition(f, now, key, url.searchParams.get("flash") ?? undefined)));
    }
    // 📖 图鉴册：唯一「能写」的部分=星标收藏。POST star 切换喜欢的作物 → 303 跳回（PRG），带 anchor 回到原栏位。
    if (section === "codex") {
        if (method === "POST" && parts[3] === "star") {
            const form = await readFormBody(req);
            const r = toggleStar(f, String(form.id ?? "").trim());
            if (r.ok)
                save();
            const flash = r.ok ? (r.on ? `⭐ 已收藏「${r.name}」——去「我的收藏」栏看看` : `已取消收藏「${r.name}」`) : "⚠️ 找不到这种作物";
            const anchor = String(form.anchor ?? "").trim();
            res.writeHead(303, { ...AGENT_HEADERS, Location: `${BASE}/ui/${key}/codex?flash=${encodeURIComponent(flash)}${anchor ? `#${encodeURIComponent(anchor)}` : ""}` });
            return res.end();
        }
        res.writeHead(200, AGENT_HEADERS);
        return res.end(renderHuman(uiCodex(f, now, key, url.searchParams.get("flash") ?? undefined)));
    }
    res.writeHead(200, AGENT_HEADERS);
    // 他的田/商店/原创已并进主页，连同乱填的 section 一律回落主页；排行榜仍占位。
    if (section === "messages")
        return res.end(renderHuman(uiMessages(f, now, key)));
    if (section === "leaderboard")
        return res.end(renderHuman(uiLeaderboard(f, now, key)));
    const quiet = settleQixi2026QuietTask(f, now);
    if (quiet)
        save();
    const homeFlash = [url.searchParams.get("flash") ?? "", qixi2026CompletionText(quiet)].filter(Boolean).join("\n");
    return res.end(renderHuman(uiHome(f, now, key, homeFlash || undefined)));
}
