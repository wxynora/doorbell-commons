import { BASE, NPC_ID, POTION_CAP_LINE, POTION_DAILY_CAP } from "../../config.js";
import { cookingIngredientById, getCrop, materialById } from "../../content.js";
import { bumpDaily } from "../../daily.js";
import { canStealNow, ensureHumanKey, isUgcCrop, potionDailyLeft, ranchRoamLine, refreshShop, stealAvailability, stealShieldRemain, takeInbox } from "../../engine.js";
import { describeFarm, statusFooter } from "../../flavor.js";
import { randomTip, viewBag, viewKitchen, viewMarket, viewShop, visitView } from "../../game.js";
import { htmlAgentPage, mintNonce } from "../../agent.js";
import { viewLeaderboard } from "../../leaderboard.js";
import { rollSeasonStatus, seasonHeadline } from "../../season-events.js";
import { getFarm, playerFarms, save } from "../../store.js";
import { tickTask } from "../../tasks.js";
import { allUgc } from "../../ugc.js";
import { allowsSocial, farmByNumber, farmNumber, reachable, ripeBroadcastText, wanderResult } from "../farm/social.js";
import { bagActions, kitchenAgentActions, listInventoryActions, selfActions, shopActions, suggest } from "./offers.js";

export function createLegacyAgentPages({ runFarm, resolveAgent }) {
    if (typeof runFarm !== "function" || typeof resolveAgent !== "function")
        throw new TypeError("createLegacyAgentPages requires runFarm and resolveAgent");

    function links(playKey, offers, now) {
        return offers.map((o) => ({ label: o.label, nonce: mintNonce(playKey, o.action, o.params, now) }));
    }

    function renderSelf(playKey, f, now, banner) {
        refreshShop(f, now);
        tickTask(f, now);
        const seHit = rollSeasonStatus(f, now);
        bumpDaily(f, now, "logins");
        const seLine = seHit ? seasonHeadline(seHit) + "\n═══════════════════\n" : "";
        const inbox = takeInbox(f);
        const box = inbox.length ? `📬 新消息：\n${inbox.join("\n")}\n————————————\n` : "";
        const potionHint = potionDailyLeft(f, now) <= 0 ? `\n🌙 官方药水今日已购满 ${POTION_DAILY_CAP}/${POTION_DAILY_CAP}——${POTION_CAP_LINE}（可买药水套装、帮别人浇水、或等收获随机掉落）` : "";
        const stealState = stealAvailability(f, now);
        const stealHint = stealState.ok ? `\n🥷 今天还能偷 ${stealState.left} 次；每次偷完要歇 1 小时。` : `\n🥷 ${stealState.reason}`;
        const ripeBroadcast = ripeBroadcastText(now);
        const hadKey = !!f.humanKey;
        const hk = ensureHumanKey(f);
        const showOnboard = !f.agentOnboardSeen && !f.humanFrontendSeen;
        if (showOnboard)
            f.agentOnboardSeen = true;
        save();
        const onboard = showOnboard
            ? `🆕 新手任务（请先做这件事，再开始种田）：把下面这条「陪你看农场」的链接发给 ${f.humanName || "伴侣"}\n🏡 ${BASE}/ui/${hk}\n这是 TA 同步查看农场、经营自己牧场的入口——请把这条原样发给 ${f.humanName || "伴侣"}。这条提示只出现一次，请自己记在上下文里。\n═══════════════════\n`
            : "";
        const tip = randomTip(f);
        const vista = describeFarm(f, now);
        const roam = ranchRoamLine(f);
        const human = f.humanName || "伴侣";
        const collabTip = Math.random() < 1 / 3 ? `\n🎨 可以和${human}一起原创作物哦，去问问 TA 的想法吧。` : "";
        const text = `${onboard}${seLine}${box}${statusFooter(f, now)}\n${ripeBroadcast}\n————————————\n${vista}${roam ? "\n" + roam : ""}${potionHint}${stealHint}\n💡 ${suggest(f)}${tip ? "\n" + tip : ""}${collabTip}\n（点链接做操作；看到旧状态或链接失效就点「🔄 刷新」那条·永不失效）`;
        return htmlAgentPage(playKey, agentNaturalText(text), links(playKey, selfActions(f, now), now), banner ? agentNaturalText(banner) : undefined);
    }

    function agentCompose(playKey, q, now) {
        const f = resolveAgent(playKey);
        if (!f)
            return htmlAgentPage(playKey, "这个 Agent 链接无效或已被撤销。", []);
        const ai = f.aiName || f.name || "对方";
        const a = String(q.a ?? "");
        const ALLOW = ["design", "message", "craft", "list", "rename", "set-welcome", "visit"];
        if (!ALLOW.includes(a))
            return renderSelf(playKey, f, now, `compose 暂不支持「${a}」。可用：${ALLOW.join(" / ")}。`);
        const params = { ...q };
        delete params.a;
        const craftMats = a === "craft" ? String(q.materials ?? "").split(",").map((s) => s.trim()).filter(Boolean) : [];
        if (a === "craft")
            params.materials = craftMats;
        if (a === "visit")
            params.target = String(q.target ?? "").trim();
        const visitTarget = a === "visit" ? getFarm(params.target) : undefined;
        const visitTargetLabel = visitTarget
            && reachable(visitTarget)
            ? `${visitTarget.name}（${visitTarget.aiName}）`
            : params.target || "对方";
        const label = a === "design" ? `设计作物「${q.name ?? ""}」（${q.desc ?? ""}）${q.plant ? `\n　播种文案：${q.plant}` : ""}${q.harvest ? `\n　收获文案：${q.harvest}` : ""}` :
            a === "message" ? `给「${q.target ?? "对方"}」留言：「${q.text ?? ""}」` :
                a === "craft" ? `熔炼这 ${craftMats.length} 样素材：${craftMats.map((id) => materialById.get(id)?.name ?? id).join(" + ")}` :
                    a === "list" ? `上架「${getCrop(q.id)?.name ?? q.id}」×${q.qty ?? 1}（统一参考价）` :
                        a === "rename" ? `把农场改名为「${q.text ?? q.name ?? ""}」` :
                            a === "visit" ? `串门看「${visitTargetLabel}」的公开农场` :
                                `设置欢迎语：「${q.text ?? ""}」`;
        const nonce = mintNonce(playKey, a, params, now);
        const text = a === "visit"
            ? `🚪 要串门的门牌号伴侣帮你填好了。点下面「去看看」就走进「${visitTargetLabel}」的公开农场瞧瞧：\n\n　${label}\n\n（只是看看，不改任何东西。不懂流程看 ${BASE}/get）`
            : `🤝 ${ai}想做一件需要"打字"的事，把内容填好交给你了。点下面「确认执行」就替它完成（相当于你俩一起做的～）：\n\n　${label}\n\n（一次性，重复打开也只执行一次。不懂流程看 ${BASE}/get）`;
        return htmlAgentPage(playKey, text, [{ label: a === "visit" ? "▶ 去看看" : "▶ 确认执行", nonce }]);
    }

    function renderWanderPage(playKey, f, now) {
        const w = wanderResult({ by: f.id }, now, true);
        const target = farmByNumber(Number((w.farms ?? [])[0]?.number));
        if (target)
            return renderVisitPage(playKey, target.id, now);
        const offers = [];
        offers.push({ label: "🔙 回我的农场", action: "status", params: {} });
        return htmlAgentPage(playKey, agentNaturalText(w.text), links(playKey, offers, now), "🚶 出门逛逛");
    }

    function renderVisitPage(playKey, targetId, now) {
        const me = resolveAgent(playKey);
        if (me && !reachable(me))
            return htmlAgentPage(playKey, agentNaturalText(`你设了「谢绝来访」（闭门状态），不能出门串门——想出门先让 ${me.humanName || "伴侣"} 帮你打开『访问』开关。`), links(playKey, [{ label: "🔙 回我的农场", action: "status", params: {} }], now), "🚪 闭门中");
        const target = getFarm(targetId);
        const targetRef = farmNumber(targetId);
        const out = runFarm(targetId, "visit", me ? { by: me.id, targetRef } : { targetRef }, undefined, now);
        const offers = [];
        const canSteal = canStealNow(me, now) && allowsSocial(me, "steal");
        const canWater = allowsSocial(me, "water");
        let shieldNote = "";
        if (target) {
            const shielded = stealShieldRemain(target, now) > 0;
            if (shielded && canSteal && allowsSocial(target, "steal"))
                shieldNote = "\n🛡 这家刚被偷过，还在防备（放偷冷却中），暂时偷不了。";
            for (const p of target.plots)
                if (canSteal && allowsSocial(target, "steal") && !shielded && p.crop?.ripe && !isUgcCrop(p.crop))
                    offers.push({ label: `🥷 偷 ${p.id} 号地`, action: "steal", params: { target: targetId, plotId: p.id } });
            if (canWater && allowsSocial(target, "water") && target.plots.some((p) => p.crop && !p.crop.ripe))
                offers.push({ label: "💧 帮 TA 浇水（给最快熟的那块加速 30 分钟，可能掉 1 瓶加速药水）", action: "water", params: { target: targetId } });
            if (target.shop?.potionSet)
                offers.push({ label: `🎁 买 TA 店的药水套装（${target.shop.potionSet.qty} 瓶 ${target.shop.potionSet.price} 金，限购 1）`, action: "buy-potion-set", params: { target: targetId } });
            if (target.id === NPC_ID && target.shop?.npcSeed) {
                const s = target.shop.npcSeed;
                offers.push({ label: `🛒 买限定种子「${getCrop(s.id)?.name ?? s.id}」×1（💰${s.price}金，每天限 1）`, action: "buy", params: { target: targetId, kind: "seed", id: s.id, qty: 1 } });
            }
            for (const m of (target.market ?? []).slice(0, 4)) {
                const nm = m.kind === "material" ? (materialById.get(m.id)?.name ?? m.id) : m.kind === "ingredient" ? (cookingIngredientById.get(m.id)?.name ?? m.id) : m.kind === "dish" ? (m.dish?.name ?? "料理") : (getCrop(m.id)?.name ?? m.id);
                offers.push({ label: `🛒 买「${nm}」×1（🪙${m.price}银）`, action: "buy", params: { target: targetId, kind: m.kind, id: m.id, qty: 1 } });
            }
        }
        offers.push({ label: "🚶 再逛逛别家", action: "wander", params: {} });
        offers.push({ label: "🔙 回我的农场", action: "status", params: {} });
        const human = me?.humanName || "伴侣";
        const visitTip = `\n💬 可以和${human}一起给邻居留言哦，去问问 TA 的想法吧。`;
        return htmlAgentPage(playKey, agentNaturalText(out.json.text) + shieldNote + visitTip, links(playKey, offers, now), "👀 串门");
    }

    function renderMyPublicPage(playKey, f, now, banner) {
        const offers = [];
        const msgs = f.messages ?? [];
        if (msgs.length) {
            offers.push({ label: `🧹 清空留言板（共 ${msgs.length} 条）`, action: "delete-message", params: { all: true } });
            for (const m of msgs.slice(-6))
                offers.push({ label: `🗑 删留言：${m.name}「${m.text.slice(0, 12)}」`, action: "delete-message", params: { messageId: m.id } });
        }
        offers.push({ label: f.guestbook === false ? "💬 开启留言板" : "🔕 关闭留言板（停止接收新留言）", action: "guestbook", params: { on: f.guestbook === false } });
        offers.push({ label: "🔙 回我的农场", action: "status", params: {} });
        return htmlAgentPage(playKey, agentNaturalText(visitView(f, now, f)), links(playKey, offers, now), banner ? agentNaturalText(banner) : "🏡 我的公开农场 / 留言板（别人串门看到的就是这页）");
    }

    function renderShopPage(playKey, f, now, banner) {
        refreshShop(f, now);
        return htmlAgentPage(playKey, agentNaturalText(viewShop(f, now)), links(playKey, shopActions(f, now), now), banner ? agentNaturalText(banner) : "🏪 商店");
    }

    function renderBagPage(playKey, f, now, banner) {
        const matCount = Object.values(f.materials).reduce((a, b) => a + b, 0);
        const note = matCount >= 3 ? "" : "\n\n素材不足 3 个；集齐后这里会自动出现「熔炼」链接。";
        return htmlAgentPage(playKey, agentNaturalText(viewBag(f)) + note, links(playKey, bagActions(f), now), banner ? agentNaturalText(banner) : "🎒 背包 / 素材");
    }

    function renderKitchenPage(playKey, f, now, banner) {
        return htmlAgentPage(playKey, agentNaturalText(viewKitchen(f, now)), links(playKey, kitchenAgentActions(f, now), now), banner ? agentNaturalText(banner) : "🍳 料理台");
    }

    function renderMarketPage(playKey, f, now, banner) {
        const offers = [];
        for (const m of (f.market ?? []).slice(0, 8)) {
            const nm = m.kind === "material" ? (materialById.get(m.id)?.name ?? m.id) : m.kind === "ingredient" ? (cookingIngredientById.get(m.id)?.name ?? m.id) : m.kind === "dish" ? (m.dish?.name ?? "料理") : (getCrop(m.id)?.name ?? m.id);
            offers.push({ label: `📦 下架「${nm}」`, action: "unlist", params: { kind: m.kind, id: m.id } });
        }
        offers.push(...listInventoryActions(f));
        offers.push({ label: "🔙 回我的农场", action: "status", params: {} });
        const note = (Object.values(f.seeds).some((n) => n > 0) || Object.values(f.materials).some((n) => n > 0)) ? "" : "\n\n暂无可出售物品；获得素材或限定种子后，这里会自动出现「上架」链接。";
        return htmlAgentPage(playKey, agentNaturalText(viewMarket(f, true)) + note, links(playKey, offers, now), banner ? agentNaturalText(banner) : "🧺 我的摊位");
    }

    function renderLeaderboardPage(playKey, now, banner) {
        const offers = [{ label: "🔙 回我的农场", action: "status", params: {} }];
        return htmlAgentPage(playKey, agentNaturalText(viewLeaderboard(playerFarms(), allUgc(), now)), links(playKey, offers, now), banner ? agentNaturalText(banner) : "🏆 全服排行榜");
    }

    function renderAgentTarget(playKey, f, now, target) {
        if (!target || target.kind === "self")
            return renderSelf(playKey, f, now, target?.banner);
        if (target.kind === "shop")
            return renderShopPage(playKey, f, now, target.banner);
        if (target.kind === "bag")
            return renderBagPage(playKey, f, now, target.banner);
        if (target.kind === "market")
            return renderMarketPage(playKey, f, now, target.banner);
        if (target.kind === "kitchen")
            return renderKitchenPage(playKey, f, now, target.banner);
        if (target.kind === "leaderboard")
            return renderLeaderboardPage(playKey, now, target.banner);
        if (target.kind === "mypage")
            return renderMyPublicPage(playKey, f, now, target.banner);
        if (target.kind === "wander")
            return renderWanderPage(playKey, f, now);
        return renderVisitPage(playKey, target.targetId, now);
    }

    return {
        agentCompose,
        agentNaturalText,
        links,
        renderAgentTarget,
        renderBagPage,
        renderKitchenPage,
        renderLeaderboardPage,
        renderMarketPage,
        renderMyPublicPage,
        renderSelf,
        renderShopPage,
        renderVisitPage,
        renderWanderPage,
        stripFooter,
    };
}

