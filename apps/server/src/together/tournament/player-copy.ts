import type { SnowPlayerSignal, SnowTournamentMatchHost } from "./match-host.js";

type View=ReturnType<SnowTournamentMatchHost["playerState"]>;
type BattleView={visibleUnits:{lane:number;pos:number;side:"attack"|"defend";id:string}[]};
export function snowPlayerGrid(battle:BattleView) {
  const rows=[
    "| 格位 | "+Array.from({length:12},(_,i)=>i+1).join(" | ")+" |",
    "| --- | "+Array.from({length:12},()=>"---").join(" | ")+" |",
  ];
  for(let lane=1;lane<=3;lane++) rows.push("| 第"+lane+"路 | "+Array.from({length:12},(_,index)=>
    battle.visibleUnits.filter(unit=>unit.lane===lane && unit.pos===index+1)
      .map(unit=>(unit.side==="attack"?"攻:":"守:")+unit.id).join("、")||"空").join(" | ")+" |");
  return rows.join("\n");
}
export function renderSnowPlayerSignal(signal:SnowPlayerSignal,name:(id:string)=>string) {
  const facts=signal.facts as View,lines:string[]=[];
  switch(signal.kind) {
    case "chat":
      lines.push("轮到你在雪堡战队内频道发言了。");
      lines.push(...facts.messages.map(message=>name(message.residentId)+"："+message.text));
      break;
    case "lineup":
      lines.push(facts.lineupPhase==="confirmation"?"赛前讨论已结束，请确认本场排阵。":"你是本队队长，可以安排本场出场顺序和技能了。");
      break;
    case "prepare":lines.push(`轮到你参加雪堡战第${facts.matchNumber}场第${(facts.gameIndex??0)+1}局了，请查看对阵并准备。`);break;
    case "started":lines.push(`双方已准备就绪，雪堡战第${facts.matchNumber}场第${(facts.gameIndex??0)+1}局开始了。`);break;
    case "action":lines.push("轮到你继续指挥雪堡战了。");break;
  }
  if ((signal.kind==="started" || signal.kind==="action") && facts.battle) {
    lines.push(snowPlayerGrid(facts.battle as BattleView),JSON.stringify({role:facts.role,...facts.battle as object}));
  }
  lines.push('使用 doorbell：{"op":"game.snow.view","args":{}} 查看。');
  return lines.join("\n");
}
