import { advance, isStarred } from "../engine.js";
import { getCrop, cropsByCategory, qualities } from "../content.js";
import { BASE } from "../config.js";
import { allUgc } from "../ugc.js";
import { RARITY_VAR, esc, farmNames, fmtDate, page, rarityDot } from "./shell.js";

// ——————————————————————————————————————————————————————————————
// 📖 图鉴册（标本册）：5 栏 —— 普通 / 奇幻 / 限定 / 原创(收藏别家) / 我的(小克自创)
//   官方三类按全集铺位：集到的亮、没集的留灰标本位；ugc 两类是开放集，只列已有的。
// ——————————————————————————————————————————————————————————————
const RAR_RANK = { N: 0, R: 1, SR: 2, SSR: 3, SP: 4, OR: 5 };
const qualityName = (tier) => qualities.find((q) => q.tier === tier)?.name ?? `品${tier}`;
const byRarityThenName = (a, b) => (RAR_RANK[a.rarity] - RAR_RANK[b.rarity]) || a.name.localeCompare(b.name, "zh");
/** 拼 data-* 属性（空值不输出，值统一转义）。*/
const da = (k, v) => (v === undefined || v === null || v === "") ? "" : ` data-${k}="${esc(v)}"`;
/** 一枚标本位。entry 有则「已收录」（亮），无则灰（mine=true 时为「已设计待收获」，不灰）。
 *  已收录 / 我的 两类带 data-* → 可点开细节弹窗；未解锁的灰位不可点。 */