export const stripFooter = (t) => t.replace(/\n?🌾【[\s\S]*$/, "");

export function agentNaturalText(t) {
    return t
        .replace(/[　 \t]*→ ?[a-z][a-z0-9-]*[^\n]*/g, "")
        .replace(/\{&quot;[^}]+}/g, "")
        .replace(/\{"[^}]*}/g, "")
        .replace(/\n?[ \t　]*例（填 bag 里的中文[^\n]*/g, "")
        .replace(/熔炼台：craft 投 /g, "熔炼台：投 ")
        .replace(/。用 list 上架素材\/种子（别人串门可买）。/g, "。")
        .replace(/\n?[ \t　]*上架卖：[^\n]*/g, "")
        .replace(/POST \/farms\/[^\s）)。\n]+(?:\s+\{[^}]+})?/g, "")
        .replace(/GET \/c\?a=[^\s　。\n]+/g, "")
        .replace(/（接口：\s*）/g, "")
        .replace(/接口：\s*/g, "")
        .replace(/买：\s*(?=（|$)/g, "")
        .replace(/偷：\s*(?=　|。|$)/g, "")
        .replace(/留言：\s*(?=）|$)/g, "")
        .replace(/（完整两层商店：\s*）/g, "")
        .replace(/[（(][ \t　]*[）)]/g, "")
        .replace(/\n串门看详情：[^\n]*/g, "")
        .replace(/[ \t　]+(?=\n)/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
