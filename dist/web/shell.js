import { animals, glimmerVariantById } from "../content.js";
import { BASE } from "../config.js";

export function esc(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export const num = (n) => (n ?? 0).toLocaleString("en-US");
const alpacaSpriteIndex = animals.findIndex((kind) => kind.id === "alpaca");
export function ranchSprite(index, name, extraClass = "", variantId) {
    const col = index % 5;
    const row = Math.floor(index / 5);
    const variant = glimmerVariantById.get(variantId);
    const classes = [extraClass, index === alpacaSpriteIndex && !variant ? "ranch-sprite-alpaca" : "", variant ? "ranch-sprite-variant" : ""].filter(Boolean).join(" ");
    const variantAssetVersion = variant?.set === 3 ? "20260810a" : "20260809b";
    const sheet = variant ? `--ranch-sheet:url('${BASE}/assets/glimmer/variant-${variant.set}.webp?v=${variantAssetVersion}');` : "";
    return `<span class="ranch-sprite${classes ? ` ${classes}` : ""}" role="img" aria-label="${esc(name)}像素画" style="${sheet}--sx:${col * 25}%;--sy:${row * 100 / 3}%"></span>`;
}
/** UTC+8 时钟 HH:MM（作物预计成熟时间用）。 */
export const clock = (ms) => new Date(ms).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });
/** UTC+8 月-日 HH:MM（足迹时间戳用）。 */
export const stamp = (ms) => new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }) : "早期收录";
/** 粗粒度相对时间（刚刚 / N分钟前 / N小时前 / N天前）。 */
export function ago(ms, now) {
    const s = Math.max(0, Math.floor((now - ms) / 1000));
    if (s < 60)
        return "刚刚";
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24)
        return `${h}小时前`;
    return `${Math.floor(h / 24)}天前`;
}
/** 把「剩余毫秒」写成人读时长（约N分钟 / 约N.N小时）。 */
export function fmtDur(ms) {
    const min = Math.max(1, Math.round(ms / 60000));
    return min >= 60 ? `约${Math.round(min / 6) / 10}小时` : `约${min}分钟`;
}
const CAT_LABEL = { common: "普通", fantasy: "奇幻", limited: "限定", ugc: "自创" };
export const RARITY_VAR = { N: "--N", R: "--R", SR: "--SR", SSR: "--SSR", SP: "--SP", OR: "--OR" };
/** 稀有度小色标，如 SR（带专属色边框）。 */
export const rarityDot = (r) => `<span class="rdot" style="--c:var(${RARITY_VAR[r] ?? "--N"})">${esc(r)}</span>`;
// ——————————————————————————————————————————————————————————————
// 全站外壳：视觉语言都在这里（CSS 变量 / 稀有度色卡 / 衬线标题 / 纸纹质感）
// ——————————————————————————————————————————————————————————————
export const STYLE = `
:root{
  /* 清新田园 —— 浅绿主色 + 米白，轻盈透亮 */
  --paper:#f1f8ea; --paper2:#ffffff; --ink:#33433a; --ink-soft:#6f8070; --line:#dceccf;
  --wood:#5d8a48; --leaf:#86c96f; --leaf-deep:#4e9a52; --gold:#cf9a3a;
  /* 稀有度色卡（贯穿图鉴/原创/地块/商店）*/
  --N:#93a98c; --R:#5aa0dc; --SR:#a07fd6; --SSR:#e0a63c; --SP:#e0617e; --OR:#df7fb6;
  --serif:"Songti SC","STSong","Noto Serif SC",Georgia,"Times New Roman",serif;
  --shadow:0 10px 30px -22px #2f5a2e55;
}
*{box-sizing:border-box}
body{margin:0;color:var(--ink);
  font:15px/1.7 system-ui,"Segoe UI",-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  background:
    radial-gradient(1100px 520px at 50% -10%, #ffffff, transparent 70%),
    radial-gradient(820px 460px at 88% 4%, #e4f3d6, transparent 62%),
    radial-gradient(760px 520px at 6% 18%, #eef8e4, transparent 60%),
    linear-gradient(180deg, #f4faee, #ecf6e1);
  background-attachment:fixed;
}
a{color:var(--leaf-deep);text-decoration:none}
.serif{font-family:var(--serif)}
.wrap{max-width:980px;margin:0 auto;padding:0 18px 72px}

/* 顶栏 */
header.top{position:sticky;top:0;z-index:5;background:rgba(250,253,247,.82);backdrop-filter:blur(9px) saturate(1.1);
  border-bottom:1px solid var(--line)}
.topin{max-width:980px;margin:0 auto;padding:11px 18px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
.brand{font-family:var(--serif);font-weight:700;font-size:18px;letter-spacing:1px;margin-right:6px;color:var(--wood)}
nav a{color:var(--ink-soft);padding:4px 9px;border-radius:9px;white-space:nowrap;font-size:14px}
nav a.on,nav a:hover{color:var(--leaf-deep);background:#e6f3d8}
.market-farm{padding:16px 0;border-top:1px dashed var(--line)}.market-farm:first-child{border-top:0;padding-top:0}
.market-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px dashed var(--line)}.market-row:first-child{border-top:0}
.market-row-main{min-width:0}.market-row-main b{color:var(--wood)}.market-row form{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.market-row .inp{width:72px;padding:7px}.barter-arrow{color:#a4692f;font-weight:900;padding:0 4px}.market-list-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:end}.market-choice{display:grid;grid-template-columns:88px minmax(0,1fr) 76px;gap:7px;align-items:end;padding:10px;border:1px solid var(--line);border-radius:13px;background:#fffdf7}.market-choice-title{grid-column:1/-1;color:var(--wood);font-weight:700}.market-choice label{display:grid;gap:4px}.market-choice .inp{width:100%;min-width:0}.market-list-grid>.btn{grid-column:1/-1;justify-self:start}
@media(max-width:640px){.market-row{grid-template-columns:1fr}.market-row form{justify-content:flex-start}.market-list-grid{grid-template-columns:1fr}.market-choice{grid-template-columns:82px minmax(0,1fr) 70px}}

/* 匾额头 */
.plaque{margin:26px 0 6px;padding:22px 24px;border:1px solid var(--line);border-radius:20px;
  background:linear-gradient(180deg, rgba(255,255,255,.92), rgba(233,246,222,.78));
  box-shadow:var(--shadow);position:relative;overflow:hidden;backdrop-filter:blur(4px)}
.plaque::before{content:"";position:absolute;inset:0;
  background:radial-gradient(460px 180px at 14% -30%, #ffffffcc, transparent 60%);pointer-events:none}
.plaque h1{font-family:var(--serif);font-size:30px;margin:0;letter-spacing:1px;color:#2f5a31}
.welcome{color:var(--ink-soft);font-style:italic;margin:6px 0 0}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.tag{background:rgba(255,255,255,.7);border:1px solid var(--line);border-radius:999px;padding:2px 11px;font-size:13px;color:var(--ink-soft)}
.tag b{color:var(--leaf-deep)}

/* 卡片 */
.grid{display:grid;gap:14px}
.c2{grid-template-columns:1.05fr .95fr}
.c2b{grid-template-columns:1fr 1fr}
@media(max-width:720px){.c2,.c2b{grid-template-columns:1fr}}
.card{background:rgba(255,255,255,.72);border:1px solid var(--line);border-radius:16px;padding:16px 18px;
  box-shadow:var(--shadow);backdrop-filter:blur(4px);transition:transform .15s ease, box-shadow .15s ease}
.card h3{margin:0 0 10px;font-size:15px;color:var(--wood);font-weight:700;letter-spacing:.5px}
.muted{color:var(--ink-soft)}.small{font-size:13px}
.guestbook-own{margin-bottom:14px;border-color:#bcdba8;background:rgba(247,253,241,.9)}
.guestbook-list{height:clamp(168px,24vh,220px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;
  padding-right:5px;display:flex;flex-direction:column;gap:7px}
.guestbook-msg{padding:8px 10px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.66)}
.guestbook-msg p{margin:2px 0 0;overflow-wrap:anywhere}
.guestbook-empty{height:auto;min-height:74px;display:flex;align-items:center;justify-content:center;text-align:center}

/* 收集册大圆环 */
.hero{display:flex;gap:22px;align-items:center}
@media(max-width:560px){.hero{flex-direction:column;text-align:center}}
.ring{position:relative;width:172px;height:172px;flex:0 0 auto}
.ring svg{transform:rotate(-90deg)}
.ring .track{fill:none;stroke:#e3efd9;stroke-width:15}
.ring .val{fill:none;stroke:url(#g);stroke-width:15;stroke-linecap:round;
  stroke-dasharray:var(--circ);stroke-dashoffset:var(--off);animation:draw 1.5s cubic-bezier(.22,1,.36,1) both}
@keyframes draw{from{stroke-dashoffset:var(--circ)}}
.ring .center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring .pct{font-family:var(--serif);font-size:38px;font-weight:700;line-height:1;color:var(--leaf-deep)}
.ring .cap{font-size:12px;color:var(--ink-soft);margin-top:4px;letter-spacing:2px}
.herometa{flex:1;min-width:0}
.bignums{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px}
.bignums .b{font-family:var(--serif);font-size:22px;color:#2f5a31}
.bignums .l{font-size:12px;color:var(--ink-soft)}

/* 图鉴：分类数字 + 新收录 */
.catnums{display:flex;flex-wrap:wrap;gap:5px 16px;font-size:14px;margin:2px 0 10px}
.catnums b{font-family:var(--serif);font-size:17px;color:var(--leaf-deep);margin-left:2px}
.recent{display:flex;flex-wrap:wrap;align-items:center;gap:6px 9px;
  padding-top:9px;border-top:1px dashed var(--line)}
.recent .rc{font-size:13px}
.rdot{display:inline-block;border:1px solid var(--c);color:var(--c);border-radius:6px;padding:0 6px;
  font-size:11px;font-weight:700;background:color-mix(in srgb, var(--c) 13%, transparent)}

/* 地块 mini */
.plots{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:9px}
.plot{border:1px solid var(--line);border-radius:12px;padding:9px 6px;text-align:center;background:rgba(255,255,255,.6)}
.plot .ico{font-size:22px;display:block;line-height:1.2}
.plot.empty{opacity:.5}
.plot.ripe{border-color:var(--SSR);background:#fff7e6;box-shadow:0 0 0 1px #e0a63c44 inset}
.field-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.field-head h3{margin:0}.field-head form{margin:0}.field-head .btn{white-space:nowrap}
.bar,.pminibar{height:6px;border-radius:5px;background:#e3efd9;overflow:hidden}
.pminibar{margin-top:5px}
.bar>span,.pminibar>span{display:block;height:100%;border-radius:5px}

/* 通用行 / 徽章 */
.line{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:3px 0}
.pill{display:inline-block;background:rgba(255,255,255,.7);border:1px solid var(--line);border-radius:8px;padding:1px 8px;font-size:12px;color:var(--ink-soft);margin:2px 0}
.rank-big{font-family:var(--serif);font-size:26px;color:var(--gold)}
.cta{color:var(--leaf-deep);font-size:13px;font-weight:600}
/* 牧场：动物行 + 按钮 + 输入 */
.btn{display:inline-block;border:0;border-radius:11px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer;
  background:linear-gradient(180deg,var(--leaf),var(--leaf-deep));color:#fff;box-shadow:0 6px 16px -8px #3a7a3a88}
.btn:hover{filter:brightness(1.05)}
.btn.ghost{background:#fff;color:var(--leaf-deep);border:1px solid var(--line);box-shadow:none}
.btn:disabled{background:#dfe9d6;color:#9bb091;cursor:not-allowed;box-shadow:none}
.inp{font:inherit;border:1px solid var(--line);border-radius:10px;padding:8px 11px;width:120px;background:#fff;color:var(--ink)}
.flash{background:#eef7e3;border:1px solid var(--leaf);border-radius:12px;padding:10px 14px;margin:14px 0 0;color:#2f5a31}
.animal{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px dashed var(--line)}
.animal:first-child{border-top:0}
.animal .ai{font-size:30px;line-height:1;flex:0 0 auto}
.animal .am{flex:1;min-width:0}
.animal .ready{font-family:var(--serif);font-size:20px;color:var(--gold)}
.ranch-scene-card{padding:0;overflow:hidden;background:#dff0bd}
.ranch-scene{position:relative;isolation:isolate;width:100%;aspect-ratio:16/9;overflow:hidden;
  background:#8dcc54 url("${BASE}/assets/ranch-scene-background.png?v=20260803c") center/cover no-repeat}
.ranch-scene::after{content:"";position:absolute;inset:0;z-index:90;pointer-events:none;box-shadow:inset 0 0 0 1px #ffffff55}
.ranch-scene-title{position:absolute;top:10px;left:12px;z-index:95;padding:3px 10px;border:1px solid #ffffff88;border-radius:999px;
  background:#fffdf0d9;color:#48663c;font-size:12px;font-weight:700;box-shadow:0 4px 12px #315b2433;backdrop-filter:blur(3px)}
.ranch-scene-empty{position:absolute;left:50%;top:62%;z-index:3;transform:translate(-50%,-50%);width:min(78%,320px);padding:8px 12px;
  border-radius:12px;background:#fffdf0d9;color:#5d754f;text-align:center;font-size:12px;box-shadow:0 5px 15px #315b2433}
.ranch-anchor{position:absolute;width:clamp(54px,7.2vw,88px);aspect-ratio:1;transform:translate(-50%,-100%);will-change:left,top}
.ranch-anchor.ranch-visitor{appearance:none;padding:0;border:0;background:transparent;color:inherit;font:inherit;cursor:inherit}
.ranch-anchor.ranch-visitor:focus-visible{outline:2px dashed #fff7d0;outline-offset:1px}
.ranch-resident{width:100%;height:100%}
.ranch-scale{display:block;width:100%;height:100%;transform:scale(var(--scale,1));transform-origin:50% 100%}
.ranch-face{display:block;width:100%;height:100%}
.ranch-scene-sprite{border-radius:0;box-shadow:none;animation:ranch-step .72s step-end var(--delay) infinite;image-rendering:pixelated}
@keyframes ranch-step{0%,32%{transform:translateY(0)}33%,65%{transform:translateY(-2px)}66%,100%{transform:translateY(1px)}}
.ranch-codex{padding:0;overflow:hidden}
.ranch-codex>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:11px 16px;
  cursor:pointer;list-style:none;color:var(--wood);font-family:var(--serif);font-weight:700}
.ranch-codex>summary::-webkit-details-marker{display:none}
.ranch-codex>summary::after{content:"⌄";order:3;font-family:var(--sans);font-size:18px;color:var(--ink-soft);transition:transform .15s ease}
.ranch-codex[open]>summary::after{transform:rotate(180deg)}
.ranch-codex>summary:focus-visible{outline:2px solid var(--leaf-deep);outline-offset:-3px}
.ranch-codex>summary:active{background:#eef7e3}
.ranch-codex-body{padding:4px 16px 16px;border-top:1px dashed var(--line)}
.ranch-codex-section{margin-top:14px}
.ranch-codex-subtitle{display:flex;align-items:baseline;gap:8px;margin:0 0 8px;color:var(--wood);font-weight:700}
.ranch-codex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(142px,1fr));gap:10px}
.ranch-codex-item{min-width:0;padding:9px;border:1px solid var(--line);border-radius:13px;background:rgba(247,252,242,.82)}
.ranch-codex-item.locked{background:rgba(242,245,239,.68)}
.ranch-sprite{display:block;width:100%;aspect-ratio:1;border-radius:10px;background-image:var(--ranch-sheet,url("${BASE}/assets/animal-codex-atlas.png?v=20260806b"));
  background-repeat:no-repeat;background-size:500% 400%;background-position:var(--sx) var(--sy)}
.ranch-sprite-alpaca{background-image:url("${BASE}/assets/alpaca-codex.png?v=20260806c");background-size:100% 100%;background-position:center}
.ranch-codex-item.locked .ranch-sprite{filter:grayscale(.85);opacity:.58}
.ranch-codex-name{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px;font-family:var(--serif);font-weight:700}
.ranch-codex-state{flex:0 0 auto;border-radius:999px;padding:0 6px;font:600 10px/1.8 system-ui;color:var(--ink-soft);background:#edf2e8}
.ranch-codex-state.owned{color:#3d7c43;background:#e1f2d8}.ranch-codex-state.open{color:#9a7024;background:#fff0ca}
.ranch-codex-meta{margin-top:3px;font-size:11.5px;line-height:1.55;color:var(--ink-soft)}
.ranch-codex-meta b{color:var(--ink);font-weight:650}
.ranch-codex-effect{margin-top:5px;padding-top:5px;border-top:1px dashed var(--line);font-size:11px;line-height:1.5;color:var(--ink-soft)}
.ranch-owned-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;margin-top:12px}
.ranch-owned-tile{appearance:none;min-width:0;padding:9px 8px 10px;border:1px solid var(--line);border-radius:14px;
  background:rgba(247,252,242,.86);color:var(--ink);font:inherit;text-align:center;cursor:pointer;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease}
.ranch-owned-tile:hover{transform:translateY(-2px);border-color:var(--leaf);box-shadow:0 8px 18px #315b2424}
.ranch-owned-tile:focus-visible{outline:2px solid var(--leaf-deep);outline-offset:2px}
.ranch-owned-tile .ranch-sprite{width:min(88px,100%);margin:0 auto;background-color:#e6f3d8}
.ranch-owned-name{display:block;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--serif);font-weight:700}
.ranch-owned-level{display:block;margin-top:1px;color:var(--ink-soft);font-size:11px}
.ranch-animal-back{z-index:70;overflow-y:auto}
.sheet.ranch-animal-sheet{max-width:480px;margin:auto 0;flex:0 0 auto;border-top-color:var(--leaf);padding:15px 17px 14px}
.ranch-animal-x{position:absolute;top:10px;right:10px;width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:50%;
  background:transparent;color:var(--ink-soft);font:700 16px/1 system-ui;cursor:pointer}
.ranch-animal-x:hover{color:var(--leaf-deep);background:#e8f3de}
.ranch-animal-x:focus-visible,.ranch-animal-sheet .btn:focus-visible,.ranch-animal-sheet :is(input,select):focus-visible{outline:2px solid var(--leaf-deep);outline-offset:2px}
.ranch-animal-sheet .small{font-size:11.5px;line-height:1.45}
.ranch-animal-sheet .btn{padding:6px 10px;font-size:12px}
.ranch-animal-sheet .inp{padding:6px 8px;font-size:12px}
.ranch-animal-head{display:grid;grid-template-columns:84px minmax(0,1fr);gap:11px;align-items:center;padding-right:28px}
.ranch-animal-head .ranch-sprite{width:84px;background-color:#e6f3d8}
.ranch-animal-head h2{margin:0;font-family:var(--serif);font-size:19px;line-height:1.35;color:#2f5a31}
.ranch-animal-intro{margin:3px 0 0;color:var(--ink-soft);font-size:11.5px;line-height:1.45}
.ranch-animal-status{margin-top:9px;padding:8px 9px;border:1px solid var(--line);border-radius:10px;background:#f5faef}
.ranch-animal-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:8px}
.ranch-animal-actions>form{max-width:100%}
.ranch-animal-actions input[name="name"]{min-width:0;flex:1 1 130px}
.ranch-animal-dispatch{margin-top:8px}
.ranch-animal-sheet .raid-form{gap:6px;margin-top:0;padding-top:7px}
.raid-form{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 0;padding-top:8px;border-top:1px dashed var(--line)}
.raid-form label{display:flex;gap:5px;align-items:center;color:var(--ink-soft);white-space:nowrap}
.raid-form select{max-width:260px}.raid-form .raid-hours{width:76px}
.raid-form :is(select,input,button):focus-visible{outline:2px solid var(--leaf-deep);outline-offset:2px}
.raid-history{padding:0;overflow:hidden}
.raid-history>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:10px 16px;
  cursor:pointer;list-style:none;color:var(--wood);font-family:var(--serif);font-weight:700}
.raid-history>summary::-webkit-details-marker{display:none}
.raid-history>summary::after{content:"⌄";font-family:var(--sans);font-size:18px;color:var(--ink-soft);transition:transform .15s ease}
.raid-history[open]>summary::after{transform:rotate(180deg)}
.raid-history>summary:focus-visible{outline:2px solid var(--leaf-deep);outline-offset:-3px}
.raid-history>summary:active{background:#eef7e3}
.raid-history-body{padding:8px 16px 14px;border-top:1px dashed var(--line)}
/* 手机端：按钮收小一点（一键收获等不再过大），动物行允许换行——名称/产出独占一行，pin/升级按钮落到下一行，不再被挤成一字一行 */
@media(max-width:560px){
  .btn{padding:7px 12px;font-size:13px}
  .animal{flex-wrap:wrap;gap:6px 10px}
  .animal .am{flex:1 1 100%}
  .animal .ready{font-size:16px}
  .ranch-scene{aspect-ratio:1;background-image:url("${BASE}/assets/ranch-scene-background-mobile.png?v=20260803c");background-position:center}
  .ranch-anchor{width:clamp(40px,12vw,48px)}
  .ranch-codex-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .ranch-codex-item{padding:7px}
  .ranch-owned-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
  .ranch-owned-tile{padding:7px 5px 8px}.ranch-owned-tile .ranch-sprite{width:100%}
  .mback.ranch-animal-back{align-items:flex-end;padding:8px}
  .sheet.ranch-animal-sheet{max-height:88vh;padding:13px 12px 12px;border-radius:16px 16px 11px 11px}
  .ranch-animal-head{grid-template-columns:68px minmax(0,1fr);gap:9px}.ranch-animal-head .ranch-sprite{width:68px}
  .ranch-animal-head h2{font-size:17px}.ranch-animal-x{top:6px;right:6px;width:28px;height:28px;font-size:14px}
  .ranch-animal-actions form[method="post"]{flex-wrap:wrap}
  .raid-form{align-items:stretch}
  .raid-form label:first-of-type{flex:1 1 100%}.raid-form select{width:100%;max-width:none}
}
@media(prefers-reduced-motion:reduce){.ranch-scene-sprite{animation:none!important}}

/* 流光原野：人类只读观察页 */
.glimmer-scene{position:relative;min-height:300px;border-radius:18px;overflow:hidden;background:#223c45 url("${BASE}/assets/glimmer/map-scene.webp?v=20260809b") center/cover no-repeat;color:#fff;box-shadow:inset 0 0 0 1px #ffffff44}
.glimmer-scene::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#102b3130 25%,#102b31d8 100%);pointer-events:none}
.glimmer-scene-copy{position:absolute;z-index:1;left:20px;right:20px;bottom:18px;text-shadow:0 2px 8px #102b31}
.glimmer-scene-copy h1{margin:0 0 5px;font-family:var(--serif);font-size:30px}.glimmer-scene-copy p{margin:3px 0;line-height:1.65}
.glimmer-track-grid,.glimmer-variant-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;margin-top:10px}
.glimmer-track,.glimmer-variant{padding:9px;border:1px solid var(--line);border-radius:13px;background:#f6fbf0;text-align:center}
.glimmer-track .ranch-sprite,.glimmer-variant .ranch-sprite{background-color:#e9f4da}
.glimmer-variant.locked .ranch-sprite{filter:grayscale(1);opacity:.38}.glimmer-variant.locked{color:var(--ink-soft);background:#f1f3ed}
.glimmer-name{display:block;margin-top:6px;font-family:var(--serif);font-weight:700}.glimmer-meta{display:block;margin-top:2px;font-size:11px;color:var(--ink-soft)}
.glimmer-progress{height:9px;margin:9px 0 5px;border-radius:999px;background:#dfe9d8;overflow:hidden}.glimmer-progress>span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#70b45a,#d8b150)}
.glimmer-log{padding:8px 0;border-top:1px dashed var(--line);font-size:13px}.glimmer-log:first-child{border-top:0}
@media(max-width:560px){.glimmer-scene{min-height:330px;aspect-ratio:1}.glimmer-scene-copy{left:14px;right:14px;bottom:14px}.glimmer-scene-copy h1{font-size:25px}.glimmer-track-grid,.glimmer-variant-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}}

/* 图鉴册：分类锚点导航 + 标本位 */
.codexnav{display:flex;flex-wrap:wrap;gap:8px;position:sticky;top:49px;z-index:4;
  margin:18px 0 4px;padding:8px 0;background:linear-gradient(180deg,#f3f9ec 70%,transparent)}
.codexnav a{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.78);
  border:1px solid var(--line);border-radius:999px;padding:5px 13px;font-size:13px;color:var(--ink-soft)}
.codexnav a:hover{color:var(--leaf-deep);background:#e6f3d8}
.codexnav b{font-family:var(--serif);color:var(--leaf-deep)}
.secthead{display:flex;align-items:baseline;gap:10px;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.secthead h2{font-family:var(--serif);font-size:21px;margin:0;color:#2f5a31}
.secthead .cnt{font-size:13px;color:var(--ink-soft)}
.secthead .cnt b{font-family:var(--serif);color:var(--leaf-deep);font-size:15px}
.specimens{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:11px}
.spec{position:relative;border:1px solid var(--line);border-left:4px solid var(--c,var(--line));
  border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.68);min-height:78px}
.spec.locked{opacity:.6;filter:grayscale(.55);border-left-color:#cdd9c3}
.spec .nm{font-family:var(--serif);font-weight:700;font-size:15px;color:var(--ink);line-height:1.3}
.spec .latin{font-style:italic;font-size:11px;color:var(--ink-soft);margin:1px 0 6px}
.spec .sm{font-size:11.5px;color:var(--ink-soft)}
.spec .q{display:inline-block;font-size:11px;font-weight:700;color:var(--gold);
  background:#fff6e2;border:1px solid #ecd9a6;border-radius:6px;padding:0 6px}
.spec .lk{position:absolute;top:9px;right:10px;font-size:13px}
.emptybox{border:1px dashed var(--line);border-radius:12px;padding:18px;text-align:center;color:var(--ink-soft);font-size:13px}
.spec[data-detail]{cursor:pointer;transition:transform .12s ease,box-shadow .12s ease}
.spec[data-detail]:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
/* ⭐ 图鉴星标：标本右上角小星，收藏进「我的收藏」栏（不触发细节弹窗）*/
.spec .starf{position:absolute;top:5px;right:6px;margin:0;line-height:1;z-index:2}
.spec .nm{padding-right:20px}
.starbtn{border:0;background:none;cursor:pointer;font-size:17px;line-height:1;padding:2px;color:#c9b784;transition:transform .1s ease}
.starbtn:hover{transform:scale(1.2)}
.starbtn.on{color:var(--gold)}

/* 标本细节弹窗 */
.mback{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;padding:20px;
  background:rgba(40,60,40,.34);backdrop-filter:blur(3px)}
.mback.show{display:flex}
.sheet{position:relative;width:100%;max-width:440px;max-height:86vh;overflow:auto;
  background:var(--paper2);border:1px solid var(--line);border-top:5px solid var(--c,var(--leaf));
  border-radius:18px;padding:22px 22px 20px;box-shadow:0 30px 70px -30px #2f5a2eaa}
.sheet .x{position:absolute;top:11px;right:15px;font-size:19px;line-height:1;color:var(--ink-soft);cursor:pointer}
.sheet .x:hover{color:var(--leaf-deep)}
.sheet .mt{font-family:var(--serif);font-size:24px;margin:0;color:#2f5a31;padding-right:26px}
.sheet .mlatin{font-style:italic;color:var(--ink-soft);font-size:13px;margin:2px 0 12px}
.sheet .mmeta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 9px;font-size:12.5px;color:var(--ink-soft);
  padding-bottom:13px;border-bottom:1px solid var(--line)}
.sheet .blk{margin:13px 0 0}
.sheet .blk .lbl{font-size:12px;font-weight:700;color:var(--wood);letter-spacing:.5px}
.sheet .blk p.v{margin:3px 0 0;font-size:14px;line-height:1.75}
.sheet .quote{font-family:var(--serif);font-style:italic;color:#4a6b48;
  background:#f3f9ec;border-left:3px solid var(--leaf);border-radius:0 9px 9px 0;padding:8px 12px;margin:4px 0 0}

/* 排行榜：带相对值条形背景的榜行 + 高亮小克 */
.lbrow{position:relative;display:flex;align-items:center;gap:10px;padding:7px 9px;margin:2px 0;border-radius:10px;overflow:hidden}
.lbrow>*{position:relative;z-index:1}
.lbrow .fill{position:absolute;left:0;top:0;bottom:0;z-index:0;border-radius:10px}
.lbrow .rk{flex:0 0 auto;width:24px;text-align:center;font-family:var(--serif);font-weight:700;font-size:14px;color:var(--ink-soft)}
.lbrow.top1 .rk,.lbrow.top2 .rk,.lbrow.top3 .rk{font-size:16px}
.lbrow .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}
.lbrow .nm .by{font-size:12px;color:var(--ink-soft)}
.lbrow .nm .lbtitle{font-weight:400;font-size:12.5px;margin-right:4px;color:#b29a5e;opacity:.85;letter-spacing:.2px}
.lbrow .nm .cpnm{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;
  border-bottom:1px dotted var(--ink-soft);vertical-align:baseline;transition:color .15s}
.lbrow .nm .cpnm:hover{color:var(--leaf-deep);border-bottom-color:var(--leaf-deep)}
.lbrow .nm .cpnm:focus-visible{outline:2px solid var(--leaf-deep);outline-offset:3px;border-radius:3px}
.lbrow .nm .cpnm.copied{color:var(--leaf-deep);border-bottom-style:solid;font-weight:600}
.lbrow.me{box-shadow:inset 0 0 0 1.5px var(--leaf)}
.lbrow .metag{display:inline-block;font-size:10.5px;font-weight:700;color:#fff;background:var(--leaf-deep);
  border-radius:6px;padding:0 5px;margin-left:6px;vertical-align:1px}
.lbrow .v{flex:0 0 auto;font-family:var(--serif);font-weight:700;color:#2f5a31;font-size:15px}
.lbrow .v .vu{font-size:11px;color:var(--ink-soft);font-weight:400;margin-left:1px}
.lbrow.off{margin-top:8px;border-radius:0;border-top:1px dashed var(--line);box-shadow:none}
.lbrow.off .rk{color:var(--leaf-deep)}
.lbnote{font-size:12px;color:var(--ink-soft);margin-top:8px;padding-top:7px;border-top:1px dashed var(--line)}

/* 排行榜：邻居农场资料弹窗 —— 复用已稳定运行的 mback + sheet，不依赖原生 dialog */
.fprof-back{z-index:60;align-items:flex-start;overflow-y:auto}
.fprof-sheet{max-height:none;margin:auto 0;flex:0 0 auto;border-top-color:var(--leaf)}
.fprof-x{position:absolute;top:10px;right:10px;width:32px;height:32px;display:grid;place-items:center;
  border:0;border-radius:50%;background:transparent;color:var(--ink-soft);font:700 16px/1 system-ui;cursor:pointer}
.fprof-x::before{content:"";position:absolute;inset:-6px}
.fprof-x:hover{color:var(--leaf-deep);background:#e8f3de}
.fprof-x:focus-visible,.fprof-back .btn:focus-visible{outline:2px solid var(--leaf-deep);outline-offset:2px}
.fprof-name{margin:0;padding-right:36px;font-family:var(--serif);font-size:clamp(22px,6vw,28px);line-height:1.3;color:#2f5a31}
.fprof-owner{margin:5px 0 0;color:var(--ink-soft)}
.fprof-welcome{margin:8px 36px 16px 0;padding-left:10px;border-left:2px solid var(--leaf);
  font-family:var(--serif);font-style:italic;font-size:13px;line-height:1.65;color:#4a6b48}
.fprof-door{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;padding:13px 0;
  border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.fprof-copy{position:relative;min-height:32px;padding:4px 10px;font-size:12px;line-height:1.2}
.fprof-copy::before{content:"";position:absolute;inset:-6px -4px}
.fprof-label{font-size:12px;font-weight:700;color:var(--wood);letter-spacing:.5px}
.fprof-code{display:block;margin-top:2px;font-family:var(--serif);font-size:19px;font-weight:700;letter-spacing:1.5px;color:var(--ink)}
.fprof-crops{margin-top:17px}
.fprof-crop-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
.fprof-crop{display:inline-flex;align-items:center;min-height:30px;padding:3px 10px;border:1px solid var(--line);
  border-radius:999px;background:#f3f8ed;color:#3f6340;font-size:13px}
.fprof-empty{margin-top:4px;color:var(--ink-soft)}
@media(max-width:480px){.fprof-door{gap:8px}}
/* 料理台：背景、锅、木盖三层分离；动画只动 transform/opacity。 */
.cook-layout{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(280px,.82fr);gap:14px;align-items:start}
.cook-stage-card{padding:0;overflow:hidden;background:#6f3f28}
.cook-stage{position:relative;isolation:isolate;aspect-ratio:1;overflow:hidden;background:#ad744c url("${BASE}/assets/cooking/cooking-scene-bg.webp?v=20260804a") center/cover no-repeat}
.cook-pot{position:absolute;z-index:3;left:28.5%;top:41%;width:43%;filter:drop-shadow(0 8px 7px #32160866);image-rendering:pixelated;transform-origin:50% 88%}
.cook-lid{position:absolute;visibility:hidden;z-index:8;left:30.2%;top:42%;width:39.6%;filter:drop-shadow(0 6px 5px #32160855);image-rendering:pixelated;transform:translateY(-82%) rotate(-8deg) scale(.94);transform-origin:50% 108%;opacity:0;pointer-events:none}
.cook-stage.is-cooking .cook-lid{visibility:visible;animation:cook-lid-close 1.55s cubic-bezier(.22,.78,.24,1) both}
.cook-stage.is-cooking .cook-pot{animation:cook-shake .96s ease-in-out .56s both}
.cook-fire{position:absolute;z-index:4;left:50%;top:66%;width:18%;aspect-ratio:1;transform:translate(-50%,-50%) scale(.4);opacity:0;border-radius:50%;background:radial-gradient(circle,#fff59d 0 16%,#ffb229 18% 38%,#ef5b2e 40% 58%,transparent 60%);filter:blur(1px)}
.cook-stage.is-cooking .cook-fire{animation:cook-fire 1.15s ease .35s both}
.cook-sparks{position:absolute;z-index:9;left:50%;top:48%;width:32%;height:24%;transform:translate(-50%,-50%);opacity:0;pointer-events:none;background:radial-gradient(circle at 12% 70%,#ffd461 0 2%,transparent 3%),radial-gradient(circle at 80% 45%,#fff2a0 0 2%,transparent 3%),radial-gradient(circle at 60% 12%,#ff9b42 0 2.4%,transparent 3.4%),radial-gradient(circle at 35% 28%,#ffe891 0 2%,transparent 3%)}
.cook-stage.is-cooking .cook-sparks{animation:cook-sparks 1s ease .42s both}
.cook-pot-items{position:absolute;z-index:10;left:12px;right:12px;bottom:12px;display:grid;grid-template-columns:repeat(5,44px);justify-content:center;gap:6px;transition:opacity .16s ease,transform .16s ease}
.cook-stage.is-cooking .cook-pot-items{opacity:0;transform:translateY(8px) scale(.96)}
.cook-pot-slot{display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid #fff2c4;border-radius:11px;background:#fff8dbc9;color:inherit;font:21px/1 system-ui;box-shadow:0 3px 8px #3b1c1544;animation:cook-chip-in .22s ease both}
button.cook-pot-slot{cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
button.cook-pot-slot:active{background:#fff1b8}
.cook-slot-icon{display:block;width:34px;height:34px;background:url("${BASE}/assets/cooking/ingredient-atlas.webp?v=20260806a") calc(var(--item-x)*16.666667%) calc(var(--item-y)*20%)/700% 600% no-repeat;image-rendering:pixelated;pointer-events:none}
.cook-slot-icon.fish-item-icon,.cook-pick-icon.fish-item-icon{background-image:url("${BASE}/assets/cooking/fishing-cooking-atlas.png?v=20260805fish1");background-position:0 100%;background-size:300% 300%}
.cook-pot-slot.empty{border-style:dashed;background:#3c211e66;box-shadow:inset 0 2px 7px #1e0d0b55;animation:none}
.cook-pot-slot.empty::before{content:"＋";color:#fff2c477;font:500 18px/1 system-ui}
.cook-counter{position:absolute;right:12px;top:10px;z-index:10;padding:4px 10px;border-radius:999px;background:#2d1d18c9;color:#fff7dd;font-size:12px;backdrop-filter:blur(4px)}
.cook-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.cook-pick{position:relative;appearance:none;min-height:72px;padding:8px;border:1px solid var(--line);border-radius:13px;background:#fffdf7;color:var(--ink);font:inherit;cursor:pointer;text-align:center;transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease}
.cook-pick:hover{transform:translateY(-2px);border-color:#e6a854;box-shadow:0 8px 16px #67401d22}.cook-pick:focus-visible{outline:2px solid #d58b35;outline-offset:2px}
.cook-pick[aria-pressed="true"]{border-color:#d58b35;background:#fff0cf;box-shadow:0 0 0 2px #e3a44f33 inset}
.cook-pick-icon{display:block;width:42px;height:42px;margin:0 auto 3px;background:url("${BASE}/assets/cooking/ingredient-atlas.webp?v=20260806a") calc(var(--item-x)*16.666667%) calc(var(--item-y)*20%)/700% 600% no-repeat;image-rendering:pixelated}.cook-pick-name{display:block;font-size:12px;font-weight:700}.cook-pick-stock{display:block;font-size:10px;color:var(--ink-soft)}
.cook-slot-icon.second-item-icon,.cook-pick-icon.second-item-icon{background-image:url("${BASE}/assets/cooking/ingredient-atlas-2.webp?v=20260810a");background-position:calc(var(--item-x)*33.333333%) calc(var(--item-y)*100%);background-size:400% 200%}
.cook-pick-qty{position:absolute;right:5px;top:5px;min-width:25px;height:21px;display:grid;place-items:center;padding:0 5px;border-radius:999px;background:#713b2f;color:#fff8e7;font:800 12px/1 system-ui;box-shadow:0 2px 5px #32160844;pointer-events:none}
.cook-recipe-list{max-height:320px;overflow-y:auto;overscroll-behavior:contain;padding-right:3px}
.cook-recipe-trigger{position:relative;appearance:none;font:inherit;cursor:pointer}.cook-recipe-trigger::before{content:"";position:absolute;inset:-6px}
.cook-recipe-trigger:hover{border-color:#d9a45b;background:#fff7e5}.cook-recipe-trigger:focus-visible{outline:2px solid #d58b35;outline-offset:2px}
.cook-recipe-back{z-index:110}.sheet.cook-recipe-sheet{max-width:680px;border-top-color:#d9a45b}
.cook-recipe-cats{display:flex;gap:7px;overflow-x:auto;padding:2px 0 9px;scrollbar-width:none}.cook-recipe-cats::-webkit-scrollbar{display:none}
.cook-recipe-cat{flex:0 0 auto;border:1px solid var(--line);border-radius:999px;background:#fffaf0;color:var(--ink-soft);font:inherit;font-size:12px;font-weight:700;padding:7px 11px;cursor:pointer}.cook-recipe-cat[aria-selected="true"]{border-color:#d9a45b;background:#fff0cd;color:#754518}
.cook-recipe-section[hidden]{display:none}
.cook-recipe-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0 14px}
.cook-recipe-entry{display:grid;grid-template-columns:58px minmax(0,1fr);gap:10px;align-items:start;padding:10px 0;border-top:1px dashed var(--line)}
.cook-recipe-entry :is(.dish-sprite,.dish-thumb){width:58px;height:58px}.cook-recipe-head{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.cook-recipe-make{min-height:44px;margin-top:7px;padding:7px 12px}.cook-recipe-missing{margin-top:7px;color:#8d4f2e;font-size:11px;font-weight:700;line-height:1.45}
.cook-recipe-needs{margin-top:5px;color:var(--ink-soft);font-size:11px;line-height:1.5}.cook-recipe-needs b{color:var(--ink);font-weight:650}
.silver-coin{display:inline-grid;width:1.05em;height:1.05em;margin-right:2px;vertical-align:-.14em;border:1px solid #7f8a91;border-radius:50%;background:radial-gradient(circle at 34% 28%,#fff 0 10%,#dce3e6 32%,#9ca8ae 72%,#eef1f2 100%);box-shadow:inset 0 0 0 2px #f7f9f988,0 1px 1px #32434a33}.silver-coin::after{content:"";width:42%;height:42%;place-self:center;border:1px solid #879299;border-radius:50%;box-shadow:inset 0 1px #fff9}
.cook-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.cook-actions .btn{min-height:44px}
.cook-sell-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0}.cook-sell-qty{display:flex;align-items:center;gap:4px;color:var(--ink-soft);white-space:nowrap}.cook-sell-qty .inp{width:62px;padding:7px 6px;text-align:center}.cook-sell-form .cook-price{width:102px}
.cook-result{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:20px;background:#25140fa8;backdrop-filter:blur(5px);animation:cook-fade .2s ease both}
.cook-result-card{position:relative;width:min(360px,100%);padding:22px;border:3px solid var(--rarity,var(--N));border-radius:22px;background:linear-gradient(180deg,#fffdf5,#f5ead5);box-shadow:0 24px 70px #1f0d09aa;text-align:center;animation:cook-card-pop .42s cubic-bezier(.2,.9,.3,1.2) both}
.dish-sprite{display:block;width:54px;height:54px;background:url("${BASE}/assets/cooking/dish-atlas.webp?v=20260806a") calc(var(--dish-x)*20%) calc(var(--dish-y)*11.111111%)/600% 1000% no-repeat;image-rendering:pixelated}
.dish-sprite.fish-dish-sprite{background-image:url("${BASE}/assets/cooking/fishing-cooking-atlas.png?v=20260805fish1");background-position:calc(var(--fish-dish-x)*50%) calc(var(--fish-dish-y)*50%);background-size:300% 300%}
.dish-sprite.second-dish-sprite{background-image:url("${BASE}/assets/cooking/dish-atlas-2.webp?v=20260810a");background-position:calc(var(--dish2-x)*25%) calc(var(--dish2-y)*20%);background-size:500% 600%}
.dish-thumb{display:block;width:54px;height:54px;object-fit:contain;image-rendering:pixelated}
.cook-result-card :is(.dish-sprite,.dish-thumb){width:160px;height:160px;margin:0 auto 10px}.cook-result-card h2{margin:0;font-family:var(--serif);color:#50351f}.cook-result-x{position:absolute;top:8px;right:8px;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:#715849;font-size:20px;cursor:pointer}
.cook-rarity{display:inline-block;margin:7px 0;padding:2px 10px;border:1px solid var(--rarity,var(--N));border-radius:999px;color:var(--rarity,var(--N));font-weight:800}
.cook-stock-list{max-height:330px;overflow:auto;overscroll-behavior:contain}.cook-stock-row{padding:8px 0;border-top:1px dashed var(--line)}
@keyframes cook-lid-close{0%{opacity:0;transform:translateY(-82%) rotate(-8deg) scale(.94)}18%{opacity:1}36%{opacity:1;transform:translateY(0) rotate(0) scale(1)}44%{transform:translateY(0) rotate(-15deg) scale(1)}52%{transform:translateY(0) rotate(15deg) scale(1)}60%{transform:translateY(0) rotate(-15deg) scale(1)}68%{transform:translateY(0) rotate(15deg) scale(1)}76%{transform:translateY(0) rotate(-15deg) scale(1)}84%{transform:translateY(0) rotate(15deg) scale(1)}92%{transform:translateY(0) rotate(-10deg) scale(1)}100%{opacity:1;transform:translateY(0) rotate(0) scale(1)}}
@keyframes cook-lid-reduced{from{opacity:0;transform:translateY(-18%) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes cook-shake{0%,100%{transform:rotate(0)}12.5%{transform:rotate(-15deg)}25%{transform:rotate(15deg)}37.5%{transform:rotate(-15deg)}50%{transform:rotate(15deg)}62.5%{transform:rotate(-15deg)}75%{transform:rotate(15deg)}87.5%{transform:rotate(-10deg)}}
@keyframes cook-fire{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}25%,78%{opacity:.9;transform:translate(-50%,-50%) scale(1.08)}100%{opacity:0;transform:translate(-50%,-50%) scale(.45)}}
@keyframes cook-sparks{0%{opacity:0;transform:translate(-50%,-35%) scale(.7)}35%,70%{opacity:1}100%{opacity:0;transform:translate(-50%,-76%) scale(1.12)}}
@keyframes cook-chip-in{from{opacity:0;transform:translateY(8px)}}@keyframes cook-fade{from{opacity:0}}@keyframes cook-card-pop{from{opacity:0;transform:translateY(28px) scale(.86)}}
@media(max-width:760px){.cook-layout{grid-template-columns:1fr}.cook-stage{aspect-ratio:1}.cook-pick-grid{grid-template-columns:repeat(3,1fr)}.cook-result-card{padding:18px}.cook-result-card :is(.dish-sprite,.dish-thumb){width:132px;height:132px}.mback.cook-recipe-back{align-items:flex-end;padding:8px}.sheet.cook-recipe-sheet{max-height:88vh;border-radius:16px 16px 11px 11px}}
@media(max-width:390px){.cook-pick-grid{grid-template-columns:repeat(2,1fr)}}
@media(prefers-reduced-motion:reduce){.cook-stage *,.cook-result,.cook-result-card,.cook-pick{animation:none!important;transition:none!important}.cook-stage.is-cooking .cook-lid{animation:cook-lid-reduced .24s ease-out both!important}.cook-lid{transform:translateY(-18%) scale(.98)}}
footer{color:var(--ink-soft);font-size:12px;text-align:center;padding:30px 0 0}
`;
function nav(key, active) {
    const items = [
        ["", "🏡 主页"], ["ranch", "🐮 我的牧场"], ["glimmer", "✨ 流光原野"], ["together", "🧭 铃野共行"], ["cooking", "🍳 料理台"], ["market", "🧺 集市"], ["ta", "✍️ TA的农场"], ["expedition", "🗺️ 探险"], ["codex", "📖 图鉴册"], ["messages", "📮 留言板"], ["leaderboard", "🏆 排行榜"],
    ];
    return items.map(([seg, label]) => {
        const href = `${BASE}/ui/${key}${seg ? "/" + seg : ""}`;
        return `<a href="${href}"${seg === active ? ' class="on"' : ""}>${label}</a>`;
    }).join("");
}
/** 页脚署名：人类伴侣名（回落"伴侣"）+ AI 真实名（回落"AI"）。 */
export const farmNames = (f) => ({ ai: f.aiName || "AI", human: f.humanName || "伴侣" });
export const farmLabel = (f) => `${f.name}（${f.aiName || "AI"}）`;
/** 料理台买卖沿用现有 POST/303，只把最终服务端 HTML 中会变化的区域同步回来，避免整页导航。 */
const COOKING_ASYNC_SCRIPT = `<script>(()=>{
  if(window.__farmCookingAsync)return;window.__farmCookingAsync=true;
  const copyText=(next,id)=>{const a=document.getElementById(id),b=next.getElementById(id);if(a&&b)a.textContent=b.textContent;};
  const copyHtml=(next,id,keepDetails=false)=>{const a=document.getElementById(id),b=next.getElementById(id);if(!a||!b)return;const opened=keepDetails?[...a.querySelectorAll("details")].map(x=>x.open):[];a.innerHTML=b.innerHTML;if(keepDetails)[...a.querySelectorAll("details")].forEach((x,i)=>x.open=opened[i]??x.open);};
  const showNotice=next=>{const source=next.getElementById("human-notice");if(!source)return;document.getElementById("human-notice")?.remove();const box=document.importNode(source,true);document.body.appendChild(box);const close=()=>box.classList.remove("show");box.addEventListener("click",e=>{if(e.target===box||e.target.closest("[data-close]"))close();});const key=e=>{if(e.key==="Escape"){close();document.removeEventListener("keydown",key);}};document.addEventListener("keydown",key);};
  document.addEventListener("submit",async event=>{
    const form=event.target.closest?.("form[data-cooking-async]");
    if(!form||event.defaultPrevented)return;
    event.preventDefault();
    if(event.submitter)event.submitter.disabled=true;
    const body=new URLSearchParams();
    for(const [name,value] of new FormData(form))if(typeof value==="string")body.append(name,value);
    if(event.submitter?.name&&!body.has(event.submitter.name))body.append(event.submitter.name,event.submitter.value);
    try{
      const response=await fetch(form.action,{method:"POST",body,credentials:"same-origin"});
      if(!response.ok)throw new Error("request failed");
      const next=new DOMParser().parseFromString(await response.text(),"text/html");
      if(!next.getElementById("cookingShop"))throw new Error("invalid page");
      const x=scrollX,y=scrollY;
      copyText(next,"cookingSilverBalance");copyText(next,"cookingRanchBalance");copyText(next,"cookingRecipeCount");copyText(next,"cookRecipeTitle");
      copyHtml(next,"cookingFeedback");copyHtml(next,"cookPicker");copyHtml(next,"cookingShop",true);copyHtml(next,"cookingPantry");copyHtml(next,"cookingDishes");copyHtml(next,"cookRecipeList");
      showNotice(next);
      document.dispatchEvent(new Event("farm:cooking-updated"));
      requestAnimationFrame(()=>scrollTo(x,y));
    }catch{location.reload();}
  });
})();</script>`;
/** 牧场操作沿用现有 POST/303，只替换牧场动态内容，保留滚动、折叠与当前动物弹窗。 */
export function page(title, key, active, body, names) {
    const human = esc(names?.human || "伴侣");
    const ai = esc(names?.ai || "AI");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body><header class="top"><div class="topin"><span class="brand">🌾 田园标本馆</span><nav>${nav(key, active)}</nav></div></header>
<div class="wrap">${body}
<footer><div style="color:var(--wood);font-weight:600;margin-bottom:4px">🔒 此链接含访问密钥，请勿转发或暴露给他人</div>
这是只给${human}看的观光页 · 真正在田里劳作的是 ${ai}</footer></div>${COOKING_ASYNC_SCRIPT}</body></html>`;
}
