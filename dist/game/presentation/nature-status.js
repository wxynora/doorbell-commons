import { AGRONOMY_CONDITIONS, agronomyGrowthEffect, plotAgronomyIssues } from "../../career/p3-world.js";
import { beijingDayIndex } from "../../nature.js";
import { getNatureWorld } from "../../store.js";
import { currentWeather } from "../../time.js";

const WEATHER_NAMES = Object.freeze({
    sunny: "晴", cloudy: "多云", light_rain: "小雨", heavy_rain: "暴雨",
    thunderstorm: "雷暴", fog: "雾", hot: "高温", dry_wind: "干热风",
    light_snow: "小雪", blizzard: "暴雪",
});
const WEATHER_ICONS = Object.freeze({
    sunny: "☀️", cloudy: "☁️", light_rain: "🌦️", heavy_rain: "🌧️",
    thunderstorm: "⛈️", fog: "🌫️", hot: "🌡️", dry_wind: "💨",
    light_snow: "🌨️", blizzard: "❄️",
});
const DISASTER_NAMES = Object.freeze({ flood: "洪水", drought: "干旱", pest: "虫灾" });
const DISASTER_ICONS = Object.freeze({ flood: "🌊", drought: "☀️", pest: "🐛" });
const PHASE_NAMES = Object.freeze({ forecast: "预告中", active: "正在发生", recovery: "恢复期" });
const ACTIVE_ISSUE_STATUSES = new Set(["open", "stabilized", "treating"]);
const COMMISSION_GUIDANCE = "查看处理选项：doorbell({\"op\":\"go.farm.commission\",\"args\":{}})。";

function plotRangeSummary(plots) {
    const ids = [...new Set(plots.map(({ plot }) => Number(plot.id)).filter(Number.isSafeInteger))].sort((a, b) => a - b);
    if (ids.length === 0) return "";
    const ranges = [];
    let start = ids[0];
    let end = start;
    for (const id of ids.slice(1)) {
        if (id === end + 1) {
            end = id;
            continue;
        }
        ranges.push(start === end ? `${start}号` : `${start}～${end}号`);
        start = end = id;
    }
    ranges.push(start === end ? `${start}号` : `${start}～${end}号`);
    return `${ranges.join("、")}，共${ids.length}块`;
}

function eventPlotIssues(farm, event) {
    return (farm.plots ?? []).flatMap((plot) => {
        const issues = plotAgronomyIssues(plot).filter((issue) =>
            issue.natureEventId === event.eventId && ACTIVE_ISSUE_STATUSES.has(issue.status));
        return issues.length ? [{ plot, issues }] : [];
    });
}

function growthText(entries, event) {
    const growing = entries.filter(({ plot }) => plot.crop && !plot.crop.ripe);
    if (growing.length === 0) return "当前受影响地块没有未成熟作物暂停生长。";
    const paused = growing.filter(({ plot }) => agronomyGrowthEffect(plot) === "paused").length;
    const half = growing.filter(({ plot }) => agronomyGrowthEffect(plot) === "half").length;
    const causeCanPause = entries.some(({ issues }) => issues.some((issue) =>
        ["drought", "waterlogging", "root_damage"].includes(issue.condition) &&
        AGRONOMY_CONDITIONS[issue.condition]?.growth === "paused"));
    if (paused > 0 && causeCanPause) {
        const cause = event.type === "flood" ? "积水" : event.type === "drought" ? "干旱" : "地块异常";
        return paused === growing.length
            ? `${cause}使未成熟作物暂停生长。`
            : `${cause}使${paused}块未成熟作物暂停生长。`;
    }
    if (paused > 0) return `${paused}块未成熟作物当前暂停生长。`;
    if (half > 0) return `${half}块未成熟作物生长速度减半，其余仍在生长。`;
    return "受影响的未成熟作物仍在生长。";
}

function conditionText(entries) {
    const conditions = new Set(entries.flatMap(({ issues }) => issues.map((issue) => issue.condition)));
    const labels = {
        waterlogging: "积水异常",
        drought: "缺水异常",
        local_pest: "叶片啃咬和虫迹",
        nutrient_imbalance: "养分失衡",
        root_damage: "根系受损",
    };
    return [...conditions].map((condition) => labels[condition]).filter(Boolean).join("、");
}

