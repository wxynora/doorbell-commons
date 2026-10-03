export const PATROL_SELECTION_INSTRUCTION="使用当前选段 option，text 填写三个开始时刻，格式为 HH:mm,HH:mm,HH:mm。每段30分钟，三个时段须在今天内且不重叠；已经开始的时段保留。";
const beijingTime=at=>new Date(at+8*3600000).toISOString().slice(0,16).replace("T"," ");
export function patrolTheftText(fact) {
    return `${fact.event.by}于北京时间${beijingTime(fact.event.t)}从${fact.victimName}的农场偷走了${fact.event.crop}。这件事发生在你的巡逻时段内。请调用 doorbell({"op":"go.security.commission","args":{}}) 查看真实记录，并选择立即罚款或送入看守所。`;
}
export function playerPatrolView(backend,residentId,detained=false) {
    const resident=backend.forResident(residentId),day=resident.getOwnPlayerPatrolDay();
    const cases=detained?[]:resident.inspectOwnPlayerPatrolCases();
    const options=[];const lines=[];
    if(day.onDuty && !detained) {
        lines.push("今日巡逻排班",PATROL_SELECTION_INSTRUCTION,
            ...day.windows.map(window=>`${beijingTime(window.startedAt)} ～ ${beijingTime(window.endedAt)}`));
        options.push({option:`patrol:windows:${day.beijingDate}:${day.revision}`,
            label:day.windows.length?"修改尚未开始的巡逻时段":"设置今日巡逻时段",requires:["text"]});
    }
    for(const entry of cases) {
        lines.push(patrolTheftText(entry.fact));
        for(const disposition of ["fine","detention"]) options.push({
            option:`patrol:resolve:${encodeURIComponent(entry.jobId)}:${disposition}:${entry.quote.durationHours}`,
            label:disposition==="fine"?`立即罚款：${entry.quote.amountGold} 金币`:`送入看守所：${entry.quote.durationHours} 小时`,requires:[]});
    }
    return {text:lines.join("\n"),options};
}
export function playerPatrolAction(backend,residentId,args) {
    const selection=/^patrol:windows:(\d{4}-\d{2}-\d{2}):(\d+)$/u.exec(args.option);
    if(selection) {
        if(Object.keys(args).length!==2 || typeof args.text!=="string") throw new Error("security_patrol_invalid_windows");
        backend.forResident(residentId).setOwnPlayerPatrolWindows({beijingDate:selection[1],revision:Number(selection[2]),text:args.text});
        return {ok:true,text:"今日巡逻时段已保存。",data:{}};
    }
    const decision=/^patrol:resolve:([^:]+):(fine|detention):(4|12|48|72)$/u.exec(args.option);
    if(!decision || Object.keys(args).length!==1) throw new Error("security_patrol_case_not_available");
    backend.forResident(residentId).resolveOwnPlayerPatrolCase({jobId:decodeURIComponent(decision[1]),
        disposition:decision[2],durationHours:Number(decision[3])});
    return {ok:true,text:decision[2]==="fine"?"罚款已执行，本案已结案。":"拘留已执行，本案已结案。",data:{}};
}
