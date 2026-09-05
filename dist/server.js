// 开放 HTTP 接口（node:http，零依赖）。业务逻辑复用 game.ts，保证与 CLI 同一套规则。
import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { advance, steal, visitorWater, tryWaterReward, buyPotionSet, ensureHumanKey, pushSocialInbox, pushLog, craft, cookingDebuffReason, cookingDebuffStatusText, bribeGuardDog } from "./engine.js";
import { dispatch, farmView, viewShop, viewEncyclopedia, shopBrief, viewMarket, buyFromMarket, visitView, tendNpc, buyNpcSeed, hasDamagedPublicName, viewKitchen } from "./game.js";
import { harvestText, stealThiefText, statusFooter, waterText } from "./flavor.js";
import { createFarm, getFarm, allFarms, playerFarms, replaceFarm, replaceFarmAndMysteryMerchantAtomic, save, getGlimmerWorld, getMysteryMerchantWorld, getPublicExpeditionWorld, getQixiLantern2026World, restoreWorldSnapshotInMemory, setWorldCommitCoordinator, setWorldPersistenceAdapter, settleLoadedWorld, snapshotWorldForRollback, withWorldCommitContext, advanceStoredMysteryMerchantWorld } from "./store.js";
import { MAX_FARMS, MESSAGE_TEXT_MAX, MESSAGES_MAX, NPC_ID, GROW_TICKS, BASE, REGISTRATION_OPEN, REGISTRATION_CLOSED_TEXT, REGISTRATION_CAP, REGISTRATION_FULL_TEXT, SHOW_MIGRATION_NOTICE, MIGRATION_NOTICE_TEXT, MIGRATION_NOTICE_HTML } from "./config.js";
import { allowRequest, allowCreate, sweepGuard } from "./guard.js";
import { sweepNonces, htmlReadme, htmlGuide } from "./agent.js";
import { viewLeaderboard } from "./leaderboard.js";
import { onTaskEvent } from "./tasks.js";
import { bumpDaily, recordSuccessfulWatering } from "./daily.js";
import { checkTitles } from "./titles.js";
import { allUgc } from "./ugc.js";
import { qixiLantern2026 } from "./content.js";
import { PublicSyncError } from "./public-sync.js";
import { runFishing } from "./fishing.js";
import { runGlimmer } from "./glimmer.js";
import { advancePublicExpedition, checkPublicContribution, currentPublicTask, findPublicDish, findPublicHarvestPlot, findPublicWaterTarget, markPublicTrialPlot, publicExpeditionStatusLine, publicExpeditionText, recordPublicContribution, recordPublicPlantEncounter, runPublicChoice, takePublicAiNotices, takePublicDish } from "./public-expedition.js";
import { qixi2026CompletionText, recordQixi2026Progress, recordQixi2026StealAttempt } from "./qixi-2026.js";
import { isQixiLantern2026Active, qixiLantern2026StatusText, reconcileQixiLantern2026Farm, recordQixiLantern2026FarmAction, runQixiLantern2026Ai, submitQixiLantern2026Dish } from "./qixi-lantern-2026.js";
import { AGENT_HEADERS, RequestBodyError, clientIp, jsonOut, readBody, smartParams, textOut } from "./server/http.js";
import { createAssetHandler } from "./server/assets.js";
import { createDoorbellInternalHandler, internalServiceError, legacyAgentAccessRevoked } from "./server/doorbell-internal.js";
import { handleSyncRoute } from "./server/sync.js";
import { createLegacyMcpHandler } from "./server/legacy-mcp.js";
import { handleLegacyHumanRoute } from "./server/legacy-human/router.js";
import { MCP_HELP, SHARED_HELP, SOCIAL_HELP } from "./server/farm/help.js";
import { allowsSocial, farmByNumber, farmLabel, reachable, resolveNumberedTarget, ripeBroadcastText, stolenTodayText, visitListResult, wanderResult } from "./server/farm/social.js";
import { createLegacyAgentHandler } from "./server/legacy-agent/runtime.js";
import { createLingyeFarmBalanceCoordinator, createLingyeWorldBackend, openLingyeWorldDatabase, runLingyeWorldTransaction } from "./lingye-world-database.js";
import { createLingyeActionExecutor } from "./server/doorbell/lingye.js";
import { resolveChefOriginalCookingReceipt } from "./domain/kitchen/original.js";
import { farmCareerBenefits, farmDoorbellKitchenCareerBenefits, farmResidentId } from "./career/farm-benefits.js";
import { constableExamTheftEligibility, farmActionTouchesLockedCareerObject, lockedCareerObjectText, startRegisteredP3Scheduler } from "./career/p3-commission-runtime.js";
import { startConstableInterviewScheduler } from "./career/constable-interview-scheduler.js";
import { startRanchRaidScheduler } from "./server/ranch-raid-scheduler.js";
import { loadConstableInterviewBank } from "./career/constable-interview-bank.js";
import { applyDroughtWatering, collectFloodFishForFarm, commitNatureFarmReconciliation, commitNatureRemovedPlot, startNatureRuntimeScheduler } from "./nature-runtime.js";
import { setDailySpendEconomyDatabase } from "./daily-spend.js";
import { activeMysteryMerchantEvent, buyMysteryMerchantOffers, projectMysteryMerchant } from "./mystery-merchant.js";
import { discoverAndBroadcastMysteryMerchant } from "./server/market-action.js";
import { detentionAllowsFarmAction, detentionBlockedFarmActionText } from "./security/presentation.js";
let activeLingyeWorldDatabase = null;
let activeLingyeWorldBackend = null;
let activeMysteryMerchantRuntime = null;
function executeDoorbellFarmActionCore(farm, action, params, detail, now) {
    const detention = activeDetentionForFarm(farm, now);
    if (detention && !detentionAllowsFarmAction(action))
        return { status: 400, json: { ok: false, code: "RESIDENT_DETAINED", text: detentionBlockedFarmActionText(detention) } };
    const careerBenefits = farmDoorbellKitchenCareerBenefits(
        activeLingyeWorldDatabase,
        activeLingyeWorldBackend,
        farm,
    );
    const body = { ...params };
    if (action === "wander") {
        const result = wanderResult({ ...body, by: farm.id }, now, true);
        return { status: result.ok === false ? 400 : 200, json: { ...result, ...(detail ? { farm: farmView(farm, now) } : {}) } };
    }
    if (action === "visit" && (body.to === undefined || String(body.to).trim() === "")) {
        const result = visitListResult(farm);
        return { status: result.ok === false ? 400 : 200, json: { ...result, ...(detail ? { farm: farmView(farm, now) } : {}) } };
    }
    if ((action === "block" || action === "unblock") && body.to !== undefined && String(body.to).trim() !== "") {
        const resolved = resolveNumberedTarget(body.to, farm);
        if (resolved?.error)
            return { status: 400, json: { ok: false, text: resolved.error } };
        const { to: _to, ...ownParams } = body;
        return runFarm(farm.id, action, { ...ownParams, id: resolved.farm.id, token: farm.token }, undefined, now, { detail, careerBenefits });
    }
    if (action === "buy" && body.source === "npc") {
        return runFarm(NPC_ID, action, { ...body, by: farm.id, token: farm.token }, farm.id, now, { detail, careerBenefits });
    }
    const mysteryMerchantBuy = action === "buy" && body.source === "mystery-merchant";
    const social = action === "kitchen"
        ? body.op === "use" && body.target === "guard-dog" && body.to !== undefined && String(body.to) !== ""
        : body.to !== undefined && String(body.to) !== "";
    const resolved = social ? resolveNumberedTarget(body.to, farm) : undefined;
    if (resolved?.error)
        return { status: 400, json: { ok: false, text: resolved.error } };
    const target = resolved?.farm?.id ?? farm.id;
    fillRunDefaults(action, body);
    const injected = social
        ? { ...body, by: farm.id, token: farm.token, targetRef: String(resolved.number) }
        : { ...body, ...(mysteryMerchantBuy ? { by: farm.id } : {}), token: farm.token };
    return runFarm(target, action, injected, social ? farm.id : body.id, now, { detail, careerBenefits });
}
function executeDoorbellFarmAction(farm, action, params, detail, now) {
    const rollback = snapshotWorldForRollback();
    try {
        return withWorldCommitContext({ balanceAuthority: "farm", actor: "agent" }, () =>
            executeDoorbellFarmActionCore(farm, action, params, detail, now));
    }
    catch (error) {
        restoreWorldSnapshotInMemory(rollback);
        throw error;
    }
}
function executeLegacyMcpAction(me, action, params, now) {
    const detention = activeDetentionForFarm(me, now);
    if (detention && !detentionAllowsFarmAction(action))
        return { ok: false, text: detentionBlockedFarmActionText(detention), code: "RESIDENT_DETAINED" };
    const b = { ...params };
    if (action === "help")
        return { ok: true, text: MCP_HELP };
    if (action === "wander") {
        const w = wanderResult({ ...b, by: me.id }, now, true);
        return { ok: w.ok !== false, text: String(w.text ?? "") };
    } // 随机串门走路由层撮合，不在 runFarm 里
    if (action === "visit" && (b.to === undefined || String(b.to).trim() === "")) {
        const listed = visitListResult(me);
        return { ok: listed.ok !== false, text: String(listed.text ?? "") };
    }
    const social = action === "kitchen"
        ? b.op === "use" && b.target === "guard-dog" && b.to !== undefined && String(b.to) !== ""
        : b.to !== undefined && String(b.to) !== ""; // kitchen 的 to 还可表示 system/market，只有贿赂才是跨农场
    const resolved = social ? resolveNumberedTarget(b.to, me) : undefined;
    if (resolved?.error)
        return { ok: false, text: resolved.error };
    const target = resolved?.farm?.id ?? me.id;
    if (typeof b.limited === "string")
        b.limited = b.limited.split(",");
    if (typeof b.materials === "string")
        b.materials = b.materials.split(",");
    fillRunDefaults(action, b);
    const body = social ? { ...b, by: me.id, token: me.token, targetRef: String(resolved.number) } : { ...b, token: me.token };
    const out = runFarmWithRollback(target, action, body, social ? me.id : b.id, now);
    const text = String(out.json.text ?? "");
    return { ok: out.json.ok !== false, text: out.json.farm ? `${text}\n\n${JSON.stringify({ farm: out.json.farm })}` : text };
}
function fresh(id) {
    const f = getFarm(id);
    if (!f)
        return null;
    const now = Date.now();
    advance(f, now);
    if (f.id === NPC_ID)
        tendNpc(f, now); // 阿土：每次访问前补满地 + 刷摊位/商店
    return f;
}
function caughtCropTheftFact(database, input) {
    const prefix = "p3:security:trail:";
    const eventId = typeof input?.sourceId === "string" && input.sourceId.startsWith(prefix)
        ? input.sourceId.slice(prefix.length)
        : "";
    if (!eventId)
        return null;
    const matches = allFarms().flatMap((farm) => (farm.trail ?? [])
        .filter((entry) => entry?.eventId === eventId)
        .map((entry) => ({ entry })));
    if (matches.length !== 1)
        return null;
    const { entry } = matches[0];
    const actorFarm = typeof entry.actorFarmId === "string" ? getFarm(entry.actorFarmId) : null;
    const residentId = actorFarm ? farmResidentId(database, actorFarm) : null;
    if (!residentId)
        return null;
    return {
        sourceId: input.sourceId,
        kind: entry.kind,
        successful: entry.kind === "stolen",
        residentId,
        occurredAt: entry.t,
    };
}
function activeDetentionForFarm(farm, now) {
    if (!activeLingyeWorldDatabase || !activeLingyeWorldBackend)
        return null;
    const residentId = farmResidentId(activeLingyeWorldDatabase, farm);
    if (!residentId)
        return null;
    return activeLingyeWorldBackend.trustedQueries.isResidentDetained(residentId, { at: now })
        ? activeLingyeWorldBackend.trustedQueries.getResidentDetention(residentId, { at: now })
        : null;
}
function catchNpcCropTheft(victim, actorFarmId, now) {
    if (!activeLingyeWorldBackend ||
        activeLingyeWorldBackend.trustedQueries.getSecurityPatrolStatus({ at: now }).status !== "patrolling")
        return null;
    const trail = (victim.trail ?? []).find((entry) => entry?.kind === "stolen" &&
        entry.actorFarmId === actorFarmId && entry.t === now && typeof entry.eventId === "string");
    if (!trail)
        return null;
    return activeLingyeWorldBackend.trustedSystemCommands.catchCropTheft({
        sourceId: `p3:security:trail:${trail.eventId}`,
        caughtBy: "npc_patrol",
        caughtAt: now,
    });
}
const reply = (res, ok, t, f) => jsonOut(res, ok ? 200 : 400, f ? { ok, text: t, farm: farmView(f, Date.now()) } : { ok, text: t });
const DAMAGED_PUBLIC_NAME_TEXT = "名称看起来已经发生编码损坏（只剩问号或包含 �），请用 UTF-8 重新发送原名称。";
const hasDamagedRegistrationName = (...values) => values.some(hasDamagedPublicName);
// 农场专属链接的 key（= agentKey）：8 位 base62 随机串，够猜不到（~47bit）、又短。生成时查重，撞了重摇。
// 它是「藏进链接里的 token」，是操作农场的凭证 → 必须保密、不可用公开门牌号代替。
const B62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function newAgentKey() {
    for (let tries = 0; tries < 50; tries++) {
        const buf = randomBytes(8);
        let k = "";
        for (let i = 0; i < 8; i++)
            k += B62[buf[i] % 62];
        if (!allFarms().some((x) => x.agentKey === k))
            return k;
    }
    return randomUUID().replace(/-/g, "").slice(0, 12); // 极端撞运兜底（基本走不到）
}
// 只读视图动作（允许 GET）；其余动作改动状态，必须 POST——防止链接预取/抓取/unfurl 误触发
// （尤其 new-token 会轮换主 token，GET 预取一次就把农场钥匙刷掉）。/a 和 /farms 两条通道共用。
const READONLY_ACTIONS = new Set(["status", "shop", "bag", "market", "encyclopedia", "ledger", "leaderboard", "ranking", "wander", "visit", "expedition", "exp", "together", "help", "kitchen", "glimmer"]);
const mutatingViaGet = (method, action) => method !== "POST" && !!action && !READONLY_ACTIONS.has(action);
// 农场专属链接的 key（= agentKey，和 /agent 点击页同一把）。缺了就懒生成，让每座农场都能用 /a/<key> 通道。
function ensureAgentKey(f) {
    if (legacyAgentAccessRevoked(f))
        return undefined;
    if (!f.agentKey) {
        f.agentKey = newAgentKey();
        save();
    }
    return f.agentKey;
}
// run 的「全套默认」：只写要种什么，浇水/收成默认就做（催熟要花钱，保持手动 opt-in）。只在 HTTP 入口补，
// 不动 doRun 本身（点击页按钮还靠 doRun 的细粒度行为）。显式传 false/auto 仍按各自意思来。
function fillRunDefaults(action, b) {
    if (action !== "run")
        return;
    if (b.water === undefined)
        b.water = true;
    if (b.harvest === undefined && b.harvestAfter === undefined)
        b.harvest = true;
}
// —— 建农场开张文案（POST /farms 与 GET /c?a=create 共用）——
function createText(f, now) {
    const ident = `👤 注册信息：农场名「${f.name}」${f.aiName ? `· 你（AI）的昵称「${f.aiName}」` : ""}${f.humanName ? `· 伴侣昵称「${f.humanName}」` : ""}${(!f.aiName || !f.humanName) ? "\n（昵称可让伴侣帮你在「我的牧场」页补填/修改；AI 昵称会用于你原创作物的署名）" : ""}`;
    const humanUrl = `${BASE}/ui/${ensureHumanKey(f)}`;
    const playUrl = `${BASE}/a/${ensureAgentKey(f)}`;
    return `🌱「${f.name}」创建成功！🏠 门牌号 ${f.id}（别人串门/偷菜/留言认这个，可公开）。\n${ident}\n\n📌 第一步（先做这个，再开始种田）：把下面这条「陪你看农场」的链接发给 ${f.humanName || "伴侣"}——\n🏡 ${humanUrl}\n原样发给 TA，TA 就能同步看农场、经营自己的牧场（养动物/宠物、收成换金币、回传给你、改昵称）。发完这步，再开始经营。\n\n🎮 你玩农场，用这条你专属的农场链接（拿着它就行，动作不用带 token）：\n🔗 ${playUrl}\n　例：忙活一轮 → POST ${playUrl}/run {"plant":{"common":3,"fantasy":3}}\n　串门：动作参数里加 "to":"对方门牌号"。\n\n🔑 后备主钥匙 token：${f.token}\n⚠️ 收好、别外泄（只显示这一次）。平时玩用上面那条 🔗 链接就够；token 只在 🔗 链接泄露时用来换新（new-token）。注意：发给 ${f.humanName || "伴侣"} 的是 🏡 那条，既不是 token、也不是 🔗。\n口袋 ${f.coins} 金币，${f.plots.length} 块荒地，外加 ${f.items.speed_potion ?? 0} 瓶加速药水。\n${shopBrief(f, now)}\n💡 上手：种下种子 → 用加速药水立刻催熟 → 收获揭晓，先跑通一轮！`;
}
function agentReadyText(f, humanUrl, agentUrl, isNew) {
    const human = f.humanName || "伴侣";
    const head = isNew ? `🌾「${f.name}」创建成功！` : `已为「${f.name}」换发了新的农场链接（旧 token 已失效）。`;
    return `${head}

1. 给 ${human} 的链接（陪你看农场）
🏡 ${humanUrl}

2. 你玩农场的链接
🤖 ${agentUrl}

请立即把上面这两条链接都发送给${human}，并提醒对方保存。

📖 完整玩法 / 帮 AI 做"要打字的动作"（设计/留言/改名）：${BASE}/get
（🏠 门牌号 ${f.id}，别人串门/偷菜认它、可公开。两条链接都不含主 token，AI 拿不到农场私钥。）`;
}
function runFarmCore(farmId, action, b, encArg, now, options = {}) {
    const storedFarm = getFarm(farmId);
    const currentFarm = storedFarm && action === "market"
        ? discoverAndBroadcastMysteryMerchant(storedFarm, now).farm
        : storedFarm;
    if (!currentFarm)
        return { status: 400, json: { ok: false, text: `找不到农场 ${farmId || "(没给 farm)"}` } };
    const projectedRead = action === "visit" || action === "leaderboard" || action === "ranking" ||
        action === "help" || action === "shop" || action === "market" || action === "encyclopedia" ||
        (action === "kitchen" && (!b.op || b.op === "view")) ||
        (action === "guestbook" && b.on === undefined);
    const f = projectedRead ? structuredClone(currentFarm) : currentFarm;
    if (projectedRead) {
        advance(f, now);
        if (f.id === NPC_ID)
            tendNpc(f, now);
    }
    const persistProjectedRead = () => {
        if (projectedRead && JSON.stringify(f) !== JSON.stringify(currentFarm))
            replaceFarm(currentFarm.id, f);
    };
    const careerBenefits = options.careerBenefits ?? farmCareerBenefits(activeLingyeWorldDatabase, f);
    const detail = options.detail === true || b?.detail === true || b?.detail === "1" || b?.detail === "true"
        || b?.verbose === true || b?.verbose === "1" || b?.verbose === "true";
    const vf = (ff) => detail ? { farm: farmView(ff, now) } : {};
    if (action === "visit") {
        const visitor = b.by ? getFarm(String(b.by)) : null;
        const detention = visitor ? activeDetentionForFarm(visitor, now) : null;
        if (detention)
            return { status: 400, json: { ok: false, code: "RESIDENT_DETAINED", text: detentionBlockedFarmActionText(detention) } };
        if (!reachable(f))
            return { status: 403, json: { ok: false, text: `「${f.name}」设了谢绝来访，已闭门谢客。` } };
        const visitorId = String(b.by ?? ""); // 串门任务：身份已知（带 by）时按家去重计一次
        if (visitorId && visitorId !== f.id) {
            const v = getFarm(visitorId);
            if (v) {
                let changed = false;
                v.visitedIds ??= [];
                if (!v.visitedIds.includes(f.id)) {
                    v.visitedIds.push(f.id);
                    changed = true;
                } // 串门称号：按去重家数
                if (onTaskEvent(v, "visit", now, { targetId: f.id }))
                    changed = true;
                if (checkTitles(v).length)
                    changed = true;
                if (changed)
                    save();
            }
        }
        const targetRef = b.targetRef ? String(b.targetRef) : undefined;
        const publicDetail = detail ? { farm: {
                ...(targetRef ? { number: Number(targetRef) } : { id: f.id }),
                name: f.name,
                plots: farmView(f, now).plots,
            } } : {};
        persistProjectedRead();
        return { status: 200, json: { ok: true, text: visitView(f, now, visitorId ? getFarm(visitorId) : undefined, targetRef), ...publicDetail } };
    }
    if (action === "leaderboard" || action === "ranking") {
        persistProjectedRead();
        return { status: 200, json: { ok: true, text: viewLeaderboard(playerFarms(), allUgc(), now) } };
    }
    if (action === "help") {
        persistProjectedRead();
        return { status: 200, json: { ok: true, text: SHARED_HELP } }; // 动作表（单一真相源）：POST 版 GET /a/<key>/help、/c?a=help 与 MCP 的 farm({action:"help"}) 共用
    }
    // 默认所有响应只回文字（text 末尾已含一行 HUD，AI 直接读）；不附结构化 farm，省 token。
    // detail:true（兼容旧名 verbose）：私有动作返回完整自家快照；公开 visit 只返回目标公开地块结构。
    const token = String(b.token ?? "");
    const isGuardBribe = action === "kitchen" && b.op === "use" && b.target === "guard-dog" && !!b.by;
    const isByAction = action === "steal" || action === "buy" || action === "message" || isGuardBribe || (action === "water" && !!b.by) || (action === "delete-message" && !!b.by) || (action === "buy-potion-set" && !!b.by);
    const byId = isByAction ? String(b.by ?? "") : "";
    const principal = isByAction ? getFarm(byId) : f;
    if (!principal || !principal.token || token !== principal.token)
        return { status: isByAction ? 403 : 401, json: { ok: false, text: isByAction
                    ? "需要带上你农场的 id + token（by + token）证明这是你本人。"
                    : "这是私有操作，需要你农场的 token。串门看公开页用 visit（GET /c?a=visit&farm=对方id）。" } };
    const detention = activeDetentionForFarm(principal, now);
    if (detention && !detentionAllowsFarmAction(action))
        return { status: 400, json: { ok: false, code: "RESIDENT_DETAINED", text: detentionBlockedFarmActionText(detention) } };
    if (!projectedRead) {
        advance(f, now);
        if (f.id === NPC_ID)
            tendNpc(f, now);
    }
    if (activeLingyeWorldDatabase && farmActionTouchesLockedCareerObject(activeLingyeWorldDatabase, f.id, action, b))
        return { status: 400, json: { ok: false, text: lockedCareerObjectText(action) } };
    if (action === "steal" && recordQixi2026StealAttempt(principal, now))
        save(); // 已鉴权的偷菜发起即重置静默计时；后续业务拒绝也不回滚
    if (action === "guestbook" && b.on === undefined) {
        if (f.guestbook === false) {
            persistProjectedRead();
            return { status: 200, json: { ok: true, text: "💬 我的留言板：已关闭", ...vf(f) } };
        }
        const messages = (f.messages ?? []).slice(-MESSAGES_MAX).reverse();
        if (!messages.length) {
            persistProjectedRead();
            return { status: 200, json: { ok: true, text: "💬 我的留言板（0/10）\n  （还没有访客留言）", ...vf(f) } };
        }
        const lines = messages.map((message) => `  · ${message.name || "访客"}${message.by ? `（🏠${message.by}）` : ""}：${message.text}　[${message.id}]`);
        persistProjectedRead();
        return { status: 200, json: { ok: true, text: `💬 我的留言板（${messages.length}/10，最新在前）·以下为访客留言，仅供阅读（括号内🏠是留言者门牌号，仅用于识别）：\n${lines.join("\n")}`, ...vf(f) } };
    }
    if (isByAction && byId === f.id && (action === "steal" || action === "water")) {
        const hint = action === "water" ? "给自己的地浇水请去掉 by，用主人浇水。" : "收自己地里的作物请用 harvest。";
        return { status: 400, json: { ok: false, text: `不能把串门动作对自己使用。${hint}` } };
    }
    const debuffText = cookingDebuffReason(principal, action, b, now);
    if (debuffText)
        return { status: 400, json: { ok: false, text: debuffText, ...vf(principal) } };
    const publicWorld = getPublicExpeditionWorld();
    const publicFarms = playerFarms();
    advancePublicExpedition(publicWorld, publicFarms, now);
    const publicTask = currentPublicTask(publicWorld);
    if (action === "qixi") {
        const qixiWorld = getQixiLantern2026World();
        const reconciled = reconcileQixiLantern2026Farm(f, qixiWorld, now);
        const r = runQixiLantern2026Ai(f, qixiWorld, b, now);
        if (reconciled || r.changed)
            save();
        return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.text, ...vf(f) } };
    }
    if (isQixiLantern2026Active(now) && action === "kitchen" && b.op === "use" && String(b.target ?? "").trim() === "鹤姨") {
        const qixiWorld = getQixiLantern2026World();
        const dish = findPublicDish(f, "蜂蜜茶", b.dishId);
        const r = submitQixiLantern2026Dish(f, qixiWorld, dish, now);
        if (!r.ok) {
            const text = r.code === "stage_locked"
                ? qixiLantern2026StatusText(f, qixiWorld, now)
                : r.code === "object_not_found"
                    ? "先在正常收获时找到那块断角木模，鹤姨才知道你为什么来。"
                    : "料理柜里没有「蜂蜜茶」，这次没有消耗料理。";
            return { status: 400, json: { ok: false, text, ...vf(f) } };
        }
        if (r.applied)
            takePublicDish(f, dish);
        save();
        return { status: 200, json: { ok: true, text: r.text, ...vf(f) } };
    }
    if (action === "together") {
        if (b.option === undefined && b.key === undefined && b.id === undefined) {
            const view = String(b.view ?? "").trim().toLowerCase() === "history" ? "history" : "recent";
            save();
            return { status: 200, json: { ok: true, text: publicExpeditionText(publicWorld, f, now, publicFarms, view), ...vf(f) } };
        }
        const r = runPublicChoice(publicWorld, f, b.option ?? b.key ?? b.id, now, publicFarms);
        save();
        return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.text, ...vf(f) } };
    }
    // 公共任务复用现有动作和参数；只有任务专属目标会推进共享进度，普通同类操作原样放行。
    if (action === "explore" && publicTask?.kind === "explore"
        && String(b.location ?? "").trim() === publicTask.location) {
        const r = recordPublicContribution(publicWorld, f, { kind: "explore" }, now, publicFarms);
        save();
        return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.text, ...vf(f) } };
    }
    if (action === "fish" && publicTask?.id === "c_bottle" && String(b.location ?? "").trim() === "倒流湾") {
        const r = recordPublicContribution(publicWorld, f, { kind: "fish" }, now, publicFarms);
        save();
        return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.text, ...vf(f) } };
    }
    if (action === "kitchen" && b.op === "use" && publicTask?.kind === "dish"
        && String(b.target ?? "").trim() === publicTask.npc) {
        const task = publicTask;
        const allowed = checkPublicContribution(publicWorld, f, "dish", {}, now, publicFarms);
        if (!allowed.ok)
            return { status: 400, json: { ok: false, text: allowed.text, ...vf(f) } };
        const dish = findPublicDish(f, task.dish, b.dishId);
        if (!dish)
            return { status: 400, json: { ok: false, text: `料理柜里没有任务需要的「${task.dish}」，这次没有消耗料理。`, ...vf(f) } };
        const r = recordPublicContribution(publicWorld, f, { kind: "dish", dishName: dish.name }, now, publicFarms);
        if (r.ok)
            takePublicDish(f, dish);
        save();
        return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.ok ? `🍲 已把「${dish.name}」交给公共任务 NPC。\n${r.text}` : r.text, ...vf(f) } };
    }
    if (action === "plant" && publicTask?.id === "b_plant"
        && String(b.seedType ?? b.limitedId ?? "").trim() === "明日试验种") {
        const allowed = checkPublicContribution(publicWorld, f, "plant", {}, now, publicFarms);
        if (!allowed.ok)
            return { status: 400, json: { ok: false, text: allowed.text, ...vf(f) } };
        const plot = b.plotId != null
            ? f.plots.find((item) => item.id === Number(b.plotId) && !item.crop)
            : f.plots.find((item) => !item.crop);
        if (!plot)
            return { status: 400, json: { ok: false, text: b.plotId != null ? `${b.plotId} 号地不存在或不是空地。` : "没有空地可以进行剧情试种。", ...vf(f) } };
        plot.crop = { seedType: "common", growTicks: GROW_TICKS.common, progress: 0, ripe: false, waterCount: 0 };
        pushLog(f, `在 ${plot.id} 号地种下芽芽提供的明日试验种`);
        const r = markPublicTrialPlot(publicWorld, f, plot, structuredClone(plot.crop), now, publicFarms);
        save();
        return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.ok ? `🌱 已在 ${plot.id} 号地种下任务标记的明日试验种。\n${r.text}` : r.text, ...vf(f) } };
    }
    if (action === "water" && publicTask?.id === "b_water" && principal.id !== f.id) {
        const target = findPublicWaterTarget(publicWorld, principal.id, [f], now);
        if (target && (b.plotId == null || Number(b.plotId) === target.plot.id)) {
            const allowed = checkPublicContribution(publicWorld, principal, "water", { targetFarmId: f.id }, now, publicFarms);
            if (!allowed.ok)
                return { status: 400, json: { ok: false, text: allowed.text, ...vf(principal) } };
            const watered = visitorWater(f, principal.id, target.plot.id, principal.name, now);
            if (!watered.ok)
                return { status: 400, json: { ok: false, text: watered.error, ...vf(principal) } };
            // 这条铃野共行专用路径历史上不累计 lifetime watered；只新增今日榜计数。
            bumpDaily(principal, now, "watered");
            applyDroughtWatering(f, [target.plot.id], now);
            const got = tryWaterReward(f, principal, now);
            const qixi = recordQixi2026Progress(principal, "water", 1, now);
            pushSocialInbox(f, `💧 「${principal.name}」为铃野共行照料了你的 ${target.plot.id} 号试验田`, now);
            const r = recordPublicContribution(publicWorld, principal, { kind: "water", targetFarmId: f.id, targetFarmName: f.name, plotId: target.plot.id }, now, publicFarms);
            save();
            return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.ok ? [`💧 已为「${f.name}」的 ${target.plot.id} 号任务试验田浇水${got ? "，并得到 1 瓶加速药水" : ""}。\n${r.text}`, qixi2026CompletionText(qixi)].filter(Boolean).join("\n") : r.text, ...vf(principal) } };
        }
    }
    if (action === "harvest" && publicTask?.id === "b_harvest") {
        const plot = findPublicHarvestPlot(publicWorld, f, publicFarms, now);
        if (plot && b.plotId != null && Number(b.plotId) === plot.id) {
            const allowed = checkPublicContribution(publicWorld, f, "harvest", {}, now, publicFarms);
            if (!allowed.ok)
                return { status: 400, json: { ok: false, text: allowed.text, ...vf(f) } };
            plot.crop.ripe = true;
            plot.crop.progress = plot.crop.growTicks;
            const harvested = dispatch(f, { action: "harvest", plotId: plot.id }, now, careerBenefits);
            if (!harvested.ok)
                return { status: 400, json: { ok: false, text: harvested.text, ...vf(f) } };
            const r = recordPublicContribution(publicWorld, f, { kind: "harvest", plotId: plot.id }, now, publicFarms);
            commitNatureFarmReconciliation(f, now);
            save();
            return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.ok ? `${harvested.text}\n${r.text}` : r.text, ...vf(f) } };
        }
    }
    if (action === "glimmer") {
        const r = runGlimmer(f, getGlimmerWorld(), b, now);
        checkTitles(f);
        save();
        return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.text, ...vf(f) } };
    }
    if (action === "fish") {
        const r = runFishing(f, b, now, playerFarms());
        const castRequested = b.leave === undefined && b.view === undefined && b.sell === undefined && b.open === undefined
            && (b.times !== undefined || (b.bait !== undefined && b.buy === undefined) || (b.buy === undefined && b.location === undefined));
        const qixi = r.ok && castRequested ? recordQixiLantern2026FarmAction(f, getQixiLantern2026World(), "fish", now) : null;
        if (qixi)
            r.text = `${r.text}\n${qixi.text}`;
        checkTitles(f);
        save();
        return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.text, ...vf(f) } };
    }
    // 视图（主人私有）
    if (!action || action === "status") {
        const cookingStatus = cookingDebuffStatusText(f, now);
        const text = [dispatch(f, { action: "status" }, now).text, cookingStatus, ripeBroadcastText(now), stolenTodayText(f, now)].filter(Boolean).join("\n\n"); // 内部会 roll 季节事件（可能已改农场）
        bumpDaily(f, now, "logins"); // 网瘾榜（今日开自己农场主页次数）
        save(); // 落盘：登录计数 + 状态里可能触发的季节事件
        return { status: 200, json: { ok: true, text, ...vf(f) } };
    }
    if (action === "shop") {
        const text = viewShop(f, now);
        persistProjectedRead();
        return { status: 200, json: { ok: true, text, ...vf(f) } };
    }
    if (action === "market") {
        const text = viewMarket(f, true);
        const mysteryMerchantWorld = getMysteryMerchantWorld();
        const activeMerchant = activeMysteryMerchantEvent(mysteryMerchantWorld, now);
        const mysteryMerchant = projectMysteryMerchant(
            mysteryMerchantWorld,
            now,
            playerFarms().find((candidate) => candidate.id === activeMerchant?.hostFarmId)?.name,
            f.id,
        );
        persistProjectedRead();
        return { status: 200, json: { ok: true, text, mystery_merchant: mysteryMerchant, ...vf(f) } };
    }
    if (action === "encyclopedia") {
        const text = viewEncyclopedia(f, encArg);
        persistProjectedRead();
        return { status: 200, json: { ok: true, text, ...vf(f) } };
    }
    if (action === "kitchen" && (!b.op || b.op === "view")) {
        const text = viewKitchen(f, now, String(b.view ?? "overview"), careerBenefits);
        persistProjectedRead();
        return { status: 200, json: { ok: true, text, ...vf(f) } };
    }
    // 重置 token（凭当前 token 换新；旧 token 立即失效——URL 里的 key 万一泄露就用它撤销）
    if (action === "new-token") {
        f.token = randomUUID().replace(/-/g, "");
        save();
        return { status: 200, json: { ok: true, text: `🔑 已重置 token。新 token：${f.token}\n旧 token 立即失效，请保存好新的。`, token: f.token } };
    }
    // 串门购买（钱由买家=by 出）。阿土卖限定种子走「金币」专用通道；普通玩家摊位走银币市场。
    if (action === "buy") {
        const buyer = getFarm(byId);
        advance(buyer, now);
        if (b.source === "mystery-merchant") {
            if (!activeMysteryMerchantRuntime || typeof activeMysteryMerchantRuntime.renderPurchaseResult !== "function")
                throw new Error("Mystery merchant purchase copy is not configured");
            const working = structuredClone(buyer);
            const r = buyMysteryMerchantOffers({
                world: getMysteryMerchantWorld(),
                buyer: working,
                itemIds: b.items,
                now,
            });
            if (!r.ok) {
                return {
                    status: 400,
                    json: {
                        ok: false,
                        text: activeMysteryMerchantRuntime.renderPurchaseResult(r),
                        mystery_merchant: projectMysteryMerchant(getMysteryMerchantWorld(), now, null, buyer.id),
                        ...vf(buyer),
                    },
                };
            }
            const committed = replaceFarmAndMysteryMerchantAtomic({
                replacement: { id: buyer.id, farm: working },
                nextMysteryMerchantWorld: r.world,
            });
            return {
                status: 200,
                json: {
                    ok: true,
                    text: activeMysteryMerchantRuntime.renderPurchaseResult(r),
                    mystery_merchant: projectMysteryMerchant(committed.mysteryMerchant, now, null, buyer.id),
                    ...vf(committed.farm),
                },
            };
        }
        if (f.id === NPC_ID) {
            const r = buyNpcSeed(f, buyer, String(b.id), now);
            if (!r.ok)
                return { status: 400, json: { ok: false, text: r.error, ...vf(buyer) } };
            save();
            return { status: 200, json: { ok: true, text: `🛒 从「${f.name}」买到限定种子「${r.name}」×${r.qty}，-💰${r.cost}金\n${statusFooter(buyer, now)}`, ...vf(buyer) } };
        }
        const r = buyFromMarket(f, buyer, String(b.kind), String(b.id), b.qty, now);
        if (!r.ok)
            return { status: 400, json: { ok: false, text: r.error, ...vf(buyer) } };
        if (b.kind === "seed" && String(b.id).startsWith("ugc_"))
            onTaskEvent(buyer, "buy_ugc", now); // 随机任务：买邻居原创作物
        checkTitles(buyer); // 任务称号（买原创可能完成任务）
        save();
        return { status: 200, json: { ok: true, text: `🛒 从「${f.name}」买到「${r.name}」×${r.qty}，-🪙${r.cost}银\n${statusFooter(buyer, now)}`, ...vf(buyer) } };
    }
    // 偷菜
    if (action === "steal") {
        const thief = getFarm(byId);
        if (!reachable(f) || !allowsSocial(f, "steal"))
            return { status: 400, json: { ok: false, text: reachable(f) ? `「${f.name}」关闭了偷菜，偷不了。` : `「${f.name}」已闭门谢客，进不去。`, ...vf(thief) } };
        if (!reachable(thief) || !allowsSocial(thief, "steal"))
            return { status: 400, json: { ok: false, text: reachable(thief) ? `你关闭了偷菜开关——先让 ${thief.humanName || "伴侣"} 帮你打开才能偷别人。` : `你设了谢绝来访（闭门状态），不能出门偷菜——先让 ${thief.humanName || "伴侣"} 帮你打开『访问』。`, ...vf(thief) } };
        advance(thief, now);
        const r = steal(f, Number(b.plotId), byId, now, thief);
        checkTitles(thief);
        checkTitles(f); // 大盗 / 倒霉称号
        let securityResult = null;
        if (r.ok) {
            try {
                securityResult = catchNpcCropTheft(f, byId, now);
            }
            catch {
                console.error("[security] one successful crop theft could not be recorded");
            }
        }
        if (r.ok) {
            pushSocialInbox(f, `🥷 「${thief.name}」偷了你的菜`, now);
            commitNatureRemovedPlot(f, Number(b.plotId), "visitor", `steal:${thief.id}:${f.id}:${Number(b.plotId)}`, now);
        }
        save();
        if (!r.ok) {
            const bribe = r.guardBlocked
                ? `\n🍲 可以用一份正常料理贿赂${r.dogName}，继续这同一次偷菜。下一步：doorbell({"op":"farm.kitchen.bribe","args":{"dishId":"料理名","to":"${b.targetRef ?? "农场编号"}"}})。不会再计次数或冷却。`
                : "";
            return { status: 400, json: { ok: false, text: r.error + bribe, ...vf(thief) } };
        }
        const got = stealThiefText(r.crop) + `（${r.quality.name}·+${r.value}金）`;
        const reveal = r.isNewForThief ? `\n${harvestText(r.crop, r.quality, r.value, true, r.codexReward, false)}` : "";
        return { status: 200, json: { ok: true, text: `${got}${reveal}\n${statusFooter(thief, now)}`, ...(securityResult ? { security: securityResult } : {}), ...vf(thief) } };
    }
    if (isGuardBribe) {
        const thief = getFarm(byId);
        const pendingPlotId = thief?.ranch?.kitchen?.pendingGuard?.plotId;
        const r = bribeGuardDog(thief, f, String(b.dishId), now);
        if (!r.ok) {
            save();
            return { status: 400, json: { ok: false, text: `${r.error}${r.dishKept ? "（料理没有消耗，本次尝试结束。）" : ""}`, ...vf(thief) } };
        }
        let securityResult = null;
        try {
            securityResult = catchNpcCropTheft(f, byId, now);
        }
        catch {
            console.error("[security] one successful crop theft could not be recorded");
        }
        commitNatureRemovedPlot(f, pendingPlotId, "visitor", `steal:${thief.id}:${f.id}:${pendingPlotId}`, now);
        pushSocialInbox(f, `🥷 「${thief.name}」用料理哄住看家狗后偷了你的菜`, now);
        save();
        const got = stealThiefText(r.crop) + `（${r.quality.name}·+${r.value}金）`;
        const reveal = r.isNewForThief ? `\n${harvestText(r.crop, r.quality, r.value, true, r.codexReward, false)}` : "";
        return { status: 200, json: { ok: true, text: `🍖 用「${r.dishName}」哄住了看家狗，继续原本那次偷菜；料理已消耗，没有重复计算出手或冷却。\n${got}${reveal}\n${statusFooter(thief, now)}`, ...(securityResult ? { security: securityResult } : {}), ...vf(thief) } };
    }
    // 帮别人浇水：给对方加速 30 分钟 + 给浇水者(by)掉 1 瓶加速药水（1 家 1 天只能浇 1 次，防互刷）
    if (action === "water" && b.by) {
        const visitor = getFarm(byId);
        if (!reachable(f) || !allowsSocial(f, "water"))
            return { status: 400, json: { ok: false, text: reachable(f) ? `「${f.name}」谢绝帮浇水。` : `「${f.name}」已闭门谢客，进不去。` } };
        if (!reachable(visitor) || !allowsSocial(visitor, "water"))
            return { status: 400, json: { ok: false, text: reachable(visitor) ? `你关闭了浇水开关——先让 ${visitor.humanName || "伴侣"} 帮你打开才能帮别人浇。` : `你设了谢绝来访（闭门状态），不能出门浇水——先让 ${visitor.humanName || "伴侣"} 帮你打开『访问』。` } };
        advance(visitor, now);
        // 串门浇水＝帮对方加速 30 分钟（默认浇剩余时间最短的那块；不再提升稀有度；1 家 1 天 1 次）
        const r = visitorWater(f, byId, b.plotId != null ? Number(b.plotId) : undefined, visitor.name, now);
        if (!r.ok)
            return { status: 400, json: { ok: false, text: r.error } };
        applyDroughtWatering(f, [r.plotId], now);
        recordSuccessfulWatering(visitor, now);
        onTaskEvent(visitor, "help_water", now); // 随机任务：帮邻居浇水（浇水者）
        const qixi = recordQixi2026Progress(visitor, "water", 1, now);
        onTaskEvent(f, "got_watered", now); // 随机任务：被人浇水（被浇者）
        const got = tryWaterReward(f, visitor, now);
        checkTitles(visitor); // 热心称号
        pushSocialInbox(f, `💧 「${visitor.name}」给你浇了水`, now);
        save();
        return { status: 200, json: { ok: true, text: [`${waterText(false, visitor.name)}（帮「${f.name}」${r.plotId} 号地加速 30 分钟${r.ripened ? "，正好催熟啦" : ""}）${got ? "\n🧪 浇水有回报——掉了 1 瓶加速药水！" : ""}`, qixi2026CompletionText(qixi), statusFooter(visitor, now)].filter(Boolean).join("\n"), ...vf(visitor) } };
    }
    // 串门买别家商店随机刷出的「药水套装」（钱由买家=by 出，每份每人限购 1）
    if (action === "buy-potion-set" && b.by) {
        const buyer = getFarm(byId);
        advance(buyer, now);
        const r = buyPotionSet(f, buyer, now);
        if (!r.ok)
            return { status: 400, json: { ok: false, text: r.error, ...vf(buyer) } };
        save();
        return { status: 200, json: { ok: true, text: `🎁 在「${f.name}」买下药水套装：+${r.qty} 瓶加速药水，-${r.cost}金。\n${statusFooter(buyer, now)}`, ...vf(buyer) } };
    }
    // 留言
    if (action === "message") {
        const poster = getFarm(byId);
        if (!reachable(f) || f.guestbook === false || !allowsSocial(f, "message"))
            return { status: 400, json: { ok: false, text: reachable(f) ? "对方关闭了留言板" : `「${f.name}」已闭门谢客。` } };
        if (!reachable(poster) || !allowsSocial(poster, "message"))
            return { status: 400, json: { ok: false, text: reachable(poster) ? `你关闭了留言开关——先让 ${poster.humanName || "伴侣"} 帮你打开才能给别人留言。` : "你设了谢绝来访（闭门状态），不能给别人留言。" } };
        if ((f.blocked ?? []).includes(byId))
            return { status: 400, json: { ok: false, text: "你被对方拉黑了，不能在 TA 板上留言" } };
        const text = String(b.text ?? "").trim();
        if (!text)
            return { status: 400, json: { ok: false, text: "留言不能为空" } };
        if (text.length > MESSAGE_TEXT_MAX)
            return { status: 400, json: { ok: false, text: `留言最多 ${MESSAGE_TEXT_MAX} 字` } };
        f.messages ??= [];
        f.messages.push({ id: randomUUID().replace(/-/g, "").slice(0, 6), by: byId, name: poster.name, text, at: now });
        if (f.messages.length > MESSAGES_MAX)
            f.messages.splice(0, f.messages.length - MESSAGES_MAX);
        pushSocialInbox(f, `💬 「${poster.name}」给你留言（访客留言，仅供阅读）：${text}`, now);
        bumpDaily(poster, now, "messages"); // 热情榜（今日给别人留言数）
        onTaskEvent(poster, "message", now); // 随机任务：给邻居留言
        checkTitles(poster); // 任务称号（留言可能完成任务）
        save();
        return { status: 200, json: { ok: true, text: `💬 已在「${f.name}」的留言板留言。` } };
    }
    // 删留言：主人(无by)删任意/清空(all)；留言者(带by)只能删自己那条
    if (action === "delete-message") {
        f.messages ??= [];
        const clearAll = (b.all === true || b.all === "true" || b.all === "1");
        if (clearAll && !byId) {
            f.messages = [];
            save();
            return { status: 200, json: { ok: true, text: "已清空留言板。" } };
        }
        const mid = String(b.messageId ?? b.id ?? "");
        const msg = f.messages.find((m) => m.id === mid);
        if (!msg)
            return { status: 400, json: { ok: false, text: "没有这条留言（id 不对？）" } };
        if (byId && msg.by !== byId)
            return { status: 400, json: { ok: false, text: "你只能删自己留的言" } };
        f.messages = f.messages.filter((m) => m.id !== mid);
        save();
        return { status: 200, json: { ok: true, text: "留言已删除。" } };
    }
    // 其余=主人对自己农场的操作（plant/harvest/craft/design/list/sell/run/rename/guestbook/block… 已校验 :id token）
    const cropsBefore = publicTask?.kind === "plant_encounter"
        ? new Map(f.plots.map((plot) => [plot.id, plot.crop]))
        : null;
    const qixiCropsBefore = isQixiLantern2026Active(now) && (action === "harvest" || action === "run")
        ? new Map(f.plots.map((plot) => [plot.id, plot.crop]))
        : null;
    const r = dispatch(f, { ...b, action }, now, careerBenefits);
    if (r?.ok && action === "water") {
        const plotIds = b.plotId != null ? [Number(b.plotId)] : f.plots.map((plot) => plot.id);
        applyDroughtWatering(f, plotIds, now);
    }
    if (r?.ok && action === "run" && b.water)
        applyDroughtWatering(f, f.plots.map((plot) => plot.id), now);
    if (r?.ok && (action === "harvest" || action === "run"))
        commitNatureFarmReconciliation(f, now);
    if (r?.ok && action === "run") {
        const floodFish = collectFloodFishForFarm(f, now);
        if (floodFish.collected > 0)
            r.text = `${r.text}\n${floodFish.text}`;
    }
    if (r.ok && cropsBefore
        && f.plots.some((plot) => plot.crop?.seedType === "common" && cropsBefore.get(plot.id) !== plot.crop)) {
        const encounter = recordPublicPlantEncounter(publicWorld, f, now, publicFarms);
        if (encounter.triggered)
            r.text = `${r.text}\n${encounter.text}`;
    }
    if (r.ok && isQixiLantern2026Active(now)) {
        let qixi = null;
        if (action === "explore")
            qixi = recordQixiLantern2026FarmAction(f, getQixiLantern2026World(), "explore", now);
        else if (action === "ranch-feed")
            qixi = recordQixiLantern2026FarmAction(f, getQixiLantern2026World(), "ranch-feed", now);
        else if (qixiCropsBefore && f.plots.some((plot) => qixiCropsBefore.get(plot.id)?.ripe && qixiCropsBefore.get(plot.id) !== plot.crop))
            qixi = recordQixiLantern2026FarmAction(f, getQixiLantern2026World(), "harvest", now);
        if (qixi)
            r.text = `${r.text}\n${qixi.text}`;
    }
    save();
    return { status: r.ok ? 200 : 400, json: { ok: r.ok, text: r.text, ...vf(f) } };
}
function authenticatedResultFarm(farmId, body) {
    const token = String(body?.token ?? "");
    const by = body?.by ? getFarm(String(body.by)) : undefined;
    if (by?.token && by.token === token)
        return by;
    const own = getFarm(farmId);
    return own?.token && own.token === token ? own : undefined;
}
function runFarm(farmId, action, body = {}, encArg, now, options = {}) {
    const publicWorldBefore = JSON.stringify(getPublicExpeditionWorld());
    const out = runFarmCore(farmId, action, body, encArg, now, options);
    const viewer = authenticatedResultFarm(farmId, body);
    if (!viewer || !out?.json || out.status === 401 || out.status === 403)
        return out;
    const world = getPublicExpeditionWorld();
    const publicFarms = playerFarms();
    const publicFarmBefore = new Map(publicFarms.map((farm) => [farm.id, JSON.stringify(farm)]));
    advancePublicExpedition(world, publicFarms, now);
    const notices = takePublicAiNotices(world, viewer, now);
    const extras = [];
    if (notices.length)
        extras.push(notices.join("\n\n"));
    if (!action || action === "status")
        extras.push(`🧭 铃野共行：${publicExpeditionStatusLine(world, now, false)}。下一步：doorbell({"op":"farm.together.view","args":{}})`);
    const qixiAiLampReleased = Boolean(viewer.qixiLantern2026?.lamps?.ai?.releasedAt);
    if (isQixiLantern2026Active(now) && !qixiAiLampReleased && (!action || action === "status")) {
        const opening = qixiLantern2026.openingAnnouncement.split("\n").filter((line) => !line.startsWith("用 ")).join("\n");
        extras.push(`${opening}\n当前 Doorbell 连接未开放这项操作，不能在这里提交。`);
        if (now >= Date.parse(qixiLantern2026.finalStageAt))
            extras.push(qixiLantern2026.finalStageAnnouncement);
    }
    if (extras.length)
        out.json.text = `${String(out.json.text ?? "")}\n\n${extras.join("\n\n")}`;
    const publicStateChanged = publicWorldBefore !== JSON.stringify(world) ||
        publicFarms.some((farm) => publicFarmBefore.get(farm.id) !== JSON.stringify(farm));
    if (publicStateChanged)
        save();
    return out;
}

