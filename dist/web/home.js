import { advance, collectionPct, codexCountByCategory, nextUpgradeReq, refreshShop, shopOffer, plotRemainMs, humanHarvestLeft } from "../engine.js";
import { cropById, getCrop, landTierByLevel, totalCropCount, titles as titleDefs } from "../content.js";
import { BASE, HUMAN_HARVEST_DAILY_CAP } from "../config.js";
import { currentSeason, activeFestivals } from "../time.js";
import { playerFarms } from "../store.js";
import { checkTitles, equippedTitle } from "../titles.js";
import { qixi2026ShopRows, qixi2026TaskView } from "../qixi-2026.js";
import { isQixiLantern2026Active } from "../qixi-lantern-2026.js";
import { ago, clock, esc, farmLabel, farmNames, fmtDur, num, page, rarityDot, stamp } from "./shell.js";
import { codexGot, rankOf } from "./stats.js";

/** 已收集的原创(ugc)物种数。 */
const ugcGot = (f) => Object.keys(f.codex).filter((id) => getCrop(id)?.category === "ugc").length;
/** 最近收录的若干条图鉴（codex 键按收集顺序插入，取末尾即最新）。 */
function recentCodex(f, n) {
    return Object.keys(f.codex).slice(-n).reverse()
        .map((id) => getCrop(id)).filter((c) => !!c)
        .map((c) => ({ name: c.name, rarity: c.rarity }));
}
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
    const qixiLanternCard = isQixiLantern2026Active(now) ? `<section class="card" style="border:1px solid #dfb982;background:linear-gradient(145deg,#fff8eb,#f6e5df);font-family:var(--serif)"><div class="line" style="align-items:center;gap:14px"><div><h2 style="margin:0;color:#855b65;font-family:var(--serif)">🏮 灯河有信</h2><p class="small" style="margin:5px 0 0;color:#786875;font-family:var(--serif);line-height:1.55">愿今夜所有思念，都能顺水抵达归处。</p></div><a class="btn ghost" style="flex:0 0 auto;border-color:#c99782;background:#b86f83;color:#fff8ee;box-shadow:none;font-family:var(--serif)" href="${BASE}/ui/${key}/qixi">进入活动</a></div></section>` : "";
    const qixiTaskCard = qixiView && !qixiView.allComplete ? `<section class="card" style="border:1px solid #dfb982;background:linear-gradient(180deg,#fff9ed,#f7e8e2);font-family:var(--serif)">
      <div class="line" style="align-items:flex-start;gap:10px"><div><h2 style="margin:0;color:#855b65;font-family:var(--serif)">🎋 七夕限定任务</h2><p class="small" style="margin:4px 0 0;color:#786875">完成一项，解锁对应限定种子。</p></div><span class="tag" style="border-color:#d3a382;background:#f7e2dc;color:#8b5f70">${qixiView.tasks.length} 项进行中</span></div>
      <div style="display:grid;gap:8px;margin-top:12px">${qixiView.tasks.map((task) => `<div style="padding:10px 12px;border:1px solid #e1c5a1;border-radius:13px;background:#fffaf0"><div class="line small"><b>${esc(task.label)}</b><span style="color:#85747c">${esc(task.progressText)}</span></div><div class="pminibar" style="margin-top:7px;background:#eadfd7">${barFill(task.target ? task.progress / task.target * 100 : 0, "#ba788d")}</div><div class="small" style="margin-top:5px;color:#85747c">解锁：${esc(task.cropName)}</div></div>`).join("")}</div>
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
${qixiLanternCard}
${qixiTaskCard}
${ripeBroadcast}
${hero}
${field}
<div class="grid c2">${seasonCard}${shopCard}</div>
<div class="grid c2">${rankCard}${msgCard}</div>
${trailCard}`;
    return page(`${f.name} · 田园标本馆`, key, "", body, farmNames(f), now);
}
