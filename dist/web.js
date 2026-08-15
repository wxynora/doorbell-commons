// 人类可见的伴侣看板（HTML，零依赖，服务端渲染）。给人类看自己 AI 伴侣的农场。
// 与给 AI 玩的文字接口完全分开：主页只开放每日 3 次的单块帮收，其他田间动作仍由 AI 完成。
// 绑定方式：/ui/<humanKey> —— 只认低权限观光钥匙；页面内跳转也只继续传这把钥匙，不暴露主 token。
// 视觉基调：暖田园·标本馆（米麻底 + 木质暖褐 + 草木绿），靠稀有度色彩体系与排版质感出彩（零图片）。
//
// 本文件目前是「农场主页/总览」打样页 + 全站共享外壳（外壳定义视觉语言，其余页之后复用）。
import { advance, collectionPct, codexCountByCategory, nextUpgradeReq, refreshShop, shopOffer, refreshRanchShop, animalUpgradeCost, plotRemainMs, ranchRaidCoins, ranchRaidForAnimal, ranchRaidDebtTotal, humanHarvestLeft, RANCH_RAID_DAILY_CAP, ranchAnimalCurrentProduceValue } from "./engine.js";
import { cropById, getCrop, animals, animalById, pets, petById, accessoryById, decorationById, landTierByLevel, totalCropCount, materialById, recipes, expMapById, expDecorById, cooking } from "./content.js";
import { BASE, TICK_MS, HUMAN_HARVEST_DAILY_CAP, RANCH_ANIMAL_MAX_LEVEL, RANCH_LEVEL_INCOME_STEP, RANCH_RAID_COINS_PER_HOUR, RANCH_PATROL_GOOSE_ID, RANCH_PATROL_GOOSE_NAME, RANCH_PATROL_GOOSE_DAILY_CAP, RANCH_FEED_DAILY_CAP, RANCH_FEED_COST_RATE } from "./config.js";
import { currentSeason, activeFestivals, currentDayIndex } from "./time.js";
import { playerFarms } from "./store.js";
import { allUgc } from "./ugc.js";
import { buildLeaderboards } from "./leaderboard.js";
import { dailyScore } from "./daily.js";
import { titles as titleDefs } from "./content.js";
import { checkTitles, equippedTitle } from "./titles.js";
import { glimmerVariantsFor } from "./glimmer.js";
import { qixi2026ShopRows, qixi2026TaskView } from "./qixi-2026.js";
import { RARITY_VAR, STYLE, ago, clock, esc, farmLabel, farmNames, fmtDur, num, page, ranchSprite, rarityDot, stamp } from "./web/shell.js";
export { uiHumanNotices } from "./web/notices.js";
export { uiMessages } from "./web/messages.js";
export { uiGlimmer } from "./web/glimmer.js";
export { uiTogether } from "./web/together.js";
export { uiMarket } from "./web/market.js";
export { uiTa } from "./web/ta.js";
export { uiExpedition } from "./web/expedition.js";
export { uiCodex } from "./web/codex.js";
export { uiCooking } from "./web/cooking.js";
// ——————————————————————————————————————————————————————————————
// 小工具
// ——————————————————————————————————————————————————————————————
/** 已收集的原创(ugc)物种数。 */
const ugcGot = (f) => Object.keys(f.codex).filter((id) => getCrop(id)?.category === "ugc").length;
/** 最近收录的若干条图鉴（codex 键按收集顺序插入，取末尾即最新）。 */
function recentCodex(f, n) {
    return Object.keys(f.codex).slice(-n).reverse()
        .map((id) => getCrop(id)).filter((c) => !!c)
        .map((c) => ({ name: c.name, rarity: c.rarity }));
}
/** 一座农场已收集官方物种数（普通+奇幻+限定）。 */
function codexGot(f) {
    return codexCountByCategory(f, "common") + codexCountByCategory(f, "fantasy") + codexCountByCategory(f, "limited");
}
/** 在全服中按某打分函数排第几（1 起）。 */
function rankOf(farms, me, score) {
    const v = score(me);
    let r = 1;
    for (const o of farms)
        if (score(o) > v)
            r++;
    return r;
}
const RANCH_ASYNC_SCRIPT = `<script>(()=>{
  if(window.__farmRanchAsync)return;window.__farmRanchAsync=true;
  const root=document.getElementById("ranchPage");if(!root)return;
  const showNotice=next=>{const source=next.getElementById("human-notice");if(!source)return;document.getElementById("human-notice")?.remove();const box=document.importNode(source,true);document.body.appendChild(box);const close=()=>box.classList.remove("show");box.addEventListener("click",e=>{if(e.target===box||e.target.closest("[data-close]"))close();});const key=e=>{if(e.key==="Escape"){close();document.removeEventListener("keydown",key);}};document.addEventListener("keydown",key);};
  document.addEventListener("submit",async event=>{
    const form=event.target.closest?.('form[method="post"]');
    if(!form||event.defaultPrevented||(!form.closest("#ranchPage")&&!form.closest("#ranchAnimalModal")))return;
    event.preventDefault();
    if(event.submitter)event.submitter.disabled=true;
    const body=new URLSearchParams();
    for(const [name,value] of new FormData(form))if(typeof value==="string")body.append(name,value);
    if(event.submitter?.name&&!body.has(event.submitter.name))body.append(event.submitter.name,event.submitter.value);
    try{
      const response=await fetch(form.action,{method:"POST",body,credentials:"same-origin"});
      if(!response.ok)throw new Error("request failed");
      const next=new DOMParser().parseFromString(await response.text(),"text/html");
      const source=next.getElementById("ranchPage");if(!source)throw new Error("invalid page");
      const clean=source.cloneNode(true),incomingModal=clean.querySelector("#ranchAnimalModal");
      if(incomingModal)incomingModal.remove();clean.querySelectorAll("script").forEach(script=>script.remove());
      const opened=[...root.querySelectorAll("details")].map(details=>details.open),x=scrollX,y=scrollY;
      root.innerHTML=clean.innerHTML;
      [...root.querySelectorAll("details")].forEach((details,index)=>details.open=opened[index]??details.open);
      window.__farmInitRanchScenes?.(root);window.__farmRanchModal?.refresh();showNotice(next);
      requestAnimationFrame(()=>scrollTo(x,y));
    }catch{location.reload();}
  });
})();</script>`;
const barFill = (pct, color) => `<span style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%;background:${color}"></span>`;
// ——————————————————————————————————————————————————————————————
// 🏡 农场主页 / 总览（打样）
// ——————————————————————————————————————————————————————————————
export function uiHome(f, now, key, flash) {
    advance(f, now);
    checkTitles(f); // 补结算称号解锁（佩戴下拉用最新已解锁列表）
    refreshShop(f, now);
    const tier = landTierByLevel(f.landTier);
    const season = currentSeason(now);
    const got = codexGot(f);
    const pct = collectionPct(f) * 100;
    const days = Math.max(0, Math.floor((now - f.createdAt) / 86400000));
    const farms = playerFarms(); // 排除常驻 NPC 阿土（排名/计数只算真实玩家）
    const qixiView = qixi2026TaskView(f, now);
    const qixiTaskCard = qixiView && !qixiView.allComplete ? `<section class="card" style="border:2px solid #a9bd83;background:linear-gradient(180deg,#fbfff5,#f7f3e7)">
      <div class="line" style="align-items:flex-start;gap:10px"><div><h2 style="margin:0;color:var(--leaf-deep)">🎋 七夕限定任务</h2><p class="small muted" style="margin:4px 0 0">完成一项，解锁对应限定种子。</p></div><span class="tag">${qixiView.tasks.length} 项进行中</span></div>
      <div style="display:grid;gap:8px;margin-top:12px">${qixiView.tasks.map((task) => `<div style="padding:10px 12px;border:1px solid #d5dfc3;border-radius:13px;background:#fffdf7"><div class="line small"><b>${esc(task.label)}</b><span class="muted">${esc(task.progressText)}</span></div><div class="pminibar" style="margin-top:7px">${barFill(task.target ? task.progress / task.target * 100 : 0, "var(--leaf)")}</div><div class="small muted" style="margin-top:5px">解锁：${esc(task.cropName)}</div></div>`).join("")}</div>
    </section>` : "";
    for (const farm of farms)
        advance(farm, now); // 广播读取此刻真实成熟状态，不写历史
    const ripeFarms = farms.map((farm, index) => ({
        farm,
        number: index + 1,
        ripe: farm.plots.filter((p) => p.crop?.ripe).length,
    })).filter((entry) => entry.ripe > 0);
    const ripeBroadcast = `<div class="card"><h3>📣 此刻谁家菜熟了　<span class="muted small" style="font-weight:400">打开就是当前状态</span></h3>
    ${ripeFarms.length
        ? ripeFarms.map((entry) => `<div class="line small"><span><b>${entry.number}. ${esc(farmLabel(entry.farm))}</b></span><span class="ready">${entry.ripe} 块待收</span></div>`).join("")
        : `<p class="small muted" style="margin:6px 0 0">现在大家都收得干干净净，没有成熟未收的菜。</p>`}</div>`;
    // 收集册大圆环
    const R = 78, C = 2 * Math.PI * R, off = C * (1 - Math.min(1, pct / 100));
    const ring = `<div class="ring">
    <svg width="172" height="172" viewBox="0 0 172 172">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#6f9c5a"/><stop offset="1" stop-color="#c98a2b"/></linearGradient></defs>
      <circle class="track" cx="86" cy="86" r="${R}"/>
      <circle class="val" cx="86" cy="86" r="${R}" style="--circ:${C.toFixed(1)};--off:${off.toFixed(1)}"/>
    </svg>
    <div class="center"><div class="pct">${pct.toFixed(0)}<span style="font-size:18px">%</span></div><div class="cap">收 集 册</div></div>
  </div>`;
    // 图鉴：分类数字（替代占地的进度条）+ 一行「新收录」最近 3 条
    const cc = codexCountByCategory(f, "common"), fc = codexCountByCategory(f, "fantasy"), lc = codexCountByCategory(f, "limited"), oc = ugcGot(f);
    const recent = recentCodex(f, 3);
    const recentHtml = recent.length
        ? `<div class="recent"><span class="muted small">📖 新收录</span>${recent.map((x) => `<span class="rc">${esc(x.name)} ${rarityDot(x.rarity)}</span>`).join("")}</div>`
        : `<div class="recent"><span class="muted small">📖 还没有收录——种下种子，收获揭晓第一种作物</span></div>`;
    const up = nextUpgradeReq(f);
    const upText = up
        ? `升「${esc(up.next.name)}」需 💰${num(up.req.coins)} + 普通图鉴 ${up.req.commonCodex} 种`
        : "已满级 · 向集齐全图鉴冲刺";
    const hero = `<div class="card"><div class="hero">${ring}
    <div class="herometa">
      <div class="bignums">
        <div><div class="b">💰 ${num(f.coins)}</div><div class="l">金币</div></div>
        <div><div class="b">🪙 ${num(f.silver)}</div><div class="l">银币</div></div>
        <div><div class="b">📖 ${got}/${totalCropCount}</div><div class="l">已集物种</div></div>
      </div>
      <div class="catnums"><span>🌾 普通<b>${cc}</b></span><span>✨ 奇幻<b>${fc}</b></span><span>🎏 限定<b>${lc}</b></span><span>🎨 原创<b>${oc}</b></span></div>
      ${recentHtml}
      <p class="small muted" style="margin:10px 0 0">🎯 ${upText}</p>
    </div></div></div>`;
    // 他的田 mini
    const harvestLeft = humanHarvestLeft(f, now);
    const plots = f.plots.map((p) => {
        if (!p.crop)
            return `<div class="plot empty"><span class="ico">🟫</span><span class="small">空地</span></div>`;
        const c = p.crop;
        const ico = c.ripe ? "🥕" : c.seedType === "fantasy" ? "✨" : c.seedType === "limited" ? "🎏" : "🌱";
        const gp = c.ripe ? 100 : Math.min(99, (c.progress / Math.max(1, c.growTicks)) * 100);
        const lbl = c.ripe ? "已熟" : `${Math.floor(gp)}%`;
        // 预计成熟时间：给还在长的地算剩余到点的时刻（UTC+8 时钟）+ 大致还需多久
        const remain = c.ripe ? 0 : plotRemainMs(p, f, now);
        const eta = c.ripe
            ? `<span class="small" style="color:var(--SSR)">🥕 可收获</span>`
            : `<span class="small muted" title="${fmtDur(remain)}后成熟">🕒 ${clock(now + remain)}熟</span>`;
        return `<div class="plot ${c.ripe ? "ripe" : ""}"><span class="ico">${ico}</span>
      <span class="small muted">${lbl} · 💧${c.waterCount}</span>
      <div class="pminibar">${barFill(gp, c.ripe ? "var(--SSR)" : "var(--leaf)")}</div>
      ${eta}</div>`;
    }).join("");
    const ripeN = f.plots.filter((p) => p.crop?.ripe).length;
    const growN = f.plots.filter((p) => p.crop && !p.crop.ripe).length;
    const harvestLabel = harvestLeft <= 0 ? "今日次数已用完" : ripeN <= 0 ? "暂无成熟作物" : `🌾 一键帮TA收（${ripeN}株）`;
    const field = `<div class="card">
    <div class="field-head"><h3>🌱 他的田　<span class="muted small" style="font-weight:400">在种 ${growN} · 成熟 ${ripeN} · 今日可一键帮收 ${harvestLeft}/${HUMAN_HARVEST_DAILY_CAP} 次（00:00 刷新）</span></h3>
    <form method="post" action="${BASE}/ui/${key}/harvest"><button class="btn ghost" type="submit"${harvestLeft > 0 && ripeN > 0 ? "" : " disabled"}>${harvestLabel}</button></form></div>
    <div class="plots" style="margin-top:10px">${plots}</div></div>`;
    // 此刻 · 季节
    const seasonCrops = (season.topCrops ?? []).map((id) => cropById.get(id)?.name ?? id).filter(Boolean).slice(0, 4);
    const fests = activeFestivals(now);
    const seasonCard = `<div class="card"><h3>🍃 此刻 · ${esc(season.name)}</h3>
    <p class="small muted" style="margin:0 0 8px">${esc(season.desc)}</p>
    ${seasonCrops.length ? `<p class="small">应季：${seasonCrops.map((n) => `<span class="pill">${esc(n)}</span>`).join(" ")}</p>` : ""}
    ${fests.length ? `<p class="small">🎏 节日进行中：${fests.map((x) => `<b>${esc(x.name)}</b>`).join("、")}</p>` : ""}</div>`;
    // 今日商店（小克这座店此刻随机刷出的）
    const s = shopOffer(f, now);
    const qixiShop = qixi2026ShopRows(f, now);
    const shopBits = [];
    if (f.shop.potionSet)
        shopBits.push(`🎁 药水套装（${f.shop.potionSet.qty} 瓶 / ${f.shop.potionSet.price} 金）`);
    if (f.shop.recipe)
        shopBits.push(`📜 配方【${esc(cropById.get(f.shop.recipe)?.name ?? f.shop.recipe)}】`);
    if (s.limited?.length)
        shopBits.push(`🎏 限定：${s.limited.map((l) => esc(l.name)).join("、")}`);
    for (const item of qixiShop)
        shopBits.push(`🎋 ${esc(item.name)} · ${num(item.price)} 金 · 今日还可买 ${item.left}/5`);
    const shopCard = `<div class="card"><h3>🏪 今日商店</h3>
    ${shopBits.length
        ? shopBits.map((b) => `<div class="line small"><span>${b}</span></div>`).join("")
        : `<p class="small muted" style="margin:6px 0 0">寻常的种子铺：普通 ${s.common.price} 金 · 奇幻 ${s.fantasy.price} 金常备，配方与药水套装看缘分刷新。</p>`}</div>`;
    // 他在榜上
    const rCodex = rankOf(farms, f, codexGot);
    const rCoins = rankOf(farms, f, (x) => x.coins + (x.ranch?.coins ?? 0));
    const rTier = rankOf(farms, f, (x) => x.landTier);
    const rankCard = `<div class="card"><div class="line"><h3 style="margin:0">🏆 他在榜上</h3>
      <a class="cta" href="${BASE}/ui/${key}/leaderboard">看全服排行 →</a></div>
    <div class="grid c2b" style="gap:8px;margin-top:6px;grid-template-columns:1fr 1fr 1fr">
      <div><span class="rank-big">#${rCodex}</span><div class="small muted">图鉴榜</div></div>
      <div><span class="rank-big">#${rCoins}</span><div class="small muted">财富榜</div></div>
      <div><span class="rank-big">#${rTier}</span><div class="small muted">土地榜</div></div>
    </div><p class="small muted" style="margin:8px 0 0">全服共 ${farms.length} 座农场</p></div>`;
    // 最近留言
    const lastMsg = (f.guestbook !== false && (f.messages ?? []).length)
        ? (() => { const m = f.messages[f.messages.length - 1]; return `<b>${esc(m.name)}</b>${m.by ? ` <span class="muted">🏠${esc(m.by)}</span>` : ""}：${esc(m.text)}`; })()
        : `<span class="muted">还没有访客留言</span>`;
    const msgCard = `<div class="card"><h3>💬 最近留言</h3>
    <p class="small" style="margin:4px 0 0">${lastMsg}</p></div>`;
    // 👣 足迹：别人来串门帮浇水 / 偷菜 / 被看家狗吓退的历史（最新在前）
    const trail = (f.trail ?? []).slice(0, 12);
    const trailRow = (e) => {
        const who = `<b>${esc(e.by || "有人")}</b>`;
        const plot = e.plotId != null ? ` ${e.plotId} 号地` : "";
        const text = e.kind === "watered" ? `💧 ${who} 帮${plot}浇了水`
            : e.kind === "stolen" ? `🥷 ${who} 偷走了${plot}的${e.crop ? esc(e.crop) : "作物"}`
                : `🐶 ${who} 来偷${plot}，被看家狗吓退了`;
        return `<div class="line small" style="align-items:baseline">
      <span>${text}</span>
      <span class="muted" title="${stamp(e.t)}" style="white-space:nowrap;margin-left:8px">${ago(e.t, now)}</span></div>`;
    };
    const trailCard = `<div class="card"><h3>👣 足迹　<span class="muted small" style="font-weight:400">谁来串过门</span></h3>
    ${trail.length
        ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:5px">${trail.map(trailRow).join("")}</div>`
        : `<p class="small muted" style="margin:6px 0 0">还没有访客来帮浇水或偷菜——门前静悄悄的。</p>`}</div>`;
    // 🎖️ 佩戴称号：放在主页最上方、农场名旁边。只列【已解锁】的，下拉选择；没解锁任何称号则不显示。
    const selectedTitle = equippedTitle(f);
    const titleEquip = (() => {
        const owned = titleDefs.filter((t) => (f.titles ?? []).includes(t.id));
        if (!owned.length)
            return "";
        const eqId = selectedTitle?.id ?? "";
        const opts = `<option value=""${eqId ? "" : " selected"}>不佩戴称号</option>`
            + owned.map((t) => `<option value="${esc(t.id)}"${eqId === t.id ? " selected" : ""}>【${esc(t.name)}】</option>`).join("");
        return `<form method="post" action="${BASE}/ui/${key}/title" style="margin:6px 0 2px;display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap">
      <span class="small muted">🎖️ 称号</span>
      <select name="id" class="inp" style="width:auto" onchange="this.form.submit()">${opts}</select>
      <button class="btn ghost" type="submit">佩戴</button>
    </form>`;
    })();
    const titleBadge = selectedTitle ? `<span style="font-size:.55em;color:${esc(selectedTitle.color ?? "var(--wood)")};margin-right:7px;white-space:nowrap">✧${esc(selectedTitle.name)}✧</span>` : "";
    const welcome = f.welcome?.trim() || `这里是「${f.name}」，随便逛~`;
    const plaque = `<div class="plaque">
    <h1>${titleBadge}🌾 ${esc(f.name)}</h1>
    ${titleEquip}
    <p class="welcome">“${esc(welcome)}”</p>
    <div class="tags"><span class="tag">🏞️ <b>${esc(tier.name)}</b> · ${f.plots.length} 地</span>
      <span class="tag">🍃 <b>${esc(season.name)}</b></span>
      <span class="tag">📖 已集 <b>${got}</b> 种</span>
      <span class="tag">🌱 开张 <b>${days}</b> 天</span></div></div>`;
    const flashHtml = flash ? `<div class="flash">${esc(flash)}</div>` : "";
    const body = `${plaque}${flashHtml}
