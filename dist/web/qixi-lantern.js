import { qixiLantern2026 } from "../content.js";
import { qixiLantern2026PrivateData, qixiLantern2026TaskView, qixiLantern2026Window } from "../qixi-lantern-2026.js";
import { BASE } from "../config.js";
import { esc, farmNames, page } from "./shell.js";

const SCENE_URLS = {
    objects: `${BASE}/assets/qixi-2026/objects-discovery-bg-v3.jpg`,
    return: `${BASE}/assets/qixi-2026/objects-return-bg-v3.jpg`,
    lanternNight: `${BASE}/assets/qixi-2026/lantern-night-bg-v4.jpg`,
};
const LAMP_SHAPE_POS = { "square-palace": "0%", "octagonal-palace": "50%", "lotus-palace": "100%" };
const LAMP_COLOR_POS = { "moon-white": "0%", "peach-pink": "33.333%", "mist-blue": "66.667%", "apricot-gold": "100%" };
const LAMP_COLOR_SWATCH = { "moon-white": "#eef3f0", "peach-pink": "#f4b9bf", "mist-blue": "#a9c7df", "apricot-gold": "#f2c77d" };
const LAMP_DECOR_POS = { "short-tassel": ["0%", "0%"], "fine-copper-bell": ["50%", "0%"], "magpie-ribbon": ["100%", "0%"], "star-speckle": ["0%", "33.333%"], "qiaoguo-pattern": ["50%", "33.333%"], "river-glow": ["100%", "33.333%"], "cotton-knot": ["0%", "66.667%"], "waterproof-seal": ["50%", "66.667%"], "cloud-knot": ["100%", "66.667%"], "magpie-bridge": ["0%", "100%"], "twin-jade-pendant": ["50%", "100%"], "twin-blossom-seal": ["100%", "100%"] };
const LAMP_CHOICE_LAYOUTS = {
    "square-palace": { x: -8, y: 0, w: 46, h: 42 },
    "octagonal-palace": { x: 0, y: 0, w: 46, h: 42 },
    "lotus-palace": { x: 10, y: 0, w: 46, h: 42 },
};
const LAMP_LAYOUTS = {
    "square-palace": { base: { x: -28, y: -6, w: 180, h: 135 }, pattern: { x: 67, y: 47, w: 64, h: 64 }, ornament: { x: 61, y: 119, w: 68, h: 68 }, seal: { x: 71, y: 15, w: 51, h: 51 } },
    "octagonal-palace": { base: { x: 6, y: -5, w: 180, h: 135 }, pattern: { x: 61, y: 43, w: 64, h: 64 }, ornament: { x: 57, y: 120, w: 68, h: 68 }, seal: { x: 74, y: 20, w: 51, h: 51 } },
    "lotus-palace": { base: { x: 42, y: -5, w: 180, h: 135 }, pattern: { x: 66, y: 53, w: 64, h: 64 }, ornament: { x: 59, y: 118, w: 68, h: 68 }, seal: { x: 71, y: 16, w: 51, h: 51 } },
};
const LAMP_NEW_DECOR_LAYOUTS = {
    "magpie-bridge": {
        "square-palace": { x: 67, y: 47, w: 64, h: 64 },
        "octagonal-palace": { x: 61, y: 43, w: 64, h: 64 },
        "lotus-palace": { x: 66, y: 53, w: 64, h: 64 },
    },
    "twin-jade-pendant": {
        "square-palace": { x: 61, y: 119, w: 68, h: 68 },
        "octagonal-palace": { x: 57, y: 120, w: 68, h: 68 },
        "lotus-palace": { x: 59, y: 118, w: 68, h: 68 },
    },
    "twin-blossom-seal": {
        "square-palace": { x: 71, y: 15, w: 51, h: 51 },
        "octagonal-palace": { x: 74, y: 20, w: 51, h: 51 },
        "lotus-palace": { x: 71, y: 16, w: 51, h: 51 },
    },
};
const LAMP_MAGPIE_LAYOUTS = {
    "square-palace": { x: 64, y: 108, w: 68, h: 68 },
    "octagonal-palace": { x: 59, y: 110, w: 68, h: 68 },
    "lotus-palace": { x: 55, y: 112, w: 68, h: 68 },
};
const QIXI_STYLE = `<style>
.qixi-event-active,body:has(.qixi-page){overflow:hidden;background:#c7d7e4}.qixi-event-active>.top,body:has(.qixi-page)>.top{display:none}.qixi-event-active>.wrap,body:has(.qixi-page)>.wrap{max-width:none;padding:0}.qixi-event-active>.wrap>footer,body:has(.qixi-page)>.wrap>footer{display:none}
.qixi-page{--ivory:#fff4e8;--paper:rgba(255,247,234,.95);--paper-soft:rgba(255,249,240,.86);--gold:#c89b63;--gold-dark:#a97847;--ink:#695363;--rose:#a86578;--blue:#687fa7;--qixi-plaque-width:183px;--qixi-plaque-height:56px;--qixi-plaque-font:15px;position:relative;isolation:isolate;width:min(100%,520px);height:100svh;min-height:620px;margin:0 auto;overflow:hidden;color:var(--ink);background:#c5d7e8 var(--qixi-scene) center top/cover no-repeat;font-family:var(--serif)}.qixi-page button,.qixi-page input,.qixi-page select,.qixi-page textarea{font-family:inherit}
.qixi-page::before{content:"";position:absolute;z-index:-1;inset:0;background:linear-gradient(180deg,rgba(255,247,229,.04) 0 38%,rgba(255,245,230,.12) 54%,rgba(255,244,232,.62) 100%);pointer-events:none}.qixi-page::after{content:"";position:absolute;z-index:20;inset:7px;border:1px solid rgba(255,226,179,.5);border-radius:24px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.28);pointer-events:none}
.qixi-home{position:absolute;inset:0;display:flex;flex-direction:column;padding:max(13px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom))}.qixi-home[hidden]{display:none}
.qixi-home-back{position:relative;display:grid;place-items:center;width:38px;height:38px;padding:0;border:0;background:transparent;box-shadow:none;cursor:pointer;-webkit-tap-highlight-color:transparent}.qixi-home-back::before{content:"";width:12px;height:12px;margin-left:5px;border-left:2px solid #ffe5a7;border-bottom:2px solid #ffe5a7;transform:rotate(45deg);filter:drop-shadow(0 2px 5px rgba(22,31,58,.78))}.qixi-home-back:active{transform:translateX(-1px)}
.qixi-scene-title{position:absolute;z-index:2;top:max(58px,calc(env(safe-area-inset-top) + 45px));left:50%;width:clamp(180px,46%,236px);height:auto;transform:translateX(-50%);filter:drop-shadow(0 3px 8px rgba(42,47,74,.22));pointer-events:none}
.qixi-decor-shortcut{position:absolute;z-index:4;top:max(11px,env(safe-area-inset-top));right:10px;width:52px;height:52px;padding:0;border:0;background:url('${BASE}/assets/qixi-2026/qixi-decor-icon-v1.png?v=1') center/contain no-repeat;filter:drop-shadow(0 3px 6px rgba(58,48,71,.2));cursor:pointer;-webkit-tap-highlight-color:transparent}.qixi-decor-shortcut:active{transform:translateY(1px)}
.qixi-river-actions{position:absolute;z-index:3;top:72%;left:50%;display:grid;grid-template-columns:repeat(2,minmax(0,96px));justify-content:space-between;width:min(82%,350px);transform:translate(-50%,-50%);pointer-events:none}.qixi-river-actions form{display:contents}.qixi-river-action{display:grid;justify-items:center;align-content:start;gap:2px;width:96px;min-height:76px;padding:0;border:0;background:transparent;color:#fff0d6;text-align:center;text-shadow:0 2px 6px rgba(21,31,61,.72);cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent}.qixi-river-action-mark{position:relative;display:grid;place-items:center;width:44px;height:44px;border:0;background:transparent;filter:drop-shadow(0 3px 5px rgba(69,56,77,.18))}.qixi-river-action-mark .qixi-sprite{width:44px;height:44px}.qixi-river-action-mark.catch{width:34px;height:34px;margin:5px 0;border:0;border-radius:0;background:url('${BASE}/assets/qixi-2026/qixi-scoop-net.svg?v=3') center/contain no-repeat}.qixi-river-action b{font:800 13px/1.15 var(--serif);letter-spacing:.08em}.qixi-river-action small{font-size:8px;line-height:1.25;color:#fff0dc}.qixi-river-action:active{transform:translateY(2px)}.qixi-river-action[disabled]{opacity:.72;cursor:default}.qixi-river-action[disabled]:active{transform:none}
.qixi-home-bottom{margin-top:auto}.qixi-stage-lantern .qixi-home-bottom{position:absolute;left:12px;right:12px;bottom:max(12px,2svh)}.qixi-progress-card,.qixi-action-dock,.qixi-screen-card{position:relative;border:1px solid rgba(197,147,91,.62);background:var(--paper);box-shadow:inset 0 0 0 3px rgba(255,255,255,.5);backdrop-filter:blur(12px)}
.qixi-progress-card{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;width:100%;padding:12px 14px;border-radius:17px;color:inherit;text-align:left}.qixi-progress-card[type="button"]{cursor:pointer}.qixi-progress-card small,.qixi-progress-card span{display:block;color:#8e7780;font-size:10px}.qixi-progress-card b{display:block;margin:2px 0 4px;font:800 17px/1.2 var(--serif);color:#765768}.qixi-progress-card>strong{display:block;color:#a26b70;font:800 11px/1.25 var(--serif);white-space:nowrap}.qixi-progress-card[type="button"]:active{transform:translateY(1px)}
.qixi-progress-track{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:1px}.qixi-progress-track i{height:4px;border-radius:999px;background:#dfd2c8}.qixi-progress-track i.on{background:linear-gradient(90deg,#8da8c9,#d89da9)}
.qixi-action-dock{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:8px;padding:9px 6px 8px;border-radius:20px}.qixi-action-dock button{display:grid;justify-items:center;align-content:start;gap:3px;min-width:0;padding:0 1px 4px;border:0;background:transparent;color:#745f69;cursor:pointer}.qixi-action-dock b{font:800 10px/1.2 var(--serif)}.qixi-action-dock small{font-size:8px;color:#9a8389;white-space:nowrap}.qixi-action-dock button[disabled]{opacity:.48;cursor:default}
.qixi-sprite{display:block;background-image:url('${BASE}/assets/qixi-2026/qixi-stickers-v2.png');background-repeat:no-repeat;background-size:300% 300%;background-color:transparent}.qixi-sprite.qiaoqiao{background-position:0 0}.qixi-sprite.bell{background-position:50% 0}.qixi-sprite.mold{background-position:100% 0}.qixi-sprite.buckle{background-position:0 50%}.qixi-sprite.fine-bell{background-position:50% 50%}.qixi-sprite.paper{background-position:100% 50%}.qixi-sprite.seal{background-position:0 100%}.qixi-sprite.lantern{background-position:50% 100%}.qixi-sprite.notebook{background-position:100% 100%}
.qixi-action-icon{width:55px;height:55px;border:0;border-radius:0;background-color:transparent;filter:drop-shadow(0 3px 3px rgba(69,56,77,.18))}
.qixi-action-unknown,.qixi-object-unknown{display:grid;place-items:center;color:#b58a78;font:400 28px/1 Georgia,serif;text-shadow:0 1px 0 #fff8e9}.qixi-action-unknown{width:55px;height:55px}.qixi-object-unknown{width:78px;height:78px;font-size:38px}
.qixi-screen{position:absolute;z-index:6;inset:0;display:grid;place-items:center;padding:18px;background:rgba(27,38,63,.16)}.qixi-screen[hidden]{display:none}.qixi-screen-card{position:relative;width:min(100%,430px);max-height:82svh;margin:0;padding:22px 16px 16px;overflow-y:auto;overscroll-behavior:contain;border-radius:21px}.qixi-screen-card::-webkit-scrollbar{width:3px}.qixi-screen-card::-webkit-scrollbar-thumb{background:#d2b083;border-radius:9px}.qixi-screen-close{position:absolute;z-index:3;top:7px;right:8px;width:34px;height:34px;padding:0;border:0;background:transparent;color:#896773;font:300 29px/1 Georgia,serif;cursor:pointer}.qixi-screen-close:active{transform:scale(.92)}
.qixi-action{padding:0;color:#705966}.qixi-action-kicker{margin:0;color:#a36f6c;font-size:9px;font-weight:900;letter-spacing:.14em}.qixi-action h2{margin:4px 0 0;font:800 16px/1.35 var(--serif);color:#79566a}.qixi-action p{margin:6px 0 0;font-size:11px;line-height:1.6}.qixi-action blockquote{margin:8px 0 0;padding:8px 10px;border:1px solid #ead1ad;border-radius:12px;background:#fff1df;color:#795f6c;font-size:11px;line-height:1.55}.qixi-action .btn{margin-top:10px}
.qixi-page .btn.qixi-plaque-button{display:flex;align-items:center;justify-content:center;justify-self:center;width:min(100%,var(--qixi-plaque-width));height:var(--qixi-plaque-height);min-height:0;padding:0 28px;border:0;border-radius:0;background:url('${BASE}/assets/qixi-2026/qixi-action-plaque-v1.png?v=1') center/100% 100% no-repeat;color:#ffe4a6;box-shadow:none;text-shadow:0 2px 3px rgba(60,35,83,.78);font:800 var(--qixi-plaque-font)/1.2 var(--serif);letter-spacing:.03em}.qixi-page .btn.qixi-plaque-button:active{transform:translateY(1px);box-shadow:none}
.qixi-hint-list{margin-top:10px;border-top:1px solid rgba(204,160,107,.48);border-bottom:1px solid rgba(204,160,107,.48)}.qixi-hint-list p{display:grid;grid-template-columns:20px minmax(0,1fr);gap:8px;margin:0;padding:9px 1px;color:#725c69;font-size:11px;line-height:1.65}.qixi-hint-list p+p{border-top:1px dashed rgba(204,160,107,.38)}.qixi-hint-list i{padding-top:1px;color:#b1747c;font:800 10px/1.65 var(--serif);font-style:normal;text-align:center}
.qixi-options{display:grid;gap:7px;margin-top:9px}.qixi-option{display:flex;align-items:center;gap:7px;min-height:36px;padding:7px 9px;border:1px solid #dfc49f;border-radius:12px;background:#fff9ef;cursor:pointer;font-size:11px}.qixi-option:has(input:checked){border-color:#c48491;background:#f8e3e4;box-shadow:inset 0 0 0 1px #c48491}.qixi-option input{margin:0;accent-color:#b97080}
.qixi-question{margin:9px 0 0;padding:0;border:0}.qixi-question[hidden]{display:none}.qixi-question legend{padding:0;font:800 12px/1.5 var(--serif);color:#745d69}.qixi-question-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}.qixi-question-nav span{font-size:10px;color:#8f7c84}.qixi-question-nav button{margin:0}.qixi-question-nav .btn.ghost{min-height:32px;padding:6px 10px;border:1px solid #d7b47f;border-radius:10px;background:rgba(255,247,233,.88);color:#765e69;box-shadow:none;font:800 10px/1 var(--serif)}.qixi-question-nav .btn.ghost:active{transform:translateY(1px);background:#f4e4cf}.qixi-question-nav [hidden]{display:none}
.qixi-answers{display:grid;gap:8px;margin-top:13px}.qixi-answer{padding:10px 12px;border:1px solid #ead3b1;border-radius:13px;background:#fff3e3}.qixi-answer strong{color:#755d69}.qixi-answer p{margin:4px 0 0;font-size:12px}
.qixi-rack-title{text-align:center}.qixi-rack-title .qixi-sprite{width:70px;height:70px;margin:-7px auto 3px;border-radius:0;filter:drop-shadow(0 4px 4px rgba(69,56,77,.16))}.qixi-rack h2{margin:0;font:800 17px/1.25 var(--serif);color:#765665}.qixi-rack-title p{margin:4px 0 0;color:#8d796f;font-size:9px}.qixi-object-list{margin-top:9px}.qixi-object[hidden]{display:none}.qixi-object{min-width:0}.qixi-object-hero{display:grid;grid-template-columns:82px 1fr;align-items:center;gap:10px;padding:6px 4px;border:0;border-bottom:1px solid rgba(208,170,117,.56);border-radius:0;background:transparent}.qixi-object-hero .qixi-sprite{width:78px;height:78px;border-radius:0;filter:drop-shadow(0 4px 4px rgba(80,61,76,.14))}.qixi-object-hero h3{margin:0;font:800 16px/1.25 var(--serif);color:#755768}.qixi-object-hero p{margin:3px 0 0;font-size:10px;color:#8d747e}.qixi-object-body{padding-top:8px;color:#705966}.qixi-object-body p{margin:5px 0;font-size:11px;line-height:1.55;color:#705966}.qixi-clue{padding:7px 8px;border:1px solid #ead3b2;border-radius:11px;background:#fff6e9}.qixi-done{color:#a36f78!important;font-weight:800}.qixi-page .muted{color:#8a7880!important}
.qixi-progress{margin-top:9px}.qixi-progress summary{cursor:pointer;color:#727b9b;font-size:11px}.qixi-progress p{margin:7px 0 0;padding:8px 9px;border-radius:10px;background:#eef0f7;color:#6d718a;font-size:11px}.qixi-progress b{color:#8a5f72}
.qixi-lamp-workshop{scroll-margin-top:14px}.qixi-lamp-stage{display:grid;place-items:center;min-height:224px;margin:-16px -8px 10px;padding:20px 0 4px}.qixi-lamp-preview{position:relative;width:196px;height:184px;margin:0 auto;border:0;background:transparent;box-shadow:none}.qixi-lamp-preview::before{content:"";position:absolute;z-index:0;left:50%;top:0;width:1px;height:30px;background:linear-gradient(180deg,#a97947,#e7c998);box-shadow:0 0 2px rgba(110,79,67,.22)}.qixi-lamp-preview::after{content:"✦";position:absolute;z-index:0;left:50%;top:-5px;transform:translateX(-50%);color:#c7975d;font:700 9px/1 var(--serif);text-shadow:0 1px 0 #fff6e7}.qixi-lantern-base{position:absolute;z-index:1;left:8px;top:17px;width:180px;height:135px;background:url('/assets/qixi-2026/qixi-lantern-bases-v2.png?v=3') var(--lamp-x,0%) var(--lamp-y,0%)/300% 400% no-repeat}.qixi-lantern-layer{position:absolute;z-index:2;background-image:url('/assets/qixi-2026/qixi-lantern-decorations-v3.png?v=1');background-size:300% 400%;background-repeat:no-repeat;pointer-events:none}.qixi-lantern-pattern{left:66px;top:53px;width:64px;height:64px;opacity:.8}.qixi-lantern-ornament{left:64px;top:104px;width:68px;height:68px}.qixi-lantern-seal{right:23px;top:34px;width:51px;height:51px}.qixi-lamp-category-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:0;padding:4px;border:1px solid #dfc49f;border-radius:13px;background:#fff8e9}.qixi-lamp-category-tabs button{min-height:31px;padding:5px 2px;border:0;border-radius:9px;background:transparent;color:#8b727c;font:800 10px/1 var(--serif);cursor:pointer}.qixi-lamp-category-tabs button[aria-pressed="true"]{background:#efd7d8;color:#8f596b;box-shadow:inset 0 0 0 1px #cf9ba7}.qixi-lamp-choices{margin-top:9px}.qixi-lamp-choice-group{padding:2px 0 0;border:0;border-radius:0;background:transparent}.qixi-lamp-choice-group[hidden]{display:none}.qixi-lamp-choice-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.qixi-lamp-choice{display:grid;justify-items:center;gap:4px;min-width:0;padding:7px 3px;border:1px solid transparent;border-radius:12px;cursor:pointer;font-size:9px;text-align:center}.qixi-lamp-choice:has(input:checked){border-color:#c48491;background:#f5dfdf;color:#945f70}.qixi-lamp-choice input{position:absolute;opacity:0;pointer-events:none}.qixi-lamp-choice-art{display:block;width:46px;height:42px}.qixi-lamp-choice-art.base{background-image:url('/assets/qixi-2026/qixi-lantern-bases-v2.png?v=3');background-size:300% 400%;background-repeat:no-repeat}.qixi-lamp-choice-art.decor{background-image:url('/assets/qixi-2026/qixi-lantern-decorations-v3.png?v=1');background-size:300% 400%;background-repeat:no-repeat}.qixi-lamp-choice-art.color{width:34px;height:34px;margin:4px;border:2px solid rgba(255,255,255,.86);border-radius:50%;box-shadow:0 0 0 1px #d0ae7b}.qixi-letter-editor{display:grid;gap:5px;margin-top:18px}.qixi-letter-editor>label{margin-left:12px;font:800 13px/1.2 var(--serif);color:#775f68}.qixi-letter-paper{position:relative;height:160px;padding:0;background:url('/assets/qixi-2026/qixi-letter-paper-v1.png?v=1') center/100% 100% no-repeat;filter:drop-shadow(0 4px 7px rgba(102,73,79,.12))}.qixi-letter-paper:focus-within{filter:drop-shadow(0 4px 9px rgba(150,94,112,.23))}.qixi-letter-paper textarea{position:absolute;left:76px;top:50%;transform:translateY(-50%);width:209px;height:24px;min-height:24px;max-height:85px;padding:0;border:0;border-radius:0;outline:0;resize:none;overflow-y:auto;background:transparent;color:#765466;box-shadow:none;text-align:center;font:400 14px/1.65 "Kaiti SC","STKaiti","KaiTi","FZKai-Z03",cursive;letter-spacing:.04em}.qixi-lamp-submit-row{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:8px;margin-top:13px}.qixi-lamp-submit-row .btn{margin:0}.qixi-lamp-submit-row .btn[disabled]{opacity:.5;cursor:default;box-shadow:none}
.qixi-lamp-choice-group[data-lamp-choice-group="color"] .qixi-lamp-choice-options{grid-template-columns:repeat(4,minmax(0,1fr))}
.qixi-lamp-choice-art.none{display:grid;place-items:center;color:#b58a78;font:400 24px/1 Georgia,serif}.qixi-lamp-lock-note{margin:7px 4px 1px;color:#927b82;font-size:9px;line-height:1.45;text-align:center}
.qixi-lantern-ornament{z-index:0}
.qixi-lamp-submit-row.single{grid-template-columns:1fr}.qixi-lamp-submit-row .qixi-release-submit{gap:8px}.qixi-release-submit::before{content:"";width:29px;height:29px;background:url('/assets/qixi-2026/qixi-release-lantern.svg?v=1') center/contain no-repeat}
.qixi-letters{display:grid;gap:8px}.qixi-letter{min-width:0;padding:11px;border:1px solid #e2cba6;border-radius:14px;background:#fff9ed}.qixi-letter h2{margin:0;font:800 16px/1.3 var(--serif);color:#7e5d69}.qixi-letter p{margin:5px 0 0;font-size:12px}.qixi-letter blockquote{margin:8px 0 0;padding:8px 9px;border:1px solid #ead3b0;border-radius:10px;background:#fff0df;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
.qixi-letter-display{position:relative;display:grid;align-content:center;min-height:190px;margin:8px auto 0;padding:46px 53px 42px;background:url('/assets/qixi-2026/qixi-letter-display-v1.png?v=1') center/100% 100% no-repeat;color:#755568}.qixi-letter-display h3{margin:0 0 7px;text-align:center;font:800 12px/1.3 var(--serif);letter-spacing:.08em}.qixi-letter-display p{margin:0;text-align:center;font:400 14px/1.65 "Kaiti SC","STKaiti","KaiTi","FZKai-Z03",cursive;white-space:pre-wrap;overflow-wrap:anywhere}.qixi-letter-display small{display:block;margin-top:7px;text-align:right;color:#91727e;font:700 10px/1.2 var(--serif)}
.qixi-letter-overlay{position:absolute;z-index:18;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:54px 14px 24px;background:rgba(19,31,57,.32)}.qixi-letter-overlay[hidden]{display:none}.qixi-letter-overlay-close{position:absolute;z-index:2;top:max(18px,env(safe-area-inset-top));right:18px;width:38px;height:38px;padding:0;border:0;background:transparent;color:#fff3dd;font:300 36px/1 Georgia,serif;text-shadow:0 2px 8px rgba(25,33,58,.8);cursor:pointer}.qixi-letter-overlay-close:active{transform:scale(.92)}.qixi-letter-arrival{height:122px;margin-bottom:-17px}.qixi-letter-arrival .qixi-lamp-preview{transform:scale(.68);transform-origin:center top}.qixi-letter-overlay .qixi-letter-display{width:min(100%,430px);min-height:230px;margin:0}.qixi-letter-overlay-note{margin:8px 0 0;color:#fff0dc;font:700 10px/1.4 var(--serif);text-align:center;text-shadow:0 2px 7px rgba(28,37,64,.74)}
.qixi-flash{margin:0 0 9px;padding:8px 9px;border:1px solid #d9b885;border-radius:11px;background:#fff5dd;color:#795f64;font-size:12px}.qixi-inline-form{display:grid;gap:10px;margin-top:12px}.qixi-owner-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.qixi-owner-options .qixi-option{justify-content:center;padding:9px 5px;text-align:center}.qixi-owner-options .qixi-option input{position:absolute;opacity:0}.qixi-owner-options .qixi-option span{font-weight:800}
.qixi-stage-lantern.qixi-time-day::before{background:linear-gradient(180deg,rgba(255,250,232,.02) 0 42%,rgba(227,244,247,.06) 58%,rgba(255,244,232,.48) 100%)}
.qixi-stage-lantern.qixi-time-night::before{background:linear-gradient(180deg,rgba(8,22,55,.08) 0 42%,rgba(18,37,73,.15) 58%,rgba(255,244,232,.58) 100%)}
.qixi-time-day .qixi-home-back::before{border-color:#667694;filter:drop-shadow(0 1px 2px rgba(255,248,226,.9))}.qixi-time-day .qixi-river-action{color:#735667;text-shadow:0 1px 3px rgba(255,255,255,.92)}.qixi-time-day .qixi-river-action small{color:#7b6871}.qixi-time-day .qixi-river-action-mark{border-color:rgba(181,126,77,.6);background:radial-gradient(circle,rgba(255,247,220,.66),rgba(255,255,255,.12) 58%,transparent 60%);filter:drop-shadow(0 3px 6px rgba(107,91,93,.2))}
@media(max-width:420px){.qixi-page{width:100%}.qixi-lamp-choices{grid-template-columns:1fr}.qixi-action-icon{width:52px;height:52px}}
</style>`.replaceAll("url('/assets/qixi-2026/", `url('${BASE}/assets/qixi-2026/`);
const QIXI_UI_SCRIPT = `<script>(()=>{
document.body.classList.add('qixi-event-active');
const root=document.querySelector('.qixi-page'),home=root.querySelector('[data-qixi-home]'),screens=[...root.querySelectorAll('[data-qixi-screen]')];
let showObject=()=>{};
const show=(name)=>{home.hidden=false;for(const screen of screens)screen.hidden=name==='home'||screen.dataset.qixiScreen!==name};
for(const button of root.querySelectorAll('[data-qixi-open]'))button.addEventListener('click',()=>{if(button.disabled)return;show(button.dataset.qixiOpen);if(button.dataset.qixiObjectIndex!==undefined)showObject(Number(button.dataset.qixiObjectIndex))});
for(const button of root.querySelectorAll('[data-qixi-close]'))button.addEventListener('click',()=>show('home'));
for(const button of root.querySelectorAll('[data-qixi-letter-close]'))button.addEventListener('click',()=>{button.closest('[data-qixi-letter-overlay]').hidden=true;const next=new URL(location.href);next.searchParams.delete('letter');history.replaceState(null,'',next)});
show(root.dataset.qixiInitial||'home');
for(const form of root.querySelectorAll('[data-qixi-paged-form]')){const pages=[...form.querySelectorAll('[data-qixi-question]')];let index=0;const prev=form.querySelector('[data-qixi-prev]'),next=form.querySelector('[data-qixi-next]'),submit=form.querySelector('[data-qixi-submit]'),step=form.querySelector('[data-qixi-step]');const draw=()=>{pages.forEach((page,i)=>page.hidden=i!==index);prev.hidden=index===0;next.hidden=index===pages.length-1;submit.hidden=index!==pages.length-1;step.textContent=(index+1)+' / '+pages.length};prev.addEventListener('click',()=>{index=Math.max(0,index-1);draw()});next.addEventListener('click',()=>{const checked=pages[index].querySelector('input:checked');if(!checked){pages[index].querySelector('input')?.reportValidity();return}index=Math.min(pages.length-1,index+1);draw()});draw()}
for(const list of root.querySelectorAll('[data-qixi-object-pages]')){const pages=[...list.querySelectorAll('[data-qixi-object-page]')];let index=Number(list.dataset.qixiInitialObject||0);const draw=()=>pages.forEach((page,i)=>page.hidden=i!==index);showObject=(target)=>{index=Math.max(0,Math.min(pages.length-1,target));draw()};draw()}
for(const textarea of root.querySelectorAll('[data-qixi-letter-input]')){const fit=()=>{textarea.style.height='1px';textarea.style.height=Math.min(85,Math.max(24,textarea.scrollHeight))+'px'};textarea.addEventListener('input',fit);fit()}
const shapePos=${JSON.stringify(LAMP_SHAPE_POS)},colorPos=${JSON.stringify(LAMP_COLOR_POS)},decorPos=${JSON.stringify(LAMP_DECOR_POS)},lampLayouts=${JSON.stringify(LAMP_LAYOUTS)},newDecorLayouts=${JSON.stringify(LAMP_NEW_DECOR_LAYOUTS)},magpieLayouts=${JSON.stringify(LAMP_MAGPIE_LAYOUTS)};
for(const form of root.querySelectorAll('[data-qixi-lamp-form]')){const preview=form.querySelector('[data-qixi-lamp-preview]'),base=preview.querySelector('[data-lamp-base]'),pattern=preview.querySelector('[data-lamp-pattern]'),ornament=preview.querySelector('[data-lamp-ornament]'),seal=preview.querySelector('[data-lamp-seal]'),categoryTabs=[...form.querySelectorAll('[data-lamp-category]')],choiceGroups=[...form.querySelectorAll('[data-lamp-choice-group]')];const checked=(name)=>form.querySelector('input[name="'+name+'"]:checked')?.value;const setDecor=(node,id)=>{const pos=decorPos[id]||['0%','0%'];node.style.backgroundPosition=pos[0]+' '+pos[1]};const setBox=(node,box)=>{node.style.left=box.x+'px';node.style.right='auto';node.style.top=box.y+'px';node.style.width=box.w+'px';node.style.height=box.h+'px'};const showCategory=(name)=>{for(const button of categoryTabs)button.setAttribute('aria-pressed',String(button.dataset.lampCategory===name));for(const group of choiceGroups)group.hidden=group.dataset.lampChoiceGroup!==name};for(const button of categoryTabs)button.addEventListener('click',()=>showCategory(button.dataset.lampCategory));const draw=()=>{const shape=checked('shape'),layout=lampLayouts[shape]||lampLayouts['square-palace'],patternId=checked('pattern'),ornamentId=checked('ornament'),sealId=checked('seal');base.style.setProperty('--lamp-x',shapePos[shape]||'0%');base.style.setProperty('--lamp-y',colorPos[checked('color')]||'0%');setBox(base,layout.base);setBox(pattern,newDecorLayouts[patternId]?.[shape]||layout.pattern);setBox(ornament,newDecorLayouts[ornamentId]?.[shape]||(ornamentId==='magpie-ribbon'?(magpieLayouts[shape]||layout.ornament):layout.ornament));setBox(seal,newDecorLayouts[sealId]?.[shape]||layout.seal);setDecor(pattern,patternId);setDecor(ornament,ornamentId);setDecor(seal,sealId)};form.addEventListener('change',draw);showCategory('shape');draw()}
})()</script>`;
const OBJECT_SPRITES = { "copper-bell": "bell", "qiaoguo-mold": "mold", "mailbag-buckle": "buckle" };

