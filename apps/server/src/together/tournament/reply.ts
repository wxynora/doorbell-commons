import {SNOW_WAR_CONFIG as CFG} from './shared/config.mjs';
import {renderSnowBattle,snowCommandExample} from './battle-text.js';
import { snowNpcName } from "./roster.js";

type Row=Record<string,unknown>;
const row=(value:unknown):Row=>value&&typeof value==='object'?value as Row:{};
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.map(row):[];
const items=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const text=(value:unknown)=>String(value??'');
const time=(value:unknown)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value as string|number))+' 北京时间';
const role=(value:unknown)=>value==='attack'?'进攻':value==='defend'?'防守':'候场';
const table=(headers:string[],records:unknown[][])=>[headers.join(' | '),headers.map(()=>'---').join(' | '),...records.map(values=>values.map(text).join(' | '))].join('\n');
const phases:Record<string,string>={registration:'个人报名中',team_formation:'自由组队中',round_robin:'混打赛',knockout:'淘汰赛',completed:'已结束',cancelled:'已取消'};
const labels:Record<string,string>={side:'选择攻守',chat:'队内发言',pass:'pass',lineup:'提交排阵',confirm_lineup:'确认排阵',ready:'准备就绪',command:'批量指令',surrender:'认输',confirm:'确认名册和报名费',cancel:'撤销参赛确认',leave:'退出队伍',handover:'交接队长',accept_captain:'接受队长交接',rename:'更改队伍名'};
const npcFillCopy='组队截止时，已确认参赛队伍的空位由 NPC 补齐。';
const deadlineCopy='已经入队的小机，截止时自动确认，并扣每人10000金币报名费。';
const errorNames:Record<string,string>={INVALID_ARGS:'参数不符合当前操作要求',OPTION_NOT_AVAILABLE:'当前编号已失效',REQUEST_CONFLICT:'同一编号不能提交不同内容',registration_closed:'报名已截止',team_formation_closed:'组队已截止',team_limit_reached:'队伍数量已满',team_full:'队伍已满员',snow_chat_not_your_turn:'当前没有轮到你发言',snow_lineup_closed:'当前不能提交排阵',snow_lineup_locked:'排阵已锁定',snow_ready_closed:'当前不能确认准备',snow_not_battle_participant:'当前没有轮到你上场',snow_battle_not_running:'本局尚未开始或已经结束',snow_request_conflict:'同一编号不能提交不同内容',snow_invalid_batch:'请提交合法的批量指令，等待tick至少为30'};
const unit=(id:unknown)=>row(CFG.attackerUnits[text(id)]??CFG.defenderUnits[text(id)]);
const skill=(id:unknown)=>row(CFG.commanderSkills.attack[text(id)]??CFG.commanderSkills.defend[text(id)]);
const unitName=(id:unknown)=>text(unit(id).name||id);
const skillName=(id:unknown)=>text(skill(id).name||id);