${qixiTaskCard}
${ripeBroadcast}
${hero}
${field}
<div class="grid c2">${seasonCard}${shopCard}</div>
<div class="grid c2">${rankCard}${msgCard}</div>
${trailCard}`;
    return page(`${f.name} · 田园标本馆`, key, "", body, farmNames(f));
}
// ——————————————————————————————————————————————————————————————
// 🐮 我的牧场（人机互动 2.0：人在这里养 AI 买给自己的动物、收产品换钱、决定回传多少）
//   这是 /ui 里唯一「能写」的页：收获 / 回传走 POST，做完 303 跳回本页（PRG）。
//   AI 那边看不到这页内容，只在文字接口的 ledger 看到金币往来 + 药水入库。
// ——————————————————————————————————————————————————————————————
export function uiRanch(f, now, key, flash) {
    advance(f, now);
    refreshRanchShop(f, now); // 让今日的牧场商店（随机刷新的配饰/装饰）保持最新
    const ranch = f.ranch;
    const list = ranch?.animals ?? [];
    const petList = ranch?.pets ?? [];
    const patrolGoose = ranch?.patrolGoose;
    const residentCount = list.length + petList.length + (patrolGoose ? 1 : 0);
    const base = `${BASE}/ui/${key}/ranch`;
    const flashHtml = flash ? `<div class="flash">${esc(flash)}</div>` : "";
    const pinnedSet = new Set(f.ranch?.pinned ?? []);
    // 📌 pin 开关：被 pin 的动物/宠物才会随机出现在小克农场的氛围句里（都没 pin=全部随机）
    const pinBtn = (kindId) => {
        const on = pinnedSet.has(kindId);
        return `<form method="post" action="${base}/pin" style="margin:0"><input type="hidden" name="kind" value="${esc(kindId)}">
      <button class="btn ghost" type="submit" title="${on ? "取消 pin" : "pin 到农场"}">${on ? "📌 已选" : "📍 pin"}</button></form>`;
    };
    const variantForm = (type, kindId, entity, baseName) => {
        const choices = glimmerVariantsFor(f, kindId, type);
        if (!choices.length)
            return "";
        const options = [`<option value="base"${entity?.variantId ? "" : " selected"}>原始外观</option>`, ...choices.map((item) => `<option value="${item.id}"${entity?.variantId === item.id ? " selected" : ""}>${esc(item.name)}</option>`)].join("");
        return `<form method="post" action="${base}/variant" style="display:flex;gap:6px;margin:0"><input type="hidden" name="type" value="${type}"><input type="hidden" name="kind" value="${kindId}"><select class="inp" name="variant" aria-label="${esc(baseName)}外观" style="width:auto">${options}</select><button class="btn ghost" type="submit">换外观</button></form>`;
    };
    let pendingGross = 0; // 与 engine.ranchCollect 的毛收入口径一致：逐只按等级系数算、逐只取整
    for (const a of list) {
        const k = animalById.get(a.kindId);
        if (k) {
            const value = ranchAnimalCurrentProduceValue(a, now);
            const pending = Math.max(0, Math.floor(Number(a.pending) || 0));
            pendingGross += pending * value + (pending > 0 && a.pendingBoost ? Math.round(value * 1.1) - value : 0);
            pendingGross += (a.pendingMeat ?? 0) * Math.round(value * cooking.meatValueMultiplier);
        }
    }
    const pendingValue = pendingGross;
    const coins = ranch?.coins ?? 0;
    const ai = esc(f.aiName || "小克"); // AI 昵称（注册时定，回落"小克"）
    const human = esc(f.humanName || "你"); // 人类昵称（注册时定，回落"你"）
    const fmtTime = (ms) => new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const numbered = playerFarms().map((farm, index) => ({ farm, number: index + 1 }));
    const numberById = new Map(numbered.map((entry) => [entry.farm.id, entry.number]));
    const labelById = new Map(numbered.map((entry) => [entry.farm.id, farmLabel(entry.farm)]));
    const today = currentDayIndex(now);
    const feedUsed = ranch?.feedDaily?.day === today ? ranch.feedDaily.n ?? 0 : 0;
    const todayRaidIncome = ranch?.raidIncome?.day === today ? ranch.raidIncome.n : 0;
    const raidCapReached = todayRaidIncome >= RANCH_RAID_DAILY_CAP;
    const targets = numbered.filter((entry) => entry.farm.id !== f.id);
    const targetOptions = targets.map((entry) => `<option value="${entry.number}">${entry.number}. ${esc(farmLabel(entry.farm))}</option>`).join("");
    const incoming = numbered.flatMap(({ farm: owner }) => (owner.ranch?.raids ?? [])
        .filter((raid) => raid.targetFarmId === f.id && raid.endsAt > now)
        .map((raid) => ({ owner, raid })));
    const dispatchedAnimalKinds = new Set((ranch?.raids ?? [])
        .filter((raid) => raid.endsAt > now)
        .map((raid) => raid.animalKindId));
    const sceneAnimals = list.filter((entry) => !dispatchedAnimalKinds.has(entry.kindId));
    const sceneResidentCount = sceneAnimals.length + petList.length + (patrolGoose ? 1 : 0);
    const plaque = `<div class="plaque">
    <h1>🐮 我的牧场</h1>
    <p class="welcome">“${ai}送来的动物，归你养。攒下的产出换成金币，要不要分 TA 一点，你说了算～”</p>
    <div class="tags"><span class="tag">💰 牧场金币 <b>${num(coins)}</b></span>
      <span class="tag">🐾 牧场居民 <b>${residentCount}</b> 位</span>
      <span class="tag">📦 可收产出值 <b>${num(pendingValue)}</b> 金</span>${ranchRaidDebtTotal(f) ? `<span class="tag">⚠️ 待还欠款 <b>${num(ranchRaidDebtTotal(f))}</b> 金</span>` : ""}</div></div>${flashHtml}`;
    const officialGot = codexGot(f);
    const ownedAnimalIds = new Set(list.map((entry) => entry.kindId));
    const ownedPetIds = new Set(petList.map((entry) => entry.kindId));
    const sprite = ranchSprite;
    const animalSpriteIndex = new Map(animals.map((kind, index) => [kind.id, index]));
    const petSpriteIndex = new Map(pets.map((kind, index) => [kind.id, animals.length + index]));
    const sceneScale = {
        chicken: .66, duck: .7, quail: .46, rabbit: .6, goose: .88,
        sheep: .94, goat: .86, cow: 1.16, bee: .48, turkey: .88, pig: .9, alpaca: .98,
        silk_moth: .52, ember_hen: .7, cloud_sheep: .96, dream_cat: .76,
        cat: .64, dog: .74,
    };
    const sceneResidents = [
        ...sceneAnimals.map((entry) => ({
            spriteIndex: animalSpriteIndex.get(entry.kindId),
            name: entry.name || animalById.get(entry.kindId)?.name || entry.kindId,
            scale: sceneScale[entry.kindId] ?? 1,
            variantId: entry.variantId,
        })),
        ...petList.map((entry) => ({
            spriteIndex: petSpriteIndex.get(entry.kindId),
            name: entry.name || petById.get(entry.kindId)?.name || entry.kindId,
            scale: sceneScale[entry.kindId] ?? 1,
            variantId: entry.variantId,
        })),
        ...(patrolGoose ? [{ spriteIndex: animals.length + pets.length, name: patrolGoose.name || RANCH_PATROL_GOOSE_NAME, scale: .88, variantId: patrolGoose.variantId }] : []),
        ...incoming.map(({ owner, raid }, incomingIndex) => {
            const animal = owner.ranch?.animals.find((entry) => entry.kindId === raid.animalKindId);
            const kind = animalById.get(raid.animalKindId);
            return {
                spriteIndex: animalSpriteIndex.get(raid.animalKindId),
                name: animal?.name || kind?.name || raid.animalKindId,
                scale: sceneScale[raid.animalKindId] ?? 1,
                visitor: true,
                panelId: `visitor-${incomingIndex}`,
                variantId: animal?.variantId,
            };
        }),
    ].filter((entry) => Number.isInteger(entry.spriteIndex));
    const sceneVisitorCount = sceneResidents.filter((entry) => entry.visitor).length;
    const sceneSpots = [];
    for (let index = 0; index < sceneResidents.length; index++) {
        let spot;
        for (let attempt = 0; attempt < 120; attempt++) {
            const candidate = [10 + Math.random() * 72, 42 + Math.random() * 42];
            const clear = sceneSpots.every(([x, y]) => Math.hypot((candidate[0] - x) * .8, (candidate[1] - y) * 1.25) >= 11);
            if (clear) {
                spot = candidate;
                break;
            }
        }
        sceneSpots.push(spot ?? [10 + (index * 23) % 68, 42 + (index * 17) % 40]);
    }
    const sceneResidentHtml = sceneResidents.map((entry, index) => {
        const [x, y] = sceneSpots[index % sceneSpots.length];
        const delay = -(index * .17);
        const tag = entry.visitor ? "button" : "span";
        const visitorAttrs = entry.visitor
            ? ` type="button" class="ranch-anchor ranch-visitor" data-visitor="true" data-ranch-animal="${entry.panelId}" aria-haspopup="dialog" aria-controls="ranchAnimalModal" aria-label="查看移动中的${esc(entry.name)}"`
            : ` class="ranch-anchor" title="${esc(entry.name)}"`;
        return `<${tag}${visitorAttrs} data-roamer data-x="${x.toFixed(2)}" data-y="${y.toFixed(2)}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;z-index:${Math.round(y)};--delay:${delay}s;--scale:${entry.scale}">
        <span class="ranch-resident"><span class="ranch-scale"><span class="ranch-face">${sprite(entry.spriteIndex, entry.name, "ranch-scene-sprite", entry.variantId)}</span></span></span>
      </${tag}>`;
    }).join("");
    const ranchSceneCard = `<section class="card ranch-scene-card" aria-label="牧场动态场景"><div class="ranch-scene">
      <div class="ranch-scene-title">🌿 牧场里 · ${sceneResidentCount} 位居民${sceneVisitorCount ? ` · ${sceneVisitorCount} 位来客` : ""}</div>
      ${sceneResidentHtml || (!residentCount ? `<div class="ranch-scene-empty">等 ${ai} 送来动物，这片草地就会热闹起来。</div>` : "")}
    </div></section><script>(()=>{
      if(!window.__farmInitRanchScenes)window.__farmInitRanchScenes=(root=document)=>{
        if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
        const random=(min,max)=>min+Math.random()*(max-min);
        for(const scene of root.querySelectorAll(".ranch-scene")){
          if(scene.dataset.roamReady)return;scene.dataset.roamReady="true";
          for(const anchor of scene.querySelectorAll("[data-roamer]")){
            let x=Number(anchor.dataset.x),y=Number(anchor.dataset.y);const homeX=x,homeY=y,face=anchor.querySelector(".ranch-face");
            const move=()=>{let nx,ny;do{nx=Math.max(10,Math.min(82,random(homeX-9,homeX+9)));ny=Math.max(42,Math.min(84,random(homeY-7,homeY+7)));}while(Math.hypot(nx-x,ny-y)<4);
              if(face)face.style.transform=nx>=x?"scaleX(-1)":"scaleX(1)";const px=Math.hypot((nx-x)*scene.clientWidth/100,(ny-y)*scene.clientHeight/100);
              const motion=anchor.animate([{left:String(x)+"%",top:String(y)+"%"},{left:String(nx)+"%",top:String(ny)+"%"}],{duration:Math.max(2800,px*random(48,70)),easing:"ease-in-out",fill:"forwards"});
              motion.onfinish=()=>{x=nx;y=ny;anchor.style.left=String(x)+"%";anchor.style.top=String(y)+"%";anchor.style.zIndex=String(Math.round(y));motion.cancel();window.setTimeout(move,random(350,1600));};};
            window.setTimeout(move,random(120,1300));
          }
        }
      };window.__farmInitRanchScenes(document);
    })();</script>`;
    const animalCodexRows = animals.map((kind, index) => {
        const owned = list.find((entry) => entry.kindId === kind.id);
        const unlocked = officialGot >= kind.unlockCodex;
        const level = owned?.level ?? 1;
        const currentPrice = owned ? ranchAnimalCurrentProduceValue(owned, now) : kind.producePrice;
        const state = owned
            ? `<span class="ranch-codex-state owned">已入住 · Lv.${level}</span>`
            : unlocked
                ? `<span class="ranch-codex-state open">已解锁</span>`
                : `<span class="ranch-codex-state">未解锁</span>`;
        return `<article class="ranch-codex-item${unlocked ? "" : " locked"}">
        ${sprite(index, kind.name, "", owned?.variantId)}
        <div class="ranch-codex-name"><span>${esc(kind.name)}</span>${state}</div>
        <div class="ranch-codex-meta"><b>${esc(kind.produce)}</b> · ${num(currentPrice)} 金/份<br>${fmtDur(kind.produceEveryTicks * TICK_MS)}一份 · 入手 ${num(kind.buyCost)} 金<br>${unlocked ? esc(kind.category) : `🔒 ${esc(kind.unlockCond)}`}</div>
      </article>`;
    }).join("");
    const petCodexRows = pets.map((kind, index) => {
        const owned = ownedPetIds.has(kind.id);
        const unlocked = officialGot >= kind.unlockCodex;
        const state = owned
            ? `<span class="ranch-codex-state owned">已入住</span>`
            : unlocked
                ? `<span class="ranch-codex-state open">已解锁</span>`
                : `<span class="ranch-codex-state">未解锁</span>`;
        return `<article class="ranch-codex-item${unlocked ? "" : " locked"}">
        ${sprite(animals.length + index, kind.name, "", petList.find((entry) => entry.kindId === kind.id)?.variantId)}
        <div class="ranch-codex-name"><span>${esc(kind.name)}</span>${state}</div>
        <div class="ranch-codex-meta"><b>${esc(kind.tag)}</b><br>入手 ${num(kind.buyCost)} 金 · ${unlocked ? "普通宠物" : `🔒 ${esc(kind.unlockCond)}`}</div>
        <div class="ranch-codex-effect">${esc(kind.buffText)}</div>
      </article>`;
    }).join("");
    const codexCard = `<details class="card ranch-codex"><summary><span>🐾 牧场动物图鉴</span>
      <span class="tag">已入住 <b>${ownedAnimalIds.size + ownedPetIds.size}/${animals.length + pets.length}</b></span></summary>
      <div class="ranch-codex-body"><p class="small muted" style="margin:8px 0 0">生产动物和普通宠物会随 ${ai} 的作物图鉴进度解锁；巡逻鹅是独立常驻守卫，不计入这里。</p>
      <div class="ranch-codex-section"><div class="ranch-codex-subtitle">🥚 生产动物 <span class="small muted">${ownedAnimalIds.size}/${animals.length}</span></div><div class="ranch-codex-grid">${animalCodexRows}</div></div>
      <div class="ranch-codex-section"><div class="ranch-codex-subtitle">🐾 普通宠物 <span class="small muted">${ownedPetIds.size}/${pets.length}</span></div><div class="ranch-codex-grid">${petCodexRows}</div></div></div>
    </details>`;
    // 动物清单（逐只列，显示穿戴与产出）+ 一键收获
    let animalsCard;
    if (!residentCount && !incoming.length) {
        animalsCard = `<div class="card"><h3>🐾 牧场空荡荡</h3>
      <p class="small muted" style="margin:0 0 6px">还没有动物——让 <b>${ai}</b>（AI）在它的商店里 <code>buy-animal</code> 买一只送进来，你就能开始养了。</p>
      <p class="small muted" style="margin:0">${ai}的图鉴集得越多，能解锁、能买给你的动物越多。</p></div>`;
    }
    else {
        const animalPanels = list.map((a, i) => {
            const k = animalById.get(a.kindId);
            const nm = a.name || k?.name || a.kindId;
            const lvl = a.level ?? 1;
            const effPrice = k ? ranchAnimalCurrentProduceValue(a, now) : 0;
            const wearing = (a.acc ?? []).map((id) => accessoryById.get(id)?.name).filter(Boolean);
            const worn = wearing.length
                ? `<div class="small" style="color:var(--leaf-deep);margin-top:2px">👒 穿戴：${wearing.map(esc).join("、")}</div>`
                : `<div class="small muted" style="margin-top:2px">还没打扮</div>`;
            const raid = ranchRaidForAnimal(f, a.kindId);
            const raidLine = raid
                ? `<div class="small" style="color:var(--gold);margin-top:4px">🥷 正在 ${numberById.get(raid.targetFarmId) ?? "?"} 号「${esc(labelById.get(raid.targetFarmId) ?? "未知农场")}」潜伏 · ${fmtDur(Math.max(0, raid.endsAt - now))}后回来 · 已冻结 ${raid.reservedCoins} 金</div>`
                : "";
            // 升级按钮：每级提高每份收入（不增份数），封顶后显示满级
            const upBtn = !k ? "" : (lvl >= RANCH_ANIMAL_MAX_LEVEL)
                ? `<span class="small muted">已满级 Lv.${lvl}</span>`
                : (() => {
                    const cost = animalUpgradeCost(k, lvl);
                    const can = coins >= cost;
                    return `<form method="post" action="${base}/upgrade" style="margin:0"><input type="hidden" name="animal" value="${i}">
              <button class="btn ghost" type="submit"${can ? "" : " disabled"}>⬆ 升 Lv.${lvl + 1}（${cost}金）</button></form>`;
                })();
            const feedCost = Math.max(1, Math.round(effPrice * RANCH_FEED_COST_RATE));
            const canFeed = !raid && (a.pending ?? 0) <= 0 && (a.pendingMeat ?? 0) <= 0 && !a.feedBoostPending && feedUsed < RANCH_FEED_DAILY_CAP && f.silver >= feedCost;
            const feedLabel = a.feedBoostPending ? "🥣 下份 +10% 已登记" : `🥣 投喂（🪙${feedCost}）`;
            const feedBtn = `<form method="post" action="${base}/feed" style="margin:0"><input type="hidden" name="animal" value="${i}"><button class="btn ghost" type="submit"${canFeed ? "" : " disabled"}>${feedLabel}</button></form>`;
            const nameForm = `<form method="post" action="${base}/name-animal" style="display:flex;gap:6px;margin:0">
        <input type="hidden" name="animal" value="${i}">
        <input class="inp" type="text" name="name" maxlength="12" value="${esc(a.name ?? "")}" placeholder="给它起个名字" style="width:auto">
        <button class="btn ghost" type="submit">🏷️ 改名</button></form>`;
            const dispatchForm = raid ? "" : raidCapReached
                ? `<div class="small muted" style="margin-top:6px">今天偷金币已达 ${RANCH_RAID_DAILY_CAP} 金上限，不能再派遣。</div>`
                : targets.length
                ? `<form class="raid-form" method="post" action="${base}/dispatch-raid">
            <input type="hidden" name="animal" value="${i}">
            <label class="small">去 <select class="inp" name="to" required>${targetOptions}</select></label>
            <label class="small">潜伏 <input class="inp raid-hours" type="number" name="hours" min="1" step="1" required> 小时</label>
            <button class="btn" type="submit">派遣</button>
            <span class="small muted">${RANCH_RAID_COINS_PER_HOUR} 金/小时，出发先冻结同额保证金</span>
          </form>`
                : `<div class="small muted" style="margin-top:6px">暂时没有其他玩家农场可以派遣。</div>`;
            const spriteIndex = animalSpriteIndex.get(a.kindId);
            const animalIcon = Number.isInteger(spriteIndex) ? sprite(spriteIndex, nm, "", a.variantId) : `<span role="img" aria-label="${esc(nm)}">${k?.emoji ?? "🐾"}</span>`;
            const intro = k
                ? `${esc(k.category)}动物 · 每${fmtDur(k.produceEveryTicks * TICK_MS)}产一份「${esc(k.produce)}」，当前每份折算 ${num(effPrice)} 金。`
                : "";
            const tile = `<button type="button" class="ranch-owned-tile" data-ranch-animal="animal-${i}" aria-haspopup="dialog" aria-controls="ranchAnimalModal">
        ${animalIcon}<span class="ranch-owned-name">${esc(nm)}</span><span class="ranch-owned-level">Lv.${lvl}</span></button>`;
            const detail = `<template id="ranch-animal-template-animal-${i}"><div class="ranch-animal-detail">
        <div class="ranch-animal-head">${animalIcon}<div><h2>${esc(nm)} · Lv.${lvl} · ${a.pending > 0 ? `1份可收${a.pendingMeat ? " + 额外肉" : ""}${a.pendingBoost ? " · +10%" : ""}` : "生产中"}</h2><p class="ranch-animal-intro">${intro}</p></div></div>
        <div class="ranch-animal-status">${worn}${raidLine}<div class="small muted" style="margin-top:3px">银币投喂每天 ${RANCH_FEED_DAILY_CAP} 次，今日已用 ${feedUsed}/${RANCH_FEED_DAILY_CAP}；只提高下一份正常产物，不影响派遣或巡逻鹅。</div></div>
        <div class="ranch-animal-actions">${pinBtn(a.kindId)}${upBtn}${feedBtn}${nameForm}${variantForm("animal", a.kindId, a, k?.name ?? nm)}</div>
        ${raid ? "" : `<div class="ranch-animal-dispatch">${dispatchForm}</div>`}
      </div></template>`;
            return { tile, detail };
        });
        const petPanels = petList.map((p, i) => {
            const k = petById.get(p.kindId);
            const nm = p.name || k?.name || p.kindId;
            const wearing = (p.acc ?? []).map((id) => accessoryById.get(id)?.name).filter(Boolean);
            const worn = wearing.length
                ? `<div class="small" style="color:var(--leaf-deep);margin-top:2px">👒 穿戴：${wearing.map(esc).join("、")}</div>`
                : `<div class="small muted" style="margin-top:2px">还没打扮</div>`;
            const nameForm = `<form method="post" action="${base}/name-pet" style="display:flex;gap:6px;margin:0">
        <input type="hidden" name="pet" value="${i}">
        <input class="inp" type="text" name="name" maxlength="12" value="${esc(p.name ?? "")}" placeholder="给它起个名字" style="width:auto">
        <button class="btn ghost" type="submit">🏷️ 改名</button></form>`;
            const spriteIndex = petSpriteIndex.get(p.kindId);
            const petIcon = Number.isInteger(spriteIndex) ? sprite(spriteIndex, nm, "", p.variantId) : `<span role="img" aria-label="${esc(nm)}">${k?.emoji ?? "🐾"}</span>`;
            const tile = `<button type="button" class="ranch-owned-tile" data-ranch-animal="pet-${i}" aria-haspopup="dialog" aria-controls="ranchAnimalModal">
        ${petIcon}<span class="ranch-owned-name">${esc(nm)}</span><span class="ranch-owned-level">宠物</span></button>`;
            const detail = `<template id="ranch-animal-template-pet-${i}"><div class="ranch-animal-detail">
        <div class="ranch-animal-head">${petIcon}<div><h2>${esc(nm)} · 宠物</h2><p class="ranch-animal-intro">${k ? esc(k.tag) : "普通宠物"}</p></div></div>
        <div class="ranch-animal-status">${k ? `<div class="small muted">✨ ${esc(k.buffText)}</div>` : ""}${worn}</div>
        <div class="ranch-animal-actions">${pinBtn(p.kindId)}${nameForm}${variantForm("pet", p.kindId, p, k?.name ?? nm)}</div>
      </div></template>`;
            return { tile, detail };
        });
        const goosePanels = patrolGoose ? (() => {
            const gooseName = patrolGoose.name || RANCH_PATROL_GOOSE_NAME;
            const wearing = (patrolGoose.acc ?? []).map((id) => accessoryById.get(id)?.name).filter(Boolean);
            const worn = wearing.length
                ? `<div class="small" style="color:var(--leaf-deep);margin-top:2px">👒 穿戴：${wearing.map(esc).join("、")}</div>`
                : `<div class="small muted" style="margin-top:2px">还没打扮</div>`;
            const catches = ranch?.patrolGooseCatches?.day === today ? ranch.patrolGooseCatches.n : 0;
            const nameForm = `<form method="post" action="${base}/name-goose" style="display:flex;gap:6px;margin:0">
        <input class="inp" type="text" name="name" maxlength="12" value="${esc(patrolGoose.name ?? "")}" placeholder="给它起个名字" style="width:auto">
        <button class="btn ghost" type="submit">🏷️ 改名</button></form>`;
            const gooseIcon = sprite(animals.length + pets.length, gooseName, "", patrolGoose.variantId);
            const tile = `<button type="button" class="ranch-owned-tile" data-ranch-animal="goose" aria-haspopup="dialog" aria-controls="ranchAnimalModal">
        ${gooseIcon}<span class="ranch-owned-name">${esc(gooseName)}</span><span class="ranch-owned-level">常驻守卫</span></button>`;
            const detail = `<template id="ranch-animal-template-goose"><div class="ranch-animal-detail">
        <div class="ranch-animal-head">${gooseIcon}<div><h2>${esc(gooseName)} · 巡逻鹅</h2><p class="ranch-animal-intro">独立常驻牧场守卫</p></div></div>
        <div class="ranch-animal-status"><div class="small muted">今日已成功赶走 ${num(catches)}/${RANCH_PATROL_GOOSE_DAILY_CAP} 次</div>
        <div class="small muted" style="margin-top:3px">未被你提前抓住的偷金币动物结束潜伏时，有 25% 概率被巡逻鹅赶走；每天最多成功 3 次。成功时对方保证金全额退回且不受罚，系统按该动物当前一次完整产出价值的 50% 额外奖励你。</div>${worn}</div>
        <div class="ranch-animal-actions">${pinBtn(RANCH_PATROL_GOOSE_ID)}${nameForm}${variantForm("goose", "patrol_goose", patrolGoose, RANCH_PATROL_GOOSE_NAME)}</div>
      </div></template>`;
            return [{ tile, detail }];
        })() : [];
        const ownPanels = [...animalPanels, ...petPanels, ...goosePanels];
        const ownTiles = ownPanels.map((entry) => entry.tile).join("");
        const incomingPanels = incoming.map(({ owner, raid }, incomingIndex) => {
            const animal = owner.ranch?.animals.find((a) => a.kindId === raid.animalKindId);
            const kind = animalById.get(raid.animalKindId);
            const nm = animal?.name || kind?.name || raid.animalKindId;
            const compensation = ranchRaidCoins(raid, now);
            const spriteIndex = animalSpriteIndex.get(raid.animalKindId);
            const visitorIcon = Number.isInteger(spriteIndex) ? sprite(spriteIndex, nm, "", animal?.variantId) : `<span role="img" aria-label="${esc(nm)}">${kind?.emoji ?? "🐾"}</span>`;
            return `<template id="ranch-animal-template-visitor-${incomingIndex}"><div class="ranch-animal-detail">
        <div class="ranch-animal-head">${visitorIcon}<div><h2>${esc(nm)} · 潜伏来客</h2><p class="ranch-animal-intro">来自「${esc(farmLabel(owner))}」的${esc(kind?.name || raid.animalKindId)}</p></div></div>
        <div class="ranch-animal-status"><div class="small" style="color:var(--gold)">🥷 正在你家潜伏 · 现在抓住可获赔 ${num(compensation)} 金 · ${fmtDur(Math.max(0, raid.endsAt - now))}后跑掉</div></div>
        <div class="ranch-animal-actions"><form method="post" action="${base}/catch-raid" style="margin:0"><input type="hidden" name="raid" value="${esc(raid.id)}">
          <button class="btn" type="submit">抓住</button></form></div>
      </div></template>`;
        });
        const allDetails = [...ownPanels.map((entry) => entry.detail), ...incomingPanels].join("");
        const canCollect = pendingGross > 0;
        const animalModal = ownPanels.length || incomingPanels.length ? `${allDetails}<div class="mback ranch-animal-back" id="ranchAnimalModal" role="dialog" aria-modal="true" aria-label="动物详情" aria-hidden="true">
      <div class="sheet ranch-animal-sheet"><button type="button" class="ranch-animal-x" data-ranch-animal-close aria-label="关闭">✕</button><div id="ranchAnimalBody"></div></div>
    </div><script>(function(){
      var modal=document.getElementById('ranchAnimalModal'),body=document.getElementById('ranchAnimalBody'),opener=null;if(!modal||!body)return;
      document.body.appendChild(modal);
      function openAnimal(index,trigger){var template=document.getElementById('ranch-animal-template-'+index);if(!template)return;opener=trigger;modal.dataset.panel=index;body.replaceChildren(template.content.cloneNode(true));modal.classList.add('show');modal.setAttribute('aria-hidden','false');var close=modal.querySelector('[data-ranch-animal-close]');if(close&&close.focus)close.focus();}
      function closeAnimal(){if(!modal.classList.contains('show'))return;modal.classList.remove('show');modal.setAttribute('aria-hidden','true');delete modal.dataset.panel;body.replaceChildren();if(opener&&opener.focus)opener.focus();opener=null;}
      function refreshAnimal(){if(!modal.classList.contains('show'))return;var index=modal.dataset.panel,template=document.getElementById('ranch-animal-template-'+index);if(!template){closeAnimal();return;}body.replaceChildren(template.content.cloneNode(true));opener=[...document.querySelectorAll('[data-ranch-animal]')].find(function(node){return node.getAttribute('data-ranch-animal')===index;})||opener;var focus=body.querySelector('input:not([type="hidden"]),select,button');if(focus)focus.focus({preventScroll:true});}
      document.addEventListener('click',function(event){var trigger=event.target.closest('[data-ranch-animal]');if(trigger){event.preventDefault();openAnimal(trigger.getAttribute('data-ranch-animal'),trigger);return;}if(event.target===modal||event.target.closest('[data-ranch-animal-close]'))closeAnimal();});
      document.addEventListener('keydown',function(event){if(event.key==='Escape')closeAnimal();});
      window.__farmRanchModal={refresh:refreshAnimal,close:closeAnimal};
    })();</script>` : "";
        animalsCard = `<div class="card"><div class="line"><h3 style="margin:0">🐾 在养的动物</h3>
        <form method="post" action="${base}/collect" style="margin:0">
          <button class="btn" type="submit"${canCollect ? "" : " disabled"}>📦 一键收获${canCollect ? `（价值 ${num(pendingValue)}金）` : "（暂无可收）"}</button>
        </form></div>
      ${ownTiles ? `<div class="ranch-owned-grid">${ownTiles}</div>` : `<p class="small muted" style="margin:12px 0 0">还没有自家动物。</p>`}
      ${animalModal}
      <p class="small muted" style="margin:10px 0 0">收获后的动物产物会按当前等级和投喂效果锁定价值，放进顶部「🍳 料理台」的食材柜；欠款存在时会先按动物顺序整份回收还债。鸡、鸭、普通鹅、羊、牛每个完整生产周期另有 5% 概率多带回一份肉。</p>
      <p class="small muted" style="margin:6px 0 0">📌 <b>pin</b>：被你 pin 的动物/宠物，才会随机出现在 ${ai} 农场的氛围描述里；<b>只 pin 一只就固定只出现它</b>。都不 pin＝全部随机（默认）。</p></div>`;
    }
    const raidHistory = ranch?.raidHistory?.day === today ? ranch.raidHistory.entries : [];
    const raidHistoryRows = raidHistory.length
        ? raidHistory.map((entry) => {
            const result = entry.status === "active"
                ? `<span class="pill">派遣中</span>`
                : entry.status === "caught"
                    ? `<b style="color:var(--SP)">被人类抓住 -${num(entry.coins ?? 0)} 金</b>`
                    : entry.status === "goose-caught"
                        ? `<b style="color:var(--SP)">被巡逻鹅抓住 · 偷金币失败 · 保证金全退 · 对方巡逻鹅带走了部分「${esc(entry.produce ?? "未知产物")}」（已折算 ${num(entry.rewardCoins ?? 0)} 金）</b>`
                    : `<b style="color:var(--leaf-deep)">成功偷到 +${num(entry.coins ?? 0)} 金</b>`;
            return `<div class="line small" style="flex-wrap:wrap;padding:7px 0"><span><span class="muted">${esc(fmtTime(entry.startedAt))}</span>　${esc(entry.animalName)} → ${esc(entry.targetName)}</span>${result}</div>`;
        }).join("")
        : `<div class="small muted" style="padding:6px 0 2px">${todayRaidIncome > 0 ? "此前记录未留存" : "今天还没有派遣记录。派出动物后，进度和结果会留在这里。"}</div>`;
    const raidHistoryCard = `<details class="card raid-history"><summary><span>🥷 今日派遣 <b>${raidHistory.length}</b> 次 · 已偷 <b>${num(todayRaidIncome)}/${RANCH_RAID_DAILY_CAP}</b></span></summary>
    <div class="raid-history-body">${raidHistoryRows}</div></details>`;
    // 🛒 牧场商店：每天随机刷 2 件配饰 + 2 件装饰。这里只负责「买」，买到的进🧰仓库，穿戴/摆放去仓库做。
    const shop = ranch?.shop;
    const accOffers = (shop?.acc ?? []).map((id) => accessoryById.get(id)).filter(Boolean);
    const decoOffers = (shop?.decor ?? []).map((id) => decorationById.get(id)).filter(Boolean);
    const accRows = accOffers.length ? accOffers.map((ac) => {
        const can = coins >= ac.price;
        return `<div class="line small" style="flex-wrap:wrap"><span>👗 ${esc(ac.name)}　<span class="muted">${ac.price}金</span></span>
      <form method="post" action="${base}/dress" style="margin:0"><input type="hidden" name="acc" value="${ac.id}">
        <button class="btn ghost" type="submit"${can ? "" : " disabled"}>买入仓库</button></form></div>`;
    }).join("") : `<div class="small muted">今天没有配饰上架</div>`;
    const decoRows = decoOffers.length ? decoOffers.map((d) => {
        const can = coins >= d.price;
        return `<div class="line small"><span>🏡 ${esc(d.name)}　<span class="muted">${d.price}金</span></span>
      <form method="post" action="${base}/decorate" style="margin:0"><input type="hidden" name="decor" value="${d.id}">
        <button class="btn ghost" type="submit"${can ? "" : " disabled"}>买入仓库</button></form></div>`;
    }).join("") : `<div class="small muted">装饰都收齐啦 / 今天没有新装饰</div>`;
    const shopCard = `<div class="card"><h3>🛒 牧场商店　<span class="muted small" style="font-weight:400">每天随机刷新，明天换一批</span></h3>
    <p class="small muted" style="margin:0 0 6px">用牧场金币买<b>配饰</b>和<b>装饰物</b>，买到的都进 <b>🧰 牧场仓库</b>——再去仓库给动物/宠物戴上、把装饰摆出来。每天各上 2 件，看缘分。</p>
    <div class="small" style="color:var(--wood);font-weight:700;margin:8px 0 2px">今日配饰</div>
    ${accRows}
    <div class="small" style="color:var(--wood);font-weight:700;margin:10px 0 2px">今日装饰</div>
    ${decoRows}</div>`;
    // 回传金币给 AI
    const remitCard = `<div class="card"><h3>💰 回传金币给${ai}</h3>
    <p class="small muted" style="margin:0 0 10px">牧场赚的钱是你的。要不要分${ai}一点、分多少，<b>你自己定</b>。回传后 ${ai} 下次打开农场会收到一条消息。</p>
    <form method="post" action="${base}/remit" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input class="inp" type="number" name="amount" min="1" max="${coins}" placeholder="金额" ${coins > 0 ? "" : "disabled"}>
      <button class="btn" type="submit" ${coins > 0 ? "" : "disabled"}>↗ 回传给${ai}</button>
      <span class="small muted">（现有 ${num(coins)} 金）</span>
    </form></div>`;
    // 双向金币往来（人→AI remit / AI→人 send-ranch）
    const transfers = (f.ledger ?? []).filter((e) => e.type === "remit" || e.type === "send-ranch");
    const histRows = transfers.length
        ? transfers.slice(0, 12).map((e) => `<div class="line small"><span class="muted">${esc(fmtTime(e.at))}</span><span>${e.type === "remit" ? `↗ 给 ${ai}` : `↙ ${ai} 给你`} <b>${num(e.amount)}</b> 金</span></div>`).join("")
        : `<div class="small muted">还没有金币往来记录。</div>`;
    const historyCard = `<div class="card"><h3>🧾 金币往来</h3>
    <p class="small muted" style="margin:0 0 6px">你和 ${ai} 互相寄过的金币（最近 12 笔）。</p>
    ${histRows}</div>`;
    // 🧰 牧场仓库：买来的配饰/装饰先进这里，再从这儿给动物/宠物/巡逻鹅戴上、把装饰摆出来。
    const decorName = (id) => (decorationById.get(id) ?? expDecorById.get(id))?.name ?? id;
    const decorVisit = (id) => (decorationById.get(id) ?? expDecorById.get(id))?.visitLine;
    const decorSrc = (id) => {
        const exp = expDecorById.get(id);
        return exp ? `<span class="muted">🗺️ 秘境·${esc(expMapById.get(exp.from)?.name ?? exp.from)}</span>` : `<span class="muted">🛒 商店</span>`;
    };
    // 可穿戴对象（动物 + 宠物 + 独立巡逻鹅）。
    const wearTargets = [
        ...list.map((a, i) => ({ v: `animal:${i}`, label: a.name || animalById.get(a.kindId)?.name || a.kindId })),
        ...petList.map((p, i) => ({ v: `pet:${i}`, label: p.name || petById.get(p.kindId)?.name || p.kindId })),
        ...(patrolGoose ? [{ v: "goose:0", label: patrolGoose.name || RANCH_PATROL_GOOSE_NAME }] : []),
    ];
    const whoOpts = wearTargets.map((t) => `<option value="${t.v}">${esc(t.label)}</option>`).join("");
    // 配饰·仓库里（未穿，按 id 计数）
    const wdCount = new Map();
    for (const id of ranch?.wardrobe ?? [])
        wdCount.set(id, (wdCount.get(id) ?? 0) + 1);
    const wardrobeRows = [...wdCount.entries()].map(([id, n]) => {
        const ac = accessoryById.get(id);
        if (!ac)
            return "";
        const wear = wearTargets.length
            ? `<form method="post" action="${base}/wear" style="display:flex;gap:6px;margin:0"><input type="hidden" name="acc" value="${id}">
          <select class="inp" name="who" style="width:auto">${whoOpts}</select><button class="btn ghost" type="submit">戴上</button></form>`
            : `<span class="small muted">先有动物、宠物或巡逻鹅才能戴</span>`;
        return `<div class="line small" style="flex-wrap:wrap"><span>🎀 <b>${esc(ac.name)}</b>${n > 1 ? ` ×${n}` : ""}${ac.desc ? `　<span class="muted">${esc(ac.desc)}</span>` : ""}</span>${wear}</div>`;
    }).filter(Boolean).join("");
    // 配饰·穿戴中（动物/宠物/巡逻鹅身上，可脱下）
    const wornList = [
        ...list.flatMap((a, i) => (a.acc ?? []).map((id) => ({ id, target: "animal", idx: i, wearer: a.name || animalById.get(a.kindId)?.name || a.kindId }))),
        ...petList.flatMap((p, i) => (p.acc ?? []).map((id) => ({ id, target: "pet", idx: i, wearer: p.name || petById.get(p.kindId)?.name || p.kindId }))),
        ...(patrolGoose?.acc ?? []).map((id) => ({ id, target: "goose", idx: 0, wearer: patrolGoose.name || RANCH_PATROL_GOOSE_NAME })),
    ];
    const wornRows = wornList.map((w) => {
        const ac = accessoryById.get(w.id);
        if (!ac)
            return "";
        return `<div class="line small" style="flex-wrap:wrap"><span>🎀 <b>${esc(ac.name)}</b>　<span class="muted">穿在 ${esc(w.wearer)}</span></span>
      <form method="post" action="${base}/takeoff" style="margin:0"><input type="hidden" name="acc" value="${w.id}"><input type="hidden" name="target" value="${w.target}"><input type="hidden" name="idx" value="${w.idx}"><button class="btn ghost" type="submit">脱下</button></form></div>`;
    }).filter(Boolean).join("");
    // 装饰·仓库里（未摆，可摆上）
    const storeRows = (ranch?.decorStore ?? []).map((id) => `<div class="line small" style="flex-wrap:wrap"><span>🏡 <b>${esc(decorName(id))}</b>　${decorSrc(id)}</span>
      <form method="post" action="${base}/place" style="margin:0"><input type="hidden" name="decor" value="${id}"><button class="btn ghost" type="submit">摆上</button></form></div>`).join("");
    // 装饰·展示中（已摆，可收起）
    const placedRows = (ranch?.decor ?? []).map((id) => {
        const vl = decorVisit(id);
        return `<div class="line small" style="flex-wrap:wrap"><span>🏡 <b>${esc(decorName(id))}</b> <span class="ready">展示中</span>　${decorSrc(id)}${vl ? `　<span class="muted">${esc(vl)}</span>` : ""}</span>
      <form method="post" action="${base}/unplace" style="margin:0"><input type="hidden" name="decor" value="${id}"><button class="btn ghost" type="submit">收起</button></form></div>`;
    }).join("");
    const wdTotal = (ranch?.wardrobe ?? []).length;
    const warehouseCard = `<div class="card"><h3>🧰 牧场仓库　<span class="muted small" style="font-weight:400">买来/捡到的都在这；从这儿戴上、摆出来</span></h3>
    <div class="small" style="color:var(--wood);font-weight:700;margin:6px 0 2px">🎀 配饰 · 仓库里（${wdTotal}）</div>
    ${wardrobeRows || `<div class="small muted">仓库里没有未穿的配饰——去下面牧场商店买。</div>`}
    <div class="small" style="color:var(--wood);font-weight:700;margin:10px 0 2px">🎀 配饰 · 穿戴中（${wornList.length}）</div>
    ${wornRows || `<div class="small muted">还没给谁戴上配饰。</div>`}
    <div class="small" style="color:var(--wood);font-weight:700;margin:12px 0 2px">🏡 装饰 · 仓库里（${(ranch?.decorStore ?? []).length}）</div>
    ${storeRows || `<div class="small muted">仓库里没有未摆的装饰——牧场商店能买，出门探险也可能捡到。</div>`}
    <div class="small" style="color:var(--wood);font-weight:700;margin:10px 0 2px">🏡 装饰 · 展示中（${(ranch?.decor ?? []).length}）</div>
    ${placedRows || `<div class="small muted">还没摆出装饰（摆出来别人串门才看得到）。</div>`}</div>`;
    const body = `${plaque}