function sideCard(side, state) {
    const lamp = state?.lamps?.[side];
    const otherSide = side === "human" ? "ai" : "human";
    const received = state?.lamps?.[otherSide];
    const ownLabel = side === "human" ? "人类的灯" : "小机的灯";
    if (!lamp)
        return "";
    const delivery = lamp.deliveredAt ? "已经抵达" : "正在河上";
    const ownText = side === "human" ? displayLetter(lamp, "写给小机", "人类") : "";
    const receivedText = side === "human" && received?.deliveredAt ? displayLetter(received, "小机写来的灯笺", "小机") : "";
    return `<section class="qixi-letter"><h2>${ownLabel}</h2><p class="small muted">${delivery}</p>${ownText}${receivedText}</section>`;
}

function displayLetter(lamp, heading, authorName) {
    return `<article class="qixi-letter-display"><h3>${esc(heading)}</h3><p>${esc(lamp.text)}</p><small>—— ${esc(authorName)}</small></article>`;
}

function latestCaughtLetter(state) {
    const partner = state?.lamps?.ai?.deliveredAt ? { ...state.lamps.ai, authorName: "小机", heading: "小机写来的灯笺" } : null;
    const npc = Array.isArray(state?.passingLamps?.human) ? state.passingLamps.human.at(-1) : null;
    if (partner && (!npc || Number(partner.caughtAt ?? partner.deliveredAt) >= Number(npc.caughtAt ?? 0)))
        return partner;
    return npc ? { ...npc, heading: `${npc.authorName}的路过灯` } : null;
}

