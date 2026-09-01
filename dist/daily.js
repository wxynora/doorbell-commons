// 每日榜单计数：按 UTC+8 日序号在农场上累加当日事件数，跨日自动归零。
// 存档字段 farm.daily（见 types.ts）；bumpDaily 只改内存，落盘由调用方 save() 负责。
import { currentDayIndex } from "./time.js";
/** 取（必要时重建）当日计数器：跨日或首次调用则整体归零。 */
function ensureDaily(f, day) {
    if (!f.daily || f.daily.day !== day)
        f.daily = { day, logins: 0, tasks: 0, messages: 0, events: 0, stolen: 0, watered: 0, coinSpend: 0, oddDishes: 0 };
    return f.daily;
}
/** 当日某项 +n（默认 1）；跨日先归零。调用方负责 save()。 */
export function bumpDaily(f, now, key, n = 1) {
    const daily = ensureDaily(f, currentDayIndex(now));
    daily[key] = (daily[key] ?? 0) + n;
}
/** 已确认成功的跨农场帮浇水结算；失败和自家浇水不调用。 */
export function recordSuccessfulWatering(f, now) {
    f.watered = (f.watered ?? 0) + 1;
    bumpDaily(f, now, "watered");
}
/** 生成「按某日打分」的取值函数（不写存档；非当日=0）。给排行榜 top()/rankOf 用。 */
export function dailyScore(today, key) {
    return (f) => (f.daily && f.daily.day === today ? (f.daily[key] ?? 0) : 0);
}
//# sourceMappingURL=daily.js.map