function specTile(c, entry, opts = {}) {
    const cvar = RARITY_VAR[c.rarity] ?? "--N";
    const latin = c.latin ? `<div class="latin">${esc(c.latin)}</div>` : "";
    const sign = opts.by ? `<div class="sm" style="margin-top:2px">✍ ${esc(opts.by)}</div>` : "";
    // ⭐ 星标按钮：只在已揭晓的标本上出现（已收录 / 我的设计）；小表单 POST 切换收藏态，不触发细节弹窗。
    const star = (opts.key && (entry || opts.mine))
        ? `<form class="starf" method="post" action="${BASE}/ui/${esc(opts.key)}/codex/star">`
            + `<input type="hidden" name="id" value="${esc(c.id)}"><input type="hidden" name="anchor" value="${esc(opts.anchor ?? "")}">`
            + `<button class="starbtn${opts.starred ? " on" : ""}" title="${opts.starred ? "取消收藏" : "收藏到「我的收藏」"}" aria-label="收藏">${opts.starred ? "★" : "☆"}</button></form>`
        : "";
    // 可点标本携带的细节数据（弹窗用）
    const data = `data-detail${da("name", c.name)}${da("latin", c.latin)}${da("cvar", cvar)}${da("rarity", c.rarity)}`
        + `${da("cat", opts.cat)}${da("desc", c.desc)}${da("plant", c.plantLine)}${da("harvest", c.lore)}${da("by", opts.by)}`
        + (entry ? `${da("quality", qualityName(entry.bestQuality))}${da("count", entry.count)}${da("date", fmtDate(entry.firstAt))}` : "")
        + (opts.mine && !entry ? da("status", "你设计的，还没亲手收获") : "");
    if (entry) {
        return `<div class="spec" style="--c:var(${cvar})" ${data}>${star}
      <div class="nm">${esc(c.name)}</div>${latin}
      <div class="sm">${rarityDot(c.rarity)} <span class="q">${esc(qualityName(entry.bestQuality))}</span> · 收 ${entry.count}</div>${sign}</div>`;
    }
    if (opts.mine) {
        return `<div class="spec" style="--c:var(${cvar})" ${data}>${star}
      <div class="nm">${esc(c.name)}</div>${latin}
      <div class="sm">${rarityDot(c.rarity)} · 🌱 已设计 · 待亲手收获</div></div>`;
    }
    // 未解锁：藏名（连学名一起），只露稀有度色标，留收集悬念，不可点
    return `<div class="spec locked" style="--c:var(${cvar})"><span class="lk">🔒</span>
    <div class="nm" style="letter-spacing:2px">？？？</div>
    <div class="latin">未知物种</div>
    <div class="sm">${rarityDot(c.rarity)} · 未收录</div></div>`;
}
export function uiCodex(f, now, key, flash) {
    advance(f, now);
    const flashHtml = flash ? `<div class="flash">${esc(flash)}</div>` : "";
    // 官方三类：全集铺位
    const official = [
        { id: "common", emoji: "🌾", label: "普通", cat: "common" },
        { id: "fantasy", emoji: "✨", label: "奇幻", cat: "fantasy" },
        { id: "limited", emoji: "🎏", label: "限定", cat: "limited" },
    ];
    const officialSecs = official.map(({ id, emoji, label, cat }) => {
        const all = cropsByCategory(cat).slice().sort(byRarityThenName);
        const got = all.filter((c) => f.codex[c.id]).length;
        const tiles = all.map((c) => specTile(c, f.codex[c.id], { cat: label, key, starred: isStarred(f, c.id), anchor: id })).join("");
        return { id, emoji, label, got, total: all.length,
            html: `<section id="${id}"><div class="secthead"><h2>${emoji} ${esc(label)}</h2>
        <span class="cnt">已收录 <b>${got}</b> / ${all.length}</span></div>
      <div class="specimens">${tiles}</div></section>` };
    });
    // 原创：收藏的别家设计（codex 里 ugc 且 designerId 不是自己）
    const others = Object.keys(f.codex)
        .map((id) => getCrop(id))
        .filter((c) => !!c && c.category === "ugc" && c.designerId !== f.id)
        .sort((a, b) => a.name.localeCompare(b.name, "zh"));
    const othersHtml = others.length
        ? `<div class="specimens">${others.map((c) => specTile(c, f.codex[c.id], { cat: "原创", by: `by ${c.designer || "某位邻居"}`, key, starred: isStarred(f, c.id), anchor: "originals" })).join("")}</div>`
        : `<div class="emptybox">还没收藏过别家的原创作物——去串门买邻居的种子，收获后就进册了。</div>`;
    const origSec = `<section id="originals"><div class="secthead"><h2>🎨 原创</h2>
      <span class="cnt">收藏别家 <b>${others.length}</b> 种</span></div>${othersHtml}</section>`;
    // 我的：小克自己设计的（全列，亲手收过的亮、没收的标待收获）
    const mine = allUgc().filter((c) => c.designerId === f.id && !c.banned)
        .sort((a, b) => a.name.localeCompare(b.name, "zh"));
    const mineGot = mine.filter((c) => f.codex[c.id]).length;
    const mineHtml = mine.length
        ? `<div class="specimens">${mine.map((c) => specTile(c, f.codex[c.id], { cat: "我的", mine: true, by: f.codex[c.id] ? "我的设计" : undefined, key, starred: isStarred(f, c.id), anchor: "mine" })).join("")}</div>`
        : `<div class="emptybox">${esc(f.aiName || "小克")}还没设计过原创作物——在文字接口里 <code>design</code> 一个，就会出现在这格标本册。</div>`;
    const mineSec = `<section id="mine"><div class="secthead"><h2>🖌️ 我的</h2>
      <span class="cnt">自创 <b>${mine.length}</b> 种${mine.length ? ` · 亲手收过 ${mineGot}` : ""}</span></div>${mineHtml}</section>`;
    // ⭐ 我的收藏：伴侣星标过的作物，按收藏顺序汇总（跨普通/奇幻/限定/原创/自创；只保留仍存在且已揭晓的）
    const favLabel = (c) => c.category === "ugc" ? (c.designerId === f.id ? "我的" : "原创")
        : c.category === "common" ? "普通" : c.category === "fantasy" ? "奇幻" : "限定";
    const favs = (f.starred ?? [])
        .map((id) => getCrop(id))
        .filter((c) => !!c && !c.banned)
        .filter((c) => !!f.codex[c.id] || c.designerId === f.id); // 只留已收录 / 自己设计（未揭晓的不进收藏）
    const favTiles = favs.map((c) => {
        const isMineDesign = c.category === "ugc" && c.designerId === f.id;
        const by = c.category === "ugc"
            ? (isMineDesign ? (f.codex[c.id] ? "我的设计" : undefined) : `by ${c.designer || "某位邻居"}`)
            : undefined;
        return specTile(c, f.codex[c.id], { cat: favLabel(c), mine: isMineDesign, by, key, starred: true, anchor: "favorites" });
    }).join("");
    const favHtml = favs.length
        ? `<div class="specimens">${favTiles}</div>`
        : `<div class="emptybox">还没星标任何作物——在下面各栏点开喜欢的作物，点右上角的 ☆ 就收进这里。</div>`;
    const favSec = `<section id="favorites"><div class="secthead"><h2>⭐ 我的收藏</h2>
      <span class="cnt">星标 <b>${favs.length}</b> 种</span></div>${favHtml}</section>`;
    // 顶部锚点导航（各栏带计数）
    const chips = [
        `<a href="#favorites">⭐ 我的收藏 <b>${favs.length}</b></a>`,
        ...officialSecs.map((s) => `<a href="#${s.id}">${s.emoji} ${esc(s.label)} <b>${s.got}/${s.total}</b></a>`),
        `<a href="#originals">🎨 原创 <b>${others.length}</b></a>`,
        `<a href="#mine">🖌️ 我的 <b>${mine.length}</b></a>`,
    ].join("");
    const totalGot = officialSecs.reduce((n, s) => n + s.got, 0);
    const totalAll = officialSecs.reduce((n, s) => n + s.total, 0);
    const plaque = `<div class="plaque"><h1>📖 图鉴册</h1>
    <p class="welcome"></p>
    <div class="tags"><span class="tag">官方已收 <b>${totalGot}</b> / ${totalAll}</span>
      <span class="tag">⭐ 我的收藏 <b>${favs.length}</b></span>
      <span class="tag">收藏别家原创 <b>${others.length}</b></span>
      <span class="tag">自创 <b>${mine.length}</b></span></div></div>`;
    // 细节弹窗（单例）+ 极小内联脚本：点标本读 data-* 填窗；点背景/✕/Esc 关。
    const modal = `<div class="mback" id="mb">
  <div class="sheet" id="sheet"><span class="x" data-close>✕</span>
    <h3 class="mt" id="m-name"></h3>
    <div class="mlatin" id="m-latin"></div>
    <div class="mmeta" id="m-meta"></div>
    <div class="blk" id="m-desc"><div class="lbl">📜 描述</div><p class="v"></p></div>
    <div class="blk" id="m-plant"><div class="lbl">🌱 播种时</div><div class="quote v"></div></div>
    <div class="blk" id="m-harvest"><div class="lbl">🌾 收获时</div><div class="quote v"></div></div>
  </div></div>
<script>
(function(){
  var mb=document.getElementById('mb'); if(!mb) return;
  var $=function(id){return document.getElementById(id);};
  function blk(id,val){var el=$(id); if(val){el.style.display='';el.querySelector('.v').textContent=val;}else{el.style.display='none';}}
  function open(d){
    $('m-name').textContent=d.name||'';
    var lat=$('m-latin'); lat.textContent=d.latin||''; lat.style.display=d.latin?'':'none';
    // 防 XSS：拼进 innerHTML 的变量(尤其设计者名 d.by，来自用户可控的农场名/aiName)必须转义
    var e=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
    var m='<span class="rdot" style="--c:var('+(d.cvar||'--N')+')">'+e(d.rarity)+'</span>';
    if(d.cat) m+=' <span class="pill">'+e(d.cat)+'</span>';
    if(d.quality) m+=' <span class="q">'+e(d.quality)+'</span>';
    if(d.count) m+=' · 收 '+e(d.count);
    if(d.by) m+=' · ✍ '+e(d.by);
    if(d.date) m+=' · 🗓 '+e(d.date);
    if(d.status) m+=' · '+e(d.status);
    $('m-meta').innerHTML=m;
    $('sheet').style.setProperty('--c','var('+(d.cvar||'--leaf')+')');
    blk('m-desc',d.desc); blk('m-plant',d.plant); blk('m-harvest',d.harvest);
    mb.classList.add('show');
  }
  function close(){mb.classList.remove('show');}
  document.addEventListener('click',function(e){
    if(e.target.closest('.starf')) return; // ⭐ 点星标按钮只提交收藏表单，不弹细节窗
    var t=e.target.closest('[data-detail]'); if(t){open(t.dataset);return;}
    if(e.target===mb||e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();
</script>`;
    const body = `${plaque}${flashHtml}
<div class="codexnav">${chips}</div>
${favSec}
${officialSecs.map((s) => s.html).join("\n")}
${origSec}
${mineSec}
${modal}`;
    return page(`${f.name} · 图鉴册`, key, "codex", body, farmNames(f));
}