function letterOverlay(state, showLetter) {
    if (!showLetter)
        return "";
    const letter = latestCaughtLetter(state);
    if (!letter)
        return "";
    const note = letter.authorName === "小机" ? "属于这一户的灯已经抵达。" : "这是一盏经过此处的灯；属于你的那盏还在水路上。";
    return `<section class="qixi-letter-overlay" data-qixi-letter-overlay aria-label="展开的信笺"><button class="qixi-letter-overlay-close" type="button" data-qixi-letter-close aria-label="关闭信笺">×</button><div class="qixi-letter-arrival">${lanternPreview(letter.appearance)}</div>${displayLetter(letter, letter.heading, letter.authorName)}<p class="qixi-letter-overlay-note">${esc(note)}</p></section>`;
}

function optionLabel(question, id) {
    const option = question?.options?.find((item) => item.id === id);
    return option ? `${option.id}. ${option.label}` : String(id ?? "");
}

function answerFields(question, index, name = `answer${index + 1}`, paged = false) {
    return `<fieldset class="qixi-question"${paged ? ` data-qixi-question="${index}"${index ? " hidden" : ""}` : ""}><legend>${esc(question.text)}</legend><div class="qixi-options">${question.options.map((option) => `<label class="qixi-option"><input type="radio" name="${esc(name)}" value="${esc(option.id)}" required> <span>${esc(option.id)}. ${esc(option.label)}</span></label>`).join("")}</div></fieldset>`;
}