function recoveryGuidance(event, entries, hasFloodedPlots, now) {
    if (entries.length === 0) return "";
    if (event.type === "flood" && hasFloodedPlots) {
        if (event.phase === "active" || beijingDayIndex(now) <= event.recoveryAtDay) {
            return "可请农艺师或 NPC 提前排水；也可等待自然退水，进入恢复期后的下一天自动恢复。";
        }
        return "当前仍有积水异常未解除，请查看农艺师处理选项。";
    }
    if (event.type === "drought") {
        return event.phase === "recovery"
            ? "降雨已触发恢复；仍列出的地块异常尚未解除。"
            : "干旱结束后，降雨会触发本次受旱地块的自然恢复。";
    }
    if (event.type === "pest") {
        return event.phase === "recovery"
            ? "虫灾已进入恢复期，但虫害地块异常不会随灾害自动解除，仍需农艺师处理。"
            : "虫害异常仍需农艺师检查和处理。";
    }
    return "";
}

function disasterStatusLine(farm, event, now) {
    const entries = eventPlotIssues(farm, event);
    const affected = plotRangeSummary(entries);
    const ownImpacts = (event.impacts ?? []).filter((impact) => impact.farmId === farm.id);
    const hasFloodedPlots = ownImpacts.some((impact) => impact.kind === "plot_flooded");
    const hasPestPlots = ownImpacts.some((impact) => impact.kind === "plot_pest") ||
        entries.some(({ issues }) => issues.some((issue) => issue.condition === "local_pest"));
    const label = event.type === "flood"
        ? hasFloodedPlots ? "受淹地块" : hasPestPlots ? "虫迹地块" : "本户受影响地块"
        : event.type === "drought" ? "受旱地块" : "虫害地块";
    const condition = conditionText(entries);
    const parts = [`${DISASTER_ICONS[event.type]} ${DISASTER_NAMES[event.type]}${PHASE_NAMES[event.phase]}。`];
    if (entries.length) {
        parts.push(`${label}：${affected}。`);
        if (condition) parts.push(`${condition}；`);
        parts.push(growthText(entries, event));
        const guidance = recoveryGuidance(event, entries, hasFloodedPlots, now);
        if (guidance) parts.push(guidance);
        parts.push(COMMISSION_GUIDANCE);
    }
    return { text: parts.join("\n"), plotIds: new Set(entries.filter(({ issues }) => issues.some((issue) => issue.condition === "local_pest")).map(({ plot }) => plot.id)) };
}

export function describeFarmNature(farm, now) {
    const lines = [];
    const weather = currentWeather(now);
    const weatherName = weather && WEATHER_NAMES[weather.condition];
    if (weatherName) lines.push(`${WEATHER_ICONS[weather.condition]} 当前天气：${weatherName}。`);

    // Read the persisted phase and farm impacts. Only the weather row uses the
    // existing currentWeather projection; it does not determine disaster phase.
    const world = getNatureWorld();
    const events = [world.currentEvent, world.storyEvent].filter((event) =>
        event && Object.hasOwn(PHASE_NAMES, event.phase) && Object.hasOwn(DISASTER_NAMES, event.type));
    const describedPlotIds = new Set();
    for (const event of events) {
        const status = disasterStatusLine(farm, event, now);
        lines.push(status.text);
        for (const plotId of status.plotIds) describedPlotIds.add(plotId);
    }

    // Pest impacts intentionally remain actionable after their public event
    // ends: event transfer settles the impact record but does not clear the
    // plot agronomy issue.
    const activeEventIds = new Set(events.map((event) => event.eventId));
    const residualPests = (farm.plots ?? []).flatMap((plot) => {
        const issues = plotAgronomyIssues(plot).filter((issue) =>
            issue.condition === "local_pest" && issue.natureEventId &&
            !activeEventIds.has(issue.natureEventId) && ACTIVE_ISSUE_STATUSES.has(issue.status));
        return issues.length ? [{ plot, issues }] : [];
    });
    if (residualPests.length) {
        const affected = plotRangeSummary(residualPests);
        lines.push(`⚠️ 虫害异常仍在：${affected}；虫灾结束不会自动解除作物异常，仍需农艺师处理。${COMMISSION_GUIDANCE}`);
        for (const { plot } of residualPests) describedPlotIds.add(plot.id);
    }
    return { lines, describedPlotIds };
}