${ranchSceneCard}
${raidHistoryCard}
${codexCard}
${animalsCard}
${warehouseCard}
${shopCard}
<div class="grid c2">${remitCard}${historyCard}</div>`;
    return page(`${f.name} · 我的牧场`, key, "ranch", `<div id="ranchPage">${body}</div>${RANCH_ASYNC_SCRIPT}`, farmNames(f));
}
// ——————————————————————————————————————————————————————————————
// 🏆 全服排行榜（各榜 Top 5 汇总一处）——唯一的全服页；每榜高亮小克、没进前 5 就补一行他的名次
// ——————————————————————————————————————————————————————————————
const medal = (i) => ["🥇", "🥈", "🥉"][i] ?? `#${i + 1}`;
/** 一行榜单：相对值条形背景 + 名次 + 名字(可带署名) + 数值；isMe 高亮，off 为「不在前 5」的补行。*/
function lbRow(rank, name, value, unit, max, isMe, by, off, title, code, byCode, valuePrefix = "", titleColor) {
    const pct = max > 0 ? Math.max(7, Math.round((value / max) * 100)) : 0;
    const fill = off ? "" : rank === 0 ? "linear-gradient(90deg,#fbe7c1,transparent)"
        : rank < 3 ? "linear-gradient(90deg,#edeee4,transparent)" : "linear-gradient(90deg,#e9f4db,transparent)";
    const cls = `lbrow${rank < 3 && !off ? ` top${rank + 1}` : ""}${isMe ? " me" : ""}${off ? " off" : ""}`;
    const fillEl = off ? "" : `<span class="fill" style="width:${pct}%;background:${fill}"></span>`;
    const farmButton = (label, farmCode, mine) => `<button type="button" class="cpnm" ${mine
        ? `data-copy="${esc(farmCode)}" title="点击复制门牌号"`
        : `data-profile="${esc(farmCode)}" title="查看农场资料" aria-haspopup="dialog"`}>${esc(label)}</button>`;
    // 署名：原创作物的设计者农场也走同一套资料弹窗；自己的名字仍保持点击复制门牌号。
    const byInner = byCode
        ? farmButton(by, byCode, isMe)
        : esc(by ?? "");
    const byEl = by ? ` <span class="by">/ ${byInner}</span>` : "";
    const meTag = isMe ? `<span class="metag">我们</span>` : "";
    const titleEl = title ? `<span class="lbtitle"${titleColor ? ` style="color:${esc(titleColor)};opacity:1"` : ""}>✧${esc(title)}✧</span>` : ""; // 佩戴的称号：描金渐变；活动称号可带审定色
    // 其他农场点名字看资料；自己仍点名字复制门牌号。无 code（如原创热门榜的作物名）则纯文本。
    const nameEl = code
        ? farmButton(name, code, isMe)
        : esc(name);
    return `<div class="${cls}">${fillEl}
    <span class="rk">${off ? `#${rank + 1}` : medal(rank)}</span>
    <span class="nm">${titleEl}${nameEl}${byEl}${meTag}</span>
    <span class="v">${esc(valuePrefix)}${num(value)}<span class="vu">${esc(unit)}</span></span></div>`;
}
export function uiLeaderboard(f, now, key) {
    advance(f, now);
    checkTitles(f); // 进榜前补结算称号，名字前缀用最新佩戴
    const farms = playerFarms(); // 排除常驻 NPC 阿土（排名/计数只算真实玩家）
    const ugc = allUgc();
    const b = buildLeaderboards(farms, ugc, now);
    const publicUgc = ugc.filter((c) => c.category === "ugc" && !c.banned && !!c.designerId);
    const profiles = farms.filter((x) => x.id !== f.id).map((x) => ({
        id: x.id,
        name: x.name,
        owners: `${x.humanName || "伴侣"} & ${x.aiName || "AI"}`,
        welcome: x.welcome?.trim() || `这里是「${x.name}」，随便逛~`,
        crops: publicUgc.filter((c) => c.designerId === x.id).map((c) => c.name),
    }));
    const profileJson = JSON.stringify(profiles).replace(/</g, "\\u003c");
    const meName = f.name; // 榜上一律用农场名（配合门牌号区分）
    const aiDisp = esc(meName); // 自指文案（“看看X在大家里”等）也用农场名
    const today = currentDayIndex(now);
    const defs = [
        { icon: "💰", title: "财富榜", unit: " 金", rows: b.wealth, score: (x) => x.coins + (x.ranch?.coins ?? 0) },
        { icon: "📖", title: "收集榜", unit: " 种", rows: b.collection, score: codexGot },
        { icon: "🌾", title: "勤劳榜", unit: " 株", rows: b.diligence, score: (x) => x.harvested ?? 0 },
        { icon: "💧", title: "热心榜", unit: " 次", rows: b.kindness, score: (x) => x.watered ?? 0 },
        { icon: "🥷", title: "大盗榜", unit: " 次", rows: b.thief, score: (x) => x.stolen ?? 0 },
        { icon: "🏞️", title: "土地榜", unit: " 阶", rows: b.land, score: (x) => x.landTier },
    ];
    // 今日榜：每天 0 点（UTC+8）归零，新人也能同台竞争
    const todayDefs = [
        { icon: "🔥", title: "卷王榜", sub: "今日完成任务最多", unit: " 个", rows: b.todayTasks, score: dailyScore(today, "tasks") },
        { icon: "📱", title: "网瘾榜", sub: "今日巡视农场最勤", unit: " 次", rows: b.todayLogins, score: dailyScore(today, "logins") },
        { icon: "💬", title: "热情榜", sub: "今日给人留言最多", unit: " 次", rows: b.todayMessages, score: dailyScore(today, "messages") },
        { icon: "🌦️", title: "奇遇榜", sub: "今日触发随机事件最多", unit: " 次", rows: b.todayEvents, score: dailyScore(today, "events") },
        { icon: "🐾", title: "摸金榜", sub: "今日动物偷回的金币", unit: " 金", rows: b.todayRaidIncome, score: (x) => x.ranch?.raidIncome?.day === today ? x.ranch.raidIncome.n : 0 },
        { icon: "💸", title: "漏财榜", sub: "今日因偷金币玩法损失", unit: " 金", valuePrefix: "-", rows: b.todayRaidLoss, score: (x) => x.ranch?.raidLoss?.day === today ? x.ranch.raidLoss.n : 0 },
    ];
    // 给每个榜算小克的值/名次，决定高亮还是补行
    const mkCard = (d) => {
        const meVal = d.score(f);
        const meRank = rankOf(farms, f, d.score);
        const max = d.rows.length ? d.rows[0].value : 1;
        const inRows = d.rows.some((r) => r.code === f.id);
        const inTop = meVal > 0 && meRank <= 5;
        const rowsHtml = d.rows.length
            ? d.rows.map((r, i) => lbRow(i, r.name, r.value, d.unit, max, r.code === f.id, undefined, false, r.title, r.code, undefined, d.valuePrefix, r.titleColor)).join("")
            : `<div class="small muted">还没有上榜的</div>`;
        let foot = "";
        if (meVal > 0 && !inRows) {
            const title = equippedTitle(f);
            foot = lbRow(meRank - 1, f.name, meVal, d.unit, max, true, undefined, true, title?.name, f.id, undefined, d.valuePrefix, title?.color);
        }
        else if (meVal <= 0)
            foot = `<div class="lbnote">${aiDisp}还没上这个榜～</div>`;
        const subEl = d.sub ? `　<span class="muted small" style="font-weight:400">${d.sub}</span>` : "";
        return { ...d, meRank, meVal, inTop, html: `<div class="card"><h3>${d.icon} ${d.title}${subEl}</h3>${rowsHtml}${foot}</div>` };
    };
    const cards = defs.map(mkCard);
    const todayCards = todayDefs.map(mkCard);
    // 原创热门榜：单独形态（按「多少人买过」=去重买家数），本农场设计的作物上榜则高亮
    const hotHtml = b.hot.length
        ? b.hot.map((c, i) => lbRow(i, c.name, c.buyers, " 人买过", b.hot[0].buyers, c.designerId === f.id, c.designer, false, undefined, undefined, c.designerId || undefined)).join("")
        : `<div class="small muted">还没有热卖的原创</div>`;
    const hotCard = `<div class="card"><h3>🔥 原创热门榜　<span class="muted small" style="font-weight:400">谁的自创作物卖得最火</span></h3>${hotHtml}</div>`;
    // 🎲 逛逛原创：随机 5 个自创作物 + 「换一批」。点别家设计者名看资料，自己的名字仍复制门牌号。
    const discPool = ugc
        .filter((c) => c.category === "ugc" && !c.banned && !!c.designerId) // 下架作物不进，和热门榜同规矩
        .map((c) => ({ n: c.name, d: c.designer ?? "?", i: c.designerId, m: c.designerId === f.id, r: c.rarity, v: RARITY_VAR[c.rarity] ?? "--N" }));
    const discSample = (discPool.length > 60 ? [...discPool].sort(() => Math.random() - 0.5).slice(0, 60) : discPool);
    const discJson = JSON.stringify(discSample).replace(/</g, "\\u003c"); // 防 </script> 提前闭合
    const discCard = `<div class="card"><h3>🎲 逛逛原创　<span class="muted small" style="font-weight:400">随机 5 个自创作物，点设计者名看农场资料</span></h3>
    <div id="ugcDisc" style="margin-top:2px"></div>
    <div style="margin-top:10px"><button type="button" class="btn" id="ugcReroll">🔀 换一批</button></div></div>`;
    // 用和其它榜单同一套 .lbrow 结构渲染：左侧稀有度色标(.rdot) + 作物名 + 设计者资料入口。
    const discScript = `<script>
(function(){
  var POOL=${discJson}; var box=document.getElementById('ugcDisc'); if(!box) return;
  function pick(){var a=POOL.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a.slice(0,5);}
  function render(){
    box.textContent='';
    var items=pick();
    if(!items.length){var e=document.createElement('div');e.className='small muted';e.style.padding='6px 0';e.textContent='还没有原创作物，快和 AI 一起设计第一个吧～';box.appendChild(e);return;}
    items.forEach(function(c){
      var row=document.createElement('div'); row.className='lbrow';
      var dot=document.createElement('span'); dot.className='rdot'; dot.style.setProperty('--c','var('+c.v+')'); dot.textContent=c.r; row.appendChild(dot);
      var nm=document.createElement('span'); nm.className='nm';
      nm.appendChild(document.createTextNode(c.n+' '));
      var by=document.createElement('span'); by.className='by'; by.appendChild(document.createTextNode('/ '));
      var btn=document.createElement('button'); btn.type='button'; btn.className='cpnm'; btn.textContent=c.d;
      if(c.m){btn.title='点击复制门牌号';btn.setAttribute('data-copy',c.i);}
      else{btn.title='查看农场资料';btn.setAttribute('data-profile',c.i);btn.setAttribute('aria-haspopup','dialog');}
      by.appendChild(btn);
      nm.appendChild(by); row.appendChild(nm);
      box.appendChild(row);
    });
  }
  var rb=document.getElementById('ugcReroll'); if(rb) rb.addEventListener('click',render);
  render();
})();
</script>`;
    // 概览：上榜数 + 最佳名次
    const onTop = cards.filter((c) => c.inTop).length;
    const best = cards.filter((c) => c.meVal > 0).sort((a, c) => a.meRank - c.meRank)[0];
    const plaque = `<div class="plaque"><h1>🏆 全服排行榜</h1>
    <p class="welcome"></p>
    <div class="tags"><span class="tag">🌍 全服 <b>${farms.length}</b> 座</span>
      <span class="tag">🏅 ${aiDisp}进前 5 <b>${onTop}</b> 个榜</span>
      ${best ? `<span class="tag">最好成绩 ${best.icon} ${best.title} <b>#${best.meRank}</b></span>` : ""}</div></div>`;
    // 点农场名复制门牌号（clipboard API + execCommand 回退），复制后短暂反馈。
    const copyScript = `<script>
(function(){
  function fb(txt){try{var ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);}catch(e){}}
  function done(t,txt){var o=t.textContent;t.classList.add('copied');t.textContent='已复制 '+txt+' ✓';setTimeout(function(){t.classList.remove('copied');t.textContent=o;},1300);}
  document.addEventListener('click',function(e){
    var t=e.target.closest('[data-copy]'); if(!t) return;
    e.preventDefault(); if(t.classList.contains('copied')) return;
    var txt=t.getAttribute('data-copy');
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){done(t,txt);},function(){fb(txt);done(t,txt);});}
    else{fb(txt);done(t,txt);}
  });
})();
</script>`;
    const profileModal = `<div class="mback fprof-back" id="farmProfile" role="dialog" aria-modal="true" aria-labelledby="fp-name" aria-hidden="true">
  <div class="sheet fprof-sheet">
    <button type="button" class="fprof-x" data-profile-close aria-label="关闭">✕</button>
    <h2 class="fprof-name" id="fp-name"></h2>
    <p class="fprof-owner" id="fp-owner"></p>
    <p class="fprof-welcome" id="fp-welcome"></p>
    <div class="fprof-door"><div><span class="fprof-label">门牌号</span><code class="fprof-code" id="fp-code"></code></div>
      <button type="button" class="btn ghost fprof-copy" id="fp-copy">复制</button></div>
    <div class="fprof-crops"><div class="fprof-label" id="fp-crops-label">原创作物</div><div class="fprof-crop-list" id="fp-crops"></div></div>
  </div></div>`;
    const profileScript = `<script>
