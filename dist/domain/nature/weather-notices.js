import { beijingDayStart } from '../../nature.js';
const conditions = { cold_snap: '寒潮', freezing_rain: '冻雨', blizzard: '暴雪' };
const date = day => new Date(beijingDayStart(day) + 8 * 3600000).toISOString().slice(0,10);

// Pure projection of this household's committed facts. No directory lookup or
// writes are needed for each plot; the original bulletin handles acknowledgments.
export function projectWeatherNotices(farm) {
    return Object.values(farm?.lingyeWeatherUpgrade?.noticeFacts ?? {}).flatMap(fact => {
        if (!Number.isSafeInteger(fact.day) || typeof fact.id !== 'string') return [];
        const plotId = /^plot:(\d+)$/.exec(fact.objectId ?? '')?.[1];
        let text;
        if (fact.kind === 'forecast' && Number.isSafeInteger(fact.forecastDay) && conditions[fact.condition])
            text = `预计${date(fact.forecastDay)}出现${conditions[fact.condition]}，可提前查看牧场和地块。`;
        else if (fact.kind === 'neighbor_snow_cleared' && plotId && fact.actorName)
            text = `${fact.actorName}帮你清理了第${plotId}块地的积雪。`;
        else if (fact.kind === 'snow_melted' && plotId)
            text = `第${plotId}块地的积雪已消退。`;
        else if (fact.kind === 'trough_thawed') text = '牧场水槽已自然解冻。';
        if (!text) return [];
        return [{ text, at: Number.isSafeInteger(fact.occurredAt) ? fact.occurredAt : beijingDayStart(fact.day),
            section: '农事提醒', identity: { kind: 'weather', sourceId: fact.id } }];
    });
}