function compatibilityAction(state, taskView, key) {
    const compatibility = qixiLantern2026.compatibility;
    const bell = taskView.objects.find((object) => object.id === "copper-bell");
    if (!bell?.found)
        return null;
    const humanAnswers = state?.answers?.human;
    const aiAnswers = state?.answers?.ai;
    if (!humanAnswers) {
        const questions = compatibility.questions.map((question, index) => answerFields(question, index, `answer${index + 1}`, true)).join("");
        return `<p class="qixi-action-kicker">旧铜铃 · 翘翘的木牌</p><h2>答完三块木牌，她才肯交出这件旧物的蓝线线索</h2><blockquote>“${esc(compatibility.intro)}”</blockquote><p>${esc(compatibility.setup)}</p><form method="post" action="${BASE}/ui/${key}/qixi/compatibility" data-qixi-paged-form>${questions}<div class="qixi-question-nav"><button class="btn ghost" type="button" data-qixi-prev hidden>上一题</button><span data-qixi-step>1 / ${compatibility.questions.length}</span><button class="btn ghost" type="button" data-qixi-next>下一题</button><button class="btn qixi-plaque-button" type="submit" data-qixi-submit hidden>交给翘翘</button></div></form>`;
    }
    if (!aiAnswers)
        return `<p class="qixi-action-kicker">答案还封着</p><h2>你已经选好了，等小机交出自己的三块木牌</h2><p>翘翘把两份答案分别扣在失物架两边，谁也不能先看对方的答案。</p>`;
    return null;
}

