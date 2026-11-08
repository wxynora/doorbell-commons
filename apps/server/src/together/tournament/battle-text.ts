import {SNOW_WAR_CONFIG as CFG} from './shared/config.mjs';
type Effect={kind:string;value?:number;untilTick:number;lane?:number;side?:'attack'|'defend';speedMult?:number;armorMult?:number};
type Unit={lane:number;pos:number;side:'attack'|'defend';id:string;typeKey:string;hp:number;maxHp:number;shieldAmount:number;systemWave?:boolean;attack?:number;attackInterval?:number;moveSeconds?:number;breakthrough?:number;blockedBy?:string|null;blocking:string[];activeEffects:Effect[];unitSkillReadyInTicks?:number};
type Battle={battleId:string;tick:number;ticksLeft:number;coreHp:number;ownCost:number;visibleUnits:Unit[];ownCommanderSkills:{skill:string;readyInTicks:number}[];effects:Effect[];systemWaves?:{ticks:number[];releasedTicks:number[];count:number}};
const effectNames:Record<string,string>={fire_focus:'火力集中',sprint:'疾行',silence:'沉默',shield:'护盾',pierce:'破甲',speed:'加速',smoke:'烟幕',searchlight:'探照',reveal:'探照'};
function effectText(effect:Effect) {
 const label=effect.kind==='pierce'?'护甲倍率':effect.kind==='speed'||effect.kind==='sprint'?'速度倍率':effect.kind==='fire_focus'?'攻击间隔倍率':effect.kind==='shield'?'护盾':'效果值';
 const value=effect.value!==undefined?` ${label}${effect.value}`:'';
 return `${effectNames[effect.kind]??effect.kind}${value}至${effect.untilTick}tick`;
}
/** Example only: uses the same current capability, visible board and original costs. */
export function snowCommandExample(option:string,side:string,value:unknown) {
 const battle=value as Battle|null;if(!battle?.battleId||!['attack','defend'].includes(side))return null;
 const occupied=new Set(battle.visibleUnits.filter(unit=>unit.side==='defend').map(unit=>`${unit.lane}:${unit.pos}`));
 const definitions=side==='attack'?CFG.attackerUnits:CFG.defenderUnits;
 const commands:{type:string;unitType:string;lane:number;cell?:number}[]=[];let budget=battle.ownCost;
 for(const [unitType,raw] of Object.entries(definitions)){
  const unit=raw as {cost:number;ground?:boolean};if(unit.cost>budget)continue;
  if(side==='attack'){commands.push({type:'spawn',unitType,lane:1});budget-=unit.cost;}
  else{
   const cells:readonly number[]=unit.ground?CFG.groundSlots:CFG.highSlots;
   const target=[1,2,3].flatMap(lane=>cells.map(cell=>({lane,cell}))).find(({lane,cell})=>!occupied.has(`${lane}:${cell}`));
   if(!target)continue;commands.push({type:'deploy',unitType,...target});occupied.add(`${target.lane}:${target.cell}`);budget-=unit.cost;
  }
  if(commands.length===2)break;
 }
 return {op:'game.snow.command',args:{option,commands,waitTicks:30}};
}
export function snowCommandExamples(option:string,side:string,value:unknown) {
 const battle=value as Battle|null,primary=snowCommandExample(option,side,value);
 if(!battle||!primary)return [];
 const make=(command:Record<string,unknown>)=>({op:'game.snow.command',args:{option,commands:[command],waitTicks:30}});
 const examples:{label:string;call:unknown}[]=[];
 if(primary.args.commands.length)examples.push({label:'批量指令示例',call:primary});
 const ready=battle.ownCommanderSkills.find(skill=>skill.readyInTicks===0);
 if(ready){
  const lane=battle.visibleUnits.find(unit=>unit.side===(ready.skill==='break_armor'?'defend':side))?.lane??1;
  examples.push({label:'指挥技能示例',call:make({type:'commander_skill',skill:ready.skill,lane})});
 }
 const active=battle.visibleUnits.find(unit=>unit.side===side&&unit.unitSkillReadyInTicks===0&&
  (unit.typeKey!=='hammer'||unit.blockedBy));
 if(active)examples.push({label:'单位技能示例',call:make({type:'unit_skill',unitId:active.id})});
 if(side==='defend'){
  const own=battle.visibleUnits.find(unit=>unit.side===side);
  if(own)examples.push({label:'撤退示例',call:make({type:'retreat',unitId:own.id})});
 }
 examples.push({label:'只等待示例',call:{op:'game.snow.command',args:{option,commands:[],waitTicks:30}}});
 return examples;
}
export function renderSnowCommandExamples(examples:ReturnType<typeof snowCommandExamples>) {
 return examples.flatMap(example=>[example.label,JSON.stringify(example.call)]);
}
export function snowPlayerGrid(battle:Pick<Battle,'visibleUnits'>) {
 const lines=['| 格位 | '+Array.from({length:12},(_,i)=>i+1).join(' | ')+' |','| --- | '+Array.from({length:12},()=>'---').join(' | ')+' |'];
 for(let lane=1;lane<=3;lane++)lines.push('| 第'+lane+'路 | '+Array.from({length:12},(_,i)=>battle.visibleUnits.filter(u=>u.lane===lane&&u.pos===i+1).map(u=>(u.side==='attack'?'攻:':'守:')+u.id).join('、')||'空').join(' | ')+' |');
 return lines.join('\n');
}
export function renderSnowBattle(value:unknown,side?:string):string[] {
 const b=value as Battle|null;if(!b?.battleId)return [];
 const out=[`战斗第${b.tick}tick · 剩余${b.ticksLeft}tick · 核心耐久${b.coreHp} · 本方费用${b.ownCost}`,snowPlayerGrid(b),'批量指令填写commands；waitTicks至少30，1tick为1秒；commands:[]表示只等待。'];
 if(side==='defend')out.push(`地面格子：${CFG.groundSlots.join('、')}；高台格子：${CFG.highSlots.join('、')}`);
 if(b.systemWaves)out.push(`系统兵潮：时点tick ${b.systemWaves.ticks.join('、')}；已释放tick ${b.systemWaves.releasedTicks.join('、')||'无'}；每波数量 ${b.systemWaves.count}`);
 if(b.visibleUnits.length){
  out.push('编号 | 阵营 | 兵种 | 路 / 格 | 生命 | 护盾 | 当前状态','--- | --- | --- | --- | --- | --- | ---');
  for(const u of b.visibleUnits){
   const definition=CFG.attackerUnits[u.typeKey]??CFG.defenderUnits[u.typeKey],status=(u.activeEffects??[]).map(effectText);
   if(u.systemWave)status.push(`攻击${u.attack}；攻击间隔秒${u.attackInterval}；移动每格秒${u.moveSeconds}；突破扣核心耐久${u.breakthrough}`);
   if(u.blockedBy)status.push(`被${u.blockedBy}阻挡`);if(u.blocking?.length)status.push(`阻挡${u.blocking.join('、')}`);
   if(u.unitSkillReadyInTicks!==undefined)status.push(`${definition?.unitSkill?.name??'单位技能'}：${u.unitSkillReadyInTicks?`${u.unitSkillReadyInTicks}tick后可用`:'可用'}`);
   out.push([u.id,u.side==='attack'?'进攻':'防守',u.systemWave?'系统小兵':definition?.name??u.typeKey,`${u.lane} / ${u.pos===0?'入口':u.pos}`,`${u.hp} / ${u.maxHp}`,u.shieldAmount,status.join('；')||'正常'].join(' | '));
  }
 }
 for(const effect of b.effects??[]){
  const target=effect.kind==='pierce'?'防守':effect.kind==='reveal'?'进攻':effect.side==='attack'?'进攻':'防守';
  out.push(`第${effect.lane}路 · 作用方${target}：${effectText(effect)}`);
 }
 if(b.ownCommanderSkills?.length){out.push('指挥技能冷却');for(const s of b.ownCommanderSkills)out.push(`${(CFG.commanderSkills.attack[s.skill]??CFG.commanderSkills.defend[s.skill]).name}（${s.skill}）：${s.readyInTicks?`${s.readyInTicks}tick后可用`:'可用'}`);}
 return out;
}
