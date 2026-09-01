// 全服排行榜：把各项榜单汇总在一处，各取 Top 5；AI 文字版与数据版共用。
import { equippedTitle } from "./titles.js";
import { currentDayIndex } from "./time.js";
import { dailyScore } from "./daily.js";
import { economyGoldSpentToday } from "./daily-spend.js";
function top(farms, score, n = 5) {
    return farms
        .map((f) => {
        const title = equippedTitle(f);
        return { name: f.name, code: f.id, value: score(f), title: title?.name, titleColor: title?.color };
    })
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, n);
}
export function leaderboardScores(now) {
    const today = currentDayIndex(now);
    const directCoinSpend = dailyScore(today, "coinSpend");
    return {
        todayTasks: dailyScore(today, "tasks"),
        todayLogins: dailyScore(today, "logins"),
        todayMessages: dailyScore(today, "messages"),
        todayEvents: dailyScore(today, "events"),
        todayStolen: dailyScore(today, "stolen"),
        todayWatered: dailyScore(today, "watered"),
        todaySpent: (f) => directCoinSpend(f) + economyGoldSpentToday(f, now),
        todayOddDishes: dailyScore(today, "oddDishes"),
        todayRaidIncome: (f) => f.ranch?.raidIncome?.day === today ? f.ranch.raidIncome.n : 0,
        todayRaidLoss: (f) => f.ranch?.raidLoss?.day === today ? f.ranch.raidLoss.n : 0,
    };
}
function rankOf(farms, currentFarm, score) {
    const value = score(currentFarm);
    let rank = 1;
    for (const farm of farms)
        if (score(farm) > value)
            rank++;
    return rank;
}
/** 当前农场在每个农场榜的权威全服名次；榜外和 0 分也保留。 */
export function buildCurrentFarmLeaderboardRows(farms, currentFarm, now) {
    const title = equippedTitle(currentFarm);
    return Object.fromEntries(Object.entries(leaderboardScores(now)).map(([key, score]) => [key, {
            name: currentFarm.name,
            code: currentFarm.id,
            value: score(currentFarm),
            rank: rankOf(farms, currentFarm, score),
            title: title?.name,
            titleColor: title?.color,
        }]));
}
export function buildLeaderboards(farms, ugc, now) {
    const scores = leaderboardScores(now);
    return {
        todayTasks: top(farms, scores.todayTasks),
        todayLogins: top(farms, scores.todayLogins),
        todayMessages: top(farms, scores.todayMessages),
        todayEvents: top(farms, scores.todayEvents),
        todayStolen: top(farms, scores.todayStolen),
        todayWatered: top(farms, scores.todayWatered),
        todaySpent: top(farms, scores.todaySpent),
        todayOddDishes: top(farms, scores.todayOddDishes),
        todayRaidIncome: top(farms, scores.todayRaidIncome),
        todayRaidLoss: top(farms, scores.todayRaidLoss),
        hot: ugc
            .filter((c) => (c.buyers?.length ?? 0) > 0 && !c.banned)
            .sort((a, b) => (b.buyers?.length ?? 0) - (a.buyers?.length ?? 0))
            .slice(0, 5)
            .map((c) => ({ name: c.name, designer: c.designer ?? "?", designerId: c.designerId ?? "", buyers: c.buyers?.length ?? 0 })),
    };
}
/** AI 文字版排行榜。 */
export function viewLeaderboard(farms, ugc, now) {
    const b = buildLeaderboards(farms, ugc, now);
    const fmt = (rows, unit, valuePrefix = "") => rows.length ? rows.map((r, i) => `  ${i + 1}. ${r.title ? `✧${r.title}✧` : ""}${r.name} · ${r.code} — ${valuePrefix}${r.value}${unit}`).join("\n") : "  （暂无）";
    const hot = b.hot.length
        ? b.hot.map((c, i) => `  ${i + 1}. ${c.name}（设计者 ${c.designer}${c.designerId ? ` · ${c.designerId}` : ""}）· ${c.buyers} 人买过`).join("\n")
        : "  （暂无）";
    return [
        `🏆 全服排行榜（共 ${farms.length} 座农场，各取 Top 5）`,
        `🔥 原创热门榜（多少人买过）\n${hot}`,
        `— — — 今日榜（每天 0 点归零，新人同台） — — —`,
        `🔥 卷王榜（今日完成任务）\n${fmt(b.todayTasks, " 个")}`,
        `📱 网瘾榜（今日巡视农场）\n${fmt(b.todayLogins, " 次")}`,
        `💬 小纸条榜（今日给人留言）\n${fmt(b.todayMessages, " 次")}`,
        `🌦️ 奇遇榜（今日触发随机事件）\n${fmt(b.todayEvents, " 次")}`,
        `🥷 大盗榜（今日成功偷菜）\n${fmt(b.todayStolen, " 次")}`,
        `💧 热心榜（今日成功帮人浇水）\n${fmt(b.todayWatered, " 次")}`,
        `💰 败家榜（今日花掉金币）\n${fmt(b.todaySpent, " 金")}`,
        `🍳 厨鬼榜（今日做出微妙料理）\n${fmt(b.todayOddDishes, " 次")}`,
        `🐾 摸金榜（今日偷到金币）\n${fmt(b.todayRaidIncome, " 金")}`,
        `💸 漏财榜（今日损失金币）\n${fmt(b.todayRaidLoss, " 金", "-")}`,
    ].join("\n\n");
}
//# sourceMappingURL=leaderboard.js.map