function compatibilityResult(state) {
    const humanAnswers = state?.answers?.human;
    const aiAnswers = state?.answers?.ai;
    if (!humanAnswers || !aiAnswers)
        return "";
    const compatibility = qixiLantern2026.compatibility;
    const results = compatibility.questions.map((question, index) => `<div class="qixi-answer"><strong>${esc(question.text)}</strong><p>人类：${esc(optionLabel(question, humanAnswers[index]))}<br>小机：${esc(optionLabel(question, aiAnswers[index]))}</p></div>`).join("");
    const allSame = humanAnswers.every((answer, index) => answer === aiAnswers[index]);
    const reaction = allSame ? compatibility.sameReaction : compatibility.differentReaction;
    return `<div class="qixi-answers">${results}</div><blockquote>“${esc(reaction)}”</blockquote>`;
}

function ownerChoices() {
    return `<div class="qixi-owner-options">${qixiLantern2026.objects.map((object) => `<label class="qixi-option"><input type="radio" name="owner" value="${esc(object.ownerId)}" required><span>${esc(object.ownerName)}</span></label>`).join("")}</div>`;
}

function objectHint(object) {
    if (object.id === "copper-bell")
        return "河边的水草今天缠得比往常紧。泊泊说，收线时轻一点，也许带上岸的不只是一尾鱼。";
    if (object.id === "qiaoguo-mold")
        return "田边草屑下压着一小截旧木纹。等下一篮成熟作物离开土面，也许就能把它看清。";
    return "河边芦苇里总有一点黄铜光，牧场伙伴却只肯在吃饱以后钻进去。";
}

