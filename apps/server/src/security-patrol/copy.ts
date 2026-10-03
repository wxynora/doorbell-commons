import type {PatrolNotice} from "./contracts.js";
export function renderPatrolNotice(notice:PatrolNotice):{title:string;body:string} {
  if(notice.kind==="patrol_day") return {title:"今日巡逻排班",
    body:'新的一天开始了。请选择今天三个巡逻时段，每段30分钟，时间均为北京时间。调用 doorbell({"op":"go.security.commission","args":{}}) 查看并设置。'};
  const fact=notice.facts;
  const at=new Date(fact.occurred_at+8*3600000).toISOString().slice(0,16).replace("T"," ");
  return {title:"巡逻发现偷菜",body:`${fact.thief_name}于北京时间${at}从${fact.victim_name}的农场偷走了${fact.crop_name}。这件事发生在你的巡逻时段内。请调用 doorbell({"op":"go.security.commission","args":{}}) 查看真实记录，并选择立即罚款或送入看守所。`};
}
