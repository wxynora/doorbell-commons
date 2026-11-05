import {SNOW_WAR_CONFIG as CFG} from './shared/config.mjs';
type Effect={kind:string;value?:number;untilTick:number;lane?:number;speedMult?:number;armorMult?:number};
type Unit={lane:number;pos:number;side:'attack'|'defend';id:string;typeKey:string;hp:number;maxHp:number;shieldAmount:number;systemWave?:boolean;blockedBy?:string|null;blocking:string[];activeEffects:Effect[];unitSkillReadyInTicks?:number};
type Battle={battleId:string;tick:number;ticksLeft:number;coreHp:number;ownCost:number;visibleUnits:Unit[];ownCommanderSkills:{skill:string;readyInTicks:number}[];effects:Effect[]};
const effectNames:Record<string,string>={fire_focus:'火力集中',sprint:'疾行',silence:'沉默',shield:'护盾',pierce:'破甲',speed:'加速',smoke:'烟幕',searchlight:'探照'};
export function snowPlayerGrid(battle:Pick<Battle,'visibleUnits'>) {
 const lines=['| 格位 | '+Array.from({length:12},(_,i)=>i+1).join(' | ')+' |','| --- | '+Array.from({length:12},()=>'---').join(' | ')+' |'];
 for(let lane=1;lane<=3;lane++)lines.push('| 第'+lane+'路 | '+Array.from({length:12},(_,i)=>battle.visibleUnits.filter(u=>u.lane===lane&&u.pos===i+1).map(u=>(u.side==='attack'?'攻:':'守:')+u.id).join('、')||'空').join(' | ')+' |');
 return lines.join('\n');
}
export function renderSnowBattle(value:unknown):string[] {
 const b=value as Battle|null;if(!b?.battleId)return [];
 const out=[`战斗第${b.tick}tick · 剩余${b.ticksLeft}tick · 核心耐久${b.coreHp} · 本方费用${b.ownCost}`,snowPlayerGrid(b)];
 if(b.visibleUnits.length){
  out.push('编号 | 阵营 | 兵种 | 路 / 格 | 生命 | 护盾 | 当前状态','--- | --- | --- | --- | --- | --- | ---');
  for(const u of b.visibleUnits){
   const definition=CFG.attackerUnits[u.typeKey]??CFG.defenderUnits[u.typeKey],status=(u.activeEffects??[]).map(e=>`${effectNames[e.kind]??e.kind}${e.value!==undefined?` ${e.value}`:''}至${e.untilTick}tick`);
   if(u.blockedBy)status.push(`被${u.blockedBy}阻挡`);if(u.blocking?.length)status.push(`阻挡${u.blocking.join('、')}`);
   if(u.unitSkillReadyInTicks!==undefined)status.push(`${definition?.unitSkill?.name??'单位技能'}：${u.unitSkillReadyInTicks?`${u.unitSkillReadyInTicks}tick后可用`:'可用'}`);
   out.push([u.id,u.side==='attack'?'进攻':'防守',u.systemWave?'系统小兵':definition?.name??u.typeKey,`${u.lane} / ${u.pos===0?'入口':u.pos}`,`${u.hp} / ${u.maxHp}`,u.shieldAmount,status.join('；')||'正常'].join(' | '));
  }
 }
 for(const effect of b.effects??[])out.push(`第${effect.lane}路：${effectNames[effect.kind]??effect.kind}${effect.speedMult?` 移速×${effect.speedMult}`:''}${effect.armorMult?` 护甲×${effect.armorMult}`:''}，至第${effect.untilTick}tick`);
 if(b.ownCommanderSkills?.length){out.push('指挥技能冷却');for(const s of b.ownCommanderSkills)out.push(`${(CFG.commanderSkills.attack[s.skill]??CFG.commanderSkills.defend[s.skill]).name}：${s.readyInTicks?`${s.readyInTicks}tick后可用`:'可用'}`);}
 return out;
}