(function(){
  var PROFILES=${profileJson}; var map={}; PROFILES.forEach(function(p){map[p.id]=p;});
  var modal=document.getElementById('farmProfile'); if(!modal) return;
  var name=document.getElementById('fp-name'), owner=document.getElementById('fp-owner'), welcome=document.getElementById('fp-welcome');
  var code=document.getElementById('fp-code'), copy=document.getElementById('fp-copy');
  var label=document.getElementById('fp-crops-label'), crops=document.getElementById('fp-crops');
  var opener=null;
  function openProfile(id,trigger){
    var p=map[id]; if(!p) return;
    opener=trigger; name.textContent=p.name; owner.textContent='农场主：'+p.owners; welcome.textContent='“'+p.welcome+'”'; code.textContent=p.id; copy.setAttribute('data-copy',p.id);
    crops.textContent='';
    if(p.crops.length){
      label.textContent='原创作物'; label.classList.remove('fprof-empty'); crops.style.display='';
      p.crops.forEach(function(n){var chip=document.createElement('span');chip.className='fprof-crop';chip.textContent=n;crops.appendChild(chip);});
    }else{
      label.textContent='原创作物：无'; label.classList.add('fprof-empty'); crops.style.display='none';
    }
    modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
    var closeBtn=modal.querySelector('[data-profile-close]'); if(closeBtn&&closeBtn.focus) closeBtn.focus();
  }
  function closeProfile(){
    if(!modal.classList.contains('show')) return;
    modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
    if(opener&&opener.focus) opener.focus(); opener=null;
  }
  document.addEventListener('click',function(e){
    var trigger=e.target.closest('[data-profile]'); if(trigger){e.preventDefault();openProfile(trigger.getAttribute('data-profile'),trigger);return;}
    if(e.target===modal||e.target.closest('[data-profile-close]')) closeProfile();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeProfile();});
})();
</script>`;
    const todaySection = `<div class="plaque" style="margin-top:18px"><h1>📅 今日榜</h1>
    <p class="welcome">“每天 0 点归零，比的是当天的活跃——新农场也能一夜登顶。”</p></div>