function currentClues(object) {
    const found = object.clues.filter((clue) => clue.found);
    if (!found.length)
        return "";
    return `<section class="qixi-current-clues"><h3>已经取得的线索</h3>${found.map((clue) => `<p class="qixi-clue">✓ ${esc(clue.text)}</p>`).join("")}</section>`;
}

function objectTask(farm, state, taskView, object, key) {
    if (!object.found)
        return `<p class="qixi-action-kicker">这件旧物还没出现</p><h2>翘翘只记下了一处异样</h2><div class="qixi-hint-list"><p><i>一</i><span>${esc(objectHint(object))}</span></p></div>`;
    if (object.returned)
        return `${currentClues(object)}<p class="qixi-done">已归还${esc(object.ownerName)}，取得灯材「${esc(object.material.name)}」。</p>`;
    if (object.id === "copper-bell") {
        const compatibility = compatibilityAction(state, taskView, key);
        if (compatibility)
            return `${compatibility}${currentClues(object)}`;
        const routeMissing = object.clues.some((clue) => clue.id === "route" && !clue.found);
        if (routeMissing)
            return `${compatibilityResult(state)}${currentClues(object)}<p class="qixi-action-kicker">旧铜铃 · 航线线索</p><h2>岸边没有车辙，铃缝里却留着车轴油</h2><p>平常探险走过的旧路上，也许还掉着从同一辆车上落下来的东西。</p>`;
        if (object.ready)
            return `${compatibilityResult(state)}${currentClues(object)}${returnAction(object, key)}`;
    }
    if (object.id === "qiaoguo-mold") {
        const dish = dishAction(farm, object, key);
        if (dish)
            return `${dish}${currentClues(object)}`;
        if (object.ready)
            return `${currentClues(object)}${returnAction(object, key)}`;
    }
    if (object.id === "mailbag-buckle") {
        const quiz = quizAction(object, taskView, key);
        if (quiz)
            return `${quiz}${currentClues(object)}`;
        if (object.ready)
            return `${currentClues(object)}${returnAction(object, key)}`;
    }
    return `${currentClues(object)}<p>这件旧物的线索还没有齐。</p>`;
}

function lostRack(farm, taskView, state, key, selectedIndex = 0) {
    const objects = taskView.objects.map((object, index) => {
        const status = object.returned ? "已经归还" : object.ready ? "可以判断主人" : object.found ? "继续寻找线索" : "等待小机发现";
        const art = object.found ? `<span class="qixi-sprite ${OBJECT_SPRITES[object.id]}"></span>` : `<span class="qixi-object-unknown" aria-hidden="true">?</span>`;
        const name = object.found ? object.name : `未知旧物 ${index + 1}`;
        return `<article class="qixi-object${object.returned ? " done" : ""}" data-qixi-object-page="${index}"${index === selectedIndex ? "" : " hidden"}><div class="qixi-object-hero">${art}<div><h3>${esc(name)}</h3><p>${esc(status)}</p></div></div><div class="qixi-object-body"><section class="qixi-action">${objectTask(farm, state, taskView, object, key)}</section></div></article>`;
    }).join("");
    return `<section class="qixi-rack" id="lost-rack"><div class="qixi-rack-title"><span class="qixi-sprite qiaoqiao"></span><h2>翘翘的临时失物架</h2><p>正在查看这一件旧物</p></div><div class="qixi-object-list" data-qixi-object-pages data-qixi-initial-object="${selectedIndex}">${objects}</div></section>`;
}

function dishAction(farm, object, key) {
    if (object.returned || object.clues.find((clue) => clue.id === "tea")?.found || !object.found)
        return null;
    const dish = farm.ranch?.kitchen?.dishes?.find((item) => item.recipeId === "honey_tea");
    if (!dish)
        return `<p class="qixi-action-kicker">断角木模 · 料理线索</p><h2>鹤姨正忙着把七夕巧果一盘盘摆凉</h2><p>去料理台做一份蜂蜜茶。端回来以后，她才有空把木模翻过来仔细看看。</p>`;
    return `<p class="qixi-action-kicker">断角木模 · 料理线索</p><h2>蜂蜜茶已经做好了</h2><p>把这份真实料理交给鹤姨；确认线索后才会从料理柜扣除。</p><form method="post" action="${BASE}/ui/${key}/qixi/dish"><input type="hidden" name="dishId" value="${esc(dish.id)}"><button class="btn qixi-plaque-button" type="submit">端给鹤姨</button></form>`;
}

function quizAction(object, taskView, key) {
    if (!object.found || object.returned || taskView.quizCompleted)
        return null;
    const quiz = qixiLantern2026.quiz;
    return `<p class="qixi-action-kicker">黄铜搭扣 · 七夕线索</p><h2>迟迟把三样旧物并排放好</h2><p>${esc(quiz.intro)}</p><form method="post" action="${BASE}/ui/${key}/qixi/quiz">${answerFields({ text: quiz.question, options: quiz.options }, 0, "answer")}<button class="btn qixi-plaque-button" type="submit">把判断告诉迟迟</button></form>`;
}

function returnAction(object, key) {
    if (!object.ready || object.returned)
        return null;
    return `<p class="qixi-action-kicker">${esc(object.name)} · 线索已齐</p><h2>这件旧物该回到谁手里？</h2><p>直接选出你判断的主人。选错不会交出旧物，可以回来重新核对。</p><form class="qixi-inline-form" method="post" action="${BASE}/ui/${key}/qixi/return"><input type="hidden" name="item" value="${esc(object.id)}">${ownerChoices()}<button class="btn qixi-plaque-button" type="submit">归还给所选的人</button></form>`;
}

function lampChoiceArt(name, id) {
    if (name === "shape") {
        const layout = LAMP_CHOICE_LAYOUTS[id] ?? { x: 0, y: 0, w: 46, h: 42 };
        return `<span class="qixi-lamp-choice-art base" style="width:${layout.w}px;height:${layout.h}px;transform:translate(${layout.x}px,${layout.y}px);background-position:${LAMP_SHAPE_POS[id] ?? "0%"} 0%"></span>`;
    }
    if (name === "color")
        return `<span class="qixi-lamp-choice-art color" style="background:${LAMP_COLOR_SWATCH[id] ?? "#eef3f0"}"></span>`;
    if (id === "none")
        return `<span class="qixi-lamp-choice-art none">—</span>`;
    const pos = LAMP_DECOR_POS[id] ?? ["0%", "0%"];
    return `<span class="qixi-lamp-choice-art decor" style="background-position:${pos[0]} ${pos[1]}"></span>`;
}