function runFarmWithRollback(farmId, action, body = {}, encArg, now, options = {}) {
    const rollback = snapshotWorldForRollback();
    try {
        return runFarm(farmId, action, body, encArg, now, options);
    }
    catch (error) {
        restoreWorldSnapshotInMemory(rollback);
        throw error;
    }
}
// ——————————— Agent 控制页（HTML，给只能点链接的 AI）———————————
function resolveAgent(playKey) {
    if (!playKey)
        return undefined;
    const f = allFarms().find((x) => !legacyAgentAccessRevoked(x) && x.agentKey === playKey);
    return f ? (fresh(f.id) ?? undefined) : undefined;
}
const handleLegacyMcp = createLegacyMcpHandler({ resolveAgent, executeAction: executeLegacyMcpAction });
    const legacyAgent = createLegacyAgentHandler({ runFarm: runFarmWithRollback, resolveAgent });
const tryServeAsset = createAssetHandler(new URL("../assets/", import.meta.url));
const MAINTENANCE_FILE = `${process.env.AIFARM_DATA_DIR || "./data"}/maintenance`;
const MAINTENANCE_API_TEXT = "农场正在维护，暂时不能操作，请稍后再来。";
const MAINTENANCE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>农场维护中</title>
<style>body{min-height:100vh;margin:0;display:grid;place-items:center;background:#f6f1e5;color:#34372f;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}.card{width:min(520px,calc(100% - 48px));box-sizing:border-box;padding:42px 32px;border:1px solid #ded6c7;border-radius:24px;background:#fffdf8;box-shadow:0 18px 50px rgba(70,62,46,.10);text-align:center}h1{margin:0 0 18px;font-size:2rem}p{margin:8px 0;line-height:1.8}.note{color:#777064;font-size:.94rem}</style></head><body><main class="card"><h1>🌾 农场维护中</h1><p>目前正在维护，暂时不能进入或操作农场。请稍后再来。</p><p class="note">你的农场和存档不会受到影响。</p></main></body></html>`;
function maintenanceWantsHtml(req, parts, method) {
    const top = parts[0] ?? "";
    const accept = String(req.headers.accept ?? "").toLowerCase();
    return accept.includes("text/html")
        || top === ""
        || top === "ui"
        || top === "agent"
        || top === "get"
        || top === "readme"
        || (top === "sync" && method === "GET");
}
function maintenanceOut(req, res, parts, method) {
    if (maintenanceWantsHtml(req, parts, method)) {
        res.writeHead(503, AGENT_HEADERS);
        return res.end(MAINTENANCE_HTML);
    }
    return jsonOut(res, 503, { ok: false, text: MAINTENANCE_API_TEXT });
}
export function startServer(port, host = "127.0.0.1", options = {}) {
    const injectedDatabase = options?.lingyeWorldDatabase;
    if (injectedDatabase !== undefined &&
        (!injectedDatabase || typeof injectedDatabase.prepare !== "function" || typeof injectedDatabase.close !== "function")) {
        throw new TypeError("startServer lingyeWorldDatabase must be a DatabaseSync instance");
    }
    const ownsLingyeWorldDatabase = injectedDatabase === undefined;
    const closeLingyeWorldDatabaseOnClose = ownsLingyeWorldDatabase || options.closeLingyeWorldDatabaseOnClose === true;
    const clearWorldPersistenceAdapterOnClose = options.clearWorldPersistenceAdapterOnClose === true;
    const lingyeWorldDatabase = injectedDatabase ?? openLingyeWorldDatabase();
    const mysteryMerchantConfig = options.mysteryMerchant === undefined
        ? null
        : {
            catalog: structuredClone(options.mysteryMerchant?.catalog),
            shelfSize: options.mysteryMerchant?.shelfSize,
            renderPurchaseResult: options.mysteryMerchant?.renderPurchaseResult,
        };
    if (mysteryMerchantConfig !== null &&
        (typeof mysteryMerchantConfig !== "object" || Array.isArray(mysteryMerchantConfig))) {
        throw new TypeError("startServer mysteryMerchant must be an object");
    }
    if (mysteryMerchantConfig?.renderPurchaseResult !== undefined &&
        typeof mysteryMerchantConfig.renderPurchaseResult !== "function") {
        throw new TypeError("startServer mysteryMerchant.renderPurchaseResult must be a function");
    }
    let rescheduleReporterEvaluation = () => {};
    let ranchRaidScheduler = null;
    activeLingyeWorldDatabase = lingyeWorldDatabase;
    setDailySpendEconomyDatabase(lingyeWorldDatabase);
    activeMysteryMerchantRuntime = mysteryMerchantConfig;
    const lingyeEconomyRules = Object.freeze({
        minimumSystemLoanCreditDays: 7,
        restrictedDailyGoldLimit: 200000,
        restrictedDailySilverLimit: 400,
    });
    const careerBenefitsForFarm = (farm) => farmCareerBenefits(lingyeWorldDatabase, farm);
    const resolveOriginalCookingReceipt = (receiptId) => {
        const matches = allFarms()
            .map((farm) => resolveChefOriginalCookingReceipt(farm, receiptId))
            .filter(Boolean);
        return matches.length === 1 ? matches[0] : null;
    };
    const lingyeWorldBackend = createLingyeWorldBackend(lingyeWorldDatabase, {
        economyRules: lingyeEconomyRules,
        chefAuthority: {
            resolveCookingReceipt: resolveOriginalCookingReceipt,
            useFarmStore: true,
        },
        securityAuthority: {
            getCaughtCropTheftFact: (input) => caughtCropTheftFact(lingyeWorldDatabase, input),
        },
        deferChefFarmRecovery: true,
        constableInterviewBank: loadConstableInterviewBank(),
        constableExamEligibility: (residentId, now) => constableExamTheftEligibility(lingyeWorldDatabase, residentId, now),
        onReporterPublication: () => rescheduleReporterEvaluation(),
    });
    activeLingyeWorldBackend = lingyeWorldBackend;
    const balanceCoordinator = createLingyeFarmBalanceCoordinator(lingyeWorldDatabase, lingyeWorldBackend);
    setWorldCommitCoordinator((world, ...args) => {
        const result = balanceCoordinator(world, ...args);
        ranchRaidScheduler?.reschedule(world.farms);
        return result;
    });
    const syncLedgerProjection = () => {
        const needsProjection = playerFarms().some((farm) => {
            const residentId = farm.doorbellMcpMigration?.residentId;
            if (!residentId)
                return false;
            const account = lingyeWorldBackend.trustedQueries.getAccount(residentId);
            return farm.coins !== account.availableGold || farm.silver !== account.availableSilver;
        });
        if (needsProjection)
            save();
    };
    try {
        withWorldCommitContext({ balanceAuthority: "farm", actor: "system" }, () => {
            // Startup-only grants and backfills must reach the farm snapshot and
            // migrated economy ledger in the same durable transaction.
            settleLoadedWorld({ forceSave: true });
            if (mysteryMerchantConfig) {
                advanceStoredMysteryMerchantWorld({
                    now: Date.now(),
                    catalog: mysteryMerchantConfig.catalog,
                    shelfSize: mysteryMerchantConfig.shelfSize,
                });
            }
        });
        withWorldCommitContext({ balanceAuthority: "ledger", actor: "system" }, () => {
            // Register/import every migrated ledger before any recovery reads
            // it, then recover Chef farm checkpoints under ledger authority.
            save();
            lingyeWorldBackend.trustedSystemCommands.recoverChefStoreFarmState();
            syncLedgerProjection();
        });
    }
    catch (error) {
        setWorldCommitCoordinator(null);
        if (clearWorldPersistenceAdapterOnClose)
            setWorldPersistenceAdapter(null);
        if (closeLingyeWorldDatabaseOnClose && lingyeWorldDatabase.isOpen)
            lingyeWorldDatabase.close();
        activeLingyeWorldDatabase = null;
        activeLingyeWorldBackend = null;
        activeMysteryMerchantRuntime = null;
        setDailySpendEconomyDatabase(null);
        throw error;
    }
    const rawLingyeActionExecutor = withWorldCommitContext(
        { balanceAuthority: "ledger", actor: "system" },
        () => createLingyeActionExecutor({
            database: lingyeWorldDatabase,
            backend: lingyeWorldBackend,
            economyRules: lingyeEconomyRules,
        }),
    );
    withWorldCommitContext(
        { balanceAuthority: "ledger", actor: "system" },
        () => syncLedgerProjection(),
    );
    const lingyeActionExecutor = Object.freeze({
        execute(input) {
            const operation = () => withWorldCommitContext(
                { balanceAuthority: "ledger", actor: "human" },
                () => rawLingyeActionExecutor.execute(input),
            );
            const result = input.op.startsWith("go.bank.") || input.op.startsWith("go.school.")
                ? runLingyeWorldTransaction(lingyeWorldDatabase, operation)
                : operation();
            // The ledger transaction is already committed. Project it into the
            // farm in a new durable transaction instead of a nested savepoint.
            withWorldCommitContext({ balanceAuthority: "ledger", actor: "human" }, () => {
                syncLedgerProjection();
            });
            rescheduleReporterEvaluation();
            return result;
        },
    });
    const runEmploymentCycle = () => {
        const result = runLingyeWorldTransaction(
            lingyeWorldDatabase,
            () => lingyeWorldBackend.trustedSystemCommands.advanceEmploymentDays(),
        );
        withWorldCommitContext({ balanceAuthority: "ledger", actor: "system" }, () => {
            syncLedgerProjection();
        });
        return result;
    };
    runEmploymentCycle();
    let employmentTimer;
    let employmentStopped = false;
    const scheduleEmploymentCycle = () => {
        if (employmentStopped)
            return;
        const current = Date.now();
        const offset = 8 * 60 * 60 * 1000;
        const nextBoundary = (Math.floor((current + offset) / (24 * 60 * 60 * 1000)) + 1) *
            24 * 60 * 60 * 1000 - offset;
        employmentTimer = setTimeout(() => {
            try {
                runEmploymentCycle();
            }
            catch {
                console.error("[lingye-employment] daily duty settlement failed");
            }
            scheduleEmploymentCycle();
        }, Math.max(0, nextBoundary - current));
        employmentTimer.unref();
    };
    scheduleEmploymentCycle();
    let mysteryMerchantTimer;
    let mysteryMerchantStopped = false;
    const scheduleMysteryMerchantCycle = () => {
        if (!mysteryMerchantConfig || mysteryMerchantStopped)
            return;
        const current = Date.now();
        const offset = 8 * 60 * 60 * 1000;
        const nextBoundary = (Math.floor((current + offset) / (24 * 60 * 60 * 1000)) + 1) *
            24 * 60 * 60 * 1000 - offset;
        mysteryMerchantTimer = setTimeout(() => {
            try {
                withWorldCommitContext({ balanceAuthority: "farm", actor: "system" }, () => {
                    advanceStoredMysteryMerchantWorld({
                        now: Date.now(),
                        catalog: mysteryMerchantConfig.catalog,
                        shelfSize: mysteryMerchantConfig.shelfSize,
                    });
                });
            }
            catch {
                console.error("[mystery-merchant] daily schedule failed");
            }
            scheduleMysteryMerchantCycle();
        }, Math.max(0, nextBoundary - current));
        mysteryMerchantTimer.unref();
    };
    scheduleMysteryMerchantCycle();
    let reporterEvaluationTimer;
    let reporterEvaluationStopped = false;
    const runReporterEvaluationCycle = () => {
        const settled = lingyeWorldBackend.trustedSystemCommands.settleDueReporterEvaluations();
        withWorldCommitContext({ balanceAuthority: "ledger", actor: "system" }, () => {
            syncLedgerProjection();
        });
        return settled;
    };
    const scheduleReporterEvaluationCycle = () => {
        if (reporterEvaluationStopped)
            return;
        if (reporterEvaluationTimer)
            clearTimeout(reporterEvaluationTimer);
        reporterEvaluationTimer = undefined;
        const dueAt = lingyeWorldBackend.trustedQueries.nextReporterEvaluationDueAt();
        if (dueAt === null)
            return;
        reporterEvaluationTimer = setTimeout(() => {
            try {
                runReporterEvaluationCycle();
            }
            catch {
                console.error("[lingye-reporter] evaluation settlement failed");
            }
            scheduleReporterEvaluationCycle();
        }, Math.max(0, dueAt - Date.now()));
        reporterEvaluationTimer.unref();
    };
    rescheduleReporterEvaluation = scheduleReporterEvaluationCycle;
    runReporterEvaluationCycle();
    scheduleReporterEvaluationCycle();
    const doorbellCareerBenefitsForFarm = (farm) => {
        const benefits = farmDoorbellKitchenCareerBenefits(
            lingyeWorldDatabase,
            lingyeWorldBackend,
            farm,
        );
        if (typeof benefits.onOriginalCookingReceipt !== "function")
            return benefits;
        return Object.freeze({
            ...benefits,
            onOriginalCookingReceipt(receipt) {
                const result = benefits.onOriginalCookingReceipt(receipt);
                withWorldCommitContext({ balanceAuthority: "ledger", actor: "human" }, () => {
                    syncLedgerProjection();
                });
                return result;
            },
        });
    };
    const handleDoorbellInternal = createDoorbellInternalHandler(
        executeDoorbellFarmAction,
        lingyeActionExecutor,
        doorbellCareerBenefitsForFarm,
        { database: lingyeWorldDatabase, backend: lingyeWorldBackend, economyRules: lingyeEconomyRules },
    );
    const stopP3Scheduler = startRegisteredP3Scheduler(lingyeWorldDatabase);
    const stopNatureScheduler = startNatureRuntimeScheduler();
    const stopConstableInterviewScheduler = startConstableInterviewScheduler(lingyeWorldDatabase, lingyeWorldBackend);
    ranchRaidScheduler = startRanchRaidScheduler();
    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);
        const parts = url.pathname.split("/").filter(Boolean);
        const sp = smartParams(url.search); // 同 url.searchParams，但纠正 GBK 等非 UTF-8 客户端的中文参数
        const method = req.method ?? "GET";
        if (existsSync(MAINTENANCE_FILE))
            return maintenanceOut(req, res, parts, method);
        if (tryServeAsset(method, parts, res))
            return;
        if (await handleDoorbellInternal(req, res, parts, method))
            return;
        const now = Date.now();
        const ip = clientIp(req);
        if (!allowRequest(ip, now))
            return jsonOut(res, 429, { ok: false, text: "请求太频繁了，过几秒再来（限流）。" });
        try {
            // —— 本地优先同步：公共联机服只接收副本，不读取任何私有实例数据目录。——
            if (parts[0] === "sync")
                return await handleSyncRoute({ req, res, parts, method, ip, now });
            // 玩法说明页（GET/agent 版，和首页平行，给只能 GET/点链接的 AI）。主路由 /get。
            //   /readme 给「人类伴侣」看的新手攻略（怎么分工、把哪条链接发给哪种 AI），纯阅读页、无其它入口。
            if (parts[0] === "readme" && parts.length === 1) {
                res.writeHead(200, AGENT_HEADERS);
                return res.end(htmlGuide());
            }
            if (parts[0] === "get" && parts.length === 1) {
                res.writeHead(200, AGENT_HEADERS);
                let readme = htmlReadme();
                if (SHOW_MIGRATION_NOTICE)
                    readme = readme.replace(/(<body[^>]*>)/, `$1${MIGRATION_NOTICE_HTML}`);
                return res.end(readme);
            }
            // 全服排行榜（公开，免 token）：文字版给 AI，?html 给人看
            if (parts[0] === "leaderboard" && parts.length === 1) {
                return jsonOut(res, 200, { ok: true, text: viewLeaderboard(playerFarms(), allUgc(), now) });
            }
            // —— 人类页 /ui/<humanKey>[/section]（伴侣看农场观光 + 经营自己的牧场；AI 接口看不到这些）——
            //   只认低权限 humanKey：够看农场+经营人类牧场+改昵称，但不能当 API token。
            if (parts[0] === "ui") {
                const rollback = method === "POST" ? snapshotWorldForRollback() : null;
                try {
                    return await handleLegacyHumanRoute({
                        req, res, url, parts, sp, method, now,
                        ensureAgentKey, farmByNumber, farmLabel,
                        careerBenefitsForFarm,
                    });
                }
                catch (error) {
                    if (rollback)
                        restoreWorldSnapshotInMemory(rollback);
                    throw error;
                }
            }
            // —— Agent 控制页（HTML，给只能点页面里现成链接的 AI）——
            if (legacyAgent.handleRoute({ req, res, url, parts, sp, method, now }))
                return;
            // 一步建农场 + 开通 Agent 页（用户打开一次，把返回的 agent 链接发给 AI）
            if (parts[0] === "agent-new" && parts.length === 1) {
                if (!REGISTRATION_OPEN)
                    return jsonOut(res, 503, { ok: false, text: REGISTRATION_CLOSED_TEXT });
                if (REGISTRATION_CAP > 0 && playerFarms().length >= REGISTRATION_CAP)
                    return jsonOut(res, 503, { ok: false, text: REGISTRATION_FULL_TEXT });
                if (allFarms().length >= MAX_FARMS)
                    return jsonOut(res, 503, { ok: false, text: "全服农场数量已达上限。" });
                if (!allowCreate(ip, now))
                    return jsonOut(res, 429, { ok: false, text: "建农场太频繁了，过会儿再来。" });
                if (hasDamagedRegistrationName(sp.get("name"), sp.get("aiName"), sp.get("humanName")))
                    return jsonOut(res, 400, { ok: false, text: DAMAGED_PUBLIC_NAME_TEXT });
                const f = fresh(createFarm(sp.get("name") ?? "", { aiName: sp.get("aiName") ?? undefined, humanName: sp.get("humanName") ?? undefined }).id);
                f.agentKey = newAgentKey();
                save();
                const aurl = `${BASE}/agent/${f.agentKey}`;
                const humanUrl = `${BASE}/ui/${ensureHumanKey(f)}`;
                return jsonOut(res, 201, { ok: true, text: agentReadyText(f, humanUrl, aurl, true), humanUrl, agentUrl: aurl, instruction: `请立即把 humanUrl 和 agentUrl 都发送给${f.humanName || "伴侣"}，并提醒对方保存。` });
            }
            if (method === "GET" && parts.length === 0)
                return textOut(res, 200, (SHOW_MIGRATION_NOTICE ? MIGRATION_NOTICE_TEXT + "\n\n" : "") + SHARED_HELP + SOCIAL_HELP);
            // GET 命令通道 /c：让只能 GET 的 AI 也能玩（query 当 body；建农场/串门/动作都走这里）
            if (parts[0] === "c") {
                const b = Object.fromEntries(sp);
                if (typeof b.limited === "string")
                    b.limited = b.limited.split(",");
                if (typeof b.materials === "string")
                    b.materials = b.materials.split(",");
                const a = String(b.a ?? "");
                if (a === "create") {
                    if (!REGISTRATION_OPEN)
                        return jsonOut(res, 503, { ok: false, text: REGISTRATION_CLOSED_TEXT });
                    if (REGISTRATION_CAP > 0 && playerFarms().length >= REGISTRATION_CAP)
                        return jsonOut(res, 503, { ok: false, text: REGISTRATION_FULL_TEXT });
                    if (allFarms().length >= MAX_FARMS)
                        return jsonOut(res, 503, { ok: false, text: "全服农场数量已达上限，暂不能再建新农场。" });
                    if (!allowCreate(ip, now))
                        return jsonOut(res, 429, { ok: false, text: "你建农场太频繁了，过会儿再来。" });
                    if (hasDamagedRegistrationName(b.name, b.aiName, b.humanName))
                        return jsonOut(res, 400, { ok: false, text: DAMAGED_PUBLIC_NAME_TEXT });
                    const f = fresh(createFarm(b.name, { aiName: b.aiName, humanName: b.humanName }).id);
                    return jsonOut(res, 201, { ok: true, text: createText(f, now), token: f.token, humanUrl: `${BASE}/ui/${f.humanKey}`, playUrl: `${BASE}/a/${f.agentKey}`, instruction: `先把 humanUrl 原样发给 ${f.humanName || "伴侣"}（让 TA 同步看农场、经营自己的牧场）；你自己玩农场用 playUrl（动作接在它后面，不用带 token），token 是后备主钥匙、收好别外泄。`, farm: farmView(f, now) });
                }
                if (a === "leaderboard" || a === "ranking")
                    return jsonOut(res, 200, { ok: true, text: viewLeaderboard(playerFarms(), allUgc(), now) });
                if (a === "wander")
                    return jsonOut(res, 200, wanderResult(b, now));
                if (a === "make-agent" || a === "revoke-agent") {
                    const f = getFarm(String(b.farm ?? ""));
                    if (!f || f.token !== String(b.token ?? ""))
                        return jsonOut(res, 403, { ok: false, text: "需要带 farm=你的农场id 和当前 token。" });
                    if (a === "revoke-agent") {
                        delete f.agentKey;
                        save();
                        return jsonOut(res, 200, { ok: true, text: "已撤销该农场的 Agent 链接（原链接立即失效）。" });
                    }
                    if (legacyAgentAccessRevoked(f))
                        return internalServiceError(res, 409, "legacy_agent_access_revoked", "Legacy agent access has been migrated to Doorbell");
                    f.token = randomUUID().replace(/-/g, ""); // 先轮换可能已泄露的 token
                    f.agentKey = newAgentKey();
                    ensureHumanKey(f); // 伴侣前端钥匙（稳定，token 轮换不影响它）
                    save();
                    const aurl = `${BASE}/agent/${f.agentKey}`;
                    const humanUrl = `${BASE}/ui/${f.humanKey}`;
                    return jsonOut(res, 200, { ok: true, text: agentReadyText(f, humanUrl, aurl, false), humanUrl, agentUrl: aurl, instruction: `请立即把 humanUrl 和 agentUrl 都发送给${f.humanName || "伴侣"}，并提醒对方保存。` });
                }
                const out = runFarmWithRollback(String(b.farm ?? ""), a || undefined, b, b.id, now);
                return jsonOut(res, out.status, out.json);
            }
            // 随机串门（POST）
            if (method === "POST" && parts[0] === "wander" && parts.length === 1) {
                return jsonOut(res, 200, wanderResult(await readBody(req), now));
            }
            // 建农场（POST）
            if (method === "POST" && parts[0] === "farms" && parts.length === 1) {
                if (!REGISTRATION_OPEN)
                    return jsonOut(res, 503, { ok: false, text: REGISTRATION_CLOSED_TEXT });
                if (REGISTRATION_CAP > 0 && playerFarms().length >= REGISTRATION_CAP)
                    return jsonOut(res, 503, { ok: false, text: REGISTRATION_FULL_TEXT });
                if (allFarms().length >= MAX_FARMS)
                    return jsonOut(res, 503, { ok: false, text: "全服农场数量已达上限，暂不能再建新农场。" });
                if (!allowCreate(ip, now))
                    return jsonOut(res, 429, { ok: false, text: "你建农场太频繁了，过会儿再来。" });
                const cb = await readBody(req);
                if (hasDamagedRegistrationName(cb.name, cb.aiName, cb.humanName))
                    return jsonOut(res, 400, { ok: false, text: DAMAGED_PUBLIC_NAME_TEXT });
                const f = fresh(createFarm(cb.name, { aiName: cb.aiName, humanName: cb.humanName }).id);
                return jsonOut(res, 201, { ok: true, text: createText(f, now), token: f.token, humanUrl: `${BASE}/ui/${f.humanKey}`, playUrl: `${BASE}/a/${f.agentKey}`, instruction: `先把 humanUrl 原样发给 ${f.humanName || "伴侣"}（让 TA 同步看农场、经营自己的牧场）；你自己玩农场用 playUrl（动作接在它后面，不用带 token），token 是后备主钥匙、收好别外泄。`, farm: farmView(f, now) });
            }
            // MCP 适配器：POST /mcp/<key>（手写最小 JSON-RPC，第 4 个传输层）。<key> = agentKey（和 /a/<key> 同一把，可撤销）。
            //   单工具 farm：身份焊进链接里，调用只给 {action, ...参数}，薄转发到 runFarm——与 POST 版同规则、同存档、同 HUD。
            if (parts[0] === "mcp")
                return await handleLegacyMcp({ req, res, parts, method, now });
            // 农场专属链接 /a/<key>：身份焊进链接，动作不带 token / by。<key> = 农场 agentKey（和 /agent 点击页同一把，可撤销）。
            //   自家事：POST /a/<key>/<动作> {参数}；串别家：参数加 "to":"对方门牌号"（steal/water/buy/message/buy-potion-set/visit）。
            //   视图走 GET /a/<key>/<status|shop|bag|market|encyclopedia|ledger|leaderboard>；随机逛 /a/<key>/wander。
            if (parts[0] === "a" && parts.length >= 2) {
                const me = resolveAgent(parts[1]);
                if (!me)
                    return jsonOut(res, 404, { ok: false, text: "这个农场链接无效或已被撤销（key 不对？）。新建/重开链接见 GET / 的「开张 & 接入」。" });
                const action = parts[2];
                if (mutatingViaGet(method, action))
                    return jsonOut(res, 405, { ok: false, text: `「${action}」会改动农场，请用 POST（GET 只用于查看：${[...READONLY_ACTIONS].join("/")}）。这样防止链接被预取/抓取时误触发。` });
                const b = method === "POST" ? await readBody(req) : {};
                for (const [k, v] of sp)
                    if (b[k] === undefined)
                        b[k] = v;
                if (method !== "POST" && action === "kitchen" && b.op && b.op !== "view")
                    return jsonOut(res, 405, { ok: false, text: "料理台的 buy/cook/use/sell 会改动状态，请用 POST；GET 只可查看。" });
                if (method !== "POST" && action === "glimmer" && b.op && b.op !== "view")
                    return jsonOut(res, 405, { ok: false, text: "流光原野的 ticket/explore/catch/assist/choose 会改动状态，请用 POST；GET 只可查看。" });
                if (method !== "POST" && action === "together" && (b.option !== undefined || b.key !== undefined || b.id !== undefined))
                    return jsonOut(res, 405, { ok: false, text: "铃野共行的选择或投票会推进全服状态，请用 POST；GET 只可查看。" });
                if (typeof b.limited === "string")
                    b.limited = b.limited.split(",");
                if (typeof b.materials === "string")
                    b.materials = b.materials.split(",");
                if (action === "wander")
                    return jsonOut(res, 200, wanderResult({ ...b, by: me.id }, now, true));
                if (action === "visit" && (b.to === undefined || String(b.to).trim() === ""))
                    return jsonOut(res, 200, visitListResult(me));
                const social = action === "kitchen"
                    ? b.op === "use" && b.target === "guard-dog" && b.to !== undefined && String(b.to) !== ""
                    : b.to !== undefined && String(b.to) !== ""; // kitchen 的 to 还可表示 system/market，只有贿赂才是跨农场
                const resolved = social ? resolveNumberedTarget(b.to, me) : undefined;
                if (resolved?.error)
                    return jsonOut(res, 400, { ok: false, text: resolved.error });
                const target = resolved?.farm?.id ?? me.id;
                fillRunDefaults(action, b);
                const body = social ? { ...b, by: me.id, token: me.token, targetRef: String(resolved.number) } : { ...b, token: me.token };
                const out = runFarmWithRollback(target, action, body, social ? me.id : (parts[3] ?? b.id), now);
                return jsonOut(res, out.status, out.json);
            }
            // 农场作用域（REST · 老派 token 写法）：POST 动作 / GET 视图都走共用的 runFarm（也兼容 ?query= 带参、X-Farm-Token 头）
            if (parts[0] === "farms" && parts.length >= 2) {
                if (mutatingViaGet(method, parts[2]))
                    return jsonOut(res, 405, { ok: false, text: `「${parts[2]}」会改动农场，请用 POST（GET 只用于查看：${[...READONLY_ACTIONS].join("/")}）。这样防止链接被预取/抓取时误触发。` });
                const b = method === "POST" ? await readBody(req) : {};
                for (const [k, v] of sp)
                    if (b[k] === undefined)
                        b[k] = v;
                if (method !== "POST" && parts[2] === "kitchen" && b.op && b.op !== "view")
                    return jsonOut(res, 405, { ok: false, text: "料理台的 buy/cook/use/sell 会改动状态，请用 POST；GET 只可查看。" });
                if (method !== "POST" && parts[2] === "glimmer" && b.op && b.op !== "view")
                    return jsonOut(res, 405, { ok: false, text: "流光原野的 ticket/explore/catch/assist/choose 会改动状态，请用 POST；GET 只可查看。" });
                if (method !== "POST" && parts[2] === "together" && (b.option !== undefined || b.key !== undefined || b.id !== undefined))
                    return jsonOut(res, 405, { ok: false, text: "铃野共行的选择或投票会推进全服状态，请用 POST；GET 只可查看。" });
                if (typeof b.limited === "string")
                    b.limited = b.limited.split(",");
                if (typeof b.materials === "string")
                    b.materials = b.materials.split(",");
                if (b.token === undefined && req.headers["x-farm-token"])
                    b.token = String(req.headers["x-farm-token"]);
                fillRunDefaults(parts[2], b);
                const out = runFarmWithRollback(parts[1], parts[2], b, parts[3] ?? b.id, now);
                return jsonOut(res, out.status, out.json);
            }
            reply(res, false, `这条路走不通：${url.pathname}（GET / 看玩法）`);
        }
        catch (err) {
            if (err instanceof RequestBodyError)
                return jsonOut(res, err.status, { ok: false, error: { code: err.code, message: err.message } });
            if (err instanceof PublicSyncError)
                return jsonOut(res, err.status, { ok: false, error: err.message });
            console.error(err);
            reply(res, false, "农场后台出了点岔子，稍后再试。");
        }
    });
    setInterval(() => { const t = Date.now(); sweepGuard(t); sweepNonces(t); legacyAgent.sweepFlashes(t); }, 60_000).unref(); // 周期清理限流表 + 过期 nonce/flash
    server.once("close", () => {
        stopP3Scheduler();
        stopNatureScheduler();
        stopConstableInterviewScheduler();
        ranchRaidScheduler.stop();
        employmentStopped = true;
        if (employmentTimer)
            clearTimeout(employmentTimer);
        mysteryMerchantStopped = true;
        if (mysteryMerchantTimer)
            clearTimeout(mysteryMerchantTimer);
        reporterEvaluationStopped = true;
        if (reporterEvaluationTimer)
            clearTimeout(reporterEvaluationTimer);
        setWorldCommitCoordinator(null);
        if (clearWorldPersistenceAdapterOnClose)
            setWorldPersistenceAdapter(null);
        if (activeLingyeWorldDatabase === lingyeWorldDatabase)
            activeLingyeWorldDatabase = null;
        if (activeLingyeWorldBackend === lingyeWorldBackend)
            activeLingyeWorldBackend = null;
        if (activeMysteryMerchantRuntime === mysteryMerchantConfig)
            activeMysteryMerchantRuntime = null;
        setDailySpendEconomyDatabase(null);
        if (closeLingyeWorldDatabaseOnClose && lingyeWorldDatabase.isOpen)
            lingyeWorldDatabase.close();
    });
    server.listen(port, host, () => console.log(`[server] 🌾 AI 农场已开门 http://${host}:${port}`));
    return server;
}
//# sourceMappingURL=server.js.map