function skillEffect(id:string,s:Row):string {
 switch(id){
  case 'break_armor':return `清除该路敌方地面单位当前护盾，护甲降低${(1-Number(s.armorMult))*100}%，持续${s.durationTicks}秒`;
  case 'assault':return `该路己方移速提高${Math.round((Number(s.speedMult)-1)*100)}%，持续${s.durationTicks}秒`;
  case 'smoke':return `该路未被挡的己方单位${s.durationTicks}秒内不被守方远程选中，探照可揭示`;
  case 'march_shield':return `该路当前己方单位各得${s.shield}护盾，持续${s.durationTicks}秒`;
  case 'fire_focus':return `该路当前己方攻击单位攻击间隔缩短${Math.round((1-Number(s.intervalMult))*100)}%，持续${s.durationTicks}秒；新部署者不补领`;
  case 'guard_shield':return `该路当前己方地面单位各得${s.shield}护盾，持续${s.durationTicks}秒`;
  case 'searchlight':return `揭示该路潜行／烟幕，持续${s.durationTicks}秒`;
  case 'emergency_heal':return `该路当前己方单位立即各恢复${s.heal}生命`;
  default:throw Error('snow_skill_description_missing');
 }
}
function units(definitions:unknown,side:string):string {
 const records=Object.entries(row(definitions)).map(([id,value])=>{
  const u=row(value),behavior:string[]=[];
  if(side==='defend')behavior.push(`${u.ground?'地面位':'高台位'}：${(u.ground?CFG.groundSlots:CFG.highSlots).join('、')}格`);
  if(u.heal)behavior.push(`本路前后${u.healRadius}格，每${u.attackInterval}秒治疗${u.heal}，不攻击`);
  else if(u.block)behavior.push(`地面挡${u.block}，每${u.attackInterval}秒攻击${u.attack}`);
  else if(u.range)behavior.push(`本路${side==='defend'?'向入口':'前后'}${u.range}格，每${u.attackInterval}秒${u.damageType==='spell'?'术式攻击':'攻击'}${u.attack}`);
  else behavior.push(`被挡后每${u.blockedAttackInterval}秒攻击${u.blockedAttack}`);
  if(u.moveSeconds)behavior.push(`${u.moveSeconds}秒/格`);
  if(u.breakthrough)behavior.push(`突破扣${u.breakthrough}耐久`);
  if(u.spellResist)behavior.push(`术式减伤${Number(u.spellResist)*100}%`);
  if(u.splash)behavior.push(`命中格前后${u.splash}格溅射`);
  if(u.stealth)behavior.push('潜行；被挡或探照后可被攻击');
  const active=row(u.unitSkill);
  if(active.name)behavior.push(active.kind==='sprint'?`${active.name}：自身移速提高${Math.round((Number(active.speedMult)-1)*100)}%，${active.durationTicks}秒，冷却${active.cooldownTicks}秒`:`${active.name}：阻挡者停止普攻${active.silenceTicks}秒，仍阻挡，冷却${active.cooldownTicks}秒`);
  return[id,u.name,u.cost,`${u.hp} / ${u.armor}`,behavior.join('；')];
 });
 return table(['兵种编号','兵种','费用','生命 / 护甲','能力与射程'],records);
}
function skillTable(definitions:unknown):string {
 return table(['技能编号','技能','效果','冷却'],Object.entries(row(definitions)).map(([id,value])=>{
  const s=row(value);return[id,s.name,skillEffect(id,s),`${s.cooldownTicks}秒`];
 }));
}
function catalog(value:unknown,side?:string,assigned?:Set<string>):string[] {
 const c=row(value),out:string[]=[];
 if(c.attackerUnits)out.push('进攻兵种',units(c.attackerUnits,'attack'));
 if(c.defenderUnits)out.push('防守兵种',units(c.defenderUnits,'defend'));
 if(c.units)out.push(`${role(side)}兵种`,units(c.units,side??''));
 const skills=row(c.commanderSkills);
 if(skills.attack||skills.defend){for(const key of ['attack','defend'])if(skills[key])out.push(`${role(key)}指挥技能`,skillTable(skills[key]));}
 else if(Object.keys(skills).length){const pool=assigned?Object.fromEntries(Object.entries(skills).filter(([id])=>assigned.has(id))):skills;if(Object.keys(pool).length)out.push('本局指挥技能',skillTable(pool));}
 return out;
}
function options(value:unknown,name:(id:unknown)=>string,matches:Row[]=[]):string[] {
 const out:string[]=[];
 for(const option of rows(value)){
  const kind=text(option.kind),label=(labels[kind]??text(option.label))+(option.side?`（${role(option.side)}）`:kind==='handover'?`（${name(option.residentId)}）`:'');
  const call=row(option.call);
  if(call.op)out.push(label,JSON.stringify(call));
  else{const required=items(option.requires).map(text).join('、');out.push(`${label}：${option.option}${required?`；填写 ${required}`:''}`);}
  if(kind==='command'){
   const match=matches.find(entry=>entry.matchId===option.matchId&&entry.canCommand);
   const call=match?snowCommandExample(text(option.option),text(match.role),match.battle):null;
   if(call)out.push(`${label}示例`,JSON.stringify(call));
  }
 }
 return out;
}
function payments(value:unknown):string[] {
 const out:string[]=[];
 for(const r of rows(value)){
  if(r.status==='registered')out.push('参赛席位已确认。');
  else if(Number(r.confirmedCount)>0)out.push(`名册确认：${r.confirmedCount}/${r.memberCount}；每人10000金币。`);
  for(const p of rows(r.payments)){
   if(p.refund==='pending')out.push('报名费退款：等待核实到账。');
   else if(p.refund==='refunded')out.push('报名费退款：已到账。');
   else if(p.charge==='unknown')out.push('报名费付款结果尚未确认，暂不算报名成功。请保留原编号，不要换编号重复报名。');
   else if(p.charge==='paid')out.push('本人报名费：已确认扣款。');
  }
 }
 return out;
}
function lineup(value:unknown,name:(id:unknown)=>string):string[] {
 const valueRow=row(value);if(!Array.isArray(valueRow.entries))return [];
 return[`${valueRow.confirmed?'已确认':'当前'}排阵`,table(['出场','队员','指挥技能'],rows(valueRow.entries).map((entry,i)=>[i+1,name(entry.member),items(entry.skills).map(skillName).join('、')]))];
}
function commandResult(result:Row,args:Row):string[] {
 if(result.ok===false){const receipt=row(result.receipt);return[`第${result.failedCommand}条指令未执行：${receipt.message??receipt.error}。本批指令均未生效，费用未扣除。`];}
 const commands=rows(args.commands),out:string[]=[];
 for(const [i,receipt]of rows(result.receipts).entries()){
  const action=commands[i]??{},f=row(receipt.facts??receipt);
  if(action.type==='spawn')out.push(`已在第${action.lane}路派出${unitName(action.unitType)}（${f.unitId}），消耗${f.cost}点部署费用，剩余${f.remainingCost}点。`);
  else if(action.type==='deploy')out.push(`已在第${action.lane}路第${action.cell}格部署${unitName(action.unitType)}（${f.unitId}），消耗${f.cost}点部署费用，剩余${f.remainingCost}点。`);
  else if(action.type==='retreat')out.push(`${action.unitId}已撤退，返还${f.refund}点部署费用，剩余${f.remainingCost}点。`);
  else{
   out.push(`${action.unitId??`第${action.lane}路`} · ${action.skill?skillName(action.skill):'单位技能'} · 已使用`);
   if(Array.isArray(f.targetUnitIds))out.push(`实际目标：${items(f.targetUnitIds).join('、')||'无'}`);
   if(f.healed!==undefined)out.push(`实际治疗：${f.healed}`);
   const effect=row(f.effect);for(const[key,label]of [['speedMult','移速倍率'],['armorMult','护甲倍率'],['intervalMult','攻击间隔倍率']] as const)if(effect[key]!==undefined)out.push(`${label}：${effect[key]}`);
   if(f.untilTick!==undefined||f.silencedUntilTick!==undefined)out.push(`生效至战斗第${f.untilTick??f.silencedUntilTick}tick`);
   for(const shield of rows(f.shields))out.push(`${shield.unitId}：新增${shield.added}护盾，至第${shield.untilTick}tick`);
   for(const shield of rows(f.dispelledShields))out.push(`${shield.unitId}：清除${shield.removed}护盾`);
  }
 }
 if(!commands.length)out.push('本次未派兵或部署。');
 if(result.dueTick!==null&&result.dueTick!==undefined)out.push(`已安排${result.waitTicks}tick后响铃（战斗第${result.dueTick}tick）。`);
 return out;
}
export function renderSnowReply(value:unknown,context:{names:Map<string,string>;args?:Record<string,unknown>}) {
 const data=row(value),name=(id:unknown)=>context.names.get(text(id))??snowNpcName(text(id))??'未显示姓名';
 let out:string[]=[];
 if(data.ok===false&&!data.failedCommand){const code=text(row(data.error).code);return `操作未执行：${errorNames[code]??code}`;}
 if(data.result!==undefined||Array.isArray(data.receipts)||data.failedCommand){
  const result=data.result!==undefined?row(data.result):data,kind=text(result.kind);
  if(typeof result.text==='string')out.push(result.text);
  else if(Array.isArray(result.receipts)||result.failedCommand)out.push(...commandResult(result,context.args??{}));
  else if(kind==='side')out.push(`攻守选择：${role(result.side)}`);
  else if(kind==='ready')out.push(`准备：已确认；本局${result.started?'已开始':'等待另一方准备'}`);
  else if(kind==='lineup'||kind==='confirm_lineup')out.push(...lineup(result.lineup,name));
  else if(kind==='surrender')out.push(`本局已认输，${result.status==='attack_win'?'进攻方':'防守方'}获胜。`);
  else{
   out.push(`本次操作：${result.offerKind==='handover'?'接受队长交接':labels[kind]??kind}；结果：已完成`);
   if(result.teamName)out.push(`队伍：${result.teamName}`);
   if(result.captain)out.push(`队长：${result.captain}`);
   if(Array.isArray(result.members))out.push(`队员：${items(result.members).join('、')}`);
   if(result.feeGold)out.push(`本人名册：已确认；报名费：${result.feeGold}金币`);
  }
  out.push(...payments(data.registration));if(data.settlementPending)out.push('账务：等待核实到账。');
 }else if(data.channel){const channel=row(data.channel);out.push('队内频道',...rows(channel.messages).map(m=>`${m.name}：${m.text}`));if(!rows(channel.messages).length)out.push('本场尚无队内消息。');}
 else if(data.competition){
  const c=row(data.competition),combat=row(data.combat);
  out.push('雪堡锦标赛规则',`每队${c.teamSize}个席位。个人报名${c.registrationHours}小时，随后${c.teamFormationHours}小时自由组队。每位小机报名费 ${c.registrationFeeGold} 金币；本队所有小机确认名册后才扣款。${deadlineCopy}${npcFillCopy}`,
   '队长安排出场顺序，为每个席位配置2个指挥技能；每场3局，每个席位各打一局。先单循环混打，再按积分进入淘汰赛。',
   `战场${combat.lanes}路，每路${combat.cellsPerLane}格。攻方派兵前进，守方地面阻挡、高台攻击或治疗。每局最多${Number(combat.durationTicks)/60}分钟；核心耐久降到0攻方胜，否则守方胜。`,
   `双方初始费用${CFG.initialCost}，每${CFG.costRegenEveryTicks}tick恢复1。指令可批量提交，等待至少${combat.minimumWaitTicks}tick；思考不暂停计时。`,
   `守方每tick损耗最大生命的1/${CFG.defenderDecayTicks}，治疗可补回；撤退返还10%费用，向下取整。`,
   '第200、450tick各自动出现3只系统小兵，整波随机同路；每只1200生命、80攻击，3秒攻击一次、3秒一格，突破扣0.5核心耐久。',
   '守方远程仅选本路向入口、射程内的可见目标；有T时按T权重4、其他1选敌，无T时优先最接近核心者。',...catalog(data.catalog));
 }else if('edition'in data){
  if(!data.edition)return '当前没有开放的雪堡锦标赛。';
  const e=row(data.edition),team=row(data.team);out.push(`${e.title} · ${phases[text(e.phase)]??e.phase}`);
  if(e.phase==='registration')out.push(`报名截止：${time(e.registrationCloseAt)}`,`报名：${data.enrolled?'你已报名':'未报名'}`);
  if(e.phase==='team_formation'){
   out.push(`组队截止：${time(e.teamFormationCloseAt)}`);
   if(team.name)out.push(deadlineCopy);
   if(data.enrolled&&rows(team.members).length<3)out.push(npcFillCopy);
  }
  if(team.name)out.push(`本队：${team.name}；队长：${rows(team.members).find(m=>m.id===team.captainId)?.name??'待确认'}`,`队员：${rows(team.members).map(m=>m.name).join('、')}（${rows(team.members).length}/3）`);
  for(const other of rows(data.teams))out.push(`『${other.name}』：${rows(other.members).map(m=>m.name).join('、')}（${rows(other.members).length}/3）`);
  out.push(...payments(data.registration));
  for(const m of rows(data.matches)){
   out.push(`第${m.matchNumber}场${m.gameIndex!==null&&m.gameIndex!==undefined?` · 第${Number(m.gameIndex)+1}局`:''} · ${role(m.role)} · ${time(m.scheduledAt)}`);
   if(Array.isArray(m.attackers))out.push('本队攻守：'+items(m.attackers).map((id,i)=>`第${i+1}局${id===team.id?'进攻':'防守'}`).join('、'));
   if(typeof m.gameIndex==='number')for(const revealed of Object.values(row(m.revealedLineups))){
    const opponent=rows(row(revealed).entries)[m.gameIndex];
    if(opponent&&!rows(team.members).some(member=>member.id===opponent.member))out.push(`本局对手：${name(opponent.member)}；指挥技能：${items(opponent.skills).map(skillName).join('、')}`);
   }
   if(m.canLineup)out.push('排阵队员编号',...items(m.members).map(id=>`${name(id)}：${id}`));
   out.push(...lineup(m.lineup,name),...renderSnowBattle(m.battle,text(m.role)));
   if(!m.canReady&&!m.canCommand&&!m.canLineup&&!m.canChooseSide)out.push('当前还没轮到你上场。');
  }
  const next=row(data.nextMatch);if(next.scheduledAt)out.push(`下一场：${time(next.scheduledAt)} · 对手：${next.opponent}`);
  const current=rows(data.matches).find(m=>m.canReady||m.canCommand),assigned=current?new Set(rows(row(current.battle).ownCommanderSkills).map(s=>text(s.skill))):undefined;
  out.push(...catalog(data.catalog,text(current?.role),assigned),...options(data.options,name,rows(data.matches)));
  if(data.rules)out.push('查看比赛规则',JSON.stringify(data.rules));
 }else throw Error('snow_reply_not_supported');
 return out.filter(line=>line!=='').join('\n');
}
