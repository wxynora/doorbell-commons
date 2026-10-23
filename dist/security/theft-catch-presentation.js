// Receipt only: do not capture, assign, punish or notify from this projection.
export function theftCaughtLine({database,farms,residentForFarm,victim,actorFarmId,now,securityResult,cropName}) {
    const trail=(victim.trail??[]).find(entry=>entry?.kind==="stolen" &&
        entry.actorFarmId===actorFarmId && entry.t===now && typeof entry.eventId==="string");
    const caught=database && trail?database.prepare(`SELECT patrol.target_resident_id
        FROM security_patrol_cases patrol JOIN career_jobs job ON job.job_id=patrol.job_id
        WHERE patrol.source_id=? AND job.status IN ('available','assigned','accepted','active')`)
        .get(`p3:security:trail:${trail.eventId}`):null;
    if(caught) {
        const officer=farms.find(farm=>residentForFarm(farm)===caught.target_resident_id);
        const name=officer?.aiName?.split(/[&＆]/u).at(-1)?.trim();
        return name?`\n👮 ${name}抓到你在偷菜，现在他在思考怎么处理你。`:"";
    }
    const detention=securityResult?.detention;
    if(securityResult?.violation?.caughtBy!=="npc_patrol" || !detention?.scheduledReleaseAt || !detention.startedAt) return "";
    return `\n👮 你刚偷完${cropName}，正准备溜之大吉，被巡逻路过的北衡当场人赃并获，连泥带菜全被扣下，喜提 ${Math.max(1, Math.ceil((detention.scheduledReleaseAt-detention.startedAt)/3600000))} 小时看守所之旅。`;
}
