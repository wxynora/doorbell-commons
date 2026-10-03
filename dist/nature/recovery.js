import { plotAgronomyIssues } from '../career/p3-world.js';

export function recoveryProgress(previous, type, weather) {
    if (type === 'drought') {
        if (weather === 'light_rain') return Math.min(2, previous + 1);
        if (['heavy_rain', 'thunderstorm'].includes(weather)) return 2;
        if (['hot', 'dry_wind'].includes(weather)) return Math.max(0, previous - 1);
        return previous;
    }
    if (['heavy_rain', 'thunderstorm'].includes(weather)) return 0;
    if (['sunny', 'hot', 'dry_wind'].includes(weather)) return 2;
    if (['light_rain', 'cloudy', 'fog'].includes(weather)) return Math.min(2, previous + 1);
    return previous;
}

export function advancePlotRecovery(entries, type, weather, day) {
    for (const { issue } of entries) {
        if (issue.natureRecoveryWateredDay !== day) delete issue.natureRecoveryWateredDay;
        if (issue.status === 'resolved' || issue.natureRecovery?.day === day) continue;
        const previous = issue.natureRecovery?.progress ?? 0;
        issue.natureRecovery = {
            progress: recoveryProgress(previous, type, weather), previous, day, weather,
        };
    }
    // Resolved issues from today's watering do not prevent the remaining
    // event impact from making progress, nor reactivate a resolved issue.
    return entries.every(({ issue }) => issue.status === 'resolved' || issue.natureRecovery?.progress === 2);
}

export function recoveredPlotNotices(farm) {
    const notices = [];
    for (const plot of farm.plots ?? []) {
        const issues = plotAgronomyIssues(plot);
        const groups = new Map();
        for (const issue of issues) {
            if (!issue.natureEventId || !['drought', 'waterlogging'].includes(issue.condition)) continue;
            const key = `${issue.natureEventId}:${plot.id}:${issue.condition}`;
            const group = groups.get(key) ?? [];
            group.push(issue);
            groups.set(key, group);
        }
        for (const [key, group] of groups) {
            if (group.some(i => i.status !== 'resolved') || !group.some(i => i.natureRecoveryNoticeEligible)) continue;
            const latest = Math.max(...group.map(i => i.resolvedAt ?? 0));
            const remaining = issues.some(i => i.status !== 'resolved');
            const condition = group[0].condition === 'drought' ? '缺水' : '积水';
            notices.push({
                key, at: latest,
                text: `第${plot.id}块地的${condition}异常已解除。` + (remaining
                    ? '该地块仍有其他农事异常，生长状态以当前地块详情为准。' : ''),
                section: '农事提醒',
                identity: { kind: 'agronomy_recovery', sourceId: key, plotId: plot.id, status: 'resolved' },
            });
        }
    }
    return notices;
}

export function takeRecoveryNotices(farm) {
    const notices = recoveredPlotNotices(farm);
    if (!notices.length) return [];
    const reads = farm.lingyeP4.recoveryNoticeReads ??= {};
    const unread = notices.filter(n => !reads[n.key]);
    for (const notice of unread) reads[notice.key] = true;
    return unread.map(n => n.text);
}
