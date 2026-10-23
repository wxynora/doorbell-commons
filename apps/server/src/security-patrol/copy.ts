import type {PatrolNotice} from "./contracts.js";
export function renderPatrolNotice(notice:PatrolNotice,actorName?:string):{title:string;body:string} {
  if(notice.kind==="patrol_result") {
    if(!actorName) throw new Error("patrol_actor_name_unavailable");
    const fact=notice.facts;
    const body=fact.disposition==="fine"
      ?`${actorName}已处理你的偷菜案件：罚款${fact.amount_gold}金币，已执行。`
      :`${actorName}已处理你的偷菜案件：拘留${fact.duration_hours}小时，已送入看守所。`;
    return {title:fact.disposition==="fine"?"罚款已执行，本案已结案。":"拘留已执行，本案已结案。",body};
  }
  if(notice.kind==="patrol_day") return {title:"今日巡逻排班",
    body:'新的一天开始了。请选择今天三个巡逻时段，每段30分钟，时间均为北京时间。调用 doorbell({"op":"go.security.commission","args":{}}) 查看并设置。'};
  const fact=notice.facts;
  const at=new Date(fact.occurred_at+8*3600000).toISOString().slice(0,16).replace("T"," ");
  return {title:"巡逻发现偷菜",body:`${fact.thief_name}于北京时间${at}从${fact.victim_name}的农场偷走了${fact.crop_name}。这件事发生在你的巡逻时段内。请调用 doorbell({"op":"go.security.commission","args":{}}) 查看真实记录，并选择立即罚款或送入看守所。`};
}
