// 人类可见的伴侣看板（HTML，零依赖，服务端渲染）。给人类看自己 AI 伴侣的农场。
// 与给 AI 玩的文字接口完全分开：主页只开放每日 3 次的单块帮收，其他田间动作仍由 AI 完成。
// 绑定方式：/ui/<humanKey> —— 只认低权限观光钥匙；页面内跳转也只继续传这把钥匙，不暴露主 token。
// 视觉基调：暖田园·标本馆（米麻底 + 木质暖褐 + 草木绿），靠稀有度色彩体系与排版质感出彩（零图片）。
//
// 本文件保留人类看板的兼容导出入口；各页面实现位于 dist/web/。
import { BASE } from "./config.js";
import { STYLE, esc, farmNames, page } from "./web/shell.js";

export { uiHumanNotices } from "./web/notices.js";
export { uiMessages } from "./web/messages.js";
export { uiGlimmer } from "./web/glimmer.js";
export { uiTogether } from "./web/together.js";
export { uiMarket } from "./web/market.js";
export { uiTa } from "./web/ta.js";
export { uiExpedition } from "./web/expedition.js";
export { uiCodex } from "./web/codex.js";
export { uiCooking } from "./web/cooking.js";
export { uiLeaderboard } from "./web/leaderboard.js";
export { uiHome } from "./web/home.js";
export { uiQixiLantern } from "./web/qixi-lantern.js";
export { uiRanch } from "./web/ranch.js";

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