function lampChoiceGroup(name, label, options, materials, selected) {
    const available = options.filter((option) => !option.requires || materials.has(option.requires));
    const chosen = available.some((option) => option.id === selected) ? selected : available[0]?.id;
    const unlock = name === "pattern" && !materials.has("qiaoguo-paper")
        ? "完成对应旧物归还后解锁纹样素材。"
        : name === "ornament" && !materials.has("fine-copper-bell")
          ? "完成对应旧物归还后解锁挂件素材。"
          : name === "seal" && !materials.has("waterproof-seal")
            ? "完成对应旧物归还后解锁封签素材。"
            : "";
    return `<div class="qixi-lamp-choice-group" data-lamp-choice-group="${esc(name)}" aria-label="${esc(label)}"${name === "shape" ? "" : " hidden"}><div class="qixi-lamp-choice-options">${available.map((option) => `<label class="qixi-lamp-choice"><input type="radio" name="${esc(name)}" value="${esc(option.id)}"${option.id === chosen ? " checked" : ""}>${lampChoiceArt(name, option.id)}<span>${esc(option.name)}</span></label>`).join("")}</div>${unlock ? `<p class="qixi-lamp-lock-note">${esc(unlock)}</p>` : ""}</div>`;
}

function lanternPreview(appearance, form = false) {
    const saved = appearance ?? {};
    const layout = LAMP_LAYOUTS[saved.shape] ?? LAMP_LAYOUTS["square-palace"];
    const box = (value) => `left:${value.x}px;right:auto;top:${value.y}px;width:${value.w}px;height:${value.h}px`;
    const pattern = LAMP_DECOR_POS[saved.pattern] ?? LAMP_DECOR_POS["star-speckle"];
    const patternLayout = LAMP_NEW_DECOR_LAYOUTS[saved.pattern]?.[saved.shape] ?? layout.pattern;
    const ornament = LAMP_DECOR_POS[saved.ornament] ?? LAMP_DECOR_POS["short-tassel"];
    const ornamentLayout = LAMP_NEW_DECOR_LAYOUTS[saved.ornament]?.[saved.shape] ?? (saved.ornament === "magpie-ribbon" ? (LAMP_MAGPIE_LAYOUTS[saved.shape] ?? layout.ornament) : layout.ornament);
    const seal = LAMP_DECOR_POS[saved.seal] ?? LAMP_DECOR_POS["cotton-knot"];
    const sealLayout = LAMP_NEW_DECOR_LAYOUTS[saved.seal]?.[saved.shape] ?? layout.seal;
    const patternLayer = saved.pattern === "none" ? "" : `<span class="qixi-lantern-layer qixi-lantern-pattern" data-lamp-pattern style="${box(patternLayout)};background-position:${pattern[0]} ${pattern[1]}"></span>`;
    const ornamentLayer = saved.ornament === "none" ? "" : `<span class="qixi-lantern-layer qixi-lantern-ornament" data-lamp-ornament style="${box(ornamentLayout)};background-position:${ornament[0]} ${ornament[1]}"></span>`;
    const sealLayer = saved.seal === "none" ? "" : `<span class="qixi-lantern-layer qixi-lantern-seal" data-lamp-seal style="${box(sealLayout)};background-position:${seal[0]} ${seal[1]}"></span>`;
    return `<div class="qixi-lamp-preview"${form ? " data-qixi-lamp-preview" : ""}><span class="qixi-lantern-base" data-lamp-base style="${box(layout.base)};--lamp-x:${LAMP_SHAPE_POS[saved.shape] ?? "0%"};--lamp-y:${LAMP_COLOR_POS[saved.color] ?? "0%"}"></span>${patternLayer}${ornamentLayer}${sealLayer}</div>`;
}

function lampAction(state, taskView, key, forceDecorate = false) {
    const own = state?.lamps?.human;
    const incoming = state?.lamps?.ai;
    if (!own) {
        const materials = new Set(taskView.materialIds);
        const draft = state?.lampDrafts?.human ?? { shape: "square-palace", color: "moon-white", pattern: "none", ornament: "none", seal: "none" };
        if (taskView.finalStageOpen && !forceDecorate) {
            const appearanceFields = ["shape", "color", "pattern", "ornament", "seal"].map((name) => `<input type="hidden" name="${name}" value="${esc(draft[name])}">`).join("");
            return `<div class="qixi-lamp-workshop" id="lamp-workshop"><form class="qixi-lamp-form" method="post" action="${BASE}/ui/${key}/qixi/release"><div class="qixi-lamp-stage">${lanternPreview(draft)}</div>${appearanceFields}<div class="qixi-letter-editor"><label for="qixi-lamp-text">灯笺</label><div class="qixi-letter-paper"><textarea id="qixi-lamp-text" name="text" rows="1" data-qixi-letter-input required></textarea></div></div><div class="qixi-lamp-submit-row single"><button class="btn qixi-plaque-button qixi-release-submit" type="submit">把灯放进河里</button></div></form></div>`;
        }
        return `<div class="qixi-lamp-workshop" id="lamp-workshop"><form class="qixi-lamp-form" data-qixi-lamp-form method="post" action="${BASE}/ui/${key}/qixi/release"><div class="qixi-lamp-stage">${lanternPreview(draft, true)}</div><nav class="qixi-lamp-category-tabs" aria-label="灯装扮分类"><button type="button" data-lamp-category="shape" aria-pressed="true">灯型</button><button type="button" data-lamp-category="color" aria-pressed="false">颜色</button><button type="button" data-lamp-category="pattern" aria-pressed="false">纹样</button><button type="button" data-lamp-category="ornament" aria-pressed="false">挂件</button><button type="button" data-lamp-category="seal" aria-pressed="false">封签</button></nav><div class="qixi-lamp-choices">${lampChoiceGroup("shape", "灯型", qixiLantern2026.lamp.shapes, materials, draft.shape)}${lampChoiceGroup("color", "颜色", qixiLantern2026.lamp.colors, materials, draft.color)}${lampChoiceGroup("pattern", "灯面纹样", qixiLantern2026.lamp.patterns, materials, draft.pattern)}${lampChoiceGroup("ornament", "挂件", qixiLantern2026.lamp.ornaments, materials, draft.ornament)}${lampChoiceGroup("seal", "封签", qixiLantern2026.lamp.seals, materials, draft.seal)}</div><div class="qixi-lamp-submit-row single"><button class="btn qixi-plaque-button qixi-save-submit" type="submit" formaction="${BASE}/ui/${key}/qixi/decorate" formnovalidate>保存装扮</button></div></form></div>`;
    }
    const ownPreview = lanternPreview(own.appearance);
    if (incoming && !incoming.deliveredAt)
        return `${ownPreview}<p class="qixi-action-kicker">河面有了新的灯影</p><h2>小机的灯已经出发</h2><p>返回河面直接打捞。即使先捞到别人的路过灯，属于你的那盏最迟第三次也一定会抵达。</p>`;
    if (!incoming)
        return `${ownPreview}<p class="qixi-action-kicker">你的灯已经出发</p><h2>河水会替你把它送过去</h2><p>小机还没有放灯。这不影响你的奖励和纪念，晚一点再回来看看就好。</p>`;
    return `${ownPreview}<p class="qixi-action-kicker">这一盏已经抵达</p><h2>灯河替你们收好了今年的灯</h2><p>灯笺、装扮、放灯与抵达时间会留在本户纪念里；公共河道只记匿名数量。</p>`;
}

