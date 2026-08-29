// 时间：P4 启用前兼容旧加速季节；启用后统一读取世界存档中的 14 日生态季。
import { TICK_MS, TZ, SEASON_LENGTH_TICKS } from "./config.js";
import { seasons, festivals } from "./content.js";
import { ecologicalSeasonAt, natureSnapshot } from "./nature.js";
let natureWorldProvider = () => null;
export function setNatureWorldProvider(provider) {
    if (typeof provider !== "function")
        throw new TypeError("nature world provider must be a function");
    natureWorldProvider = provider;
}
/** P4 已启用时返回统一生态季；尚未启用的旧世界保持既有加速季节。 */
export function currentSeason(now, natureWorld = natureWorldProvider()) {
    const ecological = ecologicalSeasonAt(natureWorld, now);
    if (ecological)
        return ecological.definition;
    const totalTicks = Math.floor(now / TICK_MS);
    const idx = Math.floor(totalTicks / SEASON_LENGTH_TICKS) % seasons.length;
    return seasons[idx];
}
/** 同一权威世界时间线上的当日天气；P4 未启用时返回 null。 */
export function currentWeather(now, natureWorld = natureWorldProvider()) {
    return natureSnapshot(natureWorld, now).weather;
}
/** 取当前时区的 月/日/时 */
function nowParts(now) {
    const p = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        hour12: false,
    }).formatToParts(new Date(now));
    const get = (t) => Number(p.find((x) => x.type === t)?.value ?? 0);
    return { month: get("month"), day: get("day"), hour: get("hour") % 24 };
}
/** 解析 "M/D-M/D" 公历窗口；非公历（农历/计算式）返回 null（v1 不支持） */
function gregorianWindow(s) {
    const m = s.match(/(\d+)\/(\d+)\s*-\s*(\d+)\/(\d+)/);
    if (!m)
        return null;
    return { sm: +m[1], sd: +m[2], em: +m[3], ed: +m[4] };
}
function inWindow(month, day, w) {
    const cur = month * 100 + day;
    const start = w.sm * 100 + w.sd;
    const end = w.em * 100 + w.ed;
    return start <= end ? cur >= start && cur <= end : cur >= start || cur <= end; // 跨年
}
/** 当前进行中的公历节日（v1 只认 M/D-M/D 窗口的；农历的暂不触发） */
export function activeFestivals(now) {
    const { month, day } = nowParts(now);
    return festivals.filter((f) => {
        const w = gregorianWindow(f.dateWindow);
        return w ? inWindow(month, day, w) : false;
    });
}
/** 当前小时（时区），给时辰类机制用 */
export function currentHour(now) {
    return nowParts(now).hour;
}
/** UTC+8 日序号（Asia/Shanghai 无夏令时，直接偏移 8h 取整即可）。给「连续天数」「每日确定性 roll」用。 */
export function currentDayIndex(now) {
    return Math.floor((now + 8 * 3600 * 1000) / 86400000);
}
//# sourceMappingURL=time.js.map
