import type {SnowPixelBattle} from '../../../../../packages/protocol/src/snow-tournament';

export type DeploymentNote={id:string;tick:number;role:'attack'|'defend';kind:'spawn'|'deploy'|'reveal'|'system';name:string;count:number;lane:number;cell:number};
/** Observed authority additions only; never invent actions from a reconnect baseline. */
export class DeploymentLog {
 private battleId:string|null=null;
 private seen=new Set<string>();
 notes:DeploymentNote[]=[];
 accept(battle:SnowPixelBattle|null,reset:boolean){
  if(!battle){this.battleId=null;this.seen.clear();this.notes=[];return this.notes;}
  if(battle.id!==this.battleId){this.battleId=battle.id;this.seen.clear();this.notes=[];reset=true;}
  const groups=new Map<string,DeploymentNote>();
  for(const unit of battle.units){
   if(this.seen.has(unit.id))continue;
   this.seen.add(unit.id);
   if(reset)continue;
   const kind=unit.type==='system_inf'?'system':unit.role==='defend'?'deploy':unit.type==='scout'||unit.position>1?'reveal':'spawn';
   const key=JSON.stringify([kind,unit.type,unit.lane,kind==='deploy'?unit.position:0]);
   const group=groups.get(key);
   if(group)group.count++;
   else groups.set(key,{id:battle.id+':'+unit.id,tick:battle.tick,role:unit.role,kind,name:unit.name,count:1,lane:unit.lane,cell:unit.position});
  }
  this.notes=[...this.notes,...groups.values()];
  return this.notes;
 }
}
export function deploymentNoteText(note:DeploymentNote,players:{attack:string;defend:string}){
 const who=players[note.role];
 if(note.kind==='system')return `系统在第${note.lane}路释放${note.count}名${note.name}`;
 if(note.kind==='deploy')return `${who}在第${note.lane}路第${note.cell}格部署${note.count}名${note.name}`;
 if(note.kind==='reveal')return `${who}的${note.count}名${note.name}出现在第${note.lane}路第${note.cell}格`;
 return `${who}在第${note.lane}路派出${note.count}名${note.name}`;
}