function riverActions(state, taskView, key) {
    if (!taskView.finalStageOpen)
        return "";
    const own = state?.lamps?.human;
    const incoming = state?.lamps?.ai;
    const release = own
        ? `<button class="qixi-river-action" type="button" disabled data-qixi-river-action="release"><span class="qixi-river-action-mark"><span class="qixi-sprite lantern"></span></span><b>已放灯</b><small>正在河上</small></button>`
        : `<button class="qixi-river-action" type="button" data-qixi-open="letters" data-qixi-river-action="release"><span class="qixi-river-action-mark"><span class="qixi-sprite lantern"></span></span><b>放灯</b><small>装扮并写灯笺</small></button>`;
    const catchAction = incoming?.deliveredAt
        ? `<button class="qixi-river-action" type="button" disabled data-qixi-river-action="catch"><span class="qixi-river-action-mark catch"></span><b>已捞到</b><small>灯已抵达</small></button>`
        : `<form method="post" action="${BASE}/ui/${key}/qixi/catch"><button class="qixi-river-action" type="submit" data-qixi-river-action="catch"><span class="qixi-river-action-mark catch"></span><b>打捞</b><small>${incoming ? "去下游接灯" : "河上也有路过灯"}</small></button></form>`;
    return `<nav class="qixi-river-actions" aria-label="灯河操作">${release}${catchAction}</nav>`;
}

export function uiQixiLantern(farm, world, now, key, flash, showLetter = false, selectedObjectId) {
    const eventWindow = qixiLantern2026Window(now, world);
    const state = qixiLantern2026PrivateData(farm, now);
    const taskView = qixiLantern2026TaskView(farm, world, now);
    const waitingForFinal = taskView.allReturned && !taskView.finalStageOpen;
    const stage = eventWindow.finalStageOpen ? "灯河开放中" : waitingForFinal ? "等待灯河开放" : taskView.allDiscovered ? "循线归还旧物" : "寻找三件旧物";
    const isNight = now >= eventWindow.finalStageAt;
    const scene = taskView.stage === "lantern"
        ? SCENE_URLS.lanternNight
        : SCENE_URLS[taskView.stage] ?? SCENE_URLS.objects;
    const flashHtml = flash ? `<div class="qixi-flash">${esc(flash)}</div>` : "";
    const stageNumber = taskView.stage === "lantern" ? 3 : taskView.stage === "return" ? 2 : 1;
    const selectedObjectIndex = Math.max(0, taskView.objects.findIndex((object) => object.id === selectedObjectId));
    const hasSelectedObject = taskView.objects.some((object) => object.id === selectedObjectId);
    const dockItems = taskView.objects.map((object, index) => {
        const status = object.returned ? "已归还" : object.found ? "看线索" : "待发现";
        const art = object.found ? `<span class="qixi-sprite qixi-action-icon ${OBJECT_SPRITES[object.id]}"></span>` : `<span class="qixi-action-unknown" aria-hidden="true">?</span>`;
        return `<button type="button" data-qixi-open="lost" data-qixi-object-index="${index}">${art}<b>${esc(object.found ? object.name : "未知旧物")}</b><small>${status}</small></button>`;
    }).join("");
    const activityDock = taskView.finalStageOpen ? "" : `<nav class="qixi-action-dock" aria-label="七夕活动入口">${dockItems}</nav>`;
    const decorShortcut = state?.lamps?.human ? "" : `<button class="qixi-decor-shortcut" type="button" data-qixi-open="decorate" aria-label="装扮灯笼"></button>`;
    const lampPanel = `<section class="qixi-action">${lampAction(state, taskView, key)}</section>`;
    const decorPanel = `<section class="qixi-action">${lampAction(state, taskView, key, true)}</section>`;
    const riverActionPanel = riverActions(state, taskView, key);
    const receivedLetterOverlay = letterOverlay(state, showLetter);
    const sharedDiscoveryCount = taskView.objects.filter((object) => Number(taskView.public.discoveredObjects?.[object.id] ?? 0) > 0).length;
    const personalReturnCount = taskView.objects.filter((object) => object.returned).length;
    const progressValue = taskView.stage === "objects" ? sharedDiscoveryCount : taskView.stage === "return" ? personalReturnCount : 3;
    const progressTrack = [1, 2, 3].map((step) => `<i class="${step <= progressValue ? "on" : ""}"></i>`).join("");
    const body = `${QIXI_STYLE}<main class="qixi-page qixi-stage-${taskView.stage} qixi-time-${isNight ? "night" : "day"}" style="--qixi-scene:url('${scene}')" data-qixi-initial="${showLetter || taskView.finalStageOpen ? "home" : hasSelectedObject ? "lost" : "home"}" aria-label="灯河有信">
      <section class="qixi-home" data-qixi-home>
        <a class="qixi-home-back" href="${BASE}/ui/${key}" aria-label="返回农场"></a>
        <img class="qixi-scene-title" src="${BASE}/assets/qixi-2026/qixi-scene-title-v1.png?v=1" alt="" aria-hidden="true">
        ${decorShortcut}
        ${riverActionPanel}
        <div class="qixi-home-bottom">
          ${taskView.finalStageOpen
            ? `<section class="qixi-progress-card" aria-label="全服活动进度"><div><small>第 ${stageNumber} 阶段</small><b>${esc(stage)}</b></div><strong>${progressValue} / 3</strong><div class="qixi-progress-track">${progressTrack}</div></section>`
            : `<section class="qixi-progress-card" aria-label="当前活动阶段"><div><small>第 ${stageNumber} 阶段</small><b>${esc(stage)}</b>${waitingForFinal ? "<span>今晚 20:00 开放放灯和打捞</span>" : ""}</div><strong>${progressValue} / 3</strong><div class="qixi-progress-track">${progressTrack}</div></section>`}
          ${activityDock}
        </div>
      </section>
      ${taskView.finalStageOpen ? "" : `<section class="qixi-screen" data-qixi-screen="lost" hidden><div class="qixi-screen-card" role="dialog" aria-modal="true" aria-label="旧物任务"><button class="qixi-screen-close" type="button" data-qixi-close aria-label="关闭旧物详情">×</button>${hasSelectedObject ? flashHtml : ""}${lostRack(farm, taskView, state, key, selectedObjectIndex)}</div></section>`}
      <section class="qixi-screen" data-qixi-screen="decorate" hidden><div class="qixi-screen-card" role="dialog" aria-modal="true" aria-label="装扮灯笼"><button class="qixi-screen-close" type="button" data-qixi-close aria-label="关闭装扮灯笼">×</button>${decorPanel}</div></section>
      <section class="qixi-screen" data-qixi-screen="letters" hidden><div class="qixi-screen-card" role="dialog" aria-modal="true" aria-label="装饰与灯笺"><button class="qixi-screen-close" type="button" data-qixi-close aria-label="关闭装饰与灯笺">×</button>${lampPanel}<div class="qixi-letters">${sideCard("human", state)}</div></div></section>
      ${receivedLetterOverlay}
    </main>${QIXI_UI_SCRIPT}`;
    return page("灯河有信", key, "qixi", body, farmNames(farm), now);
}
