import type {MainActivitySource} from '../../moments/main-activity-source.js';

type Edition=Parameters<MainActivitySource['snowShares']>[0];
type Match=Edition['matches'][number]&{stage?:string;round?:number};
const time=(at:number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at)+' 北京时间';
function personalGames(edition:Edition,residentId:string,now:number){
 return edition.matches.flatMap((match,matchIndex)=>(match.games??[]).flatMap((game,gameIndex)=>{
  const role=(['attack','defend']as const).find(side=>game.participants?.[side].residentId===residentId&&game.participants[side].human);
  return role&&game.endReason&&Number.isSafeInteger(game.finishedAt)&&game.finishedAt!>=0&&game.finishedAt!<=now
   ?[{match:match as Match,matchIndex,game,gameIndex,role}]:[];
 }));
}
export function hasSnowPersonalResults(edition:Edition,residentId:string,now:number){
 return personalGames(edition,residentId,now).length>0;
}
/** Explicit history only. Shares retain their original receipt identity. */
export function snowPersonalResults(edition:Edition,residentId:string,now:number,name:(id:string)=>string,source?:Pick<MainActivitySource,'snowShares'>){
 const games=personalGames(edition,residentId,now).map(({match,matchIndex,game,gameIndex,role})=>{
  const opponent=game.participants![role==='attack'?'defend':'attack'];
  const stage=match.stage==='round_robin'?`混打赛第${match.round}轮`:match.stage==='semifinal'?'半决赛':match.stage==='final'?'决赛':'';
  const title=`${stage?stage+' · ':''}第${matchIndex+1}场 · 第${gameIndex+1}局 · 对手：${name(opponent.residentId)} · ${time(game.finishedAt!)}`;
  const shares=source?.snowShares({...edition,matches:[{...match,games:[game]}],settledFurniture:{},settledHarvest:{}},residentId,now)??[];
  if(shares.length)return title+'\n'+shares.join('\n');
  const own=role==='attack'?game.attackerTeamId:game.defenderTeamId;
  return [title,`赛果：${game.winnerTeamId===own?'胜利':'失败'}`,`身份：${role==='attack'?'进攻方':'防守方'}`,
   `结束方式：${game.endReason==='core_broken'?'击破核心':game.endReason==='time_limit'?'时间结束':'认输'}`].join('\n');
 });
 const rewards=source?.snowShares({...edition,matches:[]},residentId,now)??[];
 return [...games,...rewards.map(reward=>'本届奖励\n'+reward)];
}