<div class="grid c2">${todayCards[0].html}${todayCards[1].html}</div>
<div class="grid c2">${todayCards[2].html}${todayCards[3].html}</div>
<div class="grid c2">${todayCards[4].html}${todayCards[5].html}</div>`;
    const body = `${plaque}
<div class="grid c2">${cards[0].html}${cards[1].html}</div>
<div class="grid c2">${cards[2].html}${cards[3].html}</div>
<div class="grid c2">${cards[4].html}${cards[5].html}</div>
${hotCard}
${discCard}
${todaySection}${profileModal}${copyScript}${profileScript}${discScript}`;
    return page(`${f.name} · 全服排行榜`, key, "leaderboard", body, farmNames(f));
}
export function uiTodo(f, key, section) {
    const names = { leaderboard: "排行榜" };
    const body = `<div class="plaque"><h1>🚧 ${esc(names[section] ?? section)}</h1>
    <p class="welcome"></p>
    <p style="margin-top:10px"><a class="cta" href="${BASE}/ui/${key}">← 回主页</a></p></div>`;
    return page("建设中", key, section, body, farmNames(f));
}
export function uiInvalid() {
    return `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>
  <div class="wrap"><div class="plaque" style="margin-top:60px"><h1>🔒 链接无效</h1>
  <p class="welcome">这个农场观光链接打不开——可能链接已失效，或这座农场不存在了。</p></div></div>`;
}
//# sourceMappingURL=web.js.map
